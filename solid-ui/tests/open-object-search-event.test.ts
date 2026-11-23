import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchOpenObjectSearchEvent,
  readOpenObjectSearchEventDetail,
  subscribeOpenObjectSearchEvent,
} from "../src/lib/objectSearchNavigation.ts";

test("readOpenObjectSearchEventDetail accepts only valid query, focus ids, and launch context payloads", () => {
  assert.deepEqual(
    readOpenObjectSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget objects",
        focusThreadId: "thread-1",
        focusObjectId: "object-7",
        launchContext: {
          sourceLabel: "Dashboard search",
          reason: "Need supporting artifact",
        },
      },
    })),
    {
      query: "find budget objects",
      focusThreadId: "thread-1",
      focusObjectId: "object-7",
      launchContext: {
        sourceLabel: "Dashboard search",
        reason: "Need supporting artifact",
      },
    },
  );
  assert.deepEqual(
    readOpenObjectSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget objects",
        focusThreadId: null,
        focusObjectId: null,
        launchContext: null,
      },
    })),
    {
      query: "find budget objects",
      focusThreadId: null,
      focusObjectId: null,
      launchContext: null,
    },
  );
  assert.deepEqual(
    readOpenObjectSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget objects",
      },
    })),
    {
      query: "find budget objects",
    },
  );
  assert.equal(
    readOpenObjectSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: 7,
      },
    })),
    null,
  );
  assert.equal(
    readOpenObjectSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget objects",
        focusThreadId: 7,
      },
    })),
    null,
  );
  assert.equal(
    readOpenObjectSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget objects",
        focusObjectId: 7,
      },
    })),
    null,
  );
  assert.equal(
    readOpenObjectSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget objects",
        launchContext: {
          sourceLabel: 7,
        },
      },
    })),
    null,
  );
  assert.equal(
    readOpenObjectSearchEventDetail(new CustomEvent("x", {
      detail: {
        query: "find budget objects",
        launchContext: ["Dashboard search"],
      },
    })),
    null,
  );
  assert.equal(
    readOpenObjectSearchEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readOpenObjectSearchEventDetail(new Event("x")),
    null,
  );
});

test("subscribeOpenObjectSearchEvent relays normalized detail and unsubscribes cleanly", () => {
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

  const seen: Array<{
    query: string;
    focusThreadId?: string | null;
    focusObjectId?: string | null;
    launchContext?: { sourceLabel?: string; reason?: string } | null;
  }> = [];
  const unsubscribe = subscribeOpenObjectSearchEvent((detail) => {
    seen.push(detail);
  }, target);

  dispatchOpenObjectSearchEvent(
    {
      query: "find budget objects",
      focusThreadId: "thread-1",
      focusObjectId: "object-7",
      launchContext: { sourceLabel: "Dashboard search", reason: "Need supporting artifact" },
    },
    target,
  );
  target.dispatchEvent(new CustomEvent("omnyid:open-object-search", { detail: { query: "find roadmap objects" } }));
  target.dispatchEvent(new CustomEvent("omnyid:open-object-search", { detail: { query: 7 } }));

  assert.deepEqual(seen, [
    {
      query: "find budget objects",
      focusThreadId: "thread-1",
      focusObjectId: "object-7",
      launchContext: { sourceLabel: "Dashboard search", reason: "Need supporting artifact" },
    },
    { query: "find roadmap objects" },
  ]);

  unsubscribe();
  dispatchOpenObjectSearchEvent({ query: "after unsubscribe" }, target);
  assert.deepEqual(seen, [
    {
      query: "find budget objects",
      focusThreadId: "thread-1",
      focusObjectId: "object-7",
      launchContext: { sourceLabel: "Dashboard search", reason: "Need supporting artifact" },
    },
    { query: "find roadmap objects" },
  ]);
});
