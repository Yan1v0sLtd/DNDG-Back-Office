// Phase 3 — deck builder panel for the hero editor.
//
// Slots 1..5 are role-specific (filtered to cards matching the hero's combat
// role); slots 6..10 are general. The DB has unique(hero_id, slot) and
// unique(hero_id, card_id), so the picker disables already-chosen cards.

import { useMemo } from 'react';
import { cardPower } from '@/lib/card-power-calculator';
import { Badge, Panel } from './UI';
import {
  ALL_SLOTS,
  GENERAL_SLOTS,
  ROLE_SPECIFIC_SLOTS,
  type Card,
  type CardEffect,
  type CardTier,
  type EffectType,
} from '@/types/database';

export interface DeckPanelProps {
  combatRoleId: string | null;
  cards: Card[];
  effectsByCard: Map<string, CardEffect[]>;
  tiers: CardTier[];
  effectTypes: EffectType[];
  // Map<slot 1..10, cardId | null>. null/undefined = empty slot.
  value: Map<number, string | null>;
  onChange: (next: Map<number, string | null>) => void;
  writable: boolean;
}

export function DeckPanel({
  combatRoleId,
  cards,
  effectsByCard,
  tiers,
  effectTypes,
  value,
  onChange,
  writable,
}: DeckPanelProps) {
  const rolePool = useMemo(
    () =>
      cards.filter(
        (c) => c.kind === 'role_specific' && c.combat_role_id === combatRoleId,
      ),
    [cards, combatRoleId],
  );
  const generalPool = useMemo(
    () => cards.filter((c) => c.kind === 'general'),
    [cards],
  );

  const usedIds = new Set<string>();
  ALL_SLOTS.forEach((s) => {
    const id = value.get(s);
    if (id) usedIds.add(id);
  });

  const filledRole = ROLE_SPECIFIC_SLOTS.filter((s) => value.get(s)).length;
  const filledGeneral = GENERAL_SLOTS.filter((s) => value.get(s)).length;

  const setSlot = (slot: number, cardId: string | null) => {
    const next = new Map(value);
    if (cardId) next.set(slot, cardId);
    else next.set(slot, null);
    onChange(next);
  };

  return (
    <Panel
      title="Deck"
      actions={
        <span className="flex gap-2">
          <Badge tone={filledRole === 5 ? 'good' : 'warn'}>
            Role-specific {filledRole}/5
          </Badge>
          <Badge tone={filledGeneral === 5 ? 'good' : 'warn'}>
            General {filledGeneral}/5
          </Badge>
        </span>
      }
    >
      <Section title="Role-specific" hint="Cards matching this hero's combat role.">
        {rolePool.length === 0 && (
          <div className="text-xs text-muted py-2">
            No role-specific cards exist yet for this combat role.
          </div>
        )}
        {ROLE_SPECIFIC_SLOTS.map((slot) => (
          <Slot
            key={slot}
            slot={slot}
            pool={rolePool}
            value={value.get(slot) ?? null}
            usedIds={usedIds}
            tiers={tiers}
            effectsByCard={effectsByCard}
            effectTypes={effectTypes}
            onChange={(cardId) => setSlot(slot, cardId)}
            writable={writable}
          />
        ))}
      </Section>

      <Section title="General" hint="Cards usable by any hero." className="mt-4">
        {GENERAL_SLOTS.map((slot) => (
          <Slot
            key={slot}
            slot={slot}
            pool={generalPool}
            value={value.get(slot) ?? null}
            usedIds={usedIds}
            tiers={tiers}
            effectsByCard={effectsByCard}
            effectTypes={effectTypes}
            onChange={(cardId) => setSlot(slot, cardId)}
            writable={writable}
          />
        ))}
      </Section>
    </Panel>
  );
}

function Section({
  title,
  hint,
  children,
  className = '',
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {title}
        </h3>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Slot({
  slot,
  pool,
  value,
  usedIds,
  tiers,
  effectsByCard,
  effectTypes,
  onChange,
  writable,
}: {
  slot: number;
  pool: Card[];
  value: string | null;
  usedIds: Set<string>;
  tiers: CardTier[];
  effectsByCard: Map<string, CardEffect[]>;
  effectTypes: EffectType[];
  onChange: (cardId: string | null) => void;
  writable: boolean;
}) {
  const card = value ? pool.find((c) => c.id === value) : null;
  const tier = card ? tiers.find((t) => t.id === card.tier_id) : null;
  const power = card
    ? cardPower(card, effectsByCard.get(card.id) ?? [], tiers, effectTypes)
    : null;

  return (
    <div className="grid grid-cols-12 gap-2 items-center bg-ink border border-line rounded px-2 py-1.5">
      <span className="col-span-1 text-xs text-muted text-center">#{slot}</span>
      <select
        className="col-span-7 bg-panel border border-line rounded px-2 py-1 text-sm disabled:opacity-50"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={!writable}
      >
        <option value="">— Empty —</option>
        {pool.map((c) => {
          const taken = usedIds.has(c.id) && c.id !== value;
          return (
            <option key={c.id} value={c.id} disabled={taken}>
              {c.name}{taken ? ' (already in deck)' : ''}
            </option>
          );
        })}
      </select>
      <span className="col-span-2 text-[11px]">
        {tier && <Badge>{tier.display_name}</Badge>}
      </span>
      <span className="col-span-1 text-right text-cyan-400 text-sm font-medium">
        {power ?? '—'}
      </span>
      <span className="col-span-1 text-right">
        {card && writable && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-red-300 hover:text-red-200 text-sm px-1"
            title="Clear slot"
          >
            ✕
          </button>
        )}
      </span>
    </div>
  );
}
