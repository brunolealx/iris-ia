import { requireOrg, hasFeature } from '@/lib/org';
import { connectOmie, saveOmieNfe, disconnect, googleResync, generateApiKey, addWebhook, removeWebhook } from '../actions';
import { ActionForm, SubmitButton } from '@/components/client';
import { WhatsappConnect } from './whatsapp-connect';
import { IconChat, IconCart, IconDrive, IconFactory } from '@/components/icons';

const EVENTS = ['message.received', 'draft.created', 'contact.created', 'order.created', 'order.updated', 'claim.opened', 'invoice.order_created', 'invoice.attached'];

function Status({ i }: { i?: any }) {
  if (!i || i.status === 'disconnected') return <span className="badge">não conectado</span>;
  if (i.status === 'error') return <span className="badge err" title={i.last_error}>erro: {i.last_error}</span>;
  return <span className="badge ok">conectado{i.display_name ? ` · ${i.display_name}` : ''}</span>;
}

function Disconnect({ provider }: { provider: string }) {
  return (
    <form action={disconnect}><input type="hidden" name="provider" value={provider} /><button className="btn danger sm">Desconectar</button></form>
  );
}

export default async function Integracoes() {
  const { sb, org, plan } = await requireOrg();
  const [{ data: integs }, { data: hooks }] = await Promise.all([
    sb.from('integrations').select('*').eq('org_id', org.id),
    sb.from('webhook_endpoints').select('*').eq('org_id', org.id).order('created_at'),
  ]);
  const by = Object.fromEntries((integs || []).map((i) => [i.provider, i]));
  const on = (p: string) => by[p] && by[p].status !== 'disconnected';
  const worker = process.env.NEXT_PUBLIC_WORKER_URL || '';

  return (
    <>
      <div className="page-head"><div><h1>Integrações</h1><p>Conecte seus canais, seu ERP e seu Google Drive.</p></div></div>

      <div className="grid grid-2">
        {/* WhatsApp */}
        <div className="box stack">
          <div className="row spread"><strong className="section-title"><span className="icon-tile sm t-green"><IconChat size={18} /></span>WhatsApp Business (API oficial)</strong><Status i={by.whatsapp} /></div>
          <span className="small muted">Use um número que não esteja no app do WhatsApp do celular (ou migre o número). Conexão oficial da Meta: sem QR code e sem risco de ban por automação.</span>
          {on('whatsapp') ? <Disconnect provider="whatsapp" /> : <WhatsappConnect />}
        </div>

        {/* Mercado Livre */}
        <div className="box stack">
          <div className="row spread"><strong className="section-title"><span className="icon-tile sm t-yellow"><IconCart size={18} /></span>Mercado Livre</strong><Status i={by.mercadolivre} /></div>
          <span className="small muted">Perguntas, mensagens pós-venda, pedidos, envios, anúncios e reclamações.</span>
          {on('mercadolivre') ? <Disconnect provider="mercadolivre" /> : <a className="btn" href="/api/ml/connect">Entrar com a conta do Mercado Livre</a>}
        </div>

        {/* Google Drive */}
        <div className="box stack">
          <div className="row spread"><strong className="section-title"><span className="icon-tile sm t-blue"><IconDrive size={18} /></span>Google Drive e Planilhas</strong><Status i={by.google} /></div>
          <span className="small muted">Cria a pasta “Iris — {org.name}” com subpastas (Notas Fiscais, Vendas, Funcionários, Financeiro…) e a planilha de gestão completa: vendas, produtos, clientes, funcionários, folha de pagamento, folgas e férias, contas a pagar/receber e fluxo de caixa. A Iris só acessa os arquivos que ela mesma criar.</span>
          {on('google') ? (
            <div className="stack">
              {by.google.meta?.rootFolderUrl && <a className="btn ghost" href={by.google.meta.rootFolderUrl} target="_blank" rel="noreferrer">Abrir pasta no Drive ↗</a>}
              {by.google.meta?.spreadsheetUrl && <a className="btn ghost" href={by.google.meta.spreadsheetUrl} target="_blank" rel="noreferrer">Abrir planilha de gestão ↗</a>}
              {!by.google.meta?.spreadsheetId && <span className="small muted">Criando a estrutura… atualize em alguns segundos.</span>}
              <div className="row">
                <form action={googleResync}><button className="btn ghost sm">Recriar o que faltar</button></form>
                <Disconnect provider="google" />
              </div>
            </div>
          ) : (
            hasFeature(plan, 'sheets') ? <a className="btn" href="/api/google/connect">Entrar com a conta Google</a> : <span className="muted small">Não incluso no plano.</span>
          )}
        </div>

        {/* Omie */}
        <div className="box stack">
          <div className="row spread"><strong className="section-title"><span className="icon-tile sm t-orange"><IconFactory size={18} /></span>Omie (produtos e NF-e)</strong><Status i={by.omie} /></div>
          {!hasFeature(plan, 'omie') ? <span className="muted small">Disponível nos planos Starter e Pro.</span> : on('omie') ? (
            <>
              <ActionForm action={saveOmieNfe}>
                <span className="small muted">Para a nota fiscal automática (veja os códigos na Omie em Configurações):</span>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <label>Código da categoria<input name="category" defaultValue={by.omie.meta?.nfe?.categoryCode} placeholder="1.01.01" /></label>
                  <label>Código da conta corrente<input name="account" defaultValue={by.omie.meta?.nfe?.accountCode} /></label>
                </div>
                <div><SubmitButton className="btn ghost">Salvar</SubmitButton></div>
              </ActionForm>
              <Disconnect provider="omie" />
            </>
          ) : (
            <ActionForm action={connectOmie}>
              <span className="small muted">Na Omie: Configurações → Aplicativo → Resumo do App → Chave de Integração.</span>
              <label>App Key<input name="app_key" required autoComplete="off" /></label>
              <label>App Secret<input name="app_secret" type="password" required autoComplete="off" /></label>
              <div><SubmitButton pendingText="Testando…">Conectar Omie</SubmitButton></div>
            </ActionForm>
          )}
        </div>
      </div>

      {/* API e webhooks */}
      <h2 style={{ fontSize: 16, marginTop: 28 }}>API e webhooks</h2>
      {!hasFeature(plan, 'api') ? <p className="muted small">Disponível no plano Pro.</p> : (
        <div className="grid grid-2">
          <div className="box stack">
            <strong>Chave da API</strong>
            <span className="small muted">Seu sistema envia vendas, contatos, produtos e mensagens para a Iris.</span>
            {org.api_key_prefix && <div className="code">iris_{org.api_key_prefix}_••••••••</div>}
            <ActionForm action={generateApiKey}><SubmitButton pendingText="Gerando…" className="btn ghost">{org.api_key_prefix ? 'Gerar nova chave' : 'Gerar chave'}</SubmitButton></ActionForm>
            <div className="code">
              POST {worker}/api/v1/orders<br />
              POST {worker}/api/v1/messages<br />
              POST {worker}/api/v1/contacts<br />
              POST {worker}/api/v1/products<br />
              GET {' '}{worker}/api/v1/orders<br />
              Authorization: Bearer iris_…
            </div>
          </div>
          <div className="box stack">
            <strong>Webhooks (a Iris avisa o seu sistema)</strong>
            {(hooks || []).map((h) => (
              <div key={h.id} className="stack" style={{ gap: 4 }}>
                <div className="row spread"><span className="small">{h.url}</span>
                  <form action={removeWebhook}><input type="hidden" name="id" value={h.id} /><button className="btn danger sm">Remover</button></form>
                </div>
                <span className="small muted">Segredo (assinatura X-Iris-Signature): <span className="code">{h.secret}</span></span>
                <span className="small muted">{h.events.join(', ')}</span>
              </div>
            ))}
            <ActionForm action={addWebhook}>
              <label>URL (https)<input name="url" placeholder="https://seusistema.com.br/iris" required /></label>
              <div className="row">{EVENTS.map((e) => <label key={e} className="row" style={{ flexDirection: 'row', gap: 6 }}><input type="checkbox" name="events" value={e} defaultChecked style={{ width: 'auto' }} />{e}</label>)}</div>
              <div><SubmitButton className="btn ghost">Adicionar webhook</SubmitButton></div>
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}
