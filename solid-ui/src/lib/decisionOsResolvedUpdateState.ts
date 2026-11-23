// @locs-version: 1.0
import type {
  DecisionOsUpdateApplicationState,
} from "./decisionOsUpdateApplicationState";

export function decisionOsResolvedUpdateState<
  TDecision extends { id: string },
  TNext extends DecisionOsUpdateApplicationState<TDecision, TDecision>,
>(args: {
  next: TNext | null | undefined;
  currentDecisions: readonly TDecision[];
  mergeContinuityDecisions: (args: {
    currentDecisions: readonly TDecision[];
    nextDecisions?: readonly TDecision[] | null;
    continuityDecisions: readonly TDecision[];
    continuitySelection: {
      selectedId: string | null;
      focusedIndex: number;
    } | null;
    shouldReplaceContinuityDecisions: boolean;
    shouldClearContinuityDecisions: boolean;
  }) => {
    decisions: TDecision[];
    continuitySelection: {
      selectedId: string | null;
      focusedIndex: number;
    } | null;
  };
}): {
  decisions: TDecision[];
  suggestedMood: TNext["suggestedMood"];
  queueState: TNext["queueState"];
  queueCompanionState: TNext["queueCompanionState"];
  operationalBootstrap: TNext["operationalBootstrap"];
  continuitySelection: {
    selectedId: string | null;
    focusedIndex: number;
  } | null;
} | null {
  if (!args.next) return null;

  const merged = args.mergeContinuityDecisions({
    currentDecisions: args.currentDecisions,
    nextDecisions: args.next.decisions ?? null,
    continuityDecisions: args.next.continuityDecisions,
    continuitySelection: args.next.continuitySelection,
    shouldReplaceContinuityDecisions: args.next.shouldReplaceContinuityDecisions,
    shouldClearContinuityDecisions: args.next.shouldClearContinuityDecisions,
  });

  return {
    decisions: merged.decisions,
    suggestedMood: args.next.suggestedMood,
    queueState: args.next.queueState,
    queueCompanionState: args.next.queueCompanionState,
    operationalBootstrap: args.next.operationalBootstrap,
    continuitySelection: merged.continuitySelection,
  };
}
