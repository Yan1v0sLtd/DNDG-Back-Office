import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { cardPower } from '@/lib/card-power-calculator';
import { Badge, Button, Empty, PageHeader, Panel } from '@/components/UI';
import type { Card, CardEffect, CardTier, CombatRole } from '@/types/database';

interface CardWithEffects extends Card {
  effects: CardEffect[];
}

export function CardsList() {
  const { canWriteContent } = useAuth();
  const { currentEnv } = useEnvironment();
  const { bundle, loading: cfgLoading } = useConfigBundle(currentEnv?.id ?? null);
  const [cards, setCards] = useState<CardWithEffects[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentEnv) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: rows } = await supabase
        .from('cards')
        .select('*')
        .eq('env_id', currentEnv.id)
        .order('name');
      const ids = (rows ?? []).map((r) => r.id);
      const { data: effects } =
        ids.length > 0
          ? await supabase.from('card_effects').select('*').in('card_id', ids)
          : { data: [] as CardEffect[] };

      if (cancelled) return;
      const byCard = new Map<string, CardEffect[]>();
      (effects ?? []).forEach((e) => {
        const arr = byCard.get(e.card_id) ?? [];
        arr.push(e);
        byCard.set(e.card_id, arr);
      });
      setCards(
        (rows ?? []).map((c) => ({ ...(c as Card), effects: byCard.get(c.id) ?? [] })),
      );
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
        title="Cards"
        subtitle={`${currentEnv.name} environment · ${cards.length} card${cards.length === 1 ? '' : 's'}`}
        actions={
          canWriteContent() && (
            <Button onClick={() => navigate('/cards/new')}>+ New Card</Button>
          )
        }
      />
      {loading || cfgLoading ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : cards.length === 0 ? (
        <Empty>
          No cards in this environment yet.
          {canWriteContent() && (
            <>
              {' '}
              <Link to="/cards/new" className="text-accent underline">Create the first one</Link>.
            </>
          )}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((c) => (
            <CardItem key={c.id} card={c} bundle={bundle} />
          ))}
        </div>
      )}
    </>
  );
}

function CardItem({
  card,
  bundle,
}: {
  card: CardWithEffects;
  bundle: ReturnType<typeof useConfigBundle>['bundle'];
}) {
  const tier = bundle?.cardTiers.find((t) => t.id === card.tier_id);
  const role = bundle?.combatRoles.find((r) => r.id === card.combat_role_id);
  const power =
    bundle &&
    cardPower(card, card.effects, bundle.cardTiers, bundle.effectTypes);

  return (
    <Link to={`/cards/${card.id}`} className="block">
      <Panel
        className="hover:border-accent/50 transition cursor-pointer"
        title={
          <span className="flex items-center gap-2">
            {card.name}
            <Badge tone={card.status === 'published' ? 'good' : 'warn'}>{card.status}</Badge>
          </span>
        }
        actions={
          <span className="flex gap-1">
            <Badge>{tier?.display_name ?? '—'}</Badge>
            <KindBadge card={card} role={role ?? null} />
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Row label="Cooldown" value={`${card.cooldown_sec}s`} />
          <Row label="Effects" value={card.effects.length} />
        </div>
        {card.description && (
          <p className="text-xs text-muted mt-3 line-clamp-2">{card.description}</p>
        )}
        <div className="mt-3 pt-3 border-t border-line">
          <div className="text-[10px] uppercase tracking-wider text-muted">Card Power</div>
          <div className="text-2xl font-semibold text-cyan-400">{power ?? '—'}</div>
        </div>
      </Panel>
    </Link>
  );
}

function KindBadge({ card, role }: { card: Card; role: CombatRole | null }) {
  if (card.kind === 'general') return <Badge>General</Badge>;
  return <Badge tone="warn">{role?.display_name ?? 'Role-specific'}</Badge>;
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
      <span className="text-slate-100 font-medium">{value}</span>
    </div>
  );
}

// Re-export used elsewhere:
export type { CardTier };
