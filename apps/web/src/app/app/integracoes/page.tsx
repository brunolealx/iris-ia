import { requireOrg, hasFeature } from '@/lib/org';
import { saveNfse, disconnect, googleResync, generateApiKey, addWebhook, removeWebhook } from '../actions';
import { ActionForm, SubmitButton } from '@/components/client';
import { WhatsappConnect } from './whatsapp-connect';
import { IconChat, IconCart, IconDrive, IconInvoice } from '@/components/icons';

const EVENTS = ['message.received', 'draft.created', 'contact.created', 'order.created', 'order.updated', 'claim.opened', 'invoice.requested', 'invoice.authorized', 'service_invoice.authorized', 'service_invoice.rejected', 'service_invoice.canceled'];

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
  const nf: any = by.nfse?.meta?.config || {};

  return (
    <>
      <div className="page-head"><div><h1>Integrações</h1><p>Conecte seus canais, a nota fiscal de serviço e o seu Google Drive.</p></div></div>

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

        {/* NFS-e Nacional */}
        <div className="box stack">
          <div className="row spread"><strong className="section-title"><span className="icon-tile sm t-orange"><IconInvoice size={18} /></span>NFS-e Nacional (notas de serviço)</strong><Status i={by.nfse} /></div>
          {!hasFeature(plan, 'nfse') ? <span className="muted small">Disponível no plano Pro.</span> : (
            <ActionForm action={saveNfse}>
              <span className="small muted">
                Emissão pela API oficial do governo (Sefin Nacional). Precisa do certificado digital A1 (e-CNPJ) da empresa e de o seu
                município estar no padrão nacional. Comece em <strong>produção restrita</strong> para testar sem valor fiscal.
              </span>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label>Ambiente
                  <select name="tpAmb" defaultValue={String(nf.tpAmb || 2)}>
                    <option value="2">Produção restrita (testes)</option>
                    <option value="1">Produção (vale de verdade)</option>
                  </select>
                </label>
                <label>CNPJ do prestador<input name="cnpj" required defaultValue={nf.cnpj} placeholder="00.000.000/0001-00" inputMode="numeric" /></label>
                <label>Inscrição municipal<input name="im" defaultValue={nf.im} /></label>
                <label>Município (código IBGE)<input name="cLocEmi" required defaultValue={nf.cLocEmi} placeholder="3552205" inputMode="numeric" /></label>
                <label>Regime
                  <select name="opSimpNac" defaultValue={nf.opSimpNac || '3'}>
                    <option value="1">Não optante do Simples</option>
                    <option value="2">MEI</option>
                    <option value="3">Simples Nacional (ME/EPP)</option>
                  </select>
                </label>
                <label>Apuração no Simples
                  <select name="regApTribSN" defaultValue={nf.regApTribSN || '1'}>
                    <option value="1">Tributos pelo Simples</option>
                    <option value="2">Federais pelo Simples, ISS por fora</option>
                    <option value="3">Tudo por fora do Simples</option>
                  </select>
                </label>
                <label>Código de tributação nacional<input name="cTribNac" required defaultValue={nf.cTribNac} placeholder="010101" inputMode="numeric" /></label>
                <label>Código NBS<input name="cNBS" required defaultValue={nf.cNBS} placeholder="101011100" inputMode="numeric" /></label>
                <label>Código de tributação municipal (opcional)<input name="cTribMun" defaultValue={nf.cTribMun} /></label>
                <label>Alíquota do ISS % (opcional)<input name="pAliq" defaultValue={nf.pAliq} placeholder="2,00" inputMode="decimal" /></label>
                <label>% total de tributos do Simples (opcional)<input name="pTotTribSN" defaultValue={nf.pTotTribSN} placeholder="6,00" inputMode="decimal" /></label>
                <label>Regime especial<input name="regEspTrib" defaultValue={nf.regEspTrib || '0'} inputMode="numeric" /></label>
                <label>Série da DPS<input name="serie" defaultValue={nf.serie || '1'} inputMode="numeric" /></label>
                <label>Próximo número da DPS<input name="nextNumber" defaultValue={nf.nextNumber || 1} inputMode="numeric" /></label>
              </div>
              <details>
                <summary className="small">IBS/CBS (reforma tributária)</summary>
                <div className="stack" style={{ marginTop: 8 }}>
                  <label className="row"><input type="checkbox" name="ibscbs" defaultChecked={!!nf.ibscbs?.enabled} /> Informar o grupo IBS/CBS na nota</label>
                  <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <label>Indicador da operação<input name="cIndOp" defaultValue={nf.ibscbs?.cIndOp} placeholder="6 dígitos" inputMode="numeric" /></label>
                    <label>CST<input name="CST" defaultValue={nf.ibscbs?.CST} placeholder="000" inputMode="numeric" /></label>
                    <label>Classificação tributária<input name="cClassTrib" defaultValue={nf.ibscbs?.cClassTrib} placeholder="000001" inputMode="numeric" /></label>
                  </div>
                  <label className="row"><input type="checkbox" name="indFinal" defaultChecked={!!nf.ibscbs?.indFinal} /> Uso ou consumo pessoal do tomador</label>
                  <span className="small muted">Confirme os códigos com o seu contador.</span>
                </div>
              </details>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label>Certificado A1 (.pfx){on('nfse') && <span className="small muted"> · já enviado, envie só para trocar</span>}<input name="pfx" type="file" accept=".pfx,.p12,application/x-pkcs12" required={!on('nfse')} /></label>
                <label>Senha do certificado<input name="password" type="password" autoComplete="off" /></label>
              </div>
              <span className="small muted">O certificado fica criptografado e só o servidor da Iris o usa, para assinar e enviar as suas notas.</span>
              <div className="row">
                <SubmitButton pendingText="Conferindo…">Salvar</SubmitButton>
                {on('nfse') && <a className="btn ghost" href="/app/notas">Emitir nota de serviço</a>}
              </div>
            </ActionForm>
          )}
          {on('nfse') && <Disconnect provider="nfse" />}
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
