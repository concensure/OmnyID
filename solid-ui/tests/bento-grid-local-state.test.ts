import test from "node:test";
import assert from "node:assert/strict";

import {
  bentoTileEnabledStorageKey,
  BENTO_LAYOUT_KEY,
  clearBentoGridLayout,
  clearBentoTileEnabled,
  loadHiddenBentoTileIds,
  loadBentoGridLayoutState,
  saveBentoTileEnabled,
  saveBentoGridLayout,
} from "../src/lib/bentoGridLocalState.ts";

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

const DEFAULT_TILES = [
  { id: "t-chat", viewId: "search", colSpan: 3, rowSpan: 2 },
  { id: "t-email", viewId: "email", colSpan: 2, rowSpan: 1 },
] as const;

test("loadBentoGridLayoutState keeps only valid saved tile rows", () => {
  localStorageState.set(
    BENTO_LAYOUT_KEY,
    JSON.stringify([
      { id: " t-chat ", viewId: "search", colSpan: 3, rowSpan: 2, displayMode: "compact" },
      { id: "bad-view", viewId: "missing_view", colSpan: 2, rowSpan: 1 },
      { id: "bad-span", viewId: "email", colSpan: "2", rowSpan: 1 },
      { id: "t-note", viewId: "note", colSpan: 1, rowSpan: 1, bgKey: " blue ", bgImage: " https://example.test/tile.png " },
      7,
    ]),
  );

  assert.deepEqual(loadBentoGridLayoutState([...DEFAULT_TILES]), {
    hasSavedLayout: true,
    tiles: [
      { id: "t-chat", viewId: "search", colSpan: 3, rowSpan: 2, displayMode: "compact" },
      { id: "t-note", viewId: "note", colSpan: 1, rowSpan: 1, bgKey: "blue", bgImage: "https://example.test/tile.png" },
    ],
  });
  assert.equal(
    localStorageState.get(BENTO_LAYOUT_KEY),
    JSON.stringify([
      { id: "t-chat", viewId: "search", colSpan: 3, rowSpan: 2, displayMode: "compact" },
      { id: "t-note", viewId: "note", colSpan: 1, rowSpan: 1, bgKey: "blue", bgImage: "https://example.test/tile.png" },
    ]),
  );
});

test("loadBentoGridLayoutState falls back to defaults when saved rows are unusable", () => {
  localStorageState.set(BENTO_LAYOUT_KEY, JSON.stringify([{ id: "", viewId: "search", colSpan: 3, rowSpan: 2 }]));

  assert.deepEqual(loadBentoGridLayoutState([...DEFAULT_TILES]), {
    hasSavedLayout: false,
    tiles: [...DEFAULT_TILES],
  });
  assert.equal(localStorageState.has(BENTO_LAYOUT_KEY), false);
});

test("loadBentoGridLayoutState clears unparseable saved layouts", () => {
  localStorageState.set(BENTO_LAYOUT_KEY, "{bad-json");

  assert.deepEqual(loadBentoGridLayoutState([...DEFAULT_TILES]), {
    hasSavedLayout: false,
    tiles: [...DEFAULT_TILES],
  });
  assert.equal(localStorageState.has(BENTO_LAYOUT_KEY), false);
});

test("saveBentoGridLayout persists only normalized tile rows", () => {
  saveBentoGridLayout([
    { id: " t-chat ", viewId: "search", colSpan: 3, rowSpan: 2, displayMode: "compact" },
    { id: "", viewId: "email", colSpan: 2, rowSpan: 1 },
    { id: "t-note", viewId: "note", colSpan: 1, rowSpan: 1, bgKey: " blue " },
  ]);

  assert.deepEqual(JSON.parse(localStorageState.get(BENTO_LAYOUT_KEY) ?? "null"), [
    { id: "t-chat", viewId: "search", colSpan: 3, rowSpan: 2, displayMode: "compact" },
    { id: "t-note", viewId: "note", colSpan: 1, rowSpan: 1, bgKey: "blue" },
  ]);
});

test("clearBentoGridLayout removes the saved layout key", () => {
  localStorageState.set(BENTO_LAYOUT_KEY, JSON.stringify(DEFAULT_TILES));

  clearBentoGridLayout();

  assert.equal(localStorageState.has(BENTO_LAYOUT_KEY), false);
});

test("bento tile enabled state keeps only explicitly hidden tile ids", () => {
  localStorageState.set(bentoTileEnabledStorageKey("t-chat"), "0");
  localStorageState.set(bentoTileEnabledStorageKey("t-email"), "1");
  localStorageState.set(bentoTileEnabledStorageKey("t-note"), "false");

  assert.deepEqual(
    [...loadHiddenBentoTileIds(["t-chat", "t-email", "t-note"])],
    ["t-chat"],
  );
  assert.equal(localStorageState.get(bentoTileEnabledStorageKey("t-note")), "1");
});

test("bento tile enabled state persists explicit enabled and hidden flags", () => {
  localStorageState.clear();

  saveBentoTileEnabled("t-chat", true);
  saveBentoTileEnabled("t-email", false);

  assert.equal(localStorageState.get(bentoTileEnabledStorageKey("t-chat")), "1");
  assert.equal(localStorageState.get(bentoTileEnabledStorageKey("t-email")), "0");

  clearBentoTileEnabled("t-chat");
  assert.equal(localStorageState.has(bentoTileEnabledStorageKey("t-chat")), false);
});
