import test from "node:test";
import assert from "node:assert/strict";

import {
  clearDecisionPendingOutcomeCheck,
  loadDecisionPendingOutcomeChecks,
  rescheduleDecisionPendingOutcomeCheck,
  scheduleDecisionPendingOutcomeCheck,
  withoutDecisionPendingOutcomeCheck,
} from "../src/lib/decisionOsOutcomeCheckState.js";
import { upsertPendingOutcomeCheck } from "../src/lib/decisionOsHomeState.ts";

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorage,
    configurable: true,
    writable: true,
  });

  return localStorage;
}

test("outcome check state loads pending checks for visible decisions", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();

  upsertPendingOutcomeCheck({
    id: "decision-1",
    title: "Approve budget",
    checkAt: "2026-06-30T00:00:00.000Z",
  });
  upsertPendingOutcomeCheck({
    id: "decision-2",
    title: "Ship feature",
    checkAt: "2026-06-29T00:00:00.000Z",
  });

  const loaded = loadDecisionPendingOutcomeChecks([
    { id: "decision-2" },
    { id: "decision-3" },
    { id: "decision-1" },
  ]);

  assert.deepEqual(loaded.map((entry) => entry.id), ["decision-2", "decision-1"]);
});

test("outcome check state schedules and dispatches a check", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  let dispatchedId: string | null = null;

  const next = scheduleDecisionPendingOutcomeCheck(
    {
      id: "decision-4",
      title: "Review hiring plan",
      checkAt: "2026-07-01T00:00:00.000Z",
    },
    (entry) => {
      dispatchedId = entry.id;
    },
  );

  assert.equal(dispatchedId, "decision-4");
  assert.deepEqual(next.map((entry) => entry.id), ["decision-4"]);
});

test("outcome check state reschedules and clears persisted checks", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();

  upsertPendingOutcomeCheck({
    id: "decision-5",
    title: "Reply to board",
    checkAt: "2026-07-02T00:00:00.000Z",
  });

  const rescheduled = rescheduleDecisionPendingOutcomeCheck(
    "decision-5",
    "2026-07-03T00:00:00.000Z",
  );
  assert.equal(rescheduled[0]?.checkAt, "2026-07-03T00:00:00.000Z");

  const cleared = clearDecisionPendingOutcomeCheck("decision-5");
  assert.deepEqual(cleared, []);
});

test("outcome check state removes an entry from in-memory list without touching storage", () => {
  const entries = [
    { id: "decision-1", title: "One", checkAt: "2026-06-30T00:00:00.000Z" },
    { id: "decision-2", title: "Two", checkAt: "2026-07-01T00:00:00.000Z" },
  ];

  assert.deepEqual(
    withoutDecisionPendingOutcomeCheck(entries, "decision-1").map((entry) => entry.id),
    ["decision-2"],
  );
});
