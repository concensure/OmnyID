// @locs-version: 1.0
export type DecisionOsDecisionCardOption = {
  id: string;
  label: string;
};

export type DecisionOsDecisionCardLike = {
  options: DecisionOsDecisionCardOption[];
  goalBreakdown?: {
    status?: string | null;
  } | null;
};

export function decisionOsVisibleOptions<T extends DecisionOsDecisionCardOption>(
  options: readonly T[],
  showAll: boolean,
): readonly T[] {
  return showAll || options.length <= 3 ? options : options.slice(0, 3);
}

export function decisionOsHiddenOptionCount(optionCount: number): number {
  return Math.max(0, optionCount - 3);
}

export function decisionOsMoreOptionsLabel(hiddenCount: number): string {
  return `View ${hiddenCount} more option${hiddenCount === 1 ? "" : "s"} ->`;
}

export function decisionOsQuickWinFilterTitle(): string {
  return "Filter queue to quick wins";
}

export function decisionOsApproveNotePlaceholder(): string {
  return "Add a note for the record (optional)";
}

export function decisionOsApproveConfirmLabel(): string {
  return "Confirm";
}

export function decisionOsApproveMagicLabel(needsBreakdown: boolean): string {
  return needsBreakdown ? "Break Down Goal" : "Approve";
}

export function decisionOsDismissMagicLabel(): string {
  return "Dismiss";
}

export function decisionOsFocusDecisionTitle(): string {
  return "Focus this decision";
}

export function decisionOsFocusDecisionLabel(): string {
  return "Focus";
}

export function decisionOsDelegateDecisionLabel(): string {
  return "Delegate";
}

export function decisionOsDismissDecisionTitle(): string {
  return "Dismiss";
}

export function decisionOsApproveActionLabel(
  decision: DecisionOsDecisionCardLike,
  chosenOptionId: string | null,
): string {
  if (decision.goalBreakdown?.status === "needs_breakdown") {
    return "Break Down Goal";
  }

  if (!chosenOptionId) return "Approve";

  const chosen = decision.options.find((option) => option.id === chosenOptionId);
  if (!chosen) return "Approve";

  return `Approve ${chosen.label.split(" ")[0] ?? ""}`.trim();
}

export function decisionOsAiRecommendationDetail(detail?: string | null): string {
  const trimmed = detail?.trim();
  if (trimmed) {
    return `${trimmed} - highest-confidence path based on current context.`;
  }
  return "Highest-confidence path based on context, past decisions, and available data.";
}

export function decisionOsAiRecommendationBadgeLabel(): string {
  return "AI";
}

export function decisionOsUsedLastTimeLabel(): string {
  return "Used last time";
}

export function decisionOsAiRecommendationTitle(): string {
  return "Why AI recommends this";
}
