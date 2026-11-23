import test from "node:test";
import assert from "node:assert/strict";

import {
  loadAutomationsDryRun,
  saveAutomationsDryRun,
} from "../src/lib/automationsLocalState.ts";

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

test("automations dry-run preference defaults to disabled for malformed stored values", () => {
  localStorageState.set("omnyid.dry-run", "1");
  assert.equal(loadAutomationsDryRun(), false);
  assert.equal(localStorageState.get("omnyid.dry-run"), "false");
});

test("automations dry-run preference persists explicit true and false flags", () => {
  saveAutomationsDryRun(true);
  assert.equal(localStorageState.get("omnyid.dry-run"), "true");
  assert.equal(loadAutomationsDryRun(), true);

  saveAutomationsDryRun(false);
  assert.equal(localStorageState.get("omnyid.dry-run"), "false");
  assert.equal(loadAutomationsDryRun(), false);
});
