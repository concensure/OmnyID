import test from "node:test";
import assert from "node:assert/strict";

import {
  activeGoalsToGoalPulseItems,
  activeGoalsToPulseGoalOptions,
  normalizeActiveGoalRecord,
  normalizeActiveGoalsResponse,
} from "../src/lib/activeGoalsResponseState.ts";

test("normalizeActiveGoalRecord keeps shared active-goal fields and defaults unsupported values", () => {
  assert.deepEqual(
    normalizeActiveGoalRecord({
      goal_id: "goal_1",
      domain: "finance",
      title: "Launch runway plan",
      momentum: "building",
      last_signal_at: "2026-08-31",
    }),
    {
      goal_id: "goal_1",
      domain: "finance",
      title: "Launch runway plan",
      momentum: "building",
      last_signal: "2026-08-31",
    },
  );

  assert.deepEqual(
    normalizeActiveGoalRecord({ domain: "bad", momentum: "bad", title: 42 }),
    {
      goal_id: undefined,
      domain: "other",
      title: "42",
      momentum: "quiet",
      last_signal: undefined,
    },
  );
});

test("normalizeActiveGoalsResponse filters malformed goal entries", () => {
  assert.deepEqual(
    normalizeActiveGoalsResponse({
      goals: [
        { goal_id: "goal_1", domain: "career", title: "Find alpha users", momentum: "steady" },
        "bad",
      ],
    }),
    [{
      goal_id: "goal_1",
      domain: "career",
      title: "Find alpha users",
      momentum: "steady",
      last_signal: undefined,
    }],
  );
});

test("activeGoalsToGoalPulseItems maps shared active-goal records to brief goal pulse items", () => {
  assert.deepEqual(
    activeGoalsToGoalPulseItems([
      {
        goal_id: "goal_1",
        domain: "health",
        title: "Sleep more",
        momentum: "recent",
        last_signal: "2026-08-31",
      },
    ]),
    [{ domain: "health", momentum: "recent", last_signal: "2026-08-31" }],
  );
});

test("activeGoalsToPulseGoalOptions only keeps goals with stable ids and titles", () => {
  assert.deepEqual(
    activeGoalsToPulseGoalOptions([
      { goal_id: "goal_1", domain: "career", title: "Launch", momentum: "steady" },
      { domain: "finance", momentum: "building" },
    ]),
    [{ goal_id: "goal_1", domain: "career", title: "Launch" }],
  );
});
