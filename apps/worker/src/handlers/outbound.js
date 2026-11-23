// Entrega de respostas (IA, painel ou API) no canal certo.
import { db, eq } from '../db.js';
import { integrationOf, getSecret, loadOrg } from '../tenants.js';
import { permanent } from '../queue.js';
import { addMessage, createDraft, emit } from '../crm.js';
import { generateReply, AiBlocked } from '../ai.js';
import { decide } from '../shared.js';
import * as wa from '../channels/whatsapp.js';
import * as ml from '../channels/mercadolivre.js';

const log = (...a) => console.log(new Date().toISOString(), '[envio]', ...a);

export async function deliver(orgId, target, text, author = 'ai') {
  if (target.channel === 'whatsapp') {
    const integ = await integrationOf(orgId, 'whatsapp');
    if (!integ || integ.status === 'disconnected') throw permanent('WhatsApp não conectado');
    const secret = await getSecret(integ.id);
    const id = await wa.sendText({ phoneNumberId: integ.external_id, accessToken: secret.access_token }, target.to, text);
    if (target.conversationId) await addMessage(orgId, target.conversationId, { direction: 'out', author, text, externalId: id ? `wa:${id}` : null });
  } else if (target.channel === 'mercadolivre') {
    const integ = await integrationOf(orgId, 'mercadolivre');
    if (!integ || integ.status === 'disconnected') throw permanent('Mercado Livre não conectado');
    const c = ml.client(integ);
    if (target.type === 'question') await c.answer(target.questionId, text);
    else if (target.type === 'message') await c.sendMessage(target.packId, target.toUserId, text);
    else throw permanent(`destino ML desconhecido: ${target.type}`);
    if (target.conversationId) await addMessage(orgId, target.conversationId, { direction: 'out', author, text });
  } else {
    throw permanent(`canal desconhecido: ${target.channel}`);
  }
  await db.rpc('bump_usage', { p_org: orgId, p_field: 'messages_out', p_n: 1 });
}

/**
 * Pede a resposta à IA e decide: envia direto ou cria rascunho para aprovação.
 * @returns {'sent'|'draft'|'skipped'}
 */
export async function respondWithAi({ orgId, channel, conversation, target, customerText, context }) {
  const { org, plan } = await loadOrg(orgId);
  const mode = channel === 'whatsapp' ? org.mode_whatsapp : org.mode_ml;
  if (mode === 'off' || conversation?.ai_paused) return 'skipped';
  if (!plan.channels.includes(channel)) {
    await createDraft(orgId, { conversationId: conversation?.id, target, customerText, reason: `canal não incluso no plano ${plan.name}` });
    return 'draft';
  }

  const historyRows = conversation
    ? await db.select('messages', { conversation_id: eq(conversation.id), select: 'direction,text', order: 'created_at.desc', limit: 13 })
    : [];
  // a última mensagem (a atual) já foi salva: tira do histórico
  const history = (historyRows || []).slice(1).reverse();

  let result;
  try {
    result = await generateReply({ org, plan, channel, context, history, customerText });
  } catch (err) {
    if (err instanceof AiBlocked) {
      await createDraft(orgId, { conversationId: conversation?.id, target, customerText, reason: `IA bloqueada: ${err.message}` });
      return 'draft';
    }
    throw err;
  }

  const verdict = decide({ channel, mode, customerText, result, minConfidence: Number(org.min_confidence) });
  if (verdict.send) {
    await deliver(orgId, target, result.reply, 'ai');
    log(`org ${orgId}: resposta automática (${channel})`);
    return 'sent';
  }
  await createDraft(orgId, { conversationId: conversation?.id, target, customerText, reply: result.reply, reason: verdict.reason });
  return 'draft';
}

/** Job vindo do painel: enviar um rascunho aprovado ou uma mensagem manual. */
export async function sendFromPanel(payload, job) {
  const orgId = job.org_id;
  if (payload.draftId) {
    const d = await db.one('drafts', { id: eq(payload.draftId), org_id: eq(orgId), select: '*' });
    if (!d) throw permanent('rascunho não encontrado nesta organização');
    if (d.status === 'sent') return;
    const text = String(payload.text ?? d.reply).trim();
    if (!text) throw permanent('resposta vazia');
    try {
      await deliver(orgId, { ...d.target, conversationId: d.conversation_id }, text, 'human');
      await db.update('drafts', { id: eq(d.id) }, { status: 'sent', reply: text, error: null, updated_at: new Date().toISOString() });
    } catch (err) {
      await db.update('drafts', { id: eq(d.id) }, { status: err.permanent ? 'error' : 'queued', error: err.message, updated_at: new Date().toISOString() });
      throw err;
    }
    return;
  }
  if (payload.conversationId && payload.text) {
    const conv = await db.one('conversations', { id: eq(payload.conversationId), org_id: eq(orgId), select: '*' });
    if (!conv) throw permanent('conversa não encontrada nesta organização');
    await deliver(orgId, targetFor(conv), String(payload.text).trim(), 'human');
    return;
  }
  throw permanent('payload inválido');
}

/** Destino de envio a partir de uma conversa salva. */
export function targetFor(conv) {
  if (conv.channel === 'whatsapp') return { channel: 'whatsapp', to: conv.external_ref, conversationId: conv.id };
  if (conv.kind === 'question') return { channel: 'mercadolivre', type: 'question', questionId: conv.external_ref.replace('q:', ''), conversationId: conv.id };
  return { channel: 'mercadolivre', type: 'message', packId: conv.external_ref.replace('pack:', ''), toUserId: conv.meta?.toUserId, conversationId: conv.id };
}

export { emit };
