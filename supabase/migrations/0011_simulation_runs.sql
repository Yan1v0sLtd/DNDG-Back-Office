-- 0011_simulation_runs.sql
-- Phase 5c — saved simulation runs.
-- Stores both pairwise (single matchup) and sweep (NxN) results so designers
-- can compare runs over time as they tune. Immutable after creation.

create table simulation_runs (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  kind text not null check (kind in ('pairwise','sweep')),
  -- For pairwise these point at the two heroes; for sweep both are null.
  hero_a_id uuid references heroes(id) on delete set null,
  hero_b_id uuid references heroes(id) on delete set null,
  runs_per_matchup int not null,
  -- For pairwise: a single BatchResult JSON blob.
  -- For sweep: { cells: { "aId|bId": BatchResult }, hero_ids: string[] }.
  result jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index simulation_runs_env_created_idx on simulation_runs (env_id, created_at desc);
create index simulation_runs_kind_idx on simulation_runs (env_id, kind, created_at desc);

alter table simulation_runs enable row level security;
create policy sr_select on simulation_runs for select to authenticated using (true);
create policy sr_designer_insert on simulation_runs for insert to authenticated
  with check (auth_role() in ('admin','designer') and created_by = auth.uid());
create policy sr_admin_delete on simulation_runs for delete to authenticated
  using (auth_role() = 'admin');
-- No update policy — runs are immutable.

create trigger simulation_runs_log after insert or delete on simulation_runs
  for each row execute function log_change();
