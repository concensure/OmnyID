import test from "node:test";
import assert from "node:assert/strict";

import {
  loadDecisionQueueDensity,
  loadResponseQueueDensity,
  saveDecisionQueueDensity,
  saveResponseQueueDensity,
} from "../src/lib/queueDensityLocalState.ts";

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

test("queue density local state falls back to comfortable for malformed stored values", () => {
  localStorageState.set("omnyid.decision-queue.density", "wide");
  localStorageState.set("omnyid.response-queue.density", "dense");

  assert.equal(loadDecisionQueueDensity(), "comfortable");
  assert.equal(loadResponseQueueDensity(), "comfortable");
  assert.equal(localStorageState.get("omnyid.decision-queue.density"), "comfortable");
  assert.equal(localStorageState.get("omnyid.response-queue.density"), "comfortable");
});

test("queue density local state persists only supported density values", () => {
  saveDecisionQueueDensity("compact");
  saveResponseQueueDensity("comfortable");

  assert.equal(localStorageState.get("omnyid.decision-queue.density"), "compact");
  assert.equal(localStorageState.get("omnyid.response-queue.density"), "comfortable");
});
