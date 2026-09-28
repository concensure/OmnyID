import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import { loadConnectedAppIds, saveConnectedAppIds } from "../src/lib/connectedAppsStorage.ts";

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

test("loadConnectedAppIds keeps only known unique app ids", () => {
  const key = accountScopedStorageKey("omnyid.connected_apps.v1", null);
  localStorageState.set(
    key,
    JSON.stringify(["gmail", "slack", "gmail", "", "unknown", 7]),
  );

  assert.deepEqual(
    loadConnectedAppIds(null, new Set(["gmail", "slack", "github"])),
    ["gmail", "slack"],
  );
  assert.deepEqual(JSON.parse(localStorageState.get(key) ?? "null"), ["gmail", "slack"]);
});

test("loadConnectedAppIds returns an empty list for malformed payloads", () => {
  const key = accountScopedStorageKey("omnyid.connected_apps.v1", null);
  localStorageState.set(
    key,
    JSON.stringify({ id: "gmail" }),
  );
  assert.deepEqual(loadConnectedAppIds(null, new Set(["gmail"])), []);
  assert.deepEqual(JSON.parse(localStorageState.get(key) ?? "null"), []);

  localStorageState.set(key, "{bad json");
  assert.deepEqual(loadConnectedAppIds(null, new Set(["gmail"])), []);
  assert.equal(localStorageState.has(key), false);
});

test("saveConnectedAppIds persists only known unique app ids", () => {
  saveConnectedAppIds(null, ["gmail", "slack", "gmail", "", "unknown"], new Set(["gmail", "slack", "github"]));

  assert.deepEqual(
    JSON.parse(localStorageState.get(accountScopedStorageKey("omnyid.connected_apps.v1", null)) ?? "null"),
    ["gmail", "slack"],
  );
});
