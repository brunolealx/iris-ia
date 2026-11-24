import { requireOrg } from '@/lib/org';
import { brl } from '@iris/shared/plans';

const STATUS: Record<string, [string, string]> = {
  trial: ['warn', 'Teste grátis'],
  active: ['ok', 'Ativa'],
  past_due: ['err', 'Pagamento pendente'],
  canceled: ['', 'Cancelada'],
  blocked: ['err', 'Bloqueada'],
};

export default async function Assinatura({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const { sb, org, plan } = await requireOrg();
  const { data: plans } = await sb.from('plans').select('*').eq('active', true).order('sort');
  const [cls, label] = STATUS[org.status] || ['', org.status];

  return (
    <>
      <div className="page-head">
        <div><h1>Assinatura</h1><p>Plano atual: <strong>{plan.name}</strong> · <span className={`badge ${cls}`}>{label}</span>{org.status === 'trial' && ` até ${new Date(org.trial_ends_at).toLocaleDateString('pt-BR')}`}</p></div>
      </div>
      {sp.ok && <div className="box" style={{ borderColor: 'var(--iris-green)', marginBottom: 14 }}>Pagamento recebido pelo Mercado Pago. O plano é ativado assim que a assinatura for autorizada (alguns minutos).</div>}
      {sp.erro && <div className="box" style={{ borderColor: 'var(--iris-danger)', marginBottom: 14 }}>Não foi possível abrir o checkout: {sp.erro}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {(plans || []).filter((p) => p.price_cents > 0).map((p) => (
          <form key={p.id} action="/api/billing/checkout" method="post" className={`box plan stack ${p.id === plan.id ? 'featured' : ''}`}>
            <input type="hidden" name="plan" value={p.id} />
            <strong>{p.name}</strong>
            <div className="price">{brl(p.price_cents)}<span className="muted small"> /mês</span></div>
            <ul className="checklist">
              <li>{p.ai_replies_month.toLocaleString('pt-BR')} respostas da IA/mês</li>
              <li>{p.products_max.toLocaleString('pt-BR')} produtos · {p.users_max} usuários</li>
              {p.features.includes('nfe') && <li>NF-e automática pelo Faturador do ML</li>}
              {p.features.includes('nfse') && <li>NFS-e Nacional (notas de serviço)</li>}
              {p.features.includes('api') && <li>API e webhooks</li>}
            </ul>
            <button className={`btn ${p.id === plan.id && org.status === 'active' ? 'ghost' : ''}`} disabled={p.id === plan.id && org.status === 'active'}>
              {p.id === plan.id && org.status === 'active' ? 'Plano atual' : 'Assinar com Mercado Pago'}
            </button>
          </form>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>Cobrança mensal recorrente no cartão pelo Mercado Pago. Para cancelar, use o link da assinatura no e-mail do Mercado Pago ou fale com o suporte.</p>
    </>
  );
}
