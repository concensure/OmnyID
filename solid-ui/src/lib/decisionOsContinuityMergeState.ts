// @locs-version: 1.0
import { isContinuitySyntheticDecisionId } from "afp-ts/continuity";

export type DecisionOsContinuityMergeDecision = {
  id: string;
};

export type DecisionOsContinuitySelection = {
  selectedId: string | null;
  focusedIndex: number;
};

export function mergeDecisionOsContinuityDecisions<
  TDecision extends DecisionOsContinuityMergeDecision,
>(args: {
  currentDecisions: readonly TDecision[];
  nextDecisions?: readonly TDecision[] | null;
  continuityDecisions: readonly TDecision[];
  continuitySelection: DecisionOsContinuitySelection | null;
  shouldReplaceContinuityDecisions: boolean;
  shouldClearContinuityDecisions: boolean;
}): {
  decisions: TDecision[];
  continuitySelection: DecisionOsContinuitySelection | null;
} {
  const baseDecisions = [...(args.nextDecisions ?? args.currentDecisions)];
  const nonSyntheticDecisions = baseDecisions.filter(
    (decision) => !isContinuitySyntheticDecisionId(decision.id),
  );

  if (args.shouldReplaceContinuityDecisions) {
    return {
      decisions: [...args.continuityDecisions, ...nonSyntheticDecisions],
      continuitySelection: args.continuitySelection,
    };
  }

  if (args.shouldClearContinuityDecisions) {
    return {
      decisions: nonSyntheticDecisions,
      continuitySelection: args.continuitySelection,
    };
  }

  return {
    decisions: baseDecisions,
    continuitySelection: null,
  };
}
