import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsGoalBreakdownAcceptPlanLabel,
  decisionOsGoalBreakdownAiInferredTitle,
  decisionOsGoalBreakdownBackLabel,
  decisionOsGoalBreakdownConfirmPlan,
  decisionOsGoalBreakdownConfirmScheduleLabel,
  decisionOsGoalBreakdownConfirmedTitle,
  decisionOsGoalBreakdownConversationPlaceholder,
  decisionOsGoalBreakdownConversationPlan,
  decisionOsGoalBreakdownConversationState,
  decisionOsGoalBreakdownConversationReply,
  decisionOsGoalBreakdownDoneLabel,
  decisionOsGoalBreakdownInferenceState,
  decisionOsGoalBreakdownInferencePlan,
  decisionOsGoalBreakdownInferenceSummary,
  decisionOsGoalBreakdownModifyDaysLabel,
  decisionOsGoalBreakdownOverviewPrompt,
  decisionOsGoalBreakdownPickDayHint,
  decisionOsGoalBreakdownPickDayTitle,
  decisionOsGoalBreakdownAnalyzingLabel,
  decisionOsGoalBreakdownSavePlanLabel,
  decisionOsGoalBreakdownSendLabel,
  decisionOsGoalBreakdownSkipLabel,
  decisionOsGoalBreakdownSchedule,
  decisionOsGoalBreakdownSelectedDaysFallbackLabel,
  decisionOsGoalBreakdownSuggestedDays,
  decisionOsGoalBreakdownTitle,
  decisionOsGoalBreakdownViewCalendarLabel,
  decisionOsGoalBreakdownWritingPlaceholder,
  decisionOsGoalBreakdownWritingPrompt,
  toggleDecisionOsGoalDaySelection,
} from "../src/lib/decisionOsGoalBreakdownModalState.ts";

test("goal breakdown modal state toggles selected days immutably", () => {
  const selected = new Set(["Tuesday"]);
  assert.deepEqual(
    [...toggleDecisionOsGoalDaySelection(selected, "Saturday")],
    ["Tuesday", "Saturday"],
  );
  assert.deepEqual(
    [...toggleDecisionOsGoalDaySelection(selected, "Tuesday")],
    [],
  );
  assert.deepEqual([...selected], ["Tuesday"]);
});

test("goal breakdown modal state builds stable conversation and inference copy", () => {
  const goal = {
    goalId: "goal-1",
    suggestedWeeklyHours: 4,
  };
  assert.equal(
    decisionOsGoalBreakdownConversationReply(goal),
    "Got it! Based on that, I suggest 4 hours a week. Would you like to pick specific days, or should I pick based on your calendar?",
  );
  assert.match(
    decisionOsGoalBreakdownInferenceSummary(goal),
    /I suggest 4 hours of study/,
  );

  assert.deepEqual(
    decisionOsGoalBreakdownConversationPlan({
      goal,
      input: "  Three evenings a week  ",
    }),
    {
      accepted: true,
      trimmedInput: "Three evenings a week",
      userMessage: "Three evenings a week",
      aiReply:
        "Got it! Based on that, I suggest 4 hours a week. Would you like to pick specific days, or should I pick based on your calendar?",
      nextStep: "pick-day",
      event: {
        goalId: "goal-1",
        action: "conversation",
        message: "Three evenings a week",
      },
    },
  );

  assert.deepEqual(
    decisionOsGoalBreakdownInferencePlan({ goal }),
    {
      nextStep: "inferring",
      inferredPlan:
        "Based on your calendar and profile, I suggest 4 hours of study split into two 1-hour sessions. Your calendar shows Tuesday evenings and Saturday mornings are usually free.",
      event: {
        goalId: "goal-1",
        action: "infer",
      },
    },
  );
});

test("goal breakdown modal state rejects blank conversation input", () => {
  assert.deepEqual(
    decisionOsGoalBreakdownConversationPlan({
      goal: { goalId: "goal-1" },
      input: "   ",
    }),
    {
      accepted: false,
      trimmedInput: "",
      userMessage: null,
      aiReply: null,
      nextStep: null,
      event: null,
    },
  );
});

test("goal breakdown modal state shapes delayed conversation and inference updates", () => {
  const goal = {
    goalId: "goal-1",
    suggestedWeeklyHours: 3,
  };

  assert.deepEqual(
    decisionOsGoalBreakdownConversationState({
      goal,
      input: "  Two nights a week ",
      chat: [{ role: "ai", text: "prompt" }],
      delayMs: 650,
    }),
    {
      accepted: true,
      immediateChat: [
        { role: "ai", text: "prompt" },
        { role: "user", text: "Two nights a week" },
      ],
      clearedInput: "",
      completionDelayMs: 650,
      completionMessage: {
        role: "ai",
        text:
          "Got it! Based on that, I suggest 3 hours a week. Would you like to pick specific days, or should I pick based on your calendar?",
      },
      nextStep: "pick-day",
      event: {
        goalId: "goal-1",
        action: "conversation",
        message: "Two nights a week",
      },
    },
  );

  assert.deepEqual(
    decisionOsGoalBreakdownConversationState({
      goal,
      input: "   ",
      chat: [{ role: "ai", text: "prompt" }],
    }),
    {
      accepted: false,
      immediateChat: [{ role: "ai", text: "prompt" }],
      clearedInput: "   ",
      completionDelayMs: null,
      completionMessage: null,
      nextStep: null,
      event: null,
    },
  );

  assert.deepEqual(
    decisionOsGoalBreakdownInferenceState({
      goal,
      delayMs: 950,
    }),
    {
      nextStep: "inferring",
      completionDelayMs: 950,
      completionInferredPlan:
        "Based on your calendar and profile, I suggest 3 hours of study split into two 1-hour sessions. Your calendar shows Tuesday evenings and Saturday mornings are usually free.",
      event: {
        goalId: "goal-1",
        action: "infer",
      },
    },
  );
});

test("goal breakdown modal state derives schedule summary from selected days and target year", () => {
  assert.deepEqual(
    decisionOsGoalBreakdownSchedule({
      goal: {
        goalId: "goal-1",
        suggestedWeeklyHours: 3,
        targetDate: "2027-08-15T00:00:00.000Z",
      },
      step: "pick-day",
      selectedDays: ["Monday", "Thursday"],
      scheduledDays: [],
    }),
    {
      days: ["Monday", "Thursday"],
      summary: "3h/week on Monday & Thursday until 2027",
    },
  );
});

test("goal breakdown modal state falls back to scheduled or default days", () => {
  assert.deepEqual(decisionOsGoalBreakdownSuggestedDays(), ["Tuesday", "Saturday"]);

  assert.deepEqual(
    decisionOsGoalBreakdownSchedule({
      goal: { goalId: "goal-1", suggestedWeeklyHours: 2 },
      step: "confirmed",
      selectedDays: [],
      scheduledDays: ["Wednesday"],
      now: new Date("2026-06-27T00:00:00Z"),
    }),
    {
      days: ["Wednesday"],
      summary: "2h/week on Wednesday until 2027",
    },
  );

  assert.deepEqual(
    decisionOsGoalBreakdownSchedule({
      goal: { goalId: "goal-1", suggestedWeeklyHours: 2 },
      step: "confirmed",
      selectedDays: [],
      scheduledDays: [],
      now: new Date("2026-06-27T00:00:00Z"),
    }),
    {
      days: ["Tuesday", "Saturday"],
      summary: "2h/week on Tuesday & Saturday until 2027",
    },
  );

  assert.deepEqual(
    decisionOsGoalBreakdownConfirmPlan({
      goal: { goalId: "goal-1", suggestedWeeklyHours: 2 },
      step: "confirmed",
      selectedDays: [],
      scheduledDays: ["Wednesday"],
      now: new Date("2026-06-27T00:00:00Z"),
    }),
    {
      schedule: {
        days: ["Wednesday"],
        summary: "2h/week on Wednesday until 2027",
      },
      nextStep: "confirmed",
      event: {
        goalId: "goal-1",
        action: "scheduled",
        selectedDays: ["Wednesday"],
        summary: "2h/week on Wednesday until 2027",
      },
    },
  );
});

test("goal breakdown modal state exposes stable modal copy", () => {
  assert.equal(decisionOsGoalBreakdownTitle(), "Goal Breakdown");
  assert.equal(decisionOsGoalBreakdownAiInferredTitle(), "AI-Inferred Plan");
  assert.equal(decisionOsGoalBreakdownConfirmedTitle(), "Added to your calendar");
  assert.equal(decisionOsGoalBreakdownViewCalendarLabel(), "View in Calendar");
  assert.equal(decisionOsGoalBreakdownDoneLabel(), "Done");
  assert.equal(decisionOsGoalBreakdownSelectedDaysFallbackLabel(), "selected days");
  assert.equal(decisionOsGoalBreakdownConversationPlaceholder(), "Type your reply...");
  assert.equal(
    decisionOsGoalBreakdownWritingPrompt(),
    'Describe your plan - e.g. "2 hours every Saturday morning and 1 hour Wednesday evening."',
  );
  assert.equal(decisionOsGoalBreakdownWritingPlaceholder(), "My study plan...");
  assert.equal(decisionOsGoalBreakdownAnalyzingLabel(), "Analysing your calendar and profile...");
  assert.equal(
    decisionOsGoalBreakdownOverviewPrompt(),
    "How would you like to break this goal down into a weekly schedule?",
  );
  assert.equal(decisionOsGoalBreakdownSkipLabel(), "Skip for now");
  assert.equal(decisionOsGoalBreakdownSendLabel(), "Send");
  assert.equal(decisionOsGoalBreakdownBackLabel(), "Back");
  assert.equal(decisionOsGoalBreakdownSavePlanLabel(), "Save plan");
  assert.equal(decisionOsGoalBreakdownModifyDaysLabel(), "Modify days");
  assert.equal(decisionOsGoalBreakdownAcceptPlanLabel(), "Accept plan");
  assert.equal(decisionOsGoalBreakdownPickDayTitle(), "When's your best day for this?");
  assert.equal(
    decisionOsGoalBreakdownPickDayHint(),
    "Select the days you'll dedicate to this goal, or let AI deduce from your calendar.",
  );
  assert.equal(decisionOsGoalBreakdownConfirmScheduleLabel(), "Confirm schedule");
});
