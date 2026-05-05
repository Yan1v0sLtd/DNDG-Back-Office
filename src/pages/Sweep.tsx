// Phase 5b — batch sweep heatmap.
//
// Run every published hero against every other (NxN minus self-vs-self),
// display a heatmap colored by side-A win rate. Click a cell to drill into
// that matchup on /simulator with the pair pre-selected.
//
// Compute is on the main thread with a setTimeout(0) yield between matchups
// so the UI remains responsive and a progress bar can paint. With N=5 heroes
// and 200 runs/matchup that's ~4000 sims — well under a second on a
// reasonable laptop. If we ever scale to 20+ heroes, move to a Web Worker.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { Badge, Button, Field, PageHeader, Panel } from '@/components/UI';
import { batch, type BatchResult } from '@/lib/simulator';
import { loadAllCombatants, type HeroFull } from '@/lib/load-combatants';

interface CellResult {
  result: BatchResult;
  // We also stash the row's hero name + col's hero name for tooltips.
}

export function Sweep() {
  const { currentEnv } = useEnvironment();
  const { user, canWriteContent } = useAuth();
  const { bundle, loading: cfgLoading } = useConfigBundle(currentEnv?.id ?? null);
  const navigate = useNavigate();

  const [combatants, setCombatants] = useState<HeroFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState(200);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Map<"aId|bId", CellResult>
  const [cells, setCells] = useState<Map<string, CellResult>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!currentEnv || !bundle) return;
    let cancelled = false;
    setLoading(true);
    loadAllCombatants(currentEnv.id, bundle, { onlyPublished: true })
      .then((list) => {
        if (cancelled) return;
        setCombatants(list);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentEnv?.id, bundle]);

  const onRun = async () => {
    if (!bundle) return;
    setRunning(true);
    setError(null);
    setCells(new Map());
    setSavedAt(null);

    const total = combatants.length * (combatants.length - 1);
    setProgress({ done: 0, total });

    const next = new Map<string, CellResult>();
    let done = 0;
    for (const a of combatants) {
      for (const b of combatants) {
        if (a.hero.id === b.hero.id) continue;
        // yield to the browser so progress paints
        await new Promise((r) => setTimeout(r, 0));
        try {
          const r = batch(a, b, bundle.effectTypes, runs);
          next.set(`${a.hero.id}|${b.hero.id}`, { result: r });
        } catch (e) {
          setError(String(e));
          setRunning(false);
          return;
        }
        done++;
        setProgress({ done, total });
        // batch the state update every few cells to reduce re-render churn
        if (done % combatants.length === 0 || done === total) {
          setCells(new Map(next));
        }
      }
    }
    setCells(next);
    setRunning(false);
  };

  const onSave = async () => {
    if (!cells.size || !currentEnv || !user) return;
    setSaving(true);
    setError(null);
    // Serialize the Map into a plain object for jsonb storage.
    const cellsObj: Record<string, BatchResult> = {};
    cells.forEach((v, k) => {
      cellsObj[k] = v.result;
    });
    const { error: saveErr } = await supabase.from('simulation_runs').insert({
      env_id: currentEnv.id,
      kind: 'sweep',
      hero_a_id: null,
      hero_b_id: null,
      runs_per_matchup: runs,
      result: { cells: cellsObj, hero_ids: combatants.map((c) => c.hero.id) },
      created_by: user.id,
    });
    setSaving(false);
    if (saveErr) {
      setError(saveErr.message);
      return;
    }
    setSavedAt(new Date().toISOString());
  };

  const summary = useMemo(() => {
    if (cells.size === 0) return null;
    let balanced = 0, aFav = 0, bFav = 0;
    cells.forEach((c) => {
      if (c.result.verdict === 'balanced') balanced++;
      else if (c.result.verdict === 'a_favored') aFav++;
      else bFav++;
    });
    return { balanced, aFav, bFav, total: cells.size };
  }, [cells]);

  if (!currentEnv) return null;

  return (
    <>
      <PageHeader
        title="Balance Sweep"
        subtitle={`${currentEnv.name} environment · run every published hero against every other`}
        actions={
          <>
            {cells.size > 0 && canWriteContent() && (
              <Button variant="ghost" onClick={onSave} disabled={saving || !!savedAt || running}>
                {saving ? 'Saving…' : savedAt ? '✓ Saved' : 'Save sweep'}
              </Button>
            )}
            <Button
              onClick={onRun}
              disabled={running || loading || combatants.length < 2 || !bundle}
            >
              {running
                ? `Running… ${progress.done}/${progress.total}`
                : `Run sweep (${combatants.length}×${combatants.length - 1})`}
            </Button>
          </>
        }
      />

      {(loading || cfgLoading) ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : combatants.length < 2 ? (
        <Panel>
          <div className="text-sm text-muted">
            Need at least 2 published heroes in this environment to sweep.
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="Run config" className="mb-4">
            <div className="grid grid-cols-3 gap-3 items-end">
              <Field label="Runs per matchup">
                <select
                  className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
                  value={runs}
                  onChange={(e) => setRuns(parseInt(e.target.value, 10))}
                  disabled={running}
                >
                  <option value={50}>50 (very fast)</option>
                  <option value={200}>200 (default)</option>
                  <option value={1000}>1000 (slow but stable)</option>
                </select>
              </Field>
              <div className="col-span-2 text-xs text-muted">
                {combatants.length}×{combatants.length - 1} = {combatants.length * (combatants.length - 1)} matchups ·
                {' '}{combatants.length * (combatants.length - 1) * runs} sims total.
                Heatmap rows = side A; columns = side B; cells = side A win rate.
                Click any cell to drill into that matchup.
              </div>
            </div>
          </Panel>

          {summary && (
            <Panel title="Summary" className="mb-4">
              <div className="flex gap-3 text-sm">
                <Badge tone="good">✓ {summary.balanced}/{summary.total} balanced</Badge>
                <Badge tone="warn">↑ {summary.aFav} row-favored</Badge>
                <Badge tone="bad">↑ {summary.bFav} column-favored</Badge>
              </div>
            </Panel>
          )}

          <Panel title="Heatmap" className="overflow-x-auto">
            <Heatmap
              combatants={combatants}
              cells={cells}
              onClickCell={(aId, bId) =>
                navigate(`/simulator?a=${aId}&b=${bId}`)
              }
            />
          </Panel>
        </>
      )}

      {error && (
        <Panel title="Error" className="mt-4">
          <div className="text-sm text-red-400">{error}</div>
        </Panel>
      )}
    </>
  );
}

function Heatmap({
  combatants,
  cells,
  onClickCell,
}: {
  combatants: HeroFull[];
  cells: Map<string, CellResult>;
  onClickCell: (aId: string, bId: string) => void;
}) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr>
          <th className="text-left py-2 pr-3 text-muted font-medium">A \ B</th>
          {combatants.map((b) => (
            <th
              key={b.hero.id}
              className="text-center py-2 px-1 text-muted font-medium whitespace-nowrap"
              title={`${b.hero.name} · deck ${b.deck.length}/10`}
            >
              {b.hero.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {combatants.map((a) => (
          <tr key={a.hero.id}>
            <td
              className="py-1 pr-3 font-medium text-slate-200 whitespace-nowrap"
              title={`${a.hero.name} · deck ${a.deck.length}/10`}
            >
              {a.hero.name}
            </td>
            {combatants.map((b) => {
              if (a.hero.id === b.hero.id) {
                return (
                  <td key={b.hero.id} className="bg-ink/40 text-muted text-center">—</td>
                );
              }
              const cell = cells.get(`${a.hero.id}|${b.hero.id}`);
              return (
                <Cell
                  key={b.hero.id}
                  cell={cell}
                  aName={a.hero.name}
                  bName={b.hero.name}
                  onClick={() => onClickCell(a.hero.id, b.hero.id)}
                />
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({
  cell,
  aName,
  bName,
  onClick,
}: {
  cell: CellResult | undefined;
  aName: string;
  bName: string;
  onClick: () => void;
}) {
  if (!cell) {
    return <td className="py-1 px-1 text-center text-muted">·</td>;
  }
  const r = cell.result;
  const pct = Math.round(r.win_rate_a * 100);
  // Color: 50% = grey; >55% (A favored) red-ish; <45% (B favored) blue-ish.
  // Smooth gradient. Brighter the further from 50.
  const offset = pct - 50; // -50..50
  const intensity = Math.min(1, Math.abs(offset) / 50); // 0..1
  let bg: string;
  if (Math.abs(offset) <= 5) {
    bg = `rgba(34, 197, 94, ${0.15 + intensity * 0.4})`; // green for balanced
  } else if (offset > 0) {
    bg = `rgba(239, 68, 68, ${0.15 + intensity * 0.5})`; // red — A dominates
  } else {
    bg = `rgba(59, 130, 246, ${0.15 + intensity * 0.5})`; // blue — B dominates
  }
  return (
    <td
      onClick={onClick}
      className="py-1 px-1 text-center cursor-pointer hover:ring-1 hover:ring-accent transition"
      style={{ backgroundColor: bg }}
      title={`${aName} ${pct}% vs ${bName} · TTK ${r.avg_ttk_sec}s · click to open`}
    >
      <span className="font-medium text-slate-100">{pct}%</span>
    </td>
  );
}
