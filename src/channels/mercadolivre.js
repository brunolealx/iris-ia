// API do Mercado Livre: login (OAuth), perguntas e mensagens pós-venda.
import { config } from '../config.js';
import { kvGet, kvSet } from '../db.js';

const API = 'https://api.mercadolibre.com';
const AUTH = 'https://auth.mercadolivre.com.br/authorization';

export function redirectUri() {
  return `${config.publicUrl}/auth/ml/callback`;
}

/** Link para você autorizar a Iris na sua conta de vendedor. */
export function authorizeUrl() {
  const p = new URLSearchParams({ response_type: 'code', client_id: config.mercadolivre.clientId, redirect_uri: redirectUri() });
  return `${AUTH}?${p}`;
}

async function tokenRequest(params, fetchImpl = fetch) {
  const res = await fetchImpl(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ client_id: config.mercadolivre.clientId, client_secret: config.mercadolivre.clientSecret, ...params }),
  });
  if (!res.ok) throw new Error(`ML oauth ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const t = await res.json();
  const saved = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    user_id: String(t.user_id),
    expires_at: Date.now() + (t.expires_in - 300) * 1000, // renova 5 min antes
  };
  kvSet('ml_token', saved);
  return saved;
}

/** Troca o "code" do callback pelos tokens. */
export function exchangeCode(code, fetchImpl) {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() }, fetchImpl);
}

let refreshing = null;
export async function getAccessToken(fetchImpl = fetch) {
  const t = kvGet('ml_token');
  if (!t) throw new Error('Mercado Livre não conectado: acesse /auth/ml');
  if (Date.now() < t.expires_at) return t.access_token;
  // o refresh_token é de uso único: evita duas renovações ao mesmo tempo
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token }, fetchImpl).finally(() => (refreshing = null));
  return (await refreshing).access_token;
}

export function sellerId() {
  return config.mercadolivre.sellerId || kvGet('ml_token')?.user_id || '';
}

async function api(method, path, body, fetchImpl = fetch) {
  const token = await getAccessToken(fetchImpl);
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`ML ${method} ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

// ---------- Perguntas (antes da venda) ----------

export const getQuestion = (id, f) => api('GET', `/questions/${id}?api_version=4`, null, f);
export const answerQuestion = (questionId, text, f) => api('POST', '/answers', { question_id: Number(questionId), text: text.slice(0, 2000) }, f);

/** Monta o resumo do anúncio para o Claude responder com dados reais. */
export async function itemContext(itemId, f) {
  const item = await api('GET', `/items/${itemId}`, null, f);
  let description = '';
  try {
    description = (await api('GET', `/items/${itemId}/description`, null, f))?.plain_text || '';
  } catch {
    /* anúncio sem descrição */
  }
  const attrs = (item.attributes || [])
    .filter((a) => a.value_name)
    .slice(0, 30)
    .map((a) => `- ${a.name}: ${a.value_name}`)
    .join('\n');
  return `ANÚNCIO: ${item.title}
Preço: R$ ${item.price}
Estoque disponível: ${item.available_quantity}
Condição: ${item.condition === 'new' ? 'novo' : item.condition}
Frete grátis: ${item.shipping?.free_shipping ? 'sim' : 'não'}
Características:
${attrs || '(nenhuma)'}
Descrição:
${description.slice(0, 3000) || '(sem descrição)'}`;
}

// ---------- Mensagens pós-venda ----------

/** Lê uma mensagem pós-venda a partir do "resource" da notificação. */
export async function getPostSaleMessage(resource, f) {
  const id = String(resource).split('/').pop();
  const data = await api('GET', `/messages/${id}?tag=post_sale`, null, f);
  const msg = data?.messages?.[0] || data;
  const packRes = (msg.message_resources || []).find((r) => r.name === 'packs' || r.name === 'orders');
  return {
    id: msg.id,
    text: msg.text?.plain ?? msg.text ?? '',
    fromUserId: String(msg.from?.user_id ?? ''),
    packId: packRes ? String(packRes.id) : null,
  };
}

/**
 * Responde dentro da conversa da venda.
 * Na nova arquitetura do ML, o "to" é o ID do agente que veio no "from" da mensagem recebida.
 */
export function sendPostSaleMessage(packId, toUserId, text, f) {
  const seller = sellerId();
  return api(
    'POST',
    `/messages/packs/${packId}/sellers/${seller}?tag=post_sale`,
    { from: { user_id: seller }, to: { user_id: toUserId }, text: text.slice(0, 350) },
    f
  );
}
