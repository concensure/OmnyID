// @locs-version: 1.0
export type DecisionOsMood = "focused" | "happy" | "tired" | "stressed" | "neutral";

export type DecisionOsMoodSource = "user" | "agent" | "system";

export type DecisionOsMoodOption = {
  id: DecisionOsMood;
  emoji: string;
  label: string;
};

export type DecisionOsMoodDiaryEntry = {
  ts: string;
  type: "mood";
  icon: string;
  title: string;
  detail?: string;
};

export type DecisionOsInferredMoodSupport = {
  mood: DecisionOsMood;
  reason?: string | null;
};

export type DecisionOsMoodSelectionPlan = {
  mood: DecisionOsMood;
  pinnedByUser: boolean;
  diaryEntry: DecisionOsMoodDiaryEntry | null;
};

export type DecisionOsQueueClearMoodResetPlan = {
  shouldReset: boolean;
  mood: DecisionOsMood;
  source: DecisionOsMoodSource;
  toastMessage: string | null;
};

export function decisionOsMoodPinnedByUserAfterSelection(
  currentPinnedByUser: boolean,
  source: DecisionOsMoodSource,
): boolean {
  if (source === "user") return true;
  if (source === "system") return false;
  return currentPinnedByUser;
}

export function decisionOsMoodDiaryEntry(args: {
  mood: DecisionOsMood;
  source: DecisionOsMoodSource;
  option: DecisionOsMoodOption | null | undefined;
  now?: Date;
}): DecisionOsMoodDiaryEntry | null {
  if (args.source !== "user" || !args.option) return null;
  return {
    ts: (args.now ?? new Date()).toISOString(),
    type: "mood",
    icon: args.option.emoji,
    title: `Mood: ${args.option.label}`,
    detail:
      args.mood === "tired" || args.mood === "stressed"
        ? "Queue filtered to quick wins automatically."
        : undefined,
  };
}

export function decisionOsAutoMoodLabel(
  inferredMood: DecisionOsMood | null | undefined,
  options: readonly DecisionOsMoodOption[],
): string {
  if (!inferredMood) return "Neutral";
  return options.find((option) => option.id === inferredMood)?.label ?? "Neutral";
}

export function decisionOsAutoMoodActionLabel(
  inferredMood: DecisionOsMood | null | undefined,
  options: readonly DecisionOsMoodOption[],
): string {
  return `Auto: ${decisionOsAutoMoodLabel(inferredMood, options)}`;
}

export function decisionOsMoodPromptLabel(): string {
  return "How are you feeling?";
}

export function decisionOsAutoQuickWinsActiveLabel(visibleCount: number): string {
  return `Auto quick wins active - ${visibleCount} left`;
}

export function decisionOsQuickWinsOnlyLabel(visibleCount: number): string {
  return `Showing quick wins only - ${visibleCount} left`;
}

export function decisionOsVisibleDecisionCountLabel(visibleCount: number): string {
  return `${visibleCount} decision${visibleCount !== 1 ? "s" : ""}`;
}

export function decisionOsAutoMoodReasonLabel(args: {
  pinnedByUser: boolean;
  inferred: DecisionOsInferredMoodSupport | null | undefined;
}): string | null {
  const reason = args.inferred?.reason?.trim();
  if (!reason) return null;
  return `${args.pinnedByUser ? "Auto available:" : "Auto:"} ${reason}`;
}

export function decisionOsAutoMoodSelection(
  inferredMood: DecisionOsMood | null | undefined,
): { mood: DecisionOsMood; source: DecisionOsMoodSource } | null {
  if (!inferredMood) return null;
  return {
    mood: inferredMood,
    source: "system",
  };
}

export function decisionOsQueueClearMoodResetPlan(args: {
  completedPct: number;
  mood: DecisionOsMood;
}): DecisionOsQueueClearMoodResetPlan {
  if (
    args.completedPct < 100 ||
    (args.mood !== "tired" && args.mood !== "stressed")
  ) {
    return {
      shouldReset: false,
      mood: args.mood,
      source: "system",
      toastMessage: null,
    };
  }

  return {
    shouldReset: true,
    mood: "neutral",
    source: "system",
    toastMessage: "Queue clear - mood reset to Neutral.",
  };
}

export function decisionOsMoodSelectionPlan(args: {
  mood: DecisionOsMood;
  source: DecisionOsMoodSource;
  currentPinnedByUser: boolean;
  option: DecisionOsMoodOption | null | undefined;
  now?: Date;
}): DecisionOsMoodSelectionPlan {
  return {
    mood: args.mood,
    pinnedByUser: decisionOsMoodPinnedByUserAfterSelection(
      args.currentPinnedByUser,
      args.source,
    ),
    diaryEntry: decisionOsMoodDiaryEntry({
      mood: args.mood,
      source: args.source,
      option: args.option,
      now: args.now,
    }),
  };
}

