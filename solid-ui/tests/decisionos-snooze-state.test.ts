import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  applyDecisionSnooze,
  decisionSnoozeQuickAction,
  decisionSnoozeCountTitle,
  decisionSnoozeQuickActionTitle,
  decisionSnoozeSavedChoiceLabel,
  decisionSnoozeUsualLabel,
  decisionSnoozeUsualPrefix,
  highlightedDecisionSnoozeOptionId,
  loadDecisionOsSnoozed,
  loadSnoozeCounts,
  saveDecisionOsSnoozed,
  saveSnoozeCounts,
  undoDecisionSnooze,
} from "../src/lib/decisionOsSnoozeState.js";

const userId = "user-1";
const snoozedKey = accountScopedStorageKey("omnyid.decisionos.snoozed", userId);
const countsKey = accountScopedStorageKey("omnyid.decisionos.snooze-counts", userId);

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key) ?? null : null;
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

test("snooze state applies wake time, increments count, and updates preferred option", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();

  const next = applyDecisionSnooze({
    decisionId: "decision-1",
    optionId: "tomorrow",
    wakeAt: 12345,
    snoozed: new Map(),
    snoozeCounts: new Map(),
    now: new Date("2026-06-27T10:00:00.000Z"),
    userId,
  });

  assert.equal(next.snoozed.get("decision-1"), 12345);
  assert.equal(next.snoozeCounts.get("decision-1"), 1);
  assert.equal(next.preferredSnoozeId, "tomorrow");
  assert.equal(loadDecisionOsSnoozed(userId).get("decision-1"), 12345);
  assert.equal(loadSnoozeCounts(userId).get("decision-1"), 1);
  assert.equal(localStorage.getItem("omnyid.decisionos.snoozed"), null);
  assert.equal(localStorage.getItem("omnyid.decisionos.snooze-counts"), null);
});

test("snooze state undo removes persisted wake time", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();

  const applied = applyDecisionSnooze({
    decisionId: "decision-2",
    optionId: "after_lunch",
    wakeAt: 54321,
    snoozed: new Map(),
    snoozeCounts: new Map(),
    now: new Date("2026-06-27T11:00:00.000Z"),
    userId,
  });

  const reverted = undoDecisionSnooze("decision-2", applied.snoozed, userId);
  assert.equal(reverted.has("decision-2"), false);
  assert.equal(loadDecisionOsSnoozed(userId).has("decision-2"), false);
});

test("snooze state derives highlighted, quick-action, and usual labels from preferred option", () => {
  installLocalStorage().clear();

  const options = [
    { id: "tomorrow", label: "Tomorrow 9am" },
    { id: "after_lunch", label: "After lunch" },
  ];

  assert.equal(highlightedDecisionSnoozeOptionId(options, "after_lunch"), "after_lunch");
  assert.equal(highlightedDecisionSnoozeOptionId(options, "missing"), null);
  assert.deepEqual(decisionSnoozeQuickAction(options, "after_lunch"), {
    optionId: "after_lunch",
    label: "After lunch",
  });
  assert.deepEqual(decisionSnoozeQuickAction(options, "missing"), {
    optionId: "tomorrow",
    label: "Tomorrow 9am",
  });
  assert.equal(decisionSnoozeUsualLabel(options, "after_lunch"), "After lunch");
  assert.equal(decisionSnoozeUsualLabel(options, "missing"), null);
  assert.equal(decisionSnoozeQuickActionTitle("Tomorrow 9am"), "Snooze until Tomorrow 9am");
  assert.equal(decisionSnoozeCountTitle(2), "Snoozed 2 times - consider dismissing or delegating");
  assert.equal(decisionSnoozeUsualPrefix(), "Usual:");
  assert.equal(decisionSnoozeSavedChoiceLabel(), "Saved choice");
});

test("snooze state migrates legacy stored wake times and counts into scoped keys", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem("omnyid.decisionos.snoozed", JSON.stringify({ "decision-1": 12345 }));
  localStorage.setItem("omnyid.decisionos.snooze-counts", JSON.stringify({ "decision-1": 2 }));

  assert.deepEqual([...loadDecisionOsSnoozed(userId).entries()], [["decision-1", 12345]]);
  assert.deepEqual([...loadSnoozeCounts(userId).entries()], [["decision-1", 2]]);
  assert.equal(localStorage.getItem(snoozedKey), JSON.stringify({ "decision-1": 12345 }));
  assert.equal(localStorage.getItem(countsKey), JSON.stringify({ "decision-1": 2 }));
  assert.equal(localStorage.getItem("omnyid.decisionos.snoozed"), null);
  assert.equal(localStorage.getItem("omnyid.decisionos.snooze-counts"), null);
});

test("snooze state ignores malformed stored wake times and counts", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem(
    "omnyid.decisionos.snoozed",
    JSON.stringify({
      "decision-1": 12345,
      "decision-2": "tomorrow",
      "decision-3": 0,
    }),
  );
  localStorage.setItem(
    "omnyid.decisionos.snooze-counts",
    JSON.stringify({
      "decision-1": 2,
      "decision-2": "3",
      "decision-3": -1,
    }),
  );

  assert.deepEqual([...loadDecisionOsSnoozed(userId).entries()], [["decision-1", 12345]]);
  assert.deepEqual([...loadSnoozeCounts(userId).entries()], [["decision-1", 2]]);
  assert.equal(
    localStorage.getItem(snoozedKey),
    JSON.stringify({ "decision-1": 12345 }),
  );
  assert.equal(
    localStorage.getItem(countsKey),
    JSON.stringify({ "decision-1": 2 }),
  );
});

test("snooze state clears unparseable persisted wake times and counts", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem("omnyid.decisionos.snoozed", "{bad-json");
  localStorage.setItem("omnyid.decisionos.snooze-counts", "{bad-json");

  assert.deepEqual([...loadDecisionOsSnoozed(userId).entries()], []);
  assert.deepEqual([...loadSnoozeCounts(userId).entries()], []);
  assert.equal(localStorage.getItem("omnyid.decisionos.snoozed"), null);
  assert.equal(localStorage.getItem("omnyid.decisionos.snooze-counts"), null);
  assert.equal(localStorage.getItem(snoozedKey), null);
  assert.equal(localStorage.getItem(countsKey), null);
});

test("snooze state persists only normalized wake times and counts on save", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();

  saveDecisionOsSnoozed(
    new Map([
      ["decision-1", 12345],
      ["", 999],
      ["decision-2", 0],
      ["decision-3", Number.NaN],
    ]),
    userId,
  );
  saveSnoozeCounts(
    new Map([
      ["decision-1", 2],
      ["", 3],
      ["decision-2", -1],
      ["decision-3", Number.NaN],
    ]),
    userId,
  );

  assert.equal(
    localStorage.getItem(snoozedKey),
    JSON.stringify({
      "decision-1": 12345,
    }),
  );
  assert.equal(
    localStorage.getItem(countsKey),
    JSON.stringify({
      "decision-1": 2,
    }),
  );
});
