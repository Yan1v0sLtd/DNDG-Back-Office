// Domain types mirroring the Supabase schema. Keep in sync with migrations.

export type Attribute = 'vitality' | 'might' | 'range' | 'haste' | 'resilience';
export type Stat = 'hp' | 'dmg' | 'evasion_pct' | 'resilience_pct' | 'range';
export type RangeKind = 'melee' | 'ranged' | 'mixed';
export type HeroStatus = 'draft' | 'published';
export type UserRoleName = 'admin' | 'designer' | 'viewer';

export interface Environment {
  id: string;
  name: string;
  created_at: string;
}

export interface AttributeCoefficient {
  id: string;
  env_id: string;
  attribute: Attribute;
  stat_per_point: number;
}

export interface StatWeight {
  id: string;
  env_id: string;
  stat: Stat;
  ms_weight: number;
  bp_weight: number;
}

export interface CombatRole {
  id: string;
  env_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  range_kind: RangeKind;
}

export interface MasteryRank {
  id: string;
  env_id: string;
  rank: number;
  ms_threshold: number;
  card_tier_unlocked: string | null;
}

export interface Hero {
  id: string;
  env_id: string;
  name: string;
  race: string | null;
  combat_role_id: string;
  description: string | null;
  status: HeroStatus;
  vitality: number;
  might: number;
  range: number;
  haste: number;
  resilience: number;
  created_at: string;
  updated_at: string;
}

export interface HeroAttributes {
  vitality: number;
  might: number;
  range: number;
  haste: number;
  resilience: number;
}

export interface CombatStats {
  hp: number;
  dmg: number;
  evasion_pct: number;
  resilience_pct: number;
  range: number;
}

// ─── Phase 2 — Cards ────────────────────────────────────────────────────────

export type CardKind = 'role_specific' | 'general';
export type EffectCategory = 'offense' | 'defense' | 'control' | 'utility';
export type TargetType = 'self' | 'ally' | 'enemy' | 'aoe_enemy' | 'aoe_ally';
export type CardStatus = 'draft' | 'published';

export interface CardTier {
  id: string;
  env_id: string;
  slug: string;
  display_name: string;
  cooldown_min_sec: number;
  cooldown_max_sec: number;
  power_multiplier: number;
  position: number;
}

export interface EffectType {
  id: string;
  env_id: string;
  slug: string;
  display_name: string;
  category: EffectCategory;
  pp_weight: number;
  description: string | null;
}

export interface Card {
  id: string;
  env_id: string;
  name: string;
  kind: CardKind;
  combat_role_id: string | null;
  tier_id: string;
  cooldown_sec: number;
  description: string | null;
  status: CardStatus;
  created_at: string;
  updated_at: string;
}

export interface CardEffect {
  id: string;
  card_id: string;
  effect_type_id: string;
  magnitude: number;
  duration_sec: number;
  target_type: TargetType;
  target_count: number;
  position: number;
}

// ─── Phase 3 — Decks ────────────────────────────────────────────────────────

// Slots 1..5 are role-specific (must match hero's combat_role); slots 6..10
// are general. Convention enforced in app code, not in the database.
export interface HeroDeckEntry {
  id: string;
  hero_id: string;
  card_id: string;
  slot: number;
}

export const ROLE_SPECIFIC_SLOTS = [1, 2, 3, 4, 5] as const;
export const GENERAL_SLOTS = [6, 7, 8, 9, 10] as const;
export const ALL_SLOTS = [...ROLE_SPECIFIC_SLOTS, ...GENERAL_SLOTS] as const;

export function slotKind(slot: number): CardKind {
  return slot <= 5 ? 'role_specific' : 'general';
}
