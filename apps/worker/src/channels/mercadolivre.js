// API do Mercado Livre por cliente: token com renovação automática + recursos usados pela Iris.
import { config } from '../config.js';
import { getSecret, setSecret, markIntegrationError } from '../tenants.js';
import { permanent } from '../queue.js';

const API = 'https://api.mercadolibre.com';
const refreshing = new Map();

async function refresh(integration, secret) {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.ml.clientId, client_secret: config.ml.clientSecret, refresh_token: secret.refresh_token }),
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok) {
    await markIntegrationError(integration.id, `Reconecte o Mercado Livre (${t.message || res.status})`);
    throw permanent('token do Mercado Livre inválido: o cliente precisa reconectar');
  }
  const next = { access_token: t.access_token, refresh_token: t.refresh_token, user_id: String(t.user_id), expires_at: Date.now() + (t.expires_in - 300) * 1000 };
  await setSecret(integration.id, next);
  return next;
}

export async function token(integration) {
  const s = await getSecret(integration.id);
  if (Date.now() < s.expires_at) return s.access_token;
  // refresh_token é de uso único: uma renovação por vez por integração
  if (!refreshing.has(integration.id)) refreshing.set(integration.id, refresh(integration, s).finally(() => refreshing.delete(integration.id)));
  return (await refreshing.get(integration.id)).access_token;
}

export function client(integration) {
  const sellerId = integration.external_id;
  async function api(method, path, body, { form } = {}) {
    const t = await token(integration);
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${t}`, accept: 'application/json', ...(body && !form ? { 'content-type': 'application/json' } : {}) },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`ML ${method} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      err.permanent = [400, 403, 404].includes(res.status);
      throw err;
    }
    return text ? JSON.parse(text) : null;
  }

  return {
    sellerId,
    api,
    // Perguntas
    question: (id) => api('GET', `/questions/${id}?api_version=4`),
    answer: (questionId, text) => api('POST', '/answers', { question_id: Number(questionId), text: text.slice(0, 2000) }),
    // Anúncios
    item: (id) => api('GET', `/items/${id}?include_attributes=all`),
    itemDescription: (id) => api('GET', `/items/${id}/description`).catch(() => null),
    listItemIds: (offset = 0) => api('GET', `/users/${sellerId}/items/search?status=active&limit=50&offset=${offset}`),
    // Pedidos e envios
    order: (id) => api('GET', `/orders/${id}`),
    shipment: (id) => api('GET', `/shipments/${id}`),
    // Mensagens pós-venda
    message: (id) => api('GET', `/messages/${id}?tag=post_sale`),
    packMessages: (packId) => api('GET', `/messages/packs/${packId}/sellers/${sellerId}?tag=post_sale&mark_as_read=false`),
    sendMessage: (packId, toUserId, text) =>
      api('POST', `/messages/packs/${packId}/sellers/${sellerId}?tag=post_sale`, { from: { user_id: sellerId }, to: { user_id: String(toUserId) }, text: text.slice(0, 350) }),
    // Reclamações
    claim: (id) => api('GET', `/post-purchase/v1/claims/${id}`),
    // Nota fiscal: anexa o XML (o ML gera o DANFE)
    attachInvoiceXml(packId, xml, fileName = 'nfe.xml') {
      const form = new FormData();
      form.append('fiscal_document', new Blob([xml], { type: 'text/xml' }), fileName);
      return api('POST', `/packs/${packId}/fiscal_documents`, null, { form });
    },
  };
}

/** Resumo do anúncio para a IA responder com dados reais. */
export async function itemContext(ml, itemId) {
  const [item, desc] = await Promise.all([ml.item(itemId), ml.itemDescription(itemId)]);
  const attrs = (item.attributes || []).filter((a) => a.value_name).slice(0, 40).map((a) => `- ${a.name}: ${a.value_name}`).join('\n');
  const variations = (item.variations || [])
    .slice(0, 20)
    .map((v) => `- ${(v.attribute_combinations || []).map((c) => `${c.name} ${c.value_name}`).join(', ')}: ${v.available_quantity} em estoque`)
    .join('\n');
  return `ANÚNCIO: ${item.title}
Preço: R$ ${item.price} | Estoque: ${item.available_quantity} | Condição: ${item.condition === 'new' ? 'novo' : item.condition}
Frete grátis: ${item.shipping?.free_shipping ? 'sim' : 'não'} | Tipo de envio: ${item.shipping?.logistic_type || '-'}
Garantia: ${(item.sale_terms || []).find((t) => t.id === 'WARRANTY_TIME')?.value_name || 'não informada'}
${variations ? `Variações:\n${variations}\n` : ''}Características:
${attrs || '(nenhuma)'}
Descrição:
${(desc?.plain_text || '').slice(0, 3000) || '(sem descrição)'}`;
}

/** Tipos de logística em que o ML NÃO aceita anexar NF pelo /fiscal_documents. */
export const NO_ATTACH_LOGISTICS = ['fulfillment', 'cross_docking', 'xd_drop_off', 'drop_off'];
