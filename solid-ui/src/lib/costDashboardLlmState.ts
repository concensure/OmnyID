// @locs-version: 1.0
type LlmLike = {
  monthly_budget_cents?: number | null;
  usage_cents_current_month?: number | null;
};

export type CostDashboardLlmGaugeState = {
  usedUsd: number;
  maxUsd: number;
};

function money(value: number): string {
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

export function readCostDashboardLlmBudgetValue(llm: LlmLike | null | undefined): string {
  if (!llm) return "Unavailable";
  if (typeof llm.monthly_budget_cents !== "number") return "Budget unavailable";
  return money(llm.monthly_budget_cents / 100);
}

export function readCostDashboardLlmBudgetDetail(llm: LlmLike | null | undefined): string {
  if (!llm) {
    return "Retry the dashboard to confirm the hosted model budget and current monthly usage.";
  }
  if (
    typeof llm.monthly_budget_cents !== "number" ||
    typeof llm.usage_cents_current_month !== "number"
  ) {
    return "Retry the dashboard to confirm the hosted model budget and current monthly usage.";
  }
  return `${money(llm.usage_cents_current_month / 100)} used so far this month.`;
}

export function readCostDashboardLlmGaugeState(
  llm: LlmLike | null | undefined,
): CostDashboardLlmGaugeState | null {
  if (!llm) return null;
  if (
    typeof llm.monthly_budget_cents !== "number" ||
    typeof llm.usage_cents_current_month !== "number"
  ) {
    return null;
  }
  return {
    usedUsd: llm.usage_cents_current_month / 100,
    maxUsd: llm.monthly_budget_cents / 100,
  };
}
