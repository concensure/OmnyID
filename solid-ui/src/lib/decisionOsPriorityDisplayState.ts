// @locs-version: 1.0
export type DecisionOsUrgency = "urgent" | "high" | "medium" | "low";
export type DecisionOsImpact = "high" | "medium" | "low";

export type DecisionOsUrgencyStyle = {
  badge: string;
  border: string;
  label: string;
};

const URGENCY_STYLE: Record<DecisionOsUrgency, DecisionOsUrgencyStyle> = {
  urgent: { badge: "bg-red-100 text-red-700 border-red-200", border: "border-red-300/50", label: "URGENT" },
  high: { badge: "bg-amber-100 text-amber-700 border-amber-200", border: "border-amber-300/50", label: "HIGH" },
  medium: { badge: "bg-blue-100 text-blue-700 border-blue-200", border: "border-blue-300/50", label: "MEDIUM" },
  low: { badge: "bg-slate-100 text-slate-600 border-slate-200", border: "border-slate-200/50", label: "LOW" },
};

const IMPACT_ICON: Record<DecisionOsImpact, string> = {
  high: "💥",
  medium: "⚡",
  low: "·",
};

export function decisionOsUrgencyStyle(urgency: DecisionOsUrgency): DecisionOsUrgencyStyle {
  return URGENCY_STYLE[urgency];
}

export function decisionOsImpactIcon(impact: DecisionOsImpact): string {
  return IMPACT_ICON[impact];
}

export function decisionOsImpactLabel(impact: DecisionOsImpact): string {
  return `${impact.charAt(0).toUpperCase() + impact.slice(1)} impact`;
}

export function decisionOsDurationScopeSearchLabel(scope?: string | null): string {
  return `View all ${(scope?.trim() || "related")} items`;
}
