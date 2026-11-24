// Google Drive do cliente: estrutura de pastas + planilha de gestão, usadas sempre pela Iris.
import { db, eq } from '../db.js';
import { integrationOf, loadOrg } from '../tenants.js';
import { enqueue, permanent } from '../queue.js';
import { sheets } from '../channels/google.js';
import * as T from '../sheets-template.js';

async function ctx(orgId) {
  const integ = await integrationOf(orgId, 'google');
  if (!integ || integ.status === 'disconnected') throw permanent('Google Drive não conectado');
  return { integ, g: sheets(integ) };
}

const saveMeta = (integ, patch) =>
  db.update('integrations', { id: eq(integ.id) }, { meta: { ...integ.meta, ...patch }, status: 'connected', last_error: null, updated_at: new Date().toISOString() });

/**
 * Cria (uma vez) a pasta "Iris — <empresa>" com as subpastas e a planilha de gestão dentro,
 * e depois exporta o que já existe no sistema.
 */
export async function setupSheet(_payload, job) {
  const orgId = job.org_id;
  const { integ, g } = await ctx(orgId);
  const { org } = await loadOrg(orgId);
  const meta = { ...integ.meta };

  if (!meta.rootFolderId) {
    const root = await g.createFolder(`Iris — ${org.name}`);
    meta.rootFolderId = root.id;
    meta.rootFolderUrl = root.webViewLink;
    meta.folders = {};
    await saveMeta(integ, meta);
  }
  for (const name of T.FOLDERS) {
    if (!meta.folders?.[name]) {
      meta.folders = { ...meta.folders, [name]: (await g.createFolder(name, meta.rootFolderId)).id };
    }
  }
  if (!meta.spreadsheetId) {
    const created = await g.create(T.createBody(org.name));
    await g.setValues(created.spreadsheetId, T.valuesData());
    await g.batchUpdate(created.spreadsheetId, T.formatRequests());
    await g.moveTo(created.spreadsheetId, meta.rootFolderId);
    meta.spreadsheetId = created.spreadsheetId;
    meta.spreadsheetUrl = created.spreadsheetUrl;
  }
  meta.createdAt ??= new Date().toISOString();
  await saveMeta(integ, meta);
  await enqueue('google.export', orgId, {});
}

/** Exporta vendas, clientes e produtos atuais (até 2.000 de cada). */
export async function exportAll(_payload, job) {
  const orgId = job.org_id;
  const { integ, g } = await ctx(orgId);
  const id = integ.meta?.spreadsheetId;
  if (!id) throw permanent('planilha ainda não criada');
  const [orders, contacts, products] = await Promise.all([
    db.select('orders', { org_id: eq(orgId), select: '*', order: 'created_at.asc', limit: 2000 }),
    db.select('contacts', { org_id: eq(orgId), select: '*', order: 'created_at.asc', limit: 2000 }),
    db.select('products', { org_id: eq(orgId), select: '*', order: 'name.asc', limit: 2000 }),
  ]);
  const names = Object.fromEntries((contacts || []).map((c) => [c.id, c.name]));
  if (orders?.length) await g.append(id, 'Vendas!A:L', orders.map((o) => T.orderRow(o, names[o.contact_id])));
  if (contacts?.length) await g.append(id, 'Clientes!A:H', contacts.map(T.contactRow));
  if (products?.length) await g.append(id, 'Produtos!A:I', products.map(T.productRow));
}

/** Acrescenta uma linha quando chega venda ou cliente novo. */
export async function appendRow({ kind, id: rowId }, job) {
  const orgId = job.org_id;
  const { integ, g } = await ctx(orgId);
  const sheetId = integ.meta?.spreadsheetId;
  if (!sheetId) return;
  if (kind === 'order') {
    const o = await db.one('orders', { id: eq(rowId), org_id: eq(orgId), select: '*' });
    if (!o) return;
    const c = o.contact_id ? await db.one('contacts', { id: eq(o.contact_id), select: 'name' }) : null;
    await g.append(sheetId, 'Vendas!A:L', [T.orderRow(o, c?.name)]);
  } else if (kind === 'contact') {
    const c = await db.one('contacts', { id: eq(rowId), org_id: eq(orgId), select: '*' });
    if (c) await g.append(sheetId, 'Clientes!A:H', [T.contactRow(c)]);
  }
}

/** Guarda o XML da nota em Notas Fiscais/<ano>/<mês>. Ignora se o Drive não estiver conectado. */
export async function saveInvoiceToDrive(orgId, { key, xml, orderExternalId, kind = 'NF-e' }) {
  const integ = await integrationOf(orgId, 'google');
  const base = integ?.meta?.folders?.['Notas Fiscais'];
  if (!integ || integ.status !== 'connected' || !base) return null;
  const g = sheets(integ);
  const now = new Date();
  const year = String(now.getFullYear());
  const month = now.toLocaleDateString('pt-BR', { month: '2-digit' }) + ' - ' + now.toLocaleDateString('pt-BR', { month: 'long' });
  const yearId = (await g.findChild(base, year))?.id || (await g.createFolder(year, base)).id;
  const monthId = (await g.findChild(yearId, month))?.id || (await g.createFolder(month, yearId)).id;
  return g.upload(monthId, `${kind} ${key || orderExternalId}.xml`, 'text/xml', xml);
}
