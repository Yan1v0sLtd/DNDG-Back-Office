// Phase 4 — budget violation logic.
//
// Given a hero's total Balance Power and their (combat_role × mastery_rank)
// budget, return a verdict + a tone for the UI badge. No data fetching here;
// callers pass in the budget row they've already resolved.

import type { BalanceBudget, BudgetVerdict } from '@/types/database';

export function evaluateBudget(
  bpTotal: number | null,
  budget: BalanceBudget | null,
): BudgetVerdict {
  if (bpTotal == null) return 'no_budget';
  if (!budget) return 'no_budget';
  if (budget.bp_min == null && budget.bp_max == null) return 'no_budget';
  if (budget.bp_min != null && bpTotal < budget.bp_min) return 'too_low';
  if (budget.bp_max != null && bpTotal > budget.bp_max) return 'too_high';
  return 'ok';
}

export function findBudget(
  budgets: BalanceBudget[],
  combatRoleId: string,
  masteryRankId: string,
): BalanceBudget | null {
  return (
    budgets.find(
      (b) =>
        b.combat_role_id === combatRoleId &&
        b.mastery_rank_id === masteryRankId,
    ) ?? null
  );
}

export function verdictTone(
  v: BudgetVerdict,
): 'good' | 'warn' | 'bad' | 'neutral' {
  if (v === 'ok') return 'good';
  if (v === 'too_low') return 'warn';
  if (v === 'too_high') return 'bad';
  return 'neutral';
}

export function verdictLabel(v: BudgetVerdict): string {
  switch (v) {
    case 'ok':
      return 'within budget';
    case 'too_low':
      return 'BP below floor';
    case 'too_high':
      return 'BP above ceiling';
    case 'no_budget':
      return 'no budget set';
  }
}
