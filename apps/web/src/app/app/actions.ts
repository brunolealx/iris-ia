'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg, saveIntegration, hasFeature } from '@/lib/org';
import { supabaseAdmin } from '@/lib/supabase';
import { newApiKey } from '@iris/shared/crypto';

type Result = { ok: boolean; message: string; secret?: string };
const ok = (message: string, extra: Partial<Result> = {}): Result => ({ ok: true, message, ...extra });
const fail = (message: string): Result => ({ ok: false, message });
const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? '').trim().slice(0, max);

/** Cria um job para o worker (RLS: só na própria organização). */
async function job(sb: any, orgId: string, kind: string, payload: any) {
  const { error } = await sb.from('jobs').insert({ org_id: orgId, kind, payload });
  if (error) throw new Error(error.message);
}

// ---------------- Conversas ----------------

export async function approveDraft(_: any, f: FormData): Promise<Result> {
  const { sb, org } = await requireOrg();
  const id = str(f, 'id', 60);
  const text = str(f, 'text', 4000);
  if (!text) return fail('A resposta está vazia.');
  const { data: d } = await sb.from('drafts').select('id,status').eq('id', id).eq('org_id', org.id).single();
  if (!d || d.status !== 'pending') return fail('Rascunho não encontrado ou já tratado.');
  await sb.from('drafts').update({ status: 'queued', reply: text, updated_at: new Date().toISOString() }).eq('id', id);
  await job(sb, org.id, 'outbound.send', { draftId: id, text });
  revalidatePath('/app/conversas');
  return ok('Enviando…');
}

export async function discardDraft(f: FormData) {
  const { sb, org } = await requireOrg();
  await sb.from('drafts').update({ status: 'discarded', updated_at: new Date().toISOString() }).eq('id', str(f, 'id', 60)).eq('org_id', org.id);
  revalidatePath('/app/conversas');
}

export async function sendManual(_: any, f: FormData): Promise<Result> {
  const { sb, org } = await requireOrg();
  const text = str(f, 'text', 4000);
  const conversationId = str(f, 'conversationId', 60);
  if (!text) return fail('Escreva a mensagem.');
  await job(sb, org.id, 'outbound.send', { conversationId, text });
  revalidatePath(`/app/conversas/${conversationId}`);
  return ok('Mensagem na fila de envio.');
}

export async function toggleAi(f: FormData) {
  const { sb, org } = await requireOrg();
  const id = str(f, 'conversationId', 60);
  await sb.from('conversations').update({ ai_paused: str(f, 'paused') === '1' }).eq('id', id).eq('org_id', org.id);
  revalidatePath(`/app/conversas/${id}`);
}

// ---------------- CRM ----------------

const STAGES = ['lead', 'negociacao', 'cliente', 'pos_venda', 'perdido'];

export async function moveContact(f: FormData) {
  const { sb, org } = await requireOrg();
  const stage = str(f, 'stage');
  if (!STAGES.includes(stage)) return;
  await sb.from('contacts').update({ stage }).eq('id', str(f, 'id', 60)).eq('org_id', org.id);
  revalidatePath('/app/crm');
}

export async function saveContact(_: any, f: FormData): Promise<Result> {
  const { sb, org } = await requireOrg();
  const id = str(f, 'id', 60);
  const row: any = {
    name: str(f, 'name', 120) || null,
    phone: str(f, 'phone', 30) || null,
    email: str(f, 'email', 200) || null,
    notes: str(f, 'notes', 5000),
    tags: str(f, 'tags', 300).split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20),
  };
  if (id) await sb.from('contacts').update(row).eq('id', id).eq('org_id', org.id);
  else {
    const phone = row.phone?.replace(/\D/g, '');
    const { error } = await sb.from('contacts').insert({ ...row, org_id: org.id, channel: phone ? 'whatsapp' : 'manual', external_id: phone || crypto.randomUUID() });
    if (error) return fail(error.message.includes('duplicate') ? 'Esse contato já existe.' : error.message);
  }
  revalidatePath('/app/crm');
  return ok('Contato salvo.');
}

// ---------------- IA ----------------

export async function saveAi(_: any, f: FormData): Promise<Result> {
  const { sb, org } = await requireOrg();
  const modes = ['suggest', 'auto', 'off'];
  const patch = {
    name: str(f, 'name', 80) || org.name,
    ai_name: str(f, 'ai_name', 40) || 'Iris',
    ai_tone: str(f, 'ai_tone', 200) || 'cordial, direto e curto',
    knowledge: str(f, 'knowledge', 20000),
    mode_whatsapp: modes.includes(str(f, 'mode_whatsapp')) ? str(f, 'mode_whatsapp') : 'suggest',
    mode_ml: modes.includes(str(f, 'mode_ml')) ? str(f, 'mode_ml') : 'suggest',
    min_confidence: Math.min(1, Math.max(0.3, Number(str(f, 'min_confidence')) || 0.75)),
    nfe_mode: ['off', 'manual', 'auto'].includes(str(f, 'nfe_mode')) ? str(f, 'nfe_mode') : 'off',
  };
  const { error } = await sb.from('organizations').update(patch).eq('id', org.id);
  if (error) return fail(error.message);
  revalidatePath('/app/ia');
  return ok('Configurações salvas.');
}

// ---------------- Produtos ----------------

export async function importCsv(rows: any[]): Promise<{ ok: boolean; message: string }> {
  const { sb, org, plan } = await requireOrg();
  const { count } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('org_id', org.id);
  const room = Math.max(0, plan.products_max - (count || 0));
  const list = rows.slice(0, Math.min(5000, room || 0)).map((r) => ({
    org_id: org.id, source: 'csv', external_id: String(r.sku).slice(0, 80), sku: String(r.sku).slice(0, 80), name: String(r.name).slice(0, 300),
    price_cents: r.price != null ? Math.round(Number(r.price) * 100) : null, stock: r.stock, description: String(r.description || '').slice(0, 5000),
    updated_at: new Date().toISOString(),
  }));
  if (!list.length) return { ok: false, message: `Limite de ${plan.products_max} produtos do plano atingido.` };
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await sb.from('products').upsert(list.slice(i, i + 500), { onConflict: 'org_id,source,external_id' });
    if (error) return { ok: false, message: error.message };
  }
  revalidatePath('/app/produtos');
  return { ok: true, message: `${list.length} produtos importados${list.length < rows.length ? ` (limite do plano: ${plan.products_max})` : ''}.` };
}

export async function saveProduct(_: any, f: FormData): Promise<Result> {
  const { sb, org } = await requireOrg();
  const sku = str(f, 'sku', 80);
  const name = str(f, 'name', 300);
  if (!sku || !name) return fail('SKU e nome são obrigatórios.');
  const price = str(f, 'price').replace(/\./g, '').replace(',', '.');
  const { error } = await sb.from('products').upsert({
    org_id: org.id, source: 'manual', external_id: sku, sku, name, description: str(f, 'description', 5000),
    price_cents: price ? Math.round(Number(price) * 100) : null, stock: str(f, 'stock') ? Number(str(f, 'stock')) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'org_id,source,external_id' });
  if (error) return fail(error.message);
  revalidatePath('/app/produtos');
  return ok('Produto salvo.');
}

// ---------------- Integrações ----------------

// ---------------- NFS-e Nacional (notas de serviço) ----------------

const digits = (v: string) => v.replace(/\D/g, '');

/** Job criado pelo servidor (os tipos da NFS-e não podem ser criados direto pelo painel). */
async function serverJob(orgId: string, kind: string, payload: any) {
  const { error } = await supabaseAdmin().from('jobs').insert({ org_id: orgId, kind, payload });
  if (error) throw new Error(error.message);
}

export async function saveNfse(_: any, f: FormData): Promise<Result> {
  const { sb, org, plan, role } = await requireOrg();
  if (!hasFeature(plan, 'nfse')) return fail(`A NFS-e não está no plano ${plan.name}.`);
  if (role === 'agent') return fail('Só o dono ou um administrador pode configurar a nota fiscal.');
  const cfg = {
    tpAmb: str(f, 'tpAmb') === '1' ? 1 : 2,
    cnpj: digits(str(f, 'cnpj', 20)),
    im: str(f, 'im', 20),
    cLocEmi: digits(str(f, 'cLocEmi', 10)),
    serie: digits(str(f, 'serie', 5)) || '1',
    nextNumber: Math.max(1, Number(digits(str(f, 'nextNumber', 15))) || 1),
    opSimpNac: ['1', '2', '3'].includes(str(f, 'opSimpNac')) ? str(f, 'opSimpNac') : '1',
    regApTribSN: ['1', '2', '3'].includes(str(f, 'regApTribSN')) ? str(f, 'regApTribSN') : '1',
    regEspTrib: digits(str(f, 'regEspTrib', 1)) || '0',
    cTribNac: digits(str(f, 'cTribNac', 6)),
    cTribMun: str(f, 'cTribMun', 20),
    cNBS: digits(str(f, 'cNBS', 9)),
    pAliq: str(f, 'pAliq', 6).replace(',', '.'),
    pTotTribSN: str(f, 'pTotTribSN', 6).replace(',', '.'),
    ibscbs: {
      enabled: f.get('ibscbs') === 'on',
      cIndOp: digits(str(f, 'cIndOp', 6)), CST: digits(str(f, 'CST', 3)), cClassTrib: digits(str(f, 'cClassTrib', 6)), indFinal: f.get('indFinal') === 'on',
    },
  };
  if (cfg.cnpj.length !== 14 && cfg.cnpj.length !== 11) return fail('Informe o CNPJ (ou CPF) do prestador.');
  if (cfg.cLocEmi.length !== 7) return fail('O código do município é o código IBGE de 7 dígitos (Sorocaba: 3552205).');
  if (cfg.cTribNac.length !== 6) return fail('O código de tributação nacional tem 6 dígitos (item da LC 116, ex.: 010101).');
  if (cfg.cNBS.length !== 9) return fail('O código NBS tem 9 dígitos.');

  const file = f.get('pfx');
  const password = String(f.get('password') ?? '');
  const { data: current } = await sb.from('integrations').select('id,status,meta').eq('org_id', org.id).eq('provider', 'nfse').maybeSingle();
  const info = { external_id: `${org.id}:${cfg.cnpj}`, display_name: `CNPJ ${cfg.cnpj}`, meta: { ...(current?.meta || {}), config: cfg } };

  if (file instanceof File && file.size > 0) {
    if (file.size > 50_000) return fail('O arquivo do certificado parece grande demais (envie o .pfx ou .p12 do certificado A1).');
    const pfx = Buffer.from(await file.arrayBuffer());
    try {
      // confere a senha e o formato antes de guardar (o worker converte e assina)
      const { createSecureContext } = await import('node:tls');
      createSecureContext({ pfx, passphrase: password });
    } catch (e: any) {
      const m = String(e?.message || '');
      if (/mac verify|password/i.test(m)) return fail('Senha do certificado incorreta.');
      if (!/unsupported/i.test(m)) return fail(`Não consegui ler o certificado: ${m}`);
      // certificados antigos (RC2/3DES) não abrem aqui, mas o worker abre com openssl -legacy
    }
    await saveIntegration(org.id, 'nfse', info, { pfxB64: pfx.toString('base64'), password });
  } else if (current && current.status !== 'disconnected') {
    await supabaseAdmin().from('integrations').update({ ...info, updated_at: new Date().toISOString() }).eq('id', current.id);
  } else {
    return fail('Envie o certificado digital A1 (.pfx) da empresa.');
  }
  revalidatePath('/app/integracoes');
  revalidatePath('/app/notas');
  return ok(cfg.tpAmb === 1 ? 'NFS-e configurada em PRODUÇÃO: as notas valem de verdade.' : 'NFS-e configurada em produção restrita (testes, sem valor fiscal).');
}

export async function createServiceInvoice(_: any, f: FormData): Promise<Result> {
  const { sb, org, plan, user } = await requireOrg();
  if (!hasFeature(plan, 'nfse')) return fail(`A NFS-e não está no plano ${plan.name}.`);
  const { data: integ } = await sb.from('integrations').select('status').eq('org_id', org.id).eq('provider', 'nfse').maybeSingle();
  if (!integ || integ.status === 'disconnected') return fail('Configure a NFS-e em Integrações primeiro.');
  const amount = Math.round(Number(str(f, 'amount', 20).replace(/\./g, '').replace(',', '.')) * 100);
  if (!(amount > 0)) return fail('Informe o valor do serviço.');
  const description = str(f, 'description', 2000);
  if (description.length < 5) return fail('Descreva o serviço prestado.');
  const doc = digits(str(f, 'doc', 20));
  if (doc && doc.length !== 11 && doc.length !== 14) return fail('CPF/CNPJ do tomador inválido.');
  const taker = doc ? {
    doc, name: str(f, 'name', 300), email: str(f, 'email', 120), phone: str(f, 'phone', 20),
    cep: digits(str(f, 'cep', 9)), cMun: digits(str(f, 'cMun', 7)), street: str(f, 'street', 200), number: str(f, 'number', 20), district: str(f, 'district', 100),
  } : {};
  if (doc && !taker.name) return fail('Informe o nome do tomador.');
  const { data: inv, error } = await supabaseAdmin().from('service_invoices').insert({
    org_id: org.id, amount_cents: amount, description, taker, created_by: user.id,
    iss_retido: f.get('iss_retido') === 'on',
    competencia: /^\d{4}-\d{2}-\d{2}$/.test(str(f, 'competencia', 10)) ? str(f, 'competencia', 10) : undefined,
    contact_id: str(f, 'contact_id', 60) || null,
  }).select('id').single();
  if (error) return fail(error.message);
  await serverJob(org.id, 'nfse.emit', { invoiceId: inv.id });
  revalidatePath('/app/notas');
  return ok('Enviando para a Sefin Nacional… a página atualiza sozinha.');
}

export async function retryServiceInvoice(f: FormData) {
  const { sb, org } = await requireOrg();
  const id = str(f, 'id', 60);
  const { data: inv } = await sb.from('service_invoices').select('id,status').eq('id', id).eq('org_id', org.id).single();
  if (inv && ['rejected', 'error'].includes(inv.status)) {
    await supabaseAdmin().from('service_invoices').update({ status: 'pending', error: null }).eq('id', id);
    await serverJob(org.id, 'nfse.emit', { invoiceId: id });
  }
  revalidatePath('/app/notas');
}

export async function cancelServiceInvoice(_: any, f: FormData): Promise<Result> {
  const { sb, org, role } = await requireOrg();
  if (role === 'agent') return fail('Só o dono ou um administrador pode cancelar notas.');
  const id = str(f, 'id', 60);
  const reason = str(f, 'reason', 255);
  if (reason.length < 15) return fail('Explique o motivo com pelo menos 15 caracteres.');
  const { data: inv } = await sb.from('service_invoices').select('id,status').eq('id', id).eq('org_id', org.id).single();
  if (!inv || inv.status !== 'authorized') return fail('Só é possível cancelar uma nota autorizada.');
  const cMotivo = ['1', '2', '9'].includes(str(f, 'motivo')) ? Number(str(f, 'motivo')) : 1;
  await serverJob(org.id, 'nfse.cancel', { invoiceId: id, cMotivo, xMotivo: reason });
  revalidatePath('/app/notas');
  return ok('Pedido de cancelamento enviado.');
}

export async function disconnect(f: FormData) {
  const { sb, org } = await requireOrg();
  const provider = str(f, 'provider', 20);
  const { data: integ } = await sb.from('integrations').select('id').eq('org_id', org.id).eq('provider', provider).single();
  if (integ) {
    const admin = supabaseAdmin();
    await admin.from('integration_secrets').delete().eq('integration_id', integ.id);
    await admin.from('integrations').update({ status: 'disconnected', external_id: null }).eq('id', integ.id);
  }
  revalidatePath('/app/integracoes');
}

export async function googleResync() {
  const { sb, org } = await requireOrg();
  await job(sb, org.id, 'google.setup', {});
  revalidatePath('/app/integracoes');
}

export async function generateApiKey(): Promise<Result> {
  const { org, plan, role } = await requireOrg();
  if (role !== 'owner') return fail('Só o dono da conta pode gerar a chave.');
  if (!hasFeature(plan, 'api')) return fail(`A API não está no plano ${plan.name}.`);
  const k = newApiKey();
  await supabaseAdmin().from('organizations').update({ api_key_prefix: k.prefix, api_key_hash: k.hash }).eq('id', org.id);
  revalidatePath('/app/integracoes');
  return ok('Nova chave gerada. A anterior parou de funcionar.', { secret: k.full });
}

export async function addWebhook(_: any, f: FormData): Promise<Result> {
  const { sb, org, plan } = await requireOrg();
  if (!hasFeature(plan, 'webhooks')) return fail(`Webhooks não estão no plano ${plan.name}.`);
  const url = str(f, 'url', 500);
  if (!/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) return fail('Use uma URL https válida.');
  const events = f.getAll('events').map(String).filter(Boolean);
  const { error } = await sb.from('webhook_endpoints').insert({ org_id: org.id, url, events: events.length ? events : undefined });
  if (error) return fail(error.message);
  revalidatePath('/app/integracoes');
  return ok('Webhook cadastrado.');
}

export async function removeWebhook(f: FormData) {
  const { sb, org } = await requireOrg();
  await sb.from('webhook_endpoints').delete().eq('id', str(f, 'id', 60)).eq('org_id', org.id);
  revalidatePath('/app/integracoes');
}

// ---------------- Vendas ----------------

export async function retryNfe(f: FormData) {
  const { sb, org } = await requireOrg();
  const id = str(f, 'id', 60);
  await sb.from('orders').update({ nfe_status: 'processing', nfe_error: null, nfe_invoice_id: null }).eq('id', id).eq('org_id', org.id);
  await job(sb, org.id, 'nfe.process', { orderId: id, manual: true });
  revalidatePath('/app/vendas');
}

/** Emite a NF-e de uma venda pelo Faturador do Mercado Livre (botão em Vendas). */
export async function emitNfe(f: FormData) {
  const { sb, org, plan } = await requireOrg();
  if (!hasFeature(plan, 'nfe')) return;
  const id = str(f, 'id', 60);
  const { data: o } = await sb.from('orders').select('id,nfe_status,source,status').eq('id', id).eq('org_id', org.id).single();
  if (o && o.source === 'mercadolivre' && o.status === 'paid' && ['none', 'error'].includes(o.nfe_status)) {
    await sb.from('orders').update({ nfe_status: 'processing', nfe_error: null, nfe_invoice_id: null }).eq('id', id);
    await job(sb, org.id, 'nfe.process', { orderId: id, manual: true });
  }
  revalidatePath('/app/vendas');
}
