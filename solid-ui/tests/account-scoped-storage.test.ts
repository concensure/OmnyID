import test from "node:test";
import assert from "node:assert/strict";

import {
  accountScopedStorageKey,
  accountScopedStorageReadKey,
  normalizeAccountScopedStorageUserId,
} from "../src/lib/accountScopedStorage.ts";

test("normalizeAccountScopedStorageUserId falls back to anonymous", () => {
  assert.equal(normalizeAccountScopedStorageUserId(null), "anonymous");
  assert.equal(normalizeAccountScopedStorageUserId(undefined), "anonymous");
  assert.equal(normalizeAccountScopedStorageUserId("   "), "anonymous");
});

test("authenticated reads never resolve to the legacy browser-global key", () => {
  assert.equal(accountScopedStorageReadKey("omnyid.example", null), "omnyid.example");
  assert.equal(accountScopedStorageReadKey("omnyid.example", ""), "omnyid.example");
  assert.equal(accountScopedStorageReadKey("omnyid.example", " user-1 "), "omnyid.example:user-1");
});

test("accountScopedStorageKey isolates keys per normalized user id", () => {
  assert.equal(
    accountScopedStorageKey("omnyid.tools.local_connections.v1", " user-1 "),
    "omnyid.tools.local_connections.v1:user-1",
  );
  assert.equal(
    accountScopedStorageKey("omnyid.tools.local_connections.v1", "user-2"),
    "omnyid.tools.local_connections.v1:user-2",
  );
});
