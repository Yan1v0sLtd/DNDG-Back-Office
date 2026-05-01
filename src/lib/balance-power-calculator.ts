// Balance Power — INTERNAL score for a hero used by simulator and budget alerts.
// Same shape as MS but uses bp_weight from stat_weights, so Range carries
// real weight here without affecting the player-facing Mastery Score.
//
// Phase 3: hero BP = stat power + Σ card_power across the hero's deck.
// Phase 5 simulator will reweight the deck contribution with usage frequency
// data; until then, raw additive contribution is the placeholder.

import type {
  Card,
  CardEffect,
  CardTier,
  CombatStats,
  EffectType,
  Stat,
  StatWeight,
} from '@/types/database';
import { cardPower } from './card-power-calculator';

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

export interface DeckContribution {
  total: number;
  perCard: Array<{ cardId: string; power: number }>;
}

export function deckContribution(
  cards: Card[],
  effectsByCard: Map<string, CardEffect[]>,
  tiers: CardTier[],
  effectTypes: EffectType[],
): DeckContribution {
  const perCard = cards.map((c) => ({
    cardId: c.id,
    power: cardPower(c, effectsByCard.get(c.id) ?? [], tiers, effectTypes),
  }));
  return {
    total: perCard.reduce((s, x) => s + x.power, 0),
    perCard,
  };
}

export function balancePowerWithDeck(
  stats: CombatStats,
  weights: StatWeight[],
  deck: DeckContribution | null,
): number {
  return balancePowerFromStats(stats, weights) + (deck?.total ?? 0);
}
