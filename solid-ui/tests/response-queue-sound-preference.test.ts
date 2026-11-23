import test from "node:test";
import assert from "node:assert/strict";

import {
  loadResponseQueueSoundEnabled,
  saveResponseQueueSoundEnabled,
} from "../src/lib/responseQueueSoundPreference.ts";

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

test("response queue sound preference defaults to disabled for malformed stored values", () => {
  localStorageState.set("omnyid.rq.sound", "yes");
  assert.equal(loadResponseQueueSoundEnabled(), false);
  assert.equal(localStorageState.get("omnyid.rq.sound"), "0");
});

test("response queue sound preference persists explicit opt-in flags", () => {
  saveResponseQueueSoundEnabled(true);
  assert.equal(localStorageState.get("omnyid.rq.sound"), "1");
  assert.equal(loadResponseQueueSoundEnabled(), true);

  saveResponseQueueSoundEnabled(false);
  assert.equal(localStorageState.get("omnyid.rq.sound"), "0");
  assert.equal(loadResponseQueueSoundEnabled(), false);
});
