// Mensagem recebida no WhatsApp de um cliente da plataforma.
import { db, eq } from '../db.js';
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

/** Aviso de entrega da Meta: se falhou, registra o motivo na conversa para o lojista ver. */
const FAIL_HINTS = {
  131030: 'o número de destino não está na lista de destinatários permitidos do número de teste da Meta',
  131026: 'a mensagem não pôde ser entregue (o número pode não ter WhatsApp ou estar com o app desatualizado)',
  131047: 'passou da janela de 24h: o cliente precisa mandar mensagem primeiro',
  131042: 'problema de pagamento na conta do WhatsApp Business (cadastre um cartão na Meta)',
  131049: 'a Meta limitou mensagens para esse contato por um tempo',
  130472: 'o número do cliente faz parte de um experimento da Meta e não recebeu',
};

export async function onWhatsappStatus(s) {
  if (s.status !== 'failed') return;
  const integ = await integrationByExternal('whatsapp', s.phoneNumberId);
  if (!integ) return;
  const orgId = integ.org_id;
  const msg = await db.one('messages', { org_id: eq(orgId), external_id: eq(`wa:${s.id}`), select: 'conversation_id' });
  const e = s.errors?.[0] || {};
  const why = FAIL_HINTS[e.code] || e.error_data?.details || e.message || e.title || 'motivo não informado';
  console.warn(new Date().toISOString(), '[whatsapp] entrega falhou', e.code, why);
  if (msg) await addMessage(orgId, msg.conversation_id, { direction: 'out', author: 'system', text: `Não entregue pelo WhatsApp (${e.code || '?'}): ${why}` });
}
