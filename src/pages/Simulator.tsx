// Phase 5 — pairwise simulator UI.
//
// Pick two heroes (with their decks), click Run, see win-rate / TTK / damage
// over N runs. Engine lives in lib/simulator.ts (pure functions). This page
// just wires data + a worker-less compute loop on the main thread (1000
// runs of a 30s sim is small enough to be sub-second; if it grows, move
// to a Web Worker).

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { Badge, Button, Field, PageHeader, Panel, Score } from '@/components/UI';
import { batch, type BatchResult } from '@/lib/simulator';
import { loadCombatant, type HeroFull } from '@/lib/load-combatants';
import type { Hero } from '@/types/database';

export function Simulator() {
  const { currentEnv } = useEnvironment();
  const { user, canWriteContent } = useAuth();
  const { bundle, loading: cfgLoading } = useConfigBundle(currentEnv?.id ?? null);
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [params, setParams] = useSearchParams();
  const [aId, setAId] = useState<string>(params.get('a') ?? '');
  const [bId, setBId] = useState<string>(params.get('b') ?? '');
  const [runs, setRuns] = useState(1000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Cached full data for whichever hero is selected on each side.
  const [aFull, setAFull] = useState<HeroFull | null>(null);
  const [bFull, setBFull] = useState<HeroFull | null>(null);

  useEffect(() => {
    if (!currentEnv) return;
    let cancelled = false;
    supabase
      .from('heroes')
      .select('*')
      .eq('env_id', currentEnv.id)
      .eq('status', 'published')
      .order('name')
      .then(({ data }) => {
        if (cancelled) return;
        setHeroes((data ?? []) as Hero[]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentEnv?.id]);

  // When a hero is picked, load deck + cards + effects to build CombatantInput.
  useEffect(() => {
    if (!aId || !bundle) return;
    loadCombatant(aId, bundle).then(setAFull).catch((e) => setError(String(e)));
  }, [aId, bundle]);
  useEffect(() => {
    if (!bId || !bundle) return;
    loadCombatant(bId, bundle).then(setBFull).catch((e) => setError(String(e)));
  }, [bId, bundle]);

  // Sync ?a=&b= so deep links / sweep cell-clicks work.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (aId) next.set('a', aId); else next.delete('a');
    if (bId) next.set('b', bId); else next.delete('b');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aId, bId]);

  const ready = aFull && bFull && bundle && !running && aId !== bId && aId && bId;

  const onRun = async () => {
    if (!ready || !bundle) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setSavedAt(null);
    // yield to the browser so the spinner paints, then compute.
    await new Promise((r) => setTimeout(r, 16));
    try {
      const r = batch(aFull!, bFull!, bundle.effectTypes, runs);
      setResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  const onSave = async () => {
    if (!result || !currentEnv || !user || !aFull || !bFull) return;
    setSaving(true);
    setError(null);
    const { error: saveErr } = await supabase.from('simulation_runs').insert({
      env_id: currentEnv.id,
      kind: 'pairwise',
      hero_a_id: aFull.hero.id,
      hero_b_id: bFull.hero.id,
      runs_per_matchup: result.runs,
      result,
      created_by: user.id,
    });
    setSaving(false);
    if (saveErr) {
      setError(saveErr.message);
      return;
    }
    setSavedAt(new Date().toISOString());
  };

  if (!currentEnv) return null;

  return (
    <>
      <PageHeader
        title="Simulator"
        subtitle={`${currentEnv.name} environment · pairwise hero+deck Monte Carlo (${runs} runs)`}
        actions={
          <>
            {result && canWriteContent() && (
              <Button variant="ghost" onClick={onSave} disabled={saving || !!savedAt}>
                {saving ? 'Saving…' : savedAt ? '✓ Saved' : 'Save run'}
              </Button>
            )}
            <Button onClick={onRun} disabled={!ready}>
              {running ? 'Running…' : 'Run'}
            </Button>
          </>
        }
      />

      {cfgLoading ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SidePanel
            label="Side A"
            tone="ms"
            heroes={heroes}
            value={aId}
            onChange={(v) => {
              setAId(v);
              setResult(null);
            }}
            full={aFull}
            disabledIds={bId ? [bId] : []}
          />
          <SidePanel
            label="Side B"
            tone="bp"
            heroes={heroes}
            value={bId}
            onChange={(v) => {
              setBId(v);
              setResult(null);
            }}
            full={bFull}
            disabledIds={aId ? [aId] : []}
          />
        </div>
      )}

      <Panel title="Run config" className="mt-4">
        <div className="grid grid-cols-3 gap-3 items-end">
          <Field label="Runs">
            <select
              className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
              value={runs}
              onChange={(e) => {
                setRuns(parseInt(e.target.value, 10));
                setResult(null);
              }}
              disabled={running}
            >
              <option value={100}>100 (fast)</option>
              <option value={1000}>1000 (default)</option>
              <option value={5000}>5000 (slow but stable)</option>
            </select>
          </Field>
          <div className="col-span-2 text-xs text-muted">
            Positioning: combatants start at max(rangeA, rangeB) apart. Higher-range hero kites at
            their max range; lower-range chases. Closing 6/s, retreating 4/s — kiting buys time
            but a closer eventually catches up. target_count &gt; 1 collapses to 1 in 1v1 — AoE
            cards under-perform here, which is signal, not bug.
          </div>
        </div>
      </Panel>

      {error && (
        <Panel title="Error" className="mt-4">
          <div className="text-sm text-red-400">{error}</div>
        </Panel>
      )}

      {result && aFull && bFull && (
        <ResultPanel result={result} aName={aFull.hero.name} bName={bFull.hero.name} />
      )}
    </>
  );
}

function SidePanel({
  label,
  tone,
  heroes,
  value,
  onChange,
  full,
  disabledIds,
}: {
  label: string;
  tone: 'ms' | 'bp';
  heroes: Hero[];
  value: string;
  onChange: (id: string) => void;
  full: HeroFull | null;
  disabledIds: string[];
}) {
  const color = tone === 'ms' ? 'text-accent' : 'text-cyan-400';
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span className={color}>{label}</span>
          {full && <Badge>{full.deck.length}/10 cards</Badge>}
        </span>
      }
    >
      <select
        className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm mb-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Pick a hero —</option>
        {heroes.map((h) => (
          <option key={h.id} value={h.id} disabled={disabledIds.includes(h.id)}>
            {h.name}{disabledIds.includes(h.id) ? ' (already on other side)' : ''}
          </option>
        ))}
      </select>
      {full && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Score label="HP" value={full.derived.hp} />
          <Score label="DMG" value={full.derived.dmg} />
          <Score label="Evasion %" value={full.derived.evasion_pct} />
          <Score label="Resilience %" value={full.derived.resilience_pct} />
        </div>
      )}
    </Panel>
  );
}

function ResultPanel({
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
  const verdictTone =
    result.verdict === 'balanced' ? 'good' : result.verdict === 'a_favored' ? 'warn' : 'bad';
  const verdictLabel =
    result.verdict === 'balanced'
      ? '✓ balanced (45–55%)'
      : result.verdict === 'a_favored'
      ? `↑ ${aName} favored`
      : `↑ ${bName} favored`;

  return (
    <Panel
      title="Result"
      className="mt-4"
      actions={<Badge tone={verdictTone}>{verdictLabel}</Badge>}
    >
      <div className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between text-sm mb-1">
            <span className="text-accent font-medium">{aName}</span>
            <span className="text-muted">vs</span>
            <span className="text-cyan-400 font-medium">{bName}</span>
          </div>
          <div className="flex h-3 rounded overflow-hidden bg-line">
            <div
              className="bg-accent"
              style={{ width: `${aPct}%` }}
              title={`${aName} ${aPct}%`}
            />
            {dPct > 0 && (
              <div
                className="bg-slate-500"
                style={{ width: `${dPct}%` }}
                title={`Draws ${dPct}%`}
              />
            )}
            <div
              className="bg-cyan-500"
              style={{ width: `${bPct}%` }}
              title={`${bName} ${bPct}%`}
            />
          </div>
          <div className="flex justify-between text-xs text-muted mt-1">
            <span>{aPct}% wins</span>
            {dPct > 0 && <span>{dPct}% draws</span>}
            <span>{bPct}% wins</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line">
          <Score label="Avg TTK" value={`${result.avg_ttk_sec}s`} />
          <Score label={`${aName} dmg → ${bName}`} value={result.avg_dmg_a_to_b} />
          <Score label={`${bName} dmg → ${aName}`} value={result.avg_dmg_b_to_a} />
        </div>

        <p className="text-[11px] text-muted">
          {result.runs} runs · 30s max battle · 0.5s tick. Verdict band: 45–55% = balanced.
          Adjust hero attributes, deck composition, or coefficients (admin) and re-run.
        </p>
      </div>
    </Panel>
  );
}

