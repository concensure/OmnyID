import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchOpenThreadSearchEvent,
  readOpenThreadSearchEventDetail,
  subscribeOpenThreadSearchEvent,
} from "../src/lib/threadSearchNavigation.ts";

test("readOpenThreadSearchEventDetail accepts only valid query and launch context payloads", () => {
  assert.deepEqual(
    readOpenThreadSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget threads",
        launchContext: {
          sourceLabel: "Decision queue",
          reason: "Need prior discussion",
        },
      },
    })),
    {
      query: "find budget threads",
      launchContext: {
        sourceLabel: "Decision queue",
        reason: "Need prior discussion",
      },
    },
  );
  assert.deepEqual(
    readOpenThreadSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget threads",
        launchContext: null,
      },
    })),
    {
      query: "find budget threads",
      launchContext: null,
    },
  );
  assert.deepEqual(
    readOpenThreadSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget threads",
      },
    })),
    {
      query: "find budget threads",
    },
  );
  assert.equal(
    readOpenThreadSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: 7,
      },
    })),
    null,
  );
  assert.equal(
    readOpenThreadSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget threads",
        launchContext: {
          sourceLabel: 7,
        },
      },
    })),
    null,
  );
  assert.equal(
    readOpenThreadSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget threads",
        launchContext: ["Decision queue"],
      },
    })),
    null,
  );
  assert.equal(
    readOpenThreadSearchEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readOpenThreadSearchEventDetail(new Event("x")),
    null,
  );
});

test("subscribeOpenThreadSearchEvent relays normalized detail and unsubscribes cleanly", () => {
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

  const seen: Array<{ query: string; launchContext?: { sourceLabel?: string; reason?: string } | null }> = [];
  const unsubscribe = subscribeOpenThreadSearchEvent((detail) => {
    seen.push(detail);
  }, target);

  dispatchOpenThreadSearchEvent(
    {
      query: "find budget threads",
      launchContext: { sourceLabel: "Decision queue", reason: "Need prior discussion" },
    },
    target,
  );
  target.dispatchEvent(new CustomEvent("omnyid:open-thread-search", { detail: { query: "find roadmap threads" } }));
  target.dispatchEvent(new CustomEvent("omnyid:open-thread-search", { detail: { query: 7 } }));

  assert.deepEqual(seen, [
    {
      query: "find budget threads",
      launchContext: { sourceLabel: "Decision queue", reason: "Need prior discussion" },
    },
    { query: "find roadmap threads" },
  ]);

  unsubscribe();
  dispatchOpenThreadSearchEvent({ query: "after unsubscribe" }, target);
  assert.deepEqual(seen, [
    {
      query: "find budget threads",
      launchContext: { sourceLabel: "Decision queue", reason: "Need prior discussion" },
    },
    { query: "find roadmap threads" },
  ]);
});
