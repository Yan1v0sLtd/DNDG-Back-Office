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
