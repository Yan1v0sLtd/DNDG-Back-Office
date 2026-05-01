import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { deriveStats, masteryScore } from '@/lib/ms-calculator';
import { balancePowerFromStats } from '@/lib/balance-power-calculator';
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
import type { Attribute, Hero, HeroAttributes, HeroStatus } from '@/types/database';

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

export function HeroEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const { canWriteContent } = useAuth();
  const { currentEnv } = useEnvironment();
  const { bundle, loading: cfgLoading } = useConfigBundle(currentEnv?.id ?? null);
  const navigate = useNavigate();

  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form once config + (optional) hero are loaded.
  useEffect(() => {
    if (!currentEnv || !bundle) return;
    if (isNew) {
      setForm(empty(bundle.combatRoles[0]?.id ?? ''));
      return;
    }
    let cancelled = false;
    supabase
      .from('heroes')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setError(error?.message ?? 'Hero not found');
          return;
        }
        const h = data as Hero;
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
      });
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
  const bp = stats && bundle ? balancePowerFromStats(stats, bundle.statWeights) : null;

  const masteryRank = useMemo(() => {
    if (ms == null || !bundle) return null;
    const reached = bundle.masteryRanks.filter((r) => r.ms_threshold <= ms);
    return reached[reached.length - 1] ?? null;
  }, [ms, bundle]);

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
    const result = isNew
      ? await supabase.from('heroes').insert(payload).select('id').single()
      : await supabase.from('heroes').update(payload).eq('id', id!).select('id').single();
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    navigate(`/heroes/${result.data.id}`);
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
                  onChange={(e) => setForm({ ...form, combat_role_id: e.target.value })}
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
        </div>

        <div className="space-y-4">
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
                value={bp ?? '—'}
                emphasis="bp"
                hint="Internal · sim & budgets"
              />
            </div>
          </Panel>

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
