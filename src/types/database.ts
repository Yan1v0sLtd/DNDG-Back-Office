// Domain types mirroring the Supabase schema. Keep in sync with migrations.

// String slugs (no longer literal unions — see Tier 3 below).
export type RangeKind = 'melee' | 'ranged' | 'mixed';
export type HeroStatus = 'draft' | 'published';
export type UserRoleName = 'admin' | 'designer' | 'viewer';
export type StatRole = 'hp' | 'dmg' | 'evasion' | 'resilience' | 'range' | 'other';

export interface Environment {
  id: string;
  name: string;
  created_at: string;
}

// ─── Tier 3 — data-driven attributes + stats ───────────────────────────────

export interface AttributeDef {
  id: string;
  env_id: string;
  slug: string;
  display_name: string;
  position: number;
  default_value: number;
  min_value: number;
  description: string | null;
}

export interface StatDef {
  id: string;
  env_id: string;
  slug: string;
  display_name: string;
  unit_label: string | null;
  role: StatRole;
  position: number;
  description: string | null;
}

/** Maps attribute_id → (stat_per_point, produces_stat_id). */
export interface AttributeCoefficient {
  id: string;
  env_id: string;
  attribute_id: string;
  produces_stat_id: string;
  stat_per_point: number;
}

export interface StatWeight {
  id: string;
  env_id: string;
  stat_id: string;
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
  /** Map of attribute slug → numeric value. Replaces inline columns. */
  attribute_values: Record<string, number>;
  created_at: string;
  updated_at: string;
}

/** A combatant's derived stats: dynamic shape, keyed by stat slug. */
export type DerivedStats = Record<string, number>;

// ─── Phase 2 — Cards (unchanged) ───────────────────────────────────────────

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

// ─── Phase 3 — Decks ───────────────────────────────────────────────────────

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

// ─── Phase 4 — Balance Budgets ─────────────────────────────────────────────

export interface BalanceBudget {
  id: string;
  env_id: string;
  combat_role_id: string;
  mastery_rank_id: string;
  bp_min: number | null;
  bp_max: number | null;
  notes: string | null;
}

export type BudgetVerdict = 'no_budget' | 'too_low' | 'too_high' | 'ok';

// ─── Phase 5c — Simulation runs ────────────────────────────────────────────

export type SimulationKind = 'pairwise' | 'sweep';

export interface SimulationRun {
  id: string;
  env_id: string;
  kind: SimulationKind;
  hero_a_id: string | null;
  hero_b_id: string | null;
  runs_per_matchup: number;
  result: unknown;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

// ─── Tier 1 flexibility — Simulator config ─────────────────────────────────

export interface SimulatorConfig {
  env_id: string;
  tick_sec: number;
  max_battle_sec: number;
  basic_attack_cd: number;
  close_speed: number;
  retreat_speed: number;
  verdict_band_min: number;
  verdict_band_max: number;
  default_pairwise_runs: number;
  default_sweep_runs: number;
}

export const SIMULATOR_CONFIG_DEFAULTS: Omit<SimulatorConfig, 'env_id'> = {
  tick_sec: 0.5,
  max_battle_sec: 30,
  basic_attack_cd: 1.0,
  close_speed: 6,
  retreat_speed: 4,
  verdict_band_min: 0.45,
  verdict_band_max: 0.55,
  default_pairwise_runs: 1000,
  default_sweep_runs: 200,
};

// ─── Lookup helpers ────────────────────────────────────────────────────────

export function findAttribute(attrs: AttributeDef[], id: string): AttributeDef | undefined {
  return attrs.find((a) => a.id === id);
}

export function findStat(stats: StatDef[], id: string): StatDef | undefined {
  return stats.find((s) => s.id === id);
}

export function findStatByRole(stats: StatDef[], role: StatRole): StatDef | undefined {
  return stats.find((s) => s.role === role);
}

export function statValueByRole(
  derived: DerivedStats,
  stats: StatDef[],
  role: StatRole,
): number {
  const def = findStatByRole(stats, role);
  if (!def) return 0;
  return derived[def.slug] ?? 0;
}
