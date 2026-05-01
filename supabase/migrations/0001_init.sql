-- 0001_init.sql
-- Crucible Balancer — Phase 1 schema.
-- Foundation: environments + user_roles.
-- Config (env-scoped, designer-editable): attribute_coefficients, stat_weights,
--   combat_roles, mastery_ranks.
-- Heroes section.
-- Cards tables ARE NOT created here. They land in 0004_cards.sql in Phase 2.

create extension if not exists pgcrypto;

-- ─── touch trigger ──────────────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─── foundation ─────────────────────────────────────────────────────────────
create table environments (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'designer', 'viewer')),
  created_at timestamptz not null default now()
);

-- helper: read current user's role (used by RLS policies)
create or replace function auth_role() returns text language sql stable as $$
  select role from user_roles where user_id = auth.uid()
$$;

-- ─── config tables (env-scoped) ─────────────────────────────────────────────

-- 1 attribute point → X stat units. Per GDD:
--   vit→hp=5, might→dmg=0.5, range→grid=1, haste→eva%=1.25, resilience→res%=2
create table attribute_coefficients (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  attribute text not null check (attribute in ('vitality','might','range','haste','resilience')),
  stat_per_point numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (env_id, attribute)
);
create trigger attribute_coefficients_touch before update on attribute_coefficients
  for each row execute function touch_updated_at();

-- Stat weights for the two scores. ms_weight = GDD Mastery Score (range = 0).
-- bp_weight = internal Balance Power (includes range, tunable).
create table stat_weights (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  stat text not null check (stat in ('hp','dmg','evasion_pct','resilience_pct','range')),
  ms_weight numeric not null default 0,
  bp_weight numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (env_id, stat)
);
create trigger stat_weights_touch before update on stat_weights
  for each row execute function touch_updated_at();

create table combat_roles (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  slug text not null,
  display_name text not null,
  description text,
  range_kind text not null check (range_kind in ('melee','ranged','mixed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (env_id, slug)
);
create trigger combat_roles_touch before update on combat_roles
  for each row execute function touch_updated_at();

create table mastery_ranks (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  rank int not null check (rank between 1 and 15),
  ms_threshold int not null,
  card_tier_unlocked text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (env_id, rank)
);
create trigger mastery_ranks_touch before update on mastery_ranks
  for each row execute function touch_updated_at();

-- ─── heroes ─────────────────────────────────────────────────────────────────
create table heroes (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  name text not null,
  race text,
  combat_role_id uuid not null references combat_roles(id),
  description text,
  status text not null default 'draft' check (status in ('draft','published')),
  -- Attributes inline. The GDD locks the set at 5 and they're never independent;
  -- a side table would just add joins for no flexibility.
  vitality int not null default 0 check (vitality >= 0),
  might int not null default 0 check (might >= 0),
  range int not null default 1 check (range >= 1),
  haste int not null default 0 check (haste >= 0),
  resilience int not null default 0 check (resilience >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (env_id, name)
);
create trigger heroes_touch before update on heroes
  for each row execute function touch_updated_at();

-- ─── change log ─────────────────────────────────────────────────────────────
-- Cheap to add now, painful to backfill. Captures all writes to content/config.
create table change_log (
  id uuid primary key default gen_random_uuid(),
  env_id uuid references environments(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('insert','update','delete')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index change_log_env_created_idx on change_log (env_id, created_at desc);

create or replace function log_change() returns trigger language plpgsql as $$
declare
  v_env uuid;
  v_row uuid;
begin
  v_env := coalesce(
    (case when tg_op <> 'DELETE' then (to_jsonb(new) ->> 'env_id') else (to_jsonb(old) ->> 'env_id') end)::uuid,
    null
  );
  v_row := coalesce(
    (case when tg_op <> 'DELETE' then (to_jsonb(new) ->> 'id') else (to_jsonb(old) ->> 'id') end)::uuid,
    null
  );
  insert into change_log (env_id, user_id, table_name, row_id, action, before, after)
  values (
    v_env,
    auth.uid(),
    tg_table_name,
    v_row,
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger heroes_log after insert or update or delete on heroes
  for each row execute function log_change();
create trigger attribute_coefficients_log after insert or update or delete on attribute_coefficients
  for each row execute function log_change();
create trigger stat_weights_log after insert or update or delete on stat_weights
  for each row execute function log_change();
create trigger combat_roles_log after insert or update or delete on combat_roles
  for each row execute function log_change();
create trigger mastery_ranks_log after insert or update or delete on mastery_ranks
  for each row execute function log_change();
