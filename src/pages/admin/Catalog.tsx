// Phase 5c-bis — admin catalog: card_tiers, effect_types, combat_roles in
// one tabbed page. Designers were previously editing these via Supabase
// Studio; now they're first-class in the back-office.
//
// All three tables are env-scoped, admin-write per RLS. Inline edit, save
// row-by-row. Delete only when no FKs reference the row (DB enforces).

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import {
  Badge,
  Button,
  Input,
  NumberInput,
  PageHeader,
  Panel,
} from '@/components/UI';
import type {
  CardTier,
  CombatRole,
  EffectCategory,
  EffectType,
  RangeKind,
} from '@/types/database';

type Tab = 'tiers' | 'effects' | 'roles';

export function CatalogAdmin() {
  const { canWriteConfig } = useAuth();
  const { currentEnv } = useEnvironment();
  const { bundle, loading, reload } = useConfigBundle(currentEnv?.id ?? null);
  const [tab, setTab] = useState<Tab>('tiers');

  if (!canWriteConfig()) return <Navigate to="/heroes" replace />;
  if (!currentEnv) return null;

  return (
    <>
      <PageHeader
        title="Catalog"
        subtitle={`${currentEnv.name} environment · card tiers, effect types, combat roles`}
      />

      <div className="flex gap-2 mb-4">
        <TabBtn active={tab === 'tiers'} onClick={() => setTab('tiers')}>Card Tiers</TabBtn>
        <TabBtn active={tab === 'effects'} onClick={() => setTab('effects')}>Effect Types</TabBtn>
        <TabBtn active={tab === 'roles'} onClick={() => setTab('roles')}>Combat Roles</TabBtn>
      </div>

      {loading ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : (
        <>
          {tab === 'tiers' && (
            <TiersTable
              envId={currentEnv.id}
              tiers={bundle?.cardTiers ?? []}
              onReload={reload}
            />
          )}
          {tab === 'effects' && (
            <EffectsTable
              envId={currentEnv.id}
              effects={bundle?.effectTypes ?? []}
              onReload={reload}
            />
          )}
          {tab === 'roles' && (
            <RolesTable
              envId={currentEnv.id}
              roles={bundle?.combatRoles ?? []}
              onReload={reload}
            />
          )}
        </>
      )}
    </>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-md border ${
        active
          ? 'bg-accent/10 border-accent text-accent'
          : 'border-line text-slate-200 hover:bg-panel'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Card Tiers ────────────────────────────────────────────────────────────

function TiersTable({
  envId,
  tiers,
  onReload,
}: {
  envId: string;
  tiers: CardTier[];
  onReload: () => void;
}) {
  const [rows, setRows] = useState<(CardTier & { _dirty?: boolean })[]>(tiers);
  const [adding, setAdding] = useState<Partial<CardTier>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setRows(tiers);
  }, [tiers]);

  const update = (i: number, patch: Partial<CardTier>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch, _dirty: true } : r)));

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    const dirty = rows.filter((r) => r._dirty).map(({ _dirty: _, ...r }) => r);
    if (dirty.length > 0) {
      const { error } = await supabase
        .from('card_tiers')
        .upsert(dirty, { onConflict: 'id' });
      if (error) {
        setSaving(false);
        setMsg(error.message);
        return;
      }
    }
    setSaving(false);
    setMsg('Saved.');
    onReload();
  };

  const onAdd = async () => {
    if (!adding.slug || !adding.display_name || adding.position == null) {
      setMsg('Slug, display name, and position are required.');
      return;
    }
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.from('card_tiers').insert({
      env_id: envId,
      slug: adding.slug,
      display_name: adding.display_name,
      cooldown_min_sec: adding.cooldown_min_sec ?? 0,
      cooldown_max_sec: adding.cooldown_max_sec ?? 0,
      power_multiplier: adding.power_multiplier ?? 1,
      position: adding.position,
    });
    setSaving(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setAdding({});
    onReload();
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete tier "${name}"?`)) return;
    const { error } = await supabase.from('card_tiers').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    onReload();
  };

  return (
    <Panel
      title="Card Tiers"
      actions={
        <Button onClick={onSave} disabled={saving || !rows.some((r) => r._dirty)}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      }
    >
      <table className="w-full text-sm">
        <thead className="text-xs text-muted uppercase tracking-wider">
          <tr>
            <th className="text-left py-2">Slug</th>
            <th className="text-left py-2">Display</th>
            <th className="text-right py-2">CD min (s)</th>
            <th className="text-right py-2">CD max (s)</th>
            <th className="text-right py-2">Power ×</th>
            <th className="text-right py-2">Position</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-2 pr-2"><Input value={r.slug} onChange={(e) => update(i, { slug: e.target.value })} /></td>
              <td className="py-2 pr-2"><Input value={r.display_name} onChange={(e) => update(i, { display_name: e.target.value })} /></td>
              <td className="py-2 pr-2 w-24"><NumberInput value={r.cooldown_min_sec} step={0.5} onChange={(n) => update(i, { cooldown_min_sec: n })} /></td>
              <td className="py-2 pr-2 w-24"><NumberInput value={r.cooldown_max_sec} step={0.5} onChange={(n) => update(i, { cooldown_max_sec: n })} /></td>
              <td className="py-2 pr-2 w-24"><NumberInput value={r.power_multiplier} step={0.05} onChange={(n) => update(i, { power_multiplier: n })} /></td>
              <td className="py-2 pr-2 w-20"><NumberInput value={r.position} step={1} onChange={(n) => update(i, { position: n })} /></td>
              <td className="py-2"><Button variant="danger" onClick={() => onDelete(r.id, r.display_name)}>✕</Button></td>
            </tr>
          ))}
          <tr className="border-t border-line">
            <td className="py-2 pr-2"><Input placeholder="rare" value={adding.slug ?? ''} onChange={(e) => setAdding({ ...adding, slug: e.target.value })} /></td>
            <td className="py-2 pr-2"><Input placeholder="Rare" value={adding.display_name ?? ''} onChange={(e) => setAdding({ ...adding, display_name: e.target.value })} /></td>
            <td className="py-2 pr-2"><NumberInput value={adding.cooldown_min_sec ?? 0} step={0.5} onChange={(n) => setAdding({ ...adding, cooldown_min_sec: n })} /></td>
            <td className="py-2 pr-2"><NumberInput value={adding.cooldown_max_sec ?? 0} step={0.5} onChange={(n) => setAdding({ ...adding, cooldown_max_sec: n })} /></td>
            <td className="py-2 pr-2"><NumberInput value={adding.power_multiplier ?? 1} step={0.05} onChange={(n) => setAdding({ ...adding, power_multiplier: n })} /></td>
            <td className="py-2 pr-2"><NumberInput value={adding.position ?? 0} step={1} onChange={(n) => setAdding({ ...adding, position: n })} /></td>
            <td className="py-2"><Button onClick={onAdd}>Add</Button></td>
          </tr>
        </tbody>
      </table>
      {msg && <div className="mt-3 text-xs text-muted">{msg}</div>}
    </Panel>
  );
}

// ─── Effect Types ──────────────────────────────────────────────────────────

const CATEGORIES: EffectCategory[] = ['offense', 'defense', 'control', 'utility'];

function EffectsTable({
  envId,
  effects,
  onReload,
}: {
  envId: string;
  effects: EffectType[];
  onReload: () => void;
}) {
  const [rows, setRows] = useState<(EffectType & { _dirty?: boolean })[]>(effects);
  const [adding, setAdding] = useState<Partial<EffectType>>({ category: 'offense' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setRows(effects);
  }, [effects]);

  const update = (i: number, patch: Partial<EffectType>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch, _dirty: true } : r)));

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    const dirty = rows.filter((r) => r._dirty).map(({ _dirty: _, ...r }) => r);
    if (dirty.length > 0) {
      const { error } = await supabase
        .from('effect_types')
        .upsert(dirty, { onConflict: 'id' });
      if (error) {
        setSaving(false);
        setMsg(error.message);
        return;
      }
    }
    setSaving(false);
    setMsg('Saved.');
    onReload();
  };

  const onAdd = async () => {
    if (!adding.slug || !adding.display_name || adding.pp_weight == null) {
      setMsg('Slug, display name, and pp_weight are required.');
      return;
    }
    const { error } = await supabase.from('effect_types').insert({
      env_id: envId,
      slug: adding.slug,
      display_name: adding.display_name,
      category: adding.category ?? 'offense',
      pp_weight: adding.pp_weight,
      description: adding.description ?? null,
    });
    if (error) {
      setMsg(error.message);
      return;
    }
    setAdding({ category: 'offense' });
    onReload();
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete effect type "${name}"?`)) return;
    const { error } = await supabase.from('effect_types').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    onReload();
  };

  return (
    <Panel
      title="Effect Types"
      actions={
        <Button onClick={onSave} disabled={saving || !rows.some((r) => r._dirty)}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      }
    >
      <table className="w-full text-sm">
        <thead className="text-xs text-muted uppercase tracking-wider">
          <tr>
            <th className="text-left py-2">Slug</th>
            <th className="text-left py-2">Display</th>
            <th className="text-left py-2 w-32">Category</th>
            <th className="text-right py-2 w-24">pp_weight</th>
            <th className="text-left py-2">Description</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-2 pr-2"><Input value={r.slug} onChange={(e) => update(i, { slug: e.target.value })} /></td>
              <td className="py-2 pr-2"><Input value={r.display_name} onChange={(e) => update(i, { display_name: e.target.value })} /></td>
              <td className="py-2 pr-2">
                <select
                  className="w-full bg-ink border border-line rounded-md px-2 py-1.5 text-sm"
                  value={r.category}
                  onChange={(e) => update(i, { category: e.target.value as EffectCategory })}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td className="py-2 pr-2"><NumberInput value={r.pp_weight} step={0.1} onChange={(n) => update(i, { pp_weight: n })} /></td>
              <td className="py-2 pr-2"><Input value={r.description ?? ''} onChange={(e) => update(i, { description: e.target.value })} /></td>
              <td className="py-2"><Button variant="danger" onClick={() => onDelete(r.id, r.display_name)}>✕</Button></td>
            </tr>
          ))}
          <tr className="border-t border-line">
            <td className="py-2 pr-2"><Input placeholder="silence" value={adding.slug ?? ''} onChange={(e) => setAdding({ ...adding, slug: e.target.value })} /></td>
            <td className="py-2 pr-2"><Input placeholder="Silence" value={adding.display_name ?? ''} onChange={(e) => setAdding({ ...adding, display_name: e.target.value })} /></td>
            <td className="py-2 pr-2">
              <select
                className="w-full bg-ink border border-line rounded-md px-2 py-1.5 text-sm"
                value={adding.category ?? 'offense'}
                onChange={(e) => setAdding({ ...adding, category: e.target.value as EffectCategory })}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </td>
            <td className="py-2 pr-2"><NumberInput value={adding.pp_weight ?? 1} step={0.1} onChange={(n) => setAdding({ ...adding, pp_weight: n })} /></td>
            <td className="py-2 pr-2"><Input value={adding.description ?? ''} placeholder="What does it do?" onChange={(e) => setAdding({ ...adding, description: e.target.value })} /></td>
            <td className="py-2"><Button onClick={onAdd}>Add</Button></td>
          </tr>
        </tbody>
      </table>
      {msg && <div className="mt-3 text-xs text-muted">{msg}</div>}
    </Panel>
  );
}

// ─── Combat Roles ──────────────────────────────────────────────────────────

const RANGE_KINDS: RangeKind[] = ['melee', 'ranged', 'mixed'];

function RolesTable({
  envId,
  roles,
  onReload,
}: {
  envId: string;
  roles: CombatRole[];
  onReload: () => void;
}) {
  const [rows, setRows] = useState<(CombatRole & { _dirty?: boolean })[]>(roles);
  const [adding, setAdding] = useState<Partial<CombatRole>>({ range_kind: 'melee' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setRows(roles);
  }, [roles]);

  const update = (i: number, patch: Partial<CombatRole>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch, _dirty: true } : r)));

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    const dirty = rows.filter((r) => r._dirty).map(({ _dirty: _, ...r }) => r);
    if (dirty.length > 0) {
      const { error } = await supabase
        .from('combat_roles')
        .upsert(dirty, { onConflict: 'id' });
      if (error) {
        setSaving(false);
        setMsg(error.message);
        return;
      }
    }
    setSaving(false);
    setMsg('Saved.');
    onReload();
  };

  const onAdd = async () => {
    if (!adding.slug || !adding.display_name) {
      setMsg('Slug and display name are required.');
      return;
    }
    const { error } = await supabase.from('combat_roles').insert({
      env_id: envId,
      slug: adding.slug,
      display_name: adding.display_name,
      description: adding.description ?? null,
      range_kind: adding.range_kind ?? 'melee',
    });
    if (error) {
      setMsg(error.message);
      return;
    }
    setAdding({ range_kind: 'melee' });
    onReload();
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete role "${name}"? Heroes/cards using this role will block deletion.`)) return;
    const { error } = await supabase.from('combat_roles').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    onReload();
  };

  return (
    <Panel
      title="Combat Roles"
      actions={
        <Button onClick={onSave} disabled={saving || !rows.some((r) => r._dirty)}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      }
    >
      <table className="w-full text-sm">
        <thead className="text-xs text-muted uppercase tracking-wider">
          <tr>
            <th className="text-left py-2">Slug</th>
            <th className="text-left py-2">Display</th>
            <th className="text-left py-2 w-28">Range kind</th>
            <th className="text-left py-2">Description</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-2 pr-2"><Input value={r.slug} onChange={(e) => update(i, { slug: e.target.value })} /></td>
              <td className="py-2 pr-2"><Input value={r.display_name} onChange={(e) => update(i, { display_name: e.target.value })} /></td>
              <td className="py-2 pr-2">
                <select
                  className="w-full bg-ink border border-line rounded-md px-2 py-1.5 text-sm"
                  value={r.range_kind}
                  onChange={(e) => update(i, { range_kind: e.target.value as RangeKind })}
                >
                  {RANGE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </td>
              <td className="py-2 pr-2"><Input value={r.description ?? ''} onChange={(e) => update(i, { description: e.target.value })} /></td>
              <td className="py-2"><Button variant="danger" onClick={() => onDelete(r.id, r.display_name)}>✕</Button></td>
            </tr>
          ))}
          <tr className="border-t border-line">
            <td className="py-2 pr-2"><Input placeholder="elementalist" value={adding.slug ?? ''} onChange={(e) => setAdding({ ...adding, slug: e.target.value })} /></td>
            <td className="py-2 pr-2"><Input placeholder="Elementalist" value={adding.display_name ?? ''} onChange={(e) => setAdding({ ...adding, display_name: e.target.value })} /></td>
            <td className="py-2 pr-2">
              <select
                className="w-full bg-ink border border-line rounded-md px-2 py-1.5 text-sm"
                value={adding.range_kind ?? 'melee'}
                onChange={(e) => setAdding({ ...adding, range_kind: e.target.value as RangeKind })}
              >
                {RANGE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </td>
            <td className="py-2 pr-2"><Input placeholder="(optional)" value={adding.description ?? ''} onChange={(e) => setAdding({ ...adding, description: e.target.value })} /></td>
            <td className="py-2"><Button onClick={onAdd}>Add</Button></td>
          </tr>
        </tbody>
      </table>
      {msg && <div className="mt-3 text-xs text-muted">{msg}</div>}
      <p className="text-xs text-muted mt-3">
        <Badge tone="warn">Heads up</Badge> Renaming or deleting a role affects all heroes and
        cards that reference it. The DB blocks deletion when any reference exists.
      </p>
    </Panel>
  );
}
