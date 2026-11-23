// @locs-version: 1.0
type BudgetLike = {
  max_cost_usd?: number | null;
  max_api_calls?: number | null;
  max_llm_tokens?: number | null;
  soft_limit_ratio?: number | null;
};

export type CostDashboardBudgetGaugeState = {
  hint: string | null;
  max: number;
  used: number;
  warnAt: number;
};

export function readCostDashboardRunCostGaugeState(
  budget: BudgetLike | null | undefined,
  usedUsd: number,
): CostDashboardBudgetGaugeState | null {
  if (!budget || typeof budget.max_cost_usd !== "number") return null;
  const softLimitRatio = typeof budget.soft_limit_ratio === "number" ? budget.soft_limit_ratio : 0.8;
  return {
    used: usedUsd,
    max: budget.max_cost_usd,
    warnAt: softLimitRatio * 100,
    hint: `Soft warning at ${Math.round(softLimitRatio * 100)}%.`,
  };
}

export function readCostDashboardApiCallsGaugeState(
  budget: BudgetLike | null | undefined,
  usedCalls: number,
): CostDashboardBudgetGaugeState | null {
  if (!budget || typeof budget.max_api_calls !== "number") return null;
  return {
    used: usedCalls,
    max: budget.max_api_calls,
    warnAt: 80,
    hint: null,
  };
}

export function readCostDashboardTokenGaugeState(
  budget: BudgetLike | null | undefined,
  usedTokens: number,
): CostDashboardBudgetGaugeState | null {
  if (!budget || typeof budget.max_llm_tokens !== "number") return null;
  return {
    used: usedTokens,
    max: budget.max_llm_tokens,
    warnAt: 80,
    hint: null,
  };
}
