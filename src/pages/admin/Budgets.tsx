// Phase 4 admin page — set BP envelope per (combat_role × mastery_rank).
// Filter-by-role view: pick a role, edit 15 rank rows. Avoids a 75-cell grid.

import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useConfigBundle } from '@/lib/useConfigBundle';
import { Button, Input, PageHeader, Panel } from '@/components/UI';
import type { BalanceBudget } from '@/types/database';

interface RankRow {
  mastery_rank_id: string;
  rank: number;
  ms_threshold: number;
  bp_min: number | null;
  bp_max: number | null;
  notes: string;
  // dirty flag — true if the row was touched and needs upsert (or delete if all empty)
  touched: boolean;
}

export function BudgetsAdmin() {
  const { canWriteConfig } = useAuth();
  const { currentEnv } = useEnvironment();
  const { bundle, loading, reload } = useConfigBundle(currentEnv?.id ?? null);
  const [roleId, setRoleId] = useState<string>('');
  const [rows, setRows] = useState<RankRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Default to the first role once roles load.
  useEffect(() => {
    if (!roleId && bundle?.combatRoles[0]) setRoleId(bundle.combatRoles[0].id);
  }, [bundle, roleId]);

  // Build the 15-rank rows for the selected role, merging existing budget data.
  useEffect(() => {
    if (!bundle || !roleId) return;
    const existing = new Map<string, BalanceBudget>();
    bundle.balanceBudgets
      .filter((b) => b.combat_role_id === roleId)
      .forEach((b) => existing.set(b.mastery_rank_id, b));

    const next = bundle.masteryRanks.map<RankRow>((r) => {
      const e = existing.get(r.id);
      return {
        mastery_rank_id: r.id,
        rank: r.rank,
        ms_threshold: r.ms_threshold,
        bp_min: e?.bp_min ?? null,
        bp_max: e?.bp_max ?? null,
        notes: e?.notes ?? '',
        touched: false,
      };
    });
    setRows(next);
    setMsg(null);
  }, [bundle, roleId]);

  const dirtyCount = useMemo(() => rows.filter((r) => r.touched).length, [rows]);

  if (!canWriteConfig()) return <Navigate to="/heroes" replace />;
  if (!currentEnv) return null;

  const update = (i: number, patch: Partial<RankRow>) =>
    setRows((prev) =>
      prev.map((r, j) => (j === i ? { ...r, ...patch, touched: true } : r)),
    );

  const onSave = async () => {
    if (!currentEnv) return;
    setSaving(true);
    setMsg(null);

    const dirty = rows.filter((r) => r.touched);
    const upsertRows = dirty
      .filter((r) => r.bp_min != null || r.bp_max != null || r.notes.trim() !== '')
      .map((r) => ({
        env_id: currentEnv.id,
        combat_role_id: roleId,
        mastery_rank_id: r.mastery_rank_id,
        bp_min: r.bp_min,
        bp_max: r.bp_max,
        notes: r.notes.trim() || null,
      }));
    const deleteRanks = dirty
      .filter((r) => r.bp_min == null && r.bp_max == null && r.notes.trim() === '')
      .map((r) => r.mastery_rank_id);

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from('balance_budgets')
        .upsert(upsertRows, { onConflict: 'env_id,combat_role_id,mastery_rank_id' });
      if (error) {
        setSaving(false);
        setMsg(error.message);
        return;
      }
    }
    if (deleteRanks.length > 0) {
      const { error } = await supabase
        .from('balance_budgets')
        .delete()
        .eq('env_id', currentEnv.id)
        .eq('combat_role_id', roleId)
        .in('mastery_rank_id', deleteRanks);
      if (error) {
        setSaving(false);
        setMsg(error.message);
        return;
      }
    }

    setSaving(false);
    setMsg('Saved.');
    reload();
  };

  const role = bundle?.combatRoles.find((r) => r.id === roleId);

  return (
    <>
      <PageHeader
        title="Balance Budgets"
        subtitle={`${currentEnv.name} environment · BP envelope per (combat role × mastery rank)`}
        actions={
          <Button onClick={onSave} disabled={saving || dirtyCount === 0}>
            {saving ? 'Saving…' : `Save${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
          </Button>
        }
      />

      {loading ? (
        <Panel><div className="text-muted text-sm">Loading…</div></Panel>
      ) : (
        <Panel
          title={role ? role.display_name : 'Pick a role'}
          actions={
            <select
              className="bg-ink border border-line rounded-md px-2 py-1.5 text-sm"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              {bundle?.combatRoles.map((r) => (
                <option key={r.id} value={r.id}>{r.display_name}</option>
              ))}
            </select>
          }
        >
          <table className="w-full text-sm">
            <thead className="text-xs text-muted uppercase tracking-wider">
              <tr>
                <th className="text-left py-2 w-12">Rank</th>
                <th className="text-right py-2 w-24">MS ≥</th>
                <th className="text-right py-2 w-32">BP Min</th>
                <th className="text-right py-2 w-32">BP Max</th>
                <th className="text-left py-2 pl-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.mastery_rank_id} className="border-t border-line">
                  <td className="py-2 font-medium">#{r.rank}</td>
                  <td className="py-2 text-right text-muted">{r.ms_threshold}</td>
                  <td className="py-2">
                    <NullableNumberInput
                      value={r.bp_min}
                      onChange={(v) => update(i, { bp_min: v })}
                    />
                  </td>
                  <td className="py-2">
                    <NullableNumberInput
                      value={r.bp_max}
                      onChange={(v) => update(i, { bp_max: v })}
                    />
                  </td>
                  <td className="py-2 pl-4">
                    <Input
                      value={r.notes}
                      placeholder="—"
                      onChange={(e) => update(i, { notes: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted mt-3">
            Leave both bounds empty to remove a budget for that rank. Heroes whose BP falls
            outside the envelope are flagged on the editor and the heroes list.
          </p>
        </Panel>
      )}

      {msg && <div className="mt-4 text-sm text-muted">{msg}</div>}
    </>
  );
}

function NullableNumberInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      placeholder="—"
      step={50}
      onChange={(e) => {
        const s = e.target.value.trim();
        if (s === '') return onChange(null);
        const n = parseFloat(s);
        onChange(Number.isFinite(n) ? Math.round(n) : null);
      }}
      className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-accent text-right"
    />
  );
}
