// Painel simples em /admin para aprovar, editar ou descartar respostas.
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { listDrafts, getDraft, updateDraft, stats, kvGet } from './db.js';
import { deliver } from './sender.js';

export function checkAuth(header) {
  if (!config.adminPassword) return false; // painel desligado sem senha
  if (!header?.startsWith('Basic ')) return false;
  const [user, pass = ''] = Buffer.from(header.slice(6), 'base64').toString().split(':');
  const a = Buffer.from(pass);
  const b = Buffer.from(config.adminPassword);
  return user === 'admin' && a.length === b.length && timingSafeEqual(a, b);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const channelLabel = (d) =>
  d.channel === 'whatsapp' ? `WhatsApp · ${esc(d.contact_name || d.target.to)}` :
  d.target.type === 'question' ? `Mercado Livre · Pergunta` : `Mercado Livre · Pós-venda`;

export function renderPanel(flash = '') {
  const s = stats();
  const drafts = listDrafts('pending');
  const mlConnected = Boolean(kvGet('ml_token'));
  const cards = drafts.length
    ? drafts.map((d) => `
      <article>
        <header><strong>${channelLabel(d)}</strong><small>${esc(d.created_at)} UTC</small></header>
        ${d.channel === 'mercadolivre' && d.contact_name ? `<p class="muted">${esc(d.contact_name)}</p>` : ''}
        <blockquote>${esc(d.customer_text)}</blockquote>
        <p class="reason">Motivo: ${esc(d.reason || '-')}</p>
        <form method="post" action="/admin/drafts/${d.id}/send">
          <textarea name="text" rows="3" maxlength="${d.channel === 'mercadolivre' && d.target.type === 'message' ? 350 : 2000}">${esc(d.reply)}</textarea>
          <div class="row">
            <button type="submit">Enviar</button>
            <button type="submit" formaction="/admin/drafts/${d.id}/discard" class="secondary">Descartar</button>
          </div>
        </form>
      </article>`).join('')
    : '<p class="empty">Nada para aprovar agora. ✨</p>';

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Iris · Painel</title><meta http-equiv="refresh" content="60">
<style>
  :root{--bg:#f6f5fb;--card:#fff;--ink:#1d1b2e;--muted:#6b6880;--accent:#6d4aff;--line:#e4e1f0}
  @media (prefers-color-scheme:dark){:root{--bg:#121119;--card:#1c1a27;--ink:#ecebf5;--muted:#9a97ad;--line:#2c2a3a}}
  *{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--ink)}
  main{max-width:720px;margin:0 auto;padding:20px 16px 60px}
  h1{font-size:22px;margin:0 0 4px}h1 span{color:var(--accent)}
  .stats{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 20px}.stats div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px}
  .stats b{display:block;font-size:18px}
  article{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px}
  article header{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}small,.muted{color:var(--muted);font-size:12px}
  blockquote{margin:10px 0;padding:8px 12px;border-left:3px solid var(--accent);background:var(--bg);border-radius:6px;white-space:pre-wrap}
  .reason{font-size:12px;color:var(--muted);margin:6px 0}
  textarea{width:100%;font:inherit;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink)}
  .row{display:flex;gap:8px;margin-top:8px}button{font:inherit;border:0;border-radius:10px;padding:9px 16px;background:var(--accent);color:#fff;cursor:pointer}
  button.secondary{background:transparent;color:var(--muted);border:1px solid var(--line)}
  .flash{background:var(--card);border:1px solid var(--accent);padding:10px;border-radius:10px;margin-bottom:14px}
  .empty{color:var(--muted);text-align:center;padding:40px 0}a{color:var(--accent)}
</style></head><body><main>
  <h1><span>Iris</span> · respostas para aprovar</h1>
  <p class="muted">WhatsApp: ${config.whatsapp.enabled ? `ligado (${config.whatsapp.mode === 'auto' ? 'automático' : 'sugestão'})` : 'desligado'} ·
  Mercado Livre: ${config.mercadolivre.enabled ? (mlConnected ? `conectado (${config.mercadolivre.mode === 'auto' ? 'automático' : 'sugestão'})` : `<a href="/auth/ml">conectar conta</a>`) : 'desligado'}</p>
  <div class="stats">
    <div><b>${s.pendingDrafts}</b>para aprovar</div>
    <div><b>${s.pendingJobs}</b>na fila</div>
    <div><b>${s.failedJobs}</b>com erro</div>
    <div><b>${s.claudeCallsToday}/${config.claude.maxCallsPerDay}</b>chamadas IA hoje</div>
  </div>
  ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
  ${cards}
</main></body></html>`;
}

export async function sendDraft(id, text) {
  const d = getDraft(id);
  if (!d || d.status !== 'pending') return 'Rascunho não encontrado ou já tratado.';
  const finalText = String(text || '').trim();
  if (!finalText) return 'A resposta está vazia.';
  try {
    await deliver(d.target, finalText);
    updateDraft(id, { status: 'sent', reply: finalText, error: null });
    return 'Resposta enviada ✅';
  } catch (err) {
    updateDraft(id, { error: err.message });
    return `Erro ao enviar: ${err.message}`;
  }
}

export function discardDraft(id) {
  const d = getDraft(id);
  if (!d || d.status !== 'pending') return 'Rascunho não encontrado ou já tratado.';
  updateDraft(id, { status: 'discarded' });
  return 'Descartado.';
}
