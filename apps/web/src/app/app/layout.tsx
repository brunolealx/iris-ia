import Link from 'next/link';
import { requireOrg } from '@/lib/org';
import { Nav } from './nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { org, plan, user } = await requireOrg();
  const trialDays = org.status === 'trial' ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000)) : null;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/app" className="brand"><span className="brand-dot" /> Iris</Link>
        <Nav />
        <div className="sidebar-foot stack">
          <strong style={{ color: 'var(--iris-text)' }}>{org.name}</strong>
          <span>Plano {plan.name}{trialDays !== null && ` · ${trialDays} dias de teste`}</span>
          <span>{user.email}</span>
          <form action="/auth/sair" method="post"><button className="btn ghost sm">Sair</button></form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
