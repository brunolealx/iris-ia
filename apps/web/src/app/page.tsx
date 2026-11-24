import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { brl } from '@iris/shared/plans';
import { TechBackground } from '@/components/background';
import {
  IrisMark, IconChat, IconCart, IconCatalog, IconInvoice, IconSheet, IconFunnel, IconApi, IconShield, IconCheck, IconArrow,
} from '@/components/icons';

export const revalidate = 300;

const FEATURES = [
  { Icon: IconChat, tone: 't-green', title: 'WhatsApp oficial', text: 'Conexão pelo botão oficial da Meta. Sem QR code e sem automação de WhatsApp Web.' },
  { Icon: IconCart, tone: 't-yellow', title: 'Mercado Livre completo', text: 'Perguntas, mensagens pós-venda, pedidos, envios, anúncios e alertas de reclamação.' },
  { Icon: IconCatalog, tone: 't-blue', title: 'IA que conhece seu catálogo', text: 'Puxa os anúncios do Mercado Livre, planilha CSV ou API e responde com preço e estoque reais.' },
  { Icon: IconInvoice, tone: 't-orange', title: 'Notas fiscais automáticas', text: 'NF-e das vendas pelo Faturador do Mercado Livre e NFS-e de serviços pela API oficial do governo, com o XML salvo no Drive.' },
  { Icon: IconSheet, tone: 't-cyan', title: 'Gestão no Google Drive', text: 'Pastas e planilha de vendas, clientes, funcionários, folha, folgas, contas e fluxo de caixa.' },
  { Icon: IconFunnel, tone: 't-pink', title: 'CRM com funil', text: 'Cada contato vira lead com histórico completo, do primeiro oi ao pós-venda.' },
  { Icon: IconApi, tone: 't-purple', title: 'API e webhooks', text: 'Seu sistema envia vendas e mensagens e recebe eventos assinados em tempo real.' },
  { Icon: IconShield, tone: 't-red', title: 'Você no controle', text: 'A IA sugere e você aprova. Reembolso, troca e reclamação sempre passam por uma pessoa.' },
];

export default async function Landing() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: plans } = await sb.from('plans').select('*').eq('active', true).order('sort');
  const wrap = 'mx-auto w-full max-w-[1180px] px-6';
  const h2 = 'm-0 mb-2.5 text-[clamp(28px,3.6vw,40px)] leading-[1.08] font-extrabold tracking-[-0.035em] text-balance';

  return (
    <>
      <TechBackground />

      <header className="sticky top-0 z-10 border-b border-line bg-bg/60 backdrop-blur-md">
        <div className={`${wrap} flex items-center justify-between gap-4 py-3.5`}>
          <Link href="/" className="brand"><IrisMark /> Iris</Link>
          <nav className="flex items-center gap-5 text-sm font-medium">
            <a href="#recursos" className="hidden text-muted hover:text-ink hover:no-underline sm:inline">Recursos</a>
            <a href="#planos" className="text-muted hover:text-ink hover:no-underline">Planos</a>
            <Link className="btn sm" href="/entrar">Entrar</Link>
          </nav>
        </div>
      </header>

      <section className={`${wrap} pt-[clamp(72px,12vw,150px)] pb-[clamp(64px,10vw,130px)]`}>
        <div className="max-w-[640px]">
          <span className="mb-5.5 inline-flex items-center gap-2 rounded-full bg-white/6 py-1.5 pr-3 pl-1.5 text-[13px] font-semibold">
            <b className="rounded-full bg-iris px-2 py-0.5 text-xs text-iris-ink">Novo</b> Atendimento com IA para lojistas
          </span>
          <h1 className="m-0 text-[clamp(38px,5.6vw,66px)] leading-[1.02] font-extrabold tracking-[-0.045em] text-balance">
            Sua loja vendendo <span className="text-iris">24 horas</span> no WhatsApp e no Mercado Livre
          </h1>
          <p className="mt-5 mb-7.5 max-w-[560px] text-lg leading-relaxed text-muted">
            A Iris responde seus clientes, organiza as vendas no CRM, emite as notas fiscais e mantém tudo em planilhas no seu Google Drive.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="btn lg" href="/entrar?cadastro=1">Testar grátis por 14 dias <IconArrow /></Link>
            <a className="btn lg ghost" href="#planos">Ver planos</a>
          </div>
          <dl className="mt-9 flex flex-wrap gap-8">
            {[['24h', 'atendimento'], ['14', 'dias grátis'], ['5', 'integrações']].map(([n, l]) => (
              <div key={l} className="flex flex-col-reverse">
                <dt className="text-[13px] text-muted">{l}</dt>
                <dd className="m-0 text-[32px] font-extrabold tracking-[-0.04em] tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className={`${wrap} grid items-center gap-12 py-14 md:grid-cols-2`}>
        <div className="max-w-[640px]">
          <h2 className={h2}>Atendimento que entende o seu estoque</h2>
          <p className="m-0 text-base text-muted">A IA consulta o catálogo, responde em segundos e deixa com você o que precisa de decisão.</p>
          <ol className="mt-6.5 flex list-none flex-col gap-4.5 p-0">
            {[
              ['O cliente pergunta', 'No WhatsApp ou no anúncio do Mercado Livre.'],
              ['A Iris consulta seus dados', 'Preço, estoque, prazo e regras da sua loja.'],
              ['Responde ou pede sua aprovação', 'Casos sensíveis sempre passam por você.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex items-start gap-3.5">
                <span className="grid size-8.5 flex-none place-items-center rounded-[10px] bg-iris font-extrabold text-iris-ink tabular-nums">{i + 1}</span>
                <div><b>{t}</b><p className="mt-0.5 text-[14.5px] text-muted">{d}</p></div>
              </li>
            ))}
          </ol>
        </div>

        {/* Prévia ilustrativa de uma conversa */}
        <div className="rounded-[22px] border border-line-strong bg-surface/80 p-4.5 shadow-[0_30px_80px_rgb(0_0_0/0.55)]" aria-label="Exemplo ilustrativo de atendimento">
          <div className="mb-3.5 flex items-center gap-2.5 border-b border-line pb-3.5">
            <span className="icon-tile sm t-green"><IconChat size={18} /></span>
            <div className="flex flex-col">
              <strong className="text-sm">WhatsApp · Loja exemplo</strong>
              <span className="text-[12.5px] text-muted">Exemplo ilustrativo</span>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="bubble in max-w-[85%]">Oi! O cabo USB-C de 2 metros tem pronta entrega?</div>
            <div className="bubble out max-w-[85%]">Tem sim! Temos 18 unidades por R$ 39,90 e postamos em até 1 dia útil. Quer que eu separe o seu?</div>
            <div className="bubble in max-w-[85%]">Quero, pode separar</div>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <span className="badge ok">Respondido pela IA</span>
            <span className="badge">Estoque consultado no catálogo</span>
          </div>
        </div>
      </section>

      <section id="recursos" className={`${wrap} scroll-mt-16 py-14`}>
        <div className="mb-7.5 max-w-[640px]">
          <h2 className={h2}>Tudo o que a sua loja precisa num só lugar</h2>
          <p className="m-0 text-muted">Atendimento, vendas, notas e gestão conectados, sem trocar de sistema.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-3.5">
          {FEATURES.map(({ Icon, tone, title, text }) => (
            <article key={title} className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface/80 p-5.5 transition duration-200 hover:-translate-y-0.5 hover:border-line-strong">
              <span className={`icon-tile ${tone}`}><Icon /></span>
              <h3 className="m-0 text-[17px] font-bold tracking-tight">{title}</h3>
              <p className="m-0 text-[14.5px] leading-relaxed text-muted">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="planos" className={`${wrap} scroll-mt-16 py-14`}>
        <div className="mb-7.5 max-w-[640px]">
          <h2 className={h2}>Planos simples, sem fidelidade</h2>
          <p className="m-0 text-muted">Comece grátis e mude de plano quando quiser.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(270px,100%),1fr))] items-stretch gap-4">
          {(plans || []).map((p) => {
            const featured = p.id === 'starter';
            return (
              <div key={p.id} className={`flex flex-col gap-1.5 rounded-[20px] bg-surface/90 p-6.5 ${featured ? 'border-2 border-iris' : 'border border-line'}`}>
                <div className="flex items-center justify-between gap-2.5 font-bold">
                  <span>{p.name}</span>
                  {featured && <span className="rounded-lg bg-iris px-2.5 py-1 text-xs font-bold text-iris-ink">Mais escolhido</span>}
                </div>
                <div className="mt-2 mb-0.5 text-[44px] font-extrabold tracking-[-0.045em] tabular-nums">
                  {p.price_cents ? brl(p.price_cents) : 'Grátis'}
                  <small className="text-sm font-medium tracking-normal text-muted">{p.price_cents ? ' /mês' : ' por 14 dias'}</small>
                </div>
                <ul className="mt-4 mb-5.5 flex flex-1 list-none flex-col gap-2.5 p-0 text-sm [&_svg]:mt-0.5 [&_svg]:flex-none [&_svg]:text-iris [&>li]:flex [&>li]:items-start [&>li]:gap-2.5">
                  <li><IconCheck /> <span><b className="tabular-nums">{p.ai_replies_month.toLocaleString('pt-BR')}</b> respostas da IA por mês</span></li>
                  <li><IconCheck /> WhatsApp e Mercado Livre</li>
                  <li><IconCheck /> <span>Até <b className="tabular-nums">{p.products_max.toLocaleString('pt-BR')}</b> produtos</span></li>
                  <li><IconCheck /> {p.users_max} {p.users_max > 1 ? 'usuários' : 'usuário'}</li>
                  <li><IconCheck /> CRM e planilhas no Google Drive</li>
                  {p.features.includes('nfe') && <li><IconCheck /> NF-e automática nas vendas do ML</li>}
                  {p.features.includes('nfse') && <li><IconCheck /> NFS-e Nacional (serviços)</li>}
                  {p.features.includes('api') && <li><IconCheck /> API e webhooks</li>}
                  <li><IconCheck /> IA {p.ai_model.includes('sonnet') ? 'avançada (Sonnet)' : 'rápida (Haiku)'}</li>
                </ul>
                <Link className={`btn w-full ${featured ? '' : 'ghost'}`} href="/entrar?cadastro=1">Começar agora</Link>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className={`${wrap} flex flex-wrap justify-between gap-4 pt-7 pb-10 text-[13px] text-muted`}>
          <span className="brand text-[15px]"><IrisMark size={22} /> Iris</span>
          <span>© {new Date().getFullYear()} Iris · Atendimento com IA para lojistas</span>
        </div>
      </footer>
    </>
  );
}
