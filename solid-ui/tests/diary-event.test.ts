import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchDiaryEntryEvent,
  readDiaryEntryEventDetail,
  subscribeDiaryEntryEvent,
} from "../src/lib/diaryEvent.ts";

test("readDiaryEntryEventDetail returns only valid diary entry payloads", () => {
  assert.deepEqual(
    readDiaryEntryEventDetail(new CustomEvent("x", {
      detail: {
        ts: "2026-07-18T10:00:00.000Z",
        type: "decision",
        icon: "x",
        title: "Approve budget",
        meta: "approved",
        decisionId: "decision-1",
      },
    })),
    {
      ts: "2026-07-18T10:00:00.000Z",
      type: "decision",
      icon: "x",
      title: "Approve budget",
      meta: "approved",
      decisionId: "decision-1",
    },
  );
  assert.equal(
    readDiaryEntryEventDetail(new CustomEvent("x", {
      detail: {
        ts: "2026-07-18T10:00:00.000Z",
        type: "unknown",
        icon: "x",
        title: "Approve budget",
      },
    })),
    null,
  );
  assert.equal(
    readDiaryEntryEventDetail(new CustomEvent("x", {
      detail: {
        ts: "2026-07-18T10:00:00.000Z",
        type: "decision",
        icon: "x",
        title: 42,
      },
    })),
    null,
  );
  assert.equal(
    readDiaryEntryEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readDiaryEntryEventDetail(new Event("x")),
    null,
  );
});

test("subscribeDiaryEntryEvent relays normalized detail and unsubscribes cleanly", () => {
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

  const seen: Array<Record<string, unknown>> = [];
  const unsubscribe = subscribeDiaryEntryEvent((detail) => {
    seen.push(detail);
  }, target);

  dispatchDiaryEntryEvent(
    {
      ts: "2026-07-19T10:00:00.000Z",
      type: "decision",
      icon: "x",
      title: "Approve budget",
      meta: "approved",
      decisionId: "decision-1",
    },
    target,
  );
  target.dispatchEvent(new CustomEvent("omnyid:diary-entry", { detail: { ts: "2026-07-19T11:00:00.000Z", type: "unknown", icon: "x", title: "Bad" } }));

  assert.deepEqual(seen, [
    {
      ts: "2026-07-19T10:00:00.000Z",
      type: "decision",
      icon: "x",
      title: "Approve budget",
      meta: "approved",
      decisionId: "decision-1",
    },
  ]);

  unsubscribe();
  dispatchDiaryEntryEvent(
    {
      ts: "2026-07-19T12:00:00.000Z",
      type: "decision",
      icon: "x",
      title: "After unsubscribe",
    },
    target,
  );
  assert.deepEqual(seen, [
    {
      ts: "2026-07-19T10:00:00.000Z",
      type: "decision",
      icon: "x",
      title: "Approve budget",
      meta: "approved",
      decisionId: "decision-1",
    },
  ]);
});
