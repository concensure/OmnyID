// @locs-version: 1.0
export type DecisionOsFocusable = {
  id: string;
};

export function nextDecisionOsFocusIndex(
  currentIndex: number,
  visibleCount: number,
): number {
  return Math.min(currentIndex + 1, visibleCount - 1);
}

export function previousDecisionOsFocusIndex(currentIndex: number): number {
  return Math.max(currentIndex - 1, 0);
}

export function previousDecisionOsFocusAfterDismiss(currentIndex: number): number {
  return Math.max(0, currentIndex - 1);
}

export function decisionOsFocusedItem<T extends DecisionOsFocusable>(
  visible: readonly T[],
  focusedIndex: number,
): T | null {
  return focusedIndex >= 0 ? visible[focusedIndex] ?? null : null;
}

export function decisionOsSelectedOrFocusedItem<T extends DecisionOsFocusable>(
  selected: T | null,
  visible: readonly T[],
  focusedIndex: number,
): T | null {
  return selected ?? decisionOsFocusedItem(visible, focusedIndex);
}

export function toggledDecisionOsFocusModeId(
  currentId: string | null,
  focusedDecisionId: string | null,
): string | null {
  if (!focusedDecisionId) return currentId;
  return currentId === focusedDecisionId ? null : focusedDecisionId;
}

export function toggledDecisionOsPinnedContextId(
  currentPinnedId: string | null,
  focusTargetId: string | null,
): string | null {
  if (!focusTargetId) return currentPinnedId;
  return currentPinnedId ? null : focusTargetId;
}
