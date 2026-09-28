import test from "node:test";
import assert from "node:assert/strict";

import { initSync, resetSyncInitState } from "../src/lib/sync.ts";

const localStorageState = new Map<string, string>();

const localStorage = {
  getItem(key: string) {
    return localStorageState.has(key) ? localStorageState.get(key)! : null;
  },
  setItem(key: string, value: string) {
    localStorageState.set(key, value);
  },
  removeItem(key: string) {
    localStorageState.delete(key);
  },
};

Object.assign(globalThis, {
  localStorage,
  window: {
    localStorage,
    navigator: { userAgent: "desktop test browser" },
    matchMedia() {
      return { matches: false };
    },
  },
});

test("sync bootstrap trims persisted device ids before reuse", async () => {
  localStorageState.clear();
  await resetSyncInitState();
  localStorageState.set("omnyid.sync.device.default.desktop", "  device-1  ");

  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch(input: string | URL | Request) {
      requests.push(String(input));
      return Promise.resolve({ ok: false });
    },
  });

  try {
    await initSync("https://api.example.test", "token-1");
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
    await resetSyncInitState();
  }

  assert.equal(localStorageState.get("omnyid.sync.device.default.desktop"), "device-1");
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0],
    "https://api.example.test/sync/bootstrap?device_class=desktop&device_id=device-1",
  );
});

test("sync bootstrap clears blank persisted device ids", async () => {
  localStorageState.clear();
  await resetSyncInitState();
  localStorageState.set("omnyid.sync.device.default.desktop", "   ");

  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch(input: string | URL | Request) {
      requests.push(String(input));
      return Promise.resolve({ ok: false });
    },
  });

  try {
    await initSync("https://api.example.test", "token-1");
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
    await resetSyncInitState();
  }

  assert.equal(localStorageState.has("omnyid.sync.device.default.desktop"), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0], "https://api.example.test/sync/bootstrap?device_class=desktop");
});
