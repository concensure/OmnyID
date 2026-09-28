import test from "node:test";
import assert from "node:assert/strict";

import {
  loadVimNavigationEnabled,
  readVimNavigationPreferenceEventDetail,
  saveVimNavigationEnabled,
  subscribeVimNavigationPreference,
  VIM_NAVIGATION_PREFERENCE_KEY,
} from "../src/lib/vimNavigationPreference.ts";
import {
  loadParaViewPreference,
  normalizeParaViewSelection,
  PARA_VIEW_PREFERENCE_KEY,
  PARA_VIEW_PREFERENCE_CHANGED_EVENT,
  readParaViewPreferenceEventDetail,
  saveParaViewPreference,
  subscribeParaViewPreference,
} from "../src/lib/paraViewPreference.ts";

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

test("loadVimNavigationEnabled defaults to disabled", () => {
  localStorageState.delete(VIM_NAVIGATION_PREFERENCE_KEY);
  assert.equal(loadVimNavigationEnabled(), false);
});

test("loadVimNavigationEnabled rewrites malformed stored values", () => {
  localStorageState.set(VIM_NAVIGATION_PREFERENCE_KEY, "yes");
  assert.equal(loadVimNavigationEnabled(), false);
  assert.equal(localStorageState.get(VIM_NAVIGATION_PREFERENCE_KEY), "0");
});

test("loadVimNavigationEnabled reads enabled flag from local storage", () => {
  localStorageState.set(VIM_NAVIGATION_PREFERENCE_KEY, "1");
  assert.equal(loadVimNavigationEnabled(), true);
});

test("readVimNavigationPreferenceEventDetail returns only boolean event payloads", () => {
  assert.equal(
    readVimNavigationPreferenceEventDetail(new CustomEvent("x", { detail: { enabled: true } })),
    true,
  );
  assert.equal(
    readVimNavigationPreferenceEventDetail(new CustomEvent("x", { detail: { enabled: "yes" } })),
    null,
  );
  assert.equal(
    readVimNavigationPreferenceEventDetail(new CustomEvent("x", { detail: null })),
    null,
  );
  assert.equal(
    readVimNavigationPreferenceEventDetail(new Event("x")),
    null,
  );
});

test("subscribeVimNavigationPreference reacts to helper event payloads and unsubscribes cleanly", () => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const originalWindow = globalThis.window;
  const seen: boolean[] = [];

  Object.assign(globalThis, {
    window: {
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener !== "function") return;
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener as (event: Event) => void);
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener !== "function") return;
        listeners.get(type)?.delete(listener as (event: Event) => void);
      },
      dispatchEvent(event: Event) {
        for (const listener of listeners.get(event.type) ?? []) listener(event);
        return true;
      },
      localStorage: globalThis.localStorage,
    },
  });

  try {
    const unsubscribe = subscribeVimNavigationPreference((enabled) => {
      seen.push(enabled);
    }, window as unknown as Window);

    saveVimNavigationEnabled(true);
    window.dispatchEvent(new CustomEvent("omnyid:keyboard-vim-navigation", { detail: { enabled: "yes" } }));

    assert.deepEqual(seen, [true]);

    unsubscribe();
    saveVimNavigationEnabled(false);
    assert.deepEqual(seen, [true]);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("loadParaViewPreference defaults to enabled and reads local storage flags", () => {
  localStorageState.delete(PARA_VIEW_PREFERENCE_KEY);
  assert.equal(loadParaViewPreference(), true);

  localStorageState.set(PARA_VIEW_PREFERENCE_KEY, "0");
  assert.equal(loadParaViewPreference(), false);

  localStorageState.set(PARA_VIEW_PREFERENCE_KEY, "1");
  assert.equal(loadParaViewPreference(), true);
});

test("loadParaViewPreference rewrites malformed stored values to enabled", () => {
  localStorageState.set(PARA_VIEW_PREFERENCE_KEY, "true");
  assert.equal(loadParaViewPreference(), true);
  assert.equal(localStorageState.get(PARA_VIEW_PREFERENCE_KEY), "1");
});

test("saveParaViewPreference persists the flag and dispatches a boolean event payload", () => {
  const originalWindow = globalThis.window;
  const dispatched: Event[] = [];

  Object.assign(globalThis, {
    window: {
      dispatchEvent(event: Event) {
        dispatched.push(event);
        return true;
      },
    },
  });

  saveParaViewPreference(false);

  assert.equal(localStorageState.get(PARA_VIEW_PREFERENCE_KEY), "0");
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]?.type, PARA_VIEW_PREFERENCE_CHANGED_EVENT);
  assert.equal(readParaViewPreferenceEventDetail(dispatched[0]!), false);

  globalThis.window = originalWindow;
});

test("readParaViewPreferenceEventDetail returns only boolean event payloads", () => {
  assert.equal(
    readParaViewPreferenceEventDetail(new CustomEvent("x", { detail: { enabled: true } })),
    true,
  );
  assert.equal(
    readParaViewPreferenceEventDetail(new CustomEvent("x", { detail: { enabled: "yes" } })),
    null,
  );
  assert.equal(
    readParaViewPreferenceEventDetail(new CustomEvent("x", { detail: null })),
    null,
  );
  assert.equal(
    readParaViewPreferenceEventDetail(new Event("x")),
    null,
  );
});

test("subscribeParaViewPreference reacts to helper event payloads and storage sync, then unsubscribes cleanly", () => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const originalWindow = globalThis.window;
  const seen: boolean[] = [];

  Object.assign(globalThis, {
    window: {
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener !== "function") return;
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener as (event: Event) => void);
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener !== "function") return;
        listeners.get(type)?.delete(listener as (event: Event) => void);
      },
      dispatchEvent(event: Event) {
        for (const listener of listeners.get(event.type) ?? []) listener(event);
        return true;
      },
      localStorage: globalThis.localStorage,
    },
  });

  try {
    const unsubscribe = subscribeParaViewPreference((enabled) => {
      seen.push(enabled);
    }, window as unknown as Window);

    window.dispatchEvent(new CustomEvent(PARA_VIEW_PREFERENCE_CHANGED_EVENT, { detail: { enabled: false } }));
    localStorageState.set(PARA_VIEW_PREFERENCE_KEY, "1");
    for (const listener of listeners.get("storage") ?? []) listener({ type: "storage", key: PARA_VIEW_PREFERENCE_KEY } as StorageEvent);

    assert.deepEqual(seen, [false, true]);

    unsubscribe();
    window.dispatchEvent(new CustomEvent(PARA_VIEW_PREFERENCE_CHANGED_EVENT, { detail: { enabled: false } }));
    assert.deepEqual(seen, [false, true]);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("normalizeParaViewSelection falls back to home only when PARA is disabled", () => {
  assert.equal(normalizeParaViewSelection("para", false), "home");
  assert.equal(normalizeParaViewSelection("para", true), "para");
  assert.equal(normalizeParaViewSelection("search", false), "search");
});
