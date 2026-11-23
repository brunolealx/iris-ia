// Webhooks de saída: avisa o sistema do cliente sobre eventos da Iris.
// Cada POST leva o header X-Iris-Signature: sha256=<HMAC do corpo com o segredo do endpoint>.
import { db, eq } from '../db.js';
import { hmacHex } from '../shared.js';
import { permanent } from '../queue.js';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Bloqueia URLs que apontam para a rede interna (proteção contra SSRF). */
export function isPrivateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function assertPublicUrl(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw permanent('webhook precisa ser https');
  const addrs = await lookup(u.hostname, { all: true });
  if (addrs.some((a) => isPrivateAddress(a.address))) throw permanent('webhook aponta para endereço interno');
}

export async function dispatchWebhook({ endpointId, event, data, at }, job) {
  const ep = await db.one('webhook_endpoints', { id: eq(endpointId), org_id: eq(job.org_id), select: '*' });
  if (!ep || !ep.active) return;
  await assertPublicUrl(ep.url);
  const body = JSON.stringify({ event, data, sent_at: at, delivery: job.id });
  let status = null;
  let error = null;
  try {
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Iris-Webhooks/1.0',
        'x-iris-event': event,
        'x-iris-signature': `sha256=${hmacHex(ep.secret, body)}`,
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (e) {
    error = e.message;
  }
  await db.insert('webhook_deliveries', { org_id: job.org_id, endpoint_id: ep.id, event, status_code: status, error });
  if (error) {
    if (status && status >= 400 && status < 500 && status !== 429) throw permanent(`webhook recusado: ${error}`);
    throw new Error(`webhook falhou: ${error}`); // tenta de novo com espera crescente
  }
}
