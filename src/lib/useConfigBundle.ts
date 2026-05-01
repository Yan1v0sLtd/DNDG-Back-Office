// One fetch per page for all config tables of the current environment.
// Pages call this hook ONCE at the top instead of fetching coefficients,
// stat weights, roles, ranks, tiers, and effect types separately.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  AttributeCoefficient,
  BalanceBudget,
  CardTier,
  CombatRole,
  EffectType,
  MasteryRank,
  StatWeight,
} from '@/types/database';

export interface ConfigBundle {
  coefficients: AttributeCoefficient[];
  statWeights: StatWeight[];
  combatRoles: CombatRole[];
  masteryRanks: MasteryRank[];
  cardTiers: CardTier[];
  effectTypes: EffectType[];
  balanceBudgets: BalanceBudget[];
}

interface State {
  bundle: ConfigBundle | null;
  loading: boolean;
  error: string | null;
}

export function useConfigBundle(envId: string | null): State & { reload: () => void } {
  const [state, setState] = useState<State>({ bundle: null, loading: true, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!envId) {
      setState({ bundle: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      const [coef, sw, roles, ranks, tiers, effectTypes, budgets] = await Promise.all([
        supabase.from('attribute_coefficients').select('*').eq('env_id', envId),
        supabase.from('stat_weights').select('*').eq('env_id', envId),
        supabase.from('combat_roles').select('*').eq('env_id', envId).order('display_name'),
        supabase.from('mastery_ranks').select('*').eq('env_id', envId).order('rank'),
        supabase.from('card_tiers').select('*').eq('env_id', envId).order('position'),
        supabase.from('effect_types').select('*').eq('env_id', envId).order('display_name'),
        supabase.from('balance_budgets').select('*').eq('env_id', envId),
      ]);
      if (cancelled) return;

      const err =
        coef.error?.message ||
        sw.error?.message ||
        roles.error?.message ||
        ranks.error?.message ||
        tiers.error?.message ||
        effectTypes.error?.message ||
        budgets.error?.message ||
        null;

      setState({
        bundle: err
          ? null
          : {
              coefficients: (coef.data ?? []) as AttributeCoefficient[],
              statWeights: (sw.data ?? []) as StatWeight[],
              combatRoles: (roles.data ?? []) as CombatRole[],
              masteryRanks: (ranks.data ?? []) as MasteryRank[],
              cardTiers: (tiers.data ?? []) as CardTier[],
              effectTypes: (effectTypes.data ?? []) as EffectType[],
              balanceBudgets: (budgets.data ?? []) as BalanceBudget[],
            },
        loading: false,
        error: err,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [envId, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
