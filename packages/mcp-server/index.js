#!/usr/bin/env node
// MCP da Iris: deixa agentes de IA (Claude Code, Claude Desktop, n8n, Cursor...) usarem a conta Iris
// do lojista em linguagem natural. Transporte stdio, JSON-RPC 2.0, uma mensagem por linha. Sem dependências.
//
// Uso:  IRIS_API_TOKEN=iris_xxx npx @iris/mcp-server
import { createInterface } from 'node:readline';

const VERSION = '1.0.0';
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i > 0) return process.argv[i + 1];
  const eqArg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eqArg ? eqArg.split('=').slice(1).join('=') : undefined;
}

const TOKEN = (arg('token') || process.env.IRIS_API_TOKEN || '').trim();
const BASE = (arg('base-url') || process.env.IRIS_API_URL || 'https://iris-worker-3fsa.onrender.com').replace(/\/+$/, '');

// ---------- definição das ferramentas ----------
const S = {
  id: { type: 'string', description: 'ID (UUID) retornado pelas ferramentas de listagem' },
  limite: { type: 'integer', minimum: 1, maximum: 200, description: 'Quantidade máxima (padrão 50)' },
  etapa: { type: 'string', enum: ['lead', 'negociacao', 'cliente', 'pos_venda', 'perdido'], description: 'Etapa do funil' },
};
const obj = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const RO = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const SEND = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

const TOOLS = [
  {
    name: 'iris_resumo', title: 'Resumo da conta',
    description: 'Visão geral: conversas abertas, conversas esperando um humano, sugestões da IA pendentes, contatos por etapa do funil e vendas/faturamento dos últimos 30 dias.',
    inputSchema: obj(), annotations: RO,
    run: () => api('GET', '/api/v1/summary'),
  },
  {
    name: 'iris_contatos_listar', title: 'Listar contatos',
    description: 'Lista contatos do CRM, do mais recente para o mais antigo. Filtra por etapa do funil e/ou busca por nome, telefone ou e-mail.',
    inputSchema: obj({ etapa: S.etapa, busca: { type: 'string', description: 'Parte do nome, telefone ou e-mail' }, limite: S.limite }),
    annotations: RO,
    run: (a) => api('GET', '/api/v1/contacts', null, { stage: a.etapa, q: a.busca, limit: a.limite }),
  },
  {
    name: 'iris_contato_ver', title: 'Ver contato',
    description: 'Mostra um contato: canal, telefone, e-mail, etapa, etiquetas, anotações e total já comprado.',
    inputSchema: obj({ id: S.id }, ['id']), annotations: RO,
    run: (a) => api('GET', `/api/v1/contacts/${enc(a.id)}`),
  },
  {
    name: 'iris_contato_salvar', title: 'Criar ou atualizar contato',
    description: 'Cria o contato pelo telefone (com DDI, ex. 5515999999999) ou e-mail. Se já existir, atualiza os dados informados.',
    inputSchema: obj({
      telefone: { type: 'string' }, email: { type: 'string' }, nome: { type: 'string' }, etapa: S.etapa,
      etiquetas: { type: 'array', items: { type: 'string' } }, anotacoes: { type: 'string' },
    }), annotations: WRITE,
    run: (a) => api('POST', '/api/v1/contacts', { phone: a.telefone, email: a.email, name: a.nome, stage: a.etapa, tags: a.etiquetas, notes: a.anotacoes }),
  },
  {
    name: 'iris_contato_atualizar', title: 'Atualizar contato',
    description: 'Move o contato no funil, troca as etiquetas (substitui a lista), reescreve as anotações ou corrige o nome.',
    inputSchema: obj({ id: S.id, etapa: S.etapa, etiquetas: { type: 'array', items: { type: 'string' } }, anotacoes: { type: 'string' }, nome: { type: 'string' } }, ['id']),
    annotations: { ...WRITE, idempotentHint: true },
    run: (a) => api('PATCH', `/api/v1/contacts/${enc(a.id)}`, { stage: a.etapa, tags: a.etiquetas, notes: a.anotacoes, name: a.nome }),
  },
  {
    name: 'iris_conversas_listar', title: 'Listar conversas',
    description: 'Lista conversas do WhatsApp e do Mercado Livre, das mais recentes para as mais antigas, com o nome e telefone do contato. "ai_paused: true" significa que um humano assumiu.',
    inputSchema: obj({ status: { type: 'string', enum: ['open', 'closed'] }, canal: { type: 'string', enum: ['whatsapp', 'mercadolivre'] }, limite: S.limite }),
    annotations: RO,
    run: (a) => api('GET', '/api/v1/conversations', null, { status: a.status, channel: a.canal, limit: a.limite }),
  },
  {
    name: 'iris_conversa_mensagens', title: 'Ler mensagens da conversa',
    description: 'Histórico de uma conversa em ordem cronológica. author: customer (cliente), ai (Iris), human (atendente) ou system.',
    inputSchema: obj({ id: S.id, limite: S.limite }, ['id']), annotations: RO,
    run: (a) => api('GET', `/api/v1/conversations/${enc(a.id)}/messages`, null, { limit: a.limite }),
  },
  {
    name: 'iris_conversa_responder', title: 'Responder conversa',
    description: 'Envia uma mensagem ao cliente numa conversa existente (WhatsApp ou Mercado Livre), como atendente. A mensagem sai de verdade: confirme o texto com o usuário antes.',
    inputSchema: obj({ id: S.id, texto: { type: 'string', maxLength: 4000 } }, ['id', 'texto']), annotations: SEND,
    run: (a) => api('POST', `/api/v1/conversations/${enc(a.id)}/reply`, { text: a.texto }),
  },
  {
    name: 'iris_conversa_atualizar', title: 'Pausar IA ou fechar conversa',
    description: 'ia_pausada=true faz um humano assumir (a IA para de responder nessa conversa); false devolve para a IA. status fecha ou reabre a conversa.',
    inputSchema: obj({ id: S.id, ia_pausada: { type: 'boolean' }, status: { type: 'string', enum: ['open', 'closed'] } }, ['id']),
    annotations: { ...WRITE, idempotentHint: true },
    run: (a) => api('PATCH', `/api/v1/conversations/${enc(a.id)}`, { ai_paused: a.ia_pausada, status: a.status }),
  },
  {
    name: 'iris_whatsapp_enviar', title: 'Enviar WhatsApp',
    description: 'Envia mensagem de WhatsApp para um número (com DDI, ex. 5515999999999). Fora da janela de 24h desde a última mensagem do cliente, a Meta só entrega templates aprovados. A mensagem sai de verdade: confirme com o usuário antes.',
    inputSchema: obj({ telefone: { type: 'string' }, texto: { type: 'string', maxLength: 4000 }, nome: { type: 'string' } }, ['telefone', 'texto']), annotations: SEND,
    run: (a) => api('POST', '/api/v1/messages', { to: a.telefone, text: a.texto, name: a.nome }),
  },
  {
    name: 'iris_sugestoes_listar', title: 'Sugestões da IA pendentes',
    description: 'Respostas que a IA preparou e estão esperando aprovação humana, com a pergunta do cliente e o motivo de não ter enviado sozinha.',
    inputSchema: obj({ limite: S.limite }), annotations: RO,
    run: (a) => api('GET', '/api/v1/drafts', null, { limit: a.limite }),
  },
  {
    name: 'iris_sugestao_aprovar', title: 'Aprovar sugestão',
    description: 'Envia a sugestão da IA ao cliente. Informe "texto" para mandar uma versão editada. A mensagem sai de verdade: confirme com o usuário antes.',
    inputSchema: obj({ id: S.id, texto: { type: 'string', maxLength: 4000 } }, ['id']), annotations: SEND,
    run: (a) => api('POST', `/api/v1/drafts/${enc(a.id)}/approve`, { text: a.texto }),
  },
  {
    name: 'iris_sugestao_descartar', title: 'Descartar sugestão',
    description: 'Descarta a sugestão da IA sem enviar nada ao cliente.',
    inputSchema: obj({ id: S.id }, ['id']), annotations: { ...WRITE, idempotentHint: true },
    run: (a) => api('POST', `/api/v1/drafts/${enc(a.id)}/discard`, {}),
  },
  {
    name: 'iris_produtos_buscar', title: 'Buscar produtos',
    description: 'Busca no catálogo que a IA usa para responder (nome, SKU, preço em reais e estoque). Sem "busca", lista os atualizados mais recentemente.',
    inputSchema: obj({ busca: { type: 'string' }, limite: S.limite }), annotations: RO,
    run: (a) => api('GET', '/api/v1/products', null, { q: a.busca, limit: a.limite }),
  },
  {
    name: 'iris_produtos_salvar', title: 'Salvar produtos',
    description: 'Cria ou atualiza produtos pelo SKU (até 500 por vez). Preço em reais.',
    inputSchema: obj({
      produtos: {
        type: 'array', minItems: 1, maxItems: 500,
        items: {
          type: 'object', required: ['sku', 'nome'], additionalProperties: false,
          properties: { sku: { type: 'string' }, nome: { type: 'string' }, preco: { type: 'number' }, estoque: { type: 'number' }, descricao: { type: 'string' }, ativo: { type: 'boolean' } },
        },
      },
    }, ['produtos']), annotations: { ...WRITE, idempotentHint: true },
    run: (a) => api('POST', '/api/v1/products', {
      products: a.produtos.map((p) => ({ sku: p.sku, name: p.nome, price: p.preco, stock: p.estoque, description: p.descricao, active: p.ativo })),
    }),
  },
  {
    name: 'iris_vendas_listar', title: 'Listar vendas',
    description: 'Vendas recentes (Mercado Livre, API e outras), com itens, total em centavos e status da nota fiscal.',
    inputSchema: obj({ status: { type: 'string' }, limite: S.limite }), annotations: RO,
    run: (a) => api('GET', '/api/v1/orders', null, { status: a.status, limit: a.limite }),
  },
  {
    name: 'iris_venda_registrar', title: 'Registrar venda',
    description: 'Registra ou atualiza uma venda feita fora da Iris (loja virtual, balcão), pelo código externo. Total e preços em reais.',
    inputSchema: obj({
      codigo: { type: 'string', description: 'Código da venda no seu sistema' },
      total: { type: 'number' }, status: { type: 'string', description: 'Ex.: paid, cancelled (padrão paid)' },
      itens: { type: 'array', items: { type: 'object', properties: { titulo: { type: 'string' }, sku: { type: 'string' }, quantidade: { type: 'number' }, preco: { type: 'number' } } } },
      cliente: { type: 'object', properties: { nome: { type: 'string' }, telefone: { type: 'string' }, email: { type: 'string' } } },
    }, ['codigo']), annotations: { ...WRITE, idempotentHint: true },
    run: (a) => api('POST', '/api/v1/orders', {
      external_id: a.codigo, total: a.total, status: a.status,
      items: (a.itens || []).map((i) => ({ title: i.titulo, sku: i.sku, quantity: i.quantidade, price: i.preco })),
      customer: a.cliente ? { name: a.cliente.nome, phone: a.cliente.telefone, email: a.cliente.email } : undefined,
    }),
  },
];

// ---------- chamada à API da Iris ----------
const enc = (v) => encodeURIComponent(String(v ?? ''));
const clean = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) : o);

class ToolError extends Error {}

async function api(method, path, body, query) {
  if (!TOKEN) throw new ToolError('Falta a chave da API: defina IRIS_API_TOKEN (gere em Iris > Integrações > API). Precisa do plano Pro.');
  const qs = new URLSearchParams(clean(query) || {}).toString();
  let res;
  try {
    res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'user-agent': `iris-mcp/${VERSION}` },
      body: body ? JSON.stringify(clean(body)) : undefined,
      signal: AbortSignal.timeout(60_000), // o servidor grátis pode levar ~50s para acordar
    });
  } catch (err) {
    throw new ToolError(`Não consegui falar com a Iris em ${BASE}: ${err.name === 'TimeoutError' ? 'tempo esgotado' : err.message}`);
  }
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { error: text.slice(0, 300) }; }
  if (!res.ok) throw new ToolError(`Iris respondeu ${res.status}: ${json.error || 'erro'}`);
  return json.data;
}

// ---------- protocolo MCP (JSON-RPC por stdio) ----------
const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
const log = (...a) => process.stderr.write(`[iris-mcp] ${a.join(' ')}\n`);

const methods = {
  initialize: (p = {}) => ({
    protocolVersion: PROTOCOLS.includes(p.protocolVersion) ? p.protocolVersion : PROTOCOLS[0],
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'iris', title: 'Iris', version: VERSION },
    instructions: 'Ferramentas da Iris (IA de atendimento e vendas para WhatsApp e Mercado Livre). Comece com iris_resumo. Ferramentas que enviam mensagem ao cliente (responder, enviar WhatsApp, aprovar sugestão) mandam de verdade: confirme o texto com o usuário antes.',
  }),
  ping: () => ({}),
  'tools/list': () => ({ tools: TOOLS.map(({ run, ...t }) => t) }),
  'tools/call': async (p = {}) => {
    const tool = TOOLS.find((t) => t.name === p.name);
    if (!tool) throw Object.assign(new Error(`ferramenta desconhecida: ${p.name}`), { code: -32602 });
    try {
      const data = await tool.run(p.arguments || {});
      return { content: [{ type: 'text', text: JSON.stringify(data ?? null, null, 2) }], structuredContent: Array.isArray(data) ? { items: data } : (data ?? {}) };
    } catch (err) {
      if (!(err instanceof ToolError)) log('erro em', p.name, err.stack || err.message);
      return { isError: true, content: [{ type: 'text', text: err instanceof ToolError ? err.message : `erro inesperado: ${err.message}` }] };
    }
  },
  'resources/list': () => ({ resources: [] }),
  'prompts/list': () => ({ prompts: [] }),
};

async function handle(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'JSON inválido' } }); }
  for (const m of [].concat(msg)) {
    if (!m || typeof m.method !== 'string') continue; // respostas do cliente: ignoradas
    const isRequest = m.id !== undefined && m.id !== null;
    const fn = methods[m.method];
    if (!fn) {
      if (isRequest) send({ id: m.id, error: { code: -32601, message: `método não suportado: ${m.method}` } });
      continue; // notificações (ex.: notifications/initialized) não têm resposta
    }
    try {
      const result = await fn(m.params);
      if (isRequest) send({ id: m.id, result });
    } catch (err) {
      if (isRequest) send({ id: m.id, error: { code: err.code || -32603, message: err.message } });
    }
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
let pending = Promise.resolve();
rl.on('line', (line) => { if (line.trim()) pending = pending.then(() => handle(line)); });
rl.on('close', () => pending.then(() => process.exit(0)));
if (!TOKEN) log('aviso: IRIS_API_TOKEN não definido; as ferramentas vão pedir a chave.');
