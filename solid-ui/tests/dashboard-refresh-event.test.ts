import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchDashboardRefreshEvent,
  readDashboardRefreshEventDetail,
  subscribeDashboardRefreshEvent,
} from "../src/lib/dashboardRefreshEvent.ts";

test("readDashboardRefreshEventDetail accepts only object payloads with optional string reason", () => {
  assert.deepEqual(
    readDashboardRefreshEventDetail(new CustomEvent("x")),
    {},
  );
  assert.deepEqual(
    readDashboardRefreshEventDetail(new CustomEvent("x", { detail: {} })),
    {},
  );
  assert.deepEqual(
    readDashboardRefreshEventDetail(new CustomEvent("x", { detail: { reason: "manual" } })),
    { reason: "manual" },
  );
  assert.equal(
    readDashboardRefreshEventDetail(new CustomEvent("x", { detail: { reason: 42 } })),
    null,
  );
  assert.equal(
    readDashboardRefreshEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readDashboardRefreshEventDetail(new Event("x")),
    null,
  );
});

test("subscribeDashboardRefreshEvent relays normalized detail and unsubscribes cleanly", () => {
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

  const seen: Array<{ reason?: string }> = [];
  const unsubscribe = subscribeDashboardRefreshEvent((detail) => {
    seen.push(detail);
  }, target);

  dispatchDashboardRefreshEvent({ reason: "manual" }, target);
  target.dispatchEvent(new CustomEvent("omnyid:dashboard-refresh"));
  target.dispatchEvent(new CustomEvent("omnyid:dashboard-refresh", { detail: 42 }));

  assert.deepEqual(seen, [{ reason: "manual" }, {}]);

  unsubscribe();
  dispatchDashboardRefreshEvent({ reason: "after-unsubscribe" }, target);
  assert.deepEqual(seen, [{ reason: "manual" }, {}]);
});
