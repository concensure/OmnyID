import test from "node:test";
import assert from "node:assert/strict";

import {
  loadNoteSnapshots,
  recordNoteSnapshot,
} from "../src/lib/noteHistoryLocalState.ts";

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

test("note history local state filters malformed stored snapshots", () => {
  localStorageState.set(
    "omnyid.note.history.note-1",
    JSON.stringify([
      { ts: " 2026-07-19T12:00:00.000Z ", content: "first" },
      { ts: "", content: "blank ts" },
      { ts: "2026-07-19T12:01:00.000Z", content: 7 },
    ]),
  );

  assert.deepEqual(loadNoteSnapshots("note-1"), [
    { ts: "2026-07-19T12:00:00.000Z", content: "first" },
  ]);
  assert.equal(
    localStorageState.get("omnyid.note.history.note-1"),
    JSON.stringify([{ ts: "2026-07-19T12:00:00.000Z", content: "first" }]),
  );
});

test("note history local state clears unparseable persisted snapshots", () => {
  localStorageState.set("omnyid.note.history.note-bad", "{bad-json");

  assert.deepEqual(loadNoteSnapshots("note-bad"), []);
  assert.equal(localStorageState.has("omnyid.note.history.note-bad"), false);
});

test("note history local state persists normalized snapshots and caps history", () => {
  localStorageState.set(
    "omnyid.note.history.note-2",
    JSON.stringify(
      Array.from({ length: 20 }, (_, index) => ({
        ts: `2026-07-19T12:${String(index).padStart(2, "0")}:00.000Z`,
        content: `snapshot-${index}`,
      })),
    ),
  );

  recordNoteSnapshot("note-2", "latest");

  const stored = JSON.parse(localStorageState.get("omnyid.note.history.note-2") ?? "null");
  assert.equal(Array.isArray(stored), true);
  assert.equal(stored.length, 20);
  assert.equal(stored[0].content, "latest");
  assert.equal(stored[19].content, "snapshot-18");
});
