import test from "node:test";
import assert from "node:assert/strict";

import { decisionOsUpdateApplicationState } from "../src/lib/decisionOsUpdateApplicationState.ts";
import { decisionOsSelectionAfterContinuityUpdate } from "../src/lib/decisionOsEventBridgeState.ts";

test("decisionos update application state normalizes slices and builds continuity decisions", () => {
  const state = decisionOsUpdateApplicationState({
    detail: {
      continuityPrimaryMode: "priority_card",
      queueState: {
        queuePriorityCard: {
          title: "Follow up with vendor",
          description: "Awaiting approval to send escalation.",
          panel_kind: "priority",
          requires_approval: true,
          action_label: "Open",
        },
        queueActionItems: [
          {
            id: "action-1",
            title: "Reply to thread",
            category: "response",
            urgency: "high",
            confidence: "high",
            requires_approval: false,
            suggested_action: "Reply",
            source_refs: ["thread:123"],
          },
        ],
        queueContextPanelItems: [],
      },
      queueCompanionState: {
        responseItems: [],
        preparedDraftItems: [],
        contextPackItems: [],
        proactiveSuggestions: [],
      },
    },
    selectedId: null,
    buildActionDecision: (item) => ({ id: `decision:${item.id}` }),
    buildPriorityDecision: (card) => ({ id: `priority:${card.title}` }),
    planContinuitySelection: decisionOsSelectionAfterContinuityUpdate,
  });

  assert.ok(state);
  assert.equal(state?.continuityDecisions.length, 2);
  assert.deepEqual(state?.queueState, {
    queuePriorityCard: {
      title: "Follow up with vendor",
      description: "Awaiting approval to send escalation.",
      panel_kind: "priority",
      requires_approval: true,
      action_label: "Open",
    },
    queueActionItems: [
      {
        id: "action-1",
        title: "Reply to thread",
        category: "response",
        urgency: "high",
        confidence: "high",
        requires_approval: false,
        suggested_action: "Reply",
        source_refs: ["thread:123"],
      },
    ],
    queueContextPanelItems: [],
  });
  assert.deepEqual(state?.queueCompanionState, {
    responseItems: [],
    preparedDraftItems: [],
    contextPackItems: [],
    proactiveSuggestions: [],
  });
  assert.equal(state?.shouldReplaceContinuityDecisions, true);
  assert.equal(state?.shouldClearContinuityDecisions, false);
  assert.deepEqual(state?.continuitySelection, {
    selectedId: state?.continuityDecisions[0]?.id ?? null,
    focusedIndex: 0,
  });
});

test("decisionos update application state derives queue priority mode from normalized slices when the transport hint is missing", () => {
  const state = decisionOsUpdateApplicationState({
    detail: {
      queueState: {
        queuePriorityCard: {
          title: "Review renewal memo",
          description: "Prepared decision support is ready.",
          panel_kind: "priority",
          requires_approval: false,
          action_label: "Open",
        },
        queueActionItems: [],
        queueContextPanelItems: [],
      },
    },
    selectedId: null,
    buildActionDecision: (item) => ({ id: `decision:${item.id}` }),
    buildPriorityDecision: (card) => ({ id: `priority:${card.title}` }),
    planContinuitySelection: decisionOsSelectionAfterContinuityUpdate,
  });

  assert.ok(state);
  assert.deepEqual(state?.continuityDecisions, [{ id: "priority:Review renewal memo" }]);
  assert.equal(state?.shouldReplaceContinuityDecisions, true);
  assert.equal(state?.shouldClearContinuityDecisions, false);
});

test("decisionos update application state requests synthetic selection reset when continuity clears", () => {
  const state = decisionOsUpdateApplicationState({
    detail: {
      continuityPrimaryMode: "continuity_panel",
      queueState: {
        queuePriorityCard: null,
        queueActionItems: [],
        queueContextPanelItems: [],
      },
    },
    selectedId: "continuity-priority-card",
    buildActionDecision: (item) => ({ id: `decision:${item.id}` }),
    buildPriorityDecision: (card) => ({ id: `priority:${card.title}` }),
    planContinuitySelection: decisionOsSelectionAfterContinuityUpdate,
  });

  assert.ok(state);
  assert.equal(state?.shouldReplaceContinuityDecisions, false);
  assert.equal(state?.shouldClearContinuityDecisions, true);
  assert.deepEqual(state?.continuitySelection, {
    selectedId: null,
    focusedIndex: -1,
  });
});

test("decisionos update application state backfills atomic queue state from operational bootstrap details", () => {
  const state = decisionOsUpdateApplicationState({
    detail: {
      continuityPrimaryMode: "priority_card",
      operationalBootstrap: {
        messages: [],
        action_log: [],
        proactive_suggestions: [],
        continuity_brief: null,
        continuity_action_items: [
          {
            id: "action-legacy",
            title: "Review legacy queue item",
            category: "review",
            urgency: "medium",
            confidence: "medium",
            requires_approval: false,
            suggested_action: "Open",
            source_refs: ["thread:legacy"],
          },
        ],
        continuity_context_panel_items: [{ id: "ctx-legacy", label: "Legacy context" }],
        continuity_context_pack_items: [{ id: "pack-legacy" }],
        continuity_priority_card: {
          title: "Backfilled queue priority",
          description: "Legacy event detail only carried bootstrap slices.",
          panel_kind: "priority",
          requires_approval: false,
          action_label: "Open",
        },
      } as any,
    },
    selectedId: null,
    buildActionDecision: (item) => ({ id: `decision:${item.id}` }),
    buildPriorityDecision: (card) => ({ id: `priority:${card.title}` }),
    planContinuitySelection: decisionOsSelectionAfterContinuityUpdate,
  });

  assert.ok(state);
  assert.deepEqual(state?.queueState, {
    queuePriorityCard: {
      title: "Backfilled queue priority",
      description: "Legacy event detail only carried bootstrap slices.",
      panel_kind: "priority",
      requires_approval: false,
      action_label: "Open",
    },
    queueActionItems: [
      {
        id: "action-legacy",
        title: "Review legacy queue item",
        category: "review",
        urgency: "medium",
        confidence: "medium",
        requires_approval: false,
        suggested_action: "Open",
        source_refs: ["thread:legacy"],
      },
    ],
    queueContextPanelItems: [{ id: "ctx-legacy", label: "Legacy context" }],
    queueActionOverflowCount: 0,
    queueActionOverflowSummary: null,
  });
  assert.deepEqual(state?.queueCompanionState, {
    responseItems: [],
    preparedDraftItems: [],
    contextPackItems: [{ id: "pack-legacy" }],
    proactiveSuggestions: [],
  });
  assert.deepEqual(state?.continuityDecisions, [
    { id: "priority:Backfilled queue priority" },
    { id: "decision:action-legacy" },
  ]);
});

test("decisionos update application state returns null for missing details", () => {
  assert.equal(
    decisionOsUpdateApplicationState({
      detail: null,
      selectedId: null,
      buildActionDecision: (item) => ({ id: `decision:${item.id}` }),
      buildPriorityDecision: (card) => ({ id: `priority:${card.title}` }),
      planContinuitySelection: decisionOsSelectionAfterContinuityUpdate,
    }),
    null,
  );
});

test("decisionos update application state returns null for malformed detail payloads", () => {
  assert.equal(
    decisionOsUpdateApplicationState({
      detail: "invalid-detail",
      selectedId: null,
      buildActionDecision: (item) => ({ id: `decision:${item.id}` }),
      buildPriorityDecision: (card) => ({ id: `priority:${card.title}` }),
      planContinuitySelection: decisionOsSelectionAfterContinuityUpdate,
    }),
    null,
  );
});
