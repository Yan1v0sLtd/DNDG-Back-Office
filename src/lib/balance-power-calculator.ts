// Balance Power — INTERNAL hero score for simulator and budget alerts.
// Tier 3: data-driven over the stats table (was previously hardcoded HP/DMG/eva%/res%/range).

import type {
  Card,
  CardEffect,
  CardTier,
  DerivedStats,
  EffectType,
  StatDef,
  StatWeight,
} from '@/types/database';
import { cardPower } from './card-power-calculator';

export function balancePowerFromStats(
  derived: DerivedStats,
  weights: StatWeight[],
  stats: StatDef[],
): number {
  let total = 0;
  for (const w of weights) {
    const stat = stats.find((s) => s.id === w.stat_id);
    if (!stat) continue;
    total += (derived[stat.slug] ?? 0) * w.bp_weight;
  }
  return Math.round(total);
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
  derived: DerivedStats,
  weights: StatWeight[],
  stats: StatDef[],
  deck: DeckContribution | null,
): number {
  return balancePowerFromStats(derived, weights, stats) + (deck?.total ?? 0);
}
