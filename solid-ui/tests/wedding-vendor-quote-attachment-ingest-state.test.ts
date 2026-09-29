import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorQuoteAttachmentIngestState } from "@/lib/weddingVendorQuoteAttachmentIngestState";
import { buildWeddingVendorQuoteAttachmentParserState } from "@/lib/weddingVendorQuoteAttachmentParserState";
import { weddingVendorQuoteIncomingAfpMessage } from "@/lib/weddingVendorQuoteReplyAfpState";

const metadata = {
  responseWorkspaceId: "workspace:wedding:attachment-ingest",
  weddingPlanId: "plan:attachment-ingest",
};

test("buildWeddingVendorQuoteAttachmentIngestState creates a persistent parser request for quote attachments", () => {
  const incoming = weddingVendorQuoteIncomingAfpMessage({
    quote: {
      kind: "quote",
      vendorName: "Chloe's Florals",
      amount: 799,
      amountLabel: "AUD $799",
      currency: "AUD",
      budgetDeltaAmount: 200,
      budgetDeltaLabel: "$200 over budget",
      inclusions: ["Bouquets", "Ceremony flowers"],
      validUntil: "2026-10-14",
      attachmentUrl: "https://example.com/chloe-florals-quote.pdf",
    },
    metadata,
    subject: "Quote from Chloe's Florals",
    createdAt: "2026-09-27T00:00:00.000Z",
  });
  const parser = buildWeddingVendorQuoteAttachmentParserState(incoming);
  const state = buildWeddingVendorQuoteAttachmentIngestState(parser);

  assert.equal(state.ready, true);
  assert.equal(state.request?.thread_id, incoming.thread_id);
  assert.equal(state.request?.retention_mode, "keep_file");
  assert.equal(state.request?.knowledge_mode, "connected_notes");
  assert.equal(state.request?.uploads[0]?.source_message_id, incoming.id);
  assert.equal(state.request?.uploads[0]?.attachment_id, incoming.attachments[0]?.id);
  assert.equal(state.request?.uploads[0]?.extraction_mode, "server_processing");
  assert.ok(state.evidenceLabels.some((label) => /AFP evidence/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /original quote file remains/i.test(label)));
});

test("buildWeddingVendorQuoteAttachmentIngestState does not reparse extracted quote attachments", () => {
  const incoming = weddingVendorQuoteIncomingAfpMessage({
    quote: {
      kind: "quote",
      vendorName: "Harbour Catering",
      amount: 4200,
      amountLabel: "AUD $4,200",
      currency: "AUD",
      budgetDeltaAmount: null,
      budgetDeltaLabel: null,
      inclusions: ["Canapes"],
      validUntil: null,
      attachmentUrl: "https://example.com/harbour-catering.pdf",
      attachmentTextStatus: "extracted",
    },
    metadata,
    subject: "Catering quote",
  });
  const parser = buildWeddingVendorQuoteAttachmentParserState(incoming);
  const state = buildWeddingVendorQuoteAttachmentIngestState(parser);

  assert.equal(state.ready, false);
  assert.equal(state.request, null);
  assert.ok(state.blockerLabels.some((label) => /already extracted/i.test(label)));
});

test("buildWeddingVendorQuoteAttachmentIngestState fails closed for malformed parser input", () => {
  const state = buildWeddingVendorQuoteAttachmentIngestState({
    status: "request_ready",
    ready: true,
    title: "Bad parser state",
    statusLabel: "Quote attachment can be parsed.",
    attachmentId: "att:broken",
    fileName: "quote.pdf",
    mimeType: "application/pdf",
    parserInput: {
      thread_id: "thread:quote",
      source_attachment_id: "att:broken",
    },
    blockerLabels: [],
    evidenceLabels: [],
  });

  assert.equal(state.ready, false);
  assert.equal(state.request, null);
  assert.ok(state.blockerLabels.some((label) => /source message id/i.test(label)));
});
