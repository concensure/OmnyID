import test from "node:test";
import assert from "node:assert/strict";

import {
  hasSupertagGridStorageQuotaHit,
  loadSupertagGridStored,
  saveSupertagGridStored,
  supertagGridStorageKey,
} from "../src/lib/supertagGridLocalState.ts";

const localStorageState = new Map<string, string>();
let throwOnSet = false;

Object.assign(globalThis, {
  localStorage: {
    getItem(key: string) {
      return localStorageState.has(key) ? localStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      if (throwOnSet) throw new Error("quota");
      localStorageState.set(key, value);
    },
    removeItem(key: string) {
      localStorageState.delete(key);
    },
  },
});

test("supertag grid local state builds scoped storage keys", () => {
  assert.equal(
    supertagGridStorageKey("grid-1", "state"),
    "sgrid:grid-1:state",
  );
});

test("supertag grid local state falls back for malformed stored payloads", () => {
  localStorageState.set("sgrid:grid-1:state", "{bad json");
  assert.deepEqual(loadSupertagGridStored("sgrid:grid-1:state", { ok: true }), { ok: true });
  assert.equal(localStorageState.has("sgrid:grid-1:state"), false);
  assert.deepEqual(loadSupertagGridStored("sgrid:grid-1:missing", { ok: true }), { ok: true });
});

test("supertag grid local state persists JSON values through the helper", () => {
  const saved = saveSupertagGridStored("sgrid:grid-2:state", { density: "compact" });
  assert.equal(saved, true);
  assert.equal(
    localStorageState.get("sgrid:grid-2:state"),
    JSON.stringify({ density: "compact" }),
  );
});

test("supertag grid local state tracks quota-hit write failures", () => {
  throwOnSet = true;
  assert.equal(saveSupertagGridStored("sgrid:grid-3:state", { density: "compact" }), false);
  throwOnSet = false;
  assert.equal(hasSupertagGridStorageQuotaHit(), true);
});
