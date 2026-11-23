// @locs-version: 1.0
import type { AttachmentBatchIngestRequest, SearchAttachmentUpload } from "@/lib/api";
import type { WeddingVendorQuoteAttachmentParserState } from "@/lib/weddingVendorQuoteAttachmentParserState";

export type WeddingVendorQuoteAttachmentIngestState = {
  ready: boolean;
  request: AttachmentBatchIngestRequest | null;
  blockerLabels: string[];
  evidenceLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uploadFromParserState(
  parser: WeddingVendorQuoteAttachmentParserState,
): SearchAttachmentUpload | null {
  const input = parser.parserInput ?? {};
  const sourceMessageId = clean(input["source_message_id"]);
  const sourceAttachmentId = clean(input["source_attachment_id"]);
  if (!sourceMessageId) return null;
  return {
    source_message_id: sourceMessageId,
    attachment_id: sourceAttachmentId || null,
    file_name: clean(input["title"]) || parser.fileName,
    mime_type: clean(input["mime_type"]) || parser.mimeType,
    extraction_mode: "server_processing",
  };
}

export function buildWeddingVendorQuoteAttachmentIngestState(
  parser: WeddingVendorQuoteAttachmentParserState | null | undefined,
): WeddingVendorQuoteAttachmentIngestState {
  if (!parser) {
    return {
      ready: false,
      request: null,
      blockerLabels: ["No vendor quote attachment parser state is available."],
      evidenceLabels: [],
    };
  }
  if (!parser.ready || parser.status !== "request_ready") {
    return {
      ready: false,
      request: null,
      blockerLabels: parser.blockerLabels.length > 0
        ? parser.blockerLabels
        : [parser.statusLabel],
      evidenceLabels: parser.evidenceLabels,
    };
  }
  const input = parser.parserInput ?? {};
  const threadId = clean(input["thread_id"]);
  const upload = uploadFromParserState(parser);
  if (!threadId || !upload) {
    return {
      ready: false,
      request: null,
      blockerLabels: ["Quote attachment parser input is missing a thread id or source message id."],
      evidenceLabels: parser.evidenceLabels,
    };
  }
  return {
    ready: true,
    request: {
      thread_id: threadId,
      query: "Extract this wedding vendor quote attachment for quote-response evidence.",
      retention_mode: "keep_file",
      knowledge_mode: "connected_notes",
      uploads: [upload],
    },
    blockerLabels: [],
    evidenceLabels: [
      ...parser.evidenceLabels,
      "Parsed quote text will be saved as AFP evidence on the vendor thread.",
      "The original quote file remains available for audit and comparison.",
    ],
  };
}
