'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

declare global {
  interface Window { FB: any; fbAsyncInit: () => void }
}

/**
 * Cadastro Incorporado (Embedded Signup) da Meta: o cliente entra com o Facebook,
 * escolhe/cria a conta do WhatsApp Business e o número. Oficial, sem QR code.
 */
export function WhatsappConnect() {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const session = useRef<{ phone_number_id?: string; waba_id?: string }>({});

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!String(e.origin).endsWith('facebook.com')) return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA') session.current = data.data || {};
          if (data.event === 'CANCEL') setMsg('Conexão cancelada.');
        }
      } catch {}
    };
    window.addEventListener('message', onMessage);
    if (!document.getElementById('fb-sdk')) {
      window.fbAsyncInit = () => window.FB.init({ appId: process.env.NEXT_PUBLIC_META_APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v21.0' });
      const s = document.createElement('script');
      s.id = 'fb-sdk';
      s.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      s.async = true;
      s.crossOrigin = 'anonymous';
      document.body.appendChild(s);
    }
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function connect() {
    if (!window.FB) return setMsg('Carregando o Facebook… tente de novo em alguns segundos.');
    setMsg('');
    window.FB.login(
      (resp: any) => {
        const code = resp?.authResponse?.code;
        if (!code) return setMsg('Conexão não concluída.');
        // o evento FINISH pode chegar logo depois do callback
        setTimeout(async () => {
          setMsg('Conectando seu número…');
          const r = await fetch('/api/whatsapp/signup', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code, ...session.current }),
          });
          const j = await r.json().catch(() => ({}));
          setMsg(r.ok ? `WhatsApp conectado: ${j.display || ''}` : j.error || 'Erro ao conectar');
          router.refresh();
        }, 800);
      },
      {
        config_id: process.env.NEXT_PUBLIC_META_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
      }
    );
  }

  return (
    <div className="stack">
      <button type="button" className="btn" onClick={connect}>Conectar WhatsApp (oficial Meta)</button>
      {msg && <span className="small" style={{ color: 'var(--iris-green)' }}>{msg}</span>}
    </div>
  );
}
