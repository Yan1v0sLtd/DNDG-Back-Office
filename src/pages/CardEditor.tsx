import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { cardPower, effectPower } from '@/lib/card-power-calculator';
import {
  Badge,
  Button,
  Field,
  Input,
  NumberInput,
  PageHeader,
  Panel,
  Score,
} from '@/components/UI';
import type {
  Card,
  CardEffect,
  CardKind,
  CardStatus,
  TargetType,
} from '@/types/database';

interface CardForm {
  name: string;
  kind: CardKind;
  combat_role_id: string | null;
  tier_id: string;
  cooldown_sec: number;
  description: string;
  status: CardStatus;
}

// Local rep of an effect during editing. New ones start with id 'new:N'; on
// save we strip the synthetic id and let Postgres assign a real one. We
// delete-all-and-reinsert on save (simpler than diffing, fine at this scale).
interface DraftEffect {
  id: string; // 'new:N' or real uuid
  effect_type_id: string;
  magnitude: number;
  duration_sec: number;
  target_type: TargetType;
  target_count: number;
  position: number;
}

const TARGET_TYPES: TargetType[] = ['self', 'ally', 'enemy', 'aoe_enemy', 'aoe_ally'];

export function CardEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const { canWriteContent } = useAuth();
  const { currentEnv } = useEnvironment();
  const { bundle, loading: cfgLoading } = useConfigBundle(currentEnv?.id ?? null);
  const navigate = useNavigate();

  const [form, setForm] = useState<CardForm | null>(null);
  const [effects, setEffects] = useState<DraftEffect[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempCounter, setTempCounter] = useState(1);

  // Initialize form once config + (optional) card are loaded.
  useEffect(() => {
    if (!currentEnv || !bundle) return;
    if (isNew) {
      const firstTier = bundle.cardTiers[0];
      if (!firstTier) {
        setError('No card tiers configured. Seed the database first.');
        return;
      }
      setForm({
        name: '',
        kind: 'general',
        combat_role_id: null,
        tier_id: firstTier.id,
        cooldown_sec: firstTier.cooldown_min_sec,
        description: '',
        status: 'draft',
      });
      setEffects([]);
      return;
    }

    let cancelled = false;
    (async () => {
      const [cardRes, effRes] = await Promise.all([
        supabase.from('cards').select('*').eq('id', id).single(),
        supabase.from('card_effects').select('*').eq('card_id', id).order('position'),
      ]);
      if (cancelled) return;
      if (cardRes.error || !cardRes.data) {
        setError(cardRes.error?.message ?? 'Card not found');
        return;
      }
      const c = cardRes.data as Card;
      setForm({
        name: c.name,
        kind: c.kind,
        combat_role_id: c.combat_role_id,
        tier_id: c.tier_id,
        cooldown_sec: c.cooldown_sec,
        description: c.description ?? '',
        status: c.status,
      });
      setEffects(
        ((effRes.data ?? []) as CardEffect[]).map((e) => ({
          id: e.id,
          effect_type_id: e.effect_type_id,
          magnitude: e.magnitude,
          duration_sec: e.duration_sec,
          target_type: e.target_type,
          target_count: e.target_count,
          position: e.position,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew, currentEnv?.id, bundle]);

  const power = useMemo(() => {
    if (!form || !bundle) return null;
    return cardPower(
      { cooldown_sec: form.cooldown_sec, tier_id: form.tier_id },
      effects as unknown as CardEffect[],
      bundle.cardTiers,
      bundle.effectTypes,
    );
  }, [form, effects, bundle]);

  const tier = bundle?.cardTiers.find((t) => t.id === form?.tier_id);

  if (!currentEnv) return null;
  if (cfgLoading || !form) {
    return (
      <Panel>
        <div className="text-muted text-sm">{error ?? 'Loading…'}</div>
      </Panel>
    );
  }

  const writable = canWriteContent();

  const addEffect = () => {
    if (!bundle?.effectTypes[0]) return;
    const tempId = `new:${tempCounter}`;
    setTempCounter((n) => n + 1);
    setEffects((prev) => [
      ...prev,
      {
        id: tempId,
        effect_type_id: bundle.effectTypes[0].id,
        magnitude: 1,
        duration_sec: 0,
        target_type: 'enemy',
        target_count: 1,
        position: prev.length,
      },
    ]);
  };

  const updateEffect = (idx: number, patch: Partial<DraftEffect>) => {
    setEffects((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const removeEffect = (idx: number) => {
    setEffects((prev) => prev.filter((_, i) => i !== idx).map((e, i) => ({ ...e, position: i })));
  };

  const onSave = async () => {
    if (!writable) return;
    setSaving(true);
    setError(null);

    const payload = {
      env_id: currentEnv.id,
      name: form.name.trim(),
      kind: form.kind,
      combat_role_id: form.kind === 'role_specific' ? form.combat_role_id : null,
      tier_id: form.tier_id,
      cooldown_sec: form.cooldown_sec,
      description: form.description.trim() || null,
      status: form.status,
    };

    const cardRes = isNew
      ? await supabase.from('cards').insert(payload).select('id').single()
      : await supabase.from('cards').update(payload).eq('id', id!).select('id').single();

    if (cardRes.error || !cardRes.data) {
      setSaving(false);
      setError(cardRes.error?.message ?? 'Save failed');
      return;
    }

    const cardId = cardRes.data.id as string;

    // Delete-all-and-reinsert for effects. Simpler than diffing; the change_log
    // shows N deletes + N inserts per save, which is acceptable at this scale.
    const del = await supabase.from('card_effects').delete().eq('card_id', cardId);
    if (del.error) {
      setSaving(false);
      setError(del.error.message);
      return;
    }
    if (effects.length > 0) {
      const rows = effects.map((e, i) => ({
        card_id: cardId,
        effect_type_id: e.effect_type_id,
        magnitude: e.magnitude,
        duration_sec: e.duration_sec,
        target_type: e.target_type,
        target_count: e.target_count,
        position: i,
      }));
      const ins = await supabase.from('card_effects').insert(rows);
      if (ins.error) {
        setSaving(false);
        setError(ins.error.message);
        return;
      }
    }

    setSaving(false);
    navigate(`/cards/${cardId}`);
  };

  const onDelete = async () => {
    if (!writable || isNew) return;
    if (!confirm(`Delete card "${form.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('cards').delete().eq('id', id!);
    if (error) {
      setError(error.message);
      return;
    }
    navigate('/cards');
  };

  return (
    <>
      <PageHeader
        title={isNew ? 'New Card' : form.name || 'Card'}
        subtitle={`${currentEnv.name} environment`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/cards')}>Back</Button>
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

              <Field label="Status">
                <select
                  className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as CardStatus })}
                  disabled={!writable}
                >
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </select>
              </Field>

              <Field label="Kind">
                <select
                  className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
                  value={form.kind}
                  onChange={(e) => {
                    const kind = e.target.value as CardKind;
                    setForm({
                      ...form,
                      kind,
                      combat_role_id: kind === 'general' ? null : form.combat_role_id,
                    });
                  }}
                  disabled={!writable}
                >
                  <option value="general">General (any hero)</option>
                  <option value="role_specific">Role-specific</option>
                </select>
              </Field>

              <Field label="Combat Role">
                <select
                  className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm disabled:opacity-50"
                  value={form.combat_role_id ?? ''}
                  onChange={(e) => setForm({ ...form, combat_role_id: e.target.value || null })}
                  disabled={!writable || form.kind !== 'role_specific'}
                >
                  <option value="">— Select role —</option>
                  {bundle?.combatRoles.map((r) => (
                    <option key={r.id} value={r.id}>{r.display_name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Tier">
                <select
                  className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
                  value={form.tier_id}
                  onChange={(e) => setForm({ ...form, tier_id: e.target.value })}
                  disabled={!writable}
                >
                  {bundle?.cardTiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.display_name} (×{t.power_multiplier})
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Cooldown (sec)"
                hint={tier ? `Tier band: ${tier.cooldown_min_sec}–${tier.cooldown_max_sec}s` : undefined}
              >
                <NumberInput
                  value={form.cooldown_sec}
                  min={0}
                  step={0.5}
                  onChange={(n) => setForm({ ...form, cooldown_sec: n })}
                  disabled={!writable}
                />
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

          <Panel
            title="Effects"
            actions={
              writable && (
                <Button variant="ghost" onClick={addEffect}>+ Add Effect</Button>
              )
            }
          >
            {effects.length === 0 ? (
              <div className="text-sm text-muted py-6 text-center border border-dashed border-line rounded">
                No effects yet. {writable && 'Add one to give the card an impact.'}
              </div>
            ) : (
              <div className="space-y-2">
                {effects.map((eff, i) => (
                  <EffectRow
                    key={eff.id}
                    effect={eff}
                    bundle={bundle}
                    writable={writable}
                    onChange={(patch) => updateEffect(i, patch)}
                    onRemove={() => removeEffect(i)}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Computed">
            <div className="space-y-2">
              <Score
                label="Card Power"
                value={power ?? '—'}
                emphasis="bp"
                hint="Internal · feeds hero Balance Power in Phase 3"
              />
              {tier && (
                <Score
                  label={`Tier · ${tier.display_name}`}
                  value={`×${tier.power_multiplier}`}
                />
              )}
              <Score
                label="Cooldown factor"
                value={(10 / (form.cooldown_sec + 1)).toFixed(2)}
                hint="10 / (cooldown_sec + 1)"
              />
            </div>
          </Panel>

          {error && (
            <Panel title="Error">
              <div className="text-sm text-red-400">{error}</div>
            </Panel>
          )}

          <Panel title="Power breakdown">
            {effects.length === 0 ? (
              <div className="text-sm text-muted">Add effects to see breakdown.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="text-left py-1">Effect</th>
                    <th className="text-right py-1">Power</th>
                  </tr>
                </thead>
                <tbody>
                  {effects.map((eff) => {
                    const t = bundle?.effectTypes.find((x) => x.id === eff.effect_type_id);
                    const p = bundle ? Math.round(effectPower(eff as unknown as CardEffect, bundle.effectTypes)) : '—';
                    return (
                      <tr key={eff.id} className="border-t border-line">
                        <td className="py-1.5">{t?.display_name ?? '—'}</td>
                        <td className="py-1.5 text-right text-cyan-400 font-medium">{p}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function EffectRow({
  effect,
  bundle,
  writable,
  onChange,
  onRemove,
}: {
  effect: DraftEffect;
  bundle: ReturnType<typeof useConfigBundle>['bundle'];
  writable: boolean;
  onChange: (patch: Partial<DraftEffect>) => void;
  onRemove: () => void;
}) {
  const t = bundle?.effectTypes.find((x) => x.id === effect.effect_type_id);
  return (
    <div className="bg-ink border border-line rounded-md p-3">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-4">
          <Field label="Effect Type">
            <select
              className="w-full bg-panel border border-line rounded-md px-2 py-1.5 text-sm"
              value={effect.effect_type_id}
              onChange={(e) => onChange({ effect_type_id: e.target.value })}
              disabled={!writable}
            >
              {bundle?.effectTypes.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.display_name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Magnitude">
            <NumberInput
              value={effect.magnitude}
              step={0.5}
              onChange={(n) => onChange({ magnitude: n })}
              disabled={!writable}
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Duration s">
            <NumberInput
              value={effect.duration_sec}
              min={0}
              step={0.5}
              onChange={(n) => onChange({ duration_sec: n })}
              disabled={!writable}
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Target">
            <select
              className="w-full bg-panel border border-line rounded-md px-2 py-1.5 text-sm"
              value={effect.target_type}
              onChange={(e) => onChange({ target_type: e.target.value as TargetType })}
              disabled={!writable}
            >
              {TARGET_TYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {tt.replace('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="col-span-1">
          <Field label="Count">
            <NumberInput
              value={effect.target_count}
              min={1}
              step={1}
              onChange={(n) => onChange({ target_count: Math.max(1, Math.floor(n)) })}
              disabled={!writable}
            />
          </Field>
        </div>
        <div className="col-span-1 pb-1">
          {writable && (
            <button
              type="button"
              onClick={onRemove}
              className="w-full px-2 py-1.5 text-xs text-red-300 hover:bg-red-700/20 border border-line rounded"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {t?.description && (
        <div className="mt-2 text-[11px] text-muted flex items-center gap-2">
          <Badge tone="neutral">{t.category}</Badge>
          <span>{t.description}</span>
        </div>
      )}
    </div>
  );
}
