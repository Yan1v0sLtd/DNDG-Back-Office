// Phase 5c-bis — compare two saved sweeps cell-by-cell.
//
// Pick a baseline sweep and a "vs" sweep. Render a delta heatmap where
// each cell shows the win-rate point change (later − baseline). Useful
// for "did my Anaitis buff actually move the needle?".

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { Badge, Empty, PageHeader, Panel } from '@/components/UI';
import type { BatchResult } from '@/lib/simulator';
import type { Hero, SimulationRun } from '@/types/database';

interface SweepResult {
  cells: Record<string, BatchResult>;
  hero_ids: string[];
}

export function HistoryCompare() {
  const { currentEnv } = useEnvironment();
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [heroes, setHeroes] = useState<Map<string, Hero>>(new Map());
  const [aId, setAId] = useState<string>('');
  const [bId, setBId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentEnv) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase
        .from('simulation_runs')
        .select('*')
        .eq('env_id', currentEnv.id)
        .eq('kind', 'sweep')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('heroes').select('id,name,combat_role_id').eq('env_id', currentEnv.id),
    ]).then(([runsRes, heroesRes]) => {
      if (cancelled) return;
      setRuns((runsRes.data ?? []) as SimulationRun[]);
      const m = new Map<string, Hero>();
      ((heroesRes.data ?? []) as Hero[]).forEach((h) => m.set(h.id, h));
      setHeroes(m);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [currentEnv?.id]);

  const baseline = useMemo(() => runs.find((r) => r.id === aId), [runs, aId]);
  const later = useMemo(() => runs.find((r) => r.id === bId), [runs, bId]);

  if (!currentEnv) return null;

  return (
    <>
      <PageHeader
        title="Compare Sweeps"
        subtitle={`${currentEnv.name} environment · diff two saved sweeps`}
      />

      {loading ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : runs.length < 2 ? (
        <Empty>
          Need at least two saved sweeps to compare. Save one before tuning,
          then save another after.
        </Empty>
      ) : (
        <>
          <Panel className="mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-muted mb-1">
                  Baseline (before)
                </label>
                <select
                  className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
                  value={aId}
                  onChange={(e) => setAId(e.target.value)}
                >
                  <option value="">— Pick —</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id} disabled={r.id === bId}>
                      {new Date(r.created_at).toLocaleString()} · {r.runs_per_matchup} runs
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-muted mb-1">
                  Compare to (after)
                </label>
                <select
                  className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
                  value={bId}
                  onChange={(e) => setBId(e.target.value)}
                >
                  <option value="">— Pick —</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id} disabled={r.id === aId}>
                      {new Date(r.created_at).toLocaleString()} · {r.runs_per_matchup} runs
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Panel>

          {baseline && later && (
            <DeltaHeatmap
              baseline={baseline.result as SweepResult}
              later={later.result as SweepResult}
              heroes={heroes}
            />
          )}
        </>
      )}
    </>
  );
}

function DeltaHeatmap({
  baseline,
  later,
  heroes,
}: {
  baseline: SweepResult;
  later: SweepResult;
  heroes: Map<string, Hero>;
}) {
  // Use the union of hero ids so heroes added/removed between sweeps
  // still show up (with missing-cell markers).
  const allIds = useMemo(() => {
    const set = new Set<string>([...baseline.hero_ids, ...later.hero_ids]);
    const order = Array.from(set);
    return order.map((id) => heroes.get(id)).filter((h): h is Hero => Boolean(h));
  }, [baseline.hero_ids, later.hero_ids, heroes]);

  const stats = useMemo(() => {
    let common = 0, improvements = 0, regressions = 0;
    let absSum = 0;
    for (const a of allIds) {
      for (const b of allIds) {
        if (a.id === b.id) continue;
        const key = `${a.id}|${b.id}`;
        const before = baseline.cells[key];
        const after = later.cells[key];
        if (!before || !after) continue;
        common++;
        const delta = after.win_rate_a - before.win_rate_a;
        if (delta > 0.01) improvements++;
        else if (delta < -0.01) regressions++;
        absSum += Math.abs(delta);
      }
    }
    const avgAbs = common > 0 ? absSum / common : 0;
    return { common, improvements, regressions, avgAbs };
  }, [allIds, baseline.cells, later.cells]);

  return (
    <Panel
      title="Delta heatmap"
      actions={
        <span className="flex gap-2 text-xs">
          <Badge>{stats.common} matchups</Badge>
          <Badge tone="warn">↑ {stats.improvements} better for row</Badge>
          <Badge tone="bad">↓ {stats.regressions} worse for row</Badge>
          <Badge>avg |Δ| {(stats.avgAbs * 100).toFixed(1)} pts</Badge>
        </span>
      }
      className="overflow-x-auto"
    >
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left py-2 pr-3 text-muted font-medium">A \ B</th>
            {allIds.map((b) => (
              <th
                key={b.id}
                className="text-center py-2 px-1 text-muted font-medium whitespace-nowrap"
              >
                {b.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allIds.map((a) => (
            <tr key={a.id}>
              <td className="py-1 pr-3 font-medium text-slate-200 whitespace-nowrap">
                {a.name}
              </td>
              {allIds.map((b) => {
                if (a.id === b.id) {
                  return <td key={b.id} className="bg-ink/40 text-muted text-center">—</td>;
                }
                const key = `${a.id}|${b.id}`;
                const before = baseline.cells[key];
                const after = later.cells[key];
                if (!before || !after) {
                  return <td key={b.id} className="text-center text-muted">·</td>;
                }
                const beforePct = Math.round(before.win_rate_a * 100);
                const afterPct = Math.round(after.win_rate_a * 100);
                const delta = afterPct - beforePct;
                // Color: green for positive delta (row got stronger),
                // red for negative. Intensity by magnitude.
                const intensity = Math.min(1, Math.abs(delta) / 30);
                let bg: string;
                if (delta > 1) {
                  bg = `rgba(34, 197, 94, ${0.15 + intensity * 0.55})`;
                } else if (delta < -1) {
                  bg = `rgba(239, 68, 68, ${0.15 + intensity * 0.55})`;
                } else {
                  bg = 'transparent';
                }
                const sign = delta > 0 ? '+' : '';
                return (
                  <td
                    key={b.id}
                    className="py-1 px-1 text-center"
                    style={{ backgroundColor: bg }}
                    title={`${a.name} vs ${b.name}: ${beforePct}% → ${afterPct}% (${sign}${delta})`}
                  >
                    <span className="text-slate-100 font-medium">
                      {sign}{delta}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted mt-3">
        Cells show the change in row's win rate from baseline → later.
        Green = row got stronger, red = row got weaker. ± hover for raw before/after.
      </p>
    </Panel>
  );
}
