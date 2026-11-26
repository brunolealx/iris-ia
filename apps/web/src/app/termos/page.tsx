import type { Metadata } from 'next';
import Link from 'next/link';
import { IrisMark } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Termos de Uso e Contrato de Assinatura · Iris',
  description: 'Regras de uso da Iris: planos, WhatsApp oficial, Mercado Livre, IA, notas fiscais e proteção de dados.',
};

const ATUALIZADO = '26 de novembro de 2026';
const SUPORTE = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
const contato = SUPORTE ? <a href={`mailto:${SUPORTE}`}>{SUPORTE}</a> : 'pelo canal de suporte do painel';

function S({ n, t, children }: { n: number; t: string; children: React.ReactNode }) {
  return (
    <section id={`s${n}`} className="scroll-mt-20">
      <h2 className="mt-10 mb-3 text-xl font-bold tracking-tight">{n}. {t}</h2>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink/85 [&_li]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
    </section>
  );
}

export default function Termos() {
  return (
    <>
      <header className="border-b border-line bg-bg/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-[820px] items-center justify-between px-6 py-3.5">
          <Link href="/" className="brand"><IrisMark /> Iris</Link>
          <Link className="btn sm ghost" href="/entrar">Entrar</Link>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-6 pt-12 pb-20">
        <h1 className="m-0 text-[clamp(28px,4vw,38px)] font-extrabold tracking-[-0.03em]">Termos de Uso e Contrato de Assinatura</h1>
        <p className="mt-2 text-sm text-muted">Última atualização: {ATUALIZADO}</p>
        <p className="mt-6 text-[15px] leading-relaxed text-ink/85">
          Estes termos regem o uso da <b>Iris</b>, plataforma de atendimento e vendas com inteligência artificial para WhatsApp e Mercado Livre,
          mantida por <b>Bruno Leal da Silva</b>, de Sorocaba–SP (“Iris”, “nós”). Ao criar uma conta ou assinar um plano, a empresa ou pessoa que
          contrata (“Cliente”, “você”) declara que leu e aceita estes termos.
        </p>

        <nav className="mt-6 rounded-2xl border border-line bg-surface/70 p-5 text-sm">
          <b>Resumo do que mais importa</b>
          <ul className="mt-2 list-disc pl-5 text-muted [&_li]:mb-1">
            <li>As contas do WhatsApp, da Meta e do Mercado Livre são <b className="text-ink">suas</b>. A Iris só recebe permissão para operar e você pode retirar quando quiser.</li>
            <li>Para usar o WhatsApp oficial, você precisa de <b className="text-ink">CNPJ próprio (MEI serve)</b> e de um portfólio comercial seu na Meta, verificado por você.</li>
            <li>Teste grátis de 14 dias, sem fidelidade. Cancelando, o acesso segue até o fim do período pago.</li>
            <li>A IA pode errar. Casos sensíveis (reembolso, troca, reclamação) sempre passam por uma pessoa.</li>
          </ul>
        </nav>

        <S n={1} t="O serviço">
          <p>A Iris responde clientes no WhatsApp e no Mercado Livre usando o catálogo e as regras do seu negócio, organiza contatos e vendas num CRM, pode emitir notas fiscais (NF-e pelo Faturador do Mercado Livre e NFS-e pela API nacional) e mantém planilhas no seu Google Drive. Os recursos de cada plano estão na página de planos e no painel.</p>
        </S>

        <S n={2} t="Conta e cadastro">
          <ul>
            <li>Você deve informar dados verdadeiros e manter seu e-mail e senha em segurança. Tudo o que for feito com o seu acesso é de sua responsabilidade.</li>
            <li>Ao convidar usuários, você responde pelo que eles fizerem no painel.</li>
            <li>É preciso ter pelo menos 18 anos e capacidade para contratar em nome da empresa.</li>
          </ul>
        </S>

        <S n={3} t="Planos, pagamento e cancelamento">
          <ul>
            <li><b>Teste grátis:</b> 14 dias, sem cartão. Ao fim do teste, as respostas automáticas param até você assinar.</li>
            <li><b>Cobrança:</b> mensal e recorrente, pelo Mercado Pago, no valor do plano escolhido mostrado no momento da assinatura.</li>
            <li><b>Sem fidelidade:</b> você cancela quando quiser, pelo link da assinatura no e-mail do Mercado Pago ou {contato}. O acesso continua até o fim do período já pago e não há cobrança seguinte.</li>
            <li><b>Arrependimento:</b> na primeira contratação, você pode desistir em até 7 dias da primeira cobrança e receber o valor de volta, conforme o art. 49 do Código de Defesa do Consumidor.</li>
            <li><b>Limites:</b> cada plano tem um número de respostas da IA por mês, produtos e usuários. Ao atingir o limite, a IA passa a deixar as respostas como sugestão para você aprovar, até o mês seguinte ou a troca de plano.</li>
            <li><b>Reajuste:</b> mudanças de preço são avisadas com pelo menos 30 dias de antecedência e valem a partir da cobrança seguinte.</li>
            <li><b>Falta de pagamento:</b> se a cobrança falhar, a conta fica suspensa (sem respostas automáticas) até a regularização. Os dados são mantidos conforme o item 9.</li>
          </ul>
        </S>

        <S n={4} t="WhatsApp: a conta é sua">
          <p>A Iris usa somente a <b>API oficial do WhatsApp (WhatsApp Cloud API, da Meta)</b>. Não usamos QR code nem automação de WhatsApp Web.</p>
          <ol>
            <li><b>Requisitos:</b> para conectar o WhatsApp, você precisa de <b>CNPJ próprio</b> (o MEI é aceito pela Meta) e de um <b>portfólio comercial seu na Meta</b> (business.facebook.com), criado com a sua conta.</li>
            <li><b>Verificação:</b> a verificação da empresa na Meta é feita <b>por você, com os documentos da sua empresa</b>. A Iris pode orientar o passo a passo, mas nunca usa o CNPJ ou os documentos de outra empresa, nem os seus para outra finalidade.</li>
            <li><b>Conexão:</b> você gera, no seu portfólio, o identificador do número e um token de acesso, e informa na Iris. Quando a conexão por um clique (Cadastro Incorporado da Meta) estiver disponível, você poderá usá-la no lugar.</li>
            <li><b>Propriedade:</b> o número, a conta do WhatsApp Business, o portfólio e o histórico na Meta continuam sendo seus. A Iris recebe apenas <b>permissão para enviar e receber mensagens em seu nome</b>.</li>
            <li><b>Revogação:</b> você pode retirar o acesso a qualquer momento, desconectando na Iris ou removendo o token e o app no seu portfólio da Meta. Ao desconectar na Iris, o token é apagado na hora.</li>
            <li><b>Custos da Meta:</b> a Meta pode cobrar por conversa ou por mensagem de modelo (template). Essa cobrança é feita pela Meta, na forma de pagamento cadastrada por você, e não está incluída no preço da Iris.</li>
            <li><b>Uso do número:</b> um número conectado à API oficial deixa de funcionar no aplicativo WhatsApp/WhatsApp Business comum, a menos que a Meta libere o uso simultâneo para a sua conta. O atendimento passa a ser feito pelo painel da Iris.</li>
            <li><b>Regras da Meta:</b> você se compromete a seguir a Política Comercial e a Política do WhatsApp Business, incluindo ter o consentimento dos clientes para receber mensagens e usar modelos aprovados fora da janela de 24 horas. Bloqueios, restrições ou limites aplicados pela Meta por descumprimento dessas regras são de sua responsabilidade.</li>
          </ol>
        </S>

        <S n={5} t="Mercado Livre e outras integrações">
          <ul>
            <li>A conexão com o Mercado Livre, o Google Drive e o Mercado Pago é feita por autorização oficial (OAuth) da sua própria conta. Você pode revogar pelo painel da Iris ou pela própria plataforma.</li>
            <li>Você deve seguir as regras de cada plataforma. No Mercado Livre, por exemplo, a Iris nunca envia telefone, e-mail ou links externos ao comprador.</li>
            <li>A Iris não responde por mudanças, falhas, bloqueios ou cobranças dessas plataformas.</li>
          </ul>
        </S>

        <S n={6} t="Inteligência artificial">
          <ul>
            <li>As respostas são geradas por IA a partir das informações que você cadastra (catálogo, preços, estoque, prazos e regras). Mantenha esses dados corretos. Respostas baseadas em dados desatualizados são de sua responsabilidade.</li>
            <li>A IA pode errar. Por isso você escolhe, por canal, se ela responde sozinha ou só sugere para você aprovar, e pode assumir qualquer conversa.</li>
            <li>A Iris foi configurada para <b>não prometer reembolso, desconto ou troca</b>: esses casos, e reclamações, ficam para aprovação humana.</li>
            <li>Você é o responsável pelas mensagens enviadas em nome da sua empresa, inclusive as aprovadas ou enviadas automaticamente.</li>
          </ul>
        </S>

        <S n={7} t="Notas fiscais">
          <ul>
            <li>As notas são emitidas <b>em nome da sua empresa</b>, com os seus dados fiscais e, na NFS-e, com o seu certificado digital A1. As obrigações fiscais e tributárias continuam sendo suas e do seu contador.</li>
            <li>A NF-e de vendas do Mercado Livre é emitida pelo Faturador do próprio Mercado Livre. A Iris apenas solicita, acompanha e guarda o XML.</li>
            <li>Confira as configurações fiscais antes de ativar a emissão automática. A Iris não substitui orientação contábil.</li>
          </ul>
        </S>

        <S n={8} t="Uso permitido">
          <p>É proibido usar a Iris para:</p>
          <ul>
            <li>enviar mensagens em massa sem consentimento (spam), golpes, ou conteúdo enganoso, ilegal ou discriminatório;</li>
            <li>vender produtos ou serviços proibidos pelas plataformas ou pela lei;</li>
            <li>tentar acessar dados de outros clientes, burlar limites do plano ou atacar o sistema;</li>
            <li>revender o acesso sem autorização por escrito.</li>
          </ul>
          <p>Nesses casos, podemos suspender a conta, com aviso quando possível.</p>
        </S>

        <S n={9} t="Dados e privacidade (LGPD)">
          <ul>
            <li>Para os dados dos <b>seus clientes</b> (contatos, conversas, pedidos), você é o <b>controlador</b> e a Iris é a <b>operadora</b>: tratamos esses dados só para prestar o serviço e conforme as suas instruções.</li>
            <li>Tokens de acesso e o certificado digital ficam criptografados. Cada empresa só acessa os próprios dados.</li>
            <li>Usamos fornecedores para funcionar: Supabase (banco de dados), Vercel e Render (hospedagem), Anthropic (modelo de IA Claude), Meta, Mercado Livre, Google e Mercado Pago. As mensagens são enviadas à IA apenas para gerar a resposta.</li>
            <li>Você pode exportar seus dados para o Google Drive a qualquer momento e pedir a exclusão de todos eles, {contato}. Após o pedido, apagamos em até 30 dias, salvo o que a lei obrigar a manter.</li>
            <li>Se houver incidente de segurança que afete seus dados, avisaremos você em prazo razoável.</li>
          </ul>
        </S>

        <S n={10} t="API, MCP e webhooks">
          <p>Nos planos que incluem API, você recebe uma chave de acesso. Ela vale só para a sua conta, deve ser mantida em segredo e pode ser trocada no painel. Há limite de chamadas por minuto. Ferramentas que você conectar à API (sistemas próprios, n8n, agentes de IA pelo MCP da Iris) agem em seu nome e sob sua responsabilidade.</p>
        </S>

        <S n={11} t="Disponibilidade e responsabilidade">
          <ul>
            <li>Trabalhamos para manter a Iris no ar o tempo todo, mas podem ocorrer interrupções para manutenção ou por falhas de terceiros (Meta, Mercado Livre, provedores de hospedagem e de IA).</li>
            <li>A Iris não responde por lucros cessantes, vendas perdidas, bloqueios aplicados por plataformas ou decisões tomadas com base em respostas da IA.</li>
            <li>Quando houver responsabilidade nossa, ela fica limitada ao valor pago por você nos 3 meses anteriores ao fato, exceto nos casos em que a lei não permite essa limitação.</li>
          </ul>
        </S>

        <S n={12} t="Mudanças nestes termos">
          <p>Podemos atualizar estes termos. Mudanças importantes serão avisadas no painel ou por e-mail com pelo menos 15 dias de antecedência. Se você continuar usando a Iris depois disso, os novos termos passam a valer. Se não concordar, pode cancelar sem multa.</p>
        </S>

        <S n={13} t="Contato e foro">
          <p>Dúvidas, pedidos sobre dados ou cancelamento: {contato}.</p>
          <p>Fica eleito o foro da comarca de Sorocaba–SP, ressalvado o direito do consumidor de propor ação no seu domicílio.</p>
        </S>
      </main>
    </>
  );
}
