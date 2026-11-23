// @locs-version: 1.0
type DecisionOsUrgency = "urgent" | "high" | "medium" | "low";

const URGENCY_EXPLANATION: Record<DecisionOsUrgency, string> = {
  urgent: "Hard deadline within 24 h, a waiting blocker, or direct stakeholder watcher pressure.",
  high: "Important enough to keep visible today, but not yet a hard blocker.",
  medium: "Meaningful, but can wait until the current higher-pressure items settle.",
  low: "Safe to revisit later; kept visible mostly for continuity and rule learning.",
};

export function decisionOsUrgencyInsightState(args: {
  urgency: DecisionOsUrgency;
  urgencyLabel: string;
}): {
  heading: string;
  detail: string;
  searchTerm: string;
  searchLabel: string;
} {
  const normalizedLabel = args.urgencyLabel.trim().toLowerCase();
  return {
    heading: `Why ${args.urgencyLabel}`,
    detail: URGENCY_EXPLANATION[args.urgency],
    searchTerm: args.urgency,
    searchLabel: `Search all ${normalizedLabel} items`,
  };
}

export function decisionOsUrgencyInsightButtonTitle(): string {
  return "Click to see why this urgency level was set";
}

export function decisionOsDeadlineInsightTitle(): string {
  return "Why this deadline matters";
}

export function decisionOsDecisionCardCloseLabel(): string {
  return "Close";
}

export function decisionOsDeadlineInsight(args: {
  deadline: string;
  impact: "high" | "medium" | "low";
  confidenceReason?: string | null;
}): string {
  const explicitReason = args.confidenceReason?.trim();
  if (explicitReason) {
    return explicitReason;
  }
  return `Missing this deadline may delay ${args.impact === "high" ? "a high-impact" : "this"} outcome. Review your options and act before ${args.deadline}.`;
}
