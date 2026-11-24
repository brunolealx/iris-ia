import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { brl } from '@iris/shared/plans';
import { Badge } from '@/components/ui';
import { TechBackground } from '@/components/background';
import {
  IrisMark, IconChat, IconCart, IconCatalog, IconInvoice, IconSheet, IconFunnel, IconApi, IconShield, IconCheck, IconArrow,
} from '@/components/icons';

export const revalidate = 300;

const FEATURES = [
  { Icon: IconChat, tone: 't-green', title: 'WhatsApp oficial', text: 'Conexão pelo botão oficial da Meta. Sem QR code e sem automação de WhatsApp Web.' },
  { Icon: IconCart, tone: 't-yellow', title: 'Mercado Livre completo', text: 'Perguntas, mensagens pós-venda, pedidos, envios, anúncios e alertas de reclamação.' },
  { Icon: IconCatalog, tone: 't-blue', title: 'IA que conhece seu catálogo', text: 'Importa produtos da Omie, CSV ou API e responde com preço e estoque reais.' },
  { Icon: IconInvoice, tone: 't-orange', title: 'Nota fiscal automática', text: 'Venda no ML vira pedido na Omie, a NF-e é emitida e o XML vai para o anúncio e para o Drive.' },
  { Icon: IconSheet, tone: 't-cyan', title: 'Gestão no Google Drive', text: 'Pastas e planilha de vendas, clientes, funcionários, folha, folgas, contas e fluxo de caixa.' },
  { Icon: IconFunnel, tone: 't-pink', title: 'CRM com funil', text: 'Cada contato vira lead com histórico completo, do primeiro oi ao pós-venda.' },
  { Icon: IconApi, tone: 't-purple', title: 'API e webhooks', text: 'Seu sistema envia vendas e mensagens e recebe eventos assinados em tempo real.' },
  { Icon: IconShield, tone: 't-red', title: 'Você no controle', text: 'A IA sugere e você aprova. Reembolso, troca e reclamação sempre passam por uma pessoa.' },
];

export default async function Landing() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: plans } = await sb.from('plans').select('*').eq('active', true).order('sort');

  return (
    <>
      <TechBackground />

      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" className="brand"><IrisMark /> Iris</Link>
          <nav className="row" style={{ gap: 22 }}>
            <a href="#recursos">Recursos</a>
            <a href="#planos">Planos</a>
            <Link className="btn sm" href="/entrar">Entrar</Link>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow"><b>Novo</b> Atendimento com IA para lojistas</span>
          <h1>Sua loja vendendo <span>24 horas</span> no WhatsApp e no Mercado Livre</h1>
          <p className="lead">
            A Iris responde seus clientes, organiza as vendas no CRM, emite nota fiscal pela Omie e mantém tudo em planilhas no seu Google Drive.
          </p>
          <div className="row" style={{ gap: 12 }}>
            <Link className="btn lg" href="/entrar?cadastro=1">Testar grátis por 14 dias <IconArrow /></Link>
            <a className="btn lg ghost" href="#planos">Ver planos</a>
          </div>
          <div className="stats">
            <div><strong className="num">24h</strong><span>atendimento</span></div>
            <div><strong className="num">14</strong><span>dias grátis</span></div>
            <div><strong className="num">5</strong><span>integrações</span></div>
          </div>
        </div>

      </section>

      <section className="section how">
        <div className="section-head">
          <h2>Atendimento que entende o seu estoque</h2>
          <p>A IA consulta o catálogo, responde em segundos e deixa com você o que precisa de decisão.</p>
          <ol className="steps">
            <li><span className="num">1</span><div><b>O cliente pergunta</b><p>No WhatsApp ou no anúncio do Mercado Livre.</p></div></li>
            <li><span className="num">2</span><div><b>A Iris consulta seus dados</b><p>Preço, estoque, prazo e regras da sua loja.</p></div></li>
            <li><span className="num">3</span><div><b>Responde ou pede sua aprovação</b><p>Casos sensíveis sempre passam por você.</p></div></li>
          </ol>
        </div>
        {/* Prévia ilustrativa de uma conversa */}
        <div className="preview" aria-label="Exemplo ilustrativo de atendimento">
          <div className="preview-head">
            <span className="icon-tile sm t-green"><IconChat size={18} /></span>
            <div className="stack" style={{ gap: 0 }}>
              <strong style={{ fontSize: 14 }}>WhatsApp · Loja exemplo</strong>
              <span className="muted small">Exemplo ilustrativo</span>
            </div>
          </div>
          <div className="preview-chat">
            <div className="bubble in">Oi! O cabo USB-C de 2 metros tem pronta entrega?</div>
            <div className="bubble out">Tem sim! Temos 18 unidades por R$ 39,90 e postamos em até 1 dia útil. Quer que eu separe o seu?</div>
            <div className="bubble in">Quero, pode separar</div>
          </div>
          <div className="preview-foot">
            <span className="badge ok">Respondido pela IA</span>
            <span className="badge">Estoque consultado na Omie</span>
          </div>
        </div>
      </section>

      <section id="recursos" className="section">
        <div className="section-head">
          <h2>Tudo o que a sua loja precisa num só lugar</h2>
          <p>Atendimento, vendas, notas e gestão conectados, sem trocar de sistema.</p>
        </div>
        <div className="features">
          {FEATURES.map(({ Icon, tone, title, text }) => (
            <article key={title} className="feature">
              <span className={`icon-tile ${tone}`}><Icon /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="planos" className="section">
        <div className="section-head">
          <h2>Planos simples, sem fidelidade</h2>
          <p>Comece grátis e mude de plano quando quiser.</p>
        </div>
        <div className="plans">
          {(plans || []).map((p) => {
            const featured = p.id === 'starter';
            return (
              <div key={p.id} className={`plan ${featured ? 'featured' : ''}`}>
                <div className="plan-name">
                  <span>{p.name}</span>
                  {featured && <Badge variant="green" label="Mais escolhido" />}
                </div>
                <div className="price">
                  {p.price_cents ? brl(p.price_cents) : 'Grátis'}
                  <small>{p.price_cents ? ' /mês' : ' por 14 dias'}</small>
                </div>
                <ul className="checklist">
                  <li><IconCheck /> <span><b className="num">{p.ai_replies_month.toLocaleString('pt-BR')}</b> respostas da IA por mês</span></li>
                  <li><IconCheck /> WhatsApp e Mercado Livre</li>
                  <li><IconCheck /> <span>Até <b className="num">{p.products_max.toLocaleString('pt-BR')}</b> produtos</span></li>
                  <li><IconCheck /> {p.users_max} {p.users_max > 1 ? 'usuários' : 'usuário'}</li>
                  <li><IconCheck /> CRM e planilhas no Google Drive</li>
                  {p.features.includes('omie') && <li><IconCheck /> Importação da Omie</li>}
                  {p.features.includes('nfe') && <li><IconCheck /> Nota fiscal automática</li>}
                  {p.features.includes('api') && <li><IconCheck /> API e webhooks</li>}
                  <li><IconCheck /> IA {p.ai_model.includes('sonnet') ? 'avançada (Sonnet)' : 'rápida (Haiku)'}</li>
                </ul>
                <Link className={`btn ${featured ? '' : 'ghost'}`} href="/entrar?cadastro=1" style={{ width: '100%' }}>Começar agora</Link>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="site">
        <div className="section">
          <span className="brand" style={{ fontSize: 15 }}><IrisMark size={22} /> Iris</span>
          <span>© {new Date().getFullYear()} Iris · Atendimento com IA para lojistas</span>
        </div>
      </footer>
    </>
  );
}
