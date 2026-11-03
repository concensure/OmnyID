import test from "node:test";
import assert from "node:assert/strict";

import {
  loadDecisionQueueDensity,
  loadResponseQueueDensity,
  queueFontSizeRootPx,
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

test("queue density local state falls back to 7/10 for malformed stored values", () => {
  localStorageState.set("omnyid.decision-queue.density", "wide");
  localStorageState.set("omnyid.response-queue.density", "dense");

  assert.equal(loadDecisionQueueDensity(), "7");
  assert.equal(loadResponseQueueDensity(), "7");
  assert.equal(localStorageState.get("omnyid.decision-queue.density"), "7");
  assert.equal(localStorageState.get("omnyid.response-queue.density"), "7");
});

test("queue density local state persists only supported density levels", () => {
  saveDecisionQueueDensity("3");
  saveResponseQueueDensity("10");

  assert.equal(localStorageState.get("omnyid.decision-queue.density"), "3");
  assert.equal(localStorageState.get("omnyid.response-queue.density"), "10");
});

test("queue density local state migrates legacy density labels", () => {
  localStorageState.set("omnyid.decision-queue.density", "compact");
  localStorageState.set("omnyid.response-queue.density", "comfortable");

  assert.equal(loadDecisionQueueDensity(), "3");
  assert.equal(loadResponseQueueDensity(), "7");
  assert.equal(localStorageState.get("omnyid.decision-queue.density"), "3");
  assert.equal(localStorageState.get("omnyid.response-queue.density"), "7");
});

test("font-size levels increase the root type scale and make the default roughly 25 percent larger", () => {
  assert.equal(queueFontSizeRootPx("1"), 16);
  assert.ok(queueFontSizeRootPx("7") > 21);
  assert.equal(queueFontSizeRootPx("10"), 24);
});
