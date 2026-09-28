import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_VALUE_WEIGHTS,
  getSelfProfile,
  initLedgerKey,
  ledgerKeyIsIdentityDerived,
  resetLedger,
  updateSelfProfile,
} from "../src/lib/profileLedger.ts";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function installStorage(name: "localStorage" | "sessionStorage"): StorageLike {
  const store = new Map<string, string>();
  const storage: StorageLike = {
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
  });
  return storage;
}

function installBrowserStorage() {
  const localStorage = installStorage("localStorage");
  const sessionStorage = installStorage("sessionStorage");
  localStorage.clear();
  sessionStorage.clear();
  return { localStorage, sessionStorage };
}

test("profile ledger self profile defaults include value weights and no override", async () => {
  installBrowserStorage();

  const profile = await getSelfProfile();

  assert.deepEqual(profile.value_weights, DEFAULT_VALUE_WEIGHTS);
  assert.equal(profile.active_value_override ?? null, null);
});

test("updateSelfProfile persists explicit value weights and visible override", async () => {
  installBrowserStorage();

  const status = await updateSelfProfile({
    value_weights: {
      health: 0.8,
      family: 0.7,
      wealth: 0.25,
      social_life: 0.4,
    },
    active_value_override: {
      summary: "Prioritize health and family during recovery.",
      updated_at: "2026-07-01T00:00:00.000Z",
    },
  });

  assert.equal(status, "ok");

  const profile = await getSelfProfile();
  assert.deepEqual(profile.value_weights, {
    health: 0.8,
    family: 0.7,
    wealth: 0.25,
    social_life: 0.4,
  });
  assert.deepEqual(profile.active_value_override, {
    summary: "Prioritize health and family during recovery.",
    updated_at: "2026-07-01T00:00:00.000Z",
  });
});

test("updateSelfProfile persists primary use case profile metadata", async () => {
  installBrowserStorage();

  const status = await updateSelfProfile({
    primary_use_case: {
      kind: "wedding_planning",
      status: "active",
      label: "Wedding planning",
      started_at: "2026-09-13T00:00:00.000Z",
      completed_at: null,
      updated_at: "2026-09-13T00:00:00.000Z",
      source: "profile",
    },
  });

  assert.equal(status, "ok");

  const profile = await getSelfProfile();
  assert.deepEqual(profile.primary_use_case, {
    kind: "wedding_planning",
    status: "active",
    label: "Wedding planning",
    started_at: "2026-09-13T00:00:00.000Z",
    completed_at: null,
    updated_at: "2026-09-13T00:00:00.000Z",
    source: "profile",
  });
});

test("initLedgerKey with a stable identity key lets the ledger survive across browser sessions", async () => {
  installBrowserStorage();
  const identityBytes = new Uint8Array(32).fill(7);

  await initLedgerKey(identityBytes);
  assert.equal(ledgerKeyIsIdentityDerived(), true);

  await updateSelfProfile({
    primary_use_case: {
      kind: "wedding_planning",
      status: "active",
      label: "Wedding planning",
      started_at: "2026-09-13T00:00:00.000Z",
      completed_at: null,
      updated_at: "2026-09-13T00:00:00.000Z",
      source: "profile",
    },
  });

  // Simulate a brand-new browser session: sessionStorage is gone, but the
  // saved ledger + its salt (localStorage) and the server-issued identity
  // key bytes persist, exactly like a returning, already-signed-in user.
  installStorage("sessionStorage");
  await initLedgerKey(identityBytes);
  assert.equal(ledgerKeyIsIdentityDerived(), true);

  const profile = await getSelfProfile();
  assert.equal(profile.primary_use_case?.status, "active");
  assert.equal(profile.primary_use_case?.kind, "wedding_planning");
});

test("resetLedger preserves self profile value settings while clearing derived ledger state", async () => {
  installBrowserStorage();

  await updateSelfProfile({
    value_weights: {
      health: 0.9,
      family: 0.6,
      wealth: 0.3,
      social_life: 0.2,
    },
    active_value_override: {
      summary: "Travel month: protect family time over wealth optimization.",
      updated_at: "2026-07-01T12:00:00.000Z",
    },
  });

  const status = await resetLedger();
  assert.equal(status, "ok");

  const profile = await getSelfProfile();
  assert.deepEqual(profile.value_weights, {
    health: 0.9,
    family: 0.6,
    wealth: 0.3,
    social_life: 0.2,
  });
  assert.deepEqual(profile.active_value_override, {
    summary: "Travel month: protect family time over wealth optimization.",
    updated_at: "2026-07-01T12:00:00.000Z",
  });
});
