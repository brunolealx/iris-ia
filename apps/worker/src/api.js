// API pública da Iris (para o sistema do cliente mandar dados e mensagens).
// Autenticação: Authorization: Bearer iris_xxxxxxxx_<segredo>  (gerada no painel)
import { db, eq } from './db.js';
import { orgByApiKey, loadOrg } from './tenants.js';
import { enqueue } from './queue.js';
import { upsertContact, upsertConversation, emit } from './crm.js';
import { parseApiKey, hasFeature } from './shared.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// limite simples: 120 requisições por minuto por organização
const buckets = new Map();
function rateLimit(orgId) {
  const now = Date.now();
  const b = buckets.get(orgId) || { n: 0, reset: now + 60_000 };
  if (now > b.reset) Object.assign(b, { n: 0, reset: now + 60_000 });
  b.n++;
  buckets.set(orgId, b);
  if (b.n > 120) throw new HttpError(429, 'muitas requisições: tente em 1 minuto');
}

const str = (v, max = 500) => (v == null ? null : String(v).slice(0, max));
const cents = (v) => (v == null || v === '' ? null : Math.round(Number(v) * 100));
const digits = (v) => String(v || '').replace(/\D/g, '');

async function auth(header) {
  const key = parseApiKey(String(header || '').replace(/^Bearer\s+/i, ''));
  if (!key) throw new HttpError(401, 'chave da API ausente ou inválida');
  const orgId = await orgByApiKey(key.prefix, key.hash);
  if (!orgId) throw new HttpError(401, 'chave da API inválida');
  const { plan } = await loadOrg(orgId);
  if (!hasFeature(plan, 'api')) throw new HttpError(403, `API não inclusa no plano ${plan.name}`);
  rateLimit(orgId);
  return orgId;
}

const routes = {
  /** Envia mensagem no WhatsApp do cliente. Body: { to: "5515999999999", text } */
  async 'POST /api/v1/messages'(orgId, b) {
    const to = digits(b.to);
    if (to.length < 10 || !b.text) throw new HttpError(400, 'informe "to" (com DDI) e "text"');
    const contact = await upsertContact(orgId, { channel: 'whatsapp', externalId: to, name: str(b.name, 120), phone: `+${to}` });
    const conv = await upsertConversation(orgId, { channel: 'whatsapp', externalRef: to, contactId: contact.id });
    await enqueue('outbound.send', orgId, { conversationId: conv.id, text: str(b.text, 4000) });
    return { queued: true, conversation_id: conv.id };
  },

  /** Registra/atualiza uma venda de fora (loja virtual, balcão...). */
  async 'POST /api/v1/orders'(orgId, b) {
    if (!b.external_id) throw new HttpError(400, 'informe "external_id"');
    let contactId = null;
    if (b.customer?.phone || b.customer?.email) {
      const phone = digits(b.customer.phone);
      const c = await upsertContact(orgId, {
        channel: phone ? 'whatsapp' : 'api', externalId: phone || String(b.customer.email).toLowerCase(),
        name: str(b.customer.name, 120), phone: phone ? `+${phone}` : null, email: str(b.customer.email, 200),
      });
      contactId = c.id;
    }
    const existing = await db.one('orders', { org_id: eq(orgId), source: 'eq.api', external_id: eq(b.external_id), select: 'id' });
    const [o] = await db.upsert('orders', {
      org_id: orgId, source: 'api', external_id: str(b.external_id, 100), contact_id: contactId,
      status: str(b.status || 'paid', 40), total_cents: cents(b.total) || 0,
      items: (Array.isArray(b.items) ? b.items : []).slice(0, 200).map((i) => ({ title: str(i.title, 200), sku: str(i.sku, 80), quantity: Number(i.quantity) || 1, unitPrice: Number(i.price) || 0 })),
      buyer: b.customer || {}, updated_at: new Date().toISOString(),
    }, 'org_id,source,external_id');
    await emit(orgId, existing ? 'order.updated' : 'order.created', { order: o });
    return { id: o.id };
  },

  /** Cria/atualiza contato no CRM. */
  async 'POST /api/v1/contacts'(orgId, b) {
    const phone = digits(b.phone);
    if (!phone && !b.email) throw new HttpError(400, 'informe "phone" ou "email"');
    const c = await upsertContact(orgId, {
      channel: phone ? 'whatsapp' : 'api', externalId: phone || String(b.email).toLowerCase(),
      name: str(b.name, 120), phone: phone ? `+${phone}` : null, email: str(b.email, 200),
    });
    const patch = {};
    if (b.stage) patch.stage = b.stage;
    if (Array.isArray(b.tags)) patch.tags = b.tags.slice(0, 20).map((t) => str(t, 40));
    if (b.notes) patch.notes = str(b.notes, 5000);
    if (Object.keys(patch).length) await db.update('contacts', { id: eq(c.id) }, patch);
    return { id: c.id };
  },

  /** Produtos em massa: { products: [{ sku, name, price, stock, description }] } (até 500) */
  async 'POST /api/v1/products'(orgId, b) {
    const list = Array.isArray(b.products) ? b.products : [b];
    if (!list.length || list.length > 500) throw new HttpError(400, 'envie de 1 a 500 produtos');
    const rows = list.map((p) => {
      if (!p.sku || !p.name) throw new HttpError(400, 'cada produto precisa de "sku" e "name"');
      return {
        org_id: orgId, source: 'manual', external_id: str(p.sku, 80), sku: str(p.sku, 80), name: str(p.name, 300),
        description: str(p.description, 5000) || '', price_cents: cents(p.price), stock: p.stock ?? null, active: p.active !== false,
        updated_at: new Date().toISOString(),
      };
    });
    await db.upsert('products', rows, 'org_id,source,external_id');
    return { saved: rows.length };
  },

  async 'GET /api/v1/orders'(orgId, _b, q) {
    const limit = Math.min(Number(q.get('limit')) || 50, 200);
    return db.select('orders', { org_id: eq(orgId), select: 'id,source,external_id,status,total_cents,items,nfe_status,created_at', order: 'created_at.desc', limit });
  },
};

export async function handleApi(req, res, url, readJson) {
  const route = routes[`${req.method} ${url.pathname}`];
  const reply = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  if (!route) return reply(404, { error: 'rota não encontrada' });
  try {
    const orgId = await auth(req.headers.authorization);
    const body = req.method === 'GET' ? {} : await readJson();
    reply(200, { data: await route(orgId, body, url.searchParams) });
  } catch (err) {
    reply(err.status || 500, { error: err.status ? err.message : 'erro interno' });
    if (!err.status) console.error('[api]', err);
  }
}
