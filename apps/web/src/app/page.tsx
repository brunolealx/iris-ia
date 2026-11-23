import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { brl } from '@iris/shared/plans';
import { Card, Heading, Text } from '@/components/ui';

export const revalidate = 300;

const FEATURES = [
  ['💬', 'WhatsApp oficial', 'Conecte seu número pelo botão oficial da Meta. Sem QR code, sem risco de banimento por automação.'],
  ['🛒', 'Mercado Livre completo', 'Responde perguntas e mensagens pós-venda, importa pedidos, envios, anúncios e avisa reclamações.'],
  ['🧠', 'IA que conhece seus produtos', 'Importa o catálogo da Omie (em massa ou um a um), CSV ou API e responde com preço e estoque reais.'],
  ['🧾', 'Nota fiscal automática', 'Venda no ML → pedido na Omie → NF-e → XML anexado no Mercado Livre e salvo no seu Drive.'],
  ['📊', 'Gestão no seu Google Drive', 'Pastas e planilha completa: vendas, clientes, funcionários, folha, folgas, contas e fluxo de caixa.'],
  ['🤝', 'CRM e funil', 'Todo contato vira lead com histórico. Mova pelo funil de lead até pós-venda.'],
  ['🔌', 'API e webhooks', 'Seu sistema manda vendas e mensagens para a Iris e recebe eventos assinados em tempo real.'],
  ['🛡️', 'Você no controle', 'Modo sugestão: a IA escreve e você aprova. Assuntos sensíveis sempre passam por um humano.'],
];

export default async function Landing() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: plans } = await sb.from('plans').select('*').eq('active', true).order('sort');

  return (
    <>
      <header className="topbar">
        <span className="brand"><span className="brand-dot" /> Iris</span>
        <nav className="row">
          <a href="#planos">Planos</a>
          <Link className="btn sm" href="/entrar">Entrar</Link>
        </nav>
      </header>

      <section className="hero">
        <h1>Sua loja atendendo <em>24 horas</em> no WhatsApp e no Mercado Livre</h1>
        <p>A Iris responde seus clientes com IA, organiza vendas no CRM, emite nota fiscal pela Omie e mantém tudo em planilhas no seu Google Drive.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn" href="/entrar?cadastro=1">Testar grátis por 14 dias</Link>
          <a className="btn ghost" href="#recursos">Ver recursos</a>
        </div>
      </section>

      <section id="recursos" className="section">
        <div className="grid grid-4">
          {FEATURES.map(([icon, title, text]) => (
            <Card key={title} elevation="low">
              <div style={{ padding: 18 }}>
                <div style={{ fontSize: 26 }}>{icon}</div>
                <Heading level={3}>{title}</Heading>
                <Text>{text}</Text>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section id="planos" className="section">
        <div className="page-head"><div><h1>Planos</h1><p>Comece grátis. Cancele quando quiser.</p></div></div>
        <div className="grid grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {(plans || []).map((p) => (
            <div key={p.id} className={`box plan ${p.id === 'starter' ? 'featured' : ''}`}>
              <div className="row spread"><strong>{p.name}</strong>{p.id === 'starter' && <span className="badge ok">Mais escolhido</span>}</div>
              <div className="price">{p.price_cents ? brl(p.price_cents) : 'Grátis'}<span className="muted small">{p.price_cents ? ' /mês' : ' por 14 dias'}</span></div>
              <ul className="checklist">
                <li>{p.ai_replies_month.toLocaleString('pt-BR')} respostas da IA por mês</li>
                <li>WhatsApp + Mercado Livre</li>
                <li>Até {p.products_max.toLocaleString('pt-BR')} produtos</li>
                <li>{p.users_max} {p.users_max > 1 ? 'usuários' : 'usuário'}</li>
                <li>CRM e planilhas no Google Drive</li>
                {p.features.includes('omie') && <li>Importação da Omie</li>}
                {p.features.includes('nfe') && <li>Nota fiscal automática</li>}
                {p.features.includes('api') && <li>API e webhooks</li>}
                <li>IA {p.ai_model.includes('sonnet') ? 'avançada (Sonnet)' : 'rápida (Haiku)'}</li>
              </ul>
              <Link className={`btn ${p.id === 'starter' ? '' : 'ghost'}`} href="/entrar?cadastro=1" style={{ width: '100%' }}>Começar</Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="section muted small">© {new Date().getFullYear()} Iris · Atendimento com IA para lojistas</footer>
    </>
  );
}
