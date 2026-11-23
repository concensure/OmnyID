// @locs-version: 1.0
export type DecisionOsMood =
  | "focused"
  | "happy"
  | "tired"
  | "stressed"
  | "neutral";

export type DecisionOsEnergyInference = {
  mood: DecisionOsMood;
  reason: string;
} | null;

function formatAnchorLabel(anchorType: string | null | undefined): string | null {
  if (!anchorType) return null;
  switch (anchorType.trim().toLowerCase()) {
    case "interview":
      return "an interview";
    case "medical":
      return "a medical appointment";
    case "logistics":
      return "a logistics hold";
    case "meeting":
      return "a meeting";
    default:
      return "a calendar hold";
  }
}

function hoursUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  return (target - Date.now()) / (60 * 60 * 1000);
}

export function inferDecisionOsMood(args: {
  totalQueueMinutes: number;
  visibleDecisionCount: number;
  urgentResponseCount: number;
  tentativeHoldCount: number;
  confirmedEventCount: number;
  nextTentativeStartAt?: string | null;
  latestTentativeNoteKind?: string | null;
  latestTentativePrepLeadMinutes?: number | null;
  latestTentativeAnchorType?: string | null;
}): DecisionOsEnergyInference {
  const hoursToTentative = hoursUntil(args.nextTentativeStartAt);
  const hour = new Date().getHours();
  const anchorLabel = formatAnchorLabel(args.latestTentativeAnchorType);
  const hasHighStakesPrep = args.latestTentativeNoteKind === "high_stakes_prep";
  const hasActivePrepWindow = Boolean(
    hasHighStakesPrep
    && hoursToTentative !== null
    && hoursToTentative <= 6,
  );
  const hasProtectedPrepWindow = Boolean(
    typeof args.latestTentativePrepLeadMinutes === "number"
    && args.latestTentativePrepLeadMinutes >= 45
    && hoursToTentative !== null
    && hoursToTentative <= 4,
  );

  if (
    args.urgentResponseCount >= 3
    || args.totalQueueMinutes >= 180
    || hasActivePrepWindow
    || hasProtectedPrepWindow
    || (args.tentativeHoldCount > 0 && hoursToTentative !== null && hoursToTentative <= 3)
  ) {
    return {
      mood: "stressed",
      reason:
        args.urgentResponseCount >= 3
          ? "Quick wins recommended because urgent replies are stacking."
          : args.totalQueueMinutes >= 180
            ? "Quick wins recommended because the active queue is heavy."
            : hasActivePrepWindow || hasProtectedPrepWindow
              ? `Quick wins recommended because prep time is being protected before ${anchorLabel ?? "a calendar hold"}.`
            : "Quick wins recommended because a calendar hold is approaching soon.",
    };
  }

  if (
    (args.confirmedEventCount >= 4 && hour >= 11)
    || (args.confirmedEventCount >= 2 && args.visibleDecisionCount >= 6 && hour >= 14)
  ) {
    return {
      mood: "tired",
      reason: "Quick wins recommended because your calendar load suggests lower focus capacity.",
    };
  }

  if (args.visibleDecisionCount <= 3 && args.totalQueueMinutes <= 45 && args.urgentResponseCount === 0) {
    return {
      mood: "focused",
      reason: "Deeper work is available because the queue is light and interruptions are calm.",
    };
  }

  return {
    mood: "neutral",
    reason: "Balanced queue detected from current workload and calendar pressure.",
  };
}
