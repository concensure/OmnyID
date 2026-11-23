// @locs-version: 1.0
export type DecisionOsDurationView = "day" | "week" | "month" | "year";
export type DecisionOsMood = "focused" | "happy" | "tired" | "stressed" | "neutral";
export type DecisionOsQueueDecision = {
  id: string;
  impact?: string | null;
};

export function decisionOsDurationTabPlan(value: DecisionOsDurationView): {
  durationView: DecisionOsDurationView;
  focusedIndex: number;
} {
  return {
    durationView: value,
    focusedIndex: -1,
  };
}

export function decisionOsQueueOverloadMoodPlan(): {
  mood: DecisionOsMood;
} {
  return { mood: "tired" };
}

export function decisionOsAutoTriageActionChip(): {
  id: string;
  label: string;
} {
  return {
    id: "auto-triage",
    label: "Auto-triage queue",
  };
}

export function decisionOsLowImpactDismissIds<
  TDecision extends DecisionOsQueueDecision,
>(
  decisions: readonly TDecision[],
  dismissedIds: ReadonlySet<string>,
): string[] {
  return decisions
    .filter(
      (decision) =>
        decision.impact === "low" && !dismissedIds.has(decision.id),
    )
    .map((decision) => decision.id);
}

export function decisionOsScheduleReviewActionChip(): {
  id: string;
  label: string;
} {
  return {
    id: "schedule-review",
    label: "Schedule 15-min decision review",
  };
}
