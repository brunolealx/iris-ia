import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';

const KEY = randomBytes(32).toString('base64');
Object.assign(process.env, {
  SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'x', ENCRYPTION_KEY: KEY, ANTHROPIC_API_KEY: 'x',
  META_APP_SECRET: 'metasecret', WA_VERIFY_TOKEN: 'verifica', ML_CLIENT_ID: '555', MP_WEBHOOK_SECRET: 'mpsecret', MP_ACCESS_TOKEN: 'mp',
});

const { fakeDb, fakeFetch } = await import('./fake.js');
const { setDb } = await import('../src/db.js');
const shared = await import('../src/shared.js');
const { createApp } = await import('../src/server.js');
const { runOnce } = await import('../src/queue.js');
const { handlers } = await import('../src/handlers/index.js');
const { forgetOrg } = await import('../src/tenants.js');
const wa = await import('../src/channels/whatsapp.js');
const mp = await import('../src/channels/mercadopago.js');
const { isPrivateAddress } = await import('../src/handlers/webhooks.js');
const { parseModelJson } = await import('../src/ai.js');

const ORG = '11111111-1111-1111-1111-111111111111';
const PLANS = [
  { id: 'gratis', name: 'Teste', price_cents: 0, ai_replies_month: 100, products_max: 50, users_max: 1, channels: ['whatsapp', 'mercadolivre'], ai_model: 'claude-haiku-5-5', features: ['crm'] },
  { id: 'pro', name: 'Pro', price_cents: 19700, ai_replies_month: 6000, products_max: 20000, users_max: 5, channels: ['whatsapp', 'mercadolivre'], ai_model: 'claude-sonnet-5-5', features: ['crm', 'omie', 'api', 'webhooks', 'nfe'] },
];
const apiKey = shared.newApiKey();

let db, server, base;
function seed(orgPatch = {}) {
  const org = {
    id: ORG, name: 'Top Conexões', plan_id: 'pro', status: 'active', trial_ends_at: '2099-01-01', ai_name: 'Iris', ai_tone: 'cordial',
    knowledge: 'Enviamos em 1 dia útil.', mode_whatsapp: 'suggest', mode_ml: 'suggest', min_confidence: 0.75, nfe_mode: 'off',
    api_key_prefix: apiKey.prefix, api_key_hash: apiKey.hash, ...orgPatch,
  };
  db = fakeDb({
    plans: PLANS, organizations: [org],
    integrations: [
      { id: 'i-wa', org_id: ORG, provider: 'whatsapp', status: 'connected', external_id: 'PNID1', meta: {} },
      { id: 'i-ml', org_id: ORG, provider: 'mercadolivre', status: 'connected', external_id: '999', meta: {} },
      { id: 'i-om', org_id: ORG, provider: 'omie', status: 'connected', external_id: 'k', meta: { nfe: { categoryCode: '1.01.01', accountCode: '123' } } },
    ],
    integration_secrets: [
      { integration_id: 'i-wa', ciphertext: shared.encryptJson({ access_token: 'WA_TOKEN' }, KEY) },
      { integration_id: 'i-ml', ciphertext: shared.encryptJson({ access_token: 'ML_TOKEN', refresh_token: 'r', expires_at: Date.now() + 1e7 }, KEY) },
      { integration_id: 'i-om', ciphertext: shared.encryptJson({ app_key: 'k', app_secret: 's' }, KEY) },
    ],
  });
  setDb(db);
  forgetOrg(ORG);
}
const claude = (reply, extra = {}) => () => ({ content: [{ type: 'text', text: JSON.stringify({ reply, confidence: 0.95, needs_human: false, ...extra }) }] });
const drain = async () => { while (await runOnce(handlers)); };
const tick = () => new Promise((r) => setTimeout(r, 30));

before(async () => {
  seed();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => seed());

// ---------- Unidades ----------

test('criptografia: ida e volta, e chave errada falha', () => {
  const enc = shared.encryptJson({ a: 1 }, KEY);
  assert.deepEqual(shared.decryptJson(enc, KEY), { a: 1 });
  assert.throws(() => shared.decryptJson(enc, randomBytes(32).toString('base64')));
});

test('chave da API: formato e hash', () => {
  const k = shared.parseApiKey(apiKey.full);
  assert.equal(k.prefix, apiKey.prefix);
  assert.equal(k.hash, apiKey.hash);
  assert.equal(shared.parseApiKey('qualquer'), null);
});

test('política: sensível, contato no ML, confiança e modo', () => {
  const ok = { reply: 'Temos sim!', confidence: 0.9, needsHuman: false };
  const d = (o) => shared.decide({ channel: 'whatsapp', mode: 'auto', customerText: 'tem azul?', result: ok, minConfidence: 0.75, ...o });
  assert.equal(d({}).send, true);
  assert.equal(d({ mode: 'suggest' }).send, false);
  assert.equal(d({ customerText: 'quero o REEMBOLSO' }).send, false);
  assert.equal(d({ channel: 'mercadolivre', result: { ...ok, reply: 'me chama no whatsapp' } }).send, false);
  assert.equal(d({ result: { ...ok, confidence: 0.3 } }).send, false);
});

test('plano: teste vencido e limite bloqueiam a IA', () => {
  assert.match(shared.aiBlockReason({ status: 'trial', trial_ends_at: '2000-01-01' }, PLANS[0], 0), /teste grátis/);
  assert.match(shared.aiBlockReason({ status: 'active' }, PLANS[0], 100), /limite/);
  assert.equal(shared.aiBlockReason({ status: 'active' }, PLANS[0], 5), null);
});

test('IA: JSON tolerante', () => {
  assert.equal(parseModelJson('```json\n{"reply":"Oi","confidence":0.8}\n```').reply, 'Oi');
  assert.equal(parseModelJson('{"reply":"","confidence":1}').needsHuman, true);
});

test('Mercado Pago: assinatura do webhook', () => {
  const ts = '1700000000';
  const v1 = createHmac('sha256', 'mpsecret').update(`id:abc123;request-id:req-1;ts:${ts};`).digest('hex');
  assert.equal(mp.verifySignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: 'ABC123' }), true);
  assert.equal(mp.verifySignature({ signature: `ts=${ts},v1=00`, requestId: 'req-1', dataId: 'abc123' }), false);
});

test('webhooks de saída: bloqueia rede interna', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', '::ffff:10.0.0.1']) assert.equal(isPrivateAddress(ip), true, ip);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
});

// ---------- Webhooks HTTP ----------

const waPayload = (text = 'Tem pronta entrega?', id = 'wamid.1') => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'PNID1' }, contacts: [{ wa_id: '5515999990000', profile: { name: 'Ana' } }], messages: [{ id, from: '5515999990000', type: 'text', text: { body: text } }] } }] }],
});
const signWa = (body) => 'sha256=' + createHmac('sha256', 'metasecret').update(body).digest('hex');

test('WhatsApp: verificação GET e assinatura POST', async () => {
  assert.equal(await (await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=7`)).text(), '7');
  const body = JSON.stringify(waPayload());
  assert.equal((await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=00' } })).status, 401);
  const r = await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', body, headers: { 'x-hub-signature-256': signWa(body) } });
  assert.equal(r.status, 200);
  await tick();
  assert.equal(db.tables.jobs.filter((j) => j.kind === 'wa.message').length, 1);
});

test('Mercado Livre: 200 em menos de 500 ms, dedupe e app errado ignorado', async () => {
  const n = { _id: 'n1', resource: '/questions/77', user_id: 999, topic: 'questions', application_id: 555 };
  const t0 = Date.now();
  const r = await fetch(`${base}/webhooks/mercadolivre`, { method: 'POST', body: JSON.stringify(n) });
  assert.equal(r.status, 200);
  assert.ok(Date.now() - t0 < 500);
  await fetch(`${base}/webhooks/mercadolivre`, { method: 'POST', body: JSON.stringify(n) });
  await fetch(`${base}/webhooks/mercadolivre`, { method: 'POST', body: JSON.stringify({ ...n, _id: 'n2', application_id: 1 }) });
  await tick();
  assert.equal(db.tables.jobs.length, 1);
});

// ---------- Fluxos completos ----------

test('WhatsApp → IA → rascunho no modo sugestão (não envia)', async () => {
  const f = fakeFetch({ 'https://api.anthropic.com': claude('Temos sim, Ana!'), 'https://graph.facebook.com': () => ({}) });
  try {
    await handlers['wa.message'](wa.parseWebhook(waPayload()).messages[0]);
  } finally {
    f.restore();
  }
  assert.equal(db.tables.contacts[0].name, 'Ana');
  assert.equal(db.tables.drafts[0].reply, 'Temos sim, Ana!');
  assert.match(db.tables.drafts[0].reason, /modo sugestão/);
  assert.equal(f.calls.filter((c) => c.url.includes('/messages') && JSON.parse(c.opts.body).type === 'text').length, 0);
  assert.equal(db.tables.usage_monthly[0].ai_replies, 1);
});

test('WhatsApp → IA → envio automático no modo auto, e reenvio da Meta é ignorado', async () => {
  seed({ mode_whatsapp: 'auto' });
  const f = fakeFetch({ 'https://api.anthropic.com': claude('Temos sim!'), 'https://graph.facebook.com': () => ({ messages: [{ id: 'wamid.out1' }] }) });
  try {
    const m = wa.parseWebhook(waPayload()).messages[0];
    await handlers['wa.message'](m);
    await handlers['wa.message'](m); // duplicado
  } finally {
    f.restore();
  }
  const sent = f.calls.filter((c) => c.url.endsWith('/PNID1/messages') && JSON.parse(c.opts.body).type === 'text');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].opts.headers.authorization, 'Bearer WA_TOKEN');
  assert.deepEqual(db.tables.messages.map((m) => m.author), ['customer', 'ai']);
});

test('Pergunta no ML → IA usa dados do anúncio → rascunho', async () => {
  const f = fakeFetch({
    'https://api.mercadolibre.com/questions/77': () => ({ id: 77, status: 'UNANSWERED', text: 'Serve no Gol 2015?', item_id: 'MLB1', from: { id: 42 } }),
    'https://api.mercadolibre.com/items/MLB1/description': () => ({ plain_text: 'Compatível com Gol G6' }),
    'https://api.mercadolibre.com/items/MLB1': () => ({ title: 'Farol Gol', price: 199.9, available_quantity: 3, condition: 'new', attributes: [] }),
    'https://api.anthropic.com': (u, o) => {
      assert.match(JSON.parse(o.body).messages[0].content, /Farol Gol/);
      return claude('Sim, serve no Gol G6!')();
    },
  });
  try {
    await handlers['ml.notification']({ topic: 'questions', resource: '/questions/77', user_id: 999 });
  } finally {
    f.restore();
  }
  assert.equal(db.tables.drafts[0].target.questionId, 77);
  assert.equal(db.tables.conversations[0].kind, 'question');
});

test('Painel aprova rascunho → job envia no ML com o texto editado', async () => {
  const [d] = await db.insert('drafts', { org_id: ORG, target: { channel: 'mercadolivre', type: 'question', questionId: 77 }, customer_text: 'oi', reply: 'x' });
  const f = fakeFetch({ 'https://api.mercadolibre.com/answers': (u, o) => ({ ok: true, body: o.body }) });
  try {
    await handlers['outbound.send']({ draftId: d.id, text: 'Olá! Temos sim.' }, { org_id: ORG });
  } finally {
    f.restore();
  }
  assert.equal(JSON.parse(f.calls[0].opts.body).text, 'Olá! Temos sim.');
  assert.equal(db.tables.drafts[0].status, 'sent');
});

test('Painel não consegue enviar rascunho de outra organização', async () => {
  const [d] = await db.insert('drafts', { org_id: 'outra', target: { channel: 'whatsapp', to: '1' }, customer_text: 'oi', reply: 'x' });
  await assert.rejects(handlers['outbound.send']({ draftId: d.id }, { org_id: ORG }), /não encontrado/);
});

test('Venda no ML → pedido, contato no CRM e pedido criado na Omie (modo só pedido)', async () => {
  seed({ nfe_mode: 'order_only' });
  await db.insert('products', { org_id: ORG, source: 'omie', external_id: '5001', sku: 'FAROL-1', name: 'Farol Gol' });
  const f = fakeFetch({
    'https://api.mercadolibre.com/orders/2000': () => ({
      id: 2000, pack_id: null, status: 'paid', total_amount: 199.9, shipping: { id: 3000 },
      buyer: { id: 42, nickname: 'ANA123', first_name: 'Ana', last_name: 'Souza' },
      order_items: [{ item: { id: 'MLB1', title: 'Farol Gol', seller_sku: 'FAROL-1' }, quantity: 1, unit_price: 199.9 }],
    }),
    'https://api.mercadolibre.com/shipments/3000': () => ({ status: 'ready_to_ship', logistic_type: 'self_service' }),
    'https://app.omie.com.br/api/v1/geral/clientes/': () => ({ codigo_cliente_omie: 888 }),
    'https://app.omie.com.br/api/v1/produtos/pedido/': (u, o) => {
      const p = JSON.parse(o.body).param[0];
      assert.equal(p.det[0].produto.codigo_produto, 5001);
      assert.equal(p.cabecalho.codigo_pedido_integracao, 'ml-2000');
      return { codigo_pedido: 7777 };
    },
  });
  try {
    await handlers['ml.notification']({ topic: 'orders_v2', resource: '/orders/2000', user_id: 999 });
    await drain();
  } finally {
    f.restore();
  }
  const o = db.tables.orders[0];
  assert.equal(o.total_cents, 19990);
  assert.equal(o.omie_order_id, '7777');
  assert.equal(o.nfe_status, 'order_created');
  assert.equal(db.tables.contacts[0].stage, 'cliente');
});

test('Nota fiscal: Full não anexa (o ML emite)', async () => {
  seed({ nfe_mode: 'auto' });
  const [o] = await db.insert('orders', { org_id: ORG, source: 'mercadolivre', external_id: '1', status: 'paid', logistic_type: 'fulfillment', items: [] });
  await handlers['nfe.process']({ orderId: o.id }, { org_id: ORG });
  assert.equal(db.tables.orders[0].nfe_status, 'not_allowed');
});

test('Omie: importa página e agenda a próxima', async () => {
  const f = fakeFetch({
    'https://app.omie.com.br/api/v1/geral/produtos/': () => ({
      total_de_paginas: 3, total_de_registros: 250,
      produto_servico_cadastro: [{ codigo_produto: 1, codigo: 'A1', descricao: 'Cabo USB-C', valor_unitario: 29.9, inativo: 'N' }],
    }),
  });
  try {
    await handlers['omie.import']({ mode: 'all', page: 1 }, { org_id: ORG });
  } finally {
    f.restore();
  }
  assert.equal(db.tables.products[0].price_cents, 2990);
  assert.equal(db.tables.jobs.find((j) => j.kind === 'omie.import').payload.page, 2);
});

test('Plano sem Omie não importa', async () => {
  seed({ plan_id: 'gratis' });
  await assert.rejects(handlers['omie.import']({ mode: 'all' }, { org_id: ORG }), /não inclusa/);
});

test('API pública: produtos em massa, autenticação e plano', async () => {
  const post = (body, key = apiKey.full) => fetch(`${base}/api/v1/products`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  const r = await post({ products: [{ sku: 'X1', name: 'Capa', price: 49.9, stock: 10 }] });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { data: { saved: 1 } });
  assert.equal(db.tables.products[0].price_cents, 4990);
  assert.equal((await post({}, 'iris_00000000_' + 'a'.repeat(30))).status, 401);
  seed({ plan_id: 'gratis' });
  assert.equal((await post({ sku: 'X', name: 'Y' })).status, 403);
});

test('API pública: mensagem vira job de envio', async () => {
  const r = await fetch(`${base}/api/v1/messages`, { method: 'POST', headers: { authorization: `Bearer ${apiKey.full}` }, body: JSON.stringify({ to: '+55 (15) 99999-0000', text: 'Seu pedido saiu!' }) });
  assert.equal(r.status, 200);
  const job = db.tables.jobs.find((j) => j.kind === 'outbound.send');
  assert.equal(job.payload.text, 'Seu pedido saiu!');
  assert.equal(db.tables.conversations[0].external_ref, '5515999990000');
});

test('Google Drive: cria pastas, planilha dentro da pasta e agenda exportação', async () => {
  await db.insert('integrations', { id: 'i-g', org_id: ORG, provider: 'google', status: 'connected', external_id: 'ana@gmail.com', meta: {} });
  await db.insert('integration_secrets', { integration_id: 'i-g', ciphertext: shared.encryptJson({ refresh_token: 'r', access_token: 'G', expires_at: Date.now() + 1e7 }, KEY) });
  let n = 0;
  const f = fakeFetch({
    'https://www.googleapis.com/drive/v3/files?': (u, o) => ({ id: `pasta${++n}`, webViewLink: 'https://drive/x', name: JSON.parse(o.body).name }),
    'https://www.googleapis.com/drive/v3/files/': () => ({ id: 'planilha1' }),
    'https://sheets.googleapis.com/v4/spreadsheets/planilha1': () => ({}),
    'https://sheets.googleapis.com/v4/spreadsheets': (u, o) => {
      const body = JSON.parse(o.body);
      assert.ok(body.sheets.some((s) => s.properties.title === 'Folha de Pagamento'));
      return { spreadsheetId: 'planilha1', spreadsheetUrl: 'https://docs.google.com/x' };
    },
  });
  try {
    await handlers['google.setup']({}, { org_id: ORG });
    await handlers['google.setup']({}, { org_id: ORG }); // segunda vez não recria nada
  } finally {
    f.restore();
  }
  const meta = db.tables.integrations.find((i) => i.id === 'i-g').meta;
  assert.equal(meta.spreadsheetId, 'planilha1');
  assert.ok(meta.folders['Notas Fiscais'] && meta.folders['Funcionários']);
  assert.equal(f.calls.filter((c) => c.url.startsWith('https://sheets.googleapis.com/v4/spreadsheets') && c.opts.method === 'POST' && c.url.endsWith('spreadsheets')).length, 1);
  assert.ok(f.calls.some((c) => c.url.includes('addParents=pasta1')), 'planilha movida para a pasta raiz');
  assert.ok(db.tables.jobs.some((j) => j.kind === 'google.export'));
});

test('Google: venda nova vira linha na planilha', async () => {
  await db.insert('integrations', { id: 'i-g', org_id: ORG, provider: 'google', status: 'connected', external_id: 'x', meta: { spreadsheetId: 'S1' } });
  await db.insert('integration_secrets', { integration_id: 'i-g', ciphertext: shared.encryptJson({ refresh_token: 'r', access_token: 'G', expires_at: Date.now() + 1e7 }, KEY) });
  const r = await fetch(`${base}/api/v1/orders`, { method: 'POST', headers: { authorization: `Bearer ${apiKey.full}` }, body: JSON.stringify({ external_id: 'L-1', total: 50, items: [{ title: 'Cabo', quantity: 2, price: 25 }], customer: { name: 'João', phone: '15999990000' } }) });
  assert.equal(r.status, 200);
  const job = db.tables.jobs.find((j) => j.kind === 'google.append' && j.payload.kind === 'order');
  assert.ok(job);
  const f = fakeFetch({ 'https://sheets.googleapis.com': (u, o) => ({ body: o.body }) });
  try {
    await handlers['google.append'](job.payload, { org_id: ORG });
  } finally {
    f.restore();
  }
  const row = JSON.parse(f.calls[0].opts.body).values[0];
  assert.equal(row[1], 'L-1');
  assert.equal(row[3], 'João');
  assert.equal(row[7], '50.00');
});

test('Webhook de saída: assinado e registrado', async () => {
  await db.insert('webhook_endpoints', { id: 'ep1', org_id: ORG, url: 'https://exemplo.com.br/hook', secret: 'segredo', events: ['order.created'] });
  const f = fakeFetch({ 'https://exemplo.com.br/hook': (u, o) => {
    assert.equal(o.headers['x-iris-signature'], 'sha256=' + createHmac('sha256', 'segredo').update(o.body).digest('hex'));
    return { ok: true };
  } });
  try {
    // exemplo.com.br precisa resolver no DNS: se não houver rede, o teste é pulado
    await handlers['webhook.dispatch']({ endpointId: 'ep1', event: 'order.created', data: { a: 1 }, at: 'agora' }, { org_id: ORG, id: 1 });
    assert.equal(db.tables.webhook_deliveries[0].status_code, 200);
  } catch (e) {
    if (!/ENOTFOUND|EAI_AGAIN/.test(e.code || e.message)) throw e;
  } finally {
    f.restore();
  }
});
