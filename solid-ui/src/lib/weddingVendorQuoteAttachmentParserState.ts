// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";

export type WeddingVendorQuoteAttachmentParserStatus =
  | "request_ready"
  | "already_extracted"
  | "no_quote_attachment"
  | "missing_source_message";

export type WeddingVendorQuoteAttachmentParserState = {
  status: WeddingVendorQuoteAttachmentParserStatus;
  ready: boolean;
  title: string;
  statusLabel: string;
  attachmentId: string | null;
  fileName: string | null;
  mimeType: string | null;
  parserInput: Record<string, unknown> | null;
  blockerLabels: string[];
  evidenceLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function tokensFor(message: AfpMessage): string {
  return [
    message.type,
    message.kind,
    message.subtype,
    ...strings(message.supertags),
  ].map((value) => clean(value).toLowerCase()).join(" ");
}

function firstAttachment(message: AfpMessage): Record<string, unknown> {
  return record(message.attachments[0]);
}

function storageUrl(attachment: Record<string, unknown>): string {
  return clean(record(attachment.storage).url);
}

function quoteRecord(message: AfpMessage): Record<string, unknown> {
  return record(record(message.content).quote);
}

function attachmentTextStatus(message: AfpMessage): string {
  const quote = quoteRecord(message);
  return clean(quote.attachmentTextStatus ?? quote.attachment_text_status)
    || clean(message.metadata?.attachment_text_status);
}

function quoteAttachmentId(message: AfpMessage): string {
  const quote = quoteRecord(message);
  const attachment = firstAttachment(message);
  return clean(quote.sourceAttachmentId ?? quote.source_attachment_id)
    || clean(quote.attachmentId ?? quote.attachment_id)
    || clean(message.metadata?.source_attachment_id)
    || clean(message.metadata?.attachment_id)
    || clean(attachment.id);
}

function quoteAttachmentMimeType(message: AfpMessage): string {
  const attachment = firstAttachment(message);
  const quote = quoteRecord(message);
  return clean(quote.attachmentMimeType ?? quote.attachment_mime_type)
    || clean(attachment.mime_type)
    || (storageUrl(attachment).toLowerCase().includes(".pdf") ? "application/pdf" : "application/octet-stream");
}

function quoteAttachmentFileName(message: AfpMessage): string {
  const attachment = firstAttachment(message);
  const quote = quoteRecord(message);
  return clean(quote.attachmentName ?? quote.attachment_name)
    || clean(attachment.name)
    || clean(quote.vendorName ?? quote.vendor_name)
    || "vendor quote attachment";
}

export function buildWeddingVendorQuoteAttachmentParserState(
  message: AfpMessage | null | undefined,
): WeddingVendorQuoteAttachmentParserState {
  if (!message) {
    return {
      status: "missing_source_message",
      ready: false,
      title: "Vendor quote attachment parser",
      statusLabel: "No vendor quote message is selected.",
      attachmentId: null,
      fileName: null,
      mimeType: null,
      parserInput: null,
      blockerLabels: ["Select the vendor quote message before parsing the attachment."],
      evidenceLabels: [],
    };
  }

  const tokens = tokensFor(message);
  const quote = quoteRecord(message);
  const vendorName = clean(quote.vendorName ?? quote.vendor_name) || clean(message.metadata?.vendor_name) || "vendor";
  const title = `${vendorName} quote attachment parser`;
  if (!tokens.includes("wedding_vendor_quote_received")) {
    return {
      status: "missing_source_message",
      ready: false,
      title,
      statusLabel: "This message is not a vendor quote.",
      attachmentId: null,
      fileName: null,
      mimeType: null,
      parserInput: null,
      blockerLabels: ["Use a wedding vendor quote message before requesting attachment parsing."],
      evidenceLabels: [],
    };
  }

  const attachmentId = quoteAttachmentId(message);
  const attachment = firstAttachment(message);
  const sourceUrl = storageUrl(attachment) || clean(quote.attachmentUrl ?? quote.attachment_url);
  const fileName = quoteAttachmentFileName(message);
  const mimeType = quoteAttachmentMimeType(message);
  const status = attachmentTextStatus(message);
  if (status === "extracted") {
    return {
      status: "already_extracted",
      ready: false,
      title,
      statusLabel: "Quote attachment text is already extracted.",
      attachmentId: attachmentId || null,
      fileName,
      mimeType,
      parserInput: null,
      blockerLabels: [],
      evidenceLabels: ["Existing quote attachment evidence can feed the response card."],
    };
  }
  if (!attachmentId && !sourceUrl) {
    return {
      status: "no_quote_attachment",
      ready: false,
      title,
      statusLabel: "No quote attachment is available to parse.",
      attachmentId: null,
      fileName: null,
      mimeType: null,
      parserInput: null,
      blockerLabels: ["The vendor quote message does not include an attachment id or URL."],
      evidenceLabels: [],
    };
  }

  const parserInput = {
    thread_id: message.thread_id,
    source_kind: "wedding_vendor_quote_attachment",
    source_message_id: message.id,
    source_attachment_id: attachmentId || null,
    source_url: sourceUrl || null,
    mime_type: mimeType,
    title: fileName,
  };
  return {
    status: "request_ready",
    ready: true,
    title,
    statusLabel: "Quote attachment can be parsed for response evidence.",
    attachmentId: attachmentId || null,
    fileName,
    mimeType,
    parserInput,
    blockerLabels: [],
    evidenceLabels: [
      attachmentId ? `Source attachment: ${attachmentId}` : "Source URL will be used for parser input.",
      `Parser input is scoped to thread ${message.thread_id}.`,
    ],
  };
}

export function weddingVendorQuoteAttachmentParserStateWithExtractedEvidence(
  state: WeddingVendorQuoteAttachmentParserState,
  evidenceLabels: readonly string[] = [],
): WeddingVendorQuoteAttachmentParserState {
  if (state.status !== "request_ready") return state;
  return {
    ...state,
    status: "already_extracted",
    ready: false,
    statusLabel: "Quote attachment text is already extracted.",
    parserInput: null,
    blockerLabels: [],
    evidenceLabels: [
      ...state.evidenceLabels,
      ...evidenceLabels,
      "Existing parsed-document evidence can feed the quote response card.",
    ].filter((label, index, labels) => labels.indexOf(label) === index),
  };
}
