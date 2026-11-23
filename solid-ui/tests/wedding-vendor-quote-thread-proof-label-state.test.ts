import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "@/lib/api";
import { buildWeddingVendorQuoteThreadProofMessageState } from "@/lib/weddingVendorQuoteThreadProofState";

function message(overrides: Partial<AfpMessage> = {}): AfpMessage {
  return {
    id: "msg-1",
    thread_id: "thread-1",
    from: "agent://wedding",
    timestamp: "2026-09-27T01:02:03.000Z",
    type: "approval_receipt",
    kind: "receipt",
    content: {
      external_id: "gmail-msg-noisy-labels",
      markdown: "Sent.",
    },
    views: [],
    attachments: [],
    ...overrides,
  };
}

test("vendor quote proof rows normalize noisy proof labels", () => {
  const state = buildWeddingVendorQuoteThreadProofMessageState(message({
    content: {
      external_id: "gmail-msg-noisy-labels",
      provider: ` ${"Gmail ".repeat(80)} `,
      delivery: {
        to: [" hello@chloes.example ", "hello@chloes.example"],
        references: [" afp-quote-message-1\n\nwith   spaces "],
      },
      markdown: "Sent.",
    },
  }));

  assert.ok(state);
  assert.ok(state.providerLabel);
  assert.equal(state.providerLabel.length <= 240, true);
  assert.equal(state.providerLabel.endsWith("..."), true);
  assert.equal(state.sentToLabel, "hello@chloes.example");
  assert.equal(state.deliveryReferencesLabel, "afp-quote-message-1 with spaces");
});

test("vendor quote proof rows bound malformed delivery-missing labels", () => {
  const state = buildWeddingVendorQuoteThreadProofMessageState(message({
    type: "email_draft",
    kind: "wedding_vendor_quote_reply_draft",
    content: {
      subject: "Floral quote",
      text: "Thanks Chloe.",
      delivery_ready: false,
      delivery_missing_fields: [
        "recipient",
        "recipient",
        "x".repeat(80),
        "body",
        "subject",
        "thread id",
      ],
    },
  }));

  assert.ok(state);
  assert.equal(state.deliveryReady, false);
  assert.deepEqual(state.deliveryMissingFields, [
    "recipient",
    `${"x".repeat(37)}...`,
    "body",
    "subject",
  ]);
});

test("vendor quote proof rows bound and dedupe delivery reference labels", () => {
  const state = buildWeddingVendorQuoteThreadProofMessageState(message({
    content: {
      external_id: "gmail-msg-reference-bound",
      delivery: {
        references: [
          "afp-quote-message-1",
          "afp-quote-message-1",
          "x".repeat(180),
          "afp-draft-message-1",
          "gmail-thread-message-1",
          "gmail-thread-message-2",
          "gmail-thread-message-3",
          "gmail-thread-message-4",
        ],
      },
      markdown: "Sent.",
    },
    metadata: {
      delivery_references: ["afp-quote-message-1", "metadata-only-reference"],
    },
  }));

  assert.ok(state);
  assert.equal(state.deliveryReferencesLabel, [
    "afp-quote-message-1",
    `${"x".repeat(117)}...`,
    "afp-draft-message-1",
    "gmail-thread-message-1",
    "gmail-thread-message-2",
    "gmail-thread-message-3",
  ].join(", "));
});
