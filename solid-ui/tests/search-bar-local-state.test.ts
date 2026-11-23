import test from "node:test";
import assert from "node:assert/strict";

import {
  clearRecentSearchQueries,
  clearSessionSearchHistory,
  loadRecentSearchQueries,
  loadSearchBooleanModePreference,
  loadSearchEnginePreference,
  loadSearchOptimizationMode,
  loadSearchSelectHintSeen,
  loadSessionSearchHistory,
  saveRecentSearchQuery,
  saveSearchBooleanModePreference,
  saveSearchEnginePreference,
  saveSearchOptimizationMode,
  saveSearchSelectHintSeen,
  saveSessionSearchHistory,
} from "../src/lib/searchBarLocalState.ts";

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

test("search bar local state loaders trim arrays and normalize invalid preferences", () => {
  localStorageState.set("recent", JSON.stringify([" first ", "", "second", 7]));
  sessionStorageState.set("history", JSON.stringify([" one ", "two", "", 9]));
  localStorageState.set("engine", "bing");
  localStorageState.set("opt", "weird");
  localStorageState.set("boolean", "weird");
  localStorageState.set("select-hint", "yes");

  assert.deepEqual(loadRecentSearchQueries("recent"), ["first", "second"]);
  assert.deepEqual(loadSessionSearchHistory("history"), ["one", "two"]);
  assert.equal(localStorageState.get("recent"), JSON.stringify(["first", "second"]));
  assert.equal(sessionStorageState.get("history"), JSON.stringify(["one", "two"]));
  assert.equal(loadSearchEnginePreference("engine"), "duckduckgo");
  assert.equal(loadSearchOptimizationMode("opt"), "balanced");
  assert.equal(loadSearchBooleanModePreference("boolean"), "all");
  assert.equal(loadSearchSelectHintSeen("select-hint"), false);
  assert.equal(localStorageState.get("engine"), "duckduckgo");
  assert.equal(localStorageState.get("opt"), "balanced");
  assert.equal(localStorageState.get("boolean"), "all");
  assert.equal(localStorageState.get("select-hint"), "0");
});

test("search bar history loaders clear unparseable persisted arrays", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  localStorageState.set("recent-corrupt", "{bad-json");
  sessionStorageState.set("history-corrupt", "{bad-json");

  assert.deepEqual(loadRecentSearchQueries("recent-corrupt"), []);
  assert.deepEqual(loadSessionSearchHistory("history-corrupt"), []);
  assert.equal(localStorageState.has("recent-corrupt"), false);
  assert.equal(sessionStorageState.has("history-corrupt"), false);
});

test("search bar preference loaders keep supported stored values", () => {
  localStorageState.set("engine-ok", "google");
  localStorageState.set("opt-ok", "cost");
  localStorageState.set("boolean-ok", "exclude");
  localStorageState.set("select-hint-ok", "1");

  assert.equal(loadSearchEnginePreference("engine-ok"), "google");
  assert.equal(loadSearchOptimizationMode("opt-ok"), "cost");
  assert.equal(loadSearchBooleanModePreference("boolean-ok"), "exclude");
  assert.equal(loadSearchSelectHintSeen("select-hint-ok"), true);
});

test("search bar local state persists only normalized recent queries", () => {
  localStorageState.clear();
  localStorageState.set("recent-save", JSON.stringify([" first ", "", "second"]));

  const next = saveRecentSearchQuery("  second  ", "recent-save");

  assert.deepEqual(next, ["second", "first"]);
  assert.equal(
    localStorageState.get("recent-save"),
    JSON.stringify(["second", "first"]),
  );
});

test("search bar local state persists only normalized session history", () => {
  sessionStorageState.clear();

  const next = saveSessionSearchHistory([" one ", "", "two", "  "], "history-save");

  assert.deepEqual(next, ["one", "two"]);
  assert.equal(
    sessionStorageState.get("history-save"),
    JSON.stringify(["one", "two"]),
  );
});

test("search bar clear helpers remove persisted recent and session query state", () => {
  localStorageState.set("recent-clear", JSON.stringify(["first", "second"]));
  sessionStorageState.set("history-clear", JSON.stringify(["one", "two"]));

  assert.deepEqual(clearRecentSearchQueries("recent-clear"), []);
  assert.deepEqual(clearSessionSearchHistory("history-clear"), []);
  assert.equal(localStorageState.has("recent-clear"), false);
  assert.equal(sessionStorageState.has("history-clear"), false);
});

test("search bar preference writers persist only normalized supported values", () => {
  localStorageState.clear();

  assert.equal(saveSearchEnginePreference("engine-save", "bing"), "duckduckgo");
  assert.equal(saveSearchOptimizationMode("opt-save", "fast"), "balanced");
  assert.equal(saveSearchBooleanModePreference("boolean-save", "exclude"), "exclude");
  saveSearchSelectHintSeen("select-hint-save", true);

  assert.equal(localStorageState.get("engine-save"), "duckduckgo");
  assert.equal(localStorageState.get("opt-save"), "balanced");
  assert.equal(localStorageState.get("boolean-save"), "exclude");
  assert.equal(localStorageState.get("select-hint-save"), "1");
});
