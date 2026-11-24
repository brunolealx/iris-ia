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
    nfe_mode: ['off', 'order_only', 'auto'].includes(str(f, 'nfe_mode')) ? str(f, 'nfe_mode') : 'off',
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

export async function omieImport(_: any, f: FormData): Promise<Result> {
  const { sb, org, plan } = await requireOrg();
  if (!hasFeature(plan, 'omie')) return fail(`A importação da Omie não está no plano ${plan.name}.`);
  const code = str(f, 'codigo', 80);
  await job(sb, org.id, 'omie.import', code ? { mode: 'one', codigo: code } : { mode: 'all', page: 1 });
  return ok(code ? `Importando o produto ${code}…` : 'Importação completa iniciada. Acompanhe a contagem nesta página.');
}

// ---------------- Integrações ----------------

export async function connectOmie(_: any, f: FormData): Promise<Result> {
  const { org, plan } = await requireOrg();
  if (!hasFeature(plan, 'omie')) return fail(`Omie não está no plano ${plan.name}.`);
  const app_key = str(f, 'app_key', 40);
  const app_secret = str(f, 'app_secret', 80);
  if (!app_key || !app_secret) return fail('Informe App Key e App Secret.');
  // testa as credenciais antes de salvar
  const res = await fetch('https://app.omie.com.br/api/v1/geral/produtos/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ call: 'ListarProdutos', app_key, app_secret, param: [{ pagina: 1, registros_por_pagina: 1, apenas_importado_api: 'N', filtrar_apenas_omiepdv: 'N' }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.faultstring && !/n[aã]o existem registros/i.test(data.faultstring)) return fail(`A Omie recusou: ${data.faultstring}`);
  await saveIntegration(org.id, 'omie', {
    external_id: `${org.id}:${app_key}`, display_name: `App ${app_key}`,
    meta: { total: data.total_de_registros ?? 0, nfe: { categoryCode: str(f, 'category', 20), accountCode: str(f, 'account', 20) } },
  }, { app_key, app_secret });
  revalidatePath('/app/integracoes');
  return ok(`Omie conectada (${data.total_de_registros ?? 0} produtos encontrados).`);
}

export async function saveOmieNfe(_: any, f: FormData): Promise<Result> {
  const { sb, org } = await requireOrg();
  const { data: integ } = await sb.from('integrations').select('id,meta').eq('org_id', org.id).eq('provider', 'omie').single();
  if (!integ) return fail('Conecte a Omie primeiro.');
  await supabaseAdmin().from('integrations').update({ meta: { ...integ.meta, nfe: { categoryCode: str(f, 'category', 20), accountCode: str(f, 'account', 20) } } }).eq('id', integ.id);
  return ok('Configuração fiscal salva.');
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
  await sb.from('orders').update({ nfe_status: 'none', nfe_error: null }).eq('id', id).eq('org_id', org.id);
  await job(sb, org.id, 'nfe.process', { orderId: id });
  revalidatePath('/app/vendas');
}
