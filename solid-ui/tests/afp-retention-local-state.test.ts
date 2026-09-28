import test from "node:test";
import assert from "node:assert/strict";

import {
  loadAfpEphemeralCategoryOverrides,
  loadAfpEphemeralTypeOverrides,
  saveAfpEphemeralCategoryOverrides,
  saveAfpEphemeralTypeOverrides,
} from "../src/lib/afpRetentionLocalState.ts";

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

test("afp retention local state filters malformed stored override records", () => {
  localStorageState.set(
    "omnyid.afp-ephemeral-types",
    JSON.stringify({
      " email ": true,
      "": false,
      chart: "yes",
    }),
  );
  localStorageState.set(
    "omnyid.afp-ephemeral-categories",
    JSON.stringify({
      " data ": false,
      agent: null,
    }),
  );

  assert.deepEqual(loadAfpEphemeralTypeOverrides(), { email: true });
  assert.deepEqual(loadAfpEphemeralCategoryOverrides(), { data: false });
  assert.equal(localStorageState.get("omnyid.afp-ephemeral-types"), JSON.stringify({ email: true }));
  assert.equal(localStorageState.get("omnyid.afp-ephemeral-categories"), JSON.stringify({ data: false }));
});

test("afp retention local state clears unparseable persisted override records", () => {
  localStorageState.set("omnyid.afp-ephemeral-types", "{bad-json");
  localStorageState.set("omnyid.afp-ephemeral-categories", "{bad-json");

  assert.deepEqual(loadAfpEphemeralTypeOverrides(), {});
  assert.deepEqual(loadAfpEphemeralCategoryOverrides(), {});
  assert.equal(localStorageState.has("omnyid.afp-ephemeral-types"), false);
  assert.equal(localStorageState.has("omnyid.afp-ephemeral-categories"), false);
});

test("afp retention local state persists only normalized boolean override records", () => {
  saveAfpEphemeralTypeOverrides({
    " email ": true,
    "": false,
    chart: "yes" as never,
  });
  saveAfpEphemeralCategoryOverrides({
    " data ": false,
    agent: null as never,
  });

  assert.equal(
    localStorageState.get("omnyid.afp-ephemeral-types"),
    JSON.stringify({ email: true }),
  );
  assert.equal(
    localStorageState.get("omnyid.afp-ephemeral-categories"),
    JSON.stringify({ data: false }),
  );
});
