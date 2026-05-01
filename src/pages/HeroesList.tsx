import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { deriveStats, masteryScore } from '@/lib/ms-calculator';
import { balancePowerFromStats } from '@/lib/balance-power-calculator';
import { Badge, Button, Empty, PageHeader, Panel } from '@/components/UI';
import type { CombatRole, Hero } from '@/types/database';

export function HeroesList() {
  const { canWriteContent } = useAuth();
  const { currentEnv } = useEnvironment();
  const { bundle, loading: cfgLoading } = useConfigBundle(currentEnv?.id ?? null);
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentEnv) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('heroes')
      .select('*')
      .eq('env_id', currentEnv.id)
      .order('name')
      .then(({ data }) => {
        if (cancelled) return;
        setHeroes((data ?? []) as Hero[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentEnv?.id]);

  if (!currentEnv) return null;

  return (
    <>
      <PageHeader
        title="Heroes"
        subtitle={`${currentEnv.name} environment · ${heroes.length} hero${heroes.length === 1 ? '' : 'es'}`}
        actions={
          canWriteContent() && (
            <Button onClick={() => navigate('/heroes/new')}>+ New Hero</Button>
          )
        }
      />
      {loading || cfgLoading ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : heroes.length === 0 ? (
        <Empty>
          No heroes in this environment. {canWriteContent() && (
            <Link to="/heroes/new" className="text-accent underline">Create the first one</Link>
          )}.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {heroes.map((h) => (
            <HeroCard key={h.id} hero={h} roles={bundle?.combatRoles ?? []} bundle={bundle} />
          ))}
        </div>
      )}
    </>
  );
}

function HeroCard({
  hero,
  roles,
  bundle,
}: {
  hero: Hero;
  roles: CombatRole[];
  bundle: ReturnType<typeof useConfigBundle>['bundle'];
}) {
  const role = roles.find((r) => r.id === hero.combat_role_id);
  const stats = bundle ? deriveStats(hero, bundle.coefficients) : null;
  const ms = stats && bundle ? masteryScore(stats, bundle.statWeights) : null;
  const bp = stats && bundle ? balancePowerFromStats(stats, bundle.statWeights) : null;

  return (
    <Link to={`/heroes/${hero.id}`} className="block">
      <Panel
        className="hover:border-accent/50 transition cursor-pointer"
        title={
          <span className="flex items-center gap-2">
            {hero.name}
            <Badge tone={hero.status === 'published' ? 'good' : 'warn'}>{hero.status}</Badge>
          </span>
        }
        actions={role && <Badge>{role.display_name}</Badge>}
      >
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="HP" value={stats?.hp} />
          <Stat label="DMG" value={stats?.dmg} />
          <Stat label="Evasion" value={stats ? `${stats.evasion_pct}%` : null} />
          <Stat label="Resilience" value={stats ? `${stats.resilience_pct}%` : null} />
          <Stat label="Range" value={stats?.range} />
          <Stat label="Race" value={hero.race ?? '—'} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-line">
          <ScoreCell label="Mastery Score" value={ms} tone="ms" />
          <ScoreCell label="Balance Power" value={bp} tone="bp" />
        </div>
      </Panel>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
      <span className="text-slate-100 font-medium">{value ?? '—'}</span>
    </div>
  );
}

function ScoreCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: 'ms' | 'bp';
}) {
  const color = tone === 'ms' ? 'text-accent' : 'text-cyan-400';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value ?? '—'}</div>
    </div>
  );
}
