import { NextResponse } from 'next/server';
import { requireOrg } from '@/lib/org';
import { newState, appUrl } from '@/lib/oauth';

// drive.file: a Iris só acessa os arquivos e pastas que ela mesma criar no Drive do cliente.
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];

export async function GET() {
  await requireOrg();
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: appUrl('/api/google/callback'),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: await newState('google'),
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}
