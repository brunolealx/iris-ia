import Link from 'next/link';
import { requireOrg } from '@/lib/org';
import { approveDraft, discardDraft } from '../actions';
import { ActionForm, AutoRefresh, SubmitButton } from '@/components/client';

const CH: Record<string, string> = { whatsapp: 'WhatsApp', mercadolivre: 'Mercado Livre' };
const KIND: Record<string, string> = { chat: 'Conversa', question: 'Pergunta no anúncio', post_sale: 'Pós-venda' };

export default async function Conversas() {
  const { sb, org } = await requireOrg();
  const [{ data: drafts }, { data: convs }] = await Promise.all([
    sb.from('drafts').select('*, conversations(channel,kind,contacts(name,phone))').eq('org_id', org.id).in('status', ['pending', 'queued', 'error']).order('created_at', { ascending: false }).limit(50),
    sb.from('conversations').select('id,channel,kind,external_ref,ai_paused,last_message_at,contacts(name,phone)').eq('org_id', org.id).order('last_message_at', { ascending: false }).limit(50),
  ]);

  return (
    <>
      <AutoRefresh seconds={15} />
      <div className="page-head">
        <div><h1>Conversas</h1><p>Respostas da IA esperando sua aprovação e histórico de atendimentos.</p></div>
      </div>

      <h2 style={{ fontSize: 16 }}>Para aprovar ({drafts?.filter((d) => d.status === 'pending').length || 0})</h2>
      <div className="grid grid-2">
        {(drafts || []).map((d: any) => {
          const c = d.conversations;
          const canSend = d.target?.channel !== 'none';
          return (
            <div key={d.id} className="box stack">
              <div className="row spread">
                <strong>{CH[c?.channel] || 'Aviso'} · {KIND[c?.kind] || ''}</strong>
                <span className={`badge ${d.status === 'error' ? 'err' : d.status === 'queued' ? 'ok' : 'warn'}`}>{d.status === 'pending' ? 'aguardando' : d.status === 'queued' ? 'enviando' : 'erro'}</span>
              </div>
              <span className="small muted">{c?.contacts?.name || c?.contacts?.phone || ''}</span>
              <div className="quote">{d.customer_text}</div>
              <span className="small muted">Motivo: {d.reason || '-'}</span>
              {d.error && <span className="small" style={{ color: 'var(--iris-danger)' }}>{d.error}</span>}
              {canSend && d.status !== 'queued' && (
                <ActionForm action={approveDraft}>
                  <input type="hidden" name="id" value={d.id} />
                  <textarea name="text" defaultValue={d.reply} rows={3} maxLength={c?.kind === 'post_sale' ? 350 : 2000} />
                  <div className="row">
                    <SubmitButton pendingText="Enviando…">Aprovar e enviar</SubmitButton>
                    {d.conversation_id && <Link className="btn ghost" href={`/app/conversas/${d.conversation_id}`}>Abrir conversa</Link>}
                  </div>
                </ActionForm>
              )}
              <form action={discardDraft}><input type="hidden" name="id" value={d.id} /><button className="btn ghost sm">Descartar</button></form>
            </div>
          );
        })}
        {!drafts?.length && <p className="muted">Nada para aprovar agora.</p>}
      </div>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Últimas conversas</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>Canal</th><th>Tipo</th><th>IA</th><th>Última mensagem</th></tr></thead>
          <tbody>
            {(convs || []).map((c: any) => (
              <tr key={c.id}>
                <td><Link href={`/app/conversas/${c.id}`}>{c.contacts?.name || c.contacts?.phone || c.external_ref}</Link></td>
                <td>{CH[c.channel]}</td>
                <td>{KIND[c.kind]}</td>
                <td><span className={`badge ${c.ai_paused ? 'warn' : 'ok'}`}>{c.ai_paused ? 'pausada' : 'ativa'}</span></td>
                <td className="muted small">{new Date(c.last_message_at).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
