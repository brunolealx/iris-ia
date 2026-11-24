// API da Omie: produtos (importação em massa ou um por um), pedidos e NF-e.
// Todas as chamadas são POST com { call, app_key, app_secret, param: [ ... ] }.
// Credenciais por cliente: { app_key, app_secret } (criptografadas).
const BASE = 'https://app.omie.com.br/api/v1';

export class OmieError extends Error {}

export async function omie({ app_key, app_secret }, path, call, param) {
  const res = await fetch(`${BASE}/${path}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ call, app_key, app_secret, param: [param] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.faultstring) {
    const e = new OmieError(`Omie ${call}: ${data.faultstring || res.status}`);
    // "Não existem registros" não é erro de verdade
    e.empty = /n[aã]o existem registros/i.test(data.faultstring || '');
    e.permanent = res.status === 500 && /chave|app_key|app_secret|permiss/i.test(data.faultstring || '');
    throw e;
  }
  return data;
}

/** Converte um produto da Omie para a tabela products. */
export function mapProduct(p) {
  return {
    source: 'omie',
    external_id: String(p.codigo_produto),
    sku: p.codigo || null,
    name: p.descricao,
    description: [p.descr_detalhada, p.obs_internas].filter(Boolean).join('\n').slice(0, 5000),
    price_cents: p.valor_unitario != null ? Math.round(Number(p.valor_unitario) * 100) : null,
    unit: p.unidade || null,
    ncm: p.ncm || null,
    active: p.inativo !== 'S' && p.bloqueado !== 'S',
    attributes: {
      marca: p.marca || undefined,
      modelo: p.modelo || undefined,
      peso_liq: p.peso_liq || undefined,
      altura: p.altura || undefined,
      largura: p.largura || undefined,
      profundidade: p.profundidade || undefined,
      ean: p.ean || undefined,
    },
  };
}

/** Uma página de produtos (ListarProdutos). */
export function listProducts(creds, page, perPage = 100) {
  return omie(creds, 'geral/produtos', 'ListarProdutos', {
    pagina: page,
    registros_por_pagina: perPage,
    apenas_importado_api: 'N',
    filtrar_apenas_omiepdv: 'N',
  });
}

/** Um produto pelo código (SKU) ou pelo código interno da Omie. */
export function getProduct(creds, { codigo, codigo_produto }) {
  return omie(creds, 'geral/produtos', 'ConsultarProduto', codigo_produto ? { codigo_produto: Number(codigo_produto) } : { codigo });
}

/** Saldo de estoque por produto (ListarPosEstoque). */
export async function stockPage(creds, page) {
  const today = new Date().toLocaleDateString('pt-BR');
  return omie(creds, 'estoque/consulta', 'ListarPosEstoque', { nPagina: page, nRegPorPagina: 100, dDataPosicao: today, cExibeTodos: 'N' });
}

// ---------- Pedido de venda e NF-e ----------
// ATENÇÃO: confira os campos obrigatórios da sua conta (categoria, conta corrente,
// cenário fiscal) em https://app.omie.com.br/api/v1/produtos/pedido/ antes de ligar no modo automático.

export function upsertClient(creds, buyer) {
  return omie(creds, 'geral/clientes', 'UpsertClienteCpfCnpj', {
    codigo_cliente_integracao: `ml-${buyer.id}`,
    razao_social: buyer.name || buyer.nickname || `Cliente ML ${buyer.id}`,
    nome_fantasia: buyer.nickname || buyer.name || '',
    cnpj_cpf: buyer.doc || '',
    email: buyer.email || '',
    cidade: buyer.city || '',
    estado: buyer.state || '',
    cep: buyer.zip || '',
    endereco: buyer.street || '',
    endereco_numero: buyer.number || '',
    bairro: buyer.neighborhood || '',
  });
}

export function createOrder(creds, { integrationCode, clientCode, items, categoryCode, accountCode, obs }) {
  return omie(creds, 'produtos/pedido', 'IncluirPedido', {
    cabecalho: {
      codigo_pedido_integracao: integrationCode,
      codigo_cliente: clientCode,
      data_previsao: new Date().toLocaleDateString('pt-BR'),
      etapa: '10',
      quantidade_itens: items.length,
    },
    det: items.map((it, i) => ({
      ide: { codigo_item_integracao: `${integrationCode}-${i + 1}` },
      produto: { codigo_produto: Number(it.omieCode), quantidade: it.quantity, valor_unitario: it.unitPrice },
    })),
    informacoes_adicionais: { codigo_categoria: categoryCode, codigo_conta_corrente: Number(accountCode), consumidor_final: 'S', enviar_email: 'N' },
    observacoes: { obs_venda: obs || '' },
  });
}

/** Fatura o pedido (a Omie transmite a NF-e para a SEFAZ). */
export function invoiceOrder(creds, omieOrderId) {
  return omie(creds, 'produtos/pedidovendafat', 'FaturarPedidoVenda', { nCodPed: Number(omieOrderId) });
}

/** Busca a NF-e autorizada do pedido e devolve { key, xml } ou null se ainda não saiu. */
export async function getInvoiceXml(creds, omieOrderId) {
  let nf;
  try {
    nf = await omie(creds, 'produtos/nfconsultar', 'ConsultarNF', { nIdPedido: Number(omieOrderId) });
  } catch (e) {
    if (e.empty) return null;
    throw e;
  }
  const nId = nf?.compl?.nIdNF;
  if (!nId) return null;
  const docs = await omie(creds, 'produtos/dfedocs', 'ObterNfe', { nIdNfe: Number(nId) });
  if (!docs?.cXmlNfe) return null;
  return { key: nf?.compl?.cChaveNFe || null, xml: docs.cXmlNfe };
}
