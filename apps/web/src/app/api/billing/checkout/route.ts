import { NextResponse } from 'next/server';
import { requireOrg } from '@/lib/org';
import { appUrl } from '@/lib/oauth';

/** Cria a assinatura no Mercado Pago e manda o cliente para o checkout. */
export async function POST(req: Request) {
  const { sb, org, user, role } = await requireOrg();
  if (role !== 'owner') return NextResponse.redirect(appUrl('/app/assinatura?erro=so-o-dono'), { status: 303 });
  const form = await req.formData();
  const planId = String(form.get('plan') || '');
  const { data: plan } = await sb.from('plans').select('*').eq('id', planId).eq('active', true).single();
  if (!plan || !plan.price_cents) return NextResponse.redirect(appUrl('/app/assinatura?erro=plano'), { status: 303 });

  const res = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      reason: `Iris — Plano ${plan.name}`,
      external_reference: `${org.id}:${plan.id}`,
      payer_email: user.email,
      back_url: appUrl('/app/assinatura?ok=1'),
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: plan.price_cents / 100, currency_id: 'BRL' },
      status: 'pending',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.init_point) return NextResponse.redirect(appUrl(`/app/assinatura?erro=${encodeURIComponent(data.message || 'mercadopago')}`), { status: 303 });
  return NextResponse.redirect(data.init_point, { status: 303 });
}
