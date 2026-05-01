-- 0009_seed_remaining_role_cards.sql
-- Phase 4 prerequisite: seed 5 role-specific cards for each of the 4 roles
-- that didn't have any (Blade Master, Warden, Faith Assassin, Storm Shaman).
-- This brings every starter hero to 5/5 role-specific cards available so
-- their decks can be filled and Phase 4 budgets have multiple calibration
-- points instead of just Anaitis.
--
-- Same caveat as 0008: these are throwaway placeholders. Effect magnitudes
-- are picked to feel role-flavored but are not GDD-canonical.

do $$
declare
  v_env uuid;
  v_role_blade uuid;
  v_role_warden uuid;
  v_role_assassin uuid;
  v_role_shaman uuid;
  v_tier_common uuid;
  v_tier_uncommon uuid;
  v_card uuid;
  v_damage uuid; v_dot uuid; v_heal uuid; v_shield uuid; v_stun uuid;
  v_slow uuid; v_eva_debuff uuid; v_knockback uuid;
  v_buff_might uuid; v_buff_haste uuid; v_buff_res uuid;
begin
  select id into v_env from environments where name = 'dev';
  select id into v_role_blade    from combat_roles where env_id = v_env and slug = 'blade-master';
  select id into v_role_warden   from combat_roles where env_id = v_env and slug = 'warden';
  select id into v_role_assassin from combat_roles where env_id = v_env and slug = 'faith-assassin';
  select id into v_role_shaman   from combat_roles where env_id = v_env and slug = 'storm-shaman';
  select id into v_tier_common   from card_tiers where env_id = v_env and slug = 'common';
  select id into v_tier_uncommon from card_tiers where env_id = v_env and slug = 'uncommon';

  select id into v_damage      from effect_types where env_id = v_env and slug = 'damage';
  select id into v_dot         from effect_types where env_id = v_env and slug = 'damage_over_time';
  select id into v_heal        from effect_types where env_id = v_env and slug = 'heal';
  select id into v_shield      from effect_types where env_id = v_env and slug = 'shield';
  select id into v_stun        from effect_types where env_id = v_env and slug = 'stun';
  select id into v_slow        from effect_types where env_id = v_env and slug = 'slow';
  select id into v_eva_debuff  from effect_types where env_id = v_env and slug = 'evasion_debuff';
  select id into v_knockback   from effect_types where env_id = v_env and slug = 'knockback';
  select id into v_buff_might  from effect_types where env_id = v_env and slug = 'buff_might';
  select id into v_buff_haste  from effect_types where env_id = v_env and slug = 'buff_haste';
  select id into v_buff_res    from effect_types where env_id = v_env and slug = 'buff_resilience';

  -- ─── Blade Master (melee DPS) ──────────────────────────────────────────
  insert into cards (env_id, name, kind, combat_role_id, tier_id, cooldown_sec, description, status) values
    (v_env, 'Riposte',     'role_specific', v_role_blade, v_tier_common,    4, 'Quick counter-strike timed to an enemy''s opening.', 'published'),
    (v_env, 'Dual Strike', 'role_specific', v_role_blade, v_tier_common,    6, 'Twin blades carve a deep wound.', 'published'),
    (v_env, 'Deflect',     'role_specific', v_role_blade, v_tier_common,    5, 'Read the blade — turn it aside, briefly armored.', 'published'),
    (v_env, 'Whirlwind',   'role_specific', v_role_blade, v_tier_uncommon, 10, 'Spin through the line, slashing all in reach.', 'published'),
    (v_env, 'Killing Edge','role_specific', v_role_blade, v_tier_uncommon, 12, 'A precise opening blow — staggers the foe.', 'published')
  on conflict (env_id, name) do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Riposte';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 10, 0, 'enemy', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Dual Strike';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 14, 0, 'enemy', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Deflect';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_shield, 20, 3, 'self', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Whirlwind';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 8, 0, 'aoe_enemy', 3, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Killing Edge';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 22,  0,   'enemy', 1, 0),
    (v_card, v_stun,   0.5, 0.5, 'enemy', 1, 1)
  on conflict do nothing;

  -- ─── Warden (protection / front line) ──────────────────────────────────
  insert into cards (env_id, name, kind, combat_role_id, tier_id, cooldown_sec, description, status) values
    (v_env, 'Shield Bash',           'role_specific', v_role_warden, v_tier_common,    6, 'Crash the shield boss into a foe — dazes briefly.', 'published'),
    (v_env, 'Bulwark',               'role_specific', v_role_warden, v_tier_common,    7, 'Set the shield. Take the blow.', 'published'),
    (v_env, 'Taunt',                 'role_specific', v_role_warden, v_tier_common,    5, 'Bait the foe — open their guard for the line.', 'published'),
    (v_env, 'Sanctified Ground',     'role_specific', v_role_warden, v_tier_uncommon, 12, 'Bless the earth — wounds knit beneath your banner.', 'published'),
    (v_env, 'Earth Mother''s Wrath', 'role_specific', v_role_warden, v_tier_uncommon, 11, 'Stone cracks, the line breaks. Push them back.', 'published')
  on conflict (env_id, name) do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Shield Bash';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 6,   0,   'enemy', 1, 0),
    (v_card, v_stun,   0.5, 0.5, 'enemy', 1, 1)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Bulwark';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_shield, 35, 4, 'self', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Taunt';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_eva_debuff, 10, 5, 'enemy', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Sanctified Ground';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_heal, 15, 0, 'aoe_ally', 3, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Earth Mother''s Wrath';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage,    10, 0, 'aoe_enemy', 3, 0),
    (v_card, v_knockback, 1,  0, 'aoe_enemy', 3, 1)
  on conflict do nothing;

  -- ─── Faith Assassin (stealth / burst) ──────────────────────────────────
  insert into cards (env_id, name, kind, combat_role_id, tier_id, cooldown_sec, description, status) values
    (v_env, 'Quick Dagger',  'role_specific', v_role_assassin, v_tier_common,    4, 'A blade between the ribs. Quiet. Fast.', 'published'),
    (v_env, 'Poison Blade',  'role_specific', v_role_assassin, v_tier_common,    6, 'Coat the edge — they will not last the fight.', 'published'),
    (v_env, 'Vanish',        'role_specific', v_role_assassin, v_tier_common,    8, 'Slip into shadow. Move unseen.', 'published'),
    (v_env, 'Killing Blow',  'role_specific', v_role_assassin, v_tier_uncommon, 12, 'The strike that ends the duel.', 'published'),
    (v_env, 'Shadow Strike', 'role_specific', v_role_assassin, v_tier_uncommon, 10, 'Strike from the dark — they will not see the next.', 'published')
  on conflict (env_id, name) do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Quick Dagger';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 9, 0, 'enemy', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Poison Blade';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_dot, 3, 5, 'enemy', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Vanish';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_buff_haste, 6, 4, 'self', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Killing Blow';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 20, 0, 'enemy', 1, 0),
    (v_card, v_stun,   1,  1, 'enemy', 1, 1)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Shadow Strike';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage,      15, 0, 'enemy', 1, 0),
    (v_card, v_eva_debuff,  20, 4, 'enemy', 1, 1)
  on conflict do nothing;

  -- ─── Storm Shaman (mid-range, spear) ───────────────────────────────────
  insert into cards (env_id, name, kind, combat_role_id, tier_id, cooldown_sec, description, status) values
    (v_env, 'Lightning Bolt', 'role_specific', v_role_shaman, v_tier_common,    5, 'Vayu''s answer to those who will not yield.', 'published'),
    (v_env, 'Thunder Clap',   'role_specific', v_role_shaman, v_tier_common,    7, 'Stagger the line — the storm crashes wide.', 'published'),
    (v_env, 'Storm Shield',   'role_specific', v_role_shaman, v_tier_common,    8, 'Wind wrapped tight around her — strikes glance away.', 'published'),
    (v_env, 'Gale Force',     'role_specific', v_role_shaman, v_tier_uncommon, 11, 'A wall of wind drags them down.', 'published'),
    (v_env, 'Tempest',        'role_specific', v_role_shaman, v_tier_uncommon, 12, 'The storm she calls does not stop until they fall.', 'published')
  on conflict (env_id, name) do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Lightning Bolt';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 11, 0, 'enemy', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Thunder Clap';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 6, 0, 'aoe_enemy', 3, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Storm Shield';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_shield, 28, 4, 'self', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Gale Force';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 5,  0, 'aoe_enemy', 3, 0),
    (v_card, v_slow,   30, 5, 'aoe_enemy', 3, 1)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Tempest';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_dot, 4, 4, 'aoe_enemy', 3, 0)
  on conflict do nothing;
end $$;
