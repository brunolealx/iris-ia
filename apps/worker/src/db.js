// Cliente mínimo da API REST do Supabase (PostgREST) usando fetch.
// Usa a service_role: só roda no servidor.
import { config } from './config.js';

export class DbError extends Error {}

function headers(prefer) {
  return {
    apikey: config.supabaseKey,
    authorization: `Bearer ${config.supabaseKey}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

async function call(method, path, body, prefer) {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: headers(prefer),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new DbError(`Supabase ${method} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** Monta a query do PostgREST: { org_id: 'eq.123', select: '*' } */
const qs = (q = {}) => new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined)).toString();

export const eq = (v) => `eq.${v}`;

const realDb = {
  select: (table, q) => call('GET', `${table}?${qs(q)}`),
  async one(table, q) {
    const rows = await call('GET', `${table}?${qs({ ...q, limit: 1 })}`);
    return rows?.[0] ?? null;
  },
  insert: (table, rows, q) => call('POST', `${table}?${qs(q)}`, rows, 'return=representation'),
  /** Insere ou atualiza pela restrição única informada em onConflict. */
  upsert: (table, rows, onConflict, { ignore = false } = {}) =>
    call('POST', `${table}?${qs({ on_conflict: onConflict })}`, rows, `return=representation,resolution=${ignore ? 'ignore' : 'merge'}-duplicates`),
  update: (table, q, patch) => call('PATCH', `${table}?${qs(q)}`, patch, 'return=representation'),
  remove: (table, q) => call('DELETE', `${table}?${qs(q)}`),
  rpc: (fn, args = {}) => call('POST', `rpc/${fn}`, args),
};

let impl = realDb;
/** Permite trocar o banco por um falso nos testes. */
export function setDb(fake) {
  impl = fake || realDb;
}

export const db = new Proxy({}, { get: (_, k) => impl[k] });
