import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchOpenThreadEvent,
  readOpenThreadEventDetail,
  subscribeOpenThreadEvent,
} from "../src/lib/openThreadEvent.ts";

test("readOpenThreadEventDetail accepts only valid thread and message ids", () => {
  assert.deepEqual(
    readOpenThreadEventDetail(new CustomEvent("x", {
      detail: { threadId: "thread-1", messageId: "msg-7" },
    })),
    { threadId: "thread-1", messageId: "msg-7" },
  );
  assert.deepEqual(
    readOpenThreadEventDetail(new CustomEvent("x", {
      detail: { threadId: "thread-1", messageId: null },
    })),
    { threadId: "thread-1", messageId: null },
  );
  assert.deepEqual(
    readOpenThreadEventDetail(new CustomEvent("x", {
      detail: { threadId: "thread-1" },
    })),
    { threadId: "thread-1" },
  );
  assert.equal(
    readOpenThreadEventDetail(new CustomEvent("x", {
      detail: { threadId: 7, messageId: "msg-7" },
    })),
    null,
  );
  assert.equal(
    readOpenThreadEventDetail(new CustomEvent("x", {
      detail: { threadId: "thread-1", messageId: 7 },
    })),
    null,
  );
  assert.equal(
    readOpenThreadEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readOpenThreadEventDetail(new Event("x")),
    null,
  );
});

test("subscribeOpenThreadEvent relays normalized detail and unsubscribes cleanly", () => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const target = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (typeof listener !== "function") return;
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener as (event: Event) => void);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (typeof listener !== "function") return;
      listeners.get(type)?.delete(listener as (event: Event) => void);
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  } as unknown as Window;

  const seen: Array<{ threadId: string; messageId?: string | null }> = [];
  const unsubscribe = subscribeOpenThreadEvent((detail) => {
    seen.push(detail);
  }, target);

  dispatchOpenThreadEvent({ threadId: "thread-1", messageId: "msg-7" }, target);
  target.dispatchEvent(new CustomEvent("omnyid:open-thread", { detail: { threadId: "thread-2" } }));
  target.dispatchEvent(new CustomEvent("omnyid:open-thread", { detail: { threadId: 7 } }));

  assert.deepEqual(seen, [
    { threadId: "thread-1", messageId: "msg-7" },
    { threadId: "thread-2" },
  ]);

  unsubscribe();
  dispatchOpenThreadEvent({ threadId: "thread-3" }, target);
  assert.deepEqual(seen, [
    { threadId: "thread-1", messageId: "msg-7" },
    { threadId: "thread-2" },
  ]);
});
