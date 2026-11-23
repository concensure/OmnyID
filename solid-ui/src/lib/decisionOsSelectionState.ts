// @locs-version: 1.0
export type DecisionOsSelectable = {
  id: string;
};

export function decisionOsContextSelection<T extends DecisionOsSelectable>(args: {
  decisions: readonly T[];
  pinnedContextId: string | null;
  selectedDecision: T | null;
}): T | null {
  const pinned = args.pinnedContextId
    ? args.decisions.find((decision) => decision.id === args.pinnedContextId) ?? null
    : null;
  return pinned ?? args.selectedDecision;
}

export function decisionOsFocusModeSelection<T extends DecisionOsSelectable>(
  decisions: readonly T[],
  focusModeDecisionId: string | null,
): T | null {
  return focusModeDecisionId
    ? decisions.find((decision) => decision.id === focusModeDecisionId) ?? null
    : null;
}

export function decisionOsFocusTargetForId<T extends DecisionOsSelectable>(
  decisions: readonly T[],
  decisionId: string | null,
): { selectedId: string | null; focusedIndex: number } {
  if (!decisionId) return { selectedId: null, focusedIndex: -1 };
  const focusedIndex = decisions.findIndex((decision) => decision.id === decisionId);
  if (focusedIndex < 0) return { selectedId: decisionId, focusedIndex: -1 };
  return { selectedId: decisionId, focusedIndex };
}
