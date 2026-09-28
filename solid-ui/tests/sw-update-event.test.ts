import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchSwUpdateReadyEvent,
  readSwUpdateReadyEventDetail,
  subscribeSwUpdateReadyEvent,
} from "../src/lib/swUpdateEvent.ts";

test("readSwUpdateReadyEventDetail accepts only service-worker-like payloads", () => {
  const sw = {
    postMessage() {},
    state: "installed",
  } as unknown as ServiceWorker;

  assert.deepEqual(
    readSwUpdateReadyEventDetail(new CustomEvent("x", { detail: { sw } })),
    { sw },
  );
  assert.equal(
    readSwUpdateReadyEventDetail(new CustomEvent("x", { detail: { sw: {} } })),
    null,
  );
  assert.equal(
    readSwUpdateReadyEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readSwUpdateReadyEventDetail(new Event("x")),
    null,
  );
});

test("subscribeSwUpdateReadyEvent relays normalized detail and unsubscribes cleanly", () => {
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

  const sw = {
    postMessage() {},
    state: "installed",
  } as unknown as ServiceWorker;
  const seen: ServiceWorker[] = [];
  const unsubscribe = subscribeSwUpdateReadyEvent((detail) => {
    seen.push(detail.sw);
  }, target);

  dispatchSwUpdateReadyEvent({ sw }, target);
  target.dispatchEvent(new CustomEvent("omnyid:update-ready", { detail: { sw: {} } }));

  assert.deepEqual(seen, [sw]);

  unsubscribe();
  dispatchSwUpdateReadyEvent({ sw }, target);
  assert.deepEqual(seen, [sw]);
});
