// Notificações do Mercado Livre: perguntas, mensagens, pedidos, envios, anúncios e reclamações.
import { db, eq } from '../db.js';
import { integrationByExternal, loadOrg } from '../tenants.js';
import { enqueue } from '../queue.js';
import { upsertContact, upsertConversation, addMessage, emit, createDraft } from '../crm.js';
import { respondWithAi } from './outbound.js';
import * as ml from '../channels/mercadolivre.js';
import { hasFeature } from '../shared.js';
import { onInvoiceNotification } from './nfe.js';

const now = () => new Date().toISOString();
const lastId = (resource) => String(resource).split('?')[0].split('/').filter(Boolean).pop();

/** Ponto de entrada: descobre o cliente pelo user_id e despacha pelo tópico. */
export async function onMlNotification(n) {
  const integ = await integrationByExternal('mercadolivre', String(n.user_id));
  if (!integ) return;
  const c = ml.client(integ);
  const orgId = integ.org_id;
  const topic = String(n.topic);
  if (topic === 'questions') return onQuestion(orgId, c, lastId(n.resource));
  if (topic === 'messages') return onMessage(orgId, c, lastId(n.resource));
  if (topic === 'orders_v2') return onOrder(orgId, c, lastId(n.resource));
  if (topic === 'shipments') return onShipment(orgId, c, lastId(n.resource));
  if (topic === 'items') return onItem(orgId, c, lastId(n.resource));
  if (topic === 'claims' || topic === 'post_purchase') return onClaim(orgId, c, lastId(n.resource));
  if (topic === 'invoices') return onInvoiceNotification(orgId, lastId(n.resource));
}

async function onQuestion(orgId, c, questionId) {
  const q = await c.question(questionId);
  if (q.status !== 'UNANSWERED') return;
  const contact = await upsertContact(orgId, { channel: 'mercadolivre', externalId: String(q.from?.id), name: q.from?.nickname || null });
  const conv = await upsertConversation(orgId, { channel: 'mercadolivre', externalRef: `q:${q.id}`, kind: 'question', contactId: contact.id, meta: { itemId: q.item_id } });
  const saved = await addMessage(orgId, conv.id, { direction: 'in', author: 'customer', text: q.text, externalId: `mlq:${q.id}` });
  if (!saved) return;
  await db.rpc('bump_usage', { p_org: orgId, p_field: 'messages_in', p_n: 1 });
  await emit(orgId, 'message.received', { channel: 'mercadolivre', kind: 'question', itemId: q.item_id, text: q.text, contact });
  const context = await ml.itemContext(c, q.item_id);
  await respondWithAi({
    orgId, channel: 'mercadolivre', conversation: conv, customerText: q.text,
    target: { channel: 'mercadolivre', type: 'question', questionId: q.id, conversationId: conv.id },
    context: `Pergunta pública no anúncio (antes da compra).\n${context}`,
  });
}

async function onMessage(orgId, c, messageId) {
  const data = await c.message(messageId);
  const msg = data?.messages?.[0] || data;
  const text = msg?.text?.plain ?? msg?.text;
  const fromId = String(msg?.from?.user_id ?? '');
  const packRes = (msg?.message_resources || []).find((r) => r.name === 'packs' || r.name === 'orders');
  if (!text || !packRes || fromId === c.sellerId) return;
  const packId = String(packRes.id);

  const order = await db.one('orders', { org_id: eq(orgId), source: 'eq.mercadolivre', or: `(pack_id.eq.${packId},external_id.eq.${packId})`, select: 'id,contact_id,items' });
  const conv = await upsertConversation(orgId, { channel: 'mercadolivre', externalRef: `pack:${packId}`, kind: 'post_sale', contactId: order?.contact_id, meta: { toUserId: fromId } });
  const saved = await addMessage(orgId, conv.id, { direction: 'in', author: 'customer', text, externalId: `mlm:${msg.id}` });
  if (!saved) return;
  await db.rpc('bump_usage', { p_org: orgId, p_field: 'messages_in', p_n: 1 });
  await emit(orgId, 'message.received', { channel: 'mercadolivre', kind: 'post_sale', packId, text });
  const items = (order?.items || []).map((i) => `- ${i.quantity}x ${i.title}`).join('\n');
  await respondWithAi({
    orgId, channel: 'mercadolivre', conversation: conv, customerText: text,
    target: { channel: 'mercadolivre', type: 'message', packId, toUserId: fromId, conversationId: conv.id },
    context: `Mensagem pós-venda de um comprador (já comprou). Resposta com no máximo 350 caracteres.${items ? `\nItens do pedido:\n${items}` : ''}`,
  });
}

async function onOrder(orgId, c, orderId) {
  const o = await c.order(orderId);
  const buyer = o.buyer || {};
  const contact = await upsertContact(orgId, {
    channel: 'mercadolivre', externalId: String(buyer.id),
    name: [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.nickname,
  });
  let shipment = null;
  if (o.shipping?.id) shipment = await c.shipment(o.shipping.id).catch(() => null);

  const row = {
    org_id: orgId, source: 'mercadolivre', external_id: String(o.id), pack_id: o.pack_id ? String(o.pack_id) : String(o.id),
    contact_id: contact.id, status: o.status, shipping_status: shipment?.status || null,
    logistic_type: shipment?.logistic_type || null,
    total_cents: Math.round(Number(o.total_amount || 0) * 100),
    items: (o.order_items || []).map((i) => ({
      itemId: i.item?.id, title: i.item?.title, sku: i.item?.seller_sku || i.item?.seller_custom_field || null,
      variationId: i.item?.variation_id || null, quantity: i.quantity, unitPrice: Number(i.unit_price),
    })),
    buyer: { id: buyer.id, nickname: buyer.nickname, name: contact.name },
    updated_at: now(),
  };
  const existing = await db.one('orders', { org_id: eq(orgId), source: 'eq.mercadolivre', external_id: eq(row.external_id), select: 'id,status,nfe_status' });
  const [saved] = await db.upsert('orders', row, 'org_id,source,external_id');

  if (!existing) {
    await emit(orgId, 'order.created', { order: saved });
    await db.update('contacts', { id: eq(contact.id) }, { stage: 'cliente', value_cents: Number(contact.value_cents || 0) + row.total_cents });
  } else if (existing.status !== o.status) {
    await emit(orgId, 'order.updated', { order: saved });
  }

  // Nota fiscal pelo Faturador do ML: no modo automático emite quando a venda é paga;
  // no Full o ML emite sozinho e a Iris só busca a nota (modo manual ou automático).
  const { org, plan } = await loadOrg(orgId);
  const wants = org.nfe_mode === 'auto' || (org.nfe_mode === 'manual' && row.logistic_type === 'fulfillment');
  if (o.status === 'paid' && wants && hasFeature(plan, 'nfe') && saved.nfe_status === 'none') {
    await enqueue('nfe.process', orgId, { orderId: saved.id }, `nfe:${saved.id}`);
  }
}

async function onShipment(orgId, c, shipmentId) {
  const s = await c.shipment(shipmentId);
  if (!s?.order_id) return;
  await db.update('orders', { org_id: eq(orgId), source: 'eq.mercadolivre', external_id: eq(s.order_id) }, {
    shipping_status: s.status, logistic_type: s.logistic_type || null, updated_at: now(),
  });
}

async function onItem(orgId, c, itemId) {
  const it = await c.item(itemId);
  const sku = (it.attributes || []).find((a) => a.id === 'SELLER_SKU')?.value_name || it.seller_custom_field || null;
  await db.upsert('products', {
    org_id: orgId, source: 'mercadolivre', external_id: it.id, ml_item_id: it.id, sku, name: it.title,
    price_cents: Math.round(Number(it.price) * 100), stock: it.available_quantity, active: it.status === 'active',
    attributes: Object.fromEntries((it.attributes || []).filter((a) => a.value_name).slice(0, 40).map((a) => [a.name, a.value_name])),
    updated_at: now(),
  }, 'org_id,source,external_id');
}

async function onClaim(orgId, c, claimId) {
  const cl = await c.claim(claimId).catch(() => null);
  if (!cl) return;
  const orderId = cl.resource === 'order' ? String(cl.resource_id) : null;
  const conv = await upsertConversation(orgId, { channel: 'mercadolivre', externalRef: `claim:${claimId}`, kind: 'post_sale' });
  const saved = await addMessage(orgId, conv.id, { direction: 'in', author: 'system', text: `Reclamação aberta (${cl.reason_id || cl.type || 'sem motivo'}) no pedido ${orderId || '-'}. Status: ${cl.status}`, externalId: `mlc:${claimId}:${cl.status}` });
  if (!saved) return;
  await emit(orgId, 'claim.opened', { claimId, orderId, status: cl.status });
  await createDraft(orgId, {
    conversationId: conv.id, target: { channel: 'none' },
    customerText: `⚠️ Reclamação ${claimId} no pedido ${orderId || '-'} (${cl.status}). Responda pelo painel do Mercado Livre para proteger sua reputação.`,
    reason: 'reclamação: sempre humano',
  });
}
