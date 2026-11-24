'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, useSearchParams } from 'next/navigation';
import { IrisMark } from '@/components/icons';
import { TechBackground } from '@/components/background';

export function EntrarForm() {
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'entrar' | 'cadastro'>(params.get('cadastro') ? 'cadastro' : 'entrar');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get('email'));
    const password = String(f.get('password'));
    setBusy(true);
    setMsg('');
    const redirect = `${window.location.origin}/auth/callback`;
    const { error } =
      mode === 'cadastro'
        ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect, data: { company: String(f.get('company') || '') } } })
        : await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMsg(traduz(error.message));
    if (mode === 'cadastro') return setMsg('Conta criada! Confirme pelo link que enviamos para o seu e-mail.');
    router.push('/app');
    router.refresh();
  }

  async function google() {
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } });
  }

  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <TechBackground />
      <form onSubmit={submit} className="box flex w-full max-w-[400px] flex-col gap-3.5 bg-surface/92 p-7">
        <span className="brand"><IrisMark /> Iris</span>
        <h1 className="m-0 text-[22px]">{mode === 'cadastro' ? 'Crie sua conta grátis' : 'Entrar no painel'}</h1>
        {mode === 'cadastro' && <label>Nome da empresa<input name="company" required maxLength={80} /></label>}
        <label>E-mail<input name="email" type="email" required autoComplete="email" /></label>
        <label>Senha<input name="password" type="password" required minLength={8} autoComplete={mode === 'cadastro' ? 'new-password' : 'current-password'} /></label>
        <button className="btn" disabled={busy}>{busy ? 'Aguarde…' : mode === 'cadastro' ? 'Criar conta' : 'Entrar'}</button>
        <button type="button" className="btn ghost" onClick={google}>Continuar com Google</button>
        {msg && <p className="small text-iris">{msg}</p>}
        <p className="small muted">
          {mode === 'cadastro' ? 'Já tem conta? ' : 'Ainda não tem conta? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'cadastro' ? 'entrar' : 'cadastro'); }}>
            {mode === 'cadastro' ? 'Entrar' : 'Teste grátis por 14 dias'}
          </a>
        </p>
      </form>
    </main>
  );
}

function traduz(m: string) {
  if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/already registered/i.test(m)) return 'Este e-mail já tem conta. Entre com a sua senha.';
  if (/email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos.';
  return m;
}
