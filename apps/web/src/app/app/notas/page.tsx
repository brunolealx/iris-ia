import { requireOrg, hasFeature } from '@/lib/org';
import { brl } from '@iris/shared/plans';
import { createServiceInvoice, cancelServiceInvoice, retryServiceInvoice } from '../actions';
import { ActionForm, AutoRefresh, SubmitButton } from '@/components/client';

const STATUS: Record<string, [string, string]> = {
  pending: ['warn', 'na fila'],
  processing: ['warn', 'enviando'],
  authorized: ['ok', 'autorizada'],
  rejected: ['err', 'rejeitada'],
  error: ['err', 'erro'],
  canceled: ['', 'cancelada'],
};

export default async function Notas() {
  const { sb, org, plan, role } = await requireOrg();
  const [{ data: integ }, { data: notes }] = await Promise.all([
    sb.from('integrations').select('status,meta').eq('org_id', org.id).eq('provider', 'nfse').maybeSingle(),
    sb.from('service_invoices').select('id,status,number,serie,chave,nfse_number,competencia,amount_cents,description,taker,error,created_at')
      .eq('org_id', org.id).order('created_at', { ascending: false }).limit(200),
  ]);
  const ready = integ && integ.status !== 'disconnected';
  const cfg: any = integ?.meta?.config || {};
  const busy = (notes || []).some((n: any) => ['pending', 'processing'].includes(n.status));

  return (
    <>
      {busy && <AutoRefresh seconds={5} />}
      <div className="page-head">
        <div>
          <h1>Notas de serviço (NFS-e)</h1>
          <p>
            Emitidas pela API oficial do governo federal (NFS-e Nacional).{' '}
            {ready && <strong>{cfg.tpAmb === 1 ? 'Ambiente: produção' : 'Ambiente: produção restrita (testes, sem valor fiscal)'}</strong>}
          </p>
        </div>
      </div>

      {!hasFeature(plan, 'nfse') ? (
        <div className="box"><span className="muted">Disponível no plano Pro.</span> <a href="/app/assinatura">Ver planos</a></div>
      ) : !ready ? (
        <div className="box stack">
          <strong>Configure primeiro</strong>
          <span className="muted small">Envie o certificado A1 e os dados do prestador em <a href="/app/integracoes">Integrações → NFS-e Nacional</a>.</span>
        </div>
      ) : (
        <div className="box stack">
          <strong>Nova nota de serviço</strong>
          <ActionForm action={createServiceInvoice}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>Valor (R$)<input name="amount" required inputMode="decimal" placeholder="197,00" /></label>
              <label>Competência<input name="competencia" type="date" /></label>
            </div>
            <label>Descrição do serviço<textarea name="description" rows={3} required placeholder="Ex.: Assinatura mensal do software de atendimento, plano Pro" /></label>
            <span className="small muted">Tomador (quem contratou). Deixe o CPF/CNPJ vazio se não for identificar.</span>
            <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
              <label>CPF/CNPJ<input name="doc" inputMode="numeric" /></label>
              <label>Nome ou razão social<input name="name" /></label>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
              <label>E-mail<input name="email" type="email" /></label>
              <label>Telefone<input name="phone" inputMode="tel" /></label>
            </div>
            <details>
              <summary className="small">Endereço do tomador (opcional)</summary>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 2fr', marginTop: 8 }}>
                <label>CEP<input name="cep" inputMode="numeric" /></label>
                <label>Município (IBGE)<input name="cMun" inputMode="numeric" placeholder="3552205" /></label>
                <label>Rua<input name="street" /></label>
                <label>Número<input name="number" /></label>
                <label>Bairro<input name="district" /></label>
              </div>
            </details>
            <label className="row"><input type="checkbox" name="iss_retido" /> ISS retido pelo tomador</label>
            <div><SubmitButton pendingText="Enviando…">Emitir NFS-e</SubmitButton></div>
          </ActionForm>
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 18 }}>
        <table>
          <thead><tr><th>Data</th><th>Número</th><th>Tomador</th><th>Serviço</th><th>Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            {(notes || []).map((n: any) => {
              const [cls, label] = STATUS[n.status] || ['', n.status];
              return (
                <tr key={n.id}>
                  <td className="small">{new Date(n.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="small">
                    {n.nfse_number ? <>NFS-e {n.nfse_number}</> : '-'}
                    {n.number && <div className="muted">DPS {n.serie}/{n.number}</div>}
                  </td>
                  <td>{n.taker?.name || <span className="muted">não identificado</span>}</td>
                  <td className="small" style={{ maxWidth: 280 }}>{n.description}</td>
                  <td><strong>{brl(n.amount_cents)}</strong></td>
                  <td>
                    <span className={`badge ${cls}`}>{label}</span>
                    {n.chave && <div className="small muted" title={n.chave}>chave …{n.chave.slice(-10)}</div>}
                    {n.error && <div className="small" style={{ color: n.status === 'authorized' ? 'var(--iris-muted)' : 'var(--iris-danger)', maxWidth: 300 }}>{n.error}</div>}
                  </td>
                  <td>
                    {['rejected', 'error'].includes(n.status) && (
                      <form action={retryServiceInvoice}><input type="hidden" name="id" value={n.id} /><button className="btn ghost sm">Tentar de novo</button></form>
                    )}
                    {n.status === 'authorized' && role !== 'agent' && (
                      <details>
                        <summary className="small">Cancelar</summary>
                        <ActionForm action={cancelServiceInvoice}>
                          <input type="hidden" name="id" value={n.id} />
                          <select name="motivo" defaultValue="1">
                            <option value="1">Erro na emissão</option>
                            <option value="2">Serviço não prestado</option>
                            <option value="9">Outros</option>
                          </select>
                          <input name="reason" required minLength={15} placeholder="Explique o motivo (mín. 15 letras)" />
                          <SubmitButton className="btn danger sm" pendingText="Enviando…">Confirmar cancelamento</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
            {!notes?.length && <tr><td colSpan={7} className="muted">Nenhuma nota de serviço ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
