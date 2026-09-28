// @locs-version: 1.0
import { isContinuitySyntheticDecisionId } from "afp-ts/continuity";

import {
  type DecisionOsNormalizedUpdateDetail,
  decisionOsUpdateEventDecisions,
  normalizeDecisionOsUpdateDetail,
  type DecisionOsSuggestedMood,
} from "./decisionosContinuity";
import {
  decisionOsQueuePrimaryMode,
  type DecisionOsQueueBootstrapState,
  type DecisionOsQueueCompanionState,
} from "./decisionOsQueueBootstrapState";

export type DecisionOsUpdateApplicationState<
  TDecision = unknown,
  TContinuityDecision extends { id: string } = { id: string },
> = {
  decisions?: TDecision[];
  suggestedMood: DecisionOsSuggestedMood | null;
  queueState: DecisionOsQueueBootstrapState;
  queueCompanionState: DecisionOsQueueCompanionState;
  operationalBootstrap: NonNullable<DecisionOsNormalizedUpdateDetail["operationalBootstrap"]> | null;
  continuityDecisions: TContinuityDecision[];
  continuitySelection: { selectedId: string | null; focusedIndex: number } | null;
  shouldReplaceContinuityDecisions: boolean;
  shouldClearContinuityDecisions: boolean;
};

export function decisionOsUpdateApplicationState<
  TDecision = unknown,
  TContinuityDecision extends { id: string } = { id: string },
>(args: {
  detail:
    | unknown
    | null
    | undefined;
  selectedId: string | null;
  buildActionDecision: (
    item: DecisionOsQueueBootstrapState["queueActionItems"][number],
    contextPanelItems: DecisionOsQueueBootstrapState["queueContextPanelItems"],
  ) => TContinuityDecision;
  buildPriorityDecision: (
    card: NonNullable<DecisionOsQueueBootstrapState["queuePriorityCard"]>,
    contextPanelItems: DecisionOsQueueBootstrapState["queueContextPanelItems"],
  ) => TContinuityDecision;
  planContinuitySelection: (args: {
    continuityDecisionIds: readonly string[];
    hasContinuityPrimaryMode: boolean;
    selectedId: string | null;
    isSyntheticSelected: boolean;
  }) => { selectedId: string | null; focusedIndex: number } | null;
}): DecisionOsUpdateApplicationState<TDecision, TContinuityDecision> | null {
  const rawDetail = args.detail;
  const detail = normalizeDecisionOsUpdateDetail(rawDetail);
  if (!detail) return null;

  const queueState = detail.queueState;
  const queueActionItems = queueState.queueActionItems;
  const queueContextPanelItems = queueState.queueContextPanelItems;
  const queueCompanionState = detail.queueCompanionState;
  const effectiveQueuePrimaryMode = decisionOsQueuePrimaryMode(
    queueState,
    detail.continuityPrimaryMode,
  );
  const continuityActionDecisions = queueActionItems.map((item) =>
    args.buildActionDecision(item, queueContextPanelItems),
  );
  const priorityDecision =
    effectiveQueuePrimaryMode === "priority_card" && queueState.queuePriorityCard
      ? args.buildPriorityDecision(queueState.queuePriorityCard, queueContextPanelItems)
      : null;
  const continuityDecisions = priorityDecision
    ? [priorityDecision, ...continuityActionDecisions]
    : continuityActionDecisions;
  const hasContinuityPrimaryMode = detail.continuityPrimaryMode != null;

  return {
    decisions: decisionOsUpdateEventDecisions<TDecision>(rawDetail),
    suggestedMood: detail.suggestedMood ?? null,
    queueState,
    queueCompanionState,
    operationalBootstrap: detail.operationalBootstrap ?? null,
    continuityDecisions,
    continuitySelection: args.planContinuitySelection({
      continuityDecisionIds: continuityDecisions.map((decision) => decision.id),
      hasContinuityPrimaryMode: hasContinuityPrimaryMode || continuityDecisions.length > 0,
      selectedId: args.selectedId,
      isSyntheticSelected: Boolean(
        args.selectedId && isContinuitySyntheticDecisionId(args.selectedId),
      ),
    }),
    shouldReplaceContinuityDecisions: continuityDecisions.length > 0,
    shouldClearContinuityDecisions:
      continuityDecisions.length === 0 && hasContinuityPrimaryMode,
  };
}
