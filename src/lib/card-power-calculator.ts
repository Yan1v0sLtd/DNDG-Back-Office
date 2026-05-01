// Card Power — internal score for a card based on its effects, cooldown, tier.
//
//   effect_power     = pp_weight × magnitude × max(duration_sec, 1) × target_count
//   total_effect_pwr = Σ effect_power
//   cooldown_factor  = 10 / (cooldown_sec + 1)
//   card_power       = total_effect_pwr × cooldown_factor × tier_multiplier
//
// All weights/multipliers are READ FROM CONFIG, not hardcoded. Designers tune
// effect_types.pp_weight and card_tiers.power_multiplier; Phase 5 simulator
// recalibrates from real data.
//
// Why max(duration_sec, 1): instant effects (duration=0) still have power.
// Why cooldown_factor of 10/(cd+1): a 9s CD halves power vs a 0s instant; a
// 19s CD halves it again. Smooth and bounded; no discontinuities.

import type { Card, CardEffect, CardTier, EffectType } from '@/types/database';

export function effectPower(effect: CardEffect, effectTypes: EffectType[]): number {
  const t = effectTypes.find((e) => e.id === effect.effect_type_id);
  if (!t) return 0;
  return (
    t.pp_weight *
    effect.magnitude *
    Math.max(effect.duration_sec, 1) *
    effect.target_count
  );
}

export function cardPower(
  card: Pick<Card, 'cooldown_sec' | 'tier_id'>,
  effects: CardEffect[],
  tiers: CardTier[],
  effectTypes: EffectType[],
): number {
  const total = effects.reduce((s, e) => s + effectPower(e, effectTypes), 0);
  const cd = 10 / (card.cooldown_sec + 1);
  const tier = tiers.find((t) => t.id === card.tier_id);
  const tierMult = tier?.power_multiplier ?? 1;
  return Math.round(total * cd * tierMult);
}
