// WhatsApp Cloud API (oficial da Meta).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/** Verificação do webhook (GET) feita pela Meta ao cadastrar a URL. */
export function verifyChallenge(query) {
  const ok = query.get('hub.mode') === 'subscribe' && config.whatsapp.verifyToken && query.get('hub.verify_token') === config.whatsapp.verifyToken;
  return ok ? query.get('hub.challenge') : null;
}

/** Confere a assinatura X-Hub-Signature-256 para garantir que o POST veio da Meta. */
export function verifySignature(rawBody, header, appSecret = config.whatsapp.appSecret) {
  if (!appSecret) return true; // sem segredo configurado: aceita (só para testes)
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header.slice(7), 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Extrai as mensagens de texto recebidas do payload do webhook. */
export function parseIncoming(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of value.messages || []) {
        const text =
          m.type === 'text' ? m.text?.body :
          m.type === 'button' ? m.button?.text :
          m.type === 'interactive' ? (m.interactive?.button_reply?.title || m.interactive?.list_reply?.title) :
          null;
        out.push({
          id: m.id,
          from: m.from,
          name: names[m.from] || null,
          type: m.type,
          text: text || null, // áudio, imagem etc. ficam com text = null
        });
      }
    }
  }
  return out;
}

export async function sendText(to, body, fetchImpl = fetch) {
  const { graphVersion, phoneNumberId, accessToken } = config.whatsapp;
  const res = await fetchImpl(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
