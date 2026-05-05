// Phase 5c — saved simulation runs.
//
// List view (most recent first) with a click-to-expand detail. Pairwise runs
// expand to a small result summary; sweep runs expand to a heatmap-style
// re-render. Both let admins delete (RLS-enforced).
//
// We hydrate hero names client-side rather than join in SQL — the heroes
// table is small and useConfigBundle already pulls combat roles, so this
// avoids a server-side join.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { Badge, Button, Empty, PageHeader, Panel } from '@/components/UI';
import type { BatchResult } from '@/lib/simulator';
import type { Hero, SimulationRun } from '@/types/database';

interface SweepResult {
  cells: Record<string, BatchResult>;
  hero_ids: string[];
}

export function History() {
  const { currentEnv } = useEnvironment();
  const { canWriteConfig } = useAuth();
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [heroes, setHeroes] = useState<Map<string, Hero>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchRuns = async () => {
    if (!currentEnv) return;
    setLoading(true);
    const [runsRes, heroesRes] = await Promise.all([
      supabase
        .from('simulation_runs')
        .select('*')
        .eq('env_id', currentEnv.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('heroes').select('id,name,combat_role_id').eq('env_id', currentEnv.id),
    ]);
    setRuns((runsRes.data ?? []) as SimulationRun[]);
    const map = new Map<string, Hero>();
    ((heroesRes.data ?? []) as Hero[]).forEach((h) => map.set(h.id, h));
    setHeroes(map);
    setLoading(false);
  };

  useEffect(() => {
    fetchRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEnv?.id]);

  const onDelete = async (id: string) => {
    if (!confirm('Delete this run? This cannot be undone.')) return;
    setDeleting(id);
    const { error } = await supabase.from('simulation_runs').delete().eq('id', id);
    setDeleting(null);
    if (error) {
      alert(error.message);
      return;
    }
    setRuns((prev) => prev.filter((r) => r.id !== id));
  };

  if (!currentEnv) return null;

  return (
    <>
      <PageHeader
        title="History"
        subtitle={`${currentEnv.name} environment · ${runs.length} saved run${runs.length === 1 ? '' : 's'}`}
      />

      {loading ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : runs.length === 0 ? (
        <Empty>
          No saved runs yet. Run a simulation on{' '}
          <Link to="/simulator" className="text-accent underline">/simulator</Link> or{' '}
          <Link to="/sweep" className="text-accent underline">/sweep</Link>, then click Save.
        </Empty>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <RunRow
              key={r.id}
              run={r}
              heroes={heroes}
              expanded={expanded === r.id}
              onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
              canDelete={canWriteConfig()}
              onDelete={() => onDelete(r.id)}
              deleting={deleting === r.id}
            />
          ))}
        </div>
      )}
    </>
  );
}

function RunRow({
  run,
  heroes,
  expanded,
  onToggle,
  canDelete,
  onDelete,
  deleting,
}: {
  run: SimulationRun;
  heroes: Map<string, Hero>;
  expanded: boolean;
  onToggle: () => void;
  canDelete: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const aName = run.hero_a_id ? heroes.get(run.hero_a_id)?.name ?? '—' : null;
  const bName = run.hero_b_id ? heroes.get(run.hero_b_id)?.name ?? '—' : null;
  const ts = new Date(run.created_at).toLocaleString();

  return (
    <Panel className="!p-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-ink/40 transition"
      >
        <span className="flex items-center gap-3 text-sm">
          <Badge tone={run.kind === 'sweep' ? 'warn' : 'neutral'}>{run.kind}</Badge>
          {run.kind === 'pairwise' ? (
            <span className="text-slate-200">
              <span className="text-accent">{aName}</span>
              <span className="text-muted"> vs </span>
              <span className="text-cyan-400">{bName}</span>
            </span>
          ) : (
            <span className="text-slate-200">
              {(run.result as SweepResult)?.hero_ids?.length ?? '?'} heroes
            </span>
          )}
          <span className="text-muted">·</span>
          <span className="text-muted">{run.runs_per_matchup} runs/matchup</span>
        </span>
        <span className="flex items-center gap-3 text-xs text-muted">
          <span>{ts}</span>
          <span>{expanded ? '▾' : '▸'}</span>
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-line">
          {run.kind === 'pairwise' ? (
            <PairwiseDetail result={run.result as BatchResult} aName={aName ?? '?'} bName={bName ?? '?'} />
          ) : (
            <SweepDetail result={run.result as SweepResult} heroes={heroes} />
          )}
          {canDelete && (
            <div className="mt-3 pt-3 border-t border-line flex justify-end">
              <Button variant="danger" onClick={onDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function PairwiseDetail({
  result,
  aName,
  bName,
}: {
  result: BatchResult;
  aName: string;
  bName: string;
}) {
  const aPct = Math.round(result.win_rate_a * 100);
  const bPct = Math.round(result.win_rate_b * 100);
  const dPct = Math.round(result.draw_rate * 100);
  const tone =
    result.verdict === 'balanced' ? 'good' : result.verdict === 'a_favored' ? 'warn' : 'bad';
  const label =
    result.verdict === 'balanced'
      ? '✓ balanced (45–55%)'
      : result.verdict === 'a_favored'
      ? `↑ ${aName} favored`
      : `↑ ${bName} favored`;

  return (
    <div className="pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">Verdict</span>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="flex h-3 rounded overflow-hidden bg-line">
        <div className="bg-accent" style={{ width: `${aPct}%` }} title={`${aName} ${aPct}%`} />
        {dPct > 0 && (
          <div className="bg-slate-500" style={{ width: `${dPct}%` }} title={`Draws ${dPct}%`} />
        )}
        <div className="bg-cyan-500" style={{ width: `${bPct}%` }} title={`${bName} ${bPct}%`} />
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>{aPct}% wins</span>
        {dPct > 0 && <span>{dPct}% draws</span>}
        <span>{bPct}% wins</span>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line text-xs">
        <Stat label="Avg TTK" value={`${result.avg_ttk_sec}s`} />
        <Stat label={`${aName} dmg`} value={result.avg_dmg_a_to_b} />
        <Stat label={`${bName} dmg`} value={result.avg_dmg_b_to_a} />
      </div>
    </div>
  );
}

function SweepDetail({
  result,
  heroes,
}: {
  result: SweepResult;
  heroes: Map<string, Hero>;
}) {
  const orderedHeroes = useMemo(
    () =>
      result.hero_ids
        .map((id) => heroes.get(id))
        .filter((h): h is Hero => Boolean(h)),
    [result.hero_ids, heroes],
  );

  const summary = useMemo(() => {
    let balanced = 0, aFav = 0, bFav = 0;
    Object.values(result.cells).forEach((c) => {
      if (c.verdict === 'balanced') balanced++;
      else if (c.verdict === 'a_favored') aFav++;
      else bFav++;
    });
    return { balanced, aFav, bFav, total: balanced + aFav + bFav };
  }, [result.cells]);

  return (
    <div className="pt-3 space-y-3">
      <div className="flex gap-2 text-xs">
        <Badge tone="good">✓ {summary.balanced}/{summary.total}</Badge>
        <Badge tone="warn">↑ {summary.aFav} row-favored</Badge>
        <Badge tone="bad">↑ {summary.bFav} col-favored</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left py-1 pr-2 text-muted font-medium">A \ B</th>
              {orderedHeroes.map((b) => (
                <th
                  key={b.id}
                  className="text-center py-1 px-1 text-muted font-medium whitespace-nowrap"
                >
                  {b.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orderedHeroes.map((a) => (
              <tr key={a.id}>
                <td className="py-1 pr-2 font-medium text-slate-200 whitespace-nowrap">
                  {a.name}
                </td>
                {orderedHeroes.map((b) => {
                  if (a.id === b.id) {
                    return (
                      <td key={b.id} className="bg-ink/40 text-muted text-center">—</td>
                    );
                  }
                  const cell = result.cells[`${a.id}|${b.id}`];
                  if (!cell) return <td key={b.id} className="text-center text-muted">·</td>;
                  const pct = Math.round(cell.win_rate_a * 100);
                  const offset = pct - 50;
                  const intensity = Math.min(1, Math.abs(offset) / 50);
                  let bg: string;
                  if (Math.abs(offset) <= 5) {
                    bg = `rgba(34, 197, 94, ${0.15 + intensity * 0.4})`;
                  } else if (offset > 0) {
                    bg = `rgba(239, 68, 68, ${0.15 + intensity * 0.5})`;
                  } else {
                    bg = `rgba(59, 130, 246, ${0.15 + intensity * 0.5})`;
                  }
                  return (
                    <td
                      key={b.id}
                      className="py-1 px-1 text-center"
                      style={{ backgroundColor: bg }}
                      title={`${a.name} ${pct}% vs ${b.name}`}
                    >
                      <span className="font-medium text-slate-100">{pct}%</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-ink border border-line rounded px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-slate-100 font-medium">{value}</div>
    </div>
  );
}
