// Tier 3: data-driven coefficients editor.
//   • Attribute coefficients: pick which stat each attribute produces, set
//     the rate. (Was previously a hardcoded mapping.)
//   • Stat weights: ms_weight + bp_weight per stat (rows derived from the
//     stats table, not a hardcoded enum).

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
      .upsert(coef, { onConflict: 'env_id,attribute_id' });
    const b = await supabase
      .from('stat_weights')
      .upsert(weights, { onConflict: 'env_id,stat_id' });
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
                  <th className="text-left py-2">Produces stat</th>
                  <th className="text-right py-2">Rate</th>
                </tr>
              </thead>
              <tbody>
                {coef.map((c, i) => {
                  const attr = bundle?.attributes.find((a) => a.id === c.attribute_id);
                  return (
                    <tr key={c.id} className="border-t border-line">
                      <td className="py-2">{attr?.display_name ?? '(unknown)'}</td>
                      <td className="py-2 pr-2">
                        <select
                          className="w-full bg-ink border border-line rounded-md px-2 py-1.5 text-sm"
                          value={c.produces_stat_id}
                          onChange={(e) =>
                            setCoef(
                              coef.map((x, j) =>
                                j === i ? { ...x, produces_stat_id: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          {bundle?.stats.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.display_name}
                              {s.unit_label ? ` (${s.unit_label})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
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
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-muted mt-3">
              Each row says: 1 point of <em>attribute</em> produces <em>rate</em> units of the
              chosen stat. To add a new attribute or rename one, go to Admin → Catalog → Attributes.
            </p>
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
                {weights.map((w, i) => {
                  const stat = bundle?.stats.find((s) => s.id === w.stat_id);
                  return (
                    <tr key={w.id} className="border-t border-line">
                      <td className="py-2">
                        {stat?.display_name ?? '(unknown)'}
                        {stat?.unit_label ? <span className="text-muted ml-1">({stat.unit_label})</span> : null}
                      </td>
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
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-muted mt-3">
              MS is the player-facing score (Range typically 0 per GDD). BP is internal — give
              Range a real weight here. Rows come from the stats table; manage stats themselves
              at Admin → Catalog → Stats.
            </p>
          </Panel>
        </div>
      )}

      {msg && <div className="mt-4 text-sm text-muted">{msg}</div>}
    </>
  );
}
