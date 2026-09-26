// @locs-version: 1.0
type SpendHistoryLike = {
  day?: string | null;
  cost_usd?: number | null;
  api_calls?: number | null;
  tokens?: number | null;
};

export type CostDashboardSpendHistoryTotals = {
  usedUsd: number;
  usedCalls: number;
  usedTokens: number;
};

export type CostDashboardSpendBar = {
  dayLabel: string;
  title: string;
  costUsd: number;
  ratio: number;
};

function money(value: number): string {
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function hasCompleteTotals(history: SpendHistoryLike[]): boolean {
  return history.every(
    (item) =>
      typeof item.cost_usd === "number" &&
      typeof item.api_calls === "number" &&
      typeof item.tokens === "number",
  );
}

function hasCompleteBars(history: SpendHistoryLike[]): boolean {
  return history.every((item) => typeof item.cost_usd === "number" && typeof item.day === "string");
}

export function readCostDashboardSpendHistoryTotals(
  history: SpendHistoryLike[],
): CostDashboardSpendHistoryTotals | null {
  if (!hasCompleteTotals(history)) return null;
  return history.reduce(
    (sum, item) => ({
      usedUsd: sum.usedUsd + item.cost_usd!,
      usedCalls: sum.usedCalls + item.api_calls!,
      usedTokens: sum.usedTokens + item.tokens!,
    }),
    { usedUsd: 0, usedCalls: 0, usedTokens: 0 },
  );
}

export function readCostDashboardSpendHistoryValue(history: SpendHistoryLike[]): string {
  const totals = readCostDashboardSpendHistoryTotals(history);
  if (!totals) return "Spend unavailable";
  return money(totals.usedUsd);
}

export function readCostDashboardSpendHistoryDetail(history: SpendHistoryLike[]): string {
  const totals = readCostDashboardSpendHistoryTotals(history);
  if (!totals) {
    return "Retry the dashboard to confirm recent spend, API calls, and token usage.";
  }
  return `${totals.usedCalls.toLocaleString()} API calls and ${totals.usedTokens.toLocaleString()} tokens in the last 30 days.`;
}

export function readCostDashboardSpendBars(history: SpendHistoryLike[]): CostDashboardSpendBar[] | null {
  if (!hasCompleteBars(history)) return null;
  const visible = history.slice(-12);
  const maxCost = Math.max(...visible.map((entry) => entry.cost_usd!), 0.0001);
  return visible.map((entry) => ({
    dayLabel: entry.day!.slice(5),
    title: `${entry.day}: ${money(entry.cost_usd!)}`,
    costUsd: entry.cost_usd!,
    ratio: maxCost > 0 ? entry.cost_usd! / maxCost : 0,
  }));
}
