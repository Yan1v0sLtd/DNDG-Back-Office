-- 0013_data_driven_attrs_stats.sql
-- Tier 2 + Tier 3 of "make it more flexible". Replaces hardcoded literal
-- types with config tables.
--
--   • attributes table — designers can rename / reorder / add new attrs
--   • stats table — same. The `role` column lets the simulator find the
--     HP/DMG/Eva/Res/Range stats regardless of slug. role='other' attaches
--     advisory stats that show up in MS/BP if weighted but aren't used by
--     simulator combat math.
--   • heroes.attribute_values — JSONB keyed by attribute slug, replacing
--     the inline columns
--   • attribute_coefficients — references attribute_id + produces_stat_id
--     (FKs) so an attribute can produce ANY stat, not just the
--     historically-mapped one.
--   • stat_weights — references stat_id (FK)
--
-- Behavior is preserved on first load: 5 attrs and 5 stats are seeded for
-- every env from the previous fixed sets; produces_stat_id backfills from
-- the previously-implicit code mapping.

-- 1. attributes
create table attributes (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  slug text not null,
  display_name text not null,
  position int not null,
  default_value numeric not null default 0,
  min_value numeric not null default 0,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (env_id, slug),
  unique (env_id, position)
);
create trigger attributes_touch before update on attributes
  for each row execute function touch_updated_at();
create trigger attributes_log after insert or update or delete on attributes
  for each row execute function log_change();
alter table attributes enable row level security;
create policy attrs_select on attributes for select to authenticated using (true);
create policy attrs_admin_write on attributes for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- 2. stats
create table stats (
  id uuid primary key default gen_random_uuid(),
  env_id uuid not null references environments(id) on delete cascade,
  slug text not null,
  display_name text not null,
  unit_label text,
  role text not null check (role in ('hp','dmg','evasion','resilience','range','other')),
  position int not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (env_id, slug),
  unique (env_id, position)
);
create trigger stats_touch before update on stats
  for each row execute function touch_updated_at();
create trigger stats_log after insert or update or delete on stats
  for each row execute function log_change();
alter table stats enable row level security;
create policy stats_select on stats for select to authenticated using (true);
create policy stats_admin_write on stats for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- 3. Seed
insert into attributes (env_id, slug, display_name, position, default_value, min_value)
select e.id, t.slug, t.display_name, t.position, t.default_value, t.min_value
from environments e
cross join (values
  ('vitality',   'Vitality',   1, 0, 0),
  ('might',      'Might',      2, 0, 0),
  ('range',      'Range',      3, 1, 1),
  ('haste',      'Haste',      4, 0, 0),
  ('resilience', 'Resilience', 5, 0, 0)
) as t(slug, display_name, position, default_value, min_value)
on conflict (env_id, slug) do nothing;

insert into stats (env_id, slug, display_name, unit_label, role, position)
select e.id, t.slug, t.display_name, t.unit_label, t.role, t.position
from environments e
cross join (values
  ('hp',             'HP',         null::text, 'hp',         1),
  ('dmg',            'DMG',        null::text, 'dmg',        2),
  ('range',          'Range',      null::text, 'range',      3),
  ('evasion_pct',    'Evasion',    '%'::text,  'evasion',    4),
  ('resilience_pct', 'Resilience', '%'::text,  'resilience', 5)
) as t(slug, display_name, unit_label, role, position)
on conflict (env_id, slug) do nothing;

-- 4. heroes: convert inline columns → JSONB attribute_values
alter table heroes add column attribute_values jsonb not null default '{}';
update heroes set attribute_values = jsonb_build_object(
  'vitality',   vitality,
  'might',      might,
  'range',      range,
  'haste',      haste,
  'resilience', resilience
);
alter table heroes
  drop column vitality,
  drop column might,
  drop column range,
  drop column haste,
  drop column resilience;

-- 5. attribute_coefficients: replace slug enum with FKs
alter table attribute_coefficients add column attribute_id uuid;
alter table attribute_coefficients add column produces_stat_id uuid;

update attribute_coefficients ac
set attribute_id = a.id
from attributes a
where a.env_id = ac.env_id and a.slug = ac.attribute;

update attribute_coefficients ac
set produces_stat_id = s.id
from stats s
where s.env_id = ac.env_id and s.slug = case ac.attribute
  when 'vitality'   then 'hp'
  when 'might'      then 'dmg'
  when 'range'      then 'range'
  when 'haste'      then 'evasion_pct'
  when 'resilience' then 'resilience_pct'
end;

alter table attribute_coefficients drop constraint if exists attribute_coefficients_attribute_check;
alter table attribute_coefficients drop constraint if exists attribute_coefficients_env_id_attribute_key;
alter table attribute_coefficients drop column attribute;

alter table attribute_coefficients alter column attribute_id set not null;
alter table attribute_coefficients alter column produces_stat_id set not null;
alter table attribute_coefficients add constraint attribute_coefficients_attribute_id_fkey
  foreign key (attribute_id) references attributes(id) on delete cascade;
alter table attribute_coefficients add constraint attribute_coefficients_produces_stat_id_fkey
  foreign key (produces_stat_id) references stats(id) on delete cascade;
alter table attribute_coefficients add constraint attribute_coefficients_env_attr_unique
  unique (env_id, attribute_id);

-- 6. stat_weights: replace slug enum with FK
alter table stat_weights add column stat_id uuid;
update stat_weights sw set stat_id = s.id
from stats s
where s.env_id = sw.env_id and s.slug = sw.stat;

alter table stat_weights drop constraint if exists stat_weights_stat_check;
alter table stat_weights drop constraint if exists stat_weights_env_id_stat_key;
alter table stat_weights drop column stat;

alter table stat_weights alter column stat_id set not null;
alter table stat_weights add constraint stat_weights_stat_id_fkey
  foreign key (stat_id) references stats(id) on delete cascade;
alter table stat_weights add constraint stat_weights_env_stat_unique
  unique (env_id, stat_id);
