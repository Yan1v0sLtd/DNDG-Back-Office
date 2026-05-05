-- 0012_simulator_config.sql
-- Tier 1 of "make it more flexible": move the simulator's hardcoded timing
-- constants to a config table. One row per env, admin-write per RLS.
-- Defaults match the previous in-code constants so behavior is unchanged
-- on first run.

create table simulator_config (
  env_id uuid primary key references environments(id) on delete cascade,
  tick_sec numeric not null default 0.5 check (tick_sec > 0),
  max_battle_sec numeric not null default 30 check (max_battle_sec > 0),
  basic_attack_cd numeric not null default 1.0 check (basic_attack_cd > 0),
  close_speed numeric not null default 6 check (close_speed > 0),
  retreat_speed numeric not null default 4 check (retreat_speed >= 0),
  verdict_band_min numeric not null default 0.45,
  verdict_band_max numeric not null default 0.55,
  default_pairwise_runs int not null default 1000 check (default_pairwise_runs > 0),
  default_sweep_runs int not null default 200 check (default_sweep_runs > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (verdict_band_max > verdict_band_min and verdict_band_min >= 0 and verdict_band_max <= 1)
);

create trigger simulator_config_touch before update on simulator_config
  for each row execute function touch_updated_at();
create trigger simulator_config_log after insert or update or delete on simulator_config
  for each row execute function log_change();

alter table simulator_config enable row level security;
create policy sc_select on simulator_config for select to authenticated using (true);
create policy sc_admin_write on simulator_config for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- Seed default row for every existing env so the app has something to read.
insert into simulator_config (env_id)
select id from environments
on conflict (env_id) do nothing;
