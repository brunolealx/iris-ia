// Mensagem recebida no WhatsApp de um cliente da plataforma.
import { db } from '../db.js';
import { integrationByExternal, getSecret } from '../tenants.js';
import { upsertContact, upsertConversation, addMessage, emit, createDraft } from '../crm.js';
import { respondWithAi } from './outbound.js';
import * as wa from '../channels/whatsapp.js';

export async function onWhatsappMessage(m) {
  const integ = await integrationByExternal('whatsapp', m.phoneNumberId);
  if (!integ) return; // número não pertence a nenhum cliente
  const orgId = integ.org_id;

  const contact = await upsertContact(orgId, { channel: 'whatsapp', externalId: m.from, name: m.name, phone: `+${m.from}` });
  const conv = await upsertConversation(orgId, { channel: 'whatsapp', externalRef: m.from, contactId: contact.id });
  const text = m.text ?? `[${m.type}]`;
  const saved = await addMessage(orgId, conv.id, { direction: 'in', author: 'customer', text, externalId: `wa:${m.id}` });
  if (!saved) return; // a Meta reenviou a mesma mensagem
  await db.rpc('bump_usage', { p_org: orgId, p_field: 'messages_in', p_n: 1 });
  await emit(orgId, 'message.received', { channel: 'whatsapp', contact, conversationId: conv.id, text });

  getSecret(integ.id).then((s) => wa.markRead({ phoneNumberId: integ.external_id, accessToken: s.access_token }, m.id)).catch(() => {});

  const target = { channel: 'whatsapp', to: m.from, conversationId: conv.id };
  if (!m.text) {
    await createDraft(orgId, {
      conversationId: conv.id, target, customerText: text,
      reply: 'Recebi sua mensagem! Já já alguém da equipe te responde por aqui. 😊',
      reason: `mensagem do tipo ${m.type} (a IA lê só texto)`,
    });
    return;
  }
  await respondWithAi({ orgId, channel: 'whatsapp', conversation: conv, target, customerText: m.text, context: m.name ? `Nome do cliente: ${m.name}` : '' });
}
