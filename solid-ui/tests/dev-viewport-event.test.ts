import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchDevViewportEvent,
  readDevViewportEventDetail,
  subscribeDevViewportEvent,
} from "../src/lib/devViewportEvent.ts";

test("readDevViewportEventDetail returns only numeric width payloads", () => {
  assert.deepEqual(
    readDevViewportEventDetail(new CustomEvent("x", { detail: { width: 480 } })),
    { width: 480 },
  );
  assert.equal(
    readDevViewportEventDetail(new CustomEvent("x", { detail: { width: "480" } })),
    null,
  );
  assert.equal(
    readDevViewportEventDetail(new CustomEvent("x", { detail: 480 })),
    null,
  );
  assert.equal(
    readDevViewportEventDetail(new Event("x")),
    null,
  );
});

test("subscribeDevViewportEvent relays normalized detail and unsubscribes cleanly", () => {
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

  const seen: number[] = [];
  const unsubscribe = subscribeDevViewportEvent((detail) => {
    seen.push(detail.width);
  }, target);

  dispatchDevViewportEvent({ width: 480 }, target);
  target.dispatchEvent(new CustomEvent("omnyid:dev:setViewport", { detail: { width: "480" } }));

  assert.deepEqual(seen, [480]);

  unsubscribe();
  dispatchDevViewportEvent({ width: 320 }, target);
  assert.deepEqual(seen, [480]);
});
