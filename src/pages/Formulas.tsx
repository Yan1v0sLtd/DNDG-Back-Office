// One canonical reference for every score and formula in the system.
// Linked from the inline "How is this calculated?" expandables on the
// editors. Keep this in sync with src/lib/*-calculator.ts and the in-page
// HowCalculated blocks.

import { Formula, PageHeader, Panel } from '@/components/UI';

export function Formulas() {
  return (
    <>
      <PageHeader
        title="Formulas"
        subtitle="How every score in the system is computed. Designer-tunable values shown in italics."
      />

      <div className="space-y-4">
        <Panel title="Combat stats (from attributes)">
          <p className="text-sm text-muted mb-2">
            Each of a hero's 5 attributes converts to a combat stat via{' '}
            <em>attribute_coefficients.stat_per_point</em> (env-scoped, admin-editable).
            GDD defaults below.
          </p>
          <Formula>
{`HP             = vitality   × stat_per_point[vitality]    (5)
DMG            = might      × stat_per_point[might]       (0.5)
Range          = range      × stat_per_point[range]       (1)
Evasion %      = haste      × stat_per_point[haste]       (1.25)
Resilience %   = resilience × stat_per_point[resilience]  (2)`}
          </Formula>
          <p className="text-xs text-muted mt-2">
            Designed so 1 attribute point = 10 Mastery Score, regardless of which
            attribute is upgraded.
          </p>
        </Panel>

        <Panel title="Mastery Score (player-facing)">
          <p className="text-sm text-muted mb-2">
            Per the GDD. Aggregates combat stats with fixed weights so each
            attribute contributes 10 MS per point. Range is{' '}
            <strong>intentionally excluded</strong> — ranged heroes have lower base DMG
            to compensate, and including range would inflate their MS. Drives Mastery
            Rank thresholds and matchmaking.
          </p>
          <Formula>
{`MS = (HP × 2)
   + (DMG × 20)
   + (Evasion% × 8)
   + (Resilience% × 5)
   + (Range × 0)   ← excluded`}
          </Formula>
          <p className="text-xs text-muted mt-2">
            Weights live in <em>stat_weights.ms_weight</em>. They're admin-tunable but
            should generally NOT be changed — MS is GDD-locked.
          </p>
        </Panel>

        <Panel title="Balance Power (internal)">
          <p className="text-sm text-muted mb-2">
            The simulator's and budget system's score. Same shape as MS but uses{' '}
            <em>stat_weights.bp_weight</em> instead of <em>ms_weight</em>, so Range can
            carry real weight here without affecting the player-facing score. Includes
            the hero's deck.
          </p>
          <Formula>
{`stat_BP        = Σ stat × bp_weight[stat]
deck_BP        = Σ card_power[c] for c in hero's deck (slots 1–10)
Balance Power  = stat_BP + deck_BP`}
          </Formula>
          <p className="text-xs text-muted mt-2">
            BP is what budgets check (admin/budgets) and what the simulator's win-rate
            lines up against. It's never shown to players.
          </p>
        </Panel>

        <Panel title="Card Power">
          <p className="text-sm text-muted mb-2">
            Per-card score. Sums the power of each effect on the card, then applies
            cooldown and tier multipliers. Lower cooldown and higher tier raise power.
            <em> effect_types.pp_weight</em> and <em>card_tiers.power_multiplier</em> are
            admin-editable.
          </p>
          <Formula>
{`effect_power     = pp_weight × magnitude × max(duration_sec, 1) × target_count
total_effect_pwr = Σ effect_power
cooldown_factor  = 10 / (cooldown_sec + 1)
Card Power       = total_effect_pwr × cooldown_factor × tier_multiplier`}
          </Formula>
          <p className="text-xs text-muted mt-2">
            Why <code>max(duration_sec, 1)</code>: instant effects (duration 0) still
            have power. Why <code>10 / (cd + 1)</code>: smooth, monotonic, with no
            discontinuities; a 9-sec CD halves power vs an instant, a 19-sec CD halves
            it again.
          </p>
        </Panel>

        <Panel title="Mastery Rank">
          <p className="text-sm text-muted mb-2">
            Tier of progression. Each rank has a Mastery Score threshold (in{' '}
            <em>mastery_ranks.ms_threshold</em>) and a card tier it unlocks. Hero's
            current rank = highest rank whose threshold ≤ MS.
          </p>
        </Panel>

        <Panel title="Budget verdict">
          <p className="text-sm text-muted mb-2">
            Each budget row sets a min/max BP envelope for a (combat_role × mastery_rank)
            pair. The hero's verdict comes from comparing their total BP to that range.
          </p>
          <Formula>
{`verdict = ok        if bp_min ≤ Balance Power ≤ bp_max
        | too_low   if Balance Power < bp_min
        | too_high  if Balance Power > bp_max
        | no_budget if no row exists for (role, rank)`}
          </Formula>
        </Panel>

        <Panel title="Simulator combat model">
          <p className="text-sm text-muted mb-2">
            Discrete-time, 0.5s ticks, 30s max battle.
          </p>
          <Formula>
{`Each tick:
  1. Decay cooldowns + stun timers
  2. Apply DoTs (no evasion roll — already on target)
  3. Prune expired buffs (recompute effective stats)
  4. Move toward preferred distance:
       higher-range hero wants self.range (kite at max)
       lower-range hero wants 0 (close to melee)
       closing speed = 6 grid/s, retreating = 4 grid/s
  5. Each combatant acts (random initiative):
       pick highest-power off-cooldown card that's applicable AND in range
       else basic attack (1.0s interval) if in range
       else idle

Damage hits roll vs target Evasion%; control rolls vs Resilience%.
Verdict band: 45–55% win rate = balanced; outside = imbalanced.`}
          </Formula>
          <p className="text-xs text-muted mt-2">
            <strong>Known v1 limitations:</strong> AoE collapses to single-target in 1v1
            (target_count &gt; 1 is signal that AoE cards fit poorly in 1v1, not a bug
            to mask); knockback / slow-as-positioning / haste-as-movement are no-ops.
          </p>
        </Panel>

        <Panel title="BP recalibration (admin)">
          <p className="text-sm text-muted mb-2">
            Closes the data-driven balance loop. Take a saved sweep, fit a linear
            model on (stat_a − stat_b) and (deck_a − deck_b) against (win_rate_a − 0.5),
            then surface suggested <em>bp_weight</em> values. HP keeps its current
            weight to anchor magnitudes; other stats scale by the ratio of their
            fitted coefficient to HP's.
          </p>
          <Formula>
{`For each matchup in the sweep:
  features = [HP_a − HP_b, DMG_a − DMG_b, Eva_a − Eva_b,
              Res_a − Res_b, Range_a − Range_b, deck_a − deck_b]
  target   = win_rate_a − 0.5

w  = argmin Σ (target − features · w)²       (gradient descent)
suggested_bp_weight[stat] = w[stat] × (current_bp_weight[hp] / w[hp])`}
          </Formula>
          <p className="text-xs text-muted mt-2">
            R² near 1 = stats explain most of win rate (apply confidently). R² near 0 =
            stats don't explain win rate (deck composition / RNG dominate; don't apply
            blindly). MS weights are <strong>never</strong> modified — they're
            GDD-locked.
          </p>
        </Panel>
      </div>
    </>
  );
}
