import { notFound } from 'next/navigation';
import { requireOrg } from '@/lib/org';
import { sendManual, toggleAi } from '../../actions';
import { ActionForm, AutoRefresh, SubmitButton } from '@/components/client';

export default async function Conversa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb, org } = await requireOrg();
  const { data: c } = await sb.from('conversations').select('*, contacts(*)').eq('id', id).eq('org_id', org.id).single();
  if (!c) notFound();
  const { data: msgs } = await sb.from('messages').select('*').eq('conversation_id', id).order('created_at').limit(300);
  const canReply = c.kind !== 'question' || !(msgs || []).some((m) => m.direction === 'out');

  return (
    <>
      <AutoRefresh seconds={10} />
      <div className="page-head">
        <div>
          <h1>{c.contacts?.name || c.contacts?.phone || c.external_ref}</h1>
          <p>{c.channel === 'whatsapp' ? 'WhatsApp' : 'Mercado Livre'} · {c.contacts?.phone || ''}</p>
        </div>
        <form action={toggleAi} className="row">
          <input type="hidden" name="conversationId" value={c.id} />
          <input type="hidden" name="paused" value={c.ai_paused ? '0' : '1'} />
          <span className={`badge ${c.ai_paused ? 'warn' : 'ok'}`}>IA {c.ai_paused ? 'pausada' : 'ativa'}</span>
          <button className="btn ghost sm">{c.ai_paused ? 'Reativar IA' : 'Assumir conversa (pausar IA)'}</button>
        </form>
      </div>

      <div className="box stack" style={{ minHeight: 300 }}>
        {(msgs || []).map((m) => (
          <div key={m.id} className={`bubble ${m.author === 'system' ? 'system' : m.direction}`}>
            {m.text}
            <div className="small muted" style={{ marginTop: 4 }}>
              {m.author === 'ai' ? 'IA' : m.author === 'human' ? 'Equipe' : m.author === 'customer' ? 'Cliente' : 'Sistema'} · {new Date(m.created_at).toLocaleString('pt-BR')}
            </div>
          </div>
        ))}
      </div>

      {canReply && (
        <div className="box" style={{ marginTop: 14 }}>
          <ActionForm action={sendManual}>
            <input type="hidden" name="conversationId" value={c.id} />
            <textarea name="text" placeholder="Escreva sua resposta…" maxLength={c.kind === 'post_sale' ? 350 : 4000} />
            <div><SubmitButton pendingText="Enviando…">Enviar</SubmitButton></div>
            {c.channel === 'whatsapp' && <span className="small muted">No WhatsApp, mensagens livres só podem ser enviadas até 24h depois da última mensagem do cliente.</span>}
          </ActionForm>
        </div>
      )}
    </>
  );
}
