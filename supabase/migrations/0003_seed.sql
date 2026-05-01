-- 0003_seed.sql
-- Seed dev environment with the GDD's coefficients, roles, mastery ranks, and
-- 5 starter heroes. Re-runnable via on conflict do nothing.
--
-- Note on a GDD inconsistency captured here: Tayfan's listed Resilience Rate
-- is 16% but with attribute resilience=12 the formula yields 24%. We keep the
-- attribute as 12 (per the GDD's "Attribute Rates" section); the Combat Stats
-- section's 16% is treated as a doc typo. Flag this if the design intent is
-- the other way.

insert into environments (name) values ('dev') on conflict (name) do nothing;
insert into environments (name) values ('staging') on conflict (name) do nothing;
insert into environments (name) values ('prod') on conflict (name) do nothing;

-- Helper: seed rows into one env at a time so the same INSERTs work for any
-- new environment created later (rerun this file scoped to the new env).
do $$
declare
  v_env uuid;
  v_role_hunter uuid;
  v_role_blade uuid;
  v_role_warden uuid;
  v_role_assassin uuid;
  v_role_shaman uuid;
begin
  select id into v_env from environments where name = 'dev';

  -- ─── attribute → stat conversions (GDD) ──────────────────────────────────
  insert into attribute_coefficients (env_id, attribute, stat_per_point) values
    (v_env, 'vitality',   5),     -- 1 vit  = 5 HP
    (v_env, 'might',      0.5),   -- 2 might = 1 DMG
    (v_env, 'range',      1),     -- 1 range = 1 grid unit
    (v_env, 'haste',      1.25),  -- 1 haste = 1.25% Evasion
    (v_env, 'resilience', 2)      -- 1 res   = 2% Resilience Rate
  on conflict (env_id, attribute) do nothing;

  -- ─── stat weights for MS (GDD) and Balance Power (initial guess) ─────────
  -- MS: HP×2, DMG×20, Eva%×8, Res%×5, Range×0   (range excluded per GDD)
  -- BP: same as MS but Range×5 (placeholder, tune via simulator)
  insert into stat_weights (env_id, stat, ms_weight, bp_weight) values
    (v_env, 'hp',              2,  2),
    (v_env, 'dmg',             20, 20),
    (v_env, 'evasion_pct',     8,  8),
    (v_env, 'resilience_pct',  5,  5),
    (v_env, 'range',           0,  5)
  on conflict (env_id, stat) do nothing;

  -- ─── combat roles (GDD-listed) ───────────────────────────────────────────
  insert into combat_roles (env_id, slug, display_name, description, range_kind) values
    (v_env, 'hunter',          'Hunter',          'Ranged DPS',         'ranged'),
    (v_env, 'blade-master',    'Blade Master',    'Melee DPS',          'melee'),
    (v_env, 'warden',          'Warden',          'Protection',         'melee'),
    (v_env, 'faith-assassin',  'Faith Assassin',  'Stealth/Burst',      'melee'),
    (v_env, 'storm-shaman',    'Storm Shaman',    'Spear / mid-range',  'mixed')
  on conflict (env_id, slug) do nothing;

  select id into v_role_hunter   from combat_roles where env_id = v_env and slug = 'hunter';
  select id into v_role_blade    from combat_roles where env_id = v_env and slug = 'blade-master';
  select id into v_role_warden   from combat_roles where env_id = v_env and slug = 'warden';
  select id into v_role_assassin from combat_roles where env_id = v_env and slug = 'faith-assassin';
  select id into v_role_shaman   from combat_roles where env_id = v_env and slug = 'storm-shaman';

  -- ─── mastery ranks (GDD: ranks 1–15, thresholds TBD; placeholder curve) ──
  -- Quadratic-ish curve so progression decelerates; adjust when GDD lands real numbers.
  insert into mastery_ranks (env_id, rank, ms_threshold, card_tier_unlocked) values
    (v_env, 1,  0,    'common'),
    (v_env, 2,  100,  'common'),
    (v_env, 3,  220,  'common'),
    (v_env, 4,  360,  'common'),
    (v_env, 5,  520,  'uncommon'),
    (v_env, 6,  700,  'uncommon'),
    (v_env, 7,  900,  'uncommon'),
    (v_env, 8,  1120, 'uncommon'),
    (v_env, 9,  1360, 'uncommon'),
    (v_env, 10, 1620, 'uncommon'),
    (v_env, 11, 1900, 'uncommon'),
    (v_env, 12, 2200, 'uncommon'),
    (v_env, 13, 2520, 'uncommon'),
    (v_env, 14, 2860, 'uncommon'),
    (v_env, 15, 3220, 'uncommon')
  on conflict (env_id, rank) do nothing;

  -- ─── 5 starter heroes (GDD attribute values) ─────────────────────────────
  insert into heroes (env_id, name, race, combat_role_id, description, status,
                      vitality, might, range, haste, resilience) values
    (v_env, 'Anaitis', 'Saranthian', v_role_hunter,
     'Daughter of the fallen Empire, her bow sings death. Silent as shadow, precise as moonlight.',
     'published', 12, 10, 18, 16, 9),
    (v_env, 'Darius', 'Human', v_role_blade,
     'His blades dance to curve fortune. Charming, skilled, and dangerous.',
     'published', 17, 16, 1, 10, 11),
    (v_env, 'Dawar', 'Dwarf', v_role_warden,
     'Earth Mother''s magistrate, protector of tradition, shield against chaos.',
     'published', 24, 12, 1, 8, 13),
    (v_env, 'Ishaa', 'Human', v_role_assassin,
     'Hand of Zurvan, he delivers the inevitable. Blade in the dark, deadly poison, a shadow.',
     'published', 14, 13, 1, 18, 8),
    (v_env, 'Tayfan', 'Rameh-Kin', v_role_shaman,
     'When Tayfan calls, the gale rises and thunder speaks.',
     'published', 16, 12, 2, 14, 12)
  on conflict (env_id, name) do nothing;
end $$;
