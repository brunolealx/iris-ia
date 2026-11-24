// CRM: contatos, conversas, mensagens, rascunhos e eventos para webhooks de saída.
import { db, eq } from './db.js';
import { enqueue } from './queue.js';

const now = () => new Date().toISOString();

export async function upsertContact(orgId, { channel, externalId, name, phone, email }) {
  const existing = await db.one('contacts', { org_id: eq(orgId), channel: eq(channel), external_id: eq(externalId), select: '*' });
  if (existing) {
    const patch = { last_message_at: now() };
    if (name && !existing.name) patch.name = name;
    if (phone && !existing.phone) patch.phone = phone;
    if (email && !existing.email) patch.email = email;
    const [c] = await db.update('contacts', { id: eq(existing.id) }, patch);
    return c;
  }
  const [c] = await db.upsert('contacts', { org_id: orgId, channel, external_id: externalId, name, phone, email, last_message_at: now() }, 'org_id,channel,external_id');
  await emit(orgId, 'contact.created', { contact: c });
  return c;
}

export async function upsertConversation(orgId, { channel, externalRef, kind = 'chat', contactId, meta }) {
  const [c] = await db.upsert(
    'conversations',
    { org_id: orgId, channel, external_ref: externalRef, kind, contact_id: contactId, status: 'open', last_message_at: now(), ...(meta ? { meta } : {}) },
    'org_id,channel,external_ref'
  );
  return c;
}

/** Salva a mensagem. Retorna null se já existia (mesmo external_id). */
export async function addMessage(orgId, conversationId, { direction, author, text, externalId = null }) {
  const row = { org_id: orgId, conversation_id: conversationId, direction, author, text, external_id: externalId };
  const rows = externalId ? await db.upsert('messages', row, 'org_id,external_id', { ignore: true }) : await db.insert('messages', row);
  return rows?.[0] ?? null;
}

export async function history(conversationId, limit = 12) {
  const rows = await db.select('messages', { conversation_id: eq(conversationId), select: 'direction,author,text', order: 'created_at.desc', limit });
  return (rows || []).reverse();
}

export async function createDraft(orgId, { conversationId, target, customerText, reply, reason }) {
  const [d] = await db.insert('drafts', { org_id: orgId, conversation_id: conversationId, target, customer_text: customerText, reply: reply || '', reason });
  await emit(orgId, 'draft.created', { draft: d });
  return d;
}

/** Dispara um evento para os webhooks de saída do cliente (e para a planilha do Google). */
export async function emit(orgId, event, data) {
  if (event === 'order.created' || event === 'contact.created') {
    const g = await db.one('integrations', { org_id: eq(orgId), provider: 'eq.google', status: 'eq.connected', select: 'id' });
    if (g) {
      const row = event === 'order.created' ? { kind: 'order', id: data.order.id } : { kind: 'contact', id: data.contact.id };
      await enqueue('google.append', orgId, row, `g:${row.kind}:${row.id}`);
    }
  }
  const endpoints = await db.select('webhook_endpoints', { org_id: eq(orgId), active: 'is.true', select: 'id,events' });
  for (const ep of endpoints || []) {
    if (ep.events.includes(event) || ep.events.includes('*')) {
      await enqueue('webhook.dispatch', orgId, { endpointId: ep.id, event, data, at: now() });
    }
  }
}
