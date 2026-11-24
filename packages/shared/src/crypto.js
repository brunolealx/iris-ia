// Criptografia dos segredos das integrações (tokens do ML, WhatsApp, Google e certificado da NFS-e).
// AES-256-GCM com chave de 32 bytes em base64 (ENCRYPTION_KEY).
// Gere uma chave com:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';

function key(b64) {
  const k = Buffer.from(b64 || '', 'base64');
  if (k.length !== 32) throw new Error('ENCRYPTION_KEY precisa ter 32 bytes em base64');
  return k;
}

export function encryptJson(obj, keyB64) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(keyB64), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptJson(text, keyB64) {
  const [v, iv, tag, data] = String(text).split(':');
  if (v !== 'v1') throw new Error('formato de segredo desconhecido');
  const d = createDecipheriv('aes-256-gcm', key(keyB64), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
}

// ---------- Chave da API pública ----------
// Formato: iris_<prefixo 8>_<segredo 32>. Guardamos só o prefixo e o hash.
export function newApiKey() {
  const prefix = randomBytes(4).toString('hex');
  const secret = randomBytes(24).toString('base64url');
  const full = `iris_${prefix}_${secret}`;
  return { full, prefix, hash: sha256(full) };
}

export function parseApiKey(full) {
  const m = /^iris_([a-f0-9]{8})_[\w-]{20,}$/.exec(String(full || ''));
  return m ? { prefix: m[1], hash: sha256(full) } : null;
}

export function sha256(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

export function hmacHex(secret, body) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ''), 'hex');
  const y = Buffer.from(String(b || ''), 'hex');
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}
