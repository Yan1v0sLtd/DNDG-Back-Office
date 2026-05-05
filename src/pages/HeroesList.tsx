import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { deriveStats, masteryScore } from '@/lib/ms-calculator';
import {
  balancePowerFromStats,
  deckContribution,
} from '@/lib/balance-power-calculator';
import { evaluateBudget, findBudget, verdictTone } from '@/lib/budget';
import { Badge, Button, Empty, PageHeader, Panel } from '@/components/UI';
import type {
  Card,
  CardEffect,
  CombatRole,
  Hero,
  HeroDeckEntry,
} from '@/types/database';

export function HeroesList() {
  const { canWriteContent } = useAuth();
  const { currentEnv } = useEnvironment();
  const { bundle, loading: cfgLoading } = useConfigBundle(currentEnv?.id ?? null);
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [decks, setDecks] = useState<Map<string, HeroDeckEntry[]>>(new Map());
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  const [effectsByCard, setEffectsByCard] = useState<Map<string, CardEffect[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentEnv) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [heroesRes, decksRes, cardsRes] = await Promise.all([
        supabase.from('heroes').select('*').eq('env_id', currentEnv.id).order('name'),
        supabase.from('hero_decks').select('*'),
        supabase.from('cards').select('*').eq('env_id', currentEnv.id),
      ]);
      const cardIds = (cardsRes.data ?? []).map((c) => c.id);
      const { data: effRows } =
        cardIds.length > 0
          ? await supabase.from('card_effects').select('*').in('card_id', cardIds)
          : { data: [] as CardEffect[] };
      if (cancelled) return;

      setHeroes((heroesRes.data ?? []) as Hero[]);

      const deckMap = new Map<string, HeroDeckEntry[]>();
      ((decksRes.data ?? []) as HeroDeckEntry[]).forEach((row) => {
        const arr = deckMap.get(row.hero_id) ?? [];
        arr.push(row);
        deckMap.set(row.hero_id, arr);
      });
      setDecks(deckMap);

      const cardMap = new Map<string, Card>();
      ((cardsRes.data ?? []) as Card[]).forEach((c) => cardMap.set(c.id, c));
      setCards(cardMap);

      const effMap = new Map<string, CardEffect[]>();
      (effRows ?? []).forEach((e) => {
        const arr = effMap.get(e.card_id) ?? [];
        arr.push(e);
        effMap.set(e.card_id, arr);
      });
      setEffectsByCard(effMap);

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentEnv?.id]);

  if (!currentEnv) return null;

  return (
    <>
      <PageHeader
        title="Heroes"
        subtitle={`${currentEnv.name} environment · ${heroes.length} hero${heroes.length === 1 ? '' : 'es'}`}
        actions={
          canWriteContent() && (
            <Button onClick={() => navigate('/heroes/new')}>+ New Hero</Button>
          )
        }
      />
      {loading || cfgLoading ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : heroes.length === 0 ? (
        <Empty>
          No heroes in this environment. {canWriteContent() && (
            <Link to="/heroes/new" className="text-accent underline">Create the first one</Link>
          )}.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {heroes.map((h) => (
            <HeroCard
              key={h.id}
              hero={h}
              roles={bundle?.combatRoles ?? []}
              bundle={bundle}
              deck={decks.get(h.id) ?? []}
              cards={cards}
              effectsByCard={effectsByCard}
            />
          ))}
        </div>
      )}
    </>
  );
}

function HeroCard({
  hero,
  roles,
  bundle,
  deck,
  cards,
  effectsByCard,
}: {
  hero: Hero;
  roles: CombatRole[];
  bundle: ReturnType<typeof useConfigBundle>['bundle'];
  deck: HeroDeckEntry[];
  cards: Map<string, Card>;
  effectsByCard: Map<string, CardEffect[]>;
}) {
  const role = roles.find((r) => r.id === hero.combat_role_id);
  const derived = bundle
    ? deriveStats(hero.attribute_values, bundle.attributes, bundle.coefficients, bundle.stats)
    : null;
  const ms = derived && bundle ? masteryScore(derived, bundle.statWeights, bundle.stats) : null;
  const bpStats =
    derived && bundle ? balancePowerFromStats(derived, bundle.statWeights, bundle.stats) : null;

  const deckCards = deck
    .map((d) => cards.get(d.card_id))
    .filter((c): c is Card => Boolean(c));
  const deckContrib =
    bundle && deckCards.length > 0
      ? deckContribution(deckCards, effectsByCard, bundle.cardTiers, bundle.effectTypes)
      : null;
  const bpTotal = bpStats != null ? bpStats + (deckContrib?.total ?? 0) : null;
  const deckSize = deck.length;

  const masteryRank =
    ms != null && bundle
      ? bundle.masteryRanks.filter((r) => r.ms_threshold <= ms).slice(-1)[0] ?? null
      : null;
  const budget =
    bundle && masteryRank
      ? findBudget(bundle.balanceBudgets, hero.combat_role_id, masteryRank.id)
      : null;
  const verdict = evaluateBudget(bpTotal, budget);
  const bpTone = verdictTone(verdict);

  return (
    <Link to={`/heroes/${hero.id}`} className="block">
      <Panel
        className="hover:border-accent/50 transition cursor-pointer"
        title={
          <span className="flex items-center gap-2">
            {hero.name}
            <Badge tone={hero.status === 'published' ? 'good' : 'warn'}>{hero.status}</Badge>
          </span>
        }
        actions={
          <span className="flex gap-1">
            {role && <Badge>{role.display_name}</Badge>}
            <Badge tone={deckSize === 10 ? 'good' : deckSize > 0 ? 'warn' : 'neutral'}>
              Deck {deckSize}/10
            </Badge>
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2 text-sm">
          {bundle?.stats.map((s) => {
            const v = derived?.[s.slug];
            return (
              <Stat
                key={s.id}
                label={s.display_name}
                value={v != null ? `${v}${s.unit_label ?? ''}` : null}
              />
            );
          })}
          <Stat label="Race" value={hero.race ?? '—'} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-line">
          <ScoreCell label="Mastery Score" value={ms} tone="ms" />
          <ScoreCell
            label="Balance Power"
            value={bpTotal}
            tone="bp"
            hint={
              deckContrib && deckContrib.total > 0
                ? `${bpStats} + ${deckContrib.total} deck`
                : undefined
            }
            badgeTone={bpTone === 'neutral' ? null : bpTone}
            badgeLabel={
              verdict === 'too_low'
                ? '↓ low'
                : verdict === 'too_high'
                ? '↑ high'
                : verdict === 'ok'
                ? '✓'
                : null
            }
          />
        </div>
      </Panel>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
      <span className="text-slate-100 font-medium">{value ?? '—'}</span>
    </div>
  );
}

function ScoreCell({
  label,
  value,
  tone,
  hint,
  badgeTone,
  badgeLabel,
}: {
  label: string;
  value: number | null;
  tone: 'ms' | 'bp';
  hint?: string;
  badgeTone?: 'good' | 'warn' | 'bad' | null;
  badgeLabel?: string | null;
}) {
  const color = tone === 'ms' ? 'text-accent' : 'text-cyan-400';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`text-lg font-semibold ${color}`}>{value ?? '—'}</span>
        {badgeTone && badgeLabel && <Badge tone={badgeTone}>{badgeLabel}</Badge>}
      </div>
      {hint && <div className="text-[10px] text-muted">{hint}</div>}
    </div>
  );
}
