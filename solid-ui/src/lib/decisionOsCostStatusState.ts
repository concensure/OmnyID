// @locs-version: 1.0
import type {
  DecisionOsCostSnapshot,
  DecisionOsCostStatus,
} from "@/lib/decisionosContinuity";

function formatDecisionOsCostLabel(value: number): string {
  return value >= 100 ? `$${value.toFixed(0)}` : `$${value.toFixed(2)}`;
}

export function decisionOsCostStatusTone(status: DecisionOsCostStatus | null): string | null {
  if (!status) return null;
  switch (status.level) {
    case "warning":
      return "border-rose-200/70 bg-rose-50/75 text-rose-700";
    case "elevated":
      return "border-amber-200/70 bg-amber-50/75 text-amber-700";
    default:
      return "border-sky-200/70 bg-sky-50/75 text-sky-700";
  }
}

export function decisionOsCostMetricChips(
  snapshot: DecisionOsCostSnapshot | null,
): string[] {
  return [
    decisionOsBudgetProgressLabel(snapshot),
    decisionOsMarginLabel(snapshot),
    decisionOsDeepQueryLabel(snapshot),
  ].filter((value): value is string => Boolean(value));
}

function decisionOsBudgetProgressLabel(
  snapshot: DecisionOsCostSnapshot | null,
): string | null {
  if (!snapshot || snapshot.monthly_budget_usd <= 0) return null;
  const percent = Math.round((snapshot.recent_spend_usd_14d / snapshot.monthly_budget_usd) * 100);
  return `${Math.max(0, percent)}% of cap`;
}

function decisionOsMarginLabel(
  snapshot: DecisionOsCostSnapshot | null,
): string | null {
  if (!snapshot) return null;
  const prefix = snapshot.estimated_monthly_margin_usd < 0 ? "-" : "";
  return `${prefix}${formatDecisionOsCostLabel(Math.abs(snapshot.estimated_monthly_margin_usd))} est. margin`;
}

function decisionOsDeepQueryLabel(
  snapshot: DecisionOsCostSnapshot | null,
): string | null {
  if (!snapshot || snapshot.daily_deep_query_limit <= 0) return null;
  return `${snapshot.deep_queries_today}/${snapshot.daily_deep_query_limit} deep queries`;
}
