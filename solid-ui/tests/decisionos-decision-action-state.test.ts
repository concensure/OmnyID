import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsActionTarget,
  decisionOsApproveUiState,
  decisionOsDismissUiState,
  decisionOsSnoozeUiState,
} from "../src/lib/decisionOsDecisionActionState.ts";

test("decision action state resolves the visible decision target", () => {
  const decisions = [
    { id: "a", title: "Approve budget", effort: "10 min" },
    { id: "b", title: "Reply to thread" },
  ];
  assert.deepEqual(decisionOsActionTarget(decisions, "b"), decisions[1]);
  assert.equal(decisionOsActionTarget(decisions, "missing"), null);
});

test("decision action state derives approve snapshots and next ui state", () => {
  const state = decisionOsApproveUiState({
    decisionId: "a",
    selectedId: "a",
    dismissed: new Set(["x"]),
    completedToday: 2,
    timeSavedMinutes: 15,
    effortMinutes: 10,
  });

  assert.deepEqual([...state.snapshot.dismissed], ["x"]);
  assert.equal(state.snapshot.completedToday, 2);
  assert.equal(state.snapshot.timeSavedMinutes, 15);
  assert.deepEqual([...state.next.dismissed], ["x", "a"]);
  assert.equal(state.next.completedToday, 3);
  assert.equal(state.next.timeSavedMinutes, 25);
  assert.equal(state.next.selectedId, null);
});

test("decision action state derives dismiss snapshots and selection clearing", () => {
  const state = decisionOsDismissUiState({
    decisionId: "b",
    selectedId: "b",
    dismissed: new Set(["x"]),
    completedToday: 4,
  });

  assert.deepEqual([...state.snapshot.dismissed], ["x"]);
  assert.equal(state.snapshot.completedToday, 4);
  assert.deepEqual([...state.next.dismissed], ["x", "b"]);
  assert.equal(state.next.selectedId, null);
});

test("decision action state clears focus for snooze flows", () => {
  assert.deepEqual(
    decisionOsSnoozeUiState({
      decisionId: "b",
      selectedId: "b",
    }),
    {
      selectedId: null,
      focusedIndex: -1,
    },
  );
});
