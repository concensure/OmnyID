import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsMagicActionPlan,
  decisionOsSelectionAfterContinuityUpdate,
  shouldFocusDecisionOsResponseQueue,
} from "../src/lib/decisionOsEventBridgeState.ts";

test("decisionos event bridge state classifies magic actions", () => {
  assert.deepEqual(
    decisionOsMagicActionPlan({ action: "approve", msgId: "d1" }),
    { kind: "approve", decisionId: "d1" },
  );
  assert.deepEqual(
    decisionOsMagicActionPlan({ action: "search", msgId: "impact:high" }),
    { kind: "search", term: "impact:high" },
  );
  assert.deepEqual(
    decisionOsMagicActionPlan({ action: "open-thread", msgId: "thread-d2" }),
    { kind: "open-thread", decisionId: "d2" },
  );
  assert.deepEqual(decisionOsMagicActionPlan({ action: "unknown", msgId: "x" }), { kind: "none" });
  assert.deepEqual(decisionOsMagicActionPlan(null), { kind: "none" });
});

test("decisionos event bridge state detects response queue focus triggers", () => {
  assert.equal(shouldFocusDecisionOsResponseQueue("response_queue"), true);
  assert.equal(shouldFocusDecisionOsResponseQueue("calendar"), false);
  assert.equal(shouldFocusDecisionOsResponseQueue(undefined), false);
});

test("decisionos event bridge state derives selection resets after continuity updates", () => {
  assert.deepEqual(
    decisionOsSelectionAfterContinuityUpdate({
      continuityDecisionIds: ["continuity-1", "continuity-2"],
      hasContinuityPrimaryMode: true,
      selectedId: null,
      isSyntheticSelected: false,
    }),
    { selectedId: "continuity-1", focusedIndex: 0 },
  );
  assert.deepEqual(
    decisionOsSelectionAfterContinuityUpdate({
      continuityDecisionIds: [],
      hasContinuityPrimaryMode: true,
      selectedId: "continuity-1",
      isSyntheticSelected: true,
    }),
    { selectedId: null, focusedIndex: -1 },
  );
  assert.equal(
    decisionOsSelectionAfterContinuityUpdate({
      continuityDecisionIds: [],
      hasContinuityPrimaryMode: false,
      selectedId: "normal-1",
      isSyntheticSelected: false,
    }),
    null,
  );
});
