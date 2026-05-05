// Reference page — every score and formula in the system, rendered from
// the env's live config so designers see real numbers, not GDD seeds.

import { Link } from 'react-router-dom';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { Badge, Formula, PageHeader, Panel } from '@/components/UI';

export function Formulas() {
  const { currentEnv } = useEnvironment();
  const { bundle, loading } = useConfigBundle(currentEnv?.id ?? null);

  if (!currentEnv) return null;

  // Pretty-print the live attribute → stat mapping from the coefficient table.
  const statLines = bundle
    ? bundle.attributes
        .map((a) => {
          const c = bundle.coefficients.find((x) => x.attribute_id === a.id);
          if (!c) return `${pad(a.display_name, 14)} = ${a.slug.padEnd(10)}× (no coefficient)`;
          const stat = bundle.stats.find((s) => s.id === c.produces_stat_id);
          if (!stat) return `${pad(a.display_name, 14)} = ${a.slug.padEnd(10)}× ${c.stat_per_point}  (stat missing)`;
          const unit = stat.unit_label ? `${stat.unit_label}` : '';
          return `${pad(stat.display_name + unit, 14)} = ${a.slug.padEnd(10)}× ${c.stat_per_point}`;
        })
        .join('\n')
    : '';

  const msLines = bundle
    ? bundle.statWeights
        .map((w) => {
          const stat = bundle.stats.find((s) => s.id === w.stat_id);
          return `   + (${(stat?.display_name ?? '?').padEnd(14)}× ${w.ms_weight})`;
        })
        .join('\n')
    : '';

  const bpLines = bundle
    ? bundle.statWeights
        .map((w) => {
          const stat = bundle.stats.find((s) => s.id === w.stat_id);
          return `   + (${(stat?.display_name ?? '?').padEnd(14)}× ${w.bp_weight})`;
        })
        .join('\n')
    : '';

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
              Each attribute converts to a stat via the{' '}
              <code>attribute_coefficients</code> table. Live mapping below — edit at{' '}
              <Link to="/admin/coefficients" className="text-accent underline">
                Admin → Coefficients
              </Link>{' '}
              and add new attributes/stats at{' '}
              <Link to="/admin/catalog" className="text-accent underline">
                Admin → Catalog
              </Link>.
            </p>
            <Formula>{statLines}</Formula>
            <p className="text-xs text-muted mt-2">
              Designed so 1 attribute point = 10 MS regardless of which attribute (when
              the coefficients and weights are kept in proportion).
            </p>
          </Panel>

          <Panel
            title="Mastery Score (player-facing)"
            actions={<Badge>GDD-locked</Badge>}
          >
            <p className="text-sm text-muted mb-2">
              Aggregates stats with the <code>ms_weight</code> column. Range is
              typically 0 per GDD design. Drives Mastery Rank thresholds.
            </p>
            <Formula>{`MS = 0
${msLines}`}</Formula>
          </Panel>

          <Panel
            title="Balance Power (internal)"
            actions={<Badge>configurable</Badge>}
          >
            <p className="text-sm text-muted mb-2">
              Internal score for the simulator and budget system. Same shape but uses{' '}
              <code>bp_weight</code>, plus the deck contribution.
            </p>
            <Formula>{`stat_BP = 0
${bpLines}

deck_BP        = Σ Card Power across deck
Balance Power  = stat_BP + deck_BP`}</Formula>
            <p className="text-xs text-muted mt-2">
              Auto-tune via{' '}
              <Link to="/admin/recalibrate" className="text-accent underline">
                Admin → Recalibrate
              </Link>.
            </p>
          </Panel>

          <Panel title="Card Power" actions={<Badge>configurable</Badge>}>
            <p className="text-sm text-muted mb-2">
              Per-card score. Sums effect contributions, then applies cooldown and
              tier multipliers.
            </p>
            <Formula>
{`effect_power     = pp_weight × magnitude
                 × max(duration_sec, 1)
                 × target_count
total_effect_pwr = Σ effect_power
cooldown_factor  = 10 / (cooldown_sec + 1)
Card Power       = total_effect_pwr × cooldown_factor × tier_multiplier`}
            </Formula>
            <p className="text-xs text-muted mt-2">
              Tunable in <Link to="/admin/catalog" className="text-accent underline">
                Admin → Catalog
              </Link> (Effect Types + Card Tiers).
            </p>
          </Panel>

          <Panel title="Simulator combat model" actions={<Badge>configurable</Badge>}>
            <p className="text-sm text-muted mb-2">
              Live values from <Link to="/admin/simulator" className="text-accent underline">Admin → Simulator</Link>:
              tick {bundle?.simulatorConfig.tick_sec}s, max battle{' '}
              {bundle?.simulatorConfig.max_battle_sec}s, basic-attack CD{' '}
              {bundle?.simulatorConfig.basic_attack_cd}s, close{' '}
              {bundle?.simulatorConfig.close_speed}/s, retreat{' '}
              {bundle?.simulatorConfig.retreat_speed}/s, verdict band{' '}
              {bundle?.simulatorConfig.verdict_band_min} – {bundle?.simulatorConfig.verdict_band_max}.
            </p>
            <Formula>
{`Each tick:
  1. Decay cooldowns + stun timers
  2. Apply DoTs
  3. Prune expired buffs (recompute effective stats)
  4. Move toward preferred distance:
       higher-range hero kites at self.range
       lower-range hero closes to 0
  5. Each combatant acts (random initiative):
       pick best off-cooldown card that's applicable AND in range
       else basic attack if in range
       else idle

Damage hits roll vs the stat with role='evasion' (%).
Control rolls vs the stat with role='resilience' (%).
Verdict: balanced if win_rate within configured band.`}
            </Formula>
          </Panel>

          <Panel title="Budget verdict" actions={<Badge>configurable</Badge>}>
            <p className="text-sm text-muted mb-2">
              Each budget row sets a min/max BP envelope for a (combat_role ×
              mastery_rank) pair. Manage at{' '}
              <Link to="/admin/budgets" className="text-accent underline">
                Admin → Budgets
              </Link>.
            </p>
            <Formula>
{`verdict = ok        if bp_min ≤ Balance Power ≤ bp_max
        | too_low   if Balance Power < bp_min
        | too_high  if Balance Power > bp_max
        | no_budget if no row exists`}
            </Formula>
          </Panel>

          <Panel title="What's still hardcoded" actions={<Badge tone="warn">tech debt</Badge>}>
            <ul className="text-xs text-muted space-y-1.5 list-disc list-inside">
              <li>
                <strong>Stat roles in the simulator.</strong> The simulator's combat
                math uses the stats with roles <code>hp</code>, <code>dmg</code>,
                <code>evasion</code>, <code>resilience</code>, <code>range</code>.
                You can name those stats anything; you can add stats with role{' '}
                <code>other</code> that contribute to MS/BP. Inventing a new role
                (e.g., 'mana') needs code.
              </li>
              <li>
                <strong>Effect-type behavior.</strong> Catalog adds let new effect_type
                rows appear on cards, but the simulator only resolves effect slugs
                it's coded against (damage, dot, heal, shield, stun, slow,
                evasion_debuff, knockback, buff_might/haste/resilience). Genuinely
                new mechanics need a switch case.
              </li>
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}

function pad(s: string, n: number) {
  if (s.length >= n) return s;
  return s + ' '.repeat(n - s.length);
}
