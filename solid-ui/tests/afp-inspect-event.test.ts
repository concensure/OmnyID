import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchAfpInspectEvent,
  readAfpInspectEventDetail,
  subscribeAfpInspectEvent,
} from "../src/lib/afpInspectEvent.ts";

test("readAfpInspectEventDetail returns custom-event detail and rejects plain events", () => {
  assert.deepEqual(
    readAfpInspectEventDetail(new CustomEvent("x", { detail: { type: "decision", thread_id: "thread-1" } })),
    { type: "decision", thread_id: "thread-1" },
  );
  assert.equal(
    readAfpInspectEventDetail(new CustomEvent("x", { detail: null })),
    null,
  );
  assert.equal(
    readAfpInspectEventDetail(new Event("x")),
    null,
  );
});

test("subscribeAfpInspectEvent relays non-null detail and unsubscribes cleanly", () => {
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

  const seen: unknown[] = [];
  const unsubscribe = subscribeAfpInspectEvent((detail) => {
    seen.push(detail);
  }, target);

  dispatchAfpInspectEvent({ type: "decision", thread_id: "thread-1" }, target);
  target.dispatchEvent(new CustomEvent("afp:inspect", { detail: null }));

  assert.deepEqual(seen, [{ type: "decision", thread_id: "thread-1" }]);

  unsubscribe();
  dispatchAfpInspectEvent({ type: "after-unsubscribe" }, target);
  assert.deepEqual(seen, [{ type: "decision", thread_id: "thread-1" }]);
});
