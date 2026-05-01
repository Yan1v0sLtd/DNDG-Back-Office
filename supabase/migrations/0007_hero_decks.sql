-- 0007_hero_decks.sql
-- Phase 3 — hero deck composition.
-- Per GDD soft launch: 10 cards = 5 role-specific (matching hero's combat role)
-- + 5 general. Slots 1..5 are role-specific, 6..10 are general — by convention,
-- enforced in the app. The DB enforces uniqueness and slot range only.

create table hero_decks (
  id uuid primary key default gen_random_uuid(),
  hero_id uuid not null references heroes(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  slot int not null check (slot between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hero_id, slot),
  unique (hero_id, card_id)
);
create index hero_decks_hero_idx on hero_decks (hero_id);
create trigger hero_decks_touch before update on hero_decks
  for each row execute function touch_updated_at();

alter table hero_decks enable row level security;
create policy hero_decks_select on hero_decks for select to authenticated using (true);
create policy hero_decks_designer_write on hero_decks for all to authenticated
  using (auth_role() in ('admin','designer'))
  with check (auth_role() in ('admin','designer'));

create trigger hero_decks_log after insert or update or delete on hero_decks
  for each row execute function log_change();
