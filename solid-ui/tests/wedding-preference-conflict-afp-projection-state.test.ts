import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSentWeddingPreferenceConflictAfpProjection,
  loadWeddingPreferenceConflictAfpProjectionIds,
  markWeddingPreferenceConflictAfpProjectionSent,
  weddingPreferenceConflictFromAfpMessage,
  weddingPreferenceConflictToAfpMessage,
  weddingPreferenceConflictToAfpSendInput,
} from "../src/lib/weddingPreferenceConflictAfpProjectionState.ts";
import { buildWeddingPreferenceConflictState } from "../src/lib/weddingPreferenceConflictState.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

function conflictState() {
  return buildWeddingPreferenceConflictState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    decisionArea: "wedding scale",
    preferences: [
      { personLabel: "Claire", preferenceLabel: "40 guests", underlyingValue: "meaningful interaction", strength: 0.91 },
      { personLabel: "James", preferenceLabel: "120 guests", underlyingValue: "family inclusion", strength: 0.88 },
    ],
  });
}

test("weddingPreferenceConflictToAfpMessage projects partner disagreement as a searchable ledger object", () => {
  const message = weddingPreferenceConflictToAfpMessage(conflictState(), "2026-09-27T00:00:00.000Z");

  assert.equal(message.type, "decision");
  assert.equal(message.kind, "ledger");
  assert.equal(message.subtype, "wedding_preference_conflict");
  assert.equal(message.thread_id, "wedding_preference:response_workspace:harbour");
  assert.deepEqual(message.to, ["agent://wedding-planning", "agent://decision-queue", "agent://knowledge-graph", "agent://search"]);
  assert.ok(message.supertags.includes("couple_approval_required"));
  assert.ok(message.supertags.includes("conflict_axis:guest_count"));
  assert.equal(message.content.kind, "wedding_preference_conflict");
  assert.equal(message.content.semantic_object.kind, "wedding_conflict");
  assert.equal(message.metadata?.semantic_kind, "wedding_conflict");
  assert.ok((message.metadata?.semantic_tags as string[]).includes("wedding_approval_required"));
  assert.equal(message.views.find((view) => view.format === "a2ui")?.content.semantic_object.kind, "wedding_conflict");
  assert.match(message.content.markdown as string, /Do not average numeric preferences/i);
  assert.ok(message.references.some((ref) => ref.type === "preference_signal"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("family inclusion"));
  assert.ok(message.views.some((view) => view.format === "a2ui"));
});

test("weddingPreferenceConflictToAfpSendInput is relational and dispatch-ready", () => {
  const input = weddingPreferenceConflictToAfpSendInput(conflictState(), "2026-09-27T00:00:00.000Z");

  assert.equal(input.type, "decision");
  assert.equal(input.kind, "ledger");
  assert.equal(input.subtype, "wedding_preference_conflict");
  assert.equal(input.store_in_relational, true);
  assert.ok(input.supertags?.includes("wedding_conflict"));
  assert.equal((input.content as Record<string, unknown>).kind, "wedding_preference_conflict");
});

test("weddingPreferenceConflictFromAfpMessage reloads saved conflict ledger state", () => {
  const original = conflictState();
  const message = weddingPreferenceConflictToAfpMessage(original, "2026-09-27T00:00:00.000Z");
  const reloaded = weddingPreferenceConflictFromAfpMessage(message);

  assert.ok(reloaded);
  assert.equal(reloaded.status, "conflict");
  assert.equal(reloaded.conflictAxis, "guest_count");
  assert.equal(reloaded.metadata.responseWorkspaceId, "response_workspace:harbour");
  assert.equal(reloaded.preferenceSignals.length, 2);
  assert.equal(reloaded.preferenceSignals[0]?.personLabel, "Claire");
  assert.equal(reloaded.conflictObject?.requiresCoupleApproval, true);
  assert.ok(reloaded.compromiseOptions[0]?.satisfiesValues.includes("family inclusion"));
  assert.equal(reloaded.a2ui.kind, "wedding_preference_conflict");
});

test("weddingPreferenceConflictFromAfpMessage ignores unrelated messages", () => {
  const message = weddingPreferenceConflictToAfpMessage(conflictState(), "2026-09-27T00:00:00.000Z");

  assert.equal(weddingPreferenceConflictFromAfpMessage({ ...message, subtype: "wedding_decision_selection" }), null);
  assert.equal(weddingPreferenceConflictFromAfpMessage({
    ...message,
    content: { ...message.content, response_workspace_id: "" },
    metadata: { ...message.metadata, response_workspace_id: "" },
  }), null);
});

test("wedding preference conflict sent markers are isolated", () => {
  const storage = memoryStorage();

  markWeddingPreferenceConflictAfpProjectionSent("conflict-1", storage);
  markWeddingPreferenceConflictAfpProjectionSent("conflict-1", storage);
  markWeddingPreferenceConflictAfpProjectionSent("conflict-2", storage);

  assert.deepEqual(loadWeddingPreferenceConflictAfpProjectionIds(storage), ["conflict-2", "conflict-1"]);
  assert.equal(hasSentWeddingPreferenceConflictAfpProjection("conflict-1", storage), true);
  assert.equal(hasSentWeddingPreferenceConflictAfpProjection("missing", storage), false);
});
