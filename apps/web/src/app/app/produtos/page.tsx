import { requireOrg, hasFeature } from '@/lib/org';
import { brl } from '@iris/shared/plans';
import { importCsv, omieImport, saveProduct } from '../actions';
import { ActionForm, CsvImport, SubmitButton } from '@/components/client';

export default async function Produtos({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { sb, org, plan } = await requireOrg();
  let query = sb.from('products').select('*', { count: 'exact' }).eq('org_id', org.id).order('name').limit(200);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, '')}%,sku.ilike.%${q.replace(/[%,()]/g, '')}%`);
  const { data: products, count } = await query;
  const { data: omie } = await sb.from('integrations').select('status,meta').eq('org_id', org.id).eq('provider', 'omie').maybeSingle();
  const imp = omie?.meta?.import;

  return (
    <>
      <div className="page-head">
        <div><h1>Produtos</h1><p>A IA usa este catálogo (preço, estoque e descrição) para responder. {count ?? 0} de {plan.products_max.toLocaleString('pt-BR')} no plano.</p></div>
        <form className="row"><input name="q" defaultValue={q} placeholder="Buscar nome ou SKU" style={{ width: 240 }} /><button className="btn ghost">Buscar</button></form>
      </div>

      <div className="grid grid-2">
        <div className="box stack">
          <strong>Importar da Omie</strong>
          {!hasFeature(plan, 'omie') ? <span className="muted small">Disponível nos planos Starter e Pro.</span>
            : !omie || omie.status === 'disconnected' ? <span className="muted small">Conecte a Omie em <a href="/app/integracoes">Integrações</a>.</span>
            : (
              <>
                {imp && <span className="small muted">Última importação: página {imp.page} de {imp.totalPages} · {imp.total} produtos na Omie</span>}
                <ActionForm action={omieImport}><SubmitButton pendingText="Iniciando…">Importar todos (em massa)</SubmitButton></ActionForm>
                <ActionForm action={omieImport} className="row">
                  <input name="codigo" placeholder="Código/SKU do produto na Omie" required style={{ flex: 1 }} />
                  <SubmitButton className="btn ghost">Importar um</SubmitButton>
                </ActionForm>
              </>
            )}
        </div>

        <div className="box stack">
          <strong>Planilha (CSV) ou cadastro manual</strong>
          <CsvImport action={importCsv} />
          <hr style={{ margin: '6px 0' }} />
          <ActionForm action={saveProduct}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
              <label>SKU<input name="sku" required /></label>
              <label>Nome<input name="name" required /></label>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>Preço (R$)<input name="price" inputMode="decimal" placeholder="49,90" /></label>
              <label>Estoque<input name="stock" type="number" /></label>
            </div>
            <label>Descrição (medidas, compatibilidade, garantia…)<textarea name="description" /></label>
            <div><SubmitButton>Salvar produto</SubmitButton></div>
          </ActionForm>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 18 }}>
        <table>
          <thead><tr><th>SKU</th><th>Nome</th><th>Preço</th><th>Estoque</th><th>Origem</th></tr></thead>
          <tbody>
            {(products || []).map((p) => (
              <tr key={p.id}>
                <td className="small">{p.sku || p.external_id}</td>
                <td>{p.name}{!p.active && <span className="badge" style={{ marginLeft: 6 }}>inativo</span>}</td>
                <td>{p.price_cents != null ? brl(p.price_cents) : '-'}</td>
                <td>{p.stock ?? '-'}</td>
                <td><span className="badge">{p.source}</span></td>
              </tr>
            ))}
            {!products?.length && <tr><td colSpan={5} className="muted">Nenhum produto ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
