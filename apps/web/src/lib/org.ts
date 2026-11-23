import 'server-only';
import { redirect } from 'next/navigation';
import { supabaseServer, supabaseAdmin } from './supabase';
import { encryptJson } from '@iris/shared/crypto';

export type Org = Record<string, any> & { id: string; name: string; plan_id: string; status: string };
export type Plan = Record<string, any> & { id: string; name: string; features: string[]; ai_replies_month: number };

/** Usuário + organização atual. Redireciona para /entrar se não estiver logado. */
export async function requireOrg() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/entrar');
  const { data: mem } = await sb.from('memberships').select('org_id, role').eq('user_id', user.id).limit(1).single();
  if (!mem) redirect('/entrar?erro=sem-empresa');
  const { data: org } = await sb.from('organizations').select('*').eq('id', mem.org_id).single();
  const { data: plan } = await sb.from('plans').select('*').eq('id', org.plan_id).single();
  return { sb, user, org: org as Org, plan: plan as Plan, role: mem.role as 'owner' | 'admin' | 'agent' };
}

export async function requirePlatformAdmin() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/entrar');
  const { data } = await sb.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!data) redirect('/app');
  return { user };
}

/** Salva uma integração e o segredo criptografado (service_role). */
export async function saveIntegration(orgId: string, provider: string, info: { external_id?: string; display_name?: string; meta?: any }, secret: any) {
  const admin = supabaseAdmin();
  const { data: integ, error } = await admin
    .from('integrations')
    .upsert(
      { org_id: orgId, provider, status: 'connected', last_error: null, updated_at: new Date().toISOString(), ...info },
      { onConflict: 'org_id,provider' }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await admin
    .from('integration_secrets')
    .upsert({ integration_id: integ.id, ciphertext: encryptJson(secret, process.env.ENCRYPTION_KEY!), updated_at: new Date().toISOString() });
  if (e2) throw new Error(e2.message);
  return integ;
}

export const hasFeature = (plan: Plan, f: string) => plan?.features?.includes(f);
