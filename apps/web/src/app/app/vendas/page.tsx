import { requireOrg, hasFeature } from '@/lib/org';
import { brl } from '@iris/shared/plans';
import { retryNfe } from '../actions';
import { AutoRefresh } from '@/components/client';

const NFE: Record<string, [string, string]> = {
  none: ['', 'sem nota'],
  order_created: ['warn', 'pedido na Omie'],
  invoiced: ['ok', 'NF-e emitida'],
  attached: ['ok', 'NF-e anexada no ML'],
  error: ['err', 'erro'],
  not_allowed: ['', 'emitida pelo ML (Full)'],
};
const STATUS: Record<string, string> = { paid: 'Pago', confirmed: 'Confirmado', cancelled: 'Cancelado', payment_required: 'Aguardando pagamento' };
const SHIP: Record<string, string> = { ready_to_ship: 'Pronto para envio', shipped: 'Enviado', delivered: 'Entregue', pending: 'Pendente', handling: 'Em preparação', not_delivered: 'Não entregue', cancelled: 'Cancelado' };

export default async function Vendas() {
  const { sb, org, plan } = await requireOrg();
  const { data: orders } = await sb.from('orders').select('*, contacts(name)').eq('org_id', org.id).order('created_at', { ascending: false }).limit(200);

  return (
    <>
      <AutoRefresh seconds={30} />
      <div className="page-head">
        <div>
          <h1>Vendas e notas fiscais</h1>
          <p>
            Pedidos do Mercado Livre e da sua API. Nota fiscal automática:{' '}
            {hasFeature(plan, 'nfe') ? <strong>{org.nfe_mode === 'auto' ? 'ligada (emite e anexa)' : org.nfe_mode === 'order_only' ? 'só cria o pedido na Omie' : 'desligada'}</strong> : <span>disponível no plano Pro</span>}
            {' · '}<a href="/app/ia">configurar</a>
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Status</th><th>Envio</th><th>Nota fiscal</th></tr></thead>
          <tbody>
            {(orders || []).map((o: any) => {
              const [cls, label] = NFE[o.nfe_status] || ['', o.nfe_status];
              return (
                <tr key={o.id}>
                  <td className="small">{new Date(o.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="small">{o.source === 'mercadolivre' ? 'ML ' : ''}#{o.external_id}</td>
                  <td>{o.contacts?.name || o.buyer?.nickname || '-'}</td>
                  <td className="small">{(o.items || []).map((i: any) => `${i.quantity}x ${i.title}`).join(', ')}</td>
                  <td><strong>{brl(o.total_cents)}</strong></td>
                  <td>{STATUS[o.status] || o.status}</td>
                  <td className="small">{SHIP[o.shipping_status] || o.shipping_status || '-'}{o.logistic_type ? <div className="muted">{o.logistic_type}</div> : null}</td>
                  <td>
                    <span className={`badge ${cls}`}>{label}</span>
                    {o.nfe_error && <div className="small" style={{ color: 'var(--iris-danger)', maxWidth: 260 }}>{o.nfe_error}</div>}
                    {o.nfe_status === 'error' && hasFeature(plan, 'nfe') && (
                      <form action={retryNfe}><input type="hidden" name="id" value={o.id} /><button className="btn ghost sm" style={{ marginTop: 6 }}>Tentar de novo</button></form>
                    )}
                  </td>
                </tr>
              );
            })}
            {!orders?.length && <tr><td colSpan={8} className="muted">Nenhuma venda ainda. Conecte o Mercado Livre em Integrações.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
