import test from "node:test";
import assert from "node:assert/strict";

import { decisionOsKeyboardExecutionPlan } from "../src/lib/decisionOsKeyboardExecutionState.ts";

const visibleDecisions = [
  { id: "d1", calendarEventId: "event-1" },
  { id: "d2", goalBreakdown: { status: "needs_breakdown" } },
  { id: "d3" },
];

test("decisionos keyboard execution state derives focus transitions", () => {
  assert.deepEqual(
    decisionOsKeyboardExecutionPlan({
      intent: { kind: "focus-next" },
      visibleDecisions,
      focusedIndex: 0,
      focusedDecision: visibleDecisions[0] ?? null,
      selectedOrFocused: visibleDecisions[0] ?? null,
      currentFocusModeId: null,
      currentPinnedContextId: null,
      currentMood: "focused",
    }),
    { kind: "focus", selectedId: "d2", focusedIndex: 1 },
  );

  assert.deepEqual(
    decisionOsKeyboardExecutionPlan({
      intent: { kind: "focus-prev" },
      visibleDecisions,
      focusedIndex: 1,
      focusedDecision: visibleDecisions[1] ?? null,
      selectedOrFocused: visibleDecisions[1] ?? null,
      currentFocusModeId: null,
      currentPinnedContextId: null,
      currentMood: "focused",
    }),
    { kind: "focus", selectedId: "d1", focusedIndex: 0 },
  );
});

test("decisionos keyboard execution state derives action plans for focused decisions", () => {
  const approval = decisionOsKeyboardExecutionPlan({
    intent: { kind: "approve-focused" },
    visibleDecisions,
    focusedIndex: 1,
    focusedDecision: visibleDecisions[1] ?? null,
    selectedOrFocused: visibleDecisions[1] ?? null,
    currentFocusModeId: null,
    currentPinnedContextId: null,
    currentMood: "focused",
  });
  assert.equal(approval.kind, "approve");
  assert.equal(approval.decisionId, "d2");
  assert.equal(approval.requiresGoalBreakdown, true);

  assert.deepEqual(
    decisionOsKeyboardExecutionPlan({
      intent: { kind: "dismiss-focused" },
      visibleDecisions,
      focusedIndex: 2,
      focusedDecision: visibleDecisions[2] ?? null,
      selectedOrFocused: visibleDecisions[2] ?? null,
      currentFocusModeId: null,
      currentPinnedContextId: null,
      currentMood: "focused",
    }),
    { kind: "dismiss", decisionId: "d3", focusedIndex: 1 },
  );

  assert.deepEqual(
    decisionOsKeyboardExecutionPlan({
      intent: { kind: "snooze-focused" },
      visibleDecisions,
      focusedIndex: 2,
      focusedDecision: visibleDecisions[2] ?? null,
      selectedOrFocused: visibleDecisions[2] ?? null,
      currentFocusModeId: null,
      currentPinnedContextId: null,
      currentMood: "focused",
    }),
    { kind: "snooze", decisionId: "d3", snoozeId: "tomorrow" },
  );
});

test("decisionos keyboard execution state derives navigation and toggle plans", () => {
  assert.deepEqual(
    decisionOsKeyboardExecutionPlan({
      intent: { kind: "open-calendar" },
      visibleDecisions,
      focusedIndex: 0,
      focusedDecision: visibleDecisions[0] ?? null,
      selectedOrFocused: visibleDecisions[0] ?? null,
      currentFocusModeId: null,
      currentPinnedContextId: null,
      currentMood: "focused",
    }),
    { kind: "open-calendar", eventId: "event-1" },
  );

  assert.deepEqual(
    decisionOsKeyboardExecutionPlan({
      intent: { kind: "toggle-focus-mode" },
      visibleDecisions,
      focusedIndex: -1,
      focusedDecision: null,
      selectedOrFocused: null,
      currentFocusModeId: null,
      currentPinnedContextId: null,
      currentMood: "tired",
    }),
    { kind: "toggle-mood", value: "neutral" },
  );

  assert.deepEqual(
    decisionOsKeyboardExecutionPlan({
      intent: { kind: "toggle-pin-context" },
      visibleDecisions,
      focusedIndex: 0,
      focusedDecision: visibleDecisions[0] ?? null,
      selectedOrFocused: visibleDecisions[0] ?? null,
      currentFocusModeId: null,
      currentPinnedContextId: null,
      currentMood: "focused",
    }),
    { kind: "set-pinned-context", value: "d1" },
  );
});
