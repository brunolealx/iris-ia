import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/org';
import { supabaseAdmin } from '@/lib/supabase';

// Painel do dono da plataforma (você): todos os clientes, planos e uso.
async function setPlan(f: FormData) {
  'use server';
  await requirePlatformAdmin();
  const admin = supabaseAdmin();
  const status = String(f.get('status'));
  if (!['trial', 'active', 'past_due', 'canceled', 'blocked'].includes(status)) return;
  await admin.from('organizations').update({ plan_id: String(f.get('plan')), status }).eq('id', String(f.get('id')));
  revalidatePath('/admin');
}

export default async function Admin() {
  await requirePlatformAdmin();
  const admin = supabaseAdmin();
  const month = `${new Date().toISOString().slice(0, 7)}-01`;
  const [{ data: orgs }, { data: plans }, { data: usage }, { count: failed }] = await Promise.all([
    admin.from('organizations').select('id,name,plan_id,status,trial_ends_at,created_at').order('created_at', { ascending: false }).limit(500),
    admin.from('plans').select('id,name,price_cents'),
    admin.from('usage_monthly').select('*').eq('month', month),
    admin.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ]);
  const use = Object.fromEntries((usage || []).map((u) => [u.org_id, u]));
  const price = Object.fromEntries((plans || []).map((p) => [p.id, p.price_cents]));
  const mrr = (orgs || []).filter((o) => o.status === 'active').reduce((s, o) => s + (price[o.plan_id] || 0), 0);
  const aiTotal = (usage || []).reduce((s, u) => s + u.ai_replies, 0);

  return (
    <main className="main" style={{ margin: '0 auto' }}>
      <div className="page-head"><div><h1>Admin da plataforma</h1><p>Clientes, receita e saúde do sistema.</p></div></div>
      <div className="grid grid-4">
        <div className="box"><div className="stat-label">Receita mensal (MRR)</div><div className="stat-value green">{(mrr / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div></div>
        <div className="box"><div className="stat-label">Clientes</div><div className="stat-value">{orgs?.length || 0}</div></div>
        <div className="box"><div className="stat-label">Respostas da IA no mês</div><div className="stat-value">{aiTotal}</div></div>
        <div className="box"><div className="stat-label">Jobs com erro</div><div className="stat-value">{failed || 0}</div></div>
      </div>
      <div className="table-wrap" style={{ marginTop: 18 }}>
        <table>
          <thead><tr><th>Cliente</th><th>Criado</th><th>IA / msgs no mês</th><th>Plano e status</th></tr></thead>
          <tbody>
            {(orgs || []).map((o) => (
              <tr key={o.id}>
                <td>{o.name}<div className="small muted">{o.id}</div></td>
                <td className="small">{new Date(o.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="small">{use[o.id]?.ai_replies || 0} / {use[o.id]?.messages_in || 0}</td>
                <td>
                  <form action={setPlan} className="row">
                    <input type="hidden" name="id" value={o.id} />
                    <select name="plan" defaultValue={o.plan_id} style={{ width: 'auto' }}>{(plans || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                    <select name="status" defaultValue={o.status} style={{ width: 'auto' }}>{['trial', 'active', 'past_due', 'canceled', 'blocked'].map((s) => <option key={s}>{s}</option>)}</select>
                    <button className="btn ghost sm">Salvar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
