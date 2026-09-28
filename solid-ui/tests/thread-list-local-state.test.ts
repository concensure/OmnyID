import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  DISMISSED_MERGE_PAIRS_KEY,
  QUERY_HISTORY_KEY,
  THREAD_ARCHIVED_KEY,
  THREAD_DENSITY_KEY,
  THREAD_LAST_READ_KEY,
  THREAD_LOCKED_KEY,
  THREAD_ORDER_KEY,
  THREAD_PINNED_KEY,
  THREAD_PRIORITY_KEY,
  THREAD_SORT_MODE_KEY,
  THREAD_STARS_KEY,
  THREAD_TITLES_KEY,
  loadDismissedMergePairs,
  loadArchivedThreadIds,
  loadThreadDensity,
  loadThreadLastRead,
  loadLockedThreadIds,
  loadThreadOrder,
  loadPinnedThreadIds,
  loadThreadPriority,
  loadThreadQueryHistory,
  loadThreadSortMode,
  loadStarredThreadIds,
  loadThreadTitles,
  saveArchivedThreadIds,
  saveDismissedMergePairs,
  saveThreadDensity,
  saveThreadLastRead,
  saveLockedThreadIds,
  saveThreadOrder,
  savePinnedThreadIds,
  saveThreadPriority,
  saveThreadSortMode,
  saveStarredThreadIds,
  saveThreadTitles,
} from "../src/lib/threadListLocalState.ts";

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

const userId = "user-1";
const scopedKey = (baseKey: string) => accountScopedStorageKey(baseKey, userId);

test.beforeEach(() => {
  localStorageState.clear();
});

test("thread list local state falls back to supported density and sort values", () => {
  localStorageState.set(THREAD_DENSITY_KEY, "dense");
  localStorageState.set(THREAD_SORT_MODE_KEY, "priority");

  assert.equal(loadThreadDensity(userId), "7");
  assert.equal(loadThreadSortMode(userId), "activity");
  assert.equal(localStorageState.get(scopedKey(THREAD_DENSITY_KEY)), "7");
  assert.equal(localStorageState.get(scopedKey(THREAD_SORT_MODE_KEY)), "activity");
  assert.equal(localStorageState.has(THREAD_DENSITY_KEY), false);
  assert.equal(localStorageState.has(THREAD_SORT_MODE_KEY), false);
});

test("thread list local state normalizes last-read records", () => {
  localStorageState.set(
    THREAD_LAST_READ_KEY,
    JSON.stringify({
      " thread-a ": " 2026-07-19T12:00:00.000Z ",
      "": "2026-07-19T12:01:00.000Z",
      "thread-b": 7,
    }),
  );

  assert.deepEqual(loadThreadLastRead(userId), {
    "thread-a": "2026-07-19T12:00:00.000Z",
  });
  assert.deepEqual(JSON.parse(localStorageState.get(scopedKey(THREAD_LAST_READ_KEY)) ?? "null"), {
    "thread-a": "2026-07-19T12:00:00.000Z",
  });
  assert.equal(localStorageState.has(THREAD_LAST_READ_KEY), false);
});

test("thread list local state normalizes archived thread id sets", () => {
  localStorageState.set(
    THREAD_ARCHIVED_KEY,
    JSON.stringify([" thread-a ", "", 7, "thread-b", "thread-a"]),
  );

  assert.deepEqual([...loadArchivedThreadIds(userId)].sort(), ["thread-a", "thread-b"]);
  assert.deepEqual(JSON.parse(localStorageState.get(scopedKey(THREAD_ARCHIVED_KEY)) ?? "null"), ["thread-a", "thread-b"]);
  assert.equal(localStorageState.has(THREAD_ARCHIVED_KEY), false);
});

test("thread list local state normalizes starred thread id sets", () => {
  localStorageState.set(
    THREAD_STARS_KEY,
    JSON.stringify([" thread-a ", "", 7, "thread-b", "thread-a"]),
  );

  assert.deepEqual([...loadStarredThreadIds(userId)].sort(), ["thread-a", "thread-b"]);
});

test("thread list local state normalizes locked thread id sets", () => {
  localStorageState.set(
    THREAD_LOCKED_KEY,
    JSON.stringify([" thread-a ", "", 7, "thread-b", "thread-a"]),
  );

  assert.deepEqual([...loadLockedThreadIds(userId)].sort(), ["thread-a", "thread-b"]);
});

test("thread list local state normalizes pinned thread id sets", () => {
  localStorageState.set(
    THREAD_PINNED_KEY,
    JSON.stringify([" thread-a ", "", 7, "thread-b", "thread-a"]),
  );

  assert.deepEqual([...loadPinnedThreadIds(userId)].sort(), ["thread-a", "thread-b"]);
});

test("thread list local state normalizes thread order arrays", () => {
  localStorageState.set(
    THREAD_ORDER_KEY,
    JSON.stringify([" thread-a ", "", 7, "thread-b", "thread-a"]),
  );

  assert.deepEqual(loadThreadOrder(userId), ["thread-a", "thread-b"]);
  assert.deepEqual(JSON.parse(localStorageState.get(scopedKey(THREAD_ORDER_KEY)) ?? "null"), ["thread-a", "thread-b"]);
  assert.equal(localStorageState.has(THREAD_ORDER_KEY), false);
});

test("thread list local state normalizes thread priority maps", () => {
  localStorageState.set(
    THREAD_PRIORITY_KEY,
    JSON.stringify({
      " thread-a ": "high",
      "thread-b": "medium",
      "thread-c": "low",
      "thread-d": null,
      "thread-e": "urgent",
      "": "high",
      "thread-f": 7,
    }),
  );

  assert.deepEqual(loadThreadPriority(userId), {
    "thread-a": "high",
    "thread-b": "medium",
    "thread-c": "low",
    "thread-d": null,
  });
  assert.deepEqual(JSON.parse(localStorageState.get(scopedKey(THREAD_PRIORITY_KEY)) ?? "null"), {
    "thread-a": "high",
    "thread-b": "medium",
    "thread-c": "low",
    "thread-d": null,
  });
  assert.equal(localStorageState.has(THREAD_PRIORITY_KEY), false);
});

test("thread list local state normalizes dismissed merge pair sets", () => {
  localStorageState.set(
    DISMISSED_MERGE_PAIRS_KEY,
    JSON.stringify([" thread-a|thread-b ", "", 7, "thread-c|thread-d", "thread-a|thread-b"]),
  );

  assert.deepEqual([...loadDismissedMergePairs(userId)].sort(), ["thread-a|thread-b", "thread-c|thread-d"]);
});

test("thread list local state normalizes thread title maps", () => {
  localStorageState.set(
    THREAD_TITLES_KEY,
    JSON.stringify({
      " thread-a ": " Alpha ",
      "thread-b": "Beta",
      "thread-c": "",
      "thread-d": 7,
      "": "Gamma",
    }),
  );

  assert.deepEqual(loadThreadTitles(userId), {
    "thread-a": "Alpha",
    "thread-b": "Beta",
  });
});

test("thread list local state normalizes query history rows", () => {
  localStorageState.set(
    QUERY_HISTORY_KEY,
    JSON.stringify([
      { query: " alpha ", timestamp: " 2026-07-19T12:00:00.000Z ", result: " first " },
      { query: "", timestamp: "2026-07-19T12:01:00.000Z" },
      { query: "beta", timestamp: "" },
      { query: "gamma", timestamp: "2026-07-19T12:02:00.000Z", result: 7 },
      { nope: true },
    ]),
  );

  assert.deepEqual(loadThreadQueryHistory(userId), [
    { query: "alpha", timestamp: "2026-07-19T12:00:00.000Z", result: "first" },
    { query: "gamma", timestamp: "2026-07-19T12:02:00.000Z" },
  ]);
  assert.deepEqual(JSON.parse(localStorageState.get(scopedKey(QUERY_HISTORY_KEY)) ?? "null"), [
    { query: "alpha", timestamp: "2026-07-19T12:00:00.000Z", result: "first" },
    { query: "gamma", timestamp: "2026-07-19T12:02:00.000Z" },
  ]);
  assert.equal(localStorageState.has(QUERY_HISTORY_KEY), false);
});

test("thread list local state clears unparseable JSON buckets", () => {
  const keys = [
    THREAD_ARCHIVED_KEY,
    THREAD_STARS_KEY,
    THREAD_LOCKED_KEY,
    THREAD_PINNED_KEY,
    THREAD_ORDER_KEY,
    THREAD_PRIORITY_KEY,
    DISMISSED_MERGE_PAIRS_KEY,
    THREAD_TITLES_KEY,
    QUERY_HISTORY_KEY,
    THREAD_LAST_READ_KEY,
  ];
  for (const key of keys) localStorageState.set(key, "{bad json");

  assert.deepEqual([...loadArchivedThreadIds(userId)], []);
  assert.deepEqual([...loadStarredThreadIds(userId)], []);
  assert.deepEqual([...loadLockedThreadIds(userId)], []);
  assert.deepEqual([...loadPinnedThreadIds(userId)], []);
  assert.deepEqual(loadThreadOrder(userId), []);
  assert.deepEqual(loadThreadPriority(userId), {});
  assert.deepEqual([...loadDismissedMergePairs(userId)], []);
  assert.deepEqual(loadThreadTitles(userId), {});
  assert.deepEqual(loadThreadQueryHistory(userId), []);
  assert.deepEqual(loadThreadLastRead(userId), {});
  for (const key of keys) assert.equal(localStorageState.has(key), false);
  for (const key of keys) assert.equal(localStorageState.has(scopedKey(key)), false);
});

test("thread list local state writers persist only normalized values", () => {
  const dismissedMergePairs = saveDismissedMergePairs(
    new Set([" thread-a|thread-b ", "", "thread-c|thread-d", "thread-a|thread-b"] as any),
    userId,
  );
  const archived = saveArchivedThreadIds(new Set([" thread-a ", "", "thread-b", "thread-a"] as any), userId);
  const starred = saveStarredThreadIds(new Set([" thread-a ", "", "thread-b", "thread-a"] as any), userId);
  const locked = saveLockedThreadIds(new Set([" thread-a ", "", "thread-b", "thread-a"] as any), userId);
  const pinned = savePinnedThreadIds(new Set([" thread-a ", "", "thread-b", "thread-a"] as any), userId);
  const order = saveThreadOrder([" thread-a ", "", "thread-b", "thread-a"] as any, userId);
  const priority = saveThreadPriority(
    {
      " thread-a ": "high",
      "thread-b": "medium",
      "thread-c": "low",
      "thread-d": null,
      "thread-e": "urgent" as any,
      "": "high",
      "thread-f": 7 as any,
    },
    userId,
  );
  const titles = saveThreadTitles(
    {
      " thread-a ": " Alpha ",
      "thread-b": "Beta",
      "thread-c": "",
      "thread-d": 7 as any,
      "": "Gamma",
    },
    userId,
  );
  saveThreadDensity("3", userId);
  saveThreadSortMode("recently_edited", userId);
  saveThreadLastRead(
    {
      " thread-a ": " 2026-07-19T12:00:00.000Z ",
      "": "2026-07-19T12:01:00.000Z",
      "thread-b": "" as never,
    },
    userId,
  );

  assert.deepEqual([...dismissedMergePairs].sort(), ["thread-a|thread-b", "thread-c|thread-d"]);
  assert.deepEqual([...archived].sort(), ["thread-a", "thread-b"]);
  assert.deepEqual([...starred].sort(), ["thread-a", "thread-b"]);
  assert.deepEqual([...locked].sort(), ["thread-a", "thread-b"]);
  assert.deepEqual([...pinned].sort(), ["thread-a", "thread-b"]);
  assert.deepEqual(order, ["thread-a", "thread-b"]);
  assert.deepEqual(priority, {
    "thread-a": "high",
    "thread-b": "medium",
    "thread-c": "low",
    "thread-d": null,
  });
  assert.deepEqual(titles, {
    "thread-a": "Alpha",
    "thread-b": "Beta",
  });
  assert.equal(
    localStorageState.get(scopedKey(THREAD_ARCHIVED_KEY)),
    JSON.stringify(["thread-a", "thread-b"]),
  );
  assert.equal(
    localStorageState.get(scopedKey(THREAD_STARS_KEY)),
    JSON.stringify(["thread-a", "thread-b"]),
  );
  assert.equal(
    localStorageState.get(scopedKey(THREAD_LOCKED_KEY)),
    JSON.stringify(["thread-a", "thread-b"]),
  );
  assert.equal(
    localStorageState.get(scopedKey(THREAD_PINNED_KEY)),
    JSON.stringify(["thread-a", "thread-b"]),
  );
  assert.equal(
    localStorageState.get(scopedKey(THREAD_ORDER_KEY)),
    JSON.stringify(["thread-a", "thread-b"]),
  );
  assert.equal(
    localStorageState.get(scopedKey(THREAD_PRIORITY_KEY)),
    JSON.stringify({
      "thread-a": "high",
      "thread-b": "medium",
      "thread-c": "low",
      "thread-d": null,
    }),
  );
  assert.equal(
    localStorageState.get(scopedKey(DISMISSED_MERGE_PAIRS_KEY)),
    JSON.stringify(["thread-a|thread-b", "thread-c|thread-d"]),
  );
  assert.equal(
    localStorageState.get(scopedKey(THREAD_TITLES_KEY)),
    JSON.stringify({
      "thread-a": "Alpha",
      "thread-b": "Beta",
    }),
  );
  assert.equal(localStorageState.get(scopedKey(THREAD_DENSITY_KEY)), "3");
  assert.equal(localStorageState.get(scopedKey(THREAD_SORT_MODE_KEY)), "recently_edited");
  assert.equal(
    localStorageState.get(scopedKey(THREAD_LAST_READ_KEY)),
    JSON.stringify({ "thread-a": "2026-07-19T12:00:00.000Z" }),
  );
});
