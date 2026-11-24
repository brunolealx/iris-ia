'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  ['/app', '◉', 'Início'],
  ['/app/conversas', '💬', 'Conversas'],
  ['/app/crm', '🤝', 'CRM'],
  ['/app/vendas', '🛒', 'Vendas e NF-e'],
  ['/app/produtos', '📦', 'Produtos'],
  ['/app/ia', '🧠', 'IA'],
  ['/app/integracoes', '🔌', 'Integrações'],
  ['/app/assinatura', '💳', 'Assinatura'],
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav stack" style={{ gap: 2 }}>
      {ITEMS.map(([href, icon, label]) => {
        const active = href === '/app' ? path === '/app' : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}>
            <span aria-hidden>{icon}</span> {label}
          </Link>
        );
      })}
    </nav>
  );
}
