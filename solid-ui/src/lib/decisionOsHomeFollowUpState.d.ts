// @locs-version: 1.0
import type { DecisionOsQueueBootstrapState } from "./decisionOsQueueBootstrapState";

export function decisionOsDismissLowImpactPlan<TDecision extends {
  id: string;
  urgency?: string | null;
  impact?: string | null;
}>(args: {
  decisions: readonly TDecision[];
  dismissed: ReadonlySet<string>;
}): {
  ids: string[];
  toastMessage: string;
} | null;

export function decisionOsScheduleReviewPlan(): {
  actionChip: {
    id: string;
    label: string;
  };
};

export function decisionOsFocusQueuePriorityFollowUpPlan(args: {
  queueState: DecisionOsQueueBootstrapState;
}):
  | {
      kind: "open-queue-priority";
      queueState: DecisionOsQueueBootstrapState;
    }
  | {
      kind: "none";
    };

export function decisionOsGoalScheduledPlan<TDecision extends {
  id: string;
  title?: string | null;
  goalBreakdown?: {
    status?: string;
    scheduledSummary?: string;
  } | null;
}>(args: {
  decisions: readonly TDecision[];
  decisionId?: string | null;
  summary: string;
}): {
  decisions: TDecision[];
  toastMessage: string;
  diaryEntry: import("./decisionOsGoalScheduleState").DecisionOsGoalScheduledDiaryEntry;
};
