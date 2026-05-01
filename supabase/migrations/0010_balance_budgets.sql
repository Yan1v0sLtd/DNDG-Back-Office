-- 0010_balance_budgets.sql
-- Phase 4 — balance budgets per (combat_role × mastery_rank).
-- Designer sets a target BP envelope; heroes outside are flagged in the UI.
-- bp_min and bp_max are independently nullable so designers can set just one
-- side of the envelope (e.g., a floor without a ceiling).

create table balance_budgets (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  combat_role_id uuid not null references combat_roles(id) on delete cascade,
  mastery_rank_id uuid not null references mastery_ranks(id) on delete cascade,
  bp_min int,
  bp_max int,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (env_id, combat_role_id, mastery_rank_id),
  check (bp_min is null or bp_max is null or bp_max >= bp_min)
);
create index balance_budgets_env_role_idx on balance_budgets (env_id, combat_role_id);
create trigger balance_budgets_touch before update on balance_budgets
  for each row execute function touch_updated_at();

alter table balance_budgets enable row level security;
create policy bb_select on balance_budgets for select to authenticated using (true);
create policy bb_admin_write on balance_budgets for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

create trigger balance_budgets_log after insert or update or delete on balance_budgets
  for each row execute function log_change();
