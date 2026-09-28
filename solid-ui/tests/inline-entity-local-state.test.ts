import test from "node:test";
import assert from "node:assert/strict";

import {
  INLINE_ENTITY_ICONS_KEY,
  INLINE_ENTITY_PRODUCT_LINK_PREFERENCE_KEY,
  loadInlineEntityIconsEnabled,
  loadProductLinkPreference,
} from "../src/lib/inlineEntityLocalState.ts";

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

test("inline entity local state falls back to normalized default preferences", () => {
  localStorageState.set(INLINE_ENTITY_PRODUCT_LINK_PREFERENCE_KEY, "etsy");
  localStorageState.set(INLINE_ENTITY_ICONS_KEY, "true");

  assert.equal(loadProductLinkPreference(), "amazon");
  assert.equal(loadInlineEntityIconsEnabled(), true);
  assert.equal(localStorageState.get(INLINE_ENTITY_PRODUCT_LINK_PREFERENCE_KEY), "amazon");
  assert.equal(localStorageState.get(INLINE_ENTITY_ICONS_KEY), "1");
});

test("inline entity local state keeps supported retailer preferences and explicit icon opt-out", () => {
  localStorageState.set(INLINE_ENTITY_PRODUCT_LINK_PREFERENCE_KEY, "google-shopping");
  localStorageState.set(INLINE_ENTITY_ICONS_KEY, "0");

  assert.equal(loadProductLinkPreference(), "google-shopping");
  assert.equal(loadInlineEntityIconsEnabled(), false);
});
