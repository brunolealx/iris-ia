// Banco SQLite embutido no Node (node:sqlite) — sem dependências externas.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let db;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;

    -- Fila de trabalhos vindos dos webhooks
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,           -- whatsapp | mercadolivre
      kind TEXT NOT NULL,              -- message | question | ml_message
      payload TEXT NOT NULL,           -- JSON
      dedupe_key TEXT UNIQUE,          -- evita processar o mesmo evento duas vezes
      status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      run_after TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, run_after);

    -- Histórico das conversas (contexto para o Claude)
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      contact TEXT NOT NULL,           -- telefone, id do comprador ou id do pack
      direction TEXT NOT NULL,         -- in | out
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(channel, contact, id);

    -- Respostas aguardando sua aprovação no painel
    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      target TEXT NOT NULL,            -- JSON com o destino (telefone, question_id, pack...)
      contact_name TEXT,
      customer_text TEXT NOT NULL,
      reply TEXT NOT NULL,
      reason TEXT,                     -- por que foi para aprovação
      status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | discarded | error
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Chave/valor (tokens do Mercado Livre, contadores)
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Banco não aberto: chame openDb() primeiro');
  return db;
}

// ---------- Fila ----------

/** Enfileira um trabalho. Retorna false se já existia (duplicado). */
export function enqueue(channel, kind, payload, dedupeKey = null) {
  const r = getDb()
    .prepare('INSERT OR IGNORE INTO jobs (channel, kind, payload, dedupe_key) VALUES (?, ?, ?, ?)')
    .run(channel, kind, JSON.stringify(payload), dedupeKey);
  return r.changes > 0;
}

/** Pega o próximo trabalho pendente e marca como em processamento. */
export function claimNextJob() {
  const d = getDb();
  const job = d
    .prepare(`SELECT * FROM jobs WHERE status = 'pending' AND run_after <= datetime('now') ORDER BY id LIMIT 1`)
    .get();
  if (!job) return null;
  const r = d
    .prepare(`UPDATE jobs SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ? AND status = 'pending'`)
    .run(job.id);
  if (r.changes === 0) return null;
  return { ...job, attempts: job.attempts + 1, payload: JSON.parse(job.payload) };
}

export function finishJob(id) {
  getDb().prepare(`UPDATE jobs SET status = 'done', last_error = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
}

export function failJob(id, error, attempts, maxAttempts = 3) {
  const final = attempts >= maxAttempts;
  const delaySec = 30 * attempts; // 30s, 60s...
  getDb()
    .prepare(
      `UPDATE jobs SET status = ?, last_error = ?, run_after = datetime('now', ?), updated_at = datetime('now') WHERE id = ?`
    )
    .run(final ? 'failed' : 'pending', String(error).slice(0, 1000), `+${delaySec} seconds`, id);
}

/** Na inicialização, devolve para a fila o que ficou preso em "processing". */
export function resetStuckJobs() {
  getDb().prepare(`UPDATE jobs SET status = 'pending' WHERE status = 'processing'`).run();
}

// ---------- Histórico ----------

export function addMessage(channel, contact, direction, text) {
  getDb().prepare('INSERT INTO messages (channel, contact, direction, text) VALUES (?, ?, ?, ?)').run(channel, contact, direction, text);
}

export function recentMessages(channel, contact, limit = 12) {
  return getDb()
    .prepare('SELECT direction, text FROM messages WHERE channel = ? AND contact = ? ORDER BY id DESC LIMIT ?')
    .all(channel, contact, limit)
    .reverse();
}

// ---------- Rascunhos ----------

export function createDraft({ channel, target, contactName, customerText, reply, reason }) {
  return getDb()
    .prepare('INSERT INTO drafts (channel, target, contact_name, customer_text, reply, reason) VALUES (?, ?, ?, ?, ?, ?)')
    .run(channel, JSON.stringify(target), contactName || null, customerText, reply, reason || null).lastInsertRowid;
}

export function listDrafts(status = 'pending', limit = 100) {
  return getDb()
    .prepare('SELECT * FROM drafts WHERE status = ? ORDER BY id DESC LIMIT ?')
    .all(status, limit)
    .map((d) => ({ ...d, target: JSON.parse(d.target) }));
}

export function getDraft(id) {
  const d = getDb().prepare('SELECT * FROM drafts WHERE id = ?').get(id);
  return d ? { ...d, target: JSON.parse(d.target) } : null;
}

export function updateDraft(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  getDb()
    .prepare(`UPDATE drafts SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
}

// ---------- Chave/valor ----------

export function kvGet(key) {
  const r = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key);
  return r ? JSON.parse(r.value) : null;
}

export function kvSet(key, value) {
  getDb()
    .prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

/** Contador diário de chamadas ao Claude (trava de custo). Retorna o novo total. */
export function bumpDailyCounter(name) {
  const key = `${name}:${new Date().toISOString().slice(0, 10)}`;
  const n = (kvGet(key) || 0) + 1;
  kvSet(key, n);
  return n;
}

export function getDailyCounter(name) {
  return kvGet(`${name}:${new Date().toISOString().slice(0, 10)}`) || 0;
}

export function stats() {
  const d = getDb();
  return {
    pendingDrafts: d.prepare(`SELECT COUNT(*) n FROM drafts WHERE status = 'pending'`).get().n,
    pendingJobs: d.prepare(`SELECT COUNT(*) n FROM jobs WHERE status IN ('pending','processing')`).get().n,
    failedJobs: d.prepare(`SELECT COUNT(*) n FROM jobs WHERE status = 'failed'`).get().n,
    claudeCallsToday: getDailyCounter('claude_calls'),
  };
}
