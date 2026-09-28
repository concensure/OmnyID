// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mimeTypeFor(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".pdf")) return "application/pdf";
  if (lower.includes(".csv")) return "text/csv";
  if (lower.includes(".txt")) return "text/plain";
  return "text/uri-list";
}

export function weddingQuoteAttachmentMessageState(input: {
  quote: WeddingArtifactQuotePreview;
  threadId?: string | null;
  timestamp?: string | null;
}): AfpMessage | null {
  const url = clean(input.quote.attachmentUrl);
  if (!url) return null;
  const threadId = clean(input.threadId) || `wedding_quote_attachment:${safeWeddingLabel(input.quote.vendorName)}`;
  const timestamp = clean(input.timestamp) || new Date(0).toISOString();
  const id = `${safeWeddingLabel(threadId)}:quote_attachment:${safeWeddingLabel(url)}`;
  const name = `${input.quote.vendorName} quote original`;
  return {
    id,
    thread_id: threadId,
    from: "agent://wedding-planning",
    to: ["user://couple"],
    timestamp,
    type: "file",
    kind: "wedding_vendor_quote_attachment",
    subtype: "wedding_vendor_quote_attachment",
    supertags: [
      "wedding_vendor_quote",
      "wedding_quote_attachment",
      `vendor:${safeWeddingLabel(input.quote.vendorName)}`,
    ],
    content: {
      title: name,
      vendor_name: input.quote.vendorName,
      quote_amount: input.quote.amountLabel,
      budget_delta: input.quote.budgetDeltaLabel,
      attachment_url: url,
    },
    metadata: {
      vendor_name: input.quote.vendorName,
      quote_amount: input.quote.amount,
      quote_currency: input.quote.currency,
      budget_delta_amount: input.quote.budgetDeltaAmount,
    },
    views: [{ format: "attachments", content: { title: name }, priority: 1 }],
    attachments: [{
      id: `${id}:original`,
      name,
      mime_type: mimeTypeFor(url),
      size_bytes: 0,
      storage: {
        mode: "external_url",
        url,
      },
      encryption: {
        mode: "not_stored_by_omnyid",
      },
    }],
    references: [],
  };
}
