import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsQueueActionItems,
  decisionOsQueueCompanionState,
  decisionOsQueueContextPackItems,
  decisionOsQueueContextPanelItems,
  decisionOsQueuePreparedDraftItems,
  decisionOsQueuePrimaryMode,
  decisionOsQueuePriorityCard,
  decisionOsQueueResponseItems,
  decisionOsQueueBootstrapState,
  decisionOsQueueHasVisibleWork,
} from "../src/lib/decisionOsQueueBootstrapState.ts";

test("decisionos queue bootstrap state normalizes queue slices from dashboard bootstrap", () => {
  const queueState = decisionOsQueueBootstrapState({
    continuity_priority_card: { title: "Priority review" } as any,
    continuity_action_items: [{ id: "act_1" }] as any,
    continuity_context_panel_items: [{ id: "ctx_1" }] as any,
  } as any);

  assert.deepEqual(queueState.queuePriorityCard, { title: "Priority review" });
  assert.deepEqual(queueState.queueActionItems, [{ id: "act_1" }]);
  assert.deepEqual(queueState.queueContextPanelItems, [{ id: "ctx_1" }]);
});

test("decisionos queue bootstrap state falls back to empty queue slices", () => {
  const queueState = decisionOsQueueBootstrapState(null);
  const queueCompanionState = decisionOsQueueCompanionState(null);

  assert.equal(queueState.queuePriorityCard, null);
  assert.deepEqual(queueState.queueActionItems, []);
  assert.deepEqual(queueState.queueContextPanelItems, []);
  assert.equal(decisionOsQueuePriorityCard(null), null);
  assert.deepEqual(decisionOsQueueActionItems(null), []);
  assert.deepEqual(decisionOsQueueContextPanelItems(null), []);
  assert.deepEqual(decisionOsQueueResponseItems(null), []);
  assert.deepEqual(decisionOsQueuePreparedDraftItems(null), []);
  assert.deepEqual(decisionOsQueueContextPackItems(null), []);
  assert.deepEqual(queueCompanionState.responseItems, []);
  assert.deepEqual(queueCompanionState.preparedDraftItems, []);
  assert.deepEqual(queueCompanionState.contextPackItems, []);
  assert.deepEqual(queueCompanionState.proactiveSuggestions, []);
  assert.equal(decisionOsQueueHasVisibleWork(queueState), false);
});

test("decisionos queue bootstrap state normalizes queue companion slices from dashboard bootstrap", () => {
  const queueCompanionState = decisionOsQueueCompanionState({
    continuity_response_items: [{ id: "resp_1" }] as any,
    continuity_prepared_draft_items: [{ id: "draft_1" }] as any,
    continuity_context_pack_items: [{ id: "pack_1" }] as any,
    proactive_suggestions: [{ id: "pro_1" }] as any,
  } as any);

  assert.deepEqual(queueCompanionState.responseItems, [{ id: "resp_1" }]);
  assert.deepEqual(queueCompanionState.preparedDraftItems, [{ id: "draft_1" }]);
  assert.deepEqual(queueCompanionState.contextPackItems, [{ id: "pack_1" }]);
  assert.deepEqual(queueCompanionState.proactiveSuggestions, [{ id: "pro_1" }]);
  assert.deepEqual(decisionOsQueueResponseItems({
    continuity_response_items: [{ id: "resp_1" }] as any,
  } as any), [{ id: "resp_1" }]);
  assert.deepEqual(decisionOsQueuePreparedDraftItems({
    continuity_prepared_draft_items: [{ id: "draft_1" }] as any,
  } as any), [{ id: "draft_1" }]);
  assert.deepEqual(decisionOsQueueContextPackItems({
    continuity_context_pack_items: [{ id: "pack_1" }] as any,
  } as any), [{ id: "pack_1" }]);
});

test("decisionos queue bootstrap state exposes a shared visible-work predicate", () => {
  assert.equal(
    decisionOsQueueHasVisibleWork(
      decisionOsQueueBootstrapState({
        continuity_priority_card: { title: "Priority review" } as any,
      } as any),
    ),
    true,
  );
  assert.equal(
    decisionOsQueueHasVisibleWork(
      decisionOsQueueBootstrapState({
        continuity_action_items: [{ id: "act_1" }] as any,
      } as any),
    ),
    true,
  );
});

test("decisionos queue bootstrap state derives a shared primary mode with fallback semantics", () => {
  assert.equal(
    decisionOsQueuePrimaryMode(
      decisionOsQueueBootstrapState({
        continuity_priority_card: { title: "Priority review" } as any,
      } as any),
    ),
    "priority_card",
  );
  assert.equal(
    decisionOsQueuePrimaryMode(
      decisionOsQueueBootstrapState({
        continuity_action_items: [{ id: "act_1" }] as any,
      } as any),
    ),
    "action_item",
  );
  assert.equal(
    decisionOsQueuePrimaryMode(
      decisionOsQueueBootstrapState({
        continuity_priority_card: { title: "Priority review" } as any,
      } as any),
      "action_item",
    ),
    "action_item",
  );
  assert.equal(
    decisionOsQueuePrimaryMode(decisionOsQueueBootstrapState(null)),
    null,
  );
});
