import { NextResponse } from 'next/server';
import { requireOrg, saveIntegration } from '@/lib/org';
import { checkState, appUrl } from '@/lib/oauth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { org } = await requireOrg();
  if (!(await checkState('google', url.searchParams.get('state')))) return NextResponse.redirect(appUrl('/app/integracoes?erro=state'));
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(appUrl('/app/integracoes?erro=google'));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: appUrl('/api/google/callback'), grant_type: 'authorization_code',
    }),
  });
  const t = await res.json();
  if (!res.ok || !t.refresh_token) return NextResponse.redirect(appUrl(`/app/integracoes?erro=${encodeURIComponent(t.error_description || 'google-sem-refresh-token')}`));
  if (!String(t.scope || '').includes('drive.file')) return NextResponse.redirect(appUrl('/app/integracoes?erro=permita-o-acesso-ao-drive'));

  // e-mail da conta (do id_token, que veio direto do Google por HTTPS)
  const email = t.id_token ? JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString()).email : null;

  const { data: existing } = await supabaseAdmin().from('integrations').select('meta').eq('org_id', org.id).eq('provider', 'google').maybeSingle();
  const integ = await saveIntegration(org.id, 'google', { external_id: `${org.id}:${email || 'google'}`, display_name: email, meta: existing?.meta || {} }, {
    refresh_token: t.refresh_token, access_token: t.access_token, expires_at: Date.now() + (t.expires_in - 120) * 1000,
  });
  // o worker cria pastas + planilha e exporta os dados atuais
  await supabaseAdmin().from('jobs').insert({ org_id: org.id, kind: 'google.setup', payload: { integrationId: integ.id } });
  return NextResponse.redirect(appUrl('/app/integracoes?ok=google'));
}
