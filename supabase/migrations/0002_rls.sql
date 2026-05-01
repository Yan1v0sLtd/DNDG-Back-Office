-- 0002_rls.sql
-- Row-Level Security policies. RLS is authoritative — never rely solely on
-- client-side role checks.
--
-- Roles:
--   admin    — write everything (incl. config + envs + user_roles)
--   designer — write content (heroes); read config
--   viewer   — read-only

alter table environments enable row level security;
alter table user_roles enable row level security;
alter table attribute_coefficients enable row level security;
alter table stat_weights enable row level security;
alter table combat_roles enable row level security;
alter table mastery_ranks enable row level security;
alter table heroes enable row level security;
alter table change_log enable row level security;

-- ─── environments ───────────────────────────────────────────────────────────
create policy env_select on environments for select to authenticated using (true);
create policy env_admin_write on environments for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- ─── user_roles ─────────────────────────────────────────────────────────────
-- Anyone authenticated can read their own row (so the app can know its role).
create policy user_roles_self_select on user_roles for select to authenticated
  using (user_id = auth.uid());
-- Admins can read/write all rows.
create policy user_roles_admin_select on user_roles for select to authenticated
  using (auth_role() = 'admin');
create policy user_roles_admin_write on user_roles for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- ─── config tables (read all, write admin only) ─────────────────────────────
create policy attr_coef_select on attribute_coefficients for select to authenticated using (true);
create policy attr_coef_admin_write on attribute_coefficients for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

create policy stat_w_select on stat_weights for select to authenticated using (true);
create policy stat_w_admin_write on stat_weights for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

create policy roles_select on combat_roles for select to authenticated using (true);
create policy roles_admin_write on combat_roles for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

create policy mastery_select on mastery_ranks for select to authenticated using (true);
create policy mastery_admin_write on mastery_ranks for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- ─── heroes (read all, write designer + admin) ──────────────────────────────
create policy heroes_select on heroes for select to authenticated using (true);
create policy heroes_designer_write on heroes for all to authenticated
  using (auth_role() in ('admin','designer'))
  with check (auth_role() in ('admin','designer'));

-- ─── change_log (read for admin/designer, never written from client) ────────
create policy change_log_select on change_log for select to authenticated
  using (auth_role() in ('admin','designer'));
-- No insert policy — change_log is written by triggers running as definer.
