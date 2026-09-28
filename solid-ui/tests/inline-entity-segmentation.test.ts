import assert from "node:assert/strict";
import test from "node:test";

import { splitTextIntoInlineEntitySegments, type InlineEntityDescriptor } from "../src/lib/inlineEntitySegmentation.ts";

test("splitTextIntoInlineEntitySegments respects explicit entity ranges", () => {
  const text = "Meet Alice on 2026-07-20";
  const entities: InlineEntityDescriptor[] = [
    { kind: "person", start: 5, end: 10, value: "Alice" },
  ];

  const segments = splitTextIntoInlineEntitySegments(text, entities);

  assert.deepEqual(segments, [
    { type: "text", value: "Meet " },
    {
      type: "entity",
      match: { start: 5, end: 10, kind: "person", text: "Alice", value: "Alice", metadata: undefined },
    },
    {
      type: "text",
      value: " on ",
    },
    {
      type: "entity",
      match: { start: 14, end: 24, kind: "date", text: "2026-07-20", value: "2026-07-20" },
    },
  ]);
});

test("splitTextIntoInlineEntitySegments falls back to entity text search in order", () => {
  const text = "Invoice INV-123 is for Bob";
  const entities: InlineEntityDescriptor[] = [
    { kind: "invoice", text: "INV-123" },
    { kind: "person", text: "Bob", value: "Robert" },
  ];

  const segments = splitTextIntoInlineEntitySegments(text, entities);
  const entityMatches = segments.filter((segment) => segment.type === "entity");

  assert.deepEqual(entityMatches, [
    {
      type: "entity",
      match: { start: 8, end: 15, kind: "invoice", text: "INV-123", value: "INV-123", metadata: undefined },
    },
    {
      type: "entity",
      match: { start: 23, end: 26, kind: "person", text: "Bob", value: "Robert", metadata: undefined },
    },
  ]);
});

test("splitTextIntoInlineEntitySegments dedupes overlapping explicit and heuristic matches", () => {
  const text = "Call +61 400 123 456 today";
  const entities: InlineEntityDescriptor[] = [
    { kind: "phone", text: "+61 400 123 456" },
  ];

  const segments = splitTextIntoInlineEntitySegments(text, entities);

  assert.equal(segments.filter((segment) => segment.type === "entity").length, 1);
  assert.deepEqual(segments[1], {
    type: "entity",
    match: {
      start: 5,
      end: 20,
      kind: "phone",
      text: "+61 400 123 456",
      value: "+61 400 123 456",
      metadata: undefined,
    },
  });
});
