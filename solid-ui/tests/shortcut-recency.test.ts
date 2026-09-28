import test from "node:test";
import assert from "node:assert/strict";

import {
  recordShortcutUse,
  sortShortcutsByRecent,
  type ShortcutRecencyEntry,
} from "../src/lib/shortcutRecency.ts";

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

test("sortShortcutsByRecent promotes recently used shortcuts first", () => {
  const entries: ShortcutRecencyEntry[] = [
    { id: "view:search", label: "Chat", shortcut: "Ctrl+1" },
    { id: "search_focus", label: "Chat / Focus", shortcut: "Ctrl+K" },
    { id: "shortcuts_help", label: "Shortcuts", shortcut: "?" },
  ];

  sessionStorageState.set(
    "omnyid.shortcuts.recent",
    JSON.stringify({
      shortcuts_help: 300,
      "view:search": 100,
      search_focus: 200,
    }),
  );

  assert.deepEqual(
    sortShortcutsByRecent(entries).map((entry) => entry.id),
    ["shortcuts_help", "search_focus", "view:search"],
  );
});

test("sortShortcutsByRecent preserves original order when recency is missing", () => {
  const entries: ShortcutRecencyEntry[] = [
    { id: "view:threads", label: "Threads", shortcut: "Ctrl+2" },
    { id: "more_views", label: "More views", shortcut: "Alt+M" },
  ];

  sessionStorageState.delete("omnyid.shortcuts.recent");

  assert.deepEqual(
    sortShortcutsByRecent(entries).map((entry) => entry.id),
    ["view:threads", "more_views"],
  );
});

test("sortShortcutsByRecent ignores malformed stored recency entries", () => {
  const entries: ShortcutRecencyEntry[] = [
    { id: "view:search", label: "Chat", shortcut: "Ctrl+1" },
    { id: "search_focus", label: "Chat / Focus", shortcut: "Ctrl+K" },
    { id: "shortcuts_help", label: "Shortcuts", shortcut: "?" },
  ];

  sessionStorageState.set(
    "omnyid.shortcuts.recent",
    JSON.stringify({
      "": 999,
      shortcuts_help: -10,
      "view:search": 100,
      search_focus: "200",
    }),
  );

  assert.deepEqual(
    sortShortcutsByRecent(entries).map((entry) => entry.id),
    ["view:search", "search_focus", "shortcuts_help"],
  );
  assert.equal(
    sessionStorageState.get("omnyid.shortcuts.recent"),
    JSON.stringify({ "view:search": 100 }),
  );
});

test("sortShortcutsByRecent clears unparseable stored recency", () => {
  const entries: ShortcutRecencyEntry[] = [
    { id: "view:search", label: "Chat", shortcut: "Ctrl+1" },
  ];
  sessionStorageState.set("omnyid.shortcuts.recent", "{bad-json");

  assert.deepEqual(sortShortcutsByRecent(entries).map((entry) => entry.id), ["view:search"]);
  assert.equal(sessionStorageState.has("omnyid.shortcuts.recent"), false);
});

test("recordShortcutUse persists only normalized shortcut ids", () => {
  const realNow = Date.now;
  Date.now = () => 123456;
  try {
    sessionStorageState.set(
      "omnyid.shortcuts.recent",
      JSON.stringify({
        "view:search": 100,
        "": 999,
      }),
    );

    recordShortcutUse("  search_focus  ");

    assert.equal(
      sessionStorageState.get("omnyid.shortcuts.recent"),
      JSON.stringify({
        "view:search": 100,
        "search_focus": 123456,
      }),
    );
  } finally {
    Date.now = realNow;
  }
});
