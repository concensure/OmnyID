import test from "node:test";
import assert from "node:assert/strict";

import {
  completeWelcomeOnboarding,
  JUST_REGISTERED_KEY,
  loadOnboardingDone,
  ONBOARDING_DONE_KEY,
  saveOnboardingDone,
} from "../src/lib/onboardingLocalState.ts";

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

test("onboarding local state defaults to not done for malformed stored values", () => {
  localStorageState.set(ONBOARDING_DONE_KEY, "1");
  assert.equal(loadOnboardingDone(), false);
  assert.equal(localStorageState.get(ONBOARDING_DONE_KEY), "false");
});

test("onboarding local state persists the explicit done flag", () => {
  saveOnboardingDone();
  assert.equal(localStorageState.get(ONBOARDING_DONE_KEY), "true");
  assert.equal(loadOnboardingDone(), true);
});

test("welcome onboarding completion clears the just-registered marker and marks onboarding done", () => {
  localStorageState.set(JUST_REGISTERED_KEY, "true");

  completeWelcomeOnboarding();

  assert.equal(localStorageState.has(JUST_REGISTERED_KEY), false);
  assert.equal(localStorageState.get(ONBOARDING_DONE_KEY), "true");
  assert.equal(loadOnboardingDone(), true);
});

test("completed onboarding never leaks from a deleted account to a recreated account", () => {
  localStorageState.clear();
  saveOnboardingDone("user-old");

  assert.equal(loadOnboardingDone("user-old"), true);
  assert.equal(loadOnboardingDone("user-new"), false);
  assert.equal(loadOnboardingDone(), false);
});
