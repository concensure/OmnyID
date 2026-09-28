import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import {
  weddingPreferenceConflictToAfpMessage,
} from "../src/lib/weddingPreferenceConflictAfpProjectionState.ts";
import { buildWeddingPreferenceConflictState } from "../src/lib/weddingPreferenceConflictState.ts";
import {
  weddingRealityChangeRecoveryToAfpMessage,
} from "../src/lib/weddingRealityChangeRecoveryAfpProjectionState.ts";
import { buildWeddingRealityChangeRecoveryState } from "../src/lib/weddingRealityChangeRecoveryState.ts";
import {
  buildWeddingResilienceReviewAllAction,
  buildWeddingResilienceSidebarAction,
} from "../src/lib/weddingResilienceActionState.ts";
import { buildWeddingResilienceLedgerState } from "../src/lib/weddingResilienceLedgerState.ts";

function conflictMessage(): AfpMessage {
  return weddingPreferenceConflictToAfpMessage(buildWeddingPreferenceConflictState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    decisionArea: "wedding scale",
    preferences: [
      { personLabel: "Claire", preferenceLabel: "40 guests", underlyingValue: "meaningful interaction", strength: 0.91 },
      { personLabel: "James", preferenceLabel: "120 guests", underlyingValue: "family inclusion", strength: 0.88 },
    ],
  }), "2026-09-27T00:00:00.000Z");
}

function recoveryMessage(): AfpMessage {
  return weddingRealityChangeRecoveryToAfpMessage(buildWeddingRealityChangeRecoveryState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    disruptionText: "The photographer cancelled.",
    vendorName: "Northlight Studio",
    vendorCategory: "photographer",
    contractText: "Deposit $1200 refundable if supplier cancels.",
    originalPreferenceText: "candid documentary photography",
    budgetLimit: 5_000,
    replacementCandidates: [{
      id: "vendor:aurora",
      label: "Aurora Documentary Weddings",
      availableOnDate: true,
      priceEstimate: 4_800,
      fitLabels: ["documentary"],
      sourceLabel: "Google Places",
    }],
  }), "2026-09-27T00:02:00.000Z");
}

test("buildWeddingResilienceSidebarAction routes preference conflict review to the planner home", () => {
  const state = buildWeddingResilienceLedgerState({ messages: [conflictMessage()] });
  const action = buildWeddingResilienceSidebarAction(state.attentionItems[0] ?? null);
  const packet = action.metadata?.wedding_resilience as Record<string, unknown>;

  assert.equal(action.kind, "open_workspace_menu");
  assert.equal(action.label, "Review values");
  assert.equal(action.enabled, true);
  assert.equal(action.metadata?.wedding_workspace_menu, "home");
  assert.equal(packet.item_kind, "preference_conflict");
  assert.equal(packet.wedding_workspace_menu, "home");
  assert.ok(action.contextLabels?.includes("wedding scale: values to balance"));
});

test("buildWeddingResilienceSidebarAction routes recovery plans to the response queue", () => {
  const state = buildWeddingResilienceLedgerState({ messages: [recoveryMessage()] });
  const action = buildWeddingResilienceSidebarAction(state.attentionItems[0] ?? null);
  const packet = action.metadata?.wedding_resilience as Record<string, unknown>;

  assert.equal(action.kind, "open_workspace_menu");
  assert.equal(action.label, "Compare replacements");
  assert.equal(action.metadata?.wedding_workspace_menu, "response_queue");
  assert.equal(packet.item_kind, "recovery_plan");
  assert.equal(packet.priority, "urgent");
  assert.equal(packet.source_message_id, state.attentionItems[0]?.sourceMessageId);
});

test("buildWeddingResilienceSidebarAction can defer a resilience item without losing context", () => {
  const state = buildWeddingResilienceLedgerState({ messages: [conflictMessage()] });
  const action = buildWeddingResilienceSidebarAction(state.attentionItems[0] ?? null, "defer_item");
  const packet = action.metadata?.wedding_resilience as Record<string, unknown>;

  assert.equal(action.kind, "defer_decision");
  assert.equal(action.label, "Review Later");
  assert.equal(packet.intent, "defer_item");
  assert.equal(packet.item_kind, "preference_conflict");
});

test("buildWeddingResilienceReviewAllAction summarizes all resilience work", () => {
  const state = buildWeddingResilienceLedgerState({ messages: [conflictMessage(), recoveryMessage()] });
  const action = buildWeddingResilienceReviewAllAction(state);
  const packet = action.metadata?.wedding_resilience as Record<string, unknown>;
  const items = packet.items as Array<Record<string, unknown>>;

  assert.equal(action.kind, "open_workspace_menu");
  assert.equal(action.label, "Review Wedding Changes");
  assert.equal(action.enabled, true);
  assert.equal(action.metadata?.wedding_workspace_menu, "response_queue");
  assert.equal(packet.intent, "review_all");
  assert.equal(packet.unresolved_count, 2);
  assert.equal(packet.urgent_count, 1);
  assert.equal(items.length, 2);
  assert.ok(action.contextLabels?.some((label) => label.includes("urgent")));
});

test("buildWeddingResilienceReviewAllAction disables empty states calmly", () => {
  const state = buildWeddingResilienceLedgerState({ messages: [] });
  const action = buildWeddingResilienceReviewAllAction(state);

  assert.equal(action.kind, "open_workspace_menu");
  assert.equal(action.enabled, false);
  assert.match(action.reason ?? "", /No partner conflicts/i);
  assert.deepEqual(action.contextLabels, [state.summaryLabel]);
});
