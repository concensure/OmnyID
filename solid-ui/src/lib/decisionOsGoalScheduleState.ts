// @locs-version: 1.0
export type DecisionOsGoalScheduleDecision = {
  id: string;
  goalBreakdown?: {
    status?: string;
    scheduledSummary?: string;
  } | null;
};

export type DecisionOsGoalScheduledDiaryEntry = {
  ts: string;
  type: "calendar";
  icon: string;
  title: string;
  meta: string;
};

export function applyDecisionOsGoalScheduled<
  TDecision extends DecisionOsGoalScheduleDecision,
>(
  decisions: readonly TDecision[],
  decisionId: string | null | undefined,
  summary: string,
): TDecision[] {
  if (!decisionId) return [...decisions];
  return decisions.map((decision) =>
    decision.id === decisionId && decision.goalBreakdown
      ? {
          ...decision,
          goalBreakdown: {
            ...decision.goalBreakdown,
            status: "scheduled",
            scheduledSummary: summary,
          },
        }
      : decision,
  );
}

export function decisionOsGoalScheduledFeedback(args: {
  title: string | null | undefined;
  summary: string;
  now?: Date;
}): {
  toastMessage: string;
  diaryEntry: DecisionOsGoalScheduledDiaryEntry;
} {
  return {
    toastMessage: `Goal scheduled: ${args.summary}`,
    diaryEntry: {
      ts: (args.now ?? new Date()).toISOString(),
      type: "calendar",
      icon: "📅",
      title: args.title ?? "Goal",
      meta: args.summary,
    },
  };
}
