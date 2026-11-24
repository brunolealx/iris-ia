import { NextResponse } from 'next/server';
import { requireOrg, saveIntegration } from '@/lib/org';
import { checkState, appUrl } from '@/lib/oauth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { org } = await requireOrg();
  if (!(await checkState('ml', url.searchParams.get('state')))) return NextResponse.redirect(appUrl('/app/integracoes?erro=state'));
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(appUrl('/app/integracoes?erro=ml'));

  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: process.env.ML_CLIENT_ID!, client_secret: process.env.ML_CLIENT_SECRET!,
      code, redirect_uri: appUrl('/api/ml/callback'),
    }),
  });
  const t = await res.json();
  if (!res.ok) return NextResponse.redirect(appUrl(`/app/integracoes?erro=${encodeURIComponent(t.message || 'ml')}`));

  // a mesma conta do ML não pode estar ligada a duas empresas
  const { data: other } = await supabaseAdmin().from('integrations').select('org_id').eq('provider', 'mercadolivre').eq('external_id', String(t.user_id)).neq('org_id', org.id).maybeSingle();
  if (other) return NextResponse.redirect(appUrl('/app/integracoes?erro=conta-ml-em-uso'));

  const me = await fetch('https://api.mercadolibre.com/users/me', { headers: { authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
  await saveIntegration(org.id, 'mercadolivre', { external_id: String(t.user_id), display_name: me.nickname || String(t.user_id), meta: { site: me.site_id } }, {
    access_token: t.access_token, refresh_token: t.refresh_token, user_id: String(t.user_id), expires_at: Date.now() + (t.expires_in - 300) * 1000,
  });
  return NextResponse.redirect(appUrl('/app/integracoes?ok=ml'));
}
