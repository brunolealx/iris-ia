// Servidor HTTP do worker: webhooks (Meta, Mercado Livre, Mercado Pago) e API pública.
// Regra de ouro: responder 200 na hora e mandar o trabalho para a fila.
import { createServer } from 'node:http';
import { config } from './config.js';
import { enqueue } from './queue.js';
import { handleApi } from './api.js';
import * as wa from './channels/whatsapp.js';
import * as mp from './channels/mercadopago.js';

const log = (...a) => console.log(new Date().toISOString(), '[http]', ...a);
const MAX_BODY = 2 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('corpo muito grande'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const send = (res, status, body = '') => {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
};

/** Executa depois de responder: erros só vão para o log. */
const later = (fn) => setImmediate(() => fn().catch((e) => log('erro ao enfileirar:', e.message)));

// Diagnóstico simples (em memória) para depurar a integração sem abrir os logs
const stats = { started: new Date().toISOString(), waPosts: 0, waSigFail: 0, waLastPost: null, waLastSigFail: null, waLastMessages: 0 };
const isAdmin = (url) => Boolean(config.meta.verifyToken) && url.searchParams.get('key') === config.meta.verifyToken;

export async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (p === '/' || p === '/health') return send(res, 200, 'Iris worker ok');

  // ---------- Administração (protegida pelo WA_VERIFY_TOKEN) ----------
  if (p === '/admin/status' && req.method === 'GET') {
    if (!isAdmin(url)) return send(res, 403, 'chave inválida');
    return send(res, 200, JSON.stringify({ ...stats, metaSecret: Boolean(config.meta.appSecret), claudeKey: Boolean(config.anthropicKey), publicUrl: config.publicUrl || null }, null, 2));
  }
  // Assina o campo "messages" do webhook do WhatsApp no app da Meta, sem precisar achar a tela no painel.
  if (p === '/admin/meta-subscribe' && req.method === 'GET') {
    if (!isAdmin(url)) return send(res, 403, 'chave inválida');
    const appId = (url.searchParams.get('app_id') || '').replace(/\D/g, '');
    if (!appId || !config.meta.appSecret || !config.publicUrl) return send(res, 400, 'faltam app_id, META_APP_SECRET ou PUBLIC_URL');
    const body = new URLSearchParams({
      object: 'whatsapp_business_account',
      callback_url: `${config.publicUrl}/webhooks/whatsapp`,
      verify_token: config.meta.verifyToken,
      fields: 'messages',
      include_values: 'true',
      access_token: `${appId}|${config.meta.appSecret}`,
    });
    const r = await fetch(`https://graph.facebook.com/${config.meta.graphVersion}/${appId}/subscriptions`, { method: 'POST', body });
    const out = await r.text();
    const check = await fetch(`https://graph.facebook.com/${config.meta.graphVersion}/${appId}/subscriptions?access_token=${encodeURIComponent(`${appId}|${config.meta.appSecret}`)}`).then((x) => x.text()).catch(() => '');
    return send(res, r.ok ? 200 : 400, `assinatura: ${out}\n\natual: ${check}`);
  }

  // ---------- WhatsApp (Meta) ----------
  if (p === '/webhooks/whatsapp') {
    if (req.method === 'GET') {
      const ch = wa.verifyChallenge(url.searchParams);
      return ch ? send(res, 200, ch) : send(res, 403, 'token inválido');
    }
    if (req.method === 'POST') {
      const raw = await readBody(req);
      stats.waPosts++;
      stats.waLastPost = new Date().toISOString();
      if (!wa.verifySignature(raw, req.headers['x-hub-signature-256'])) {
        stats.waSigFail++;
        stats.waLastSigFail = stats.waLastPost;
        log('webhook WhatsApp recusado: assinatura inválida (confira META_APP_SECRET)');
        return send(res, 401, 'assinatura inválida');
      }
      send(res, 200, 'ok');
      later(async () => {
        const { messages } = wa.parseWebhook(JSON.parse(raw));
        stats.waLastMessages = messages.length;
        for (const m of messages) await enqueue('wa.message', null, m, `wa:${m.id}`);
      });
      return;
    }
  }

  // ---------- Mercado Livre ----------
  if (p === '/webhooks/mercadolivre' && req.method === 'POST') {
    const raw = await readBody(req);
    send(res, 200, 'ok'); // o ML exige 200 em até 500 ms
    later(async () => {
      const n = JSON.parse(raw);
      if (config.ml.clientId && String(n.application_id) !== String(config.ml.clientId)) return;
      if (!n.resource || !n.user_id || !n.topic) return;
      // o ML reenvia a mesma notificação (mesmo _id) se não receber o 200: dedupe por _id
      const key = n._id ? `ml:${n._id}` : `ml:${n.topic}:${n.resource}:${n.sent || ''}`;
      await enqueue('ml.notification', null, { topic: n.topic, resource: n.resource, user_id: n.user_id }, key);
    });
    return;
  }

  // ---------- Mercado Pago (assinaturas) ----------
  if (p === '/webhooks/mercadopago' && req.method === 'POST') {
    const raw = await readBody(req);
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {}
    const dataId = url.searchParams.get('data.id') || body?.data?.id;
    const ok = mp.verifySignature({ signature: req.headers['x-signature'], requestId: req.headers['x-request-id'], dataId });
    if (!ok) return send(res, 401, 'assinatura inválida');
    send(res, 200, 'ok');
    const type = url.searchParams.get('type') || body.type;
    if (type === 'subscription_preapproval' && dataId) later(() => enqueue('mp.subscription', null, { id: dataId }, `mp:${dataId}:${req.headers['x-request-id'] || Date.now()}`));
    return;
  }

  // ---------- API pública ----------
  if (p.startsWith('/api/v1/')) {
    return handleApi(req, res, url, async () => {
      try {
        return JSON.parse((await readBody(req)).toString() || '{}');
      } catch {
        throw Object.assign(new Error('JSON inválido'), { status: 400 });
      }
    });
  }

  return send(res, 404, 'não encontrado');
}

export function createApp() {
  return createServer((req, res) =>
    handle(req, res).catch((err) => {
      log('erro:', err.message);
      if (!res.headersSent) send(res, err.status || 500, 'erro');
    })
  );
}
