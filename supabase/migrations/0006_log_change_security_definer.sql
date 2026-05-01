-- 0006_log_change_security_definer.sql
-- Fix: the trigger fires under the calling user's permissions, but change_log
-- has RLS enabled with no INSERT policy → save fails with "new row violates
-- row-level security policy for table change_log".
--
-- Solution: SECURITY DEFINER so the trigger runs as the function owner
-- (postgres), bypassing RLS for the audit insert. Search_path is pinned to
-- mitigate the classic SECURITY DEFINER attack vector. EXECUTE is revoked
-- from clients since this is a trigger-only function and direct RPC calls
-- would error out anyway (the function reads tg_op / tg_table_name).
--
-- Selects on change_log remain restricted to admin/designer via the policy
-- defined in 0002_rls.sql.

create or replace function log_change() returns trigger
language plpgsql
security definer
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

revoke execute on function log_change() from public;
revoke execute on function log_change() from anon;
revoke execute on function log_change() from authenticated;
