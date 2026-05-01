// Mastery Score — the player-facing score per the GDD.
// MS = (HP × 2) + (DMG × 20) + (Evasion% × 8) + (Resilience% × 5)
// Range is intentionally excluded (compensated by lower base damage on ranged heroes).
//
// All weights and conversions are READ FROM CONFIG, not hardcoded. If a designer
// retunes a coefficient in the admin UI, every hero's MS reprices instantly.

import type {
  Attribute,
  AttributeCoefficient,
  CombatStats,
  HeroAttributes,
  Stat,
  StatWeight,
} from '@/types/database';

export function deriveStats(
  attrs: HeroAttributes,
  coefficients: AttributeCoefficient[],
): CombatStats {
  const c = (a: Attribute) =>
    coefficients.find((x) => x.attribute === a)?.stat_per_point ?? 0;

  return {
    hp: round(attrs.vitality * c('vitality')),
    dmg: round(attrs.might * c('might'), 2),
    evasion_pct: round(attrs.haste * c('haste'), 2),
    resilience_pct: round(attrs.resilience * c('resilience'), 2),
    range: round(attrs.range * c('range')),
  };
}

export function masteryScore(stats: CombatStats, weights: StatWeight[]): number {
  const w = (s: Stat) =>
    weights.find((x) => x.stat === s)?.ms_weight ?? 0;
  const ms =
    stats.hp * w('hp') +
    stats.dmg * w('dmg') +
    stats.evasion_pct * w('evasion_pct') +
    stats.resilience_pct * w('resilience_pct') +
    stats.range * w('range');
  return Math.round(ms);
}

function round(n: number, dp = 0) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
