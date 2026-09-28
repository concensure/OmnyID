import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeThreadRelatedContextItem,
  normalizeThreadRelatedContextResponse,
} from "../src/lib/threadRelatedContextState.ts";

test("normalizeThreadRelatedContextResponse filters malformed rows and derives labels", () => {
  assert.deepEqual(normalizeThreadRelatedContextResponse({
    messages: [
      { id: "msg_1", type: "knowledge_card", content: { claim: "Important claim" } },
      { id: 2, type: "", content: { title: 123 } },
      { id: "msg_3", type: "note", content: { text: false } },
      { type: "missing id", content: { claim: "Bad" } },
    ],
  }, 2), [
    { id: "msg_1", type: "knowledge_card", label: "Important claim" },
    { id: "2", type: "knowledge_card", label: "123" },
  ]);
});

test("normalizeThreadRelatedContextItem falls back to item type as label", () => {
  assert.deepEqual(normalizeThreadRelatedContextItem({
    id: "msg_4",
    type: "reference",
    content: { claim: "", title: "", text: "" },
  }), {
    id: "msg_4",
    type: "reference",
    label: "reference",
  });
});

test("normalizeThreadRelatedContextItem rejects records without a stable id", () => {
  assert.equal(normalizeThreadRelatedContextItem({ type: "knowledge_card" }), null);
});
