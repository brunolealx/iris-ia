import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

// Ambiente de teste (antes de importar config)
Object.assign(process.env, {
  WA_ENABLED: 'true', WA_VERIFY_TOKEN: 'segredo', WA_APP_SECRET: 'appsecret',
  ML_ENABLED: 'true', ML_CLIENT_ID: '123', ADMIN_PASSWORD: 'senha', ANTHROPIC_API_KEY: 'x',
});

const { openDb, getDb, createDraft, listDrafts } = await import('../src/db.js');
const { decide, findSensitive } = await import('../src/policy.js');
const { parseModelJson } = await import('../src/claude.js');
const wa = await import('../src/channels/whatsapp.js');
const { createApp } = await import('../src/server.js');

let server, base;
before(async () => {
  openDb(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const ok = { reply: 'Temos sim!', confidence: 0.9, needsHuman: false, reason: '' };

test('política: modo auto envia resposta segura', () => {
  assert.equal(decide({ channel: 'whatsapp', mode: 'auto', customerText: 'Tem na cor azul?', result: ok, minConfidence: 0.75 }).send, true);
});

test('política: modo sugestão nunca envia sozinho', () => {
  assert.equal(decide({ channel: 'whatsapp', mode: 'suggest', customerText: 'Tem azul?', result: ok, minConfidence: 0.75 }).send, false);
});

test('política: assunto sensível vai para o painel', () => {
  assert.deepEqual(findSensitive('Quero DEVOLUÇÃO e reembolso'), ['reembolso', 'devolu']);
  assert.equal(decide({ channel: 'whatsapp', mode: 'auto', customerText: 'quero cancelar', result: ok, minConfidence: 0.75 }).send, false);
});

test('política: link ou telefone no ML é bloqueado', () => {
  const r = { ...ok, reply: 'Chama no (15) 99999-1234' };
  assert.equal(decide({ channel: 'mercadolivre', mode: 'auto', customerText: 'oi', result: r, minConfidence: 0.75 }).send, false);
});

test('política: confiança baixa vai para o painel', () => {
  assert.equal(decide({ channel: 'whatsapp', mode: 'auto', customerText: 'oi', result: { ...ok, confidence: 0.4 }, minConfidence: 0.75 }).send, false);
});

test('parse do JSON do Claude tolera ```json', () => {
  const r = parseModelJson('```json\n{"reply":"Olá!","confidence":0.8,"needs_human":false}\n```');
  assert.equal(r.reply, 'Olá!');
  assert.equal(r.confidence, 0.8);
  assert.throws(() => parseModelJson('sem json'));
});

test('WhatsApp: assinatura e leitura do payload', () => {
  const body = Buffer.from('{"a":1}');
  const sig = 'sha256=' + createHmac('sha256', 'appsecret').update(body).digest('hex');
  assert.equal(wa.verifySignature(body, sig), true);
  assert.equal(wa.verifySignature(body, 'sha256=00'), false);
  const msgs = wa.parseIncoming({
    entry: [{ changes: [{ value: { contacts: [{ wa_id: '5515999', profile: { name: 'Ana' } }], messages: [{ id: 'm1', from: '5515999', type: 'text', text: { body: 'Oi' } }] } }] }],
  });
  assert.deepEqual(msgs, [{ id: 'm1', from: '5515999', name: 'Ana', type: 'text', text: 'Oi' }]);
});

test('webhook WhatsApp: verificação GET', async () => {
  const r = await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=segredo&hub.challenge=42`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '42');
  const bad = await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42`);
  assert.equal(bad.status, 403);
});

test('webhook ML: responde 200 rápido, enfileira e ignora duplicado', async () => {
  const n = { resource: '/questions/999', user_id: 1, topic: 'questions', application_id: 123 };
  const t0 = Date.now();
  const r = await fetch(`${base}/webhooks/mercadolivre`, { method: 'POST', body: JSON.stringify(n) });
  assert.equal(r.status, 200);
  assert.ok(Date.now() - t0 < 500, 'deve responder em menos de 500 ms');
  await fetch(`${base}/webhooks/mercadolivre`, { method: 'POST', body: JSON.stringify(n) });
  await new Promise((r) => setTimeout(r, 50));
  const jobs = getDb().prepare(`SELECT * FROM jobs WHERE channel = 'mercadolivre'`).all();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].kind, 'question');
});

test('webhook ML: notificação de outro app é ignorada', async () => {
  await fetch(`${base}/webhooks/mercadolivre`, { method: 'POST', body: JSON.stringify({ resource: '/questions/1', topic: 'questions', application_id: 777 }) });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(getDb().prepare(`SELECT COUNT(*) n FROM jobs WHERE payload LIKE '%questions/1"%'`).get().n, 0);
});

test('fluxo completo: mensagem do WhatsApp vira rascunho no modo sugestão', async () => {
  const { enqueue } = await import('../src/db.js');
  const { processOne } = await import('../src/worker.js');
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    const body = JSON.parse(opts.body);
    assert.match(body.messages[0].content, /Tem pronta entrega\?/);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"reply":"Temos sim, Ana!","confidence":0.95,"needs_human":false}' }] }));
  };
  try {
    getDb().exec(`UPDATE jobs SET status = 'done'`); // limpa jobs dos testes anteriores
    enqueue('whatsapp', 'message', { id: 'm9', from: '5515888', name: 'Ana', type: 'text', text: 'Tem pronta entrega?' }, 'wa:m9');
    assert.equal(await processOne(), true);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(calls, ['https://api.anthropic.com/v1/messages']); // não enviou ao WhatsApp
  const d = listDrafts().find((x) => x.target.to === '5515888');
  assert.equal(d.reply, 'Temos sim, Ana!');
  assert.match(d.reason, /modo sugestão/);
  getDb().exec(`UPDATE drafts SET status = 'discarded'`);
});

test('painel exige senha e lista rascunhos', async () => {
  assert.equal((await fetch(`${base}/admin`)).status, 401);
  createDraft({ channel: 'whatsapp', target: { channel: 'whatsapp', to: '5515999' }, contactName: 'Ana', customerText: 'Quero <b>reembolso</b>', reply: 'Vou verificar', reason: 'assunto sensível' });
  const auth = 'Basic ' + Buffer.from('admin:senha').toString('base64');
  const r = await fetch(`${base}/admin`, { headers: { authorization: auth } });
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Quero &lt;b&gt;reembolso&lt;\/b&gt;/); // HTML escapado
  // descartar
  const id = listDrafts()[0].id;
  const d = await fetch(`${base}/admin/drafts/${id}/discard`, { method: 'POST', headers: { authorization: auth }, redirect: 'manual' });
  assert.equal(d.status, 303);
  assert.equal(listDrafts().length, 0);
});
