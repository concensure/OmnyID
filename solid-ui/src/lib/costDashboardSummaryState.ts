// @locs-version: 1.0
type CostSummaryLike = {
  total_usd?: number | null;
  event_count?: number | null;
  run_count?: number | null;
};

function money(value: number): string {
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

export function readCostDashboardSummaryValue(summary: CostSummaryLike | null | undefined): string {
  if (!summary) return "Unavailable";
  if (typeof summary.total_usd !== "number") return "Cost unavailable";
  return money(summary.total_usd);
}

export function readCostDashboardSummaryDetail(summary: CostSummaryLike | null | undefined): string {
  if (!summary) {
    return "Retry the dashboard to confirm lifetime recorded run cost, event volume, and run volume.";
  }
  if (typeof summary.event_count !== "number" || typeof summary.run_count !== "number") {
    return "Retry the dashboard to confirm lifetime recorded run cost, event volume, and run volume.";
  }
  return `${summary.event_count.toLocaleString()} cost events across ${summary.run_count.toLocaleString()} runs.`;
}
