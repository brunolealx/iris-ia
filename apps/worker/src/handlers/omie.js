// Importação de produtos da Omie: em massa (todas as páginas) ou um por um.
import { db, eq } from '../db.js';
import { integrationOf, getSecret, loadOrg, markIntegrationError } from '../tenants.js';
import { enqueue, permanent } from '../queue.js';
import * as omie from '../channels/omie.js';
import { hasFeature } from '../shared.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function credsFor(orgId) {
  const { plan } = await loadOrg(orgId);
  if (!hasFeature(plan, 'omie')) throw permanent(`integração Omie não inclusa no plano ${plan.name}`);
  const integ = await integrationOf(orgId, 'omie');
  if (!integ) throw permanent('Omie não conectada');
  return { integ, creds: await getSecret(integ.id), plan };
}

async function saveProducts(orgId, rows, plan) {
  if (!rows.length) return 0;
  const count = (await db.select('products', { org_id: eq(orgId), select: 'id', limit: plan.products_max + 1 }))?.length || 0;
  const ids = rows.map((r) => `"${String(r.external_id).replace(/"/g, '')}"`).join(',');
  const known = new Set(
    ((await db.select('products', { org_id: eq(orgId), source: eq(rows[0].source), external_id: `in.(${ids})`, select: 'external_id' })) || []).map((r) => r.external_id)
  );
  // atualiza os que já existem; novos só até o limite do plano
  let room = Math.max(0, plan.products_max - count);
  const batch = rows
    .filter((r) => known.has(r.external_id) || room-- > 0)
    .map((r) => ({ ...r, org_id: orgId, updated_at: new Date().toISOString() }));
  if (batch.length) await db.upsert('products', batch, 'org_id,source,external_id');
  return batch.length;
}

/**
 * payload: { mode: 'all', page?: 1 }  → importa uma página e agenda a próxima
 *          { mode: 'one', codigo?: 'SKU', codigo_produto?: 123 }
 */
export async function importOmie(payload, job) {
  const orgId = job.org_id;
  const { integ, creds, plan } = await credsFor(orgId);

  if (payload.mode === 'one') {
    const p = await omie.getProduct(creds, payload);
    await saveProducts(orgId, [omie.mapProduct(p)], plan);
    return;
  }

  const page = Number(payload.page || 1);
  let data;
  try {
    data = await omie.listProducts(creds, page, 100);
  } catch (e) {
    if (e.empty) return;
    if (e.permanent) await markIntegrationError(integ.id, e.message);
    throw e;
  }
  const rows = (data.produto_servico_cadastro || []).map(omie.mapProduct);
  await saveProducts(orgId, rows, plan);
  await db.update('integrations', { id: eq(integ.id) }, {
    meta: { ...integ.meta, import: { page, totalPages: data.total_de_paginas, total: data.total_de_registros, at: new Date().toISOString() } },
    status: 'connected', last_error: null,
  });
  if (page < Number(data.total_de_paginas || 1)) {
    // uma página por job, com pausa: respeita o limite de requisições da Omie
    await enqueue('omie.import', orgId, { mode: 'all', page: page + 1 }, null, 2);
  } else {
    await enqueue('omie.stock', orgId, { page: 1 });
  }
}

/** Atualiza o estoque a partir da posição de estoque da Omie. */
export async function syncStock(payload, job) {
  const orgId = job.org_id;
  const { creds } = await credsFor(orgId);
  const page = Number(payload.page || 1);
  let data;
  try {
    data = await omie.stockPage(creds, page);
  } catch (e) {
    if (e.empty) return;
    throw e;
  }
  for (const p of data.produtos || []) {
    await db.update('products', { org_id: eq(orgId), source: 'eq.omie', external_id: eq(p.nCodProd) }, { stock: p.nSaldo, updated_at: new Date().toISOString() });
    await sleep(20);
  }
  if (page < Number(data.nTotPaginas || 1)) await enqueue('omie.stock', orgId, { page: page + 1 }, null, 2);
}
