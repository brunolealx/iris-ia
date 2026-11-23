// Servidor HTTP da Iris: webhooks, login do Mercado Livre e painel.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { randomUUID } from 'node:crypto';
import { openDb, enqueue, resetStuckJobs, kvGet, kvSet } from './db.js';
import { startWorker } from './worker.js';
import * as wa from './channels/whatsapp.js';
import * as ml from './channels/mercadolivre.js';
import { checkAuth, renderPanel, sendDraft, discardDraft } from './admin.js';

const log = (...a) => console.log(new Date().toISOString(), '[http]', ...a);
const MAX_BODY = 1024 * 1024; // 1 MB

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('corpo muito grande'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body = '', type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

const redirect = (res, to) => {
  res.writeHead(303, { location: to });
  res.end();
};

// ---------- Rotas ----------

export async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // Saúde (para o serviço de hospedagem saber que está no ar)
  if (path === '/' || path === '/health') return send(res, 200, 'Iris no ar ✨');

  // --- WhatsApp ---
  if (path === '/webhooks/whatsapp') {
    if (!config.whatsapp.enabled) return send(res, 404, 'WhatsApp desligado');
    if (req.method === 'GET') {
      const challenge = wa.verifyChallenge(url.searchParams);
      return challenge ? send(res, 200, challenge) : send(res, 403, 'token inválido');
    }
    if (req.method === 'POST') {
      const raw = await readBody(req);
      if (!wa.verifySignature(raw, req.headers['x-hub-signature-256'])) return send(res, 401, 'assinatura inválida');
      send(res, 200, 'ok'); // responde já; o processamento é na fila
      try {
        for (const m of wa.parseIncoming(JSON.parse(raw))) enqueue('whatsapp', 'message', m, `wa:${m.id}`);
      } catch (err) {
        log('payload WhatsApp inválido:', err.message);
      }
      return;
    }
  }

  // --- Mercado Livre: notificações ---
  if (path === '/webhooks/mercadolivre' && req.method === 'POST') {
    if (!config.mercadolivre.enabled) return send(res, 404, 'Mercado Livre desligado');
    const raw = await readBody(req);
    send(res, 200, 'ok'); // o ML exige 200 em até 500 ms
    try {
      const n = JSON.parse(raw);
      if (config.mercadolivre.clientId && String(n.application_id) !== String(config.mercadolivre.clientId)) {
        return log('notificação ML de outro app ignorada');
      }
      const topic = n.topic;
      if (topic === 'questions') enqueue('mercadolivre', 'question', { resource: n.resource }, `mlq:${n.resource}`);
      else if (topic === 'messages') enqueue('mercadolivre', 'ml_message', { resource: n.resource }, `mlm:${n.resource}`);
      // outros tópicos (orders_v2 etc.) são ignorados por enquanto
    } catch (err) {
      log('payload ML inválido:', err.message);
    }
    return;
  }

  // --- Mercado Livre: login OAuth ---
  if (path.startsWith('/auth/ml') || path.startsWith('/admin')) {
    if (path !== '/auth/ml/callback' && !checkAuth(req.headers.authorization)) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="Iris"' });
      return res.end('Login necessário');
    }
  }

  if (path === '/auth/ml' && req.method === 'GET') {
    const state = randomUUID();
    kvSet('ml_oauth_state', state);
    return redirect(res, `${ml.authorizeUrl()}&state=${state}`);
  }

  if (path === '/auth/ml/callback' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    if (!code) return send(res, 400, 'code ausente');
    const expected = kvGet('ml_oauth_state');
    if (!expected || url.searchParams.get('state') !== expected) return send(res, 403, 'state inválido: comece de novo em /auth/ml');
    kvSet('ml_oauth_state', '');
    try {
      const t = await ml.exchangeCode(code);
      log('Mercado Livre conectado, vendedor', t.user_id);
      return redirect(res, '/admin?ok=ml');
    } catch (err) {
      return send(res, 500, `Falha ao conectar o Mercado Livre: ${err.message}`);
    }
  }

  // --- Painel ---
  if (path === '/admin' && req.method === 'GET') {
    const flash = url.searchParams.get('ok') === 'ml' ? 'Mercado Livre conectado ✅' : url.searchParams.get('msg') || '';
    return send(res, 200, renderPanel(flash), 'text/html; charset=utf-8');
  }

  const m = path.match(/^\/admin\/drafts\/(\d+)\/(send|discard)$/);
  if (m && req.method === 'POST') {
    // proteção contra envio de formulário vindo de outro site (CSRF)
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, 'origem inválida');
    const form = new URLSearchParams((await readBody(req)).toString());
    const msg = m[2] === 'send' ? await sendDraft(Number(m[1]), form.get('text')) : discardDraft(Number(m[1]));
    return redirect(res, `/admin?msg=${encodeURIComponent(msg)}`);
  }

  return send(res, 404, 'não encontrado');
}

export function createApp() {
  return createServer((req, res) =>
    handle(req, res).catch((err) => {
      log('erro:', err.message);
      if (!res.headersSent) send(res, 500, 'erro interno');
    })
  );
}

// Execução direta: node src/server.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  openDb(config.dbPath);
  resetStuckJobs();
  startWorker();
  createApp().listen(config.port, () => {
    log(`Iris ouvindo na porta ${config.port}`);
    log(`WhatsApp: ${config.whatsapp.enabled ? config.whatsapp.mode : 'desligado'} | Mercado Livre: ${config.mercadolivre.enabled ? config.mercadolivre.mode : 'desligado'}`);
    if (!config.adminPassword) log('⚠️  ADMIN_PASSWORD vazio: o painel /admin fica bloqueado');
  });
}
