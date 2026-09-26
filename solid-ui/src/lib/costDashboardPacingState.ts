// @locs-version: 1.0
type BudgetLike = {
  max_cost_usd?: number | null;
};

type SpendHistoryLike = {
  cost_usd?: number | null;
};

export type CostDashboardProjectionState = {
  days: number | null;
  reason: "insufficient" | "retry" | null;
};

function hasCompleteSpendHistory(history: SpendHistoryLike[]): boolean {
  return history.every((item) => typeof item.cost_usd === "number");
}

function totalSpend(history: SpendHistoryLike[]): number {
  return history.reduce((sum, item) => sum + (typeof item.cost_usd === "number" ? item.cost_usd : 0), 0);
}

function activeSpendDays(history: SpendHistoryLike[]): number {
  return history.filter((item) => typeof item.cost_usd === "number" && item.cost_usd > 0).length;
}

export function readCostDashboardPaceStatus(
  budget: BudgetLike | null | undefined,
  history: SpendHistoryLike[],
  nowMs: number,
): string {
  if (!budget || typeof budget.max_cost_usd !== "number" || budget.max_cost_usd <= 0) {
    return "No monthly cap set";
  }
  if (!hasCompleteSpendHistory(history)) {
    return "Retry the dashboard to confirm current daily spend before projecting budget pace.";
  }
  const currentDate = new Date(nowMs);
  const day = currentDate.getDate();
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const monthProgress = daysInMonth > 0 ? day / daysInMonth : 0;
  const spendFraction = totalSpend(history) / budget.max_cost_usd;
  if (spendFraction > monthProgress + 0.08) return "Ahead of pace";
  if (spendFraction < monthProgress - 0.08) return "Under pace";
  return "On pace";
}

export function readCostDashboardProjectionState(
  budget: BudgetLike | null | undefined,
  history: SpendHistoryLike[],
): CostDashboardProjectionState {
  if (!budget || typeof budget.max_cost_usd !== "number" || budget.max_cost_usd <= 0) {
    return { days: null, reason: "insufficient" };
  }
  if (!hasCompleteSpendHistory(history)) {
    return { days: null, reason: "retry" };
  }
  const days = activeSpendDays(history);
  if (days <= 0) {
    return { days: null, reason: "insufficient" };
  }
  const avgDailySpend = totalSpend(history) / days;
  if (avgDailySpend <= 0) {
    return { days: null, reason: "insufficient" };
  }
  const remaining = Math.max(0, budget.max_cost_usd - totalSpend(history));
  return {
    days: Math.round(remaining / avgDailySpend),
    reason: null,
  };
}
