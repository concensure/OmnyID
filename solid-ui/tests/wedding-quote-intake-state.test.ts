import test from "node:test";
import assert from "node:assert/strict";

import type { AfpMessage } from "../src/lib/api.ts";
import {
  weddingQuoteMessageCandidates,
  weddingQuoteMessageClassificationInput,
} from "../src/lib/weddingQuoteIntakeState.ts";

function message(overrides: Partial<AfpMessage> = {}): AfpMessage {
  return {
    id: "message-1",
    thread_id: "vendor-thread-1",
    from: "vendor://garden-room",
    to: ["user://couple"],
    timestamp: "2026-11-09T00:00:00.000Z",
    type: "vendor_message_received",
    kind: "wedding_vendor_reply",
    content: { subject: "Our venue proposal", body: "Please see the attached pricing package." },
    metadata: { vendor_name: "Garden Room" },
    attachments: [{ id: "attachment-1", name: "quote.pdf" }],
    views: [],
    references: [],
    supertags: ["wedding", "vendor"],
    ...overrides,
  };
}

test("likely vendor pricing messages can be recovered as quote candidates", () => {
  const candidates = weddingQuoteMessageCandidates([message()]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.vendorLabel, "Garden Room");
  assert.equal(candidates[0]?.alreadyClassified, false);
});

test("classification stores a source reference without copying message content", () => {
  const candidate = weddingQuoteMessageCandidates([message()])[0]!;
  const input = weddingQuoteMessageClassificationInput({
    source: candidate,
    metadata: { weddingPlanId: "plan-1", responseWorkspaceId: "workspace-1" },
    nowIso: "2026-11-09T01:00:00.000Z",
  });
  assert.equal(input.parent_id, "message-1");
  assert.deepEqual(input.references, [{ type: "afp_message", id: "message-1" }]);
  assert.equal((input.content as Record<string, unknown>).source_message_id, "message-1");
  assert.equal(JSON.stringify(input).includes("attached pricing package"), false);
  assert.equal(input.metadata?.content_copied, false);
});

test("existing quote messages are labelled rather than offered for duplicate classification", () => {
  const candidate = weddingQuoteMessageCandidates([message({ kind: "wedding_vendor_quote_received" })])[0]!;
  assert.equal(candidate.alreadyClassified, true);
});
