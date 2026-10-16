import assert from "node:assert/strict";
import test from "node:test";

import { quotationCapabilityDecision } from "@/lib/quotationCapabilityState";
import { prepareQuotationSourceRequest, sourceReceiptMatchesRevision } from "@/lib/quotationSourceState";

const none = {
  image_ocr_supported: false,
  pdf_server_processing_supported: false,
  legacy_office_supported: false,
};

test("capability decisions fail closed with manual alternatives", () => {
  assert.deepEqual(quotationCapabilityDecision(none, "application/pdf"), {
    status: "blocked",
    code: "parser_unavailable",
    action: "Enter the quotation manually or configure MinerU or LlamaParse.",
  });
  assert.equal(quotationCapabilityDecision(none, "image/png").code, "ocr_unavailable");
  assert.equal(quotationCapabilityDecision(none, "text/plain").status, "ready");
});

test("prepare request binds an existing source and defaults safe retention", () => {
  assert.deepEqual(prepareQuotationSourceRequest({ threadId: " thread-1 ", sourceMessageId: "message-1" }), {
    thread_id: "thread-1",
    source_message_id: "message-1",
    retention_state: "keep_extracted_only",
  });
  assert.throws(() => prepareQuotationSourceRequest({ threadId: "thread-1", sourceMessageId: "bad\nmessage" }));
});

test("receipt matching is revision exact", () => {
  const receipt = {
    receipt_id: "qsrc_1",
    source_id: "message-1",
    source_version_id: "v2",
    content_hash: "sha256:abc",
    mime_type: "text/plain",
    parser: "readability" as const,
    retention_state: "keep_extracted_only",
  };
  assert.equal(sourceReceiptMatchesRevision(receipt, "message-1", "v2"), true);
  assert.equal(sourceReceiptMatchesRevision(receipt, "message-1", "v1"), false);
});
