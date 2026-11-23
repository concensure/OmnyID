import test from "node:test";
import assert from "node:assert/strict";

import {
  clampTableColumnWidth,
  loadTableColumnDisplayModes,
  loadTableColumnWidths,
  saveTableColumnDisplayModes,
  saveTableColumnWidths,
  tableColumnDisplayStorageKey,
  tableColumnWidthStorageKey,
} from "../src/lib/tableRendererLocalState.ts";

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

test("table renderer local state builds scoped storage keys", () => {
  assert.equal(
    tableColumnDisplayStorageKey("thread-1"),
    "omnyid.table.columnDisplay.thread-1",
  );
  assert.equal(
    tableColumnWidthStorageKey("thread-1"),
    "omnyid.table.columnWidth.thread-1",
  );
});

test("table renderer local state loaders filter malformed display modes and clamp widths", () => {
  localStorageState.set(
    "omnyid.table.columnDisplay.thread-1",
    JSON.stringify({
      title: "wrap",
      amount: "truncate",
      invalid: "grid",
    }),
  );
  localStorageState.set(
    "omnyid.table.columnWidth.thread-1",
    JSON.stringify({
      title: 99,
      amount: 901,
      notes: 240.4,
      invalid: "wide",
    }),
  );

  assert.deepEqual(loadTableColumnDisplayModes("omnyid.table.columnDisplay.thread-1"), {
    title: "wrap",
    amount: "truncate",
  });
  assert.deepEqual(loadTableColumnWidths("omnyid.table.columnWidth.thread-1"), {
    title: 120,
    amount: 720,
    notes: 240,
  });
  assert.equal(
    localStorageState.get("omnyid.table.columnDisplay.thread-1"),
    JSON.stringify({ title: "wrap", amount: "truncate" }),
  );
  assert.equal(
    localStorageState.get("omnyid.table.columnWidth.thread-1"),
    JSON.stringify({ title: 120, amount: 720, notes: 240 }),
  );
});

test("table renderer local state loaders clear unparseable json buckets", () => {
  localStorageState.set("omnyid.table.columnDisplay.corrupt", "{bad-json");
  localStorageState.set("omnyid.table.columnWidth.corrupt", "{bad-json");

  assert.deepEqual(loadTableColumnDisplayModes("omnyid.table.columnDisplay.corrupt"), {});
  assert.deepEqual(loadTableColumnWidths("omnyid.table.columnWidth.corrupt"), {});
  assert.equal(localStorageState.has("omnyid.table.columnDisplay.corrupt"), false);
  assert.equal(localStorageState.has("omnyid.table.columnWidth.corrupt"), false);
});

test("table renderer local state writers persist only normalized display modes and widths", () => {
  const normalizedModes = saveTableColumnDisplayModes("omnyid.table.columnDisplay.thread-2", {
    title: "wrap",
    amount: "truncate",
    invalid: "grid" as never,
  });
  const normalizedWidths = saveTableColumnWidths("omnyid.table.columnWidth.thread-2", {
    title: 119,
    amount: 721,
    notes: 240.6,
    invalid: Number.NaN,
  });

  assert.deepEqual(normalizedModes, {
    title: "wrap",
    amount: "truncate",
  });
  assert.deepEqual(normalizedWidths, {
    title: 120,
    amount: 720,
    notes: 241,
  });
  assert.equal(
    localStorageState.get("omnyid.table.columnDisplay.thread-2"),
    JSON.stringify(normalizedModes),
  );
  assert.equal(
    localStorageState.get("omnyid.table.columnWidth.thread-2"),
    JSON.stringify(normalizedWidths),
  );
});

test("table renderer local state width clamp keeps values inside supported bounds", () => {
  assert.equal(clampTableColumnWidth(50), 120);
  assert.equal(clampTableColumnWidth(240.4), 240);
  assert.equal(clampTableColumnWidth(1000), 720);
});
