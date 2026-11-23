// @locs-version: 1.0
export type DecisionOsContextItemLike = {
  time?: string | null;
  sourceRefs?: string[] | null;
};

export type DecisionOsDecisionLike = {
  deadline?: string | null;
  durationScope?: "day" | "week" | "month" | "year" | null;
  urgency?: "urgent" | "high" | "medium" | "low" | null;
  contextItems?: DecisionOsContextItemLike[] | null;
};

export function formatSnoozeDateLabel(value: Date): string {
  return value.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeShortDuration(fromIso: string, now = Date.now()): string | null {
  const diffMs = new Date(fromIso).getTime() - now;
  if (Number.isNaN(diffMs)) return null;
  const absMs = Math.abs(diffMs);
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  if (absMs >= dayMs) return `${Math.max(1, Math.round(absMs / dayMs))}d`;
  return `${Math.max(1, Math.round(absMs / hourMs))}h`;
}

export function primarySourceProvenance(
  decision: DecisionOsDecisionLike,
  resolveTargetLabel?: (sourceRefs?: string[]) => string | null,
): string | null {
  const firstRef = decision.contextItems?.flatMap((item) => item.sourceRefs ?? [])[0]?.trim();
  if (!firstRef) return null;
  return resolveTargetLabel?.([firstRef]) ?? firstRef;
}

export function decisionWhyNow(
  decision: DecisionOsDecisionLike,
): { badge: string; detail: string } | null {
  if (decision.deadline) {
    return {
      badge: `Due ${decision.deadline}`,
      detail: `This decision is surfacing because the current deadline is ${decision.deadline}.`,
    };
  }
  const recentContext = decision.contextItems?.find((item) => item.time)?.time?.trim();
  if (recentContext) {
    return {
      badge: recentContext,
      detail: `Recent linked context is keeping this decision active: ${recentContext}.`,
    };
  }
  if (decision.durationScope === "day") {
    return {
      badge: "Due today",
      detail: "This decision is scoped to today's queue.",
    };
  }
  if (decision.urgency === "urgent") {
    return {
      badge: "Needs review now",
      detail: "Urgent surfacing logic placed this decision at the top of the queue.",
    };
  }
  return null;
}
