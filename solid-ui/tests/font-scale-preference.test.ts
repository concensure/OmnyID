import test from "node:test";
import assert from "node:assert/strict";

import {
  applyFontScalePreference,
  fontScalePixels,
  loadFontScalePreference,
  saveFontScalePreference,
} from "../src/lib/fontScalePreference.ts";

test("loadFontScalePreference defaults to medium", () => {
  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  } as Storage;

  assert.equal(loadFontScalePreference(), "M");

  globalThis.localStorage = originalLocalStorage;
});

test("loadFontScalePreference rewrites malformed stored values", () => {
  const state = new Map<string, string>([["omnyid.appearance.font-scale", "XXL"]]);
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

  assert.equal(loadFontScalePreference(), "M");
  assert.equal(state.get("omnyid.appearance.font-scale"), "M");

  globalThis.localStorage = originalLocalStorage;
});

test("fontScalePixels maps the supported sizes", () => {
  assert.equal(fontScalePixels("S"), "15px");
  assert.equal(fontScalePixels("M"), "16px");
  assert.equal(fontScalePixels("L"), "17px");
  assert.equal(fontScalePixels("XL"), "18px");
});

test("saveFontScalePreference persists and applies the selected scale", () => {
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

  saveFontScalePreference("XL");

  assert.deepEqual(writes, [["omnyid.appearance.font-scale", "XL"]]);
  assert.equal(htmlStyle.get("--base-font-size"), "18px");
  assert.equal(bodyStyle.get("--base-font-size"), "18px");

  globalThis.localStorage = originalLocalStorage;
  globalThis.document = originalDocument;
});

test("applyFontScalePreference skips gracefully when document is unavailable", () => {
  const originalDocument = globalThis.document;
  // @ts-expect-error intentional environment simulation
  delete globalThis.document;

  assert.doesNotThrow(() => applyFontScalePreference("L"));

  globalThis.document = originalDocument;
});
