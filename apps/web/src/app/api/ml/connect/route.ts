import { NextResponse } from 'next/server';
import { requireOrg } from '@/lib/org';
import { newState, appUrl } from '@/lib/oauth';

export async function GET() {
  await requireOrg();
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ML_CLIENT_ID!,
    redirect_uri: appUrl('/api/ml/callback'),
    state: await newState('ml'),
  });
  return NextResponse.redirect(`https://auth.mercadolivre.com.br/authorization?${p}`);
}
