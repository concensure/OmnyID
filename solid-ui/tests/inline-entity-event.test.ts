import test from "node:test";
import assert from "node:assert/strict";

import { readOpenInlineEntityEventDetail } from "../src/lib/inlineEntityEvent.ts";

test("readOpenInlineEntityEventDetail accepts only valid inline entity payloads", () => {
  assert.deepEqual(
    readOpenInlineEntityEventDetail(new CustomEvent("x", {
      detail: {
        kind: "person",
        text: "Ada Lovelace",
        value: "Ada Lovelace",
        metadata: { source: "note" },
      },
    })),
    {
      kind: "person",
      text: "Ada Lovelace",
      value: "Ada Lovelace",
      metadata: { source: "note" },
    },
  );
  assert.equal(
    readOpenInlineEntityEventDetail(new CustomEvent("x", {
      detail: {
        kind: 7,
        text: "Ada Lovelace",
        value: "Ada Lovelace",
        metadata: {},
      },
    })),
    null,
  );
  assert.equal(
    readOpenInlineEntityEventDetail(new CustomEvent("x", {
      detail: {
        kind: "person",
        text: "Ada Lovelace",
        value: "Ada Lovelace",
        metadata: [],
      },
    })),
    null,
  );
  assert.equal(
    readOpenInlineEntityEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readOpenInlineEntityEventDetail(new Event("x")),
    null,
  );
});
