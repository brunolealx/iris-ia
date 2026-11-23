// Mercado Pago: assinaturas (preapproval) dos seus clientes.
import { config } from '../config.js';
import { hmacHex, safeEqualHex } from '../shared.js';

/**
 * Valida o header x-signature ("ts=...,v1=...").
 * Manifesto: id:{data.id};request-id:{x-request-id};ts:{ts};
 */
export function verifySignature({ signature, requestId, dataId }, secret = config.mp.webhookSecret) {
  if (!secret || !signature) return false;
  const parts = Object.fromEntries(String(signature).split(',').map((p) => p.trim().split('=')));
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId);
  let manifest = `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${parts.ts};`;
  return safeEqualHex(parts.v1, hmacHex(secret, manifest));
}

export async function getPreapproval(id) {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${config.mp.accessToken}` },
  });
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** authorized → ativo | paused → pagamento pendente | cancelled → cancelado */
export function statusFromPreapproval(s) {
  return s === 'authorized' ? 'active' : s === 'paused' ? 'past_due' : s === 'cancelled' ? 'canceled' : null;
}
