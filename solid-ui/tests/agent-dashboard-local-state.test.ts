import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  AGENT_DASHBOARD_QUERY_HISTORY_KEY,
  AGENT_DASHBOARD_SHORTCUTS_DISMISSED_KEY,
  isAgentDashboardQueryHistoryStorageEvent,
  isAgentDashboardShortcutsDismissedStorageEvent,
  loadAgentDashboardQueryHistory,
  loadAgentDashboardShortcutsDismissed,
  recordAgentDashboardQueryHistory,
  saveAgentDashboardQueryHistory,
  saveAgentDashboardShortcutsDismissed,
  subscribeAgentDashboardQueryHistoryChanges,
  subscribeAgentDashboardShortcutsDismissedStorage,
} from "../src/lib/agentDashboardLocalState.ts";

const userId = "user-1";
const scopedHistoryKey = accountScopedStorageKey(AGENT_DASHBOARD_QUERY_HISTORY_KEY, userId);
const scopedShortcutsKey = accountScopedStorageKey(AGENT_DASHBOARD_SHORTCUTS_DISMISSED_KEY, userId);
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

test.beforeEach(() => {
  localStorageState.clear();
});

test("agent dashboard query history loader trims, deduplicates, sorts, and drops malformed rows", () => {
  localStorageState.set(
    scopedHistoryKey,
    JSON.stringify([
      { query: "  Launch status  ", view: "  board  ", ts: "2024-07-19T09:00:00.000Z" },
      { query: "launch status", view: "board", ts: "2024-07-19T08:00:00.000Z" },
      { query: " Inbox triage ", view: "   ", ts: "2024-07-19T10:00:00.000Z" },
      { query: " ", view: "chat", ts: "2024-07-19T11:00:00.000Z" },
      { query: "Bad ts", view: "chat", ts: "not-a-date" },
    ]),
  );

  assert.deepEqual(loadAgentDashboardQueryHistory(userId), [
    { query: "Inbox triage", view: "chat", ts: "2024-07-19T10:00:00.000Z" },
    { query: "Launch status", view: "board", ts: "2024-07-19T09:00:00.000Z" },
  ]);
});

test("agent dashboard query history writers persist only normalized rows", () => {
  const normalized = saveAgentDashboardQueryHistory([
    { query: "  Launch status  ", view: "  board  ", ts: "2024-07-19T09:00:00.000Z" },
    { query: "launch status", view: "board", ts: "2024-07-19T08:00:00.000Z" },
    { query: " ", view: "chat", ts: "2024-07-19T11:00:00.000Z" },
  ], userId);

  assert.deepEqual(normalized, [
    { query: "Launch status", view: "board", ts: "2024-07-19T09:00:00.000Z" },
  ]);
  assert.equal(localStorageState.get(scopedHistoryKey), JSON.stringify(normalized));
});

test("agent dashboard query history recording normalizes and keeps newest unique entry first", () => {
  localStorageState.set(
    scopedHistoryKey,
    JSON.stringify([
      { query: "Launch status", view: "board", ts: "2024-07-19T08:00:00.000Z" },
      { query: "Inbox triage", view: "chat", ts: "2024-07-19T07:00:00.000Z" },
    ]),
  );

  recordAgentDashboardQueryHistory("  Launch status  ", "  board  ", userId);

  const stored = JSON.parse(localStorageState.get(scopedHistoryKey) ?? "[]");
  assert.equal(stored.length, 2);
  assert.equal(stored[0].query, "Launch status");
  assert.equal(stored[0].view, "board");
  assert.equal(stored[1].query, "Inbox triage");
});

test("agent dashboard shortcuts flag defaults false and persists explicit dismissal", () => {
  assert.equal(loadAgentDashboardShortcutsDismissed(userId), false);
  localStorageState.set(scopedShortcutsKey, "true");
  assert.equal(loadAgentDashboardShortcutsDismissed(userId), false);
  assert.equal(localStorageState.get(scopedShortcutsKey), "0");

  assert.equal(saveAgentDashboardShortcutsDismissed(true, userId), true);
  assert.equal(loadAgentDashboardShortcutsDismissed(userId), true);
});

test("agent dashboard storage-event helpers match only their owned keys", () => {
  assert.equal(
    isAgentDashboardQueryHistoryStorageEvent({ key: scopedHistoryKey }, userId),
    true,
  );
  assert.equal(
    isAgentDashboardQueryHistoryStorageEvent({ key: "omnyid.other" }, userId),
    false,
  );
  assert.equal(
    isAgentDashboardShortcutsDismissedStorageEvent({ key: scopedShortcutsKey }, userId),
    true,
  );
  assert.equal(
    isAgentDashboardShortcutsDismissedStorageEvent({ key: null }, userId),
    false,
  );
});

test("agent dashboard query-history subscription helper registers and unregisters the owned event", () => {
  const listeners = new Map<string, Set<() => void>>();
  const originalWindow = globalThis.window;
  const callback = () => {};
  Object.assign(globalThis, {
    window: {
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener !== "function") return;
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener as () => void);
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener !== "function") return;
        listeners.get(type)?.delete(listener as () => void);
      },
      dispatchEvent() {
        return true;
      },
    } as unknown as Window & typeof globalThis,
  });
  try {
    const unsubscribe = subscribeAgentDashboardQueryHistoryChanges(callback);
    assert.equal([...listeners.values()].flatMap((set) => [...set]).includes(callback), true);
    unsubscribe();
    assert.equal([...listeners.values()].flatMap((set) => [...set]).includes(callback), false);
  } finally {
    Object.assign(globalThis, { window: originalWindow });
  }
});

test("agent dashboard shortcuts-dismissed storage subscription helper reacts only to the owned key", () => {
  const listeners = new Map<string, Set<(event?: unknown) => void>>();
  const originalWindow = globalThis.window;
  let calls = 0;
  Object.assign(globalThis, {
    window: {
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener !== "function") return;
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener as (event?: unknown) => void);
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener !== "function") return;
        listeners.get(type)?.delete(listener as (event?: unknown) => void);
      },
      dispatchEvent() {
        return true;
      },
    } as unknown as Window & typeof globalThis,
  });
  try {
    const unsubscribe = subscribeAgentDashboardShortcutsDismissedStorage(() => {
      calls += 1;
    }, userId);
    const storageListeners = [...(listeners.get("storage") ?? new Set())];
    assert.equal(storageListeners.length, 1);
    storageListeners[0]({ key: "omnyid.other" });
    assert.equal(calls, 0);
    storageListeners[0]({ key: scopedShortcutsKey });
    assert.equal(calls, 1);
    unsubscribe();
    assert.equal((listeners.get("storage")?.size ?? 0), 0);
  } finally {
    Object.assign(globalThis, { window: originalWindow });
  }
});

test("agent dashboard query history migrates legacy global storage into a scoped key", () => {
  localStorageState.set(
    AGENT_DASHBOARD_QUERY_HISTORY_KEY,
    JSON.stringify([{ query: "Launch status", view: "board", ts: "2024-07-19T09:00:00.000Z" }]),
  );

  assert.deepEqual(loadAgentDashboardQueryHistory(userId), [
    { query: "Launch status", view: "board", ts: "2024-07-19T09:00:00.000Z" },
  ]);
  assert.equal(localStorageState.get(scopedHistoryKey), JSON.stringify([
    { query: "Launch status", view: "board", ts: "2024-07-19T09:00:00.000Z" },
  ]));
  assert.equal(localStorageState.has(AGENT_DASHBOARD_QUERY_HISTORY_KEY), false);
});
