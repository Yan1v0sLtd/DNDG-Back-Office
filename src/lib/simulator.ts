// Phase 5 — pairwise combat simulator.
//
// PURE FUNCTIONS. No React, no Supabase, no I/O. Callers pass in fully-
// resolved hero data (stats + deck cards + effects) and get back a result.
//
// V2 — positioning model (Phase 5b):
//   • Combatants start at distance = max(rangeA, rangeB). Whoever has the
//     longer range gets a free firing window before the other can engage.
//   • Both combatants close at CLOSING_SPEED grid/sec each tick (no kiting
//     in v1 — once melee, both stay engaged). Realistic enough; designers
//     get a clear range advantage signal without infinite-kite degenerate
//     dynamics.
//   • Attacks (basic + enemy-targeting cards) gated by attacker.range >=
//     current_distance. Self-targeted cards (heal, shield, buffs) ignore
//     range. DoTs already in flight keep ticking regardless.
//
// Still NOT modeled (intentional, documented in CLAUDE.md):
//   • Kiting / asymmetric speeds. Both close at the same rate.
//   • Haste's effect on movement speed (GDD soft-launch hint).
//   • Multi-target: target_count > 1 collapses to 1 (no second target in
//     1v1). AoE cards under-perform here — useful signal.
//   • Knockback, slow-as-positioning, LOS, terrain.
//
// Combat model:
//   • 0.5s tick; 30s max battle.
//   • Each tick: decay cooldowns/effects → apply DoTs/buff expiry → each
//     combatant acts (if not stunned).
//   • Action choice: highest-card-power among off-cooldown applicable cards;
//     fallback to a basic attack (1.0s base interval) for raw `effective_dmg`.
//   • Damage rolls vs target evasion%. Control rolls vs target resilience%.
//   • Win = opponent HP ≤ 0; otherwise on timeout, higher HP% wins, tied = draw.

import type { Card, CardEffect, EffectType, Hero } from '@/types/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CombatantInput {
  hero: Hero;
  derived: {
    hp: number;
    dmg: number;
    evasion_pct: number;
    resilience_pct: number;
    range: number;
  };
  deck: { card: Card; effects: CardEffect[] }[];
}

export interface SimResult {
  winner: 'a' | 'b' | 'draw';
  ttk_sec: number; // when first hero died, or max time on draw/timeout
  damage_a_to_b: number;
  damage_b_to_a: number;
}

export interface BatchResult {
  runs: number;
  win_rate_a: number;
  win_rate_b: number;
  draw_rate: number;
  avg_ttk_sec: number;
  avg_dmg_a_to_b: number;
  avg_dmg_b_to_a: number;
  // Verdict: closer to 50% = more balanced. We flag outside 45–55%.
  verdict: 'balanced' | 'a_favored' | 'b_favored';
}

interface State {
  hp: number;
  max_hp: number;
  dmg: number;
  evasion_pct: number;
  resilience_pct: number;
  shield: number;
  stun_remaining: number; // seconds
  basic_attack_cd: number; // 1.0s baseline
  card_cd: Map<string, number>; // cardId → seconds remaining
  dots: { dmg_per_sec: number; remaining: number }[];
  buffs: { stat: 'dmg' | 'eva' | 'res'; amount: number; remaining: number }[];
}

// ─── Engine ────────────────────────────────────────────────────────────────

const TICK_SEC = 0.5;
const MAX_SEC = 30;
const BASIC_ATTACK_CD = 1.0;
const CLOSING_SPEED = 6; // grid units per second (each combatant moves)

export function simulate(
  a: CombatantInput,
  b: CombatantInput,
  effectTypes: EffectType[],
  rng: () => number = Math.random,
): SimResult {
  const sa = newState(a);
  const sb = newState(b);
  let dmg_a_to_b = 0;
  let dmg_b_to_a = 0;
  let ttk = MAX_SEC;
  let dead: 'a' | 'b' | null = null;

  // Positioning. Higher-range hero starts at full kiting distance; both
  // close at CLOSING_SPEED. Distance closes regardless of stun (you don't
  // stop walking when stunned by your friend; also keeps the model simple).
  let distance = Math.max(a.derived.range, b.derived.range);

  for (let t = 0; t < MAX_SEC; t = round(t + TICK_SEC)) {
    // ─ phase 1: decay cooldowns + tick down stuns
    decay(sa);
    decay(sb);

    // ─ phase 2: apply DoTs (range-independent — already in flight)
    dmg_a_to_b += applyDots(sb);
    dmg_b_to_a += applyDots(sa);

    // ─ phase 3: prune expired buffs (recomputes effective stats from base)
    pruneBuffs(sa, a);
    pruneBuffs(sb, b);

    if (sa.hp <= 0 || sb.hp <= 0) {
      dead = sa.hp <= 0 ? 'a' : 'b';
      ttk = t;
      break;
    }

    // ─ phase 4: close distance (each combatant moves toward the other)
    distance = Math.max(0, distance - 2 * CLOSING_SPEED * TICK_SEC);

    // ─ phase 5: each combatant acts (if not stunned)
    const orderRoll = rng();
    const first: 'a' | 'b' = orderRoll < 0.5 ? 'a' : 'b';
    const second = first === 'a' ? 'b' : 'a';

    const dmgFirst = act(first === 'a' ? a : b, first === 'a' ? sa : sb, first === 'a' ? sb : sa, effectTypes, rng, distance);
    if (first === 'a') dmg_a_to_b += dmgFirst;
    else dmg_b_to_a += dmgFirst;

    if (sa.hp <= 0 || sb.hp <= 0) {
      dead = sa.hp <= 0 ? 'a' : 'b';
      ttk = t;
      break;
    }

    const dmgSecond = act(second === 'a' ? a : b, second === 'a' ? sa : sb, second === 'a' ? sb : sa, effectTypes, rng, distance);
    if (second === 'a') dmg_a_to_b += dmgSecond;
    else dmg_b_to_a += dmgSecond;

    if (sa.hp <= 0 || sb.hp <= 0) {
      dead = sa.hp <= 0 ? 'a' : 'b';
      ttk = t;
      break;
    }
  }

  let winner: 'a' | 'b' | 'draw';
  if (dead === 'a') winner = 'b';
  else if (dead === 'b') winner = 'a';
  else {
    const aPct = sa.hp / sa.max_hp;
    const bPct = sb.hp / sb.max_hp;
    if (Math.abs(aPct - bPct) < 0.01) winner = 'draw';
    else winner = aPct > bPct ? 'a' : 'b';
  }

  return {
    winner,
    ttk_sec: ttk,
    damage_a_to_b: round(dmg_a_to_b),
    damage_b_to_a: round(dmg_b_to_a),
  };
}

export function batch(
  a: CombatantInput,
  b: CombatantInput,
  effectTypes: EffectType[],
  runs: number,
  rng: () => number = Math.random,
): BatchResult {
  let wa = 0, wb = 0, wd = 0, ttk = 0, da = 0, db = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulate(a, b, effectTypes, rng);
    if (r.winner === 'a') wa++;
    else if (r.winner === 'b') wb++;
    else wd++;
    ttk += r.ttk_sec;
    da += r.damage_a_to_b;
    db += r.damage_b_to_a;
  }
  const win_rate_a = wa / runs;
  const win_rate_b = wb / runs;
  const draw_rate = wd / runs;
  let verdict: BatchResult['verdict'] = 'balanced';
  if (win_rate_a < 0.45) verdict = 'b_favored';
  else if (win_rate_a > 0.55) verdict = 'a_favored';
  return {
    runs,
    win_rate_a,
    win_rate_b,
    draw_rate,
    avg_ttk_sec: round(ttk / runs, 2),
    avg_dmg_a_to_b: round(da / runs),
    avg_dmg_b_to_a: round(db / runs),
    verdict,
  };
}

// ─── Internals ──────────────────────────────────────────────────────────────

function newState(c: CombatantInput): State {
  return {
    hp: c.derived.hp,
    max_hp: c.derived.hp,
    dmg: c.derived.dmg,
    evasion_pct: c.derived.evasion_pct,
    resilience_pct: c.derived.resilience_pct,
    shield: 0,
    stun_remaining: 0,
    basic_attack_cd: 0,
    card_cd: new Map(),
    dots: [],
    buffs: [],
  };
}

function decay(s: State) {
  s.basic_attack_cd = Math.max(0, s.basic_attack_cd - TICK_SEC);
  s.stun_remaining = Math.max(0, s.stun_remaining - TICK_SEC);
  for (const [k, v] of s.card_cd) s.card_cd.set(k, Math.max(0, v - TICK_SEC));
  for (const d of s.dots) d.remaining = Math.max(0, d.remaining - TICK_SEC);
  for (const b of s.buffs) b.remaining = Math.max(0, b.remaining - TICK_SEC);
}

// Tick DoTs on this state. Returns total damage dealt this tick.
function applyDots(s: State): number {
  let dealt = 0;
  for (const d of s.dots) {
    if (d.remaining <= 0) continue;
    const dmg = d.dmg_per_sec * TICK_SEC;
    dealt += applyDamage(s, dmg);
  }
  s.dots = s.dots.filter((d) => d.remaining > 0);
  return dealt;
}

function pruneBuffs(s: State, base: CombatantInput) {
  // Reset effective stats to base, then re-apply still-active buffs.
  s.dmg = base.derived.dmg;
  s.evasion_pct = base.derived.evasion_pct;
  s.resilience_pct = base.derived.resilience_pct;
  s.buffs = s.buffs.filter((b) => b.remaining > 0);
  for (const b of s.buffs) {
    if (b.stat === 'dmg') s.dmg += b.amount;
    else if (b.stat === 'eva') s.evasion_pct += b.amount;
    else if (b.stat === 'res') s.resilience_pct += b.amount;
  }
}

// Returns damage dealt to opponent this action.
function act(
  base: CombatantInput,
  self: State,
  opp: State,
  effectTypes: EffectType[],
  rng: () => number,
  distance: number,
): number {
  if (self.stun_remaining > 0) return 0;

  const card = pickCard(base, self, opp, effectTypes, base.derived.range, distance);
  if (card) {
    return playCard(card.card, card.effects, self, opp, effectTypes, rng);
  }
  // Basic attack — only if in range. Otherwise idle this tick.
  if (self.basic_attack_cd <= 0 && base.derived.range >= distance) {
    self.basic_attack_cd = BASIC_ATTACK_CD;
    return resolveDamage(self.dmg, self, opp, rng);
  }
  return 0;
}

function pickCard(
  base: CombatantInput,
  self: State,
  opp: State,
  effectTypes: EffectType[],
  range: number,
  distance: number,
): CombatantInput['deck'][number] | null {
  // Among off-cooldown cards that are applicable AND in range (if they
  // target the enemy), pick the one with highest static power.
  let best: CombatantInput['deck'][number] | null = null;
  let bestPower = 0;
  for (const entry of base.deck) {
    const cd = self.card_cd.get(entry.card.id) ?? 0;
    if (cd > 0) continue;
    if (!applicable(entry, self, opp, effectTypes)) continue;
    if (targetsEnemy(entry.effects) && range < distance) continue;
    const p = staticCardPower(entry.card, entry.effects, effectTypes);
    if (p > bestPower) {
      best = entry;
      bestPower = p;
    }
  }
  return best;
}

function targetsEnemy(effects: CardEffect[]): boolean {
  return effects.some(
    (e) => e.target_type === 'enemy' || e.target_type === 'aoe_enemy',
  );
}

function applicable(
  entry: CombatantInput['deck'][number],
  self: State,
  opp: State,
  effectTypes: EffectType[],
): boolean {
  // Skip heals at full HP; skip shields when shield already big; skip
  // buffs already active. Damage / control are always useful.
  for (const e of entry.effects) {
    const t = effectTypes.find((x) => x.id === e.effect_type_id);
    if (!t) continue;
    if (t.slug === 'heal' && self.hp >= self.max_hp) return false;
    if (t.slug === 'shield' && self.shield >= self.max_hp * 0.3) return false;
    if (t.slug === 'stun' && opp.stun_remaining > 0) return false;
  }
  return true;
}

function staticCardPower(
  card: Card,
  effects: CardEffect[],
  effectTypes: EffectType[],
): number {
  // Mirrors lib/card-power-calculator. Inlined to avoid the tier multiplier
  // (the simulator only wants a relative ordering, not the calibrated score).
  let total = 0;
  for (const e of effects) {
    const t = effectTypes.find((x) => x.id === e.effect_type_id);
    if (!t) continue;
    total += t.pp_weight * e.magnitude * Math.max(e.duration_sec, 1) * 1; // count = 1 in 1v1
  }
  const cd_factor = 10 / (card.cooldown_sec + 1);
  return total * cd_factor;
}

function playCard(
  card: Card,
  effects: CardEffect[],
  self: State,
  opp: State,
  effectTypes: EffectType[],
  rng: () => number,
): number {
  self.card_cd.set(card.id, card.cooldown_sec);
  let dealt = 0;
  for (const e of effects) {
    const t = effectTypes.find((x) => x.id === e.effect_type_id);
    if (!t) continue;
    const target = effectTarget(e.target_type, self, opp);
    switch (t.slug) {
      case 'damage':
        if (target === opp) dealt += resolveDamage(e.magnitude, self, opp, rng);
        break;
      case 'damage_over_time':
        if (target === opp) {
          target.dots.push({
            dmg_per_sec: e.magnitude,
            remaining: Math.max(e.duration_sec, TICK_SEC),
          });
        }
        break;
      case 'heal':
        target.hp = Math.min(target.max_hp, target.hp + e.magnitude);
        break;
      case 'shield':
        target.shield += e.magnitude;
        break;
      case 'stun':
        if (rollResist(opp, rng)) break;
        if (target === opp) opp.stun_remaining = Math.max(opp.stun_remaining, e.duration_sec || e.magnitude);
        break;
      case 'slow':
        // No positioning model → slows are silently consumed. Documented v1
        // limitation. Falls back to "we tried"; resilience still rolls so
        // designers see the resilience effect on their scores.
        rollResist(opp, rng);
        break;
      case 'evasion_debuff':
        if (rollResist(opp, rng)) break;
        if (target === opp) {
          opp.buffs.push({ stat: 'eva', amount: -e.magnitude, remaining: e.duration_sec });
        }
        break;
      case 'knockback':
        // No positioning → no-op. Documented v1 limitation.
        break;
      case 'buff_might':
        target.buffs.push({ stat: 'dmg', amount: e.magnitude, remaining: e.duration_sec });
        break;
      case 'buff_haste':
        target.buffs.push({ stat: 'eva', amount: e.magnitude * 1.25, remaining: e.duration_sec });
        break;
      case 'buff_resilience':
        target.buffs.push({ stat: 'res', amount: e.magnitude * 2, remaining: e.duration_sec });
        break;
    }
  }
  return dealt;
}

function effectTarget(targetType: string, self: State, opp: State): State {
  // self / ally → self. enemy / aoe_enemy → opp. aoe_ally → self.
  if (targetType === 'enemy' || targetType === 'aoe_enemy') return opp;
  return self;
}

function resolveDamage(amount: number, _attacker: State, defender: State, rng: () => number): number {
  // Roll evasion. evasion_pct is 0..100.
  if (rng() * 100 < defender.evasion_pct) return 0;
  let remaining = amount;
  if (defender.shield > 0) {
    const absorbed = Math.min(defender.shield, remaining);
    defender.shield -= absorbed;
    remaining -= absorbed;
  }
  defender.hp = Math.max(0, defender.hp - remaining);
  return amount; // for damage-dealt accounting we count pre-evasion intent? No, post-evasion truth.
  // (Caller treats 0 as "evaded". Above is fine.)
}

function applyDamage(defender: State, amount: number): number {
  // No evasion roll for ticking DoTs (already on-target).
  let remaining = amount;
  if (defender.shield > 0) {
    const absorbed = Math.min(defender.shield, remaining);
    defender.shield -= absorbed;
    remaining -= absorbed;
  }
  defender.hp = Math.max(0, defender.hp - remaining);
  return amount;
}

function rollResist(defender: State, rng: () => number): boolean {
  // Returns true if resisted.
  return rng() * 100 < defender.resilience_pct;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
