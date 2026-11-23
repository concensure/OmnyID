import test from "node:test";
import assert from "node:assert/strict";

import type { AfpMessage } from "../src/lib/api.ts";
import { messageEffectiveEditMillis, threadSortMillis } from "../src/lib/threadSort.ts";

function makeMessage(overrides: Partial<AfpMessage>): AfpMessage {
  return {
    id: "m1",
    thread_id: "t1",
    from: "user://1",
    timestamp: "2026-07-01T10:00:00.000Z",
    type: "note",
    content: {},
    views: [],
    attachments: [],
    ...overrides,
  };
}

test("messageEffectiveEditMillis prefers newer edit metadata over base timestamp", () => {
  const message = makeMessage({
    metadata: { updated_at: "2026-07-01T12:45:00.000Z" },
  });
  assert.equal(
    messageEffectiveEditMillis(message),
    Date.parse("2026-07-01T12:45:00.000Z"),
  );
});

test("threadSortMillis in activity mode follows latest message arrival", () => {
  const messages = [
    makeMessage({ id: "m1", timestamp: "2026-07-01T10:00:00.000Z" }),
    makeMessage({ id: "m2", timestamp: "2026-07-01T11:15:00.000Z" }),
  ];
  assert.equal(
    threadSortMillis(messages, "activity"),
    Date.parse("2026-07-01T11:15:00.000Z"),
  );
});

test("threadSortMillis in recently edited mode follows newest edit across the thread", () => {
  const messages = [
    makeMessage({ id: "m1", timestamp: "2026-07-01T10:00:00.000Z" }),
    makeMessage({
      id: "m2",
      timestamp: "2026-07-01T11:15:00.000Z",
      content: { edited_at: "2026-07-01T13:30:00.000Z" },
    }),
  ];
  assert.equal(
    threadSortMillis(messages, "recently_edited"),
    Date.parse("2026-07-01T13:30:00.000Z"),
  );
});

test("messageEffectiveEditMillis ignores encrypted edit timestamps until local decryption is available", () => {
  const message = makeMessage({
    timestamp: "2026-07-01T10:00:00.000Z",
    content: {
      edited_at: "2026-07-01T13:30:00.000Z",
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" } as any,
  });

  assert.equal(
    messageEffectiveEditMillis(message),
    Date.parse("2026-07-01T10:00:00.000Z"),
  );
});

test("messageEffectiveEditMillis ignores malformed content and metadata records", () => {
  const message = makeMessage({
    timestamp: "2026-07-01T10:00:00.000Z",
    content: "bad" as unknown as Record<string, unknown>,
    metadata: ["bad"] as unknown as Record<string, unknown>,
  });
  assert.equal(
    messageEffectiveEditMillis(message),
    Date.parse("2026-07-01T10:00:00.000Z"),
  );
});
