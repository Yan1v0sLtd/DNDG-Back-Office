// One canonical reference for every score and formula in the system.
// Linked from the inline "How is this calculated?" expandables on the
// editors. Reads LIVE values from the env's config so designers can see
// the real numbers their formulas use, not seed-time defaults.

import { Link } from 'react-router-dom';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { Badge, Formula, PageHeader, Panel } from '@/components/UI';
import type { Attribute, Stat } from '@/types/database';

export function Formulas() {
  const { currentEnv } = useEnvironment();
  const { bundle, loading } = useConfigBundle(currentEnv?.id ?? null);

  if (!currentEnv) return null;

  const coef = (a: Attribute) =>
    bundle?.coefficients.find((c) => c.attribute === a)?.stat_per_point ?? '?';
  const ms = (s: Stat) =>
    bundle?.statWeights.find((w) => w.stat === s)?.ms_weight ?? '?';
  const bp = (s: Stat) =>
    bundle?.statWeights.find((w) => w.stat === s)?.bp_weight ?? '?';

  return (
    <>
      <PageHeader
        title="Formulas"
        subtitle={`${currentEnv.name} environment · live values from your config tables`}
      />

      {loading ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : (
        <div className="space-y-4">
          <Panel
            title="Combat stats (from attributes)"
            actions={<Badge>configurable</Badge>}
          >
            <p className="text-sm text-muted mb-2">
              Each attribute converts to a combat stat via{' '}
              <code>attribute_coefficients.stat_per_point</code>. Live values for{' '}
              <strong>{currentEnv.name}</strong> below — edit at{' '}
              <Link to="/admin/coefficients" className="text-accent underline">
                Admin → Coefficients
              </Link>.
            </p>
            <Formula>
{`HP             = vitality   × ${coef('vitality')}
DMG            = might      × ${coef('might')}
Range          = range      × ${coef('range')}
Evasion %      = haste      × ${coef('haste')}
Resilience %   = resilience × ${coef('resilience')}`}
            </Formula>
            <p className="text-xs text-muted mt-2">
              GDD design: 1 attribute point = 10 MS regardless of which attribute,
              so these coefficients should generally stay in proportion to the MS
              weights below.
            </p>
          </Panel>

          <Panel
            title="Mastery Score (player-facing)"
            actions={<Badge>GDD-locked</Badge>}
          >
            <p className="text-sm text-muted mb-2">
              Aggregates combat stats with fixed weights so each attribute
              contributes 10 MS per point. Range is excluded by design — ranged
              heroes have lower base DMG to compensate. Drives Mastery Rank
              thresholds and matchmaking. Edit the weights at{' '}
              <Link to="/admin/coefficients" className="text-accent underline">
                Admin → Coefficients
              </Link> if the GDD changes; otherwise leave alone.
            </p>
            <Formula>
{`MS = (HP × ${ms('hp')})
   + (DMG × ${ms('dmg')})
   + (Evasion% × ${ms('evasion_pct')})
   + (Resilience% × ${ms('resilience_pct')})
   + (Range × ${ms('range')})    ← typically 0 per GDD`}
            </Formula>
          </Panel>

          <Panel
            title="Balance Power (internal)"
            actions={<Badge>configurable</Badge>}
          >
            <p className="text-sm text-muted mb-2">
              Internal score for the simulator and budget system. Same shape as MS
              but uses <code>bp_weight</code>, so Range can carry real weight here.
              Includes the hero's deck.
            </p>
            <Formula>
{`stat_BP = (HP × ${bp('hp')})
        + (DMG × ${bp('dmg')})
        + (Evasion% × ${bp('evasion_pct')})
        + (Resilience% × ${bp('resilience_pct')})
        + (Range × ${bp('range')})

deck_BP        = Σ Card Power across deck (slots 1–10)
Balance Power  = stat_BP + deck_BP`}
            </Formula>
            <p className="text-xs text-muted mt-2">
              Auto-tune via{' '}
              <Link to="/admin/recalibrate" className="text-accent underline">
                Admin → Recalibrate
              </Link>{' '}
              once you have saved sweep data.
            </p>
          </Panel>

          <Panel title="Card Power" actions={<Badge>configurable</Badge>}>
            <p className="text-sm text-muted mb-2">
              Per-card score. Sums effect contributions, then applies cooldown and
              tier multipliers. Lower CD and higher tier raise power. Edit{' '}
              <code>effect_types.pp_weight</code> and{' '}
              <code>card_tiers.power_multiplier</code> at{' '}
              <Link to="/admin/catalog" className="text-accent underline">
                Admin → Catalog
              </Link>.
            </p>
            <Formula>
{`effect_power     = pp_weight × magnitude
                 × max(duration_sec, 1)
                 × target_count
total_effect_pwr = Σ effect_power
cooldown_factor  = 10 / (cooldown_sec + 1)
Card Power       = total_effect_pwr × cooldown_factor × tier_multiplier`}
            </Formula>
          </Panel>

          <Panel title="Mastery Rank" actions={<Badge>configurable</Badge>}>
            <p className="text-sm text-muted">
              15 rank tiers, each with an MS threshold. Hero's current rank =
              highest rank whose <code>ms_threshold ≤ MS</code>. Each rank can
              also unlock a card tier. Edit thresholds via the{' '}
              <code>mastery_ranks</code> table (UI: Supabase Studio for now;
              admin page in a future phase).
            </p>
          </Panel>

          <Panel title="Budget verdict" actions={<Badge>configurable</Badge>}>
            <p className="text-sm text-muted mb-2">
              Each budget row sets a min/max BP envelope for a (combat_role ×
              mastery_rank) pair. Verdict comes from the hero's total BP vs that
              range. Manage at{' '}
              <Link to="/admin/budgets" className="text-accent underline">
                Admin → Budgets
              </Link>.
            </p>
            <Formula>
{`verdict = ok        if bp_min ≤ Balance Power ≤ bp_max
        | too_low   if Balance Power < bp_min
        | too_high  if Balance Power > bp_max
        | no_budget if no row exists for (role, rank)`}
            </Formula>
          </Panel>

          <Panel title="Simulator combat model" actions={<Badge tone="warn">partly hardcoded</Badge>}>
            <p className="text-sm text-muted mb-2">
              Discrete-time, 0.5s ticks, 30s max battle.{' '}
              <strong>These timing constants currently live in code</strong> —
              see "What's still hardcoded" below.
            </p>
            <Formula>
{`Each tick:
  1. Decay cooldowns + stun timers
  2. Apply DoTs
  3. Prune expired buffs (recompute effective stats)
  4. Move toward preferred distance:
       higher-range hero wants self.range (kite at max)
       lower-range hero wants 0 (close to melee)
       closing 6 grid/s, retreating 4 grid/s
  5. Each combatant acts (random initiative):
       pick highest-power off-cooldown card that's applicable AND in range
       else basic attack (1.0s interval) if in range
       else idle

Damage rolls vs Evasion%; control rolls vs Resilience%.
Verdict band: 45–55% win rate = balanced.`}
            </Formula>
          </Panel>

          <Panel title="BP recalibration" actions={<Badge>configurable</Badge>}>
            <p className="text-sm text-muted mb-2">
              Linear regression on saved sweep cells. Features: stat differences +
              deck-power difference. Target: <code>win_rate_a − 0.5</code>.
              Suggested <code>bp_weight</code> values are HP-anchored. Run from{' '}
              <Link to="/admin/recalibrate" className="text-accent underline">
                Admin → Recalibrate
              </Link>.
            </p>
          </Panel>

          <Panel title="What's still hardcoded" actions={<Badge tone="warn">tech debt</Badge>}>
            <p className="text-sm text-muted mb-2">
              Most numbers in this app live in DB tables and are admin-editable.
              These don't yet — adjusting any of them requires a code change:
            </p>
            <ul className="text-xs text-muted space-y-1.5 list-disc list-inside">
              <li>
                <strong>The set of attributes</strong> (vitality, might, range,
                haste, resilience) and the set of stats (hp, dmg, eva%, res%,
                range). Adding a new attribute (e.g., "Cunning") requires a DB
                migration + calculator generalization. Coefficients of existing
                attributes ARE editable.
              </li>
              <li>
                <strong>Which attribute maps to which stat.</strong> Vitality
                always feeds HP; might always feeds DMG; etc. This is enforced
                in the calculator code.
              </li>
              <li>
                <strong>Simulator timing constants:</strong>{' '}
                <code>TICK_SEC=0.5</code>, <code>MAX_SEC=30</code>,{' '}
                <code>BASIC_ATTACK_CD=1.0</code>,{' '}
                <code>CLOSE_SPEED=6</code>, <code>RETREAT_SPEED=4</code>. These
                could be moved to a <code>simulator_config</code> table —
                ask if you want that.
              </li>
              <li>
                <strong>Effect-type behavior.</strong> Adding a new{' '}
                <code>effect_types</code> row from the catalog admin makes it
                pickable on cards, but the simulator only knows how to resolve
                the slugs it's coded against (damage, dot, heal, shield, stun,
                slow, evasion_debuff, knockback, buff_might/haste/resilience).
                A truly new mechanic needs a code change.
              </li>
              <li>
                <strong>Verdict bands</strong> (45–55% balanced, 30s max battle).
                Coded thresholds in the simulator and sweep pages.
              </li>
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
