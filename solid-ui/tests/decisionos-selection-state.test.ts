import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsContextSelection,
  decisionOsFocusModeSelection,
  decisionOsFocusTargetForId,
} from "../src/lib/decisionOsSelectionState.ts";

const decisions = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Beta" },
  { id: "c", title: "Gamma" },
] as const;

test("decisionos selection state prefers pinned context decisions over selected decisions", () => {
  assert.deepEqual(
    decisionOsContextSelection({
      decisions,
      pinnedContextId: "b",
      selectedDecision: decisions[0],
    }),
    decisions[1],
  );
  assert.deepEqual(
    decisionOsContextSelection({
      decisions,
      pinnedContextId: "missing",
      selectedDecision: decisions[0],
    }),
    decisions[0],
  );
});

test("decisionos selection state resolves focus-mode decisions from the list", () => {
  assert.deepEqual(decisionOsFocusModeSelection(decisions, "c"), decisions[2]);
  assert.equal(decisionOsFocusModeSelection(decisions, "missing"), null);
  assert.equal(decisionOsFocusModeSelection(decisions, null), null);
});

test("decisionos selection state derives selected id and focused index for a target decision", () => {
  assert.deepEqual(decisionOsFocusTargetForId(decisions, "b"), {
    selectedId: "b",
    focusedIndex: 1,
  });
  assert.deepEqual(decisionOsFocusTargetForId(decisions, "missing"), {
    selectedId: "missing",
    focusedIndex: -1,
  });
  assert.deepEqual(decisionOsFocusTargetForId(decisions, null), {
    selectedId: null,
    focusedIndex: -1,
  });
});
