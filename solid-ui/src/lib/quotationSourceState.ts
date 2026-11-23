export type QuotationSourceReceipt = {
  receipt_id: string;
  source_id: string;
  source_version_id: string;
  content_hash: string;
  mime_type: string;
  file_name?: string | null;
  parser: "readability" | "mineru" | "llama_parse" | "image_ocr";
  page_count?: number | null;
  retention_state: string;
};

export type QuotationPreparedSource = {
  receipt: QuotationSourceReceipt;
  parsed_text: string;
};

export type PrepareQuotationSourceInput = {
  threadId: string;
  sourceMessageId: string;
  sourceAttachmentId?: string | null;
  mimeType?: string | null;
  parser?: "mineru" | "llamaparse" | null;
  retentionState?: "keep_file" | "keep_extracted_only" | "keep_nothing";
};

function requiredId(value: string, label: string): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 180 || /[\u0000-\u001f\u007f]/u.test(cleaned)) {
    throw new Error(`${label} is invalid`);
  }
  return cleaned;
}

export function prepareQuotationSourceRequest(input: PrepareQuotationSourceInput): Record<string, unknown> {
  return {
    thread_id: requiredId(input.threadId, "threadId"),
    source_message_id: requiredId(input.sourceMessageId, "sourceMessageId"),
    ...(input.sourceAttachmentId?.trim() ? { source_attachment_id: requiredId(input.sourceAttachmentId, "sourceAttachmentId") } : {}),
    ...(input.mimeType?.trim() ? { mime_type: input.mimeType.trim().toLowerCase() } : {}),
    ...(input.parser ? { parser: input.parser } : {}),
    retention_state: input.retentionState ?? "keep_extracted_only",
  };
}

export function sourceReceiptMatchesRevision(
  receipt: QuotationSourceReceipt,
  sourceId: string,
  sourceVersionId: string,
): boolean {
  return Boolean(
    receipt.receipt_id.trim()
    && receipt.content_hash.startsWith("sha256:")
    && receipt.source_id === sourceId
    && receipt.source_version_id === sourceVersionId,
  );
}
