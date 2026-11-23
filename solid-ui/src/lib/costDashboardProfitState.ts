// @locs-version: 1.0
type ProfitLike = {
  estimated_monthly_margin_usd?: number | null;
  cost_month_usd?: number | null;
  estimated_monthly_revenue_usd?: number | null;
  pricing_tier?: string | null;
};

function money(value: number): string {
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function normalizeRecognizedTierLabel(tier: string | null | undefined): string | null {
  const raw = String(tier ?? "").trim().toLowerCase();
  if (!raw || raw === "free" || raw === "trial" || raw === "starter_free") return "Free";
  if (raw === "paid") return "Paid";
  return null;
}

export function readCostDashboardProfitValue(profit: ProfitLike | null | undefined): string {
  if (!profit) return "Unavailable";
  if (typeof profit.estimated_monthly_margin_usd !== "number") return "Margin unavailable";
  return money(profit.estimated_monthly_margin_usd);
}

export function readCostDashboardProfitTitle(profit: ProfitLike | null | undefined): string {
  const tierLabel = normalizeRecognizedTierLabel(profit?.pricing_tier);
  if (!tierLabel) {
    return "Margin outlook";
  }
  return `${tierLabel} tier outlook`;
}

export function readCostDashboardProfitDetail(profit: ProfitLike | null | undefined): string {
  if (!profit) {
    return "Retry the dashboard to confirm margin, revenue, and usage-guard outlook.";
  }
  if (
    typeof profit.cost_month_usd !== "number" ||
    typeof profit.estimated_monthly_revenue_usd !== "number"
  ) {
    return "Retry the dashboard to confirm margin, revenue, and usage-guard outlook.";
  }
  return `Month cost ${money(profit.cost_month_usd)} vs estimated revenue ${money(profit.estimated_monthly_revenue_usd)}.`;
}
