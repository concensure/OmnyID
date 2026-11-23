import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDecisionOsGoalScheduled,
  decisionOsGoalScheduledFeedback,
} from "../src/lib/decisionOsGoalScheduleState.ts";

test("decisionos goal schedule state marks the matching decision as scheduled", () => {
  const decisions = [
    { id: "a", goalBreakdown: { status: "needs_breakdown" } },
    { id: "b", goalBreakdown: { status: "scheduled", scheduledSummary: "Old" } },
  ];

  const next = applyDecisionOsGoalScheduled(decisions, "a", "Mon/Wed/Fri");
  assert.deepEqual(next, [
    { id: "a", goalBreakdown: { status: "scheduled", scheduledSummary: "Mon/Wed/Fri" } },
    { id: "b", goalBreakdown: { status: "scheduled", scheduledSummary: "Old" } },
  ]);
});

test("decisionos goal schedule state leaves decisions unchanged when no id is provided", () => {
  const decisions = [{ id: "a", goalBreakdown: { status: "needs_breakdown" } }];
  assert.deepEqual(
    applyDecisionOsGoalScheduled(decisions, null, "Mon/Wed/Fri"),
    decisions,
  );
});

test("decisionos goal schedule state builds toast and diary feedback", () => {
  assert.deepEqual(
    decisionOsGoalScheduledFeedback({
      title: "IELTS prep",
      summary: "Mon/Wed/Fri",
      now: new Date("2026-06-27T10:00:00Z"),
    }),
    {
      toastMessage: "Goal scheduled: Mon/Wed/Fri",
      diaryEntry: {
        ts: "2026-06-27T10:00:00.000Z",
        type: "calendar",
        icon: "📅",
        title: "IELTS prep",
        meta: "Mon/Wed/Fri",
      },
    },
  );
});
