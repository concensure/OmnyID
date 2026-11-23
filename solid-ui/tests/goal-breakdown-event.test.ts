import test from "node:test";
import assert from "node:assert/strict";

import { readGoalBreakdownEventDetail } from "../src/lib/goalBreakdownEvent.ts";

test("readGoalBreakdownEventDetail accepts only valid goal breakdown payloads", () => {
  assert.deepEqual(
    readGoalBreakdownEventDetail(new CustomEvent("x", {
      detail: {
        goalId: "goal-1",
        action: "scheduled",
        message: "Schedule this next week.",
        selectedDays: ["Mon", "Wed"],
        summary: "Mon/Wed plan",
      },
    })),
    {
      goalId: "goal-1",
      action: "scheduled",
      message: "Schedule this next week.",
      selectedDays: ["Mon", "Wed"],
      summary: "Mon/Wed plan",
    },
  );
  assert.equal(
    readGoalBreakdownEventDetail(new CustomEvent("x", {
      detail: {
        goalId: "goal-1",
        action: "invalid",
      },
    })),
    null,
  );
  assert.equal(
    readGoalBreakdownEventDetail(new CustomEvent("x", {
      detail: {
        goalId: "goal-1",
        action: "scheduled",
        selectedDays: ["Mon", 2],
      },
    })),
    null,
  );
  assert.equal(
    readGoalBreakdownEventDetail(new CustomEvent("x", {
      detail: {
        goalId: 7,
        action: "infer",
      },
    })),
    null,
  );
  assert.equal(
    readGoalBreakdownEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readGoalBreakdownEventDetail(new Event("x")),
    null,
  );
});
