import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { requireOrg, saveIntegration } from '@/lib/org';
import { supabaseAdmin } from '@/lib/supabase';

const G = () => `https://graph.facebook.com/${process.env.WA_GRAPH_VERSION || 'v21.0'}`;

async function graph(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${G()}/${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Meta ${res.status}`);
  return data;
}

/** Recebe o "code" do Cadastro Incorporado, troca pelo token e ativa o número. */
export async function POST(req: Request) {
  const { org } = await requireOrg();
  const { code, phone_number_id, waba_id } = await req.json().catch(() => ({}));
  if (!code || !phone_number_id || !waba_id) return NextResponse.json({ error: 'Cadastro incompleto: escolha um número no passo final.' }, { status: 400 });

  try {
    const p = new URLSearchParams({ client_id: process.env.NEXT_PUBLIC_META_APP_ID!, client_secret: process.env.META_APP_SECRET!, code });
    const tRes = await fetch(`${G()}/oauth/access_token?${p}`);
    const t = await tRes.json();
    if (!tRes.ok) throw new Error(t?.error?.message || 'Meta recusou o código');
    const token = t.access_token;

    const { data: other } = await supabaseAdmin().from('integrations').select('org_id').eq('provider', 'whatsapp').eq('external_id', String(phone_number_id)).neq('org_id', org.id).maybeSingle();
    if (other) return NextResponse.json({ error: 'Este número já está conectado em outra conta.' }, { status: 409 });

    // inscreve o app nos webhooks da conta WhatsApp Business do cliente
    await graph(`${waba_id}/subscribed_apps`, token, { method: 'POST' });
    // registra o número para envio pela Cloud API (PIN de verificação em 2 etapas)
    const pin = String(randomInt(100000, 999999));
    await graph(`${phone_number_id}/register`, token, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', pin }) }).catch((e) => {
      if (!/already registered/i.test(e.message)) throw e;
    });
    const info = await graph(`${phone_number_id}?fields=display_phone_number,verified_name`, token).catch(() => ({}));

    await saveIntegration(org.id, 'whatsapp', {
      external_id: String(phone_number_id), display_name: info.display_phone_number || phone_number_id,
      meta: { waba_id, verified_name: info.verified_name },
    }, { access_token: token, pin, waba_id });
    return NextResponse.json({ ok: true, display: info.display_phone_number });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
