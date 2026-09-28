import assert from "node:assert/strict";
import test from "node:test";

import {
  formatEditorDatetime,
  loadEditorDatetimePreference,
  readEditorDatetimePreferenceEventDetail,
  saveEditorDatetimePreference,
  type EditorDatetimePreference,
} from "../src/lib/editorDatetimePreference.ts";

const localStorageState = new Map<string, string>();
const dispatchedEvents: Event[] = [];

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
  window: {
    dispatchEvent(event: Event) {
      dispatchedEvents.push(event);
      return true;
    },
  },
  CustomEvent: class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) {
      super(type);
      this.detail = init?.detail as T;
    }
  },
});

test.beforeEach(() => {
  localStorageState.clear();
  dispatchedEvents.length = 0;
});

test("loadEditorDatetimePreference defaults to locale formatting", () => {
  assert.deepEqual(loadEditorDatetimePreference(), {
    format: "locale",
    customPattern: "YYYY-MM-DD HH:mm",
  });
});

test("loadEditorDatetimePreference rewrites dirty preferences and clears corrupt storage", () => {
  localStorageState.set(
    "omnyid.editor.datetime_preference",
    JSON.stringify({ format: "custom", customPattern: "" }),
  );

  assert.deepEqual(loadEditorDatetimePreference(), {
    format: "custom",
    customPattern: "YYYY-MM-DD HH:mm",
  });
  assert.equal(
    localStorageState.get("omnyid.editor.datetime_preference"),
    JSON.stringify({ format: "custom", customPattern: "YYYY-MM-DD HH:mm" }),
  );

  localStorageState.set("omnyid.editor.datetime_preference", "{bad-json");
  assert.deepEqual(loadEditorDatetimePreference(), {
    format: "locale",
    customPattern: "YYYY-MM-DD HH:mm",
  });
  assert.equal(localStorageState.has("omnyid.editor.datetime_preference"), false);
});

test("saveEditorDatetimePreference normalizes and dispatches preference changes", () => {
  const preference: EditorDatetimePreference = { format: "custom", customPattern: "YYYY/MM/DD HH:mm:ss" };
  saveEditorDatetimePreference(preference);

  assert.deepEqual(loadEditorDatetimePreference(), preference);
  assert.equal(dispatchedEvents.length, 1);
  assert.deepEqual(readEditorDatetimePreferenceEventDetail(dispatchedEvents[0]!), preference);
});

test("formatEditorDatetime renders ISO and custom patterns deterministically", () => {
  const date = new Date(2026, 6, 2, 3, 4, 5);

  assert.equal(
    formatEditorDatetime(date, { format: "iso", customPattern: "ignored" }),
    date.toISOString(),
  );
  assert.equal(
    formatEditorDatetime(date, { format: "custom", customPattern: "YYYY-MM-DD HH:mm:ss" }),
    "2026-07-02 03:04:05",
  );
});

test("formatEditorDatetime routes locale formatting through the shared surface formatter", () => {
  assert.equal(
    formatEditorDatetime(new Date("2026-09-01T04:05:00.000Z"), {
      format: "locale",
      customPattern: "ignored",
    }),
    "Sep 1, 2026, 2:05 PM",
  );
});

test("readEditorDatetimePreferenceEventDetail rejects non-custom events", () => {
  assert.equal(readEditorDatetimePreferenceEventDetail(new Event("plain")), null);
});

test("readEditorDatetimePreferenceEventDetail accepts only valid normalized preference payloads", () => {
  assert.deepEqual(
    readEditorDatetimePreferenceEventDetail(new CustomEvent("x", {
      detail: { format: "iso", customPattern: "YYYY-MM-DD HH:mm" },
    })),
    { format: "iso", customPattern: "YYYY-MM-DD HH:mm" },
  );
  assert.equal(
    readEditorDatetimePreferenceEventDetail(new CustomEvent("x", {
      detail: { format: "invalid", customPattern: "YYYY-MM-DD HH:mm" },
    })),
    null,
  );
  assert.equal(
    readEditorDatetimePreferenceEventDetail(new CustomEvent("x", {
      detail: { format: "locale", customPattern: "" },
    })),
    null,
  );
  assert.equal(
    readEditorDatetimePreferenceEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
});
