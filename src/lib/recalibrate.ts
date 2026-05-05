// Phase 5d — BP recalibration. Generalized for Tier 3:
//   • Features = (stat_a − stat_b) for every stat in the env, plus
//     (deck_power_a − deck_power_b).
//   • Suggested bp_weight values are keyed by stat slug; the page applies
//     them by stat_id via the FK lookup.

import type { DerivedStats, StatDef, StatWeight } from '@/types/database';
import type { BatchResult } from '@/lib/simulator';

export interface RecalibrateInput {
  /** Stats per hero (id → DerivedStats). */
  statsByHero: Map<string, DerivedStats>;
  /** Deck power per hero (id → total card power across deck). */
  deckPowerByHero: Map<string, number>;
  /** Cells from a saved sweep: key = "aId|bId" → BatchResult. */
  cells: Record<string, BatchResult>;
  /** All stat definitions for the env (drives feature ordering). */
  stats: StatDef[];
}

export interface RecalibrateResult {
  n: number;
  /** Fitted coefficient per stat slug (plus 'deck_power' for the deck feature). */
  fitted: Record<string, number>;
  mae: number;
  r_squared: number;
  /** Suggested bp_weight per stat slug, HP-anchored. Empty when anchoring impossible. */
  suggested_bp_weights: Record<string, number>;
  note: string;
}

export function recalibrate(
  input: RecalibrateInput,
  currentWeights: StatWeight[],
): RecalibrateResult {
  const statSlugs = input.stats.map((s) => s.slug);
  const featureKeys = [...statSlugs, 'deck_power'];

  const X: number[][] = [];
  const y: number[] = [];
  for (const [key, cell] of Object.entries(input.cells)) {
    const [aId, bId] = key.split('|');
    const sa = input.statsByHero.get(aId);
    const sb = input.statsByHero.get(bId);
    if (!sa || !sb) continue;
    const da = input.deckPowerByHero.get(aId) ?? 0;
    const db = input.deckPowerByHero.get(bId) ?? 0;
    const row: number[] = [];
    for (const slug of statSlugs) {
      row.push((sa[slug] ?? 0) - (sb[slug] ?? 0));
    }
    row.push(da - db);
    X.push(row);
    y.push(cell.win_rate_a - 0.5);
  }

  const w = fitLinear(X, y);
  const fitted: Record<string, number> = {};
  featureKeys.forEach((k, i) => {
    fitted[k] = w[i] ?? 0;
  });

  // Goodness-of-fit
  const yMean = y.reduce((s, v) => s + v, 0) / Math.max(1, y.length);
  let ssRes = 0,
    ssTot = 0,
    absErr = 0;
  for (let i = 0; i < y.length; i++) {
    let pred = 0;
    for (let j = 0; j < w.length; j++) pred += w[j] * X[i][j];
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - yMean) ** 2;
    absErr += Math.abs(y[i] - pred);
  }
  const r_squared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const mae = y.length > 0 ? absErr / y.length : 0;

  // Anchor on the stat with role='hp' if it exists; else first stat.
  const anchor = input.stats.find((s) => s.role === 'hp') ?? input.stats[0];
  const anchorWeight = anchor
    ? currentWeights.find((w) => w.stat_id === anchor.id)?.bp_weight ?? 0
    : 0;
  const fittedAnchor = anchor ? fitted[anchor.slug] : 0;

  const suggested_bp_weights: Record<string, number> = {};
  let note = '';
  if (!anchor || Math.abs(fittedAnchor) < 1e-6) {
    note =
      'Anchor stat fitted coefficient is ~0 — anchoring impossible; suggestions skipped. Try a sweep with more matchups or more variance.';
  } else {
    const scale = anchorWeight / fittedAnchor;
    for (const slug of statSlugs) {
      suggested_bp_weights[slug] = round(fitted[slug] * scale, 2);
    }
    note = `Anchored on "${anchor.slug}" current bp_weight=${anchorWeight}. Fit explains ${(r_squared * 100).toFixed(0)}% of win-rate variance.`;
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

function fitLinear(X: number[][], y: number[]): number[] {
  const n = X.length;
  if (n === 0) return [];
  const m = X[0].length;
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
  return w.map((v, j) => v / scale[j]);
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
