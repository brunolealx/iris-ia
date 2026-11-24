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
  { id: 'pro', name: 'Pro', price_cents: 19700, ai_replies_month: 6000, products_max: 20000, users_max: 5, channels: ['whatsapp', 'mercadolivre'], ai_model: 'claude-sonnet-5-5', features: ['crm', 'api', 'webhooks', 'nfe', 'nfse'] },
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
    ],
    integration_secrets: [
      { integration_id: 'i-wa', ciphertext: shared.encryptJson({ access_token: 'WA_TOKEN' }, KEY) },
      { integration_id: 'i-ml', ciphertext: shared.encryptJson({ access_token: 'ML_TOKEN', refresh_token: 'r', expires_at: Date.now() + 1e7 }, KEY) },
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

const ML = 'https://api.mercadolibre.com';
const mlOrder = (extra = {}) => ({
  [`${ML}/orders/2000`]: () => ({
    id: 2000, pack_id: null, status: 'paid', total_amount: 199.9, shipping: { id: 3000 },
    buyer: { id: 42, nickname: 'ANA123', first_name: 'Ana', last_name: 'Souza' },
    order_items: [{ item: { id: 'MLB1', title: 'Farol Gol', seller_sku: 'FAROL-1' }, quantity: 1, unit_price: 199.9 }],
  }),
  [`${ML}/shipments/3000`]: () => ({ status: 'ready_to_ship', logistic_type: 'self_service' }),
  ...extra,
});

test('Venda paga no ML → pedido, CRM e NF-e emitida pelo Faturador do ML (modo automático)', async () => {
  seed({ nfe_mode: 'auto' });
  let emitted = null;
  const f = fakeFetch(mlOrder({
    [`${ML}/users/999/invoices/orders`]: (u, o) => {
      if ((o.method || 'GET') === 'GET') return new Response('{"message":"not found"}', { status: 404 });
      emitted = JSON.parse(o.body);
      return { id: 'INV1', status: 'processing' };
    },
    [`${ML}/users/999/invoices/documents/xml/INV1/authorized`]: () => new Response('<nfeProc>ok</nfeProc>', { status: 200 }),
    [`${ML}/users/999/invoices/INV1`]: () => ({ id: 'INV1', status: 'authorized', attributes: { invoice_key: '3526', xml_location: '/users/999/invoices/documents/xml/INV1/authorized' } }),
  }));
  try {
    await handlers['ml.notification']({ topic: 'orders_v2', resource: '/orders/2000', user_id: 999 });
    await drain(); // emite e agenda a consulta para daqui a 45 s
    const o = db.tables.orders[0];
    assert.deepEqual(emitted, { orders: [2000] });
    assert.equal(o.nfe_status, 'processing');
    assert.equal(o.nfe_invoice_id, 'INV1');
    // o aviso do tópico "invoices" faz consultar na hora
    await handlers['ml.notification']({ topic: 'invoices', resource: '/users/999/invoices/INV1', user_id: 999 });
    await drain();
  } finally {
    f.restore();
  }
  const o = db.tables.orders[0];
  assert.equal(o.total_cents, 19990);
  assert.equal(o.nfe_status, 'authorized');
  assert.equal(o.nfe_key, '3526');
  assert.equal(db.tables.contacts[0].stage, 'cliente');
  assert.ok(db.tables.jobs.some((j) => j.kind === 'webhook.dispatch' || j.kind === 'nfe.process'));
});

test('NF-e: modo manual não emite sozinho; Full só busca a nota do ML', async () => {
  seed({ nfe_mode: 'manual' });
  const f = fakeFetch(mlOrder());
  try {
    await handlers['ml.notification']({ topic: 'orders_v2', resource: '/orders/2000', user_id: 999 });
  } finally {
    f.restore();
  }
  assert.equal((db.tables.jobs || []).filter((j) => j.kind === 'nfe.process').length, 0);

  const [full] = await db.insert('orders', { org_id: ORG, source: 'mercadolivre', external_id: '7', status: 'paid', logistic_type: 'fulfillment', items: [] });
  let posted = false;
  const g = fakeFetch({
    [`${ML}/users/999/invoices/orders`]: (u, o) => { if (o.method === 'POST') posted = true; return new Response('{}', { status: 404 }); },
  });
  try {
    await handlers['nfe.process']({ orderId: full.id, manual: true }, { org_id: ORG });
  } finally {
    g.restore();
  }
  assert.equal(posted, false);
  assert.equal(db.tables.orders.find((o) => o.id === full.id).nfe_status, 'processing');
});

test('NF-e: rejeição do Faturador mostra o motivo', async () => {
  seed({ nfe_mode: 'auto' });
  const [o] = await db.insert('orders', { org_id: ORG, source: 'mercadolivre', external_id: '8', status: 'paid', nfe_status: 'processing', nfe_invoice_id: 'X9', items: [] });
  const f = fakeFetch({
    [`${ML}/users/999/invoices/X9`]: () => ({ id: 'X9', status: 'rejected', errors: [{ code: 'E77' }] }),
    [`${ML}/users/invoices/errors/MLB/E77`]: () => ({ message: 'NCM do item MLB1 não informado' }),
  });
  try {
    await assert.rejects(handlers['nfe.process']({ orderId: o.id, step: 'wait' }, { org_id: ORG }), /NCM/);
  } finally {
    f.restore();
  }
  assert.equal(db.tables.orders[0].nfe_status, 'error');
  assert.match(db.tables.orders[0].nfe_error, /NCM do item/);
});

// ---------- NFS-e Nacional ----------
const nfse = await import('../src/channels/nfse.js');
const { execFileSync } = await import('node:child_process');
const { mkdtempSync, readFileSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const certDir = mkdtempSync(join(tmpdir(), 'iris-test-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(certDir, 'k.pem'), '-out', join(certDir, 'c.pem'), '-days', '5', '-subj', '/CN=TOP CONEXOES LTDA:11222333000181'], { stdio: 'ignore' });
execFileSync('openssl', ['pkcs12', '-export', '-inkey', join(certDir, 'k.pem'), '-in', join(certDir, 'c.pem'), '-out', join(certDir, 'a1.pfx'), '-passout', 'pass:segredo'], { stdio: 'ignore' });
const PFX = readFileSync(join(certDir, 'a1.pfx')).toString('base64');
const NFSE_CFG = { tpAmb: 2, cnpj: '11222333000181', cLocEmi: '3552205', serie: '1', opSimpNac: '3', regApTribSN: '1', cTribNac: '010101', cNBS: '101011100' };

function seedNfse(secret = { pfxB64: PFX, password: 'segredo' }, cfg = NFSE_CFG) {
  db.tables.integrations.push({ id: 'i-nfse', org_id: ORG, provider: 'nfse', status: 'connected', external_id: cfg.cnpj, meta: { config: cfg }, updated_at: String(Math.random()) });
  db.tables.integration_secrets.push({ integration_id: 'i-nfse', ciphertext: shared.encryptJson(secret, KEY) });
}

test('NFS-e: DPS assinada, enviada compactada e nota autorizada', async () => {
  seedNfse();
  const [inv] = await db.insert('service_invoices', { org_id: ORG, status: 'pending', amount_cents: 19700, description: 'Plano Pro da Iris — novembro', taker: { doc: '123.456.789-09', name: 'Ana Souza', email: 'ana@x.com' } });
  let sent;
  nfse.setTransport((method, path, body) => {
    if (method === 'POST' && path === '/nfse') {
      sent = nfse.unpack(body.dpsXmlGZipB64);
      return { status: 201, json: { chaveAcesso: '3'.repeat(50), idDps: 'x', nfseXmlGZipB64: nfse.pack('<NFSe><infNFSe><nNFSe>17</nNFSe></infNFSe></NFSe>') } };
    }
    return { status: 404, json: {} };
  });
  try {
    await handlers['nfse.emit']({ invoiceId: inv.id }, { org_id: ORG });
  } finally {
    nfse.setTransport(null);
  }
  const row = db.tables.service_invoices[0];
  assert.equal(row.status, 'authorized');
  assert.equal(row.chave, '3'.repeat(50));
  assert.equal(row.nfse_number, '17');
  assert.equal(row.dps_id, 'DPS355220521122233300018100001000000000000001');
  assert.match(sent, /^<\?xml version="1.0" encoding="UTF-8"\?><DPS xmlns="http:\/\/www.sped.fazenda.gov.br\/nfse" versao="1.01"><infDPS Id="DPS3552205/);
  assert.match(sent, /<toma><CPF>12345678909<\/CPF><xNome>Ana Souza<\/xNome><email>ana@x.com<\/email><\/toma>/);
  assert.match(sent, /<vServ>197.00<\/vServ>/);

  // assinatura confere: digest do infDPS canônico e RSA-SHA256 do SignedInfo
  const { createHash, createVerify } = await import('node:crypto');
  const body = sent.match(/<infDPS Id="[^"]+">([\s\S]*)<\/infDPS>/)[1];
  const id = sent.match(/<infDPS Id="([^"]+)"/)[1];
  const digest = createHash('sha256').update(`<infDPS xmlns="${nfse.NS}" Id="${id}">${body}</infDPS>`).digest('base64');
  assert.equal(sent.match(/<DigestValue>([^<]+)</)[1], digest);
  const si = sent.match(/<SignedInfo>[\s\S]*<\/SignedInfo>/)[0].replace('<SignedInfo>', '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">');
  const ok = createVerify('RSA-SHA256').update(si).verify(readFileSync(join(certDir, 'c.pem')), sent.match(/<SignatureValue>([^<]+)</)[1], 'base64');
  assert.ok(ok);
});

test('NFS-e: rejeição guarda o erro da Sefin; certificado de outro CNPJ é barrado', async () => {
  seedNfse();
  const [inv] = await db.insert('service_invoices', { org_id: ORG, status: 'pending', amount_cents: 5000, description: 'Consultoria', taker: {} });
  nfse.setTransport((method, path) =>
    method === 'POST' ? { status: 400, json: { erros: [{ Codigo: 'E0312', Descricao: 'Código de tributação não administrado pelo município' }] } } : { status: 404, json: {} });
  try {
    await handlers['nfse.emit']({ invoiceId: inv.id }, { org_id: ORG });
  } finally {
    nfse.setTransport(null);
  }
  assert.equal(db.tables.service_invoices[0].status, 'rejected');
  assert.match(db.tables.service_invoices[0].error, /E0312/);

  seed();
  seedNfse(undefined, { ...NFSE_CFG, cnpj: '99888777000166' });
  const [inv2] = await db.insert('service_invoices', { org_id: ORG, status: 'pending', amount_cents: 5000, description: 'Consultoria', taker: {} });
  await assert.rejects(handlers['nfse.emit']({ invoiceId: inv2.id }, { org_id: ORG }), /certificado é do CNPJ 11222333000181/);
  assert.equal(db.tables.service_invoices[0].status, 'error');
});

test('NFS-e: senha errada e plano sem NFS-e', async () => {
  seedNfse({ pfxB64: PFX, password: 'errada' });
  const [inv] = await db.insert('service_invoices', { org_id: ORG, status: 'pending', amount_cents: 5000, description: 'x', taker: {} });
  await assert.rejects(handlers['nfse.emit']({ invoiceId: inv.id }, { org_id: ORG }), /senha do certificado incorreta/);
  seed({ plan_id: 'gratis' });
  const [inv2] = await db.insert('service_invoices', { org_id: ORG, status: 'pending', amount_cents: 5000, description: 'x', taker: {} });
  await assert.rejects(handlers['nfse.emit']({ invoiceId: inv2.id }, { org_id: ORG }), /não está inclusa/);
});

test('NFS-e: cancelamento envia o evento e101101 assinado', async () => {
  seedNfse();
  const chave = '4'.repeat(50);
  const [inv] = await db.insert('service_invoices', { org_id: ORG, status: 'authorized', chave, amount_cents: 5000, description: 'x', taker: {} });
  let ev;
  nfse.setTransport((method, path, body) => {
    ev = { path, xml: nfse.unpack(body.pedidoRegistroEventoXmlGZipB64) };
    return { status: 201, json: { eventoXmlGZipB64: nfse.pack('<evento/>') } };
  });
  try {
    await handlers['nfse.cancel']({ invoiceId: inv.id, cMotivo: 1, xMotivo: 'Valor do serviço informado errado' }, { org_id: ORG });
  } finally {
    nfse.setTransport(null);
  }
  assert.equal(ev.path, `/nfse/${chave}/eventos`);
  assert.match(ev.xml, new RegExp(`<pedRegEvento xmlns="${nfse.NS}" versao="1.01"><infPedReg Id="PRE${chave}101101">`));
  assert.match(ev.xml, /<CNPJAutor>11222333000181<\/CNPJAutor><chNFSe>4+<\/chNFSe><e101101><xDesc>Cancelamento de NFS-e<\/xDesc><cMotivo>1<\/cMotivo>/);
  assert.equal(db.tables.service_invoices[0].status, 'canceled');
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
