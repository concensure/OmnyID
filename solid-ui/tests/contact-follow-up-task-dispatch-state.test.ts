import assert from "node:assert/strict";
import test from "node:test";

import { runContactFollowUpTaskDispatch } from "../src/lib/contactFollowUpTaskDispatchState.ts";
import {
  buildContactFollowUpTaskProjectionState,
  hasSentContactFollowUpTaskProjection,
} from "../src/lib/contactFollowUpTaskProjectionState.ts";
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
    relationshipKind: "other",
    ...input,
  };
}

function dueProjection(storage: Storage) {
  return buildContactFollowUpTaskProjectionState({
    now: "2026-09-15T00:00:00.000Z",
    nowIso: "2026-09-15T01:00:00.000Z",
    storage,
    userId: "user-1",
    contacts: [
      contact({
        id: "venue-1",
        name: "Harbour Venue",
        relationshipKind: "supplier",
        lastContactedAt: "2026-09-14T00:00:00.000Z",
        responseSlaHours: 6,
      }),
    ],
  });
}

test("runContactFollowUpTaskDispatch saves internal AFP tasks and marks projections sent", async () => {
  const storage = memoryStorage();
  const calls: SendAfpMessageInput[] = [];
  const projection = dueProjection(storage);

  const result = await runContactFollowUpTaskDispatch({
    projection,
    storage,
    userId: "user-1",
    save: async (input) => {
      calls.push(input);
      return { success: true, message_id: "task-message-1" };
    },
  });

  assert.equal(result.attemptedCount, 1);
  assert.equal(result.savedCount, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(calls.length, 1);
  assert.equal(result.savedItems[0]?.messageId, "task-message-1");
  assert.equal(hasSentContactFollowUpTaskProjection(result.savedItems[0]?.projectionId ?? "", storage, "user-1"), true);
  assert.equal(dueProjection(storage).taskCount, 0);
});

test("runContactFollowUpTaskDispatch keeps failed projections retryable", async () => {
  const storage = memoryStorage();
  const projection = dueProjection(storage);

  const result = await runContactFollowUpTaskDispatch({
    projection,
    storage,
    userId: "user-1",
    save: async () => ({ success: false, error: "backend rejected task" }),
  });

  assert.equal(result.savedCount, 0);
  assert.equal(result.failedCount, 1);
  assert.equal(result.canRetry, true);
  assert.equal(hasSentContactFollowUpTaskProjection(result.failedItems[0]?.projectionId ?? "", storage, "user-1"), false);
  assert.equal(dueProjection(storage).taskCount, 1);
});
