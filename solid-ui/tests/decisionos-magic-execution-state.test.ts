import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsMagicDispatchPlan,
  decisionOsMagicExecutionPlan,
} from "../src/lib/decisionOsMagicExecutionState.ts";

const decisions = [
  {
    id: "d1",
    goalBreakdown: { status: "needs_breakdown" },
    contextItems: [{ sourceType: "thread" as const, title: "Thread A" }],
  },
  {
    id: "d2",
    goalBreakdown: { status: "scheduled" },
    contextItems: [{ sourceType: "email" as const, title: "Email B" }],
  },
] as const;

test("decisionos magic execution state resolves approve behavior and goal-breakdown gating", () => {
  assert.deepEqual(
    decisionOsMagicExecutionPlan({
      action: { kind: "approve", decisionId: "d1" },
      decisions,
    }),
    {
      kind: "approve",
      decision: decisions[0],
      requiresGoalBreakdown: true,
    },
  );
  assert.deepEqual(
    decisionOsMagicExecutionPlan({
      action: { kind: "approve", decisionId: "missing" },
      decisions,
    }),
    { kind: "none" },
  );
});

test("decisionos magic execution state forwards dismiss and search directly", () => {
  assert.deepEqual(
    decisionOsMagicExecutionPlan({
      action: { kind: "dismiss", decisionId: "d2" },
      decisions,
    }),
    { kind: "dismiss", decisionId: "d2" },
  );
  assert.deepEqual(
    decisionOsMagicExecutionPlan({
      action: { kind: "search", term: "impact:high" },
      decisions,
    }),
    { kind: "search", term: "impact:high" },
  );
});

test("decisionos magic execution state resolves thread-open targets only when a thread context exists", () => {
  assert.deepEqual(
    decisionOsMagicExecutionPlan({
      action: { kind: "open-thread", decisionId: "d1" },
      decisions,
    }),
    { kind: "open-thread", item: decisions[0].contextItems[0] },
  );
  assert.deepEqual(
    decisionOsMagicExecutionPlan({
      action: { kind: "open-thread", decisionId: "d2" },
      decisions,
    }),
    { kind: "none" },
  );
});

test("decisionos magic execution state derives dispatch plans from resolved execution", () => {
  assert.deepEqual(
    decisionOsMagicDispatchPlan(
      decisionOsMagicExecutionPlan({
        action: { kind: "approve", decisionId: "d1" },
        decisions,
      }),
    ),
    { kind: "open-goal-breakdown", decision: decisions[0] },
  );

  assert.deepEqual(
    decisionOsMagicDispatchPlan(
      decisionOsMagicExecutionPlan({
        action: { kind: "approve", decisionId: "d2" },
        decisions,
      }),
    ),
    { kind: "handle-action", decisionId: "d2", action: "approve" },
  );

  assert.deepEqual(
    decisionOsMagicDispatchPlan(
      decisionOsMagicExecutionPlan({
        action: { kind: "search", term: "impact:high" },
        decisions,
      }),
    ),
    { kind: "dispatch-search", term: "impact:high" },
  );
});
