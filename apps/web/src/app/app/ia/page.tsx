import { requireOrg, hasFeature } from '@/lib/org';
import { saveAi } from '../actions';
import { ActionForm, SubmitButton } from '@/components/client';

const MODES = [
  ['suggest', 'Sugestão — a IA escreve e eu aprovo (recomendado no começo)'],
  ['auto', 'Automático — envia sozinha (casos sensíveis vão para aprovação)'],
  ['off', 'Desligado — só registra as mensagens'],
];

export default async function Ia() {
  const { org, plan } = await requireOrg();
  return (
    <>
      <div className="page-head"><div><h1>Inteligência artificial</h1><p>Como a {org.ai_name} fala e o que ela sabe sobre o seu negócio.</p></div></div>
      <ActionForm action={saveAi}>
        <div className="grid grid-2">
          <div className="box stack">
            <strong>Identidade</strong>
            <label>Nome da empresa<input name="name" defaultValue={org.name} /></label>
            <label>Nome da assistente<input name="ai_name" defaultValue={org.ai_name} /></label>
            <label>Tom de voz<input name="ai_tone" defaultValue={org.ai_tone} placeholder="cordial, direto e curto" /></label>
          </div>
          <div className="box stack">
            <strong>Modo de envio</strong>
            <label>WhatsApp<select name="mode_whatsapp" defaultValue={org.mode_whatsapp}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>Mercado Livre<select name="mode_ml" defaultValue={org.mode_ml}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>Confiança mínima para envio automático ({Math.round(Number(org.min_confidence) * 100)}%)
              <input name="min_confidence" type="number" min="0.3" max="1" step="0.05" defaultValue={org.min_confidence} />
            </label>
            <span className="small muted">Sempre vão para aprovação: reembolso, cancelamento, troca, desconto, pagamento, defeito, atraso e reclamações.</span>
          </div>
        </div>

        <div className="box stack" style={{ marginTop: 14 }}>
          <strong>O que a IA sabe sobre o seu negócio</strong>
          <span className="small muted">Horário, formas de pagamento, prazos de envio, garantia, trocas, perguntas frequentes… A IA só responde com o que estiver aqui, no catálogo de produtos e no anúncio.</span>
          <textarea name="knowledge" rows={14} defaultValue={org.knowledge} placeholder={'Horário: seg a sex, 9h às 18h\nEnvio: postamos em até 1 dia útil\nGarantia: 90 dias contra defeito de fabricação\nPagamento no WhatsApp: Pix ou link de cartão enviado por um atendente'} />
        </div>

        <div className="box stack" style={{ marginTop: 14 }}>
          <strong>Nota fiscal das vendas do Mercado Livre (NF-e)</strong>
          {hasFeature(plan, 'nfe') ? (
            <label>
              Modo
              <select name="nfe_mode" defaultValue={org.nfe_mode}>
                <option value="off">Desligado</option>
                <option value="manual">Manual: eu clico em "Emitir nota" em cada venda</option>
                <option value="auto">Automático: emite pelo Faturador do ML quando a venda é paga</option>
              </select>
            </label>
          ) : (
            <>
              <input type="hidden" name="nfe_mode" value="off" />
              <span className="small muted">Disponível no plano Pro.</span>
            </>
          )}
          <span className="small muted">A nota sai pelo Faturador do Mercado Livre, que já vincula a NF-e à venda. Antes, ative o Faturador na sua conta do ML (certificado A1 e dados da SEFAZ) e preencha os dados fiscais de cada anúncio (NCM, origem). A Iris acompanha a autorização e salva o XML no seu Google Drive. No Mercado Envios Full o ML emite sozinho e a Iris só busca a nota.</span>
        </div>

        <div style={{ marginTop: 14 }}><SubmitButton>Salvar</SubmitButton></div>
      </ActionForm>
    </>
  );
}
