// @locs-version: 1.0
function preparedWorkEffortObjectLabel(
  cue: {
    label: string;
    detail: string | null;
  },
): string {
  const label = cue.label.trim().toLowerCase();
  if (label === "prepared response ready") return "prepared response";
  if (label === "prepared decision support ready") return "prepared decision support";
  if (label === "prepared context ready") return "prepared context";
  if (label === "prepared work ready") return "prepared work";
  return "prepared work";
}

export function decisionOsCompletedPct(completedCount: number, totalDecisions: number): number {
  return Math.round((completedCount / Math.max(totalDecisions, 1)) * 100);
}

function isDecisionOsQueueHeavy(totalMinutes: number): boolean {
  return totalMinutes > 60;
}

export function decisionOsQueueLoadTone(totalMinutes: number): string {
  if (isDecisionOsQueueHeavy(totalMinutes)) return "text-rose-600";
  if (totalMinutes > 35) return "text-amber-600";
  return "text-emerald-600";
}

export function decisionOsQueueLoadLabel(totalMinutes: number): string {
  if (isDecisionOsQueueHeavy(totalMinutes)) return "Heavy";
  if (totalMinutes > 35) return "Moderate";
  return "Light";
}

export function decisionOsEffectiveQueueMinutes(
  liveMinutes: number | undefined,
  estimatedMinutes: number,
): number {
  return liveMinutes ?? estimatedMinutes;
}

export function decisionOsQueueEffortLabel(args: {
  preparedWorkCue?: {
    label: string;
    detail: string | null;
  } | null;
  effectiveMinutes: number;
}): string {
  const cue = args.preparedWorkCue;
  const mins = args.effectiveMinutes;
  if (!cue) return `~${mins} min to clear queue`;
  if (mins > 0) {
    return `Focused lane \u00B7 ~${mins} min to close ${preparedWorkEffortObjectLabel(cue)}`;
  }
  return `Focused lane \u00B7 ${cue.label}`;
}

export function decisionOsQueueTrendGlyph(
  trend: "up" | "down" | "steady" | undefined,
): string {
  switch (trend) {
    case "up":
      return "\u2191";
    case "down":
      return "\u2193";
    default:
      return "\u2192";
  }
}

export function shouldShowDecisionOsQueueOverload(
  count: number,
  totalMinutes: number,
): boolean {
  return count > 5 || isDecisionOsQueueHeavy(totalMinutes);
}

export function decisionOsQueueOverloadSummary(count: number, totalMinutes: number): string {
  return `Heavy queue \u2014 ${count} decisions \u00B7 ~${totalMinutes} min total`;
}

export function decisionOsShouldShowQueuePriorityAction(args: {
  hasVisibleQueueWork: boolean;
  completedPct?: number | null;
}): boolean {
  return args.hasVisibleQueueWork && (args.completedPct ?? 0) < 100;
}
