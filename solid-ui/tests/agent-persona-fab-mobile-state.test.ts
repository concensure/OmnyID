import assert from "node:assert/strict";
import test from "node:test";

import {
  loadMobilePersonaFabOptIn,
  saveMobilePersonaFabOptIn,
  shouldShowPersonaFab,
} from "../src/lib/agentPersonaFabMobileState.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

test("Sprout is quiet by default on phones and can be explicitly restored per account", () => {
  const storage = memoryStorage();

  assert.equal(shouldShowPersonaFab({ serverVisible: true, userId: "couple-a", phoneViewport: true, storage }), false);
  saveMobilePersonaFabOptIn(true, "couple-a", storage);
  assert.equal(loadMobilePersonaFabOptIn("couple-a", storage), true);
  assert.equal(shouldShowPersonaFab({ serverVisible: true, userId: "couple-a", phoneViewport: true, storage }), true);
  assert.equal(shouldShowPersonaFab({ serverVisible: true, userId: "couple-b", phoneViewport: true, storage }), false);
});

test("desktop follows the server preference and a disabled server preference stays disabled", () => {
  const storage = memoryStorage();
  saveMobilePersonaFabOptIn(true, "couple-a", storage);

  assert.equal(shouldShowPersonaFab({ serverVisible: true, userId: "couple-a", phoneViewport: false, storage }), true);
  assert.equal(shouldShowPersonaFab({ serverVisible: false, userId: "couple-a", phoneViewport: true, storage }), false);
});
