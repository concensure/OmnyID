import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { weddingQuoteAttachmentMessageState } from "@/lib/weddingQuoteAttachmentMessageState";

const quote: WeddingArtifactQuotePreview = {
  kind: "quote",
  vendorName: "Chloe's Florals",
  amount: 799,
  amountLabel: "AUD $799",
  currency: "AUD",
  budgetDeltaAmount: 200,
  budgetDeltaLabel: "$200 over budget",
  inclusions: ["Bridal bouquet", "Ceremony arrangements"],
  validUntil: "2026-10-15",
  attachmentUrl: "https://example.com/chloe-quote.pdf",
  attachmentTextStatus: "linked_unverified",
  attachmentEvidenceLabels: ["Original quote attachment is linked but text extraction is not verified"],
};

test("weddingQuoteAttachmentMessageState turns a quote attachment into a standard AFP attachment message", () => {
  const message = weddingQuoteAttachmentMessageState({
    quote,
    threadId: "wedding_vendor_quote:workspace:chloe",
    timestamp: "2026-09-27T00:00:00.000Z",
  });

  assert.ok(message);
  assert.equal(message.thread_id, "wedding_vendor_quote:workspace:chloe");
  assert.equal(message.type, "file");
  assert.equal(message.kind, "wedding_vendor_quote_attachment");
  assert.equal(message.views[0]?.format, "attachments");
  assert.equal(message.attachments.length, 1);
  assert.equal(message.attachments[0]?.mime_type, "application/pdf");
  assert.equal(message.attachments[0]?.storage.url, "https://example.com/chloe-quote.pdf");
  assert.equal(message.attachments[0]?.encryption.mode, "not_stored_by_omnyid");
  assert.equal(message.content.vendor_name, "Chloe's Florals");
  assert.equal(message.content.quote_amount, "AUD $799");
  assert.equal(message.content.attachment_text_status, "linked_unverified");
  assert.deepEqual(message.content.attachment_evidence_labels, [
    "Original quote attachment is linked but text extraction is not verified",
  ]);
  assert.equal(message.metadata.attachment_text_status, "linked_unverified");
  assert.deepEqual(message.metadata.attachment_evidence_labels, [
    "Original quote attachment is linked but text extraction is not verified",
  ]);
});

test("weddingQuoteAttachmentMessageState returns null when the quote has no original file", () => {
  assert.equal(weddingQuoteAttachmentMessageState({
    quote: { ...quote, attachmentUrl: null },
  }), null);
});

test("weddingQuoteAttachmentMessageState rejects unsafe original file urls", () => {
  assert.equal(weddingQuoteAttachmentMessageState({
    quote: { ...quote, attachmentUrl: "javascript:alert(1)" },
  }), null);
});

test("weddingQuoteAttachmentMessageState uses file extension mime fallbacks", () => {
  const csvMessage = weddingQuoteAttachmentMessageState({
    quote: { ...quote, attachmentUrl: "https://example.com/chloe-quote.csv" },
  });
  const docMessage = weddingQuoteAttachmentMessageState({
    quote: { ...quote, attachmentUrl: "https://example.com/chloe-quote.doc" },
  });
  const docxMessage = weddingQuoteAttachmentMessageState({
    quote: { ...quote, attachmentUrl: "https://example.com/chloe-quote.docx" },
  });
  const unknownMessage = weddingQuoteAttachmentMessageState({
    quote: { ...quote, attachmentUrl: "https://example.com/chloe-quote" },
  });

  assert.equal(csvMessage?.attachments[0]?.mime_type, "text/csv");
  assert.equal(docMessage?.attachments[0]?.mime_type, "application/msword");
  assert.equal(docxMessage?.attachments[0]?.mime_type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(unknownMessage?.attachments[0]?.mime_type, "text/uri-list");
});
