import test from "node:test";
import assert from "node:assert/strict";

import {
  loadViewCustomizerBg,
  loadViewCustomizerCards,
  saveViewCustomizerBg,
  saveViewCustomizerCards,
} from "../src/lib/viewCustomizerLocalState.ts";

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

test("view customizer local state normalizes stored background urls and card rows", () => {
  localStorageState.set("omnyid.view.bg.note", "  https://example.test/bg.png  ");
  localStorageState.set(
    "omnyid.view.cards.note",
    JSON.stringify([
      { id: " card-1 ", x: 120, y: 80, personaTone: " calm " },
      { id: "", x: 20, y: 30 },
      { id: "card-2", x: "left", y: 40 },
    ]),
  );

  assert.equal(loadViewCustomizerBg("note"), "https://example.test/bg.png");
  assert.deepEqual(loadViewCustomizerCards("note"), [
    { id: "card-1", x: 120, y: 80, personaTone: "calm" },
  ]);
  assert.equal(localStorageState.get("omnyid.view.bg.note"), "https://example.test/bg.png");
  assert.equal(
    localStorageState.get("omnyid.view.cards.note"),
    JSON.stringify([{ id: "card-1", x: 120, y: 80, personaTone: "calm" }]),
  );
});

test("view customizer local state loaders clear empty and unparseable persisted values", () => {
  localStorageState.set("omnyid.view.bg.search", "   ");
  localStorageState.set("omnyid.view.cards.search", "{bad-json");

  assert.equal(loadViewCustomizerBg("search"), null);
  assert.deepEqual(loadViewCustomizerCards("search"), []);
  assert.equal(localStorageState.has("omnyid.view.bg.search"), false);
  assert.equal(localStorageState.has("omnyid.view.cards.search"), false);
});

test("view customizer local state writers persist only normalized values", () => {
  saveViewCustomizerBg("note", "  https://example.test/bg.png  ");
  saveViewCustomizerCards("note", [
    { id: " card-1 ", x: 120, y: 80, personaTone: " calm " },
    { id: "", x: 20, y: 30 } as never,
    { id: "card-2", x: Number.NaN, y: 40 } as never,
  ]);

  assert.equal(localStorageState.get("omnyid.view.bg.note"), "https://example.test/bg.png");
  assert.equal(
    localStorageState.get("omnyid.view.cards.note"),
    JSON.stringify([{ id: "card-1", x: 120, y: 80, personaTone: "calm" }]),
  );

  saveViewCustomizerBg("note", null);
  assert.equal(localStorageState.has("omnyid.view.bg.note"), false);
});
