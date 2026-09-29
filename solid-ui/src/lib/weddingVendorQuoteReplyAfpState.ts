// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";
import {
  weddingVendorQuoteReplyThreadId,
  type WeddingVendorQuoteReplyFlowState,
} from "@/lib/weddingVendorQuoteReplyFlowState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueStrings(values: readonly unknown[], limit = 40): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function timestampOrNow(value: string | null | undefined): string {
  const raw = clean(value);
  if (!raw) return new Date().toISOString();
  return Number.isFinite(Date.parse(raw)) ? raw : new Date().toISOString();
}

function durableExternalUrl(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function mimeTypeForQuoteAttachment(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".pdf")) return "application/pdf";
  if (lower.includes(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.includes(".doc")) return "application/msword";
  if (lower.includes(".csv")) return "text/csv";
  if (lower.includes(".txt")) return "text/plain";
  return "text/uri-list";
}

function emailDraftCompleteness(input: {
  recipient?: string | null;
  subject?: string | null;
  body?: string | null;
}): { ready: boolean; missing: string[] } {
  const missing = [
    clean(input.recipient) ? null : "recipient",
    clean(input.subject) ? null : "subject",
    clean(input.body) ? null : "body",
  ].filter((value): value is string => Boolean(value));
  return {
    ready: missing.length === 0,
    missing,
  };
}

export function weddingVendorQuoteIncomingAfpMessage(input: {
  quote: WeddingArtifactQuotePreview;
  metadata?: unknown;
  createdAt?: string | null;
  sourceId?: string | null;
  subject?: string | null;
}): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const timestamp = timestampOrNow(input.createdAt);
  const threadId = weddingVendorQuoteReplyThreadId({
    responseWorkspaceId: metadata.responseWorkspaceId,
    vendorName: input.quote.vendorName,
    subject: input.subject ?? "quote",
  });
  const id = clean(input.sourceId)
    || `afp-${safeWeddingLabel(threadId)}-${safeWeddingLabel(timestamp)}`;
  const attachmentUrl = durableExternalUrl(input.quote.attachmentUrl);
  const attachmentId = attachmentUrl ? `${id}:quote` : null;
  const quoteRecord = input.quote as typeof input.quote & Record<string, unknown>;
  const quote = attachmentId
    ? {
      ...input.quote,
      sourceAttachmentId: quoteRecord.sourceAttachmentId ?? quoteRecord.source_attachment_id ?? attachmentId,
      source_attachment_id: quoteRecord.source_attachment_id ?? quoteRecord.sourceAttachmentId ?? attachmentId,
      attachmentId: quoteRecord.attachmentId ?? quoteRecord.attachment_id ?? attachmentId,
      attachment_id: quoteRecord.attachment_id ?? quoteRecord.attachmentId ?? attachmentId,
    }
    : input.quote;
  return {
    id,
    thread_id: threadId,
    from: "vendor://wedding",
    to: ["agent://wedding-planning", "agent://knowledge-graph", "agent://decision-queue"],
    timestamp,
    type: "ledger",
    kind: "wedding_vendor_quote_received",
    subtype: "wedding_vendor_quote_received",
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding_vendor_quote",
      "wedding_budget_impact",
      `vendor:${safeWeddingLabel(input.quote.vendorName)}`,
    ]),
    content: {
      ledger_kind: "wedding_vendor_quote_received",
      quote,
      markdown: `# ${input.quote.vendorName} quote\n\nQuote amount: ${input.quote.amountLabel}`,
    },
    metadata: {
      ...metadata,
      vendor_name: input.quote.vendorName,
      quote_amount: input.quote.amount,
      quote_currency: input.quote.currency,
      budget_delta_amount: input.quote.budgetDeltaAmount,
      source_attachment_id: attachmentId,
      attachment_id: attachmentId,
      attachment_text_status: input.quote.attachmentTextStatus ?? (attachmentUrl ? "linked_unverified" : "none"),
      attachment_evidence_labels: input.quote.attachmentEvidenceLabels ?? [],
      e2ee_required: true,
    },
    views: [{
      format: "a2ui",
      content: {
        kind: "wedding_vendor_quote",
        title: `${input.quote.vendorName} quote`,
        summary: input.quote.budgetDeltaLabel
          ? `${input.quote.amountLabel} - ${input.quote.budgetDeltaLabel}`
          : input.quote.amountLabel,
      },
    }],
    attachments: attachmentUrl
      ? [{
        id: attachmentId ?? `${id}:quote`,
        name: `${input.quote.vendorName} quote`,
        mime_type: mimeTypeForQuoteAttachment(attachmentUrl),
        size_bytes: 0,
        storage: {
          mode: "external_url",
          url: attachmentUrl,
        },
        encryption: {
          mode: "not_stored_by_omnyid",
        },
      }]
      : [],
    references: [],
  };
}

export function weddingVendorQuoteDraftAfpSendInput(input: {
  flow: WeddingVendorQuoteReplyFlowState;
  recipient: string;
  subject: string;
  body: string;
  editorAfpMessage?: Omit<AfpMessage, "id" | "timestamp" | "from"> | null;
  parentId?: string | null;
  createdAt?: string | null;
}): SendAfpMessageInput {
  const timestamp = timestampOrNow(input.createdAt);
  const id = `afp-${safeWeddingLabel(input.flow.threadId)}-draft-${safeWeddingLabel(timestamp)}`;
  const body = clean(input.body);
  const editor = input.editorAfpMessage;
  const editorContent = record(editor?.content);
  const emailHtml = clean(editorContent.html);
  const editorViews = Array.isArray(editor?.views) ? editor.views : [];
  const editorMetadata = record(editor?.metadata);
  const quoteMessageId = clean(input.parentId);
  const deliveryCompleteness = emailDraftCompleteness({
    recipient: input.recipient,
    subject: input.subject,
    body,
  });
  return {
    thread_id: input.flow.threadId,
    parent_id: quoteMessageId || undefined,
    from: "agent://wedding-planning",
    to: ["user://couple", "agent://decision-queue", "agent://knowledge-graph"],
    timestamp,
    type: "email_draft",
    kind: "wedding_vendor_quote_reply_draft",
    subtype: "wedding_vendor_quote_reply_draft",
    content: {
      ...editorContent,
      text: body,
      to: clean(input.recipient),
      subject: clean(input.subject),
      wedding_plan_id: input.flow.metadata.weddingPlanId,
      response_workspace_id: input.flow.metadata.responseWorkspaceId,
      source_response_id: input.flow.metadata.sourceResponseId,
      delivery_ready: deliveryCompleteness.ready,
      delivery_missing_fields: deliveryCompleteness.missing,
      approval_request_id: input.flow.approvalRequest.id,
      semantic_object: input.flow.semanticObject,
      ...(emailHtml ? { html: emailHtml } : {}),
    },
    views: editorViews.length > 0
      ? editorViews.map((view) => {
        const viewRecord = record(view);
        const content = record(viewRecord.content);
        return {
          ...viewRecord,
          content: {
            ...content,
            to: clean(input.recipient),
            subject: clean(input.subject),
            text: body,
            delivery_ready: deliveryCompleteness.ready,
            delivery_missing_fields: deliveryCompleteness.missing,
            semantic_object: input.flow.semanticObject,
          },
        };
      })
      : [{
        format: "email",
        content: {
          to: clean(input.recipient),
          subject: clean(input.subject),
          text: body,
          delivery_ready: deliveryCompleteness.ready,
          delivery_missing_fields: deliveryCompleteness.missing,
          semantic_object: input.flow.semanticObject,
        },
      }],
    attachments: [],
    references: [
      quoteMessageId
        ? {
          type: "wedding_vendor_quote",
          target: quoteMessageId,
          label: "Vendor quote",
        }
        : null,
      {
        type: "approval_request",
        target: input.flow.approvalRequest.id,
        label: "Approval request",
      },
    ].filter((reference): reference is { type: string; target: string; label: string } => reference !== null),
    supertags: uniqueStrings([
      "wedding_vendor_quote_reply",
      "wedding_email_draft",
      "approval_required",
      deliveryCompleteness.ready ? "delivery_ready" : "delivery_incomplete",
    ]),
    metadata: {
      ...editorMetadata,
      id,
      flow_id: input.flow.id,
      thread_id: input.flow.threadId,
      wedding_plan_id: input.flow.metadata.weddingPlanId,
      response_workspace_id: input.flow.metadata.responseWorkspaceId,
      source_response_id: input.flow.metadata.sourceResponseId,
      quote_message_id: quoteMessageId || null,
      approval_request_id: input.flow.approvalRequest.id,
      delivery_ready: deliveryCompleteness.ready,
      delivery_missing_fields: deliveryCompleteness.missing,
      semantic_object: input.flow.semanticObject,
      e2ee_required: true,
    },
    store_in_relational: true,
  };
}
