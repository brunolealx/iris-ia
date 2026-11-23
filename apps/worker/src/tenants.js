// Descobre de qual cliente (organização) é cada evento e carrega plano/segredos.
import { db, eq } from './db.js';
import { config } from './config.js';
import { decryptJson, encryptJson } from './shared.js';

const cache = new Map(); // org_id -> { at, org, plan }
const TTL = 30_000;

export async function loadOrg(orgId) {
  const c = cache.get(orgId);
  if (c && Date.now() - c.at < TTL) return c;
  const org = await db.one('organizations', { id: eq(orgId), select: '*' });
  if (!org) throw new Error(`organização ${orgId} não existe`);
  const plan = await db.one('plans', { id: eq(org.plan_id), select: '*' });
  const v = { at: Date.now(), org, plan };
  cache.set(orgId, v);
  return v;
}

export function forgetOrg(orgId) {
  cache.delete(orgId);
}

/** Integração pelo id externo: phone_number_id (WhatsApp) ou user_id do vendedor (ML). */
export function integrationByExternal(provider, externalId) {
  return db.one('integrations', { provider: eq(provider), external_id: eq(externalId), status: 'neq.disconnected', select: '*' });
}

export function integrationOf(orgId, provider) {
  return db.one('integrations', { org_id: eq(orgId), provider: eq(provider), select: '*' });
}

export async function getSecret(integrationId) {
  const s = await db.one('integration_secrets', { integration_id: eq(integrationId), select: 'ciphertext' });
  if (!s) throw new Error('segredo da integração não encontrado');
  return decryptJson(s.ciphertext, config.encryptionKey);
}

export async function setSecret(integrationId, value) {
  await db.upsert('integration_secrets', { integration_id: integrationId, ciphertext: encryptJson(value, config.encryptionKey), updated_at: new Date().toISOString() }, 'integration_id');
}

export async function markIntegrationError(integrationId, message) {
  await db.update('integrations', { id: eq(integrationId) }, { status: 'error', last_error: String(message).slice(0, 500), updated_at: new Date().toISOString() });
}

/** Org pela chave da API pública. */
export async function orgByApiKey(prefix, hash) {
  const org = await db.one('organizations', { api_key_prefix: eq(prefix), select: 'id,api_key_hash' });
  return org && org.api_key_hash === hash ? org.id : null;
}
