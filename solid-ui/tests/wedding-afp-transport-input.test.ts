import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAfpTransportInput } from "@/lib/api";

test("normalizes readable wedding AFP identifiers without losing their logical references", () => {
  const normalized = normalizeAfpTransportInput({
    id: "afp-wedding-custom-note",
    thread_id: "wedding_custom_surface:workspace-42",
    from: "omnyid:wedding",
    to: [],
    type: "wedding_custom_surface_item",
    content: { title: "Wedding vision note" },
  });

  assert.match(normalized.id ?? "", /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.match(normalized.thread_id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.equal(normalized.metadata?.logical_message_id, "afp-wedding-custom-note");
  assert.equal(normalized.metadata?.logical_thread_id, "wedding_custom_surface:workspace-42");
  assert.ok(normalized.timestamp);
});

test("keeps valid AFP transport identifiers untouched", () => {
  const input = {
    id: "01J00000000000000000000000",
    thread_id: "01J11111111111111111111111",
    timestamp: "2026-10-14T00:00:00.000Z",
    from: "omnyid:wedding",
    to: [],
    type: "wedding_note",
    content: { note: "hello" },
  };
  assert.deepEqual(normalizeAfpTransportInput(input), input);
});
