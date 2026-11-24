// WhatsApp Cloud API (oficial). Cada cliente conecta o próprio número pelo
// Cadastro Incorporado (Embedded Signup) da Meta; o token fica criptografado.
import { config } from '../config.js';
import { hmacHex, safeEqualHex } from '../shared.js';

const graph = (path) => `https://graph.facebook.com/${config.meta.graphVersion}/${path}`;

export function verifyChallenge(params) {
  return params.get('hub.mode') === 'subscribe' && config.meta.verifyToken && params.get('hub.verify_token') === config.meta.verifyToken
    ? params.get('hub.challenge')
    : null;
}

/** Valida X-Hub-Signature-256 com o App Secret da Meta. Sem segredo configurado, recusa. */
export function verifySignature(raw, header, secret = config.meta.appSecret) {
  if (!secret || !header?.startsWith('sha256=')) return false;
  return safeEqualHex(header.slice(7), hmacHex(secret, raw));
}

/** Converte o payload da Meta em eventos simples. */
export function parseWebhook(body) {
  const messages = [];
  const statuses = [];
  for (const entry of body?.entry || []) {
    for (const ch of entry.changes || []) {
      if (ch.field !== 'messages') continue;
      const v = ch.value || {};
      const phoneNumberId = v.metadata?.phone_number_id;
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages || []) {
        const text =
          m.type === 'text' ? m.text?.body
          : m.type === 'button' ? m.button?.text
          : m.type === 'interactive' ? m.interactive?.button_reply?.title || m.interactive?.list_reply?.title
          : m.type === 'image' || m.type === 'video' || m.type === 'document' ? m[m.type]?.caption || null
          : null;
        messages.push({ phoneNumberId, id: m.id, from: m.from, name: names[m.from] || null, type: m.type, text: text || null, timestamp: m.timestamp });
      }
      for (const s of v.statuses || []) statuses.push({ phoneNumberId, id: s.id, status: s.status, to: s.recipient_id, errors: s.errors });
    }
  }
  return { messages, statuses };
}

export async function sendText({ phoneNumberId, accessToken }, to, body) {
  const res = await fetch(graph(`${phoneNumberId}/messages`), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: body.slice(0, 4096) } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data?.error?.code;
    // 131047: fora da janela de 24h — só template aprovado pode iniciar conversa
    const err = new Error(code === 131047 ? 'Fora da janela de 24h do WhatsApp: o cliente precisa mandar mensagem primeiro (ou use um template aprovado).' : `WhatsApp ${res.status}: ${data?.error?.message || 'erro'}`);
    err.permanent = res.status >= 400 && res.status < 500;
    throw err;
  }
  return data.messages?.[0]?.id;
}

/** Marca como lida (os dois tracinhos azuis) — deixa o atendimento mais natural. */
export async function markRead({ phoneNumberId, accessToken }, messageId) {
  await fetch(graph(`${phoneNumberId}/messages`), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
  }).catch(() => {});
}
