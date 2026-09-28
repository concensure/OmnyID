// @locs-version: 1.0
export type DecisionOsMagicAction =
  | { kind: "approve"; decisionId: string }
  | { kind: "dismiss"; decisionId: string }
  | { kind: "search"; term: string }
  | { kind: "open-thread"; decisionId: string }
  | { kind: "none" };

export function decisionOsMagicActionPlan(detail: {
  action?: string | null;
  msgId?: string | null;
} | null | undefined): DecisionOsMagicAction {
  const action = detail?.action ?? null;
  const msgId = detail?.msgId ?? null;
  if (!action || !msgId) return { kind: "none" };

  switch (action) {
    case "approve":
      return { kind: "approve", decisionId: msgId };
    case "dismiss":
      return { kind: "dismiss", decisionId: msgId };
    case "search":
      return { kind: "search", term: msgId };
    case "open-thread": {
      const decisionId = msgId.replace(/^thread-/, "");
      return decisionId ? { kind: "open-thread", decisionId } : { kind: "none" };
    }
    default:
      return { kind: "none" };
  }
}

export function shouldFocusDecisionOsResponseQueue(
  panel: string | null | undefined,
): boolean {
  return panel === "response_queue";
}

export function decisionOsSelectionAfterContinuityUpdate(args: {
  continuityDecisionIds: readonly string[];
  hasContinuityPrimaryMode: boolean;
  selectedId: string | null;
  isSyntheticSelected: boolean;
}): { selectedId: string | null; focusedIndex: number } | null {
  if (args.continuityDecisionIds.length > 0) {
    return {
      selectedId: args.continuityDecisionIds[0] ?? null,
      focusedIndex: 0,
    };
  }
  if (args.hasContinuityPrimaryMode && args.isSyntheticSelected) {
    return {
      selectedId: null,
      focusedIndex: -1,
    };
  }
  return null;
}
