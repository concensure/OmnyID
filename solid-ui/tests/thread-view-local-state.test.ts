import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  THREAD_VIEW_REACTIONS_KEY,
  THREAD_VIEW_STARRED_KEY,
  loadThreadViewLastReadMessageId,
  loadThreadViewReactions,
  loadThreadViewScrollPosition,
  loadThreadViewStarredMessageIds,
  saveThreadViewLastReadMessageId,
  saveThreadViewReactions,
  saveThreadViewScrollPosition,
  saveThreadViewStarredMessageIds,
} from "../src/lib/threadViewLocalState.ts";

const localStorageState = new Map<string, string>();
const sessionStorageState = new Map<string, string>();

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
  sessionStorage: {
    getItem(key: string) {
      return sessionStorageState.has(key) ? sessionStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      sessionStorageState.set(key, value);
    },
    removeItem(key: string) {
      sessionStorageState.delete(key);
    },
  },
});

const userId = "user-1";
const starredKey = accountScopedStorageKey(THREAD_VIEW_STARRED_KEY, userId);
const reactionsKey = accountScopedStorageKey(THREAD_VIEW_REACTIONS_KEY, userId);
const lastReadKey = (threadId: string) => accountScopedStorageKey(`omnyid.thread.lastread.${threadId}`, userId);
const scrollPosKey = (threadId: string) => accountScopedStorageKey(`omnyid.thread.scrollpos.${threadId}`, userId);

test("thread view local state normalizes starred message ids", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  localStorageState.set(
    THREAD_VIEW_STARRED_KEY,
    JSON.stringify([" msg-a ", "", 7, "msg-b", "msg-a"]),
  );

  assert.deepEqual([...loadThreadViewStarredMessageIds(userId)].sort(), ["msg-a", "msg-b"]);
  assert.equal(localStorageState.get(starredKey), JSON.stringify(["msg-a", "msg-b"]));
  assert.equal(localStorageState.has(THREAD_VIEW_STARRED_KEY), false);
});

test("thread view local state writers persist only normalized starred message ids", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  const normalized = saveThreadViewStarredMessageIds(
    new Set([" msg-a ", "", "msg-b", "msg-a"] as any),
    userId,
  );

  assert.deepEqual([...normalized].sort(), ["msg-a", "msg-b"]);
  assert.equal(localStorageState.get(starredKey), JSON.stringify(["msg-a", "msg-b"]));
});

test("thread view local state normalizes reactions", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  localStorageState.set(
    THREAD_VIEW_REACTIONS_KEY,
    JSON.stringify({
      " msg-a ": { " ðŸ‘ ": 2, "": 1, "ðŸ‘Ž": 0, "ðŸ˜‚": "3" },
      "msg-b": { "ðŸ”¥": 1.9, "âœ…": 4 },
      "": { "ðŸ‘": 1 },
      "msg-c": [],
    }),
  );

  assert.deepEqual(loadThreadViewReactions(userId), {
    "msg-a": { "ðŸ‘": 2 },
    "msg-b": { "ðŸ”¥": 1, "âœ…": 4 },
  });
  assert.equal(
    localStorageState.get(reactionsKey),
    JSON.stringify({
      "msg-a": { "ðŸ‘": 2 },
      "msg-b": { "ðŸ”¥": 1, "âœ…": 4 },
    }),
  );
  assert.equal(localStorageState.has(THREAD_VIEW_REACTIONS_KEY), false);
});

test("thread view local state writers persist only normalized reactions", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  const normalized = saveThreadViewReactions(
    {
      " msg-a ": { " ðŸ‘ ": 2, "": 1, "ðŸ‘Ž": 0, "ðŸ˜‚": "3" as any },
      "msg-b": { "ðŸ”¥": 1.9, "âœ…": 4 },
      "": { "ðŸ‘": 1 },
      "msg-c": [] as any,
    },
    userId,
  );

  assert.deepEqual(normalized, {
    "msg-a": { "ðŸ‘": 2 },
    "msg-b": { "ðŸ”¥": 1, "âœ…": 4 },
  });
  assert.equal(
    localStorageState.get(reactionsKey),
    JSON.stringify({
      "msg-a": { "ðŸ‘": 2 },
      "msg-b": { "ðŸ”¥": 1, "âœ…": 4 },
    }),
  );
});

test("thread view local state normalizes last-read message ids", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  localStorageState.set("omnyid.thread.lastread.thread-a", " msg-a ");
  localStorageState.set("omnyid.thread.lastread.thread-b", "");

  assert.equal(loadThreadViewLastReadMessageId(" thread-a ", userId), "msg-a");
  assert.equal(loadThreadViewLastReadMessageId("thread-b", userId), null);
  assert.equal(loadThreadViewLastReadMessageId("", userId), null);
  assert.equal(localStorageState.get(lastReadKey("thread-a")), "msg-a");
  assert.equal(localStorageState.has("omnyid.thread.lastread.thread-a"), false);
  assert.equal(localStorageState.has("omnyid.thread.lastread.thread-b"), false);
});

test("thread view local state writers persist only normalized last-read message ids", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  assert.equal(saveThreadViewLastReadMessageId(" thread-a ", " msg-a ", userId), "msg-a");
  assert.equal(localStorageState.get(lastReadKey("thread-a")), "msg-a");
  assert.equal(saveThreadViewLastReadMessageId("thread-b", "", userId), null);
  assert.equal(localStorageState.has("omnyid.thread.lastread.thread-b"), false);
});

test("thread view local state normalizes scroll positions", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  sessionStorageState.set("omnyid.thread.scrollpos.thread-a", " 42 ");
  sessionStorageState.set("omnyid.thread.scrollpos.thread-b", "-7");

  assert.equal(loadThreadViewScrollPosition(" thread-a ", userId), 42);
  assert.equal(loadThreadViewScrollPosition("thread-b", userId), null);
  assert.equal(loadThreadViewScrollPosition("", userId), null);
  assert.equal(sessionStorageState.get(scrollPosKey("thread-a")), "42");
  assert.equal(sessionStorageState.has("omnyid.thread.scrollpos.thread-a"), false);
  assert.equal(sessionStorageState.has("omnyid.thread.scrollpos.thread-b"), false);
});

test("thread view local state loaders clear unparseable json buckets", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  localStorageState.set(THREAD_VIEW_STARRED_KEY, "{bad-json");
  localStorageState.set(THREAD_VIEW_REACTIONS_KEY, "{bad-json");

  assert.deepEqual([...loadThreadViewStarredMessageIds(userId)], []);
  assert.deepEqual(loadThreadViewReactions(userId), {});
  assert.equal(localStorageState.has(THREAD_VIEW_STARRED_KEY), false);
  assert.equal(localStorageState.has(THREAD_VIEW_REACTIONS_KEY), false);
  assert.equal(localStorageState.has(starredKey), false);
  assert.equal(localStorageState.has(reactionsKey), false);
});

test("thread view local state writers persist only normalized scroll positions", () => {
  localStorageState.clear();
  sessionStorageState.clear();

  assert.equal(saveThreadViewScrollPosition(" thread-a ", 42.9, userId), 42);
  assert.equal(sessionStorageState.get(scrollPosKey("thread-a")), "42");
  assert.equal(saveThreadViewScrollPosition("thread-b", -7, userId), null);
  assert.equal(sessionStorageState.has("omnyid.thread.scrollpos.thread-b"), false);
});
