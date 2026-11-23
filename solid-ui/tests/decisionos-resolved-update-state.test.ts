import test from "node:test";
import assert from "node:assert/strict";

import { decisionOsResolvedUpdateState } from "../src/lib/decisionOsResolvedUpdateState.ts";

test("decisionos resolved update state merges continuity decisions and carries normalized slices", () => {
  const result = decisionOsResolvedUpdateState({
    currentDecisions: [{ id: "old" }],
    next: {
      decisions: [{ id: "base" }],
      suggestedMood: "focused",
      queueState: {
        queuePriorityCard: { title: "Priority" },
        queueActionItems: [{ id: "a1" }],
        queueContextPanelItems: [{ id: "c1" }],
      },
      queueCompanionState: {
        responseItems: [{ id: "r1" }],
        preparedDraftItems: [{ id: "p1" }],
        contextPackItems: [{ id: "cp1" }],
        proactiveSuggestions: [{ id: "ps1" }],
      },
      operationalBootstrap: { messages: [], cost_status: { alert_level: "info" }, cost_snapshot: { budget_pct: 10 } },
      continuityDecisions: [{ id: "continuity-priority-card" }],
      continuitySelection: { selectedId: "continuity-priority-card", focusedIndex: 0 },
      shouldReplaceContinuityDecisions: true,
      shouldClearContinuityDecisions: false,
    },
    mergeContinuityDecisions(args) {
      assert.deepEqual(args.currentDecisions, [{ id: "old" }]);
      assert.deepEqual(args.nextDecisions, [{ id: "base" }]);
      return {
        decisions: [{ id: "continuity-priority-card" }, { id: "base" }],
        continuitySelection: args.continuitySelection,
      };
    },
  });

  assert.ok(result);
  assert.deepEqual(result?.decisions, [{ id: "continuity-priority-card" }, { id: "base" }]);
  assert.equal(result?.suggestedMood, "focused");
  assert.deepEqual(result?.queueState, {
    queuePriorityCard: { title: "Priority" },
    queueActionItems: [{ id: "a1" }],
    queueContextPanelItems: [{ id: "c1" }],
  });
  assert.deepEqual(result?.queueCompanionState, {
    responseItems: [{ id: "r1" }],
    preparedDraftItems: [{ id: "p1" }],
    contextPackItems: [{ id: "cp1" }],
    proactiveSuggestions: [{ id: "ps1" }],
  });
  assert.deepEqual(result?.continuitySelection, {
    selectedId: "continuity-priority-card",
    focusedIndex: 0,
  });
});

test("decisionos resolved update state returns null for missing normalized updates", () => {
  assert.equal(
    decisionOsResolvedUpdateState({
      currentDecisions: [],
      next: null,
      mergeContinuityDecisions() {
        throw new Error("should not run");
      },
    }),
    null,
  );
});
