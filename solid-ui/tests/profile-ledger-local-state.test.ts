import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  VALUE_OVERRIDE_KEY,
  VALUE_SETTINGS_KEY,
  loadProfileLedgerValueOverride,
  loadProfileLedgerValueWeights,
  saveProfileLedgerValueOverride,
  saveProfileLedgerValueWeights,
} from "../src/lib/profileLedgerLocalState.ts";

const userId = "user-1";
const scopedWeightsKey = accountScopedStorageKey(VALUE_SETTINGS_KEY, userId);
const scopedOverrideKey = accountScopedStorageKey(VALUE_OVERRIDE_KEY, userId);
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

test.beforeEach(() => {
  localStorageState.clear();
});

test("profile ledger local state normalizes malformed stored value weights", () => {
  localStorageState.set(
    scopedWeightsKey,
    JSON.stringify({
      health: 1.5,
      family: -0.25,
      wealth: 0.6,
      social_life: "high",
    }),
  );

  assert.deepEqual(loadProfileLedgerValueWeights(userId), {
    health: 1,
    family: 0,
    wealth: 0.6,
    social_life: 0.5,
  });
  assert.equal(
    localStorageState.get(scopedWeightsKey),
    JSON.stringify({
      health: 1,
      family: 0,
      wealth: 0.6,
      social_life: 0.5,
    }),
  );
});

test("profile ledger local state clears unparseable stored value weights", () => {
  localStorageState.set(scopedWeightsKey, "{bad-json");

  assert.deepEqual(loadProfileLedgerValueWeights(userId), {
    health: 0.5,
    family: 0.5,
    wealth: 0.5,
    social_life: 0.5,
  });
  assert.equal(localStorageState.has(scopedWeightsKey), false);
});

test("profile ledger local state persists only normalized value weights and trimmed override text", () => {
  saveProfileLedgerValueWeights({
    health: 1.5,
    family: -0.25,
    wealth: 0.6,
    social_life: 0.4,
  }, userId);
  saveProfileLedgerValueOverride("  protect health during launch week  ", userId);

  assert.equal(
    localStorageState.get(scopedWeightsKey),
    JSON.stringify({
      health: 1,
      family: 0,
      wealth: 0.6,
      social_life: 0.4,
    }),
  );
  assert.equal(
    localStorageState.get(scopedOverrideKey),
    "protect health during launch week",
  );
  assert.equal(loadProfileLedgerValueOverride(userId), "protect health during launch week");

  saveProfileLedgerValueOverride("   ", userId);
  assert.equal(localStorageState.has(scopedOverrideKey), false);
});

test("profile ledger local state migrates legacy global values into scoped keys", () => {
  localStorageState.set(VALUE_SETTINGS_KEY, JSON.stringify({
    health: 0.7,
    family: 0.6,
    wealth: 0.5,
    social_life: 0.4,
  }));
  localStorageState.set(VALUE_OVERRIDE_KEY, "Protect family time");

  assert.deepEqual(loadProfileLedgerValueWeights(userId), {
    health: 0.7,
    family: 0.6,
    wealth: 0.5,
    social_life: 0.4,
  });
  assert.equal(loadProfileLedgerValueOverride(userId), "Protect family time");
  assert.equal(localStorageState.has(VALUE_SETTINGS_KEY), false);
  assert.equal(localStorageState.has(VALUE_OVERRIDE_KEY), false);
  assert.equal(localStorageState.get(scopedOverrideKey), "Protect family time");
});
