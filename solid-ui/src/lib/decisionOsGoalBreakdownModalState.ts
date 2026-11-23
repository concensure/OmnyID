// @locs-version: 1.0
export type DecisionOsGoalBreakdownStateGoal = {
  goalId: string;
  description?: string | null;
  suggestedWeeklyHours?: number | null;
  targetDate?: string | null;
};

export type DecisionOsGoalBreakdownStep =
  | "overview"
  | "conversation"
  | "writing"
  | "pick-day"
  | "inferring"
  | "confirmed";

export type DecisionOsGoalBreakdownEventDetail = {
  goalId: string;
  action: "conversation" | "infer" | "scheduled";
  message?: string;
  selectedDays?: string[];
  summary?: string;
};

export type DecisionOsGoalBreakdownChatMessage = {
  role: "ai" | "user";
  text: string;
};

export function decisionOsGoalBreakdownSuggestedDays(): string[] {
  return ["Tuesday", "Saturday"];
}

export function decisionOsGoalBreakdownTitle(): string {
  return "Goal Breakdown";
}

export function decisionOsGoalBreakdownAiInferredTitle(): string {
  return "AI-Inferred Plan";
}

export function decisionOsGoalBreakdownConfirmedTitle(): string {
  return "Added to your calendar";
}

export function decisionOsGoalBreakdownViewCalendarLabel(): string {
  return "View in Calendar";
}

export function decisionOsGoalBreakdownDoneLabel(): string {
  return "Done";
}

export function decisionOsGoalBreakdownSelectedDaysFallbackLabel(): string {
  return "selected days";
}

export function decisionOsGoalBreakdownOverviewPrompt(): string {
  return "How would you like to break this goal down into a weekly schedule?";
}

export function decisionOsGoalBreakdownSkipLabel(): string {
  return "Skip for now";
}

export function decisionOsGoalBreakdownSendLabel(): string {
  return "Send";
}

export function decisionOsGoalBreakdownConversationPlaceholder(): string {
  return "Type your reply...";
}

export function decisionOsGoalBreakdownBackLabel(): string {
  return "Back";
}

export function decisionOsGoalBreakdownSavePlanLabel(): string {
  return "Save plan";
}

export function decisionOsGoalBreakdownModifyDaysLabel(): string {
  return "Modify days";
}

export function decisionOsGoalBreakdownAcceptPlanLabel(): string {
  return "Accept plan";
}

export function decisionOsGoalBreakdownPickDayTitle(): string {
  return "When's your best day for this?";
}

export function decisionOsGoalBreakdownPickDayHint(): string {
  return "Select the days you'll dedicate to this goal, or let AI deduce from your calendar.";
}

export function decisionOsGoalBreakdownConfirmScheduleLabel(): string {
  return "Confirm schedule";
}

export function decisionOsGoalBreakdownWritingPrompt(): string {
  return 'Describe your plan - e.g. "2 hours every Saturday morning and 1 hour Wednesday evening."';
}

export function decisionOsGoalBreakdownWritingPlaceholder(): string {
  return "My study plan...";
}

export function decisionOsGoalBreakdownAnalyzingLabel(): string {
  return "Analysing your calendar and profile...";
}

export function toggleDecisionOsGoalDaySelection(
  selectedDays: ReadonlySet<string>,
  day: string,
): Set<string> {
  const next = new Set(selectedDays);
  if (next.has(day)) {
    next.delete(day);
  } else {
    next.add(day);
  }
  return next;
}

export function decisionOsGoalBreakdownConversationReply(
  goal: DecisionOsGoalBreakdownStateGoal,
): string {
  return `Got it! Based on that, I suggest ${goal.suggestedWeeklyHours ?? 2} hours a week. Would you like to pick specific days, or should I pick based on your calendar?`;
}

export function decisionOsGoalBreakdownConversationPlan(args: {
  goal: DecisionOsGoalBreakdownStateGoal;
  input: string;
}): {
  accepted: boolean;
  trimmedInput: string;
  userMessage: string | null;
  aiReply: string | null;
  nextStep: DecisionOsGoalBreakdownStep | null;
  event: DecisionOsGoalBreakdownEventDetail | null;
} {
  const trimmedInput = args.input.trim();
  if (!trimmedInput) {
    return {
      accepted: false,
      trimmedInput,
      userMessage: null,
      aiReply: null,
      nextStep: null,
      event: null,
    };
  }

  return {
    accepted: true,
    trimmedInput,
    userMessage: trimmedInput,
    aiReply: decisionOsGoalBreakdownConversationReply(args.goal),
    nextStep: "pick-day",
    event: {
      goalId: args.goal.goalId,
      action: "conversation",
      message: trimmedInput,
    },
  };
}

export function decisionOsGoalBreakdownConversationState(args: {
  goal: DecisionOsGoalBreakdownStateGoal;
  input: string;
  chat: readonly DecisionOsGoalBreakdownChatMessage[];
  delayMs?: number;
}):
  | {
      accepted: false;
      immediateChat: DecisionOsGoalBreakdownChatMessage[];
      clearedInput: string;
      completionDelayMs: null;
      completionMessage: null;
      nextStep: null;
      event: null;
    }
  | {
      accepted: true;
      immediateChat: DecisionOsGoalBreakdownChatMessage[];
      clearedInput: string;
      completionDelayMs: number;
      completionMessage: DecisionOsGoalBreakdownChatMessage;
      nextStep: DecisionOsGoalBreakdownStep;
      event: DecisionOsGoalBreakdownEventDetail;
    } {
  const plan = decisionOsGoalBreakdownConversationPlan(args);
  if (!plan.accepted || !plan.userMessage || !plan.aiReply || !plan.nextStep || !plan.event) {
    return {
      accepted: false,
      immediateChat: [...args.chat],
      clearedInput: args.input,
      completionDelayMs: null,
      completionMessage: null,
      nextStep: null,
      event: null,
    };
  }

  return {
    accepted: true,
    immediateChat: [...args.chat, { role: "user", text: plan.userMessage }],
    clearedInput: "",
    completionDelayMs: args.delayMs ?? 800,
    completionMessage: {
      role: "ai",
      text: plan.aiReply,
    },
    nextStep: plan.nextStep,
    event: plan.event,
  };
}

export function decisionOsGoalBreakdownInferenceSummary(
  goal: DecisionOsGoalBreakdownStateGoal,
): string {
  return (
    `Based on your calendar and profile, I suggest ${goal.suggestedWeeklyHours ?? 2} hours of study ` +
    "split into two 1-hour sessions. Your calendar shows Tuesday evenings and Saturday mornings are usually free."
  );
}

export function decisionOsGoalBreakdownInferencePlan(args: {
  goal: DecisionOsGoalBreakdownStateGoal;
}): {
  nextStep: DecisionOsGoalBreakdownStep;
  inferredPlan: string;
  event: DecisionOsGoalBreakdownEventDetail;
} {
  return {
    nextStep: "inferring",
    inferredPlan: decisionOsGoalBreakdownInferenceSummary(args.goal),
    event: {
      goalId: args.goal.goalId,
      action: "infer",
    },
  };
}

export function decisionOsGoalBreakdownInferenceState(args: {
  goal: DecisionOsGoalBreakdownStateGoal;
  delayMs?: number;
}): {
  nextStep: DecisionOsGoalBreakdownStep;
  completionDelayMs: number;
  completionInferredPlan: string;
  event: DecisionOsGoalBreakdownEventDetail;
} {
  const plan = decisionOsGoalBreakdownInferencePlan(args);
  return {
    nextStep: plan.nextStep,
    completionDelayMs: args.delayMs ?? 1200,
    completionInferredPlan: plan.inferredPlan,
    event: plan.event,
  };
}

export function decisionOsGoalBreakdownSchedule(args: {
  goal: DecisionOsGoalBreakdownStateGoal;
  step: DecisionOsGoalBreakdownStep;
  selectedDays: readonly string[];
  scheduledDays: readonly string[];
  now?: Date;
}): {
  days: string[];
  summary: string;
} {
  const days =
    args.step === "pick-day"
      ? [...args.selectedDays]
      : args.scheduledDays.length > 0
        ? [...args.scheduledDays]
        : decisionOsGoalBreakdownSuggestedDays();

  const targetYear = args.goal.targetDate
    ? new Date(args.goal.targetDate).getFullYear()
    : (args.now ?? new Date()).getFullYear() + 1;

  return {
    days,
    summary: `${args.goal.suggestedWeeklyHours ?? 2}h/week on ${days.join(" & ")} until ${targetYear}`,
  };
}

export function decisionOsGoalBreakdownConfirmPlan(args: {
  goal: DecisionOsGoalBreakdownStateGoal;
  step: DecisionOsGoalBreakdownStep;
  selectedDays: readonly string[];
  scheduledDays: readonly string[];
  now?: Date;
}): {
  schedule: {
    days: string[];
    summary: string;
  };
  nextStep: DecisionOsGoalBreakdownStep;
  event: DecisionOsGoalBreakdownEventDetail;
} {
  const schedule = decisionOsGoalBreakdownSchedule(args);
  return {
    schedule,
    nextStep: "confirmed",
    event: {
      goalId: args.goal.goalId,
      action: "scheduled",
      selectedDays: schedule.days,
      summary: schedule.summary,
    },
  };
}
