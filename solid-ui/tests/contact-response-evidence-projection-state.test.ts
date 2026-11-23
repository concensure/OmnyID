import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContactResponseEvidenceProjectionState,
  contactResponseEvidenceProjectionId,
  hasSentContactResponseEvidenceProjection,
  markContactResponseEvidenceProjectionSent,
  runContactResponseEvidenceDispatch,
} from "../src/lib/contactResponseEvidenceProjectionState.ts";
import type { Contact } from "../src/lib/contactsLocalState.ts";
import type { SendAfpMessageInput } from "../src/lib/api.ts";

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
    responseSummaryEnabled: true,
    lastResponseAt: "2026-09-15T02:30:00.000Z",
    lastResponseSource: "user",
    lastResponseSummary: "Confirmed availability and asked for package details.",
    ...input,
  };
}

test("buildContactResponseEvidenceProjectionState creates durable AFP evidence notes", () => {
  const state = buildContactResponseEvidenceProjectionState({
    nowIso: "2026-09-15T03:00:00.000Z",
    contacts: [contact({ id: "venue-1", name: "Harbour Venue", email: "events@example.test" })],
  });

  assert.equal(state.evidenceCount, 1);
  const message = state.evidenceMessages[0];
  assert.equal(message?.type, "note");
  assert.equal(message?.kind, "note");
  assert.equal(message?.subtype, "contact_response_evidence");
  assert.deepEqual(message?.to, ["agent://contacts", "agent://search", "agent://knowledge-graph", "agent://decision-os"]);
  assert.equal(message?.store_in_relational, true);

  const content = message?.content as Record<string, unknown>;
  assert.equal(content.kind, "contact_response_evidence");
  assert.equal(content.contact_id, "venue-1");
  assert.equal(content.response_at, "2026-09-15T02:30:00.000Z");
  assert.equal(content.follow_up_status, "closed_by_response_evidence");
  assert.match(String(content.privacy_note), /no inbox scraping/i);

  const metadata = message?.metadata ?? {};
  assert.equal(metadata.projection, "contact_response_summary_to_evidence_note");
  assert.equal(metadata.closes_second_order_loop, "contact_follow_up");
  assert.equal(metadata.no_inbox_scraping, true);
  assert.ok(Array.isArray(metadata.searchable_terms));
});

test("buildContactResponseEvidenceProjectionState suppresses locally saved response evidence", () => {
  const storage = memoryStorage();
  const row = contact({ id: "venue-1", name: "Harbour Venue" });
  const projectionId = contactResponseEvidenceProjectionId(row);
  markContactResponseEvidenceProjectionSent(projectionId, storage, "user-1");

  const state = buildContactResponseEvidenceProjectionState({
    storage,
    userId: "user-1",
    contacts: [row],
  });

  assert.equal(hasSentContactResponseEvidenceProjection(projectionId, storage, "user-1"), true);
  assert.equal(state.evidenceCount, 0);
  assert.equal(state.sentEvidenceCount, 1);
  assert.match(state.summaryLabel, /already saved/i);
});

test("runContactResponseEvidenceDispatch saves evidence and marks projection IDs", async () => {
  const storage = memoryStorage();
  const calls: SendAfpMessageInput[] = [];
  const projection = buildContactResponseEvidenceProjectionState({
    storage,
    userId: "user-1",
    contacts: [contact({ id: "venue-1", name: "Harbour Venue" })],
  });

  const result = await runContactResponseEvidenceDispatch({
    projection,
    storage,
    userId: "user-1",
    save: async (input) => {
      calls.push(input);
      return { success: true, message_id: "response-evidence-1" };
    },
  });

  assert.equal(result.savedCount, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(calls.length, 1);
  assert.equal(buildContactResponseEvidenceProjectionState({
    storage,
    userId: "user-1",
    contacts: [contact({ id: "venue-1", name: "Harbour Venue" })],
  }).evidenceCount, 0);
});
