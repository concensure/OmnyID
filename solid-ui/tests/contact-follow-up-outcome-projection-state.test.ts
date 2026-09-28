import assert from "node:assert/strict";
import test from "node:test";

import type { SendAfpMessageInput } from "../src/lib/api.ts";
import {
  buildContactFollowUpOutcomeProjectionState,
  contactFollowUpOutcomeProjectionId,
  hasSentContactFollowUpOutcomeProjection,
  markContactFollowUpOutcomeProjectionSent,
  runContactFollowUpOutcomeDispatch,
} from "../src/lib/contactFollowUpOutcomeProjectionState.ts";
import type { Contact } from "../src/lib/contactsLocalState.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

function contact(input: Partial<Contact> & Pick<Contact, "id" | "name">): Contact {
  return {
    relationshipKind: "supplier",
    lastContactedAt: "2026-09-01T00:00:00.000Z",
    lastContactedBy: "agent",
    followUpOutcome: "unresponsive",
    followUpOutcomeAt: "2026-09-11T00:00:00.000Z",
    followUpOutcomeNote: "No reply after the escalation window; review alternatives.",
    ...input,
  };
}

test("buildContactFollowUpOutcomeProjectionState creates durable AFP outcome notes", () => {
  const state = buildContactFollowUpOutcomeProjectionState({
    nowIso: "2026-09-15T03:00:00.000Z",
    contacts: [contact({ id: "venue-1", name: "Harbour Venue", email: "events@example.test" })],
  });

  assert.equal(state.outcomeCount, 1);
  const message = state.outcomeMessages[0];
  assert.equal(message?.type, "note");
  assert.equal(message?.kind, "note");
  assert.equal(message?.subtype, "contact_follow_up_outcome_evidence");
  assert.deepEqual(message?.to, ["agent://contacts", "agent://search", "agent://knowledge-graph", "agent://decision-os"]);
  assert.equal(message?.store_in_relational, true);

  const content = message?.content as Record<string, unknown>;
  assert.equal(content.kind, "contact_follow_up_outcome_evidence");
  assert.equal(content.contact_id, "venue-1");
  assert.equal(content.follow_up_outcome, "unresponsive");
  assert.equal(content.follow_up_status, "closed_without_response");
  assert.match(String(content.privacy_note), /no external send/i);

  const metadata = message?.metadata ?? {};
  assert.equal(metadata.projection, "contact_follow_up_outcome_to_evidence_note");
  assert.equal(metadata.closes_second_order_loop, "contact_follow_up");
  assert.equal(metadata.no_external_send, true);
  assert.ok(Array.isArray(metadata.searchable_terms));
});

test("buildContactFollowUpOutcomeProjectionState suppresses locally saved outcome evidence", () => {
  const storage = memoryStorage();
  const row = contact({ id: "venue-1", name: "Harbour Venue" });
  const projectionId = contactFollowUpOutcomeProjectionId(row);
  markContactFollowUpOutcomeProjectionSent(projectionId, storage, "user-1");

  const state = buildContactFollowUpOutcomeProjectionState({
    storage,
    userId: "user-1",
    contacts: [row],
  });

  assert.equal(hasSentContactFollowUpOutcomeProjection(projectionId, storage, "user-1"), true);
  assert.equal(state.outcomeCount, 0);
  assert.equal(state.sentOutcomeCount, 1);
  assert.match(state.summaryLabel, /already saved/i);
});

test("runContactFollowUpOutcomeDispatch saves outcome evidence and marks projection IDs", async () => {
  const storage = memoryStorage();
  const calls: SendAfpMessageInput[] = [];
  const row = contact({ id: "venue-1", name: "Harbour Venue" });
  const projection = buildContactFollowUpOutcomeProjectionState({
    storage,
    userId: "user-1",
    contacts: [row],
  });

  const result = await runContactFollowUpOutcomeDispatch({
    projection,
    storage,
    userId: "user-1",
    save: async (input) => {
      calls.push(input);
      return { success: true, message_id: "follow-up-outcome-1" };
    },
  });

  assert.equal(result.savedCount, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(calls.length, 1);
  assert.equal(buildContactFollowUpOutcomeProjectionState({
    storage,
    userId: "user-1",
    contacts: [row],
  }).outcomeCount, 0);
});
