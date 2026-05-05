// Phase 5d — BP recalibration.
//
// Closes the data-driven balance loop. Take a saved sweep result, fit a
// linear model on (stat_a - stat_b) plus (deck_power_a - deck_power_b)
// against (win_rate_a - 0.5), then surface "current vs. suggested" stat
// weights for designers to apply.
//
// We use plain linear regression (gradient descent) rather than logistic
// because:
//   • Win rates are clipped to [0, 1], so we work with (rate - 0.5) ∈
//     [-0.5, 0.5] — already centered, near-linear in the regime we care
//     about, and easier to interpret for designers.
//   • We don't need calibrated probabilities, just relative sensitivities.
//   • No external dep needed; ~50 lines of pure TS.

import type { Hero, StatWeight } from '@/types/database';
import type { BatchResult } from '@/lib/simulator';
import type { CombatStats } from '@/types/database';

export const FEATURE_KEYS = [
  'hp',
  'dmg',
  'evasion_pct',
  'resilience_pct',
  'range',
  'deck_power',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface RecalibrateInput {
  // Stats per hero (id → CombatStats), already derived.
  statsByHero: Map<string, CombatStats>;
  // Deck power per hero (id → total card power across deck).
  deckPowerByHero: Map<string, number>;
  // Cells from a saved sweep: key = "aId|bId" → BatchResult.
  cells: Record<string, BatchResult>;
}

export interface RecalibrateResult {
  /** Number of matchups used for fit. */
  n: number;
  /** Per-feature fitted coefficient. Higher = more sensitivity to that diff. */
  fitted: Record<FeatureKey, number>;
  /** Mean absolute error of predictions (in win-rate points, 0..1). */
  mae: number;
  /** R^2 (1 = perfect, 0 = no better than mean). */
  r_squared: number;
  /**
   * Suggested stat-weight values, anchored so that hp keeps its current
   * weight (preserves designer mental model of magnitudes). Other stats
   * scale by the ratio of their fitted coefficient to hp's.
   * Range gets a non-zero suggestion for `bp_weight`. `ms_weight` is
   * never touched (player-facing, GDD-locked).
   */
  suggested_bp_weights: Partial<Record<'hp' | 'dmg' | 'evasion_pct' | 'resilience_pct' | 'range', number>>;
  /** Diagnostic note. */
  note: string;
}

export function recalibrate(
  input: RecalibrateInput,
  currentWeights: StatWeight[],
): RecalibrateResult {
  // Build feature matrix X (one row per matchup) and target vector y.
  const X: number[][] = [];
  const y: number[] = [];
  for (const [key, cell] of Object.entries(input.cells)) {
    const [aId, bId] = key.split('|');
    const sa = input.statsByHero.get(aId);
    const sb = input.statsByHero.get(bId);
    if (!sa || !sb) continue;
    const da = input.deckPowerByHero.get(aId) ?? 0;
    const db = input.deckPowerByHero.get(bId) ?? 0;
    X.push([
      sa.hp - sb.hp,
      sa.dmg - sb.dmg,
      sa.evasion_pct - sb.evasion_pct,
      sa.resilience_pct - sb.resilience_pct,
      sa.range - sb.range,
      da - db,
    ]);
    y.push(cell.win_rate_a - 0.5);
  }

  const w = fitLinear(X, y);
  const fitted: Record<FeatureKey, number> = {
    hp: w[0],
    dmg: w[1],
    evasion_pct: w[2],
    resilience_pct: w[3],
    range: w[4],
    deck_power: w[5],
  };

  // Goodness-of-fit
  const yMean = y.reduce((s, v) => s + v, 0) / Math.max(1, y.length);
  let ssRes = 0, ssTot = 0, absErr = 0;
  for (let i = 0; i < y.length; i++) {
    let pred = 0;
    for (let j = 0; j < w.length; j++) pred += w[j] * X[i][j];
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - yMean) ** 2;
    absErr += Math.abs(y[i] - pred);
  }
  const r_squared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const mae = y.length > 0 ? absErr / y.length : 0;

  // Anchor: keep hp's current bp_weight; rescale other fitted coefficients
  // by the ratio of (current_hp_weight / fitted_hp). If fitted_hp is ~0 the
  // anchoring breaks down; surface that in the note.
  const currentHp = currentWeights.find((s) => s.stat === 'hp')?.bp_weight ?? 2;
  const suggested_bp_weights: RecalibrateResult['suggested_bp_weights'] = {};
  let note = '';
  if (Math.abs(fitted.hp) < 1e-6) {
    note = 'HP fitted coefficient is ~0 — anchoring impossible; suggestions skipped. Try a sweep with more matchups or more variance in HP.';
  } else {
    const scale = currentHp / fitted.hp;
    suggested_bp_weights.hp = round(fitted.hp * scale, 2);
    suggested_bp_weights.dmg = round(fitted.dmg * scale, 2);
    suggested_bp_weights.evasion_pct = round(fitted.evasion_pct * scale, 2);
    suggested_bp_weights.resilience_pct = round(fitted.resilience_pct * scale, 2);
    suggested_bp_weights.range = round(fitted.range * scale, 2);
    note = `Anchored on HP=${currentHp}. Fit explains ${(r_squared * 100).toFixed(0)}% of win-rate variance.`;
  }

  return {
    n: y.length,
    fitted,
    mae: round(mae, 4),
    r_squared: round(r_squared, 3),
    suggested_bp_weights,
    note,
  };
}

// ─── Plain linear regression via gradient descent ────────────────────────

function fitLinear(X: number[][], y: number[]): number[] {
  const n = X.length;
  if (n === 0) return [0, 0, 0, 0, 0, 0];
  const m = X[0].length;
  // Normalize features so gradient descent is well-conditioned. Save the
  // scale so we can de-normalize at the end.
  const scale = new Array<number>(m).fill(1);
  for (let j = 0; j < m; j++) {
    let maxAbs = 0;
    for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(X[i][j]));
    if (maxAbs > 0) scale[j] = maxAbs;
  }
  const Xn: number[][] = X.map((row) => row.map((v, j) => v / scale[j]));

  const w = new Array<number>(m).fill(0);
  const lr = 0.05;
  const iters = 5000;
  for (let it = 0; it < iters; it++) {
    const grads = new Array<number>(m).fill(0);
    for (let i = 0; i < n; i++) {
      let pred = 0;
      for (let j = 0; j < m; j++) pred += w[j] * Xn[i][j];
      const err = pred - y[i];
      for (let j = 0; j < m; j++) grads[j] += err * Xn[i][j];
    }
    for (let j = 0; j < m; j++) w[j] -= (lr * grads[j]) / n;
  }
  // De-normalize to original feature scale.
  return w.map((v, j) => v / scale[j]);
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ─── Helpers used by the page ──────────────────────────────────────────────

export function buildHeroIndex(heroes: Hero[]): Map<string, Hero> {
  const m = new Map<string, Hero>();
  heroes.forEach((h) => m.set(h.id, h));
  return m;
}
