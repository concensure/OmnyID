import test from "node:test";
import assert from "node:assert/strict";

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

const {
  loadWeddingEntrySource,
  loadWeddingIntakeVariantShown,
  saveWeddingEntrySource,
  saveWeddingIntakeVariantShown,
} = await import("../src/lib/weddingEntrySourceState.ts");

test("loadWeddingEntrySource defaults to null until a source is saved", () => {
  localStorageState.clear();
  assert.equal(loadWeddingEntrySource(), null);
  saveWeddingEntrySource("wedding_site");
  assert.equal(loadWeddingEntrySource(), "wedding_site");
});

test("loadWeddingEntrySource ignores a corrupted stored value", () => {
  localStorageState.clear();
  localStorageState.set("omnyid.wedding.entry-source", "not-a-real-source");
  assert.equal(loadWeddingEntrySource(), null);
});

test("intake variant lock is scoped per wedding plan and does not leak across plans", () => {
  localStorageState.clear();
  saveWeddingIntakeVariantShown("plan-a", "wedding_site");
  assert.equal(loadWeddingIntakeVariantShown("plan-a"), "wedding_site");
  assert.equal(loadWeddingIntakeVariantShown("plan-b"), null);
  saveWeddingIntakeVariantShown("plan-b", "generic");
  assert.equal(loadWeddingIntakeVariantShown("plan-a"), "wedding_site");
  assert.equal(loadWeddingIntakeVariantShown("plan-b"), "generic");
});
