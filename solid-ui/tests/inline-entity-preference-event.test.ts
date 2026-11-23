import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchInlineEntityPreferenceChangedEvent,
  readInlineEntityPreferenceChangedEventDetail,
  subscribeInlineEntityPreferenceChangedEvent,
} from "../src/lib/inlineEntityPreferenceEvent.ts";

test("readInlineEntityPreferenceChangedEventDetail accepts only empty custom event payloads", () => {
  assert.equal(
    readInlineEntityPreferenceChangedEventDetail(new CustomEvent("x")),
    undefined,
  );
  assert.equal(
    readInlineEntityPreferenceChangedEventDetail(new CustomEvent("x", { detail: null })),
    undefined,
  );
  assert.equal(
    readInlineEntityPreferenceChangedEventDetail(new CustomEvent("x", { detail: { enabled: true } })),
    null,
  );
  assert.equal(
    readInlineEntityPreferenceChangedEventDetail(new Event("x")),
    null,
  );
});

test("subscribeInlineEntityPreferenceChangedEvent reacts only to empty custom-event payloads and unsubscribes cleanly", () => {
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

  let calls = 0;
  const unsubscribe = subscribeInlineEntityPreferenceChangedEvent(() => {
    calls += 1;
  }, target);

  dispatchInlineEntityPreferenceChangedEvent(target);
  target.dispatchEvent(new CustomEvent("omnyid:inline-entity-pref-changed", { detail: { enabled: true } }));

  assert.equal(calls, 1);

  unsubscribe();
  dispatchInlineEntityPreferenceChangedEvent(target);
  assert.equal(calls, 1);
});
