// NF-e das vendas do Mercado Livre pelo Faturador do próprio ML.
//
// nfe_mode da organização:
//   off    → nada
//   manual → o lojista clica "Emitir nota" em Vendas
//   auto   → emite assim que a venda é paga
//
// O ML usa os dados fiscais cadastrados nos anúncios (NCM, origem, CFOP…) e o certificado
// A1 configurado no Faturador. A nota autorizada fica vinculada à venda automaticamente;
// a Iris acompanha a autorização, guarda a chave e salva o XML no Google Drive.
// No Mercado Envios Full o ML emite sozinho: a Iris só busca a nota.
import { db, eq } from '../db.js';
import { integrationOf, loadOrg } from '../tenants.js';
import { enqueue, permanent } from '../queue.js';
import { emit } from '../crm.js';
import * as ml from '../channels/mercadolivre.js';
import { hasFeature } from '../shared.js';
import { saveInvoiceToDrive } from './google.js';

const MAX_WAIT = 15; // 15 consultas espaçadas (~30 min)
const set = (id, patch) => db.update('orders', { id: eq(id) }, { ...patch, updated_at: new Date().toISOString() });

const statusOf = (inv) => String(inv?.status || '').toLowerCase();
const FAILED = ['rejected', 'error', 'canceled', 'cancelled', 'denied'];
const invoiceIdOf = (res) => {
  const r = Array.isArray(res) ? res[0] : res;
  return r ? String(r.id ?? r.invoice_id ?? r.invoice?.id ?? '') || null : null;
};

async function errorText(c, inv) {
  const code = inv?.errors?.[0]?.code || inv?.error_code || inv?.status_detail;
  const detail = code ? await c.invoiceError(code) : null;
  return (detail?.message || detail?.description || inv?.errors?.[0]?.message || inv?.status_detail || 'nota rejeitada').toString();
}

export async function processNfe({ orderId, step = 'emit', tries = 0, manual = false }, job) {
  const orgId = job.org_id;
  const { org, plan } = await loadOrg(orgId);
  if (!hasFeature(plan, 'nfe')) return;
  if (org.nfe_mode === 'off' && !manual) return;

  const order = await db.one('orders', { id: eq(orderId), org_id: eq(orgId), select: '*' });
  if (!order) throw permanent('pedido não encontrado');
  if (order.source !== 'mercadolivre') throw permanent('só vendas do Mercado Livre usam o Faturador');
  if (order.nfe_status === 'authorized') return;

  const integ = await integrationOf(orgId, 'mercadolivre');
  if (!integ || integ.status === 'disconnected') return set(order.id, { nfe_status: 'error', nfe_error: 'Conecte o Mercado Livre' });
  const c = ml.client(integ);

  try {
    // 1) Emitir (uma vez). No Full o próprio ML emite, então só esperamos.
    if (step === 'emit') {
      if (order.status !== 'paid') throw permanent('A venda ainda não está paga');
      let invId = order.nfe_invoice_id;
      if (!invId) {
        const found = await c.invoiceByOrder(order.external_id); // já emitida? (ignora nota rejeitada)
        if (found && !FAILED.includes(statusOf(Array.isArray(found) ? found[0] : found))) invId = invoiceIdOf(found);
      }
      if (!invId && order.logistic_type !== 'fulfillment') {
        // carrinho: uma nota para todas as vendas do mesmo pacote
        const pack = order.pack_id
          ? await db.select('orders', { org_id: eq(orgId), source: 'eq.mercadolivre', pack_id: eq(order.pack_id), select: 'id,external_id' })
          : [order];
        const ids = [...new Set(pack.map((o) => o.external_id))];
        invId = invoiceIdOf(await c.emitInvoice(ids));
        for (const o of pack) if (o.id !== order.id) await set(o.id, { nfe_status: 'processing', nfe_invoice_id: invId, nfe_error: null });
      }
      await set(order.id, { nfe_status: 'processing', nfe_invoice_id: invId, nfe_error: null });
      await emit(orgId, 'invoice.requested', { orderId: order.id, invoiceId: invId });
      return enqueue('nfe.process', orgId, { orderId, step: 'wait', tries: 0, manual }, null, 45);
    }

    // 2) Esperar a SEFAZ autorizar (o aviso também chega pelo tópico "invoices")
    const inv = order.nfe_invoice_id ? await c.invoice(order.nfe_invoice_id) : await c.invoiceByOrder(order.external_id);
    const st = statusOf(inv);
    if (st === 'authorized') {
      const key = inv.attributes?.invoice_key || inv.invoice_key || inv.fiscal_key || null;
      const xml = await c.invoiceXml(inv.attributes?.xml_location || inv.xml_location || inv.id).catch(() => null);
      await set(order.id, { nfe_status: 'authorized', nfe_key: key, nfe_invoice_id: String(inv.id ?? order.nfe_invoice_id), nfe_error: null });
      if (xml) await saveInvoiceToDrive(orgId, { key, xml, orderExternalId: order.external_id }).catch((e) => console.warn('[nfe] Drive:', e.message));
      await emit(orgId, 'invoice.authorized', { orderId: order.id, key, invoiceId: inv.id });
      return;
    }
    if (FAILED.includes(st)) {
      throw permanent(`Faturador do ML: ${await errorText(c, inv)}`);
    }
    if (tries >= MAX_WAIT) throw permanent('A nota não foi autorizada a tempo: confira no Faturador do Mercado Livre');
    return enqueue('nfe.process', orgId, { orderId, step: 'wait', tries: tries + 1, manual }, null, 120);
  } catch (err) {
    const msg = /fiscal|tax|ncm|certific/i.test(err.message) && !/Faturador do ML/.test(err.message)
      ? `${err.message} — confira os dados fiscais dos anúncios e o certificado no Faturador do ML`
      : err.message;
    await set(order.id, { nfe_status: 'error', nfe_error: msg.slice(0, 500) });
    throw err;
  }
}

/** Tópico "invoices" do ML: a nota mudou de status → consulta na hora. */
export async function onInvoiceNotification(orgId, invoiceId) {
  const order = await db.one('orders', { org_id: eq(orgId), source: 'eq.mercadolivre', nfe_invoice_id: eq(invoiceId), select: 'id,nfe_status' });
  if (!order || order.nfe_status === 'authorized') return;
  await enqueue('nfe.process', orgId, { orderId: order.id, step: 'wait', tries: 0, manual: true }, `nfe-inv:${invoiceId}:${Math.floor(Date.now() / 60000)}`);
}
