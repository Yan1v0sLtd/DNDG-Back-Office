-- 0005_cards.sql
-- Phase 2 — Cards section.
-- card_tiers + effect_types are env-scoped catalogs (designer-editable later;
-- admin-only writes for now). cards + card_effects are the content tables.
--
-- Per GDD soft launch:
--   • Each hero's battle deck = 5 role-specific + 5 general (10 total).
--   • Tiers: Common (low cooldown) and Uncommon (low-medium cooldown).
--   • Card tier access is gated by Mastery Rank (already in mastery_ranks).

create table card_tiers (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  slug text not null,
  display_name text not null,
  cooldown_min_sec numeric not null default 0,
  cooldown_max_sec numeric not null default 0,
  power_multiplier numeric not null default 1,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (env_id, slug),
  unique (env_id, position)
);
create trigger card_tiers_touch before update on card_tiers
  for each row execute function touch_updated_at();

create table effect_types (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  slug text not null,
  display_name text not null,
  category text not null check (category in ('offense','defense','control','utility')),
  pp_weight numeric not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (env_id, slug)
);
create trigger effect_types_touch before update on effect_types
  for each row execute function touch_updated_at();

create table cards (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('role_specific','general')),
  combat_role_id uuid references combat_roles(id),
  tier_id uuid not null references card_tiers(id),
  cooldown_sec numeric not null check (cooldown_sec >= 0),
  description text,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (env_id, name),
  -- role_specific cards must have a role; general cards must not.
  check (
    (kind = 'role_specific' and combat_role_id is not null) or
    (kind = 'general' and combat_role_id is null)
  )
);
create trigger cards_touch before update on cards
  for each row execute function touch_updated_at();

create table card_effects (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  effect_type_id uuid not null references effect_types(id),
  magnitude numeric not null,
  duration_sec numeric not null default 0 check (duration_sec >= 0),
  target_type text not null check (target_type in ('self','ally','enemy','aoe_enemy','aoe_ally')),
  target_count int not null default 1 check (target_count >= 1),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index card_effects_card_idx on card_effects (card_id);
create trigger card_effects_touch before update on card_effects
  for each row execute function touch_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table card_tiers enable row level security;
alter table effect_types enable row level security;
alter table cards enable row level security;
alter table card_effects enable row level security;

create policy ct_select on card_tiers for select to authenticated using (true);
create policy ct_admin_write on card_tiers for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

create policy et_select on effect_types for select to authenticated using (true);
create policy et_admin_write on effect_types for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

create policy cards_select on cards for select to authenticated using (true);
create policy cards_designer_write on cards for all to authenticated
  using (auth_role() in ('admin','designer'))
  with check (auth_role() in ('admin','designer'));

create policy card_effects_select on card_effects for select to authenticated using (true);
create policy card_effects_designer_write on card_effects for all to authenticated
  using (auth_role() in ('admin','designer'))
  with check (auth_role() in ('admin','designer'));

-- ─── change_log triggers ────────────────────────────────────────────────────
create trigger card_tiers_log after insert or update or delete on card_tiers
  for each row execute function log_change();
create trigger effect_types_log after insert or update or delete on effect_types
  for each row execute function log_change();
create trigger cards_log after insert or update or delete on cards
  for each row execute function log_change();
create trigger card_effects_log after insert or update or delete on card_effects
  for each row execute function log_change();

-- ─── seed (dev env) ─────────────────────────────────────────────────────────
-- Catalog only. The GDD doesn't list specific cards yet, so designers author
-- from empty. Cooldown bands are guesses; pp_weights will be retuned by the
-- Phase 5 simulator with real data.
do $$
declare
  v_env uuid;
begin
  select id into v_env from environments where name = 'dev';

  insert into card_tiers (env_id, slug, display_name, cooldown_min_sec, cooldown_max_sec, power_multiplier, position) values
    (v_env, 'common',   'Common',   4,  8,  1.00, 1),
    (v_env, 'uncommon', 'Uncommon', 8, 14, 1.25, 2)
  on conflict (env_id, slug) do nothing;

  insert into effect_types (env_id, slug, display_name, category, pp_weight, description) values
    (v_env, 'damage',           'Damage',            'offense', 2.0,  'Direct damage to target. magnitude = damage points.'),
    (v_env, 'damage_over_time', 'Damage over Time',  'offense', 1.5,  'DoT. magnitude = damage per second; duration_sec = total seconds.'),
    (v_env, 'heal',             'Heal',              'defense', 1.5,  'Restore HP. magnitude = HP healed.'),
    (v_env, 'shield',           'Shield',            'defense', 1.4,  'Absorb incoming damage. magnitude = HP shielded; duration_sec = how long the shield lasts.'),
    (v_env, 'stun',             'Stun',              'control', 18.0, 'Target cannot act. duration_sec = stun length. Resisted by Resilience.'),
    (v_env, 'slow',             'Slow',              'control', 0.6,  'Reduce target movement. magnitude = % slow; duration_sec = duration.'),
    (v_env, 'evasion_debuff',   'Evasion Debuff',    'control', 0.8,  'Reduce target evasion. magnitude = % reduction; duration_sec = duration. Resisted by Resilience.'),
    (v_env, 'knockback',        'Knockback',         'control', 12.0, 'Push target. magnitude = grid units displaced.'),
    (v_env, 'buff_might',       'Might Buff',        'offense', 14.0, 'Increase ally Might. magnitude = points gained; duration_sec = duration.'),
    (v_env, 'buff_haste',       'Haste Buff',        'defense', 5.0,  'Increase ally Haste. magnitude = points gained; duration_sec = duration.'),
    (v_env, 'buff_resilience',  'Resilience Buff',   'defense', 4.0,  'Increase ally Resilience. magnitude = points gained; duration_sec = duration.')
  on conflict (env_id, slug) do nothing;
end $$;
