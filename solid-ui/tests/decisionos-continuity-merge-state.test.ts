import test from "node:test";
import assert from "node:assert/strict";

import { mergeDecisionOsContinuityDecisions } from "../src/lib/decisionOsContinuityMergeState.ts";

test("decisionos continuity merge state prepends continuity decisions onto next base decisions", () => {
  const result = mergeDecisionOsContinuityDecisions({
    currentDecisions: [
      { id: "continuity-priority-card" },
      { id: "normal-old" },
    ],
    nextDecisions: [
      { id: "normal-new" },
      { id: "normal-second" },
    ],
    continuityDecisions: [
      { id: "continuity:new-priority" },
      { id: "continuity:new-action" },
    ],
    continuitySelection: { selectedId: "continuity:new-priority", focusedIndex: 0 },
    shouldReplaceContinuityDecisions: true,
    shouldClearContinuityDecisions: false,
  });

  assert.deepEqual(
    result.decisions.map((decision) => decision.id),
    ["continuity:new-priority", "continuity:new-action", "normal-new", "normal-second"],
  );
  assert.deepEqual(result.continuitySelection, {
    selectedId: "continuity:new-priority",
    focusedIndex: 0,
  });
});

test("decisionos continuity merge state clears synthetic decisions from the chosen base set", () => {
  const result = mergeDecisionOsContinuityDecisions({
    currentDecisions: [
      { id: "continuity-action:old" },
      { id: "normal-old" },
    ],
    nextDecisions: null,
    continuityDecisions: [],
    continuitySelection: { selectedId: null, focusedIndex: -1 },
    shouldReplaceContinuityDecisions: false,
    shouldClearContinuityDecisions: true,
  });

  assert.deepEqual(
    result.decisions.map((decision) => decision.id),
    ["normal-old"],
  );
  assert.deepEqual(result.continuitySelection, {
    selectedId: null,
    focusedIndex: -1,
  });
});

test("decisionos continuity merge state leaves base decisions untouched when no continuity merge is requested", () => {
  const result = mergeDecisionOsContinuityDecisions({
    currentDecisions: [{ id: "normal-current" }],
    nextDecisions: [{ id: "normal-next" }],
    continuityDecisions: [{ id: "continuity:ignored" }],
    continuitySelection: { selectedId: "continuity:ignored", focusedIndex: 0 },
    shouldReplaceContinuityDecisions: false,
    shouldClearContinuityDecisions: false,
  });

  assert.deepEqual(
    result.decisions.map((decision) => decision.id),
    ["normal-next"],
  );
  assert.equal(result.continuitySelection, null);
});
