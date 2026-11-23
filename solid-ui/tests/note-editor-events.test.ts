import test from "node:test";
import assert from "node:assert/strict";

import {
  readNoteRestoreVersionEventDetail,
  readNoteTitleUpdateEventDetail,
} from "../src/lib/noteEditorEvents.ts";

test("readNoteTitleUpdateEventDetail accepts only string id and title payloads", () => {
  assert.deepEqual(
    readNoteTitleUpdateEventDetail(new CustomEvent("x", {
      detail: { id: "note-1", title: "Revised title" },
    })),
    { id: "note-1", title: "Revised title" },
  );
  assert.equal(
    readNoteTitleUpdateEventDetail(new CustomEvent("x", {
      detail: { id: 7, title: "Revised title" },
    })),
    null,
  );
  assert.equal(
    readNoteTitleUpdateEventDetail(new CustomEvent("x", {
      detail: { id: "note-1", title: 7 },
    })),
    null,
  );
  assert.equal(
    readNoteTitleUpdateEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readNoteTitleUpdateEventDetail(new Event("x")),
    null,
  );
});

test("readNoteRestoreVersionEventDetail accepts only string id and content payloads", () => {
  assert.deepEqual(
    readNoteRestoreVersionEventDetail(new CustomEvent("x", {
      detail: { id: "note-1", content: "restored markdown" },
    })),
    { id: "note-1", content: "restored markdown" },
  );
  assert.equal(
    readNoteRestoreVersionEventDetail(new CustomEvent("x", {
      detail: { id: 7, content: "restored markdown" },
    })),
    null,
  );
  assert.equal(
    readNoteRestoreVersionEventDetail(new CustomEvent("x", {
      detail: { id: "note-1", content: 7 },
    })),
    null,
  );
  assert.equal(
    readNoteRestoreVersionEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readNoteRestoreVersionEventDetail(new Event("x")),
    null,
  );
});
