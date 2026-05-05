import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { deriveStats, masteryScore } from '@/lib/ms-calculator';
import {
  balancePowerFromStats,
  deckContribution,
} from '@/lib/balance-power-calculator';
import {
  Badge,
  Button,
  Field,
  Formula,
  HowCalculated,
  Input,
  NumberInput,
  PageHeader,
  Panel,
  Score,
} from '@/components/UI';
import { Link } from 'react-router-dom';
import { DeckPanel } from '@/components/DeckPanel';
import { evaluateBudget, findBudget, verdictLabel, verdictTone } from '@/lib/budget';
import {
  ALL_SLOTS,
  type Attribute,
  type Card,
  type CardEffect,
  type Hero,
  type HeroAttributes,
  type HeroDeckEntry,
  type HeroStatus,
} from '@/types/database';

interface Form {
  name: string;
  race: string;
  combat_role_id: string;
  description: string;
  status: HeroStatus;
  vitality: number;
  might: number;
  range: number;
  haste: number;
  resilience: number;
}

const empty = (combat_role_id: string): Form => ({
  name: '',
  race: '',
  combat_role_id,
  description: '',
  status: 'draft',
  vitality: 0,
  might: 0,
  range: 1,
  haste: 0,
  resilience: 0,
});

const emptyDeck = (): Map<number, string | null> => {
  const m = new Map<number, string | null>();
  ALL_SLOTS.forEach((s) => m.set(s, null));
  return m;
};

export function HeroEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const { canWriteContent } = useAuth();
  const { currentEnv } = useEnvironment();
  const { bundle, loading: cfgLoading } = useConfigBundle(currentEnv?.id ?? null);
  const navigate = useNavigate();

  const [form, setForm] = useState<Form | null>(null);
  const [deck, setDeck] = useState<Map<number, string | null>>(emptyDeck());
  const [cards, setCards] = useState<Card[]>([]);
  const [effectsByCard, setEffectsByCard] = useState<Map<string, CardEffect[]>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch cards + effects for the env (picker pool + power computation).
  useEffect(() => {
    if (!currentEnv) return;
    let cancelled = false;
    (async () => {
      const { data: cardRows } = await supabase
        .from('cards')
        .select('*')
        .eq('env_id', currentEnv.id)
        .order('name');
      const ids = (cardRows ?? []).map((c) => c.id);
      const { data: effRows } =
        ids.length > 0
          ? await supabase.from('card_effects').select('*').in('card_id', ids)
          : { data: [] as CardEffect[] };
      if (cancelled) return;
      setCards((cardRows ?? []) as Card[]);
      const map = new Map<string, CardEffect[]>();
      (effRows ?? []).forEach((e) => {
        const arr = map.get(e.card_id) ?? [];
        arr.push(e);
        map.set(e.card_id, arr);
      });
      setEffectsByCard(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentEnv?.id]);

  // Initialize hero form + deck once config + (optional) hero are loaded.
  useEffect(() => {
    if (!currentEnv || !bundle) return;
    if (isNew) {
      setForm(empty(bundle.combatRoles[0]?.id ?? ''));
      setDeck(emptyDeck());
      return;
    }
    let cancelled = false;
    (async () => {
      const [heroRes, deckRes] = await Promise.all([
        supabase.from('heroes').select('*').eq('id', id).single(),
        supabase.from('hero_decks').select('*').eq('hero_id', id),
      ]);
      if (cancelled) return;
      if (heroRes.error || !heroRes.data) {
        setError(heroRes.error?.message ?? 'Hero not found');
        return;
      }
      const h = heroRes.data as Hero;
      setForm({
        name: h.name,
        race: h.race ?? '',
        combat_role_id: h.combat_role_id,
        description: h.description ?? '',
        status: h.status,
        vitality: h.vitality,
        might: h.might,
        range: h.range,
        haste: h.haste,
        resilience: h.resilience,
      });
      const d = emptyDeck();
      ((deckRes.data ?? []) as HeroDeckEntry[]).forEach((row) => {
        d.set(row.slot, row.card_id);
      });
      setDeck(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew, currentEnv?.id, bundle]);

  const stats = useMemo(() => {
    if (!form || !bundle) return null;
    const attrs: HeroAttributes = {
      vitality: form.vitality,
      might: form.might,
      range: form.range,
      haste: form.haste,
      resilience: form.resilience,
    };
    return deriveStats(attrs, bundle.coefficients);
  }, [form, bundle]);

  const ms = stats && bundle ? masteryScore(stats, bundle.statWeights) : null;
  const bpStats = stats && bundle ? balancePowerFromStats(stats, bundle.statWeights) : null;

  const deckCards = useMemo(() => {
    const ids: string[] = [];
    deck.forEach((id) => {
      if (id) ids.push(id);
    });
    return ids
      .map((id) => cards.find((c) => c.id === id))
      .filter((c): c is Card => Boolean(c));
  }, [deck, cards]);

  const deckContrib = useMemo(() => {
    if (!bundle) return null;
    return deckContribution(deckCards, effectsByCard, bundle.cardTiers, bundle.effectTypes);
  }, [deckCards, effectsByCard, bundle]);

  const bpTotal = bpStats != null && deckContrib ? bpStats + deckContrib.total : bpStats;

  const masteryRank = useMemo(() => {
    if (ms == null || !bundle) return null;
    const reached = bundle.masteryRanks.filter((r) => r.ms_threshold <= ms);
    return reached[reached.length - 1] ?? null;
  }, [ms, bundle]);

  const budget = useMemo(() => {
    if (!form || !masteryRank || !bundle) return null;
    return findBudget(bundle.balanceBudgets, form.combat_role_id, masteryRank.id);
  }, [form, masteryRank, bundle]);

  const verdict = evaluateBudget(bpTotal, budget);

  if (!currentEnv) return null;
  if (cfgLoading || !form) {
    return <Panel><div className="text-muted text-sm">Loading…</div></Panel>;
  }

  const writable = canWriteContent();

  const onSave = async () => {
    if (!writable) return;
    setSaving(true);
    setError(null);

    const payload = { ...form, env_id: currentEnv.id };
    const heroRes = isNew
      ? await supabase.from('heroes').insert(payload).select('id').single()
      : await supabase.from('heroes').update(payload).eq('id', id!).select('id').single();
    if (heroRes.error || !heroRes.data) {
      setSaving(false);
      setError(heroRes.error?.message ?? 'Save failed');
      return;
    }
    const heroId = heroRes.data.id as string;

    // Save deck: delete-all-and-reinsert (matches the card_effects pattern).
    const del = await supabase.from('hero_decks').delete().eq('hero_id', heroId);
    if (del.error) {
      setSaving(false);
      setError(del.error.message);
      return;
    }
    const rows: { hero_id: string; card_id: string; slot: number }[] = [];
    deck.forEach((cardId, slot) => {
      if (cardId) rows.push({ hero_id: heroId, card_id: cardId, slot });
    });
    if (rows.length > 0) {
      const ins = await supabase.from('hero_decks').insert(rows);
      if (ins.error) {
        setSaving(false);
        setError(ins.error.message);
        return;
      }
    }

    setSaving(false);
    navigate(`/heroes/${heroId}`);
  };

  const onDelete = async () => {
    if (!writable || isNew) return;
    if (!confirm(`Delete ${form.name}? This cannot be undone.`)) return;
    const { error } = await supabase.from('heroes').delete().eq('id', id!);
    if (error) {
      setError(error.message);
      return;
    }
    navigate('/heroes');
  };

  // Clear deck slots if combat role changes — role-specific cards no longer match.
  const onChangeRole = (newRoleId: string) => {
    if (newRoleId !== form.combat_role_id) {
      const next = new Map(deck);
      [1, 2, 3, 4, 5].forEach((s) => next.set(s, null));
      setDeck(next);
    }
    setForm({ ...form, combat_role_id: newRoleId });
  };

  return (
    <>
      <PageHeader
        title={isNew ? 'New Hero' : form.name || 'Hero'}
        subtitle={`${currentEnv.name} environment`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/heroes')}>Back</Button>
            {writable && !isNew && (
              <Button variant="danger" onClick={onDelete}>Delete</Button>
            )}
            {writable && (
              <Button onClick={onSave} disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <Panel title="Identity">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={!writable}
                />
              </Field>
              <Field label="Race">
                <Input
                  value={form.race}
                  onChange={(e) => setForm({ ...form, race: e.target.value })}
                  disabled={!writable}
                />
              </Field>
              <Field label="Combat Role">
                <select
                  className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
                  value={form.combat_role_id}
                  onChange={(e) => onChangeRole(e.target.value)}
                  disabled={!writable}
                >
                  {bundle?.combatRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.display_name} ({r.range_kind})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as HeroStatus })}
                  disabled={!writable}
                >
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </select>
              </Field>
              <div className="col-span-2">
                <Field label="Description">
                  <textarea
                    className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm min-h-20"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    disabled={!writable}
                  />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title="Attributes" actions={<Badge>1 attr point ≈ 10 MS</Badge>}>
            <div className="grid grid-cols-5 gap-3">
              {(['vitality', 'might', 'range', 'haste', 'resilience'] as Attribute[]).map((a) => (
                <Field key={a} label={a}>
                  <NumberInput
                    value={(form as unknown as Record<Attribute, number>)[a]}
                    min={a === 'range' ? 1 : 0}
                    onChange={(n) => setForm({ ...form, [a]: n })}
                    disabled={!writable}
                  />
                </Field>
              ))}
            </div>
          </Panel>

          {bundle && (
            <DeckPanel
              combatRoleId={form.combat_role_id}
              cards={cards}
              effectsByCard={effectsByCard}
              tiers={bundle.cardTiers}
              effectTypes={bundle.effectTypes}
              value={deck}
              onChange={setDeck}
              writable={writable}
            />
          )}
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 self-start">
          <Panel title="Computed">
            <div className="grid grid-cols-2 gap-2">
              <Score label="HP" value={stats?.hp ?? '—'} />
              <Score label="DMG" value={stats?.dmg ?? '—'} />
              <Score label="Evasion %" value={stats ? `${stats.evasion_pct}` : '—'} />
              <Score label="Resilience %" value={stats ? `${stats.resilience_pct}` : '—'} />
              <Score label="Range" value={stats?.range ?? '—'} />
              <Score label="Mastery Rank" value={masteryRank?.rank ?? '—'} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-line">
              <Score
                label="Mastery Score"
                value={ms ?? '—'}
                emphasis="ms"
                hint="Player-facing · GDD formula"
              />
              <Score
                label="Balance Power"
                value={bpTotal ?? '—'}
                emphasis="bp"
                hint={
                  deckContrib
                    ? `Stats ${bpStats} + Deck ${deckContrib.total}`
                    : 'Internal · sim & budgets'
                }
              />
            </div>
            <div className="mt-3 pt-3 border-t border-line text-xs flex items-center justify-between">
              <span className="text-muted uppercase tracking-wider">Budget</span>
              {budget ? (
                <span className="text-slate-200">
                  {budget.bp_min ?? '—'} – {budget.bp_max ?? '—'}
                </span>
              ) : (
                <span className="text-muted">not set</span>
              )}
            </div>
            <div className="mt-2">
              <Badge tone={verdictTone(verdict)}>{verdictLabel(verdict)}</Badge>
            </div>
            <HowCalculated>
              <p>
                <strong>Mastery Score</strong> (player-facing, GDD formula):
              </p>
              <Formula>{`MS = (HP × 2) + (DMG × 20)
   + (Evasion% × 8) + (Resilience% × 5)
Range is excluded by design.`}</Formula>
              <p>
                <strong>Balance Power</strong> (internal): same shape but uses{' '}
                <code>bp_weight</code> instead of <code>ms_weight</code>, plus the
                deck's total Card Power. Range carries real weight here.
              </p>
              <Formula>{`stat_BP = Σ stat × bp_weight[stat]
Balance Power = stat_BP + Σ Card Power across deck`}</Formula>
              <p>
                Tunable in <Link to="/admin/coefficients" className="text-accent underline">Admin → Coefficients</Link>.
                See <Link to="/docs/formulas" className="text-accent underline">/docs/formulas</Link> for the full reference.
              </p>
            </HowCalculated>
          </Panel>

          {deckContrib && deckCards.length > 0 && (
            <Panel title="Deck breakdown">
              <table className="w-full text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="text-left py-1">Card</th>
                    <th className="text-right py-1">Power</th>
                  </tr>
                </thead>
                <tbody>
                  {deckContrib.perCard.map(({ cardId, power }) => {
                    const c = cards.find((x) => x.id === cardId);
                    return (
                      <tr key={cardId} className="border-t border-line">
                        <td className="py-1.5">{c?.name ?? '—'}</td>
                        <td className="py-1.5 text-right text-cyan-400 font-medium">{power}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-line">
                    <td className="py-1.5 font-semibold">Total</td>
                    <td className="py-1.5 text-right text-cyan-400 font-semibold">
                      {deckContrib.total}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Panel>
          )}

          {error && (
            <Panel title="Error">
              <div className="text-sm text-red-400">{error}</div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
