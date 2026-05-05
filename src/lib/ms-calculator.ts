// Mastery Score — the player-facing score per the GDD.
// Tier 3: data-driven. attributes and stats live in DB tables; the formulas
// iterate over coefficients (each row says "this attribute produces this
// stat at this rate") and stat_weights (each row says "this stat counts
// for X MS per unit and Y BP per unit").

import type {
  AttributeCoefficient,
  AttributeDef,
  DerivedStats,
  StatDef,
  StatWeight,
} from '@/types/database';

/**
 * Compute a hero's combat stats from its attribute_values map.
 * Iterates over all coefficient rows: for each, multiply the attribute
 * value by stat_per_point and add to the produces_stat slug's running total.
 * Stats that no coefficient targets default to 0.
 */
export function deriveStats(
  attrValues: Record<string, number>,
  attributes: AttributeDef[],
  coefficients: AttributeCoefficient[],
  stats: StatDef[],
): DerivedStats {
  const out: DerivedStats = {};
  for (const s of stats) out[s.slug] = 0;
  for (const c of coefficients) {
    const attr = attributes.find((a) => a.id === c.attribute_id);
    const stat = stats.find((s) => s.id === c.produces_stat_id);
    if (!attr || !stat) continue;
    const v = attrValues[attr.slug] ?? 0;
    out[stat.slug] = (out[stat.slug] ?? 0) + v * c.stat_per_point;
  }
  // Round to 2dp (matches the previous behavior; downstream code rounds further).
  for (const k of Object.keys(out)) {
    out[k] = Math.round(out[k] * 100) / 100;
  }
  return out;
}

export function masteryScore(
  derived: DerivedStats,
  weights: StatWeight[],
  stats: StatDef[],
): number {
  let total = 0;
  for (const w of weights) {
    const stat = stats.find((s) => s.id === w.stat_id);
    if (!stat) continue;
    total += (derived[stat.slug] ?? 0) * w.ms_weight;
  }
  return Math.round(total);
}
