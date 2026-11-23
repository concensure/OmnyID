import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsFocusedItem,
  decisionOsSelectedOrFocusedItem,
  nextDecisionOsFocusIndex,
  previousDecisionOsFocusAfterDismiss,
  previousDecisionOsFocusIndex,
  toggledDecisionOsFocusModeId,
  toggledDecisionOsPinnedContextId,
} from "../src/lib/decisionOsKeyboardState.ts";

const visible = [{ id: "a" }, { id: "b" }, { id: "c" }] as const;

test("decisionos keyboard state clamps focus movement", () => {
  assert.equal(nextDecisionOsFocusIndex(-1, visible.length), 0);
  assert.equal(nextDecisionOsFocusIndex(1, visible.length), 2);
  assert.equal(nextDecisionOsFocusIndex(2, visible.length), 2);
  assert.equal(previousDecisionOsFocusIndex(2), 1);
  assert.equal(previousDecisionOsFocusIndex(0), 0);
  assert.equal(previousDecisionOsFocusAfterDismiss(2), 1);
  assert.equal(previousDecisionOsFocusAfterDismiss(0), 0);
});

test("decisionos keyboard state resolves focused and selected targets", () => {
  assert.deepEqual(decisionOsFocusedItem(visible, 1), { id: "b" });
  assert.equal(decisionOsFocusedItem(visible, -1), null);
  assert.deepEqual(decisionOsSelectedOrFocusedItem({ id: "z" }, visible, 1), { id: "z" });
  assert.deepEqual(decisionOsSelectedOrFocusedItem(null, visible, 2), { id: "c" });
});

test("decisionos keyboard state toggles focus mode and pinned context ids", () => {
  assert.equal(toggledDecisionOsFocusModeId(null, "a"), "a");
  assert.equal(toggledDecisionOsFocusModeId("a", "a"), null);
  assert.equal(toggledDecisionOsFocusModeId("b", null), "b");
  assert.equal(toggledDecisionOsPinnedContextId(null, "a"), "a");
  assert.equal(toggledDecisionOsPinnedContextId("a", "b"), null);
  assert.equal(toggledDecisionOsPinnedContextId(null, null), null);
});
