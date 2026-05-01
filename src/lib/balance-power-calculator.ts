// Balance Power — the INTERNAL score used by the simulator and budget alerts.
// Same shape as MS but uses bp_weight from stat_weights, so Range can carry
// real weight here without affecting the player-facing Mastery Score.
//
// Phase 1: hero stats only. Phase 3 will fold in deck Card Power.

import type { CombatStats, Stat, StatWeight } from '@/types/database';

export function balancePowerFromStats(
  stats: CombatStats,
  weights: StatWeight[],
): number {
  const w = (s: Stat) =>
    weights.find((x) => x.stat === s)?.bp_weight ?? 0;
  const bp =
    stats.hp * w('hp') +
    stats.dmg * w('dmg') +
    stats.evasion_pct * w('evasion_pct') +
    stats.resilience_pct * w('resilience_pct') +
    stats.range * w('range');
  return Math.round(bp);
}
