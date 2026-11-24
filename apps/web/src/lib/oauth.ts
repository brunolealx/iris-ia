import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = 'iris_oauth_state';

/** Gera o "state" do OAuth e guarda num cookie httpOnly (proteção contra CSRF). */
export async function newState(provider: string) {
  const state = `${provider}.${randomBytes(18).toString('base64url')}`;
  (await cookies()).set(COOKIE, state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return state;
}

export async function checkState(provider: string, received: string | null) {
  const store = await cookies();
  const expected = store.get(COOKIE)?.value || '';
  store.delete(COOKIE);
  if (!received || !expected.startsWith(`${provider}.`)) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const appUrl = (path: string) => `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
