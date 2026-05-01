-- 0004_harden_function_search_paths.sql
-- Pin search_path on plpgsql/sql functions per Supabase advisor
-- (lint 0011_function_search_path_mutable). Without an explicit search_path,
-- a function inherits the caller's, which can be exploited via search_path
-- manipulation if any of these are ever invoked from a higher-privilege context.

create or replace function touch_updated_at() returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function auth_role() returns text
language sql stable
set search_path = public, pg_catalog
as $$
  select role from user_roles where user_id = auth.uid()
$$;

create or replace function log_change() returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
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
