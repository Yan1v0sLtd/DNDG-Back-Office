import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { Badge, Button } from './UI';

export function Layout() {
  const { user, role, signOut, canWriteConfig } = useAuth();
  const { environments, currentEnv, setCurrentEnv } = useEnvironment();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-panel border-r border-line flex flex-col">
        <div className="px-4 py-5 border-b border-line">
          <div className="text-base font-semibold text-accent">Crucible Balancer</div>
          <div className="text-[11px] text-muted">back-office · v0.1</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          <Section label="Content">
            <NavItem to="/heroes">Heroes</NavItem>
            <NavItem to="/cards">Cards</NavItem>
            {/* Decks are edited inline on the hero — no standalone /decks page yet. */}
          </Section>

          <Section label="Balance">
            <NavItem to="/simulator" disabled>Simulator <Badge>Phase 5</Badge></NavItem>
          </Section>

          {canWriteConfig() && (
            <Section label="Admin">
              <NavItem to="/admin/coefficients">Coefficients</NavItem>
              <NavItem to="/admin/budgets">Budgets</NavItem>
            </Section>
          )}
        </nav>

        <div className="px-3 py-3 border-t border-line space-y-2">
          <label className="block text-[10px] uppercase tracking-wider text-muted">Environment</label>
          <select
            className="w-full bg-ink border border-line rounded-md px-2 py-1.5 text-sm"
            value={currentEnv?.id ?? ''}
            onChange={(e) => setCurrentEnv(e.target.value)}
          >
            {environments.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <div className="flex items-center justify-between text-xs text-muted pt-1">
            <span>{user?.email}</span>
            <Badge tone={role === 'admin' ? 'good' : role === 'designer' ? 'warn' : 'neutral'}>
              {role ?? '—'}
            </Badge>
          </div>
          <Button
            variant="ghost"
            className="w-full"
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="px-2 mb-1 text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  to,
  children,
  disabled,
}: {
  to: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="flex items-center justify-between px-2 py-1.5 text-sm text-muted cursor-not-allowed">
        {children}
      </span>
    );
  }
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block px-2 py-1.5 text-sm rounded-md ${
          isActive ? 'bg-accent/10 text-accent' : 'text-slate-200 hover:bg-ink'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
