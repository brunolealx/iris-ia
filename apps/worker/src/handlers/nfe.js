// Nota fiscal automática para vendas do Mercado Livre usando a Omie como emissor.
//
// Fluxo (nfe_mode da organização):
//   order_only → cria o pedido de venda na Omie (você fatura lá com 1 clique)
//   auto       → cria o pedido, fatura, espera a NF-e autorizada e anexa o XML no ML
//
// O ML não aceita anexar NF em fulfillment (Full), cross_docking, xd_drop_off e drop_off:
// no Full o próprio ML emite; nos outros a nota é importada pelo fluxo fiscal do ML.
import { db, eq } from '../db.js';
import { integrationOf, getSecret, loadOrg } from '../tenants.js';
import { enqueue, permanent } from '../queue.js';
import { emit } from '../crm.js';
import * as omie from '../channels/omie.js';
import * as ml from '../channels/mercadolivre.js';
import { hasFeature } from '../shared.js';
import { saveInvoiceToDrive } from './google.js';

const set = (id, patch) => db.update('orders', { id: eq(id) }, { ...patch, updated_at: new Date().toISOString() });

export async function processNfe({ orderId, step = 'start', tries = 0 }, job) {
  const orgId = job.org_id;
  const { org, plan } = await loadOrg(orgId);
  if (org.nfe_mode === 'off' || !hasFeature(plan, 'nfe')) return;

  const order = await db.one('orders', { id: eq(orderId), org_id: eq(orgId), select: '*' });
  if (!order) throw permanent('pedido não encontrado');

  if (order.logistic_type === 'fulfillment') {
    await set(order.id, { nfe_status: 'not_allowed', nfe_error: 'Full: a nota é emitida pelo próprio Mercado Livre' });
    return;
  }

  const omieInteg = await integrationOf(orgId, 'omie');
  if (!omieInteg) return set(order.id, { nfe_status: 'error', nfe_error: 'Conecte a Omie para emitir notas' });
  const creds = await getSecret(omieInteg.id);
  const cfg = omieInteg.meta?.nfe || {}; // { categoryCode, accountCode } definidos no painel

  try {
    // 1) Pedido na Omie
    if (!order.omie_order_id) {
      if (!cfg.categoryCode || !cfg.accountCode) throw permanent('Configure categoria e conta corrente da Omie em Integrações > Omie');
      const items = [];
      for (const it of order.items) {
        const p = it.sku ? await db.one('products', { org_id: eq(orgId), source: 'eq.omie', sku: eq(it.sku), select: 'external_id' }) : null;
        if (!p) throw permanent(`Produto "${it.title}" (SKU ${it.sku || 'vazio'}) não encontrado na Omie: use o mesmo SKU no ML e na Omie`);
        items.push({ omieCode: p.external_id, quantity: it.quantity, unitPrice: it.unitPrice });
      }
      const cli = await omie.upsertClient(creds, { id: order.buyer?.id, name: order.buyer?.name, nickname: order.buyer?.nickname });
      const res = await omie.createOrder(creds, {
        integrationCode: `ml-${order.external_id}`, clientCode: cli.codigo_cliente_omie, items,
        categoryCode: cfg.categoryCode, accountCode: cfg.accountCode, obs: `Venda Mercado Livre #${order.external_id}`,
      });
      order.omie_order_id = String(res.codigo_pedido);
      await set(order.id, { omie_order_id: order.omie_order_id, nfe_status: 'order_created', nfe_error: null });
      await emit(orgId, 'invoice.order_created', { orderId: order.id, omieOrderId: order.omie_order_id });
    }
    if (org.nfe_mode !== 'auto') return;

    // 2) Faturar (uma vez)
    if (step === 'start' && order.nfe_status !== 'invoiced') {
      await omie.invoiceOrder(creds, order.omie_order_id);
      return enqueue('nfe.process', orgId, { orderId, step: 'wait_xml', tries: 0 }, null, 60);
    }

    // 3) Esperar a SEFAZ autorizar e pegar o XML
    const nf = await omie.getInvoiceXml(creds, order.omie_order_id);
    if (!nf) {
      if (tries >= 10) throw permanent('NF-e não foi autorizada após 10 tentativas: confira na Omie');
      return enqueue('nfe.process', orgId, { orderId, step: 'wait_xml', tries: tries + 1 }, null, 120);
    }
    await set(order.id, { nfe_status: 'invoiced', nfe_key: nf.key });
    // cópia do XML no Google Drive do cliente (se conectado)
    await saveInvoiceToDrive(orgId, { key: nf.key, xml: nf.xml, orderExternalId: order.external_id }).catch((e) => console.warn('[nfe] Drive:', e.message));

    // 4) Anexar no ML (quando a logística permite)
    if (ml.NO_ATTACH_LOGISTICS.includes(order.logistic_type)) {
      await set(order.id, { nfe_error: `Logística ${order.logistic_type}: envie a nota pelo fluxo fiscal do ML (importação)` });
      return;
    }
    const mlInteg = await integrationOf(orgId, 'mercadolivre');
    await ml.client(mlInteg).attachInvoiceXml(order.pack_id || order.external_id, nf.xml, `nfe-${nf.key || order.external_id}.xml`);
    await set(order.id, { nfe_status: 'attached', nfe_error: null });
    await emit(orgId, 'invoice.attached', { orderId: order.id, key: nf.key });
  } catch (err) {
    await set(order.id, { nfe_status: 'error', nfe_error: err.message.slice(0, 500) });
    throw err;
  }
}
