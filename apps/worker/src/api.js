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
    const query = { org_id: eq(orgId), select: 'id,source,external_id,status,total_cents,items,nfe_status,created_at', order: 'created_at.desc', limit: lim(q) };
    if (q.get('status')) query.status = eq(q.get('status'));
    return db.select('orders', query);
  },

  // ---------- leitura e ações usadas pelo MCP da Iris ----------

  /** Resumo da conta: conversas abertas, sugestões pendentes, funil e vendas recentes. */
  async 'GET /api/v1/summary'(orgId) {
    const [open, drafts, contacts, orders] = await Promise.all([
      db.select('conversations', { org_id: eq(orgId), status: 'eq.open', select: 'id,channel,ai_paused', limit: 1000 }),
      db.select('drafts', { org_id: eq(orgId), status: 'eq.pending', select: 'id', limit: 1000 }),
      db.select('contacts', { org_id: eq(orgId), select: 'stage', limit: 5000 }),
      db.select('orders', { org_id: eq(orgId), select: 'total_cents,created_at', order: 'created_at.desc', limit: 1000 }),
    ]);
    const funnel = {};
    for (const c of contacts) funnel[c.stage] = (funnel[c.stage] || 0) + 1;
    const since = Date.now() - 30 * 864e5;
    const recent = orders.filter((o) => new Date(o.created_at).getTime() >= since);
    return {
      open_conversations: open.length,
      waiting_human: open.filter((c) => c.ai_paused).length,
      pending_drafts: drafts.length,
      funnel,
      orders_30d: recent.length,
      revenue_30d: recent.reduce((t, o) => t + (o.total_cents || 0), 0) / 100,
    };
  },

  /** Contatos do CRM. Filtros: stage, q (nome, telefone ou e-mail), limit. */
  async 'GET /api/v1/contacts'(orgId, _b, q) {
    const query = { org_id: eq(orgId), select: CONTACT_FIELDS, order: 'last_message_at.desc.nullslast', limit: q.get('q') ? 1000 : lim(q) };
    if (q.get('stage')) query.stage = eq(stageOf(q.get('stage')));
    let rows = await db.select('contacts', query);
    const term = norm(q.get('q'));
    if (term) rows = rows.filter((c) => [c.name, c.phone, c.email].some((v) => norm(v).includes(term))).slice(0, lim(q));
    return rows;
  },

  async 'GET /api/v1/contacts/:id'(orgId, _b, _q, id) {
    return mustFind('contacts', orgId, id, CONTACT_FIELDS);
  },

  /** Move no funil, troca etiquetas ou anotações. */
  async 'PATCH /api/v1/contacts/:id'(orgId, b, _q, id) {
    await mustFind('contacts', orgId, id, 'id');
    const patch = {};
    if (b.stage) patch.stage = stageOf(b.stage);
    if (Array.isArray(b.tags)) patch.tags = b.tags.slice(0, 20).map((t) => str(t, 40));
    if (b.notes != null) patch.notes = str(b.notes, 5000);
    if (b.name) patch.name = str(b.name, 120);
    if (!Object.keys(patch).length) throw new HttpError(400, 'nada para atualizar: envie stage, tags, notes ou name');
    const [c] = await db.update('contacts', { id: eq(id), org_id: eq(orgId) }, patch);
    return c;
  },

  /** Conversas. Filtros: status (open|closed), channel (whatsapp|mercadolivre), limit. */
  async 'GET /api/v1/conversations'(orgId, _b, q) {
    const query = { org_id: eq(orgId), select: 'id,contact_id,channel,kind,status,ai_paused,last_message_at', order: 'last_message_at.desc', limit: lim(q) };
    if (q.get('status')) query.status = eq(q.get('status'));
    if (q.get('channel')) query.channel = eq(q.get('channel'));
    const convs = await db.select('conversations', query);
    const ids = [...new Set(convs.map((c) => c.contact_id).filter(Boolean))];
    const contacts = ids.length ? await db.select('contacts', { org_id: eq(orgId), id: `in.(${ids.join(',')})`, select: 'id,name,phone' }) : [];
    const byId = Object.fromEntries(contacts.map((c) => [c.id, c]));
    return convs.map((c) => ({ ...c, contact: byId[c.contact_id] || null }));
  },

  /** Histórico de mensagens de uma conversa (mais antigas primeiro). */
  async 'GET /api/v1/conversations/:id/messages'(orgId, _b, q, id) {
    await mustFind('conversations', orgId, id, 'id');
    const rows = await db.select('messages', { org_id: eq(orgId), conversation_id: eq(id), select: 'direction,author,text,created_at', order: 'created_at.desc', limit: lim(q) });
    return rows.reverse();
  },

  /** Responde numa conversa existente (WhatsApp ou Mercado Livre) como atendente. */
  async 'POST /api/v1/conversations/:id/reply'(orgId, b, _q, id) {
    if (!b.text) throw new HttpError(400, 'informe "text"');
    await mustFind('conversations', orgId, id, 'id');
    await enqueue('outbound.send', orgId, { conversationId: id, text: str(b.text, 4000) });
    return { queued: true };
  },

  /** Pausa ou devolve a conversa para a IA: { paused: true|false }. Também aceita { status: "closed" }. */
  async 'PATCH /api/v1/conversations/:id'(orgId, b, _q, id) {
    await mustFind('conversations', orgId, id, 'id');
    const patch = {};
    if (typeof b.ai_paused === 'boolean') patch.ai_paused = b.ai_paused;
    if (b.status === 'open' || b.status === 'closed') patch.status = b.status;
    if (!Object.keys(patch).length) throw new HttpError(400, 'envie "ai_paused" (true/false) ou "status" (open/closed)');
    const [c] = await db.update('conversations', { id: eq(id), org_id: eq(orgId) }, patch);
    return { id: c.id, ai_paused: c.ai_paused, status: c.status };
  },

  /** Sugestões da IA esperando aprovação. */
  async 'GET /api/v1/drafts'(orgId, _b, q) {
    return db.select('drafts', { org_id: eq(orgId), status: eq(q.get('status') || 'pending'), select: 'id,conversation_id,customer_text,reply,reason,status,created_at', order: 'created_at.desc', limit: lim(q) });
  },

  /** Aprova e envia a sugestão (opcionalmente com texto editado): { text? } */
  async 'POST /api/v1/drafts/:id/approve'(orgId, b, _q, id) {
    const d = await mustFind('drafts', orgId, id, 'id,status,reply');
    if (d.status === 'sent') throw new HttpError(409, 'essa sugestão já foi enviada');
    const text = str(b.text ?? d.reply, 4000);
    if (!String(text || '').trim()) throw new HttpError(400, 'a sugestão está vazia: envie "text"');
    await db.update('drafts', { id: eq(id), org_id: eq(orgId) }, { status: 'queued', reply: text, updated_at: new Date().toISOString() });
    await enqueue('outbound.send', orgId, { draftId: id, text });
    return { queued: true };
  },

  async 'POST /api/v1/drafts/:id/discard'(orgId, _b, _q, id) {
    await mustFind('drafts', orgId, id, 'id');
    await db.update('drafts', { id: eq(id), org_id: eq(orgId) }, { status: 'discarded', updated_at: new Date().toISOString() });
    return { discarded: true };
  },

  /** Catálogo. Filtros: q (busca), limit. */
  async 'GET /api/v1/products'(orgId, _b, q) {
    const fields = ({ id, source, sku, name, price_cents, stock, active, ml_item_id }) => ({ id, source, sku, name, price: price_cents == null ? null : price_cents / 100, stock, active, ml_item_id });
    if (q.get('q')) return (await db.rpc('search_products', { p_org: orgId, p_query: str(q.get('q'), 200), p_limit: lim(q) })).map(fields);
    return (await db.select('products', { org_id: eq(orgId), select: 'id,source,sku,name,price_cents,stock,active,ml_item_id', order: 'updated_at.desc', limit: lim(q) })).map(fields);
  },
};

const CONTACT_FIELDS = 'id,channel,name,phone,email,stage,tags,notes,value_cents,last_message_at,created_at';
const STAGES = ['lead', 'negociacao', 'cliente', 'pos_venda', 'perdido'];
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const lim = (q) => Math.min(Math.max(Number(q.get('limit')) || 50, 1), 200);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stageOf(v) {
  const s = norm(v).replace(/[\s-]+/g, '_').replace('negociando', 'negociacao').replace('posvenda', 'pos_venda');
  if (!STAGES.includes(s)) throw new HttpError(400, `etapa inválida: use ${STAGES.join(', ')}`);
  return s;
}

async function mustFind(table, orgId, id, select) {
  if (!UUID.test(id)) throw new HttpError(400, 'id inválido');
  const row = await db.one(table, { id: eq(id), org_id: eq(orgId), select });
  if (!row) throw new HttpError(404, 'não encontrado nesta conta');
  return row;
}

/** Acha a rota, aceitando :id no caminho. */
function findRoute(method, path) {
  if (routes[`${method} ${path}`]) return { fn: routes[`${method} ${path}`] };
  for (const key of Object.keys(routes)) {
    const [m, pattern] = key.split(' ');
    if (m !== method || !pattern.includes(':id')) continue;
    const re = new RegExp(`^${pattern.replace(':id', '([^/]+)')}$`);
    const hit = path.match(re);
    if (hit) return { fn: routes[key], id: decodeURIComponent(hit[1]) };
  }
  return null;
}

export async function handleApi(req, res, url, readJson) {
  const route = findRoute(req.method, url.pathname);
  const reply = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  if (!route) return reply(404, { error: 'rota não encontrada' });
  try {
    const orgId = await auth(req.headers.authorization);
    const body = req.method === 'GET' ? {} : await readJson();
    reply(200, { data: await route.fn(orgId, body, url.searchParams, route.id) });
  } catch (err) {
    reply(err.status || 500, { error: err.status ? err.message : 'erro interno' });
    if (!err.status) console.error('[api]', err);
  }
}
