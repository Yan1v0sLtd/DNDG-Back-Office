# Crucible Balancer — Architecture & Working Notes

> Read this before making changes. The system is data-driven by design — when designers want to nerf or buff something, they tune coefficients/weights, not write new validation logic.

This is the back-office for the **Crucible of Ascension** real-time PvP game. It manages Heroes (and, in later phases, Cards, Decks, Budgets, Simulator). The GDD lives at `../Ongoing Crucible of Ascension GDD.md`.

---

## Core design principle

**Balance is enforced by math, not by rules.** Every attribute → stat conversion, every score weight, every (eventually) card-power factor lives in a Postgres table. The TypeScript calculators read from those tables. Changing a coefficient instantly reprices every hero — no migration, no redeploy.

When asked to add a feature, ask first: *can this be expressed as a coefficient or a weight?* If yes, do that.

---

## Phase roadmap — respect the order

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1 | Auth, env-scoped config tables seeded from GDD, Heroes CRUD with live MS + Balance Power | ✅ Done |
| 2 | Cards CRUD with effects + Card Power | ✅ Done |
| 3 | Deck builder (5 role + 5 general) + hero Balance Power aggregation including deck | ✅ Done |
| 4 | Balance budgets per (combat_role × mastery_rank) + violation flags | ✅ Done |
| 5 | Pairwise simulator (v1: no positioning / no multi-target / no storage) | ✅ Done |
| 5b | Closing-distance positioning model + NxN sweep heatmap | ✅ Done |
| 5c | Kiting / asymmetric speeds, run history, BP recalibration from win-rate data, AoE multi-target handling | ⏳ Future |

Don't start Phase 4 until ≥5 heroes with full decks are in dev. Don't start Phase 5 until ≥10. Without that, budget ranges and matchup expectations are uncalibrated.

---

## Two scores, two purposes — never collapse them

- **Mastery Score (MS)** — exact GDD formula `(HP×2)+(DMG×20)+(Evasion%×8)+(Resilience%×5)`. Range is excluded by GDD design (compensated by lower base damage on ranged heroes). Player-facing. Drives Mastery Rank → card tier unlock.
- **Balance Power (BP)** — internal-only score. Same shape but uses `bp_weight` from `stat_weights`, so Range carries real weight here. Used by simulator and budget alerts. **Never shown to players.**

Both scores read the same `stat_weights` table; only the column differs. If you find yourself adding a third score, push back — it's almost always a sign that a weight needs tuning, not that we need new math.

---

## Non-negotiables

1. **The calculators in `src/lib/ms-calculator.ts` and `src/lib/balance-power-calculator.ts` are the single source of truth.** No duplicating MS/BP math elsewhere. Pages import from there.
2. **All content is environment-scoped.** Every table (except `environments`, `user_roles`, `change_log`) has `env_id`. Every query filters by `currentEnv.id`. Never query across environments.
3. **Coefficients and weights are DATA, not code.** Never hardcode `0.05` or `× 20`. Read from `attribute_coefficients` / `stat_weights`.
4. **RLS is authoritative.** Postgres policies in `0002_rls.sql` enforce writes. The client-side `canWriteContent()` / `canWriteConfig()` helpers are for UI gating only.
5. **Scores are computed, not stored.** Reading a coefficient and computing on the client (or a SQL view we explicitly build later) is cheap; reconciling stored values across coefficient changes is not.
6. **No premature abstractions.** No TanStack Query, Redux, form library. Plain hooks + controlled inputs. Ask before adding.

---

## File structure — where things go

```
src/
├── lib/
│   ├── ms-calculator.ts            → GDD Mastery Score. Pure functions. No React, no Supabase.
│   ├── balance-power-calculator.ts → Hero internal score (stats + deck) and deck-contribution helper.
│   ├── card-power-calculator.ts    → Card internal score from effects, cooldown, tier.
│   ├── budget.ts                   → Budget verdict (ok/too_low/too_high/no_budget) + tone helper.
│   ├── simulator.ts                → Phase 5: pairwise combat sim (tick loop, AI, effects, batch).
│   ├── load-combatants.ts          → Phase 5b: shared loader (one or all heroes) returning HeroFull.
│   ├── useConfigBundle.ts          → Hook: fetches all config for current env. Pages use this.
│   └── supabase.ts                 → Client only. No queries here.
├── contexts/
│   ├── AuthContext.tsx             → Session + role. canWriteContent() / canWriteConfig() helpers.
│   └── EnvironmentContext.tsx      → Current env, persisted in localStorage.
├── components/
│   ├── UI.tsx                      → Primitives: Button, Panel, Field, Input, Score, Badge,
│   │                                  PageHeader, Empty. Add new primitives here.
│   ├── Layout.tsx                  → Sidebar nav + env switcher. Phase nav stubs as placeholders.
│   └── DeckPanel.tsx               → Phase 3: 10 slots, role-filtered picker, per-slot card power.
├── pages/
│   ├── Login.tsx
│   ├── HeroesList.tsx
│   ├── HeroEditor.tsx              → Live MS + BP recompute as designer edits attributes.
│   ├── CardsList.tsx
│   ├── CardEditor.tsx              → Live Card Power recompute; effects sub-editor (add/edit/remove).
│   ├── Simulator.tsx               → Phase 5: pick A vs B, run N Monte Carlo, see win-rate verdict.
│   ├── Sweep.tsx                   → Phase 5b: NxN heatmap, click cell → /simulator with pair selected.
│   └── admin/
│       ├── Coefficients.tsx        → Admin-only: edit attribute coefficients + stat weights.
│       └── Budgets.tsx              → Admin-only: BP envelope per (role × rank). Filter-by-role.
└── types/database.ts               → Domain types matching the Supabase schema. Keep in sync with migrations.
```

**New page checklist:**
- Calls `useEnvironment()` → filter queries by `currentEnv.id`.
- Calls `useAuth()` + `canWriteContent()` / `canWriteConfig()` to gate buttons.
- Calls `useConfigBundle()` once at the top if score math is needed.
- Uses primitives from `UI.tsx` — no custom buttons/panels.
- Added to `App.tsx` routes and `Layout.tsx` nav.

---

## Database conventions

- All migrations: `supabase/migrations/NNNN_description.sql`, numbered sequentially.
- Never edit a migration that's been applied to `prod`. Write a new one.
- Every content/config table has: `id uuid pk`, `env_id uuid fk`, `created_at`, `updated_at` (with `touch_updated_at` trigger). The exception is `environments`, `user_roles`, and `change_log`.
- Enum-like columns use `check` constraints, not lookup tables, for Phase 1 simplicity. Combat roles are a real table because designers will edit/extend them.
- Schema changes require: migration file + matching type update in `src/types/database.ts`.
- `change_log` is populated by a Postgres trigger (`log_change`) attached to every content/config table. Cheap audit trail.

---

## PP / power formulas — current

```
hp            = vitality      × stat_per_point[vitality]      (5 by GDD)
dmg           = might         × stat_per_point[might]         (0.5 by GDD)
evasion_pct   = haste         × stat_per_point[haste]         (1.25 by GDD)
resilience_pct= resilience    × stat_per_point[resilience]    (2 by GDD)
range         = range         × stat_per_point[range]         (1 by GDD)

mastery_score  = Σ stat_value × ms_weight[stat]               (range ms_weight = 0)
balance_power  = Σ stat_value × bp_weight[stat]               (range bp_weight tunable; placeholder = 5)

# Card Power (Phase 2)
effect_power     = pp_weight × magnitude × max(duration_sec, 1) × target_count
total_effect_pwr = Σ effect_power
cooldown_factor  = 10 / (cooldown_sec + 1)
card_power       = total_effect_pwr × cooldown_factor × tier_multiplier

# Hero Balance Power including deck (Phase 3)
deck_contribution = Σ card_power for each card in the hero's deck (slots 1–10)
hero_bp_total     = stat_bp + deck_contribution
# (Raw additive — Phase 5b will reweight using simulator win-rate data.)
```

## Simulator v1 — what it models, what it ignores

The simulator (`lib/simulator.ts`) runs hero+deck pairs through a discrete-time
combat loop (0.5s tick, 30s max). For each tick it picks the best applicable
off-cooldown card per side (highest static power), falls back to a 1.0s
basic attack, and resolves effects with evasion / resilience rolls.

**Modeled:** HP/DMG/eva%/res%, cooldowns, DoTs, shields, heals, stuns,
buffs (might/haste/resilience), evasion debuffs.

**Now modeled (Phase 5b):**
- **Positioning (closing-distance only)** — combatants start at
  `max(rangeA, rangeB)` apart and close at 12 grid/sec relative speed
  (each side moves 6/sec). Attacks gated by attacker.range ≥ distance.
  Self-targeted cards (heal/shield/buffs) ignore range. DoTs already in
  flight keep ticking regardless. No kiting yet — once melee, both stay.

**Still NOT modeled:**
- **Kiting / asymmetric speeds** — both close at the same rate. Once they
  meet, they stay melee. Real PvP has kiting but modeling it without
  degenerate infinite-range scenarios needs stamina or map edges.
- **Multi-target** — `target_count > 1` collapses to 1 (no second target
  exists in 1v1). AoE cards therefore appear under-powered, which is
  itself a useful signal — don't "fix" it by inflating their pp_weight.
- **Knockback, slow-as-positioning, LOS, terrain** — silent no-ops
  (resilience still rolls for slow/eva-debuff so designers see the effect
  on resilience scoring).
- **Run storage** — results are page-only. Add a `simulations` table when
  designers need history.

Verdict: 45–55% win rate = "balanced". Anything outside flips the verdict.

If a designer asks to change these: the change is almost always in the coefficients/weights tables, not in TS code. Touch the formulas only when adding genuinely new mechanics (e.g., stat interaction terms, deck Card Power in Phase 3).

---

## Known GDD inconsistency

Tayfan's listed Resilience Rate is 16% but with attribute resilience=12 the formula yields 24%. Seed uses the attribute value (12). If the GDD's intent is 16%, either the attribute should be 8 or the conversion is hero-specific. Flag for the design team.

---

## Common pitfalls to avoid

- **Don't fetch the same config twice per page.** Use `useConfigBundle()` once.
- **Don't compute scores in a SQL view.** Coefficients change often; views would need constant rebuilding. Keep it in TS.
- **Don't promote dev → prod with a one-off SQL script.** When this matters, build a proper promotion flow.
- **Don't assume cards = hero passives.** They aren't. The GDD treats them as separate. When Phase 2 lands, cards get their own table.
- **Don't add client-side role checks as the only protection.** RLS does the actual enforcement.

---

## When pushed to do something that breaks the above

Say so directly. Yaniv prefers critical pushback over silent compliance. If a request would duplicate score math, bypass RLS, hardcode a coefficient, or add a heavy dependency, explain the cost and propose the lighter alternative before acting.
