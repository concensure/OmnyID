// @locs-version: 1.0
type ProfitLike = {
  margin_guard_active?: boolean | null;
  usage_guard_active?: boolean | null;
  deep_queries_today?: number | null;
  daily_deep_query_limit?: number | null;
};

export function readCostDashboardUsageGuardSummary(profit: ProfitLike | null | undefined): string {
  if (!profit) {
    return "Retry the dashboard to confirm margin and usage guard coverage.";
  }
  if (typeof profit.margin_guard_active !== "boolean" || typeof profit.usage_guard_active !== "boolean") {
    return "Retry the dashboard to confirm margin and usage guard coverage.";
  }
  return `Margin guard ${profit.margin_guard_active ? "active" : "inactive"}, usage guard ${profit.usage_guard_active ? "active" : "inactive"}.`;
}

export function readCostDashboardUsageGuardDetail(profit: ProfitLike | null | undefined): string {
  if (!profit) {
    return "Retry the dashboard to confirm today's deep-query usage and limit.";
  }
  if (
    typeof profit.deep_queries_today !== "number" ||
    typeof profit.daily_deep_query_limit !== "number"
  ) {
    return "Retry the dashboard to confirm today's deep-query usage and limit.";
  }
  return `Deep queries today: ${profit.deep_queries_today.toLocaleString()} / ${profit.daily_deep_query_limit.toLocaleString()}`;
}
