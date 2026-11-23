// Banco falso em memória que imita o básico do PostgREST, e um fetch falso.
import { randomUUID } from 'node:crypto';

function match(row, q) {
  for (const [k, v] of Object.entries(q)) {
    if (['select', 'order', 'limit', 'on_conflict', 'or'].includes(k)) continue;
    const s = String(v);
    const val = row[k];
    if (s.startsWith('eq.')) { if (String(val) !== s.slice(3)) return false; }
    else if (s.startsWith('neq.')) { if (String(val) === s.slice(4)) return false; }
    else if (s === 'is.true') { if (val !== true) return false; }
    else if (s.startsWith('in.(')) {
      const list = s.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, ''));
      if (!list.includes(String(val))) return false;
    }
  }
  if (q.or) {
    // suporta "(a.eq.1,b.eq.2)"
    const parts = String(q.or).slice(1, -1).split(',').map((p) => p.split('.eq.'));
    if (!parts.some(([f, v]) => String(row[f]) === v)) return false;
  }
  return true;
}

const DEFAULTS = {
  contacts: () => ({ stage: 'lead', tags: [], notes: '', value_cents: 0 }),
  conversations: () => ({ ai_paused: false, meta: {}, status: 'open', kind: 'chat' }),
  drafts: () => ({ status: 'pending', reply: '' }),
  orders: () => ({ nfe_status: 'none', items: [], buyer: {} }),
  jobs: () => ({ status: 'pending', attempts: 0 }),
  products: () => ({ active: true, attributes: {} }),
  webhook_endpoints: () => ({ active: true }),
};

export function fakeDb(seed = {}) {
  const t = {};
  const table = (n) => (t[n] ??= []);
  for (const [n, rows] of Object.entries(seed)) t[n] = rows.map((r) => ({ ...r }));
  let jobSeq = 1;
  const fill = (name, r) => ({
    ...(DEFAULTS[name]?.() || {}),
    id: name === 'jobs' ? jobSeq++ : randomUUID(),
    created_at: new Date().toISOString(),
    ...r,
  });
  const upsertOne = (name, r, conflict, ignore) => {
    const keys = conflict.split(',');
    const found = table(name).find((x) => keys.every((k) => String(x[k]) === String(r[k])));
    if (found) {
      if (ignore) return null;
      Object.assign(found, r);
      return found;
    }
    const row = fill(name, r);
    table(name).push(row);
    return row;
  };
  const sortLimit = (rows, q) => {
    let out = [...rows];
    if (q.order) {
      const [f, dir] = q.order.split('.');
      out.sort((a, b) => (a[f] > b[f] ? 1 : -1) * (dir === 'desc' ? -1 : 1));
    }
    return q.limit ? out.slice(0, Number(q.limit)) : out;
  };
  const db = {
    tables: t,
    async select(name, q = {}) { return sortLimit(table(name).filter((r) => match(r, q)), q); },
    async one(name, q = {}) { return (await db.select(name, { ...q, limit: 1 }))[0] ?? null; },
    async insert(name, rows) { return [].concat(rows).map((r) => { const row = fill(name, r); table(name).push(row); return row; }); },
    async upsert(name, rows, conflict, { ignore = false } = {}) { return [].concat(rows).map((r) => upsertOne(name, r, conflict, ignore)).filter(Boolean); },
    async update(name, q, patch) { const rows = table(name).filter((r) => match(r, q)); rows.forEach((r) => Object.assign(r, patch)); return rows; },
    async remove(name, q) { t[name] = table(name).filter((r) => !match(r, q)); return null; },
    async rpc(fn, args) {
      if (fn === 'claim_job') {
        const j = table('jobs').find((x) => x.status === 'pending' && new Date(x.run_after || 0) <= new Date());
        if (!j) return [];
        j.status = 'processing';
        j.attempts++;
        return [{ ...j }];
      }
      if (fn === 'bump_usage') {
        const month = `${new Date().toISOString().slice(0, 7)}-01`;
        let u = table('usage_monthly').find((x) => x.org_id === args.p_org && x.month === month);
        if (!u) table('usage_monthly').push((u = { org_id: args.p_org, month, ai_replies: 0, messages_in: 0, messages_out: 0 }));
        u[args.p_field] += args.p_n;
        return u[args.p_field];
      }
      if (fn === 'search_products') return table('products').filter((p) => p.org_id === args.p_org).slice(0, args.p_limit);
      throw new Error(`rpc ${fn} não simulada`);
    },
  };
  return db;
}

/** fetch falso: rotas por prefixo de URL → função (url, opts) que retorna objeto JSON ou Response. */
export function fakeFetch(routes) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return real(url, opts);
    calls.push({ url: u, opts });
    const key = Object.keys(routes).find((p) => u.startsWith(p));
    if (!key) throw new Error(`fetch não simulado: ${u}`);
    const out = await routes[key](u, opts);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}
