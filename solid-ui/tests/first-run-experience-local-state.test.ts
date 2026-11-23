import test from "node:test";
import assert from "node:assert/strict";

import {
  FIRST_RUN_EXPERIENCE_DONE_KEY,
  loadFirstRunExperienceDone,
  saveFirstRunExperienceDone,
} from "../src/lib/firstRunExperienceLocalState.ts";

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

test("first run experience local state defaults to not done for malformed stored values", () => {
  localStorageState.set(FIRST_RUN_EXPERIENCE_DONE_KEY, "1");
  assert.equal(loadFirstRunExperienceDone(), false);
  assert.equal(localStorageState.get(FIRST_RUN_EXPERIENCE_DONE_KEY), "false");
});

test("first run experience local state persists the explicit done flag", () => {
  saveFirstRunExperienceDone();
  assert.equal(localStorageState.get(FIRST_RUN_EXPERIENCE_DONE_KEY), "true");
  assert.equal(loadFirstRunExperienceDone(), true);
});
