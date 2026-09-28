import assert from "node:assert/strict";
import test from "node:test";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  loadThreadSessionHistory,
  pushThreadSessionHistory,
  saveThreadSessionHistory,
  stepBackThreadSessionHistory,
  stepForwardThreadSessionHistory,
  THREAD_SESSION_HISTORY_KEY,
  type ThreadSessionHistoryEntry,
  type ThreadSessionHistoryState,
} from "../src/lib/threadSessionHistory.ts";

const sessionStorageState = new Map<string, string>();

Object.assign(globalThis, {
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

test.beforeEach(() => {
  sessionStorageState.clear();
});

const userId = "user-1";
const scopedHistoryKey = accountScopedStorageKey(THREAD_SESSION_HISTORY_KEY, userId);

function entry(threadId: string, messageId: string | null = null): ThreadSessionHistoryEntry {
  return { threadId, messageId };
}

test("pushThreadSessionHistory records the current thread and clears future on a fresh navigation", () => {
  const state: ThreadSessionHistoryState = {
    past: [entry("thread-1")],
    future: [entry("thread-4")],
  };

  assert.deepEqual(
    pushThreadSessionHistory(state, entry("thread-2", "msg-2"), entry("thread-3")),
    {
      past: [entry("thread-1"), entry("thread-2", "msg-2")],
      future: [],
    },
  );
});

test("pushThreadSessionHistory ignores repeated opens of the same thread", () => {
  const state: ThreadSessionHistoryState = {
    past: [entry("thread-1")],
    future: [entry("thread-3")],
  };

  assert.deepEqual(
    pushThreadSessionHistory(state, entry("thread-2", "msg-2"), entry("thread-2", "msg-99")),
    state,
  );
});

test("stepBackThreadSessionHistory moves the current thread into future", () => {
  const state: ThreadSessionHistoryState = {
    past: [entry("thread-1"), entry("thread-2", "msg-2")],
    future: [],
  };

  const result = stepBackThreadSessionHistory(state, entry("thread-3", "msg-3"));

  assert.deepEqual(result.target, entry("thread-2", "msg-2"));
  assert.deepEqual(result.state, {
    past: [entry("thread-1")],
    future: [entry("thread-3", "msg-3")],
  });
});

test("stepForwardThreadSessionHistory restores the future thread and records the current one in past", () => {
  const state: ThreadSessionHistoryState = {
    past: [entry("thread-1")],
    future: [entry("thread-3", "msg-3"), entry("thread-4")],
  };

  const result = stepForwardThreadSessionHistory(state, entry("thread-2", "msg-2"));

  assert.deepEqual(result.target, entry("thread-3", "msg-3"));
  assert.deepEqual(result.state, {
    past: [entry("thread-1"), entry("thread-2", "msg-2")],
    future: [entry("thread-4")],
  });
});

test("loadThreadSessionHistory filters malformed session storage entries", () => {
  sessionStorageState.set(
    THREAD_SESSION_HISTORY_KEY,
    JSON.stringify({
      past: [entry("thread-1"), { threadId: "" }, { nope: true }],
      future: [entry("thread-2", "msg-2"), { threadId: 4 }],
    }),
  );

  assert.deepEqual(loadThreadSessionHistory(userId), {
    past: [entry("thread-1")],
    future: [entry("thread-2", "msg-2")],
  });
  assert.equal(
    sessionStorageState.get(scopedHistoryKey),
    JSON.stringify({
      past: [entry("thread-1")],
      future: [entry("thread-2", "msg-2")],
    }),
  );
  assert.equal(sessionStorageState.has(THREAD_SESSION_HISTORY_KEY), false);
});

test("loadThreadSessionHistory clears unparseable session history", () => {
  sessionStorageState.set(THREAD_SESSION_HISTORY_KEY, "{bad-json");

  assert.deepEqual(loadThreadSessionHistory(userId), {
    past: [],
    future: [],
  });
  assert.equal(sessionStorageState.has(THREAD_SESSION_HISTORY_KEY), false);
  assert.equal(sessionStorageState.has(scopedHistoryKey), false);
});

test("saveThreadSessionHistory persists only normalized session stack entries", () => {
  saveThreadSessionHistory(
    {
      past: [
        entry("thread-1"),
        { threadId: "", messageId: null } as ThreadSessionHistoryEntry,
      ],
      future: [
        entry("thread-2", "msg-2"),
        { threadId: "thread-3", messageId: 7 as unknown as string },
      ],
    },
    userId,
  );

  assert.deepEqual(
    JSON.parse(sessionStorageState.get(scopedHistoryKey) ?? "null"),
    {
      past: [entry("thread-1")],
      future: [
        entry("thread-2", "msg-2"),
        entry("thread-3"),
      ],
    },
  );
});
