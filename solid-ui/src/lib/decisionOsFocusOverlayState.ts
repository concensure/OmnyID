// @locs-version: 1.0
export type DecisionOsFocusOverlayChip = {
  label: string;
  tone: "default" | "info";
};

type DecisionOsFocusOverlayContextItemLike = {
  sourceRefs?: readonly string[] | null;
};

export function decisionOsFocusOverlaySourceRefs(
  contextItems?: readonly DecisionOsFocusOverlayContextItemLike[] | null,
): string[] {
  const refs = new Set<string>();
  for (const item of contextItems ?? []) {
    for (const ref of item.sourceRefs ?? []) {
      if (ref) refs.add(ref);
    }
  }
  return [...refs];
}

export function decisionOsFocusOverlaySummaryChips(args: {
  impactLabel: string;
  confidenceLabel?: string | null;
  durationScope?: string | null;
  outcomeCheckLabel?: string | null;
}): DecisionOsFocusOverlayChip[] {
  const chips: DecisionOsFocusOverlayChip[] = [{ label: args.impactLabel, tone: "default" }];
  if (args.confidenceLabel?.trim()) {
    chips.push({ label: args.confidenceLabel.trim(), tone: "default" });
  }
  if (args.durationScope?.trim()) {
    chips.push({ label: args.durationScope.trim(), tone: "default" });
  }
  if (args.outcomeCheckLabel?.trim()) {
    chips.push({ label: args.outcomeCheckLabel.trim(), tone: "info" });
  }
  return chips;
}

export function decisionOsFocusOverlayConfidenceText(reason?: string | null): string {
  return reason?.trim() || "No detailed confidence rationale was attached to this decision.";
}

export function decisionOsFocusOverlayHasSourceRefs(sourceRefs: readonly string[]): boolean {
  return sourceRefs.length > 0;
}

export function decisionOsFocusOverlayAiSuggestedLabel(): string {
  return "AI suggested";
}

export function decisionOsFocusOverlayTitle(): string {
  return "Decision Focus";
}

export function decisionOsFocusOverlayCloseAriaLabel(): string {
  return "Close focus mode";
}

export function decisionOsFocusOverlaySectionTitle(
  kind: "why" | "options" | "confidence" | "context" | "sources",
): string {
  switch (kind) {
    case "why":
      return "Why this matters";
    case "options":
      return "Options";
    case "confidence":
      return "Confidence rationale";
    case "context":
      return "Context items";
    case "sources":
      return "Source refs";
  }
}
