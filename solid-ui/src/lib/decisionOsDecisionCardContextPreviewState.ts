// @locs-version: 1.0
export type DecisionOsDecisionCardContextItemLike = {
  icon?: string | null;
  sourceType?: string | null;
  title?: string | null;
};

export function decisionOsDecisionCardThreadContextItem<T extends DecisionOsDecisionCardContextItemLike>(
  contextItems?: readonly T[] | null,
): T | null {
  return (contextItems ?? []).find((item) => item.sourceType === "thread") ?? null;
}

export function decisionOsDecisionCardSourceCount(
  contextItems?: readonly DecisionOsDecisionCardContextItemLike[] | null,
): number {
  return (contextItems ?? []).length;
}

export function decisionOsDecisionCardSourcePreviewItems<
  T extends DecisionOsDecisionCardContextItemLike,
>(contextItems?: readonly T[] | null, limit = 3): T[] {
  return (contextItems ?? []).slice(0, Math.max(0, limit));
}

export function decisionOsDecisionCardOpenThreadLabel(title?: string | null): string {
  return `Open thread: ${title?.trim() || "Thread"}`;
}

export function decisionOsDecisionCardCalendarActionLabel(): string {
  return "View in Calendar";
}

export function decisionOsDecisionCardImpactSearchLabel(impact: string): string {
  return `Search ${impact} impact`;
}

export function decisionOsDecisionCardImpactTooltipTitle(): string {
  return "Impact level";
}

export function decisionOsDecisionCardSourceSearchLabel(title?: string | null): string {
  return `Search sources: ${title?.trim() || "decision"}`;
}

export function decisionOsDecisionCardSourcesTooltipTitle(): string {
  return "Sources";
}

export function decisionOsDecisionCardProvenancePrefix(): string {
  return "From:";
}
