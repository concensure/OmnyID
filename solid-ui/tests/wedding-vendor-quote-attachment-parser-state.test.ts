import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { buildWeddingVendorQuoteAttachmentParserState } from "@/lib/weddingVendorQuoteAttachmentParserState";
import { weddingVendorQuoteIncomingAfpMessage } from "@/lib/weddingVendorQuoteReplyFlowState";

const metadata = {
  weddingPlanId: "plan-1",
  responseWorkspaceId: "workspace-1",
  sourceResponseId: "response-1",
};

const quote: WeddingArtifactQuotePreview = {
  kind: "quote",
  vendorName: "Chloe's Florals",
  amount: 799,
  amountLabel: "AUD $799",
  currency: "AUD",
  budgetDeltaAmount: 200,
  budgetDeltaLabel: "$200 over budget",
  inclusions: ["Bridal bouquet"],
  validUntil: "2026-10-15",
  attachmentUrl: "https://example.com/chloe-quote.pdf",
};

test("buildWeddingVendorQuoteAttachmentParserState creates ingest document input for a quote attachment", () => {
  const incoming = weddingVendorQuoteIncomingAfpMessage({
    quote,
    metadata,
    subject: "Floral quote",
    createdAt: "2026-09-27T00:00:00.000Z",
  });
  const state = buildWeddingVendorQuoteAttachmentParserState(incoming);

  assert.equal(state.status, "request_ready");
  assert.equal(state.ready, true);
  assert.equal(state.attachmentId, incoming.attachments[0]?.id);
  assert.equal(state.mimeType, "application/pdf");
  assert.equal(state.parserInput?.thread_id, incoming.thread_id);
  assert.equal(state.parserInput?.source_kind, "wedding_vendor_quote_attachment");
  assert.equal(state.parserInput?.source_message_id, incoming.id);
  assert.equal(state.parserInput?.source_attachment_id, incoming.attachments[0]?.id);
  assert.equal(state.parserInput?.source_url, "https://example.com/chloe-quote.pdf");
  assert.equal(state.parserInput?.mime_type, "application/pdf");
});

test("buildWeddingVendorQuoteAttachmentParserState does not reparse extracted quote attachments", () => {
  const incoming = weddingVendorQuoteIncomingAfpMessage({
    quote: {
      ...quote,
      attachmentTextStatus: "extracted",
      attachmentEvidenceLabels: ["Original quote attachment text was extracted"],
    },
    metadata,
    subject: "Floral quote",
  });
  const state = buildWeddingVendorQuoteAttachmentParserState(incoming);

  assert.equal(state.status, "already_extracted");
  assert.equal(state.ready, false);
  assert.equal(state.parserInput, null);
  assert.ok(state.evidenceLabels.some((label) => /feed the response card/i.test(label)));
});

test("buildWeddingVendorQuoteAttachmentParserState blocks quote messages without attachments", () => {
  const incoming = weddingVendorQuoteIncomingAfpMessage({
    quote: { ...quote, attachmentUrl: null },
    metadata,
    subject: "Floral quote",
  });
  const state = buildWeddingVendorQuoteAttachmentParserState(incoming);

  assert.equal(state.status, "no_quote_attachment");
  assert.equal(state.ready, false);
  assert.equal(state.parserInput, null);
  assert.ok(state.blockerLabels.some((label) => /does not include an attachment/i.test(label)));
});
