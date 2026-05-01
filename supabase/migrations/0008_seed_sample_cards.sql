-- 0008_seed_sample_cards.sql
-- Phase 3 testing seed: 5 Hunter role-specific cards + 5 general cards in dev.
-- These are throwaway placeholders so Anaitis (Hunter) has a complete deck to
-- validate the deck builder + hero BP aggregation. Designers should replace
-- or edit them once real card content is authored.

do $$
declare
  v_env uuid;
  v_role_hunter uuid;
  v_tier_common uuid;
  v_tier_uncommon uuid;
  v_card uuid;
  v_damage uuid; v_dot uuid; v_heal uuid; v_shield uuid; v_stun uuid;
  v_slow uuid; v_eva_debuff uuid; v_buff_might uuid; v_buff_haste uuid;
begin
  select id into v_env from environments where name = 'dev';
  select id into v_role_hunter from combat_roles where env_id = v_env and slug = 'hunter';
  select id into v_tier_common from card_tiers where env_id = v_env and slug = 'common';
  select id into v_tier_uncommon from card_tiers where env_id = v_env and slug = 'uncommon';

  select id into v_damage      from effect_types where env_id = v_env and slug = 'damage';
  select id into v_dot         from effect_types where env_id = v_env and slug = 'damage_over_time';
  select id into v_heal        from effect_types where env_id = v_env and slug = 'heal';
  select id into v_shield      from effect_types where env_id = v_env and slug = 'shield';
  select id into v_stun        from effect_types where env_id = v_env and slug = 'stun';
  select id into v_slow        from effect_types where env_id = v_env and slug = 'slow';
  select id into v_eva_debuff  from effect_types where env_id = v_env and slug = 'evasion_debuff';
  select id into v_buff_might  from effect_types where env_id = v_env and slug = 'buff_might';
  select id into v_buff_haste  from effect_types where env_id = v_env and slug = 'buff_haste';

  -- ─── Hunter role-specific (5) ──────────────────────────────────────────
  insert into cards (env_id, name, kind, combat_role_id, tier_id, cooldown_sec, description, status) values
    (v_env, 'Piercing Shot',  'role_specific', v_role_hunter, v_tier_common,    5, 'A high-velocity arrow that punches through armor.', 'published'),
    (v_env, 'Hunter''s Mark', 'role_specific', v_role_hunter, v_tier_common,    6, 'Mark a target — they take more damage and lose evasion.', 'published'),
    (v_env, 'Volley',         'role_specific', v_role_hunter, v_tier_uncommon, 10, 'Fan of arrows. Hits up to 3 enemies in a cone.', 'published'),
    (v_env, 'Steady Aim',     'role_specific', v_role_hunter, v_tier_common,    7, 'Charged shot — lower CD, higher damage.', 'published'),
    (v_env, 'Hawk''s Eye',    'role_specific', v_role_hunter, v_tier_uncommon, 12, 'Empower next 3 attacks with bonus might.', 'published')
  on conflict (env_id, name) do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Piercing Shot';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 12, 0, 'enemy', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Hunter''s Mark';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_eva_debuff, 15, 6, 'enemy', 1, 0),
    (v_card, v_dot,        2,  6, 'enemy', 1, 1)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Volley';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 7, 0, 'aoe_enemy', 3, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Steady Aim';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_damage, 18, 0, 'enemy', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Hawk''s Eye';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_buff_might, 4, 8, 'self', 1, 0)
  on conflict do nothing;

  -- ─── General (5) ───────────────────────────────────────────────────────
  insert into cards (env_id, name, kind, combat_role_id, tier_id, cooldown_sec, description, status) values
    (v_env, 'Quick Step',       'general', null, v_tier_common,    5, 'Brief haste burst. Disengage or chase.', 'published'),
    (v_env, 'Resolve',          'general', null, v_tier_common,    8, 'Brace yourself — gain temporary resilience.', 'published'),
    (v_env, 'Battle Cry',       'general', null, v_tier_uncommon, 12, 'Rally — boost own might and stagger nearest enemy.', 'published'),
    (v_env, 'Tactical Retreat', 'general', null, v_tier_uncommon, 11, 'Drop a slow field on enemies, gain a small shield.', 'published'),
    (v_env, 'Field Aid',        'general', null, v_tier_common,    7, 'Quick self-heal.', 'published')
  on conflict (env_id, name) do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Quick Step';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_buff_haste, 4, 4, 'self', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Resolve';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_shield, 25, 4, 'self', 1, 0)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Battle Cry';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_buff_might, 3,    6,    'self',  1, 0),
    (v_card, v_stun,       0.75, 0.75, 'enemy', 1, 1)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Tactical Retreat';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_slow,   30, 4, 'aoe_enemy', 3, 0),
    (v_card, v_shield, 20, 4, 'self',      1, 1)
  on conflict do nothing;

  select id into v_card from cards where env_id = v_env and name = 'Field Aid';
  insert into card_effects (card_id, effect_type_id, magnitude, duration_sec, target_type, target_count, position) values
    (v_card, v_heal, 30, 0, 'self', 1, 0)
  on conflict do nothing;
end $$;
