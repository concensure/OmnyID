import assert from "node:assert/strict";
import test from "node:test";

import { buildContactOutreachHealthState } from "../src/lib/contactOutreachHealthState.ts";
import {
  buildContactOutreachHealthProjectionState,
  contactOutreachHealthProjectionId,
  hasSentContactOutreachHealthProjection,
  markContactOutreachHealthProjectionSent,
  runContactOutreachHealthDispatch,
} from "../src/lib/contactOutreachHealthProjectionState.ts";
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
    ...input,
  };
}

const dueContacts = [
  contact({
    id: "venue",
    name: "Harbour Venue",
    lastContactedAt: "2026-09-14T00:00:00.000Z",
    responseSlaHours: 6,
  }),
];

test("buildContactOutreachHealthProjectionState creates internal AFP health snapshots", () => {
  const health = buildContactOutreachHealthState({
    now: "2026-09-15T00:00:00.000Z",
    contacts: dueContacts,
  });
  const state = buildContactOutreachHealthProjectionState({
    health,
    nowIso: "2026-09-15T01:00:00.000Z",
  });

  assert.equal(state.snapshotCount, 1);
  const message = state.messages[0];
  assert.equal(message?.type, "note");
  assert.equal(message?.kind, "note");
  assert.equal(message?.subtype, "contact_outreach_health_snapshot");
  assert.deepEqual(message?.to, ["agent://contacts", "agent://search", "agent://knowledge-graph", "agent://decision-os"]);
  assert.equal(message?.store_in_relational, true);

  const content = message?.content as Record<string, unknown>;
  assert.equal(content.kind, "contact_outreach_health_snapshot");
  assert.equal(content.status, "task_ready");
  assert.equal(content.no_external_send, true);
  assert.ok(Array.isArray(content.metric_labels));

  const metadata = message?.metadata ?? {};
  assert.equal(metadata.projection, "contact_outreach_health_to_evidence_note");
  assert.equal(metadata.no_external_send, true);
  assert.equal(metadata.outreach_health_status, "task_ready");
});

test("buildContactOutreachHealthProjectionState blocks snapshots until contacts exist", () => {
  const state = buildContactOutreachHealthProjectionState({ contacts: [] });

  assert.equal(state.snapshotCount, 0);
  assert.equal(state.messages.length, 0);
  assert.match(state.summaryLabel, /contacts exist/i);
});

test("buildContactOutreachHealthProjectionState suppresses saved snapshots", () => {
  const storage = memoryStorage();
  const health = buildContactOutreachHealthState({
    now: "2026-09-15T00:00:00.000Z",
    contacts: dueContacts,
  });
  const projectionId = contactOutreachHealthProjectionId(health);
  markContactOutreachHealthProjectionSent(projectionId, storage, "user-1");

  const state = buildContactOutreachHealthProjectionState({
    health,
    storage,
    userId: "user-1",
  });

  assert.equal(hasSentContactOutreachHealthProjection(projectionId, storage, "user-1"), true);
  assert.equal(state.snapshotCount, 0);
  assert.equal(state.sentSnapshotCount, 1);
  assert.match(state.summaryLabel, /already saved/i);
});

test("runContactOutreachHealthDispatch saves snapshots and marks projection IDs", async () => {
  const storage = memoryStorage();
  const projection = buildContactOutreachHealthProjectionState({
    contacts: dueContacts,
    storage,
    userId: "user-1",
  });
  const calls: SendAfpMessageInput[] = [];

  const receipt = await runContactOutreachHealthDispatch({
    projection,
    storage,
    userId: "user-1",
    save: async (input) => {
      calls.push(input);
      return { success: true, message_id: "health-1" };
    },
  });

  assert.equal(receipt.savedCount, 1);
  assert.equal(receipt.failedCount, 0);
  assert.equal(calls.length, 1);
  assert.equal(buildContactOutreachHealthProjectionState({
    contacts: dueContacts,
    storage,
    userId: "user-1",
  }).snapshotCount, 0);
});
