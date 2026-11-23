'use client';

import { useEffect, useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';

/** Atualiza a página sozinha (novas conversas, rascunhos, vendas). */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

export function SubmitButton({ children, className = 'btn', pendingText = 'Salvando…', ...rest }: any) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} {...rest}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Formulário com mensagem de retorno da server action ({ ok, message }). */
export function ActionForm({ action, children, className = 'stack' }: { action: any; children: React.ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.message && <p className={`small ${state.ok ? '' : 'err'}`} style={{ color: state.ok ? 'var(--iris-green)' : 'var(--iris-danger)' }}>{state.message}</p>}
      {state?.secret && (
        <div className="stack">
          <span className="small muted">Copie agora — ela não será mostrada de novo:</span>
          <div className="code">{state.secret}</div>
        </div>
      )}
    </form>
  );
}

/** Importação de produtos por planilha CSV (colunas: sku;nome;preco;estoque;descricao). */
export function CsvImport({ action }: { action: (rows: any[]) => Promise<{ ok: boolean; message: string }> }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      const res = await action(rows);
      setMsg(res.message);
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }
  return (
    <div className="stack">
      <label>
        Planilha CSV (sku; nome; preco; estoque; descricao)
        <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} />
      </label>
      {msg && <span className="small" style={{ color: 'var(--iris-green)' }}>{msg}</span>}
    </div>
  );
}

/** "1.234,56" (pt-BR), "1234.56" ou "R$ 29,90" → número */
function toNumber(v: string) {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && s !== '' ? n : null;
}

function parseCsv(text: string) {
  const sep = (text.split('\n')[0].match(/;/g)?.length || 0) >= (text.split('\n')[0].match(/,/g)?.length || 0) ? ';' : ',';
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { cur.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.some((c) => c.trim())) lines.push(cur);
      cur = [];
    } else field += ch;
  }
  cur.push(field);
  if (cur.some((c) => c.trim())) lines.push(cur);
  const [head, ...body] = lines;
  const idx = (names: string[]) => head.findIndex((h) => names.includes(h.trim().toLowerCase()));
  const c = { sku: idx(['sku', 'codigo', 'código']), name: idx(['nome', 'name', 'descricao', 'descrição', 'produto']), price: idx(['preco', 'preço', 'price', 'valor']), stock: idx(['estoque', 'stock', 'quantidade']), desc: idx(['descricao_detalhada', 'detalhes', 'description', 'obs']) };
  if (c.sku < 0 || c.name < 0) throw new Error('O CSV precisa das colunas "sku" e "nome"');
  return body.slice(0, 5000).map((r) => ({
    sku: r[c.sku]?.trim(),
    name: r[c.name]?.trim(),
    price: c.price >= 0 ? toNumber(r[c.price]) : null,
    stock: c.stock >= 0 ? Number(String(r[c.stock]).replace(',', '.')) || 0 : null,
    description: c.desc >= 0 ? r[c.desc]?.trim() : '',
  })).filter((r) => r.sku && r.name);
}
