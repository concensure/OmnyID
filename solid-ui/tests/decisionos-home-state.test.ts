import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  computeCurrentStreak,
  loadPendingOutcomeChecks,
  loadOptionChoice,
  preferredSnoozeOptionId,
  recordClearStreak,
  recordSnoozeHistory,
  saveOptionChoice,
  upsertPendingOutcomeCheck,
  updatePendingOutcomeCheck,
} from "../src/lib/decisionOsHomeState.ts";

const userId = "user-1";
const optionChoiceKey = accountScopedStorageKey("omnyid.decision-choices", userId);
const clearStreakKey = accountScopedStorageKey("omnyid.decisionos.clear-streak", userId);
const outcomeChecksKey = accountScopedStorageKey("omnyid.pending-outcome-checks", userId);
const snoozeHistoryKey = accountScopedStorageKey("omnyid.decisionos.snooze-history", userId);

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

test("decisionos home state remembers per-decision option choices", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();

  assert.equal(loadOptionChoice("decision-1", userId), null);
  saveOptionChoice("decision-1", "approve_fast", userId);
  saveOptionChoice("decision-2", "delegate", userId);

  assert.equal(loadOptionChoice("decision-1", userId), "approve_fast");
  assert.equal(loadOptionChoice("decision-2", userId), "delegate");
  assert.equal(
    localStorage.getItem(optionChoiceKey),
    JSON.stringify({ "decision-1": "approve_fast", "decision-2": "delegate" }),
  );
});

test("authenticated decision choices ignore an unowned legacy global key", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem("omnyid.decision-choices", JSON.stringify({ "decision-1": "approve_fast" }));

  assert.equal(loadOptionChoice("decision-1", userId), null);
  assert.equal(localStorage.getItem(optionChoiceKey), null);
  assert.notEqual(localStorage.getItem("omnyid.decision-choices"), null);
});

test("decisionos home state tracks consecutive clear streaks by date", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();

  recordClearStreak(new Date("2026-06-27T08:00:00Z"), userId);
  recordClearStreak(new Date("2026-06-26T08:00:00Z"), userId);
  recordClearStreak(new Date("2026-06-25T08:00:00Z"), userId);

  assert.equal(computeCurrentStreak(new Date("2026-06-27T12:00:00Z"), userId), 3);
  assert.equal(computeCurrentStreak(new Date("2026-06-28T12:00:00Z"), userId), 0);
  assert.equal(localStorage.getItem(clearStreakKey), JSON.stringify({ dates: ["2026-06-27", "2026-06-26", "2026-06-25"] }));
});

test("decisionos home state upserts and updates pending outcome checks", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();

  upsertPendingOutcomeCheck({
    id: "decision-1",
    title: "Approve budget",
    checkAt: "2026-06-30T00:00:00.000Z",
  }, userId);
  upsertPendingOutcomeCheck({
    id: "decision-2",
    title: "Ship feature",
    checkAt: "2026-06-29T00:00:00.000Z",
  }, userId);

  assert.deepEqual(
    loadPendingOutcomeChecks(userId).map((entry) => entry.id),
    ["decision-2", "decision-1"],
  );

  updatePendingOutcomeCheck("decision-1", (entry) => ({
    ...entry,
    checkAt: "2026-06-28T00:00:00.000Z",
  }), userId);

  assert.deepEqual(
    loadPendingOutcomeChecks(userId).map((entry) => entry.id),
    ["decision-1", "decision-2"],
  );
});

test("decisionos home state prefers the most common recent snooze option", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();

  recordSnoozeHistory("tomorrow", new Date("2026-06-27T09:00:00Z"), userId);
  recordSnoozeHistory("after_lunch", new Date("2026-06-27T10:00:00Z"), userId);
  recordSnoozeHistory("tomorrow", new Date("2026-06-27T11:00:00Z"), userId);

  assert.equal(preferredSnoozeOptionId(userId), "tomorrow");
});

test("decisionos home state ignores malformed stored option choices", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem(
    optionChoiceKey,
    JSON.stringify({
      "decision-1": "approve_fast",
      "decision-2": 7,
    }),
  );

  assert.equal(loadOptionChoice("decision-1", userId), "approve_fast");
  assert.equal(loadOptionChoice("decision-2", userId), null);
  assert.equal(
    localStorage.getItem(optionChoiceKey),
    JSON.stringify({ "decision-1": "approve_fast" }),
  );
  assert.equal(localStorage.getItem("omnyid.decision-choices"), null);
});

test("decisionos home state ignores malformed clear streak payloads", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem(
    clearStreakKey,
    JSON.stringify({
      dates: ["2026-06-27", 7, "2026-06-26"],
    }),
  );

  assert.equal(computeCurrentStreak(new Date("2026-06-27T12:00:00Z"), userId), 2);
  assert.equal(
    localStorage.getItem(clearStreakKey),
    JSON.stringify({ dates: ["2026-06-27", "2026-06-26"] }),
  );
});

test("decisionos home state ignores malformed pending outcome checks", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem(
    outcomeChecksKey,
    JSON.stringify([
      {
        id: "decision-2",
        title: "Ship feature",
        checkAt: "2026-06-29T00:00:00.000Z",
      },
      {
        id: "decision-1",
        title: "Approve budget",
        checkAt: 7,
      },
    ]),
  );

  assert.deepEqual(
    loadPendingOutcomeChecks(userId).map((entry) => entry.id),
    ["decision-2"],
  );
  assert.equal(
    localStorage.getItem(outcomeChecksKey),
    JSON.stringify([
      {
        id: "decision-2",
        title: "Ship feature",
        checkAt: "2026-06-29T00:00:00.000Z",
      },
    ]),
  );
});

test("decisionos home state ignores malformed snooze history payloads", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem(
    snoozeHistoryKey,
    JSON.stringify([
      { id: "tomorrow", count: 2, lastUsedAt: "2026-06-27T11:00:00Z" },
      { id: "after_lunch", count: "3", lastUsedAt: "2026-06-27T10:00:00Z" },
    ]),
  );

  assert.equal(preferredSnoozeOptionId(userId), "tomorrow");
  assert.equal(
    localStorage.getItem(snoozeHistoryKey),
    JSON.stringify([{ id: "tomorrow", count: 2, lastUsedAt: "2026-06-27T11:00:00Z" }]),
  );
});

test("decisionos home state clears unparseable persisted json buckets", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  const keys = [optionChoiceKey, clearStreakKey, outcomeChecksKey, snoozeHistoryKey];
  for (const key of keys) localStorage.setItem(key, "{bad-json");

  assert.equal(loadOptionChoice("decision-1", userId), null);
  assert.deepEqual(loadPendingOutcomeChecks(userId), []);
  assert.equal(preferredSnoozeOptionId(userId), null);
  assert.equal(computeCurrentStreak(new Date("2026-06-27T12:00:00Z"), userId), 0);
  for (const key of keys) assert.equal(localStorage.getItem(key), null);
  for (const key of [optionChoiceKey, clearStreakKey, outcomeChecksKey, snoozeHistoryKey]) {
    assert.equal(localStorage.getItem(key), null);
  }
});

test("decisionos home state persists only normalized pending outcome checks on save", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();

  upsertPendingOutcomeCheck({
    id: "decision-1",
    title: "Approve budget",
    checkAt: "2026-06-30T00:00:00.000Z",
  }, userId);
  updatePendingOutcomeCheck("decision-1", () => ({
    id: "",
    title: "Approve budget",
    checkAt: "2026-06-29T00:00:00.000Z",
  } as any), userId);

  assert.equal(
    localStorage.getItem(outcomeChecksKey),
    JSON.stringify([]),
  );
});

test("decisionos home state persists only normalized snooze history entries on save", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem(
    snoozeHistoryKey,
    JSON.stringify([
      { id: "tomorrow", count: 2, lastUsedAt: "2026-06-27T11:00:00Z" },
    ]),
  );

  recordSnoozeHistory("", new Date("2026-06-27T12:00:00Z"), userId);

  assert.equal(
    localStorage.getItem(snoozeHistoryKey),
    JSON.stringify([
      { id: "tomorrow", count: 2, lastUsedAt: "2026-06-27T11:00:00Z" },
    ]),
  );
});
