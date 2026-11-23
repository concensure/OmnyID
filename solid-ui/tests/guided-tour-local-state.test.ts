import test from "node:test";
import assert from "node:assert/strict";

import {
  guidedTourStorageKey,
  loadShouldShowGuidedTour,
  saveGuidedTourSeen,
} from "../src/lib/guidedTourLocalState.ts";

const localStorageState = new Map<string, string>();

Object.assign(globalThis, {
  localStorage: {
    getItem(key: string) {
      return localStorageState.has(key) ? localStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStorageState.set(key, value);
    },
    removeItem(key: string) {
      localStorageState.delete(key);
    },
  },
});

test("guided tour local state defaults to showing the tour for malformed stored values", () => {
  localStorageState.set(guidedTourStorageKey("user-1"), "1");
  assert.equal(loadShouldShowGuidedTour("user-1"), true);
  assert.equal(localStorageState.get(guidedTourStorageKey("user-1")), "false");
});

test("guided tour local state persists the seen flag for scoped and default tours", () => {
  saveGuidedTourSeen("user-1");
  assert.equal(localStorageState.get(guidedTourStorageKey("user-1")), "true");
  assert.equal(loadShouldShowGuidedTour("user-1"), false);

  saveGuidedTourSeen();
  assert.equal(localStorageState.get(guidedTourStorageKey()), "true");
  assert.equal(loadShouldShowGuidedTour(), false);
});
