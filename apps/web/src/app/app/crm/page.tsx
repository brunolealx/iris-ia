import Link from 'next/link';
import { requireOrg } from '@/lib/org';
import { brl } from '@iris/shared/plans';
import { moveContact, saveContact } from '../actions';
import { ActionForm, SubmitButton } from '@/components/client';

const STAGES = [
  ['lead', 'Lead'],
  ['negociacao', 'Negociação'],
  ['cliente', 'Cliente'],
  ['pos_venda', 'Pós-venda'],
  ['perdido', 'Perdido'],
];

export default async function Crm({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { sb, org } = await requireOrg();
  let query = sb.from('contacts').select('id,name,phone,email,channel,stage,tags,last_message_at,value_cents').eq('org_id', org.id).order('last_message_at', { ascending: false, nullsFirst: false }).limit(500);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, '')}%,phone.ilike.%${q.replace(/[%,()]/g, '')}%`);
  const { data: contacts } = await query;
  const { data: convs } = await sb.from('conversations').select('id,contact_id').eq('org_id', org.id).limit(1000);
  const convOf = Object.fromEntries((convs || []).map((c) => [c.contact_id, c.id]));

  return (
    <>
      <div className="page-head">
        <div><h1>CRM</h1><p>Todo cliente que fala com a Iris entra aqui. Mova pelo funil conforme a negociação avança.</p></div>
        <form className="row"><input name="q" defaultValue={q} placeholder="Buscar nome ou telefone" style={{ width: 240 }} /><button className="btn ghost">Buscar</button></form>
      </div>

      <div className="kanban">
        {STAGES.map(([stage, label]) => {
          const list = (contacts || []).filter((c) => c.stage === stage);
          return (
            <section key={stage} className="kcol">
              <h3>{label} <span>{list.length}</span></h3>
              {list.map((c) => (
                <div key={c.id} className="kcard stack" style={{ gap: 6 }}>
                  <div className="row spread">
                    <strong>{convOf[c.id] ? <Link href={`/app/conversas/${convOf[c.id]}`}>{c.name || c.phone || 'Sem nome'}</Link> : c.name || c.phone || 'Sem nome'}</strong>
                    <span className="badge">{c.channel === 'whatsapp' ? 'WA' : c.channel === 'mercadolivre' ? 'ML' : c.channel}</span>
                  </div>
                  {c.phone && <span className="small muted">{c.phone}</span>}
                  {c.value_cents > 0 && <span className="small">{brl(c.value_cents)} comprados</span>}
                  {c.tags?.length > 0 && <div className="row" style={{ gap: 4 }}>{c.tags.map((t: string) => <span key={t} className="badge small">{t}</span>)}</div>}
                  <form action={moveContact} className="row" style={{ gap: 6 }}>
                    <input type="hidden" name="id" value={c.id} />
                    <select name="stage" defaultValue={c.stage} style={{ padding: '4px 8px', fontSize: 12 }}>
                      {STAGES.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
                    </select>
                    <button className="btn ghost sm">Mover</button>
                  </form>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      <div className="box" style={{ marginTop: 18, maxWidth: 520 }}>
        <strong>Novo contato</strong>
        <ActionForm action={saveContact}>
          <div className="grid grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label>Nome<input name="name" /></label>
            <label>Telefone (com DDD)<input name="phone" /></label>
          </div>
          <label>E-mail<input name="email" type="email" /></label>
          <label>Etiquetas (separadas por vírgula)<input name="tags" placeholder="atacado, vip" /></label>
          <label>Observações<textarea name="notes" /></label>
          <div><SubmitButton>Salvar contato</SubmitButton></div>
        </ActionForm>
      </div>
    </>
  );
}
