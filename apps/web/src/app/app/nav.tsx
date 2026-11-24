'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconHome, IconChat, IconUsers, IconCart, IconCatalog, IconSpark, IconPlug, IconCard } from '@/components/icons';

const ITEMS = [
  ['/app', IconHome, 'Início'],
  ['/app/conversas', IconChat, 'Conversas'],
  ['/app/crm', IconUsers, 'CRM'],
  ['/app/vendas', IconCart, 'Vendas e NF-e'],
  ['/app/produtos', IconCatalog, 'Produtos'],
  ['/app/ia', IconSpark, 'IA'],
  ['/app/integracoes', IconPlug, 'Integrações'],
  ['/app/assinatura', IconCard, 'Assinatura'],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav stack" style={{ gap: 2 }}>
      {ITEMS.map(([href, Icon, label]) => {
        const active = href === '/app' ? path === '/app' : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}>
            <Icon size={19} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
