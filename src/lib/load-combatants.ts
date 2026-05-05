// Shared loader: assemble HeroFull (hero + role-mapped derived stats + deck
// cards + effects). Used by /simulator and /sweep.
//
// Tier 3: derives stats dynamically from attribute_values via the
// attribute_coefficients/stats tables, then maps stats to the simulator's
// fixed roles (hp, dmg, evasion, resilience, range) by stats.role.

import { supabase } from '@/lib/supabase';
import { deriveStats } from '@/lib/ms-calculator';
import type { ConfigBundle } from '@/lib/useConfigBundle';
import { statValueByRole } from '@/types/database';
import type {
  Card,
  CardEffect,
  Hero,
  HeroDeckEntry,
} from '@/types/database';
import type { CombatantInput } from '@/lib/simulator';

export type HeroFull = CombatantInput;

export async function loadAllCombatants(
  envId: string,
  bundle: ConfigBundle,
  filter: { onlyPublished?: boolean } = {},
): Promise<HeroFull[]> {
  let heroQuery = supabase.from('heroes').select('*').eq('env_id', envId);
  if (filter.onlyPublished) heroQuery = heroQuery.eq('status', 'published');

  const [heroesRes, decksRes, cardsRes] = await Promise.all([
    heroQuery.order('name'),
    supabase.from('hero_decks').select('*'),
    supabase.from('cards').select('*').eq('env_id', envId),
  ]);
  if (heroesRes.error) throw new Error(heroesRes.error.message);
  if (decksRes.error) throw new Error(decksRes.error.message);
  if (cardsRes.error) throw new Error(cardsRes.error.message);

  const cardIds = (cardsRes.data ?? []).map((c) => c.id);
  const { data: effRows, error: effErr } =
    cardIds.length > 0
      ? await supabase.from('card_effects').select('*').in('card_id', cardIds)
      : { data: [] as CardEffect[], error: null };
  if (effErr) throw new Error(effErr.message);

  return assemble(
    (heroesRes.data ?? []) as Hero[],
    (decksRes.data ?? []) as HeroDeckEntry[],
    (cardsRes.data ?? []) as Card[],
    (effRows ?? []) as CardEffect[],
    bundle,
  );
}

export async function loadCombatant(
  heroId: string,
  bundle: ConfigBundle,
): Promise<HeroFull> {
  const [heroRes, deckRes] = await Promise.all([
    supabase.from('heroes').select('*').eq('id', heroId).single(),
    supabase.from('hero_decks').select('*').eq('hero_id', heroId).order('slot'),
  ]);
  if (heroRes.error || !heroRes.data) throw new Error(heroRes.error?.message ?? 'hero not found');

  const deck = (deckRes.data ?? []) as HeroDeckEntry[];
  const cardIds = deck.map((d) => d.card_id);
  const { data: cardRows } =
    cardIds.length > 0
      ? await supabase.from('cards').select('*').in('id', cardIds)
      : { data: [] as Card[] };
  const { data: effRows } =
    cardIds.length > 0
      ? await supabase.from('card_effects').select('*').in('card_id', cardIds)
      : { data: [] as CardEffect[] };

  const list = assemble(
    [heroRes.data as Hero],
    deck,
    (cardRows ?? []) as Card[],
    (effRows ?? []) as CardEffect[],
    bundle,
  );
  return list[0];
}

function assemble(
  heroes: Hero[],
  decks: HeroDeckEntry[],
  cards: Card[],
  effects: CardEffect[],
  bundle: ConfigBundle,
): HeroFull[] {
  const cardsById = new Map<string, Card>();
  cards.forEach((c) => cardsById.set(c.id, c));

  const effsByCard = new Map<string, CardEffect[]>();
  effects.forEach((e) => {
    const arr = effsByCard.get(e.card_id) ?? [];
    arr.push(e);
    effsByCard.set(e.card_id, arr);
  });

  const decksByHero = new Map<string, HeroDeckEntry[]>();
  decks.forEach((d) => {
    const arr = decksByHero.get(d.hero_id) ?? [];
    arr.push(d);
    decksByHero.set(d.hero_id, arr);
  });

  return heroes.map((h) => {
    const allDerived = deriveStats(
      h.attribute_values,
      bundle.attributes,
      bundle.coefficients,
      bundle.stats,
    );
    const deck = (decksByHero.get(h.id) ?? [])
      .map((d) => ({ card: cardsById.get(d.card_id), effects: effsByCard.get(d.card_id) ?? [] }))
      .filter((x): x is { card: Card; effects: CardEffect[] } => Boolean(x.card));
    return {
      hero: h,
      // The simulator's combat math operates on fixed roles. We extract them
      // from the dynamic derived stats here so the simulator stays simple.
      // Stats with role='other' are ignored by combat math but still feed BP.
      derived: {
        hp: statValueByRole(allDerived, bundle.stats, 'hp'),
        dmg: statValueByRole(allDerived, bundle.stats, 'dmg'),
        evasion_pct: statValueByRole(allDerived, bundle.stats, 'evasion'),
        resilience_pct: statValueByRole(allDerived, bundle.stats, 'resilience'),
        range: statValueByRole(allDerived, bundle.stats, 'range'),
      },
      deck,
    };
  });
}
