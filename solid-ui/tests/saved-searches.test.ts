import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultSavedSearchName,
  filterSavedSearches,
  loadSavedSearches,
  parseSavedSearchSlashQuery,
  saveSavedSearches,
  upsertSavedSearch,
} from "../src/lib/savedSearches.ts";

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

test("defaultSavedSearchName trims and bounds long queries", () => {
  assert.equal(defaultSavedSearchName("  inbox zero  "), "inbox zero");
  assert.equal(
    defaultSavedSearchName("this is a deliberately long query name that should be truncated for display"),
    "this is a deliberately long query name that s...",
  );
});

test("upsertSavedSearch keeps newest first and replaces duplicate queries", () => {
  const first = upsertSavedSearch([], "Launch", "tag:#launch", "2026-07-02T00:00:00.000Z", 5);
  const second = upsertSavedSearch(first, "Launch board", "tag:#launch", "2026-07-02T01:00:00.000Z", 5);
  assert.deepEqual(second, [
    { name: "Launch board", query: "tag:#launch", savedAt: "2026-07-02T01:00:00.000Z" },
  ]);
});

test("parseSavedSearchSlashQuery detects the saved-search command and trailing filter", () => {
  assert.equal(parseSavedSearchSlashQuery("/search saved"), "");
  assert.equal(parseSavedSearchSlashQuery("/search saved launch"), "launch");
  assert.equal(parseSavedSearchSlashQuery("/sync"), null);
});

test("filterSavedSearches matches saved names and query text", () => {
  const entries = [
    { name: "Launch inbox", query: "tag:#launch type:email", savedAt: "2026-07-02T00:00:00.000Z" },
    { name: "Finance review", query: "tag:#finance is:unread", savedAt: "2026-07-02T00:00:00.000Z" },
  ];
  assert.equal(filterSavedSearches(entries, "launch").length, 1);
  assert.equal(filterSavedSearches(entries, "#finance").length, 1);
  assert.equal(filterSavedSearches(entries, "").length, 2);
});

test("loadSavedSearches trims entries and ignores malformed stored rows", () => {
  localStorageState.set(
    "saved-searches:test",
    JSON.stringify([
      { name: "  Launch inbox  ", query: "  tag:#launch type:email  ", savedAt: " 2026-07-02T00:00:00.000Z " },
      { name: "   ", query: "tag:#bad", savedAt: "2026-07-02T00:00:00.000Z" },
      { name: "Finance", query: "   ", savedAt: "2026-07-02T00:00:00.000Z" },
      { name: "Missing timestamp", query: "tag:#missing", savedAt: "   " },
      { name: "Bad object", query: 7, savedAt: "2026-07-02T00:00:00.000Z" },
    ]),
  );

  assert.deepEqual(loadSavedSearches("saved-searches:test"), [
    {
      name: "Launch inbox",
      query: "tag:#launch type:email",
      savedAt: "2026-07-02T00:00:00.000Z",
    },
  ]);
  assert.equal(
    localStorageState.get("saved-searches:test"),
    JSON.stringify([
      {
        name: "Launch inbox",
        query: "tag:#launch type:email",
        savedAt: "2026-07-02T00:00:00.000Z",
      },
    ]),
  );
});

test("loadSavedSearches clears unparseable persisted entries", () => {
  localStorageState.set("saved-searches:corrupt", "{bad-json");

  assert.deepEqual(loadSavedSearches("saved-searches:corrupt"), []);
  assert.equal(localStorageState.has("saved-searches:corrupt"), false);
});

test("loadSavedSearches migrates legacy keys into the canonical scoped key", () => {
  localStorageState.set(
    "saved-searches:legacy",
    JSON.stringify([{ name: " Launch ", query: " tag:#launch ", savedAt: " 2026-07-02T00:00:00.000Z " }]),
  );

  assert.deepEqual(
    loadSavedSearches("saved-searches:canonical", ["saved-searches:legacy"]),
    [{ name: "Launch", query: "tag:#launch", savedAt: "2026-07-02T00:00:00.000Z" }],
  );
  assert.equal(localStorageState.has("saved-searches:legacy"), false);
  assert.equal(
    localStorageState.get("saved-searches:canonical"),
    JSON.stringify([{ name: "Launch", query: "tag:#launch", savedAt: "2026-07-02T00:00:00.000Z" }]),
  );
});

test("saveSavedSearches persists only normalized saved-search rows", () => {
  const normalized = saveSavedSearches("saved-searches:write", [
    { name: "  Launch inbox  ", query: "  tag:#launch type:email  ", savedAt: " 2026-07-02T00:00:00.000Z " },
    { name: "   ", query: "tag:#bad", savedAt: "2026-07-02T00:00:00.000Z" },
    { name: "Finance", query: "   ", savedAt: "2026-07-02T00:00:00.000Z" },
    { name: "Missing timestamp", query: "tag:#missing", savedAt: "   " },
  ]);

  assert.deepEqual(normalized, [
    {
      name: "Launch inbox",
      query: "tag:#launch type:email",
      savedAt: "2026-07-02T00:00:00.000Z",
    },
  ]);
  assert.equal(
    localStorageState.get("saved-searches:write"),
    JSON.stringify(normalized),
  );
});

test("saveSavedSearches clears legacy keys after writing the canonical key", () => {
  localStorageState.set("saved-searches:legacy", "[]");

  saveSavedSearches(
    "saved-searches:canonical",
    [{ name: "Launch", query: "tag:#launch", savedAt: "2026-07-02T00:00:00.000Z" }],
    ["saved-searches:legacy"],
  );

  assert.equal(localStorageState.has("saved-searches:legacy"), false);
  assert.equal(
    localStorageState.get("saved-searches:canonical"),
    JSON.stringify([{ name: "Launch", query: "tag:#launch", savedAt: "2026-07-02T00:00:00.000Z" }]),
  );
});
