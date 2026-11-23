import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "@/lib/api";
import { weddingVendorQuoteReceiptParentId } from "@/lib/weddingVendorQuoteThreadProofState";

function message(overrides: Partial<AfpMessage> = {}): AfpMessage {
  return {
    id: "msg-1",
    thread_id: "thread-1",
    from: "agent://wedding",
    timestamp: "2026-09-27T01:02:03.000Z",
    type: "email_draft",
    kind: "wedding_vendor_quote_reply_draft",
    content: {
      subject: "Floral quote",
      markdown: "Thanks Chloe, we would like to proceed.",
    },
    views: [],
    attachments: [],
    ...overrides,
  };
}

test("vendor quote receipt parent points at the latest matching email draft", () => {
  const parentId = weddingVendorQuoteReceiptParentId([
    message({
      id: "quote",
      type: "ledger",
      kind: "wedding_vendor_quote_received",
      content: {},
    }),
    message({
      id: "old-draft",
      type: "email_draft",
      content: { approval_request_id: "approval-1", text: "Old draft" },
    }),
    message({
      id: "other-draft",
      type: "email_draft",
      content: { approval_request_id: "approval-2", text: "Other draft" },
    }),
    message({
      id: "latest-draft",
      type: "email_draft",
      content: { approval_request_id: "approval-1", text: "Latest draft" },
    }),
  ], "approval-1");

  assert.equal(parentId, "latest-draft");

  const readyParentId = weddingVendorQuoteReceiptParentId([
    message({
      id: "ready-draft",
      type: "email_draft",
      timestamp: "2026-09-27T01:00:00.000Z",
      content: {
        approval_request_id: "approval-1",
        text: "Ready draft",
        delivery_ready: true,
      },
    }),
    message({
      id: "incomplete-draft",
      type: "email_draft",
      timestamp: "2026-09-27T01:01:00.000Z",
      content: {
        approval_request_id: "approval-1",
        text: "",
        delivery_ready: false,
        delivery_missing_fields: ["body"],
      },
    }),
  ], "approval-1");

  assert.equal(readyParentId, "ready-draft");
  assert.equal(weddingVendorQuoteReceiptParentId([
    message({
      id: "referenced-draft",
      type: "email_draft",
      content: {
        text: "Referenced ready draft",
        delivery_ready: true,
      },
      references: [{
        type: "approval_request",
        target: "approval-1",
        label: "Approval request",
      }],
    }),
  ], "approval-1"), "referenced-draft");
  assert.equal(weddingVendorQuoteReceiptParentId([
    message({
      id: "incomplete-only",
      type: "email_draft",
      content: {
        approval_request_id: "approval-1",
        delivery_ready: false,
        delivery_missing_fields: ["recipient", "body"],
      },
    }),
  ], "approval-1"), null);
  assert.equal(weddingVendorQuoteReceiptParentId([], "approval-1"), null);
  assert.equal(weddingVendorQuoteReceiptParentId([message()], ""), null);
});

test("vendor quote receipt parent is timestamp-aware when thread messages are unsorted", () => {
  assert.equal(weddingVendorQuoteReceiptParentId([
    message({
      id: "newest-ready-draft",
      type: "email_draft",
      timestamp: "2026-09-27T01:10:00.000Z",
      content: {
        approval_request_id: "approval-1",
        delivery_ready: true,
      },
    }),
    message({
      id: "older-ready-draft",
      type: "email_draft",
      timestamp: "2026-09-27T01:00:00.000Z",
      content: {
        approval_request_id: "approval-1",
        delivery_ready: true,
      },
    }),
    message({
      id: "newer-incomplete-draft",
      type: "email_draft",
      timestamp: "2026-09-27T01:20:00.000Z",
      content: {
        approval_request_id: "approval-1",
        delivery_ready: false,
        delivery_missing_fields: ["body"],
      },
    }),
  ], "approval-1"), "newest-ready-draft");

  assert.equal(weddingVendorQuoteReceiptParentId([
    message({
      id: "legacy-older-draft",
      type: "email_draft",
      timestamp: "2026-09-27T01:00:00.000Z",
      content: {
        approval_request_id: "approval-1",
      },
    }),
    message({
      id: "legacy-newer-draft",
      type: "email_draft",
      timestamp: "2026-09-27T01:10:00.000Z",
      content: {
        approval_request_id: "approval-1",
      },
    }),
  ], "approval-1"), "legacy-newer-draft");
});
