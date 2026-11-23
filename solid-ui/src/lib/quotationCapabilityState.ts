export type QuotationCapabilityInput = {
  image_ocr_supported: boolean;
  pdf_server_processing_supported: boolean;
  legacy_office_supported: boolean;
};

export type QuotationSourceKind = "image" | "pdf" | "email_or_text" | "legacy_office" | "unsupported";

export type QuotationCapabilityDecision = {
  status: "ready" | "blocked";
  code?: "ocr_unavailable" | "parser_unavailable" | "unsupported_mime";
  action?: string;
};

export function quotationSourceKind(mimeType: string): QuotationSourceKind {
  const mime = mimeType.trim().toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("pdf")) return "pdf";
  if (mime.startsWith("text/") || mime === "message/rfc822" || mime.includes("json") || mime.includes("xml")) {
    return "email_or_text";
  }
  if (mime.includes("msword") || mime.includes("officedocument")) return "legacy_office";
  return "unsupported";
}

export function quotationCapabilityDecision(
  capabilities: QuotationCapabilityInput,
  mimeType: string,
): QuotationCapabilityDecision {
  switch (quotationSourceKind(mimeType)) {
    case "image":
      return capabilities.image_ocr_supported
        ? { status: "ready" }
        : { status: "blocked", code: "ocr_unavailable", action: "Enter the quotation manually or configure image OCR." };
    case "pdf":
      return capabilities.pdf_server_processing_supported
        ? { status: "ready" }
        : { status: "blocked", code: "parser_unavailable", action: "Enter the quotation manually or configure MinerU or LlamaParse." };
    case "email_or_text":
      return { status: "ready" };
    case "legacy_office":
      return capabilities.legacy_office_supported
        ? { status: "ready" }
        : { status: "blocked", code: "parser_unavailable", action: "Save the document as PDF or enter the quotation manually." };
    default:
      return { status: "blocked", code: "unsupported_mime", action: "Use PDF, image, email, HTML, or plain text." };
  }
}
