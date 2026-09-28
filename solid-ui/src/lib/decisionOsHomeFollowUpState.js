import { decisionOsQueuePriorityPlan } from "./decisionOsBriefingInteractionState.ts";
import { applyDecisionOsGoalScheduled, decisionOsGoalScheduledFeedback } from "./decisionOsGoalScheduleState.ts";
import { decisionOsLowImpactDismissIds, decisionOsScheduleReviewActionChip } from "./decisionOsQueueInteractionState.ts";
import { decisionBulkDismissPlan } from "./decisionOsDecisionActionPlan.ts";

export function decisionOsDismissLowImpactPlan(args) {
  const ids = decisionOsLowImpactDismissIds(args.decisions, args.dismissed);
  if (ids.length === 0) {
    return null;
  }
  return {
    ids,
    toastMessage: decisionBulkDismissPlan({ dismissedCount: ids.length }).toastMessage,
  };
}

export function decisionOsScheduleReviewPlan() {
  return {
    actionChip: decisionOsScheduleReviewActionChip(),
  };
}

export function decisionOsFocusQueuePriorityFollowUpPlan(args) {
  return decisionOsQueuePriorityPlan({
    queueState: args.queueState,
  });
}

export function decisionOsGoalScheduledPlan(args) {
  const decision = args.decisions.find((item) => item.id === args.decisionId) ?? null;
  const feedback = decisionOsGoalScheduledFeedback({
    title: decision?.title,
    summary: args.summary,
  });
  return {
    decisions: applyDecisionOsGoalScheduled(args.decisions, decision?.id, args.summary),
    toastMessage: feedback.toastMessage,
    diaryEntry: feedback.diaryEntry,
  };
}
