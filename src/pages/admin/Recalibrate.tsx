// Phase 5d — BP recalibration admin page.
//
// Workflow:
//   1. Pick a saved sweep (from /history) as the data source.
//   2. We compute current stats and deck power for each hero in that sweep.
//   3. Fit a linear model on (stat_a - stat_b) and (deck_a - deck_b)
//      against (win_rate_a - 0.5).
//   4. Display current bp_weight vs fitted coefficient vs suggested
//      (rescaled, HP-anchored) values.
//   5. Apply button upserts the suggested bp_weights.
//
// Caveat: heroes/decks may have changed since the sweep ran. We use
// current data, which is the right call when designers are iterating
// (recalibrate against today's roster). For historical analysis they'd
// need a snapshot column — out of scope for v1.

import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { Badge, Button, Empty, PageHeader, Panel } from '@/components/UI';
import { loadAllCombatants } from '@/lib/load-combatants';
import { cardPower } from '@/lib/card-power-calculator';
import { deriveStats } from '@/lib/ms-calculator';
import { recalibrate, FEATURE_KEYS, type RecalibrateResult } from '@/lib/recalibrate';
import type { BatchResult } from '@/lib/simulator';
import type { CombatStats, SimulationRun } from '@/types/database';

interface SweepResult {
  cells: Record<string, BatchResult>;
  hero_ids: string[];
}

export function RecalibrateAdmin() {
  const { canWriteConfig } = useAuth();
  const { currentEnv } = useEnvironment();
  const { bundle, loading: cfgLoading, reload } = useConfigBundle(currentEnv?.id ?? null);

  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [pickedRunId, setPickedRunId] = useState<string>('');
  const [result, setResult] = useState<RecalibrateResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!currentEnv) return;
    let cancelled = false;
    supabase
      .from('simulation_runs')
      .select('*')
      .eq('env_id', currentEnv.id)
      .eq('kind', 'sweep')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled) return;
        setRuns((data ?? []) as SimulationRun[]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentEnv?.id]);

  if (!canWriteConfig()) return <Navigate to="/heroes" replace />;
  if (!currentEnv) return null;

  const onCompute = async () => {
    if (!pickedRunId || !bundle) return;
    setComputing(true);
    setMsg(null);
    setResult(null);

    const run = runs.find((r) => r.id === pickedRunId);
    if (!run) {
      setComputing(false);
      setMsg('Run not found.');
      return;
    }

    const sweep = run.result as SweepResult;
    if (!sweep?.cells) {
      setComputing(false);
      setMsg('Sweep result is malformed.');
      return;
    }

    try {
      // Fetch full combatants (heroes + decks) so we can compute deck power.
      const list = await loadAllCombatants(currentEnv.id, bundle, { onlyPublished: true });
      const statsByHero = new Map<string, CombatStats>();
      const deckPowerByHero = new Map<string, number>();
      for (const c of list) {
        statsByHero.set(c.hero.id, deriveStats(c.hero, bundle.coefficients));
        const total = c.deck.reduce(
          (s, e) => s + cardPower(e.card, e.effects, bundle.cardTiers, bundle.effectTypes),
          0,
        );
        deckPowerByHero.set(c.hero.id, total);
      }
      const out = recalibrate(
        { statsByHero, deckPowerByHero, cells: sweep.cells },
        bundle.statWeights,
      );
      setResult(out);
    } catch (e) {
      setMsg(String(e));
    } finally {
      setComputing(false);
    }
  };

  const onApply = async () => {
    if (!result || !bundle || !currentEnv) return;
    setApplying(true);
    setMsg(null);
    const updates = Object.entries(result.suggested_bp_weights)
      .map(([stat, bp_weight]) => {
        const existing = bundle.statWeights.find((s) => s.stat === stat);
        if (!existing || bp_weight == null) return null;
        return { ...existing, bp_weight };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (updates.length === 0) {
      setApplying(false);
      setMsg('No suggestions to apply.');
      return;
    }

    const { error } = await supabase
      .from('stat_weights')
      .upsert(updates, { onConflict: 'env_id,stat' });
    setApplying(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg('Applied. Hero BP values across the app will reflect the new weights on next page load.');
    reload();
  };

  return (
    <>
      <PageHeader
        title="BP Recalibration"
        subtitle={`${currentEnv.name} environment · fit bp_weight values to a saved sweep`}
        actions={
          <Button onClick={onCompute} disabled={!pickedRunId || computing || cfgLoading}>
            {computing ? 'Computing…' : 'Compute'}
          </Button>
        }
      />

      <Panel title="Pick a saved sweep" className="mb-4">
        {runs.length === 0 ? (
          <Empty>
            No saved sweeps yet. Run one on /sweep and click Save.
          </Empty>
        ) : (
          <select
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
            value={pickedRunId}
            onChange={(e) => {
              setPickedRunId(e.target.value);
              setResult(null);
            }}
          >
            <option value="">— Pick a sweep —</option>
            {runs.map((r) => {
              const sweep = r.result as SweepResult;
              const cellCount = Object.keys(sweep?.cells ?? {}).length;
              return (
                <option key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleString()} · {cellCount} matchups · {r.runs_per_matchup} runs each
                </option>
              );
            })}
          </select>
        )}
      </Panel>

      {result && (
        <ResultDisplay
          result={result}
          currentBpWeights={
            bundle?.statWeights.reduce<Record<string, number>>((m, s) => {
              m[s.stat] = s.bp_weight;
              return m;
            }, {}) ?? {}
          }
          onApply={onApply}
          applying={applying}
        />
      )}

      {msg && <div className="mt-4 text-sm text-muted">{msg}</div>}

      <Panel title="How this works" className="mt-4">
        <div className="text-xs text-muted space-y-2">
          <p>
            For each matchup in the sweep, we compute the stat differences
            (HP, DMG, Evasion%, Resilience%, Range) and the deck power
            difference between the two heroes. We then fit a linear model
            that predicts (win_rate_a − 0.5) from those features.
          </p>
          <p>
            The fitted coefficients tell you how sensitive win rate is to
            each stat differential. Suggested <code>bp_weight</code> values
            rescale the fitted coefficients so HP keeps its current weight
            (preserves your magnitude intuition); the others move
            proportionally.
          </p>
          <p>
            <strong>Mastery Score weights are never modified</strong> —
            they're player-facing and GDD-locked. Only Balance Power
            weights move.
          </p>
          <p>
            R² near 1 means the fit explains most of the win-rate variance
            (good). Near 0 means win rate isn't well-explained by stats
            alone (deck composition, card matchups, RNG dominate). Don't
            apply suggestions blindly when R² is low.
          </p>
        </div>
      </Panel>
    </>
  );
}

function ResultDisplay({
  result,
  currentBpWeights,
  onApply,
  applying,
}: {
  result: RecalibrateResult;
  currentBpWeights: Record<string, number>;
  onApply: () => void;
  applying: boolean;
}) {
  const r2Tone =
    result.r_squared >= 0.7 ? 'good' : result.r_squared >= 0.4 ? 'warn' : 'bad';

  const rows = useMemo(
    () =>
      FEATURE_KEYS.map((key) => {
        const fitted = result.fitted[key];
        const current = currentBpWeights[key];
        const suggested =
          key === 'deck_power'
            ? null
            : result.suggested_bp_weights[
                key as 'hp' | 'dmg' | 'evasion_pct' | 'resilience_pct' | 'range'
              ];
        return { key, fitted, current, suggested };
      }),
    [result, currentBpWeights],
  );

  return (
    <Panel
      title="Result"
      actions={
        <span className="flex items-center gap-2">
          <Badge>{result.n} matchups</Badge>
          <Badge tone={r2Tone}>R² {result.r_squared.toFixed(2)}</Badge>
          <Badge>MAE {(result.mae * 100).toFixed(1)} pts</Badge>
        </span>
      }
    >
      <table className="w-full text-sm">
        <thead className="text-xs text-muted uppercase tracking-wider">
          <tr>
            <th className="text-left py-2">Feature</th>
            <th className="text-right py-2">Current bp_weight</th>
            <th className="text-right py-2">Fitted coef</th>
            <th className="text-right py-2">Suggested bp_weight</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, fitted, current, suggested }) => (
            <tr key={key} className="border-t border-line">
              <td className="py-2 font-medium">
                {key === 'deck_power' ? (
                  <span className="text-cyan-400">deck (advisory)</span>
                ) : (
                  key
                )}
              </td>
              <td className="py-2 text-right">{current ?? '—'}</td>
              <td className="py-2 text-right text-muted">{fitted.toFixed(4)}</td>
              <td className="py-2 text-right text-accent font-semibold">
                {suggested ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-muted mt-3">{result.note}</p>

      <div className="mt-3 pt-3 border-t border-line flex justify-end">
        <Button onClick={onApply} disabled={applying}>
          {applying ? 'Applying…' : 'Apply suggested bp_weights'}
        </Button>
      </div>
    </Panel>
  );
}
