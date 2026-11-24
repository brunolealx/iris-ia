import Link from 'next/link';
import { requireOrg } from '@/lib/org';
import { brl } from '@iris/shared/plans';
import { AutoRefresh } from '@/components/client';

export default async function Inicio() {
  const { sb, org, plan } = await requireOrg();
  const month = `${new Date().toISOString().slice(0, 7)}-01`;
  const [{ data: usage }, { count: pending }, { data: orders }, { data: integs }, { count: contacts }] = await Promise.all([
    sb.from('usage_monthly').select('*').eq('org_id', org.id).eq('month', month).maybeSingle(),
    sb.from('drafts').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'pending'),
    sb.from('orders').select('total_cents,status').eq('org_id', org.id).gte('created_at', month),
    sb.from('integrations').select('provider,status,display_name,last_error').eq('org_id', org.id),
    sb.from('contacts').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
  ]);
  const valid = (orders || []).filter((o) => o.status !== 'cancelled');
  const revenue = valid.reduce((s, o) => s + Number(o.total_cents), 0);
  const used = usage?.ai_replies || 0;
  const pct = Math.min(100, Math.round((used / plan.ai_replies_month) * 100));
  const byProvider = Object.fromEntries((integs || []).map((i) => [i.provider, i]));

  return (
    <>
      <AutoRefresh seconds={30} />
      <div className="page-head">
        <div><h1>Olá, {org.name}</h1><p>Resumo do mês</p></div>
        {pending ? <Link className="btn" href="/app/conversas">{pending} respostas para aprovar →</Link> : null}
      </div>

      <div className="grid grid-4">
        <div className="box"><div className="stat-label">Faturamento do mês</div><div className="stat-value green">{brl(revenue)}</div></div>
        <div className="box"><div className="stat-label">Pedidos</div><div className="stat-value">{valid.length}</div></div>
        <div className="box"><div className="stat-label">Mensagens recebidas</div><div className="stat-value">{usage?.messages_in || 0}</div></div>
        <div className="box"><div className="stat-label">Contatos no CRM</div><div className="stat-value">{contacts || 0}</div></div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div className="box stack">
          <div className="row spread"><strong>Uso da IA</strong><span className="muted small">{used} / {plan.ai_replies_month}</span></div>
          <div style={{ height: 10, background: '#000', borderRadius: 99, border: '1px solid var(--iris-line)' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct > 90 ? 'var(--iris-warn)' : 'var(--iris-green)', borderRadius: 99 }} />
          </div>
          <span className="small muted">Plano {plan.name}. {pct > 90 ? <Link href="/app/assinatura">Faça upgrade para não parar.</Link> : 'Tudo certo.'}</span>
        </div>
        <div className="box stack">
          <strong>Conexões</strong>
          {[['whatsapp', 'WhatsApp'], ['mercadolivre', 'Mercado Livre'], ['google', 'Google Drive'], ['nfse', 'NFS-e']].map(([k, label]) => {
            const i = byProvider[k];
            const st = !i || i.status === 'disconnected' ? ['', 'não conectado'] : i.status === 'error' ? ['err', 'erro'] : ['ok', 'conectado'];
            return (
              <div key={k} className="row spread">
                <span>{label} {i?.display_name && <span className="muted small">· {i.display_name}</span>}</span>
                <span className={`badge ${st[0]}`}>{st[1]}</span>
              </div>
            );
          })}
          <Link href="/app/integracoes" className="small">Gerenciar integrações →</Link>
        </div>
      </div>
    </>
  );
}
