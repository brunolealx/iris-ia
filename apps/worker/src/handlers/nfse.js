// Emissão e cancelamento de NFS-e Nacional (serviços) pela API do governo federal.
// A nota nasce no painel (Notas de serviço) como "pending" e este job envia à Sefin Nacional.
import { db, eq } from '../db.js';
import { integrationOf, getSecret, loadOrg } from '../tenants.js';
import { permanent } from '../queue.js';
import { emit } from '../crm.js';
import { hasFeature } from '../shared.js';
import * as nfse from '../channels/nfse.js';
import { saveInvoiceToDrive } from './google.js';

const now = () => new Date().toISOString();
const set = (id, patch) => db.update('service_invoices', { id: eq(id) }, { ...patch, updated_at: now() });
const digits = (v) => String(v ?? '').replace(/\D/g, '');

async function setup(orgId) {
  const { plan } = await loadOrg(orgId);
  if (!hasFeature(plan, 'nfse')) throw permanent(`NFS-e não está inclusa no plano ${plan.name}`);
  const integ = await integrationOf(orgId, 'nfse');
  if (!integ || integ.status === 'disconnected') throw permanent('Configure a NFS-e em Integrações (certificado A1 e dados do prestador)');
  const cfg = integ.meta?.config || {};
  let cert;
  try {
    cert = await nfse.loadCertificate(`${integ.id}:${integ.updated_at}`, await getSecret(integ.id));
  } catch (e) {
    throw permanent(`Certificado: ${e.message}`);
  }
  // o certificado precisa ser da mesma empresa (raiz do CNPJ) que presta o serviço
  const doc = digits(cfg.cnpj || cfg.cpf);
  if (cert.cnpj && doc.length === 14 && cert.cnpj.slice(0, 8) !== doc.slice(0, 8)) {
    throw permanent(`O certificado é do CNPJ ${cert.cnpj}, mas o prestador configurado é ${doc}`);
  }
  return { cfg, cert, api: nfse.client(cfg, cert) };
}

async function finish(orgId, inv, res, api) {
  const chave = res.json?.chaveAcesso;
  let xml = nfse.unpack(res.json?.nfseXmlGZipB64);
  if (!xml && chave) xml = nfse.unpack((await api.nfse(chave)).json?.nfseXmlGZipB64);
  const number = xml?.match(/<nNFSe>(\d+)<\/nNFSe>/)?.[1] || null;
  const alerts = (res.json?.alertas || []).map((a) => [a.Codigo, a.Descricao].filter(Boolean).join(' - ')).join('; ') || null;
  await set(inv.id, { status: 'authorized', chave, nfse_number: number, xml, error: alerts });
  if (xml) await saveInvoiceToDrive(orgId, { key: chave, xml, orderExternalId: inv.id, kind: 'NFS-e' }).catch((e) => console.warn('[nfse] Drive:', e.message));
  await emit(orgId, 'service_invoice.authorized', { id: inv.id, chave, number, amountCents: inv.amount_cents, taker: inv.taker });
}

export async function emitNfse({ invoiceId }, job) {
  const orgId = job.org_id;
  const inv = await db.one('service_invoices', { id: eq(invoiceId), org_id: eq(orgId), select: '*' });
  if (!inv) throw permanent('nota não encontrada');
  if (['authorized', 'canceled'].includes(inv.status)) return;

  try {
    const { cfg, cert, api } = await setup(orgId);
    const missing = nfse.checkConfig(cfg);
    if (missing.length) throw permanent(`Falta configurar: ${missing.join(', ')}`);
    if (!(inv.amount_cents > 0)) throw permanent('Valor do serviço precisa ser maior que zero');
    if (!String(inv.description || '').trim()) throw permanent('Descreva o serviço prestado');

    // número da DPS: sequencial por série, reservado antes do envio (reenvio usa o mesmo número)
    const serie = digits(cfg.serie || '1') || '1';
    if (!inv.number) {
      const last = await db.one('service_invoices', { org_id: eq(orgId), serie: eq(serie), order: 'number.desc.nullslast', limit: 1, select: 'number' });
      inv.number = Math.max(Number(last?.number || 0) + 1, Number(cfg.nextNumber || 1));
      inv.serie = serie;
      inv.dps_id = nfse.dpsId(cfg, inv.number);
      await set(inv.id, { number: inv.number, serie, dps_id: inv.dps_id });
    }

    // uma tentativa anterior pode ter chegado ao governo: confere antes de reenviar
    if (inv.status === 'processing') {
      const prev = await api.byDps(inv.dps_id).catch(() => null);
      if (prev?.status === 200 && prev.json?.chaveAcesso) return finish(orgId, inv, prev, api);
    }
    await set(inv.id, { status: 'processing', error: null });

    const body = nfse.infDpsBody(cfg, {
      number: inv.number, competencia: inv.competencia, amountCents: inv.amount_cents, issRetido: inv.iss_retido,
      taker: inv.taker || {}, service: { ...(inv.service || {}), description: inv.description },
    });
    const xml = nfse.signedDocument({ root: 'DPS', child: 'infDPS', id: inv.dps_id, body, key: cert.key, certB64: cert.certB64 });
    const res = await api.emit(xml);

    if (res.status >= 200 && res.status < 300 && res.json?.chaveAcesso) return finish(orgId, inv, res, api);
    if (res.status >= 500 || res.status === 429) throw new Error(`Sefin Nacional ${res.status}: ${nfse.errorsText(res.json)}`); // tenta de novo
    // DPS já processada antes (reenvio): recupera a chave
    const dup = await api.byDps(inv.dps_id).catch(() => null);
    if (dup?.status === 200 && dup.json?.chaveAcesso) return finish(orgId, inv, dup, api);
    await set(inv.id, { status: 'rejected', error: nfse.errorsText(res.json).slice(0, 1000) });
    await emit(orgId, 'service_invoice.rejected', { id: inv.id, error: nfse.errorsText(res.json) });
  } catch (err) {
    if (err.permanent) await set(inv.id, { status: 'error', error: err.message.slice(0, 1000) });
    throw err;
  }
}

export async function cancelNfse({ invoiceId, cMotivo = 1, xMotivo }, job) {
  const orgId = job.org_id;
  const inv = await db.one('service_invoices', { id: eq(invoiceId), org_id: eq(orgId), select: '*' });
  if (!inv) throw permanent('nota não encontrada');
  if (inv.status !== 'authorized' || !inv.chave) throw permanent('Só é possível cancelar uma nota autorizada');
  const motivo = String(xMotivo || '').trim();
  if (motivo.length < 15) throw permanent('Explique o motivo do cancelamento (mínimo 15 caracteres)');

  const { cfg, cert, api } = await setup(orgId);
  const body = nfse.cancelEventBody(cfg, { chave: inv.chave, cMotivo, xMotivo: motivo });
  const xml = nfse.signedDocument({ root: 'pedRegEvento', child: 'infPedReg', id: `PRE${inv.chave}101101`, body, key: cert.key, certB64: cert.certB64 });
  const res = await api.event(inv.chave, xml);
  if (res.status >= 200 && res.status < 300) {
    await set(inv.id, { status: 'canceled', cancel_reason: motivo, error: null });
    await emit(orgId, 'service_invoice.canceled', { id: inv.id, chave: inv.chave });
    return;
  }
  if (res.status >= 500) throw new Error(`Sefin Nacional ${res.status}: ${nfse.errorsText(res.json)}`);
  await set(inv.id, { error: `Cancelamento recusado: ${nfse.errorsText(res.json)}`.slice(0, 1000) });
  throw permanent(nfse.errorsText(res.json));
}
