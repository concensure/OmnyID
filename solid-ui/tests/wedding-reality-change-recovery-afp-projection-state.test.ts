import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSentWeddingRecoveryAfpProjection,
  loadWeddingRecoveryAfpProjectionIds,
  markWeddingRecoveryAfpProjectionSent,
  weddingRealityChangeRecoveryFromAfpMessage,
  weddingRealityChangeRecoveryToAfpMessage,
  weddingRealityChangeRecoveryToAfpSendInput,
} from "../src/lib/weddingRealityChangeRecoveryAfpProjectionState.ts";
import { buildWeddingRealityChangeRecoveryState } from "../src/lib/weddingRealityChangeRecoveryState.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

function recoveryState() {
  return buildWeddingRealityChangeRecoveryState({
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
  });
}

test("weddingRealityChangeRecoveryToAfpMessage projects cancellation recovery as approval-gated ledger", () => {
  const message = weddingRealityChangeRecoveryToAfpMessage(recoveryState(), "2026-09-27T00:00:00.000Z");

  assert.equal(message.type, "decision");
  assert.equal(message.kind, "ledger");
  assert.equal(message.subtype, "wedding_recovery_plan");
  assert.equal(message.thread_id, "wedding_recovery:response_workspace:harbour");
  assert.deepEqual(message.to, ["agent://wedding-planning", "agent://decision-queue", "agent://knowledge-graph", "agent://search"]);
  assert.ok(message.supertags.includes("couple_approval_required"));
  assert.ok(message.supertags.includes("disruption:vendor_cancelled"));
  assert.equal(message.content.kind, "wedding_recovery_plan");
  assert.equal(message.content.semantic_object.kind, "wedding_active_loop");
  assert.equal(message.metadata?.semantic_kind, "wedding_active_loop");
  assert.ok((message.metadata?.semantic_tags as string[]).includes("wedding_approval_required"));
  assert.deepEqual(
    message.content.semantic_object.comparison.columns.map((column: Record<string, unknown>) => column.kind),
    ["option", "price", "style_match", "availability", "action"],
  );
  assert.equal(message.views.find((view) => view.format === "a2ui")?.content.semantic_object.kind, "wedding_active_loop");
  assert.match(message.content.markdown as string, /Wedding recovery plan/i);
  assert.ok(message.references.some((ref) => ref.type === "replacement_candidate"));
  assert.equal(message.metadata?.requires_user_approval, true);
  assert.ok((message.metadata?.searchable_terms as string[]).includes("Aurora Documentary Weddings"));
  assert.ok(message.views.some((view) => view.format === "a2ui"));
});

test("weddingRealityChangeRecoveryToAfpSendInput is relational and dispatch-ready", () => {
  const input = weddingRealityChangeRecoveryToAfpSendInput(recoveryState(), "2026-09-27T00:00:00.000Z");

  assert.equal(input.type, "decision");
  assert.equal(input.kind, "ledger");
  assert.equal(input.subtype, "wedding_recovery_plan");
  assert.equal(input.store_in_relational, true);
  assert.ok(input.supertags?.includes("wedding_recovery"));
  assert.equal((input.content as Record<string, unknown>).kind, "wedding_recovery_plan");
});

test("weddingRealityChangeRecoveryFromAfpMessage reloads saved recovery plan state", () => {
  const message = weddingRealityChangeRecoveryToAfpMessage(recoveryState(), "2026-09-27T00:00:00.000Z");
  const reloaded = weddingRealityChangeRecoveryFromAfpMessage(message);

  assert.ok(reloaded);
  assert.equal(reloaded.subtype, "vendor_cancelled");
  assert.equal(reloaded.metadata.responseWorkspaceId, "response_workspace:harbour");
  assert.equal(reloaded.disruptionObject.kind, "wedding_disruption_event");
  assert.equal(reloaded.recoveryPlanObject.kind, "wedding_recovery_plan");
  assert.equal(reloaded.contractEntitlement.depositAmount, 1200);
  assert.ok(reloaded.recoverySteps.some((step) => step.id === "search-replacements"));
  assert.equal(reloaded.shortlist[0]?.label, "Aurora Documentary Weddings");
  assert.equal(reloaded.a2ui.kind, "wedding_recovery_plan");
});

test("weddingRealityChangeRecoveryFromAfpMessage ignores unrelated or malformed messages", () => {
  const message = weddingRealityChangeRecoveryToAfpMessage(recoveryState(), "2026-09-27T00:00:00.000Z");

  assert.equal(weddingRealityChangeRecoveryFromAfpMessage({ ...message, subtype: "wedding_decision_selection" }), null);
  assert.equal(weddingRealityChangeRecoveryFromAfpMessage({
    ...message,
    content: { ...message.content, recovery_plan: null },
  }), null);
});

test("wedding recovery sent markers are isolated", () => {
  const storage = memoryStorage();

  markWeddingRecoveryAfpProjectionSent("recovery-1", storage);
  markWeddingRecoveryAfpProjectionSent("recovery-1", storage);
  markWeddingRecoveryAfpProjectionSent("recovery-2", storage);

  assert.deepEqual(loadWeddingRecoveryAfpProjectionIds(storage), ["recovery-2", "recovery-1"]);
  assert.equal(hasSentWeddingRecoveryAfpProjection("recovery-1", storage), true);
  assert.equal(hasSentWeddingRecoveryAfpProjection("missing", storage), false);
});
