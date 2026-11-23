// Fila no Postgres (tabela jobs). Webhooks só enfileiram; o processamento é aqui.
import { db, eq } from './db.js';

const log = (...a) => console.log(new Date().toISOString(), '[fila]', ...a);

/** Enfileira. dedupeKey evita processar o mesmo evento duas vezes. */
export async function enqueue(kind, orgId, payload = {}, dedupeKey = null, delaySec = 0) {
  const row = {
    kind,
    org_id: orgId,
    payload,
    dedupe_key: dedupeKey,
    run_after: new Date(Date.now() + delaySec * 1000).toISOString(),
  };
  if (dedupeKey) return db.upsert('jobs', row, 'dedupe_key', { ignore: true });
  return db.insert('jobs', row);
}

const MAX_ATTEMPTS = 5;

export async function runOnce(handlers) {
  const [job] = (await db.rpc('claim_job')) || [];
  if (!job) return false;
  const handler = handlers[job.kind];
  try {
    if (!handler) throw new Error(`sem handler para ${job.kind}`);
    await handler(job.payload, job);
    await db.update('jobs', { id: eq(job.id) }, { status: 'done', last_error: null, updated_at: new Date().toISOString() });
  } catch (err) {
    const final = job.attempts >= MAX_ATTEMPTS || err.permanent;
    log(`job ${job.id} ${job.kind} falhou (tentativa ${job.attempts}): ${err.message}`);
    await db.update('jobs', { id: eq(job.id) }, {
      status: final ? 'failed' : 'pending',
      last_error: String(err.message).slice(0, 1000),
      // espera crescente: 30s, 2min, 8min, 32min
      run_after: new Date(Date.now() + 30_000 * 4 ** (job.attempts - 1)).toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return true;
}

/** Erro que não adianta tentar de novo (dados inválidos, sem permissão...). */
export function permanent(message) {
  const e = new Error(message);
  e.permanent = true;
  return e;
}

export function startLoop(handlers, { concurrency = 3, idleMs = 1500 } = {}) {
  let stopped = false;
  const lane = async () => {
    while (!stopped) {
      let worked = false;
      try {
        worked = await runOnce(handlers);
      } catch (err) {
        log('erro ao buscar job:', err.message);
      }
      if (!worked) await new Promise((r) => setTimeout(r, idleMs));
    }
  };
  for (let i = 0; i < concurrency; i++) lane();
  return () => (stopped = true);
}
