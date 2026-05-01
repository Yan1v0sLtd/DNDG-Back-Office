import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { Button, NumberInput, PageHeader, Panel } from '@/components/UI';
import type { AttributeCoefficient, StatWeight } from '@/types/database';

export function CoefficientsAdmin() {
  const { canWriteConfig } = useAuth();
  const { currentEnv } = useEnvironment();
  const { bundle, loading, reload } = useConfigBundle(currentEnv?.id ?? null);

  const [coef, setCoef] = useState<AttributeCoefficient[]>([]);
  const [weights, setWeights] = useState<StatWeight[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (bundle) {
      setCoef(bundle.coefficients);
      setWeights(bundle.statWeights);
    }
  }, [bundle]);

  if (!canWriteConfig()) return <Navigate to="/heroes" replace />;
  if (!currentEnv) return null;

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    const a = await supabase
      .from('attribute_coefficients')
      .upsert(coef, { onConflict: 'env_id,attribute' });
    const b = await supabase
      .from('stat_weights')
      .upsert(weights, { onConflict: 'env_id,stat' });
    setSaving(false);
    if (a.error || b.error) {
      setMsg(a.error?.message ?? b.error?.message ?? 'Save failed');
    } else {
      setMsg('Saved. All hero scores will reflect the new values on next load.');
      reload();
    }
  };

  return (
    <>
      <PageHeader
        title="Coefficients"
        subtitle={`${currentEnv.name} environment · attribute → stat conversions and score weights`}
        actions={<Button onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>}
      />

      {loading ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Attribute → Stat (per 1 attribute point)">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted uppercase tracking-wider">
                <tr>
                  <th className="text-left py-2">Attribute</th>
                  <th className="text-right py-2">Stat per point</th>
                </tr>
              </thead>
              <tbody>
                {coef.map((c, i) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-2 capitalize">{c.attribute}</td>
                    <td className="py-2 w-32">
                      <NumberInput
                        value={c.stat_per_point}
                        step={0.01}
                        onChange={(n) =>
                          setCoef(coef.map((x, j) => (j === i ? { ...x, stat_per_point: n } : x)))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="Stat Weights (Mastery Score / Balance Power)">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted uppercase tracking-wider">
                <tr>
                  <th className="text-left py-2">Stat</th>
                  <th className="text-right py-2">MS Weight</th>
                  <th className="text-right py-2">BP Weight</th>
                </tr>
              </thead>
              <tbody>
                {weights.map((w, i) => (
                  <tr key={w.id} className="border-t border-line">
                    <td className="py-2 lowercase">{w.stat}</td>
                    <td className="py-2 w-28">
                      <NumberInput
                        value={w.ms_weight}
                        step={0.5}
                        onChange={(n) =>
                          setWeights(weights.map((x, j) => (j === i ? { ...x, ms_weight: n } : x)))
                        }
                      />
                    </td>
                    <td className="py-2 w-28">
                      <NumberInput
                        value={w.bp_weight}
                        step={0.5}
                        onChange={(n) =>
                          setWeights(weights.map((x, j) => (j === i ? { ...x, bp_weight: n } : x)))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted mt-3">
              MS is the player-facing score (range = 0 per GDD). BP is internal — give Range a real
              weight here.
            </p>
          </Panel>
        </div>
      )}

      {msg && <div className="mt-4 text-sm text-muted">{msg}</div>}
    </>
  );
}
