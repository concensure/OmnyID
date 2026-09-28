import test from "node:test";
import assert from "node:assert/strict";

import {
  applyFontBodyPreference,
  fontBodyStack,
  loadFontBodyPreference,
  saveFontBodyPreference,
} from "../src/lib/fontBodyPreference.ts";

test("loadFontBodyPreference defaults to Default", () => {
  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  } as Storage;

  assert.equal(loadFontBodyPreference(), "Default");

  globalThis.localStorage = originalLocalStorage;
});

test("loadFontBodyPreference rewrites malformed stored values", () => {
  const state = new Map<string, string>([["omnyid.appearance.font-body", "Serif"]]);
  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key: string) => state.get(key) ?? null,
    setItem: (key: string, value: string) => {
      state.set(key, value);
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  } as Storage;

  assert.equal(loadFontBodyPreference(), "Default");
  assert.equal(state.get("omnyid.appearance.font-body"), "Default");

  globalThis.localStorage = originalLocalStorage;
});

test("fontBodyStack maps both appearance modes", () => {
  assert.equal(fontBodyStack("Default"), "Inter, system-ui, sans-serif");
  assert.equal(fontBodyStack("Readable"), "\"Atkinson Hyperlegible\", Inter, system-ui, sans-serif");
});

test("saveFontBodyPreference persists and applies the selected stack", () => {
  const writes: Array<[string, string]> = [];
  const htmlStyle = new Map<string, string>();
  const bodyStyle = new Map<string, string>();
  const originalLocalStorage = globalThis.localStorage;
  const originalDocument = globalThis.document;

  globalThis.localStorage = {
    getItem: () => null,
    setItem: (key: string, value: string) => {
      writes.push([key, value]);
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  } as Storage;

  globalThis.document = {
    documentElement: {
      style: {
        setProperty: (key: string, value: string) => {
          htmlStyle.set(key, value);
        },
      },
    },
    body: {
      style: {
        setProperty: (key: string, value: string) => {
          bodyStyle.set(key, value);
        },
      },
    },
  } as Document;

  saveFontBodyPreference("Readable");

  assert.deepEqual(writes, [["omnyid.appearance.font-body", "Readable"]]);
  assert.equal(htmlStyle.get("--font-body"), "\"Atkinson Hyperlegible\", Inter, system-ui, sans-serif");
  assert.equal(bodyStyle.get("--font-body"), "\"Atkinson Hyperlegible\", Inter, system-ui, sans-serif");

  globalThis.localStorage = originalLocalStorage;
  globalThis.document = originalDocument;
});

test("applyFontBodyPreference skips gracefully when document is unavailable", () => {
  const originalDocument = globalThis.document;
  // @ts-expect-error intentional environment simulation
  delete globalThis.document;

  assert.doesNotThrow(() => applyFontBodyPreference("Readable"));

  globalThis.document = originalDocument;
});
