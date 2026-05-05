// Tier 1 admin — edit the simulator's timing constants and verdict bands.

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { Button, Field, NumberInput, PageHeader, Panel } from '@/components/UI';
import { SIMULATOR_CONFIG_DEFAULTS, type SimulatorConfig } from '@/types/database';

export function SimulatorAdmin() {
  const { canWriteConfig } = useAuth();
  const { currentEnv } = useEnvironment();
  const { bundle, loading, reload } = useConfigBundle(currentEnv?.id ?? null);
  const [form, setForm] = useState<SimulatorConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (bundle?.simulatorConfig) setForm(bundle.simulatorConfig);
  }, [bundle?.simulatorConfig]);

  if (!canWriteConfig()) return <Navigate to="/heroes" replace />;
  if (!currentEnv) return null;

  const onSave = async () => {
    if (!form) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from('simulator_config')
      .upsert(form, { onConflict: 'env_id' });
    setSaving(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg('Saved. New runs will use these values immediately.');
    reload();
  };

  const onReset = () => {
    if (!form) return;
    setForm({ ...form, ...SIMULATOR_CONFIG_DEFAULTS });
  };

  return (
    <>
      <PageHeader
        title="Simulator Config"
        subtitle={`${currentEnv.name} environment · timing constants and verdict bands`}
        actions={
          <>
            <Button variant="ghost" onClick={onReset} disabled={!form}>
              Reset to defaults
            </Button>
            <Button onClick={onSave} disabled={saving || !form}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      />

      {loading || !form ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Battle timing">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tick (sec)" hint="Sim time-step. Lower = finer-grained, slower compute.">
                <NumberInput
                  value={form.tick_sec}
                  step={0.05}
                  onChange={(n) => setForm({ ...form, tick_sec: n })}
                />
              </Field>
              <Field label="Max battle (sec)" hint="Hard timeout. Whoever has more HP% at this point wins.">
                <NumberInput
                  value={form.max_battle_sec}
                  step={1}
                  onChange={(n) => setForm({ ...form, max_battle_sec: n })}
                />
              </Field>
              <Field label="Basic attack CD (sec)" hint="Time between auto-attacks when no card fires.">
                <NumberInput
                  value={form.basic_attack_cd}
                  step={0.1}
                  onChange={(n) => setForm({ ...form, basic_attack_cd: n })}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Positioning (kiting)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Close speed (grid/s)" hint="How fast a hero moves toward an opponent who is out of their range.">
                <NumberInput
                  value={form.close_speed}
                  step={0.5}
                  onChange={(n) => setForm({ ...form, close_speed: n })}
                />
              </Field>
              <Field label="Retreat speed (grid/s)" hint="How fast a kiter pulls away. Lower than close_speed = kiting penalty.">
                <NumberInput
                  value={form.retreat_speed}
                  step={0.5}
                  onChange={(n) => setForm({ ...form, retreat_speed: n })}
                />
              </Field>
            </div>
            <p className="text-xs text-muted mt-2">
              If <code>retreat_speed ≥ close_speed</code>, ranged heroes can kite forever
              and melee never engages. Keep retreat strictly less unless that's intentional.
            </p>
          </Panel>

          <Panel title="Verdict band">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min (balanced lower)" hint="Win rates below this flag the matchup as B-favored.">
                <NumberInput
                  value={form.verdict_band_min}
                  step={0.01}
                  min={0}
                  max={1}
                  onChange={(n) => setForm({ ...form, verdict_band_min: n })}
                />
              </Field>
              <Field label="Max (balanced upper)" hint="Win rates above this flag the matchup as A-favored.">
                <NumberInput
                  value={form.verdict_band_max}
                  step={0.01}
                  min={0}
                  max={1}
                  onChange={(n) => setForm({ ...form, verdict_band_max: n })}
                />
              </Field>
            </div>
            <p className="text-xs text-muted mt-2">
              Values are in [0, 1]. Default 0.45 / 0.55 = "balanced if 45–55%". Tighten
              for stricter balance, loosen for early-stage tolerance.
            </p>
          </Panel>

          <Panel title="UI defaults">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pairwise default runs" hint="Initial run count on /simulator.">
                <NumberInput
                  value={form.default_pairwise_runs}
                  step={100}
                  onChange={(n) => setForm({ ...form, default_pairwise_runs: n })}
                />
              </Field>
              <Field label="Sweep default runs" hint="Initial runs/matchup on /sweep.">
                <NumberInput
                  value={form.default_sweep_runs}
                  step={50}
                  onChange={(n) => setForm({ ...form, default_sweep_runs: n })}
                />
              </Field>
            </div>
          </Panel>
        </div>
      )}

      {msg && <div className="mt-4 text-sm text-muted">{msg}</div>}
    </>
  );
}
