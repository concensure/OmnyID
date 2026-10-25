// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import type { AfpAttachment } from "@/lib/api";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";
import { normalizeWeddingVendorEnquiryPermissions } from "@/lib/weddingVendorEnquiryPermissionsState";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function generation(value: unknown): WeddingVendorOutreachFlowState["generation"] {
  const item = record(value);
  const model = clean(item.model);
  const servedFrom = clean(item.served_from);
  if (!model && !servedFrom) return null;
  return {
    model: model || "deterministic_template",
    inputTokens: finiteNumber(item.input_tokens),
    outputTokens: finiteNumber(item.output_tokens),
    estimatedCostUsd: finiteNumber(item.estimated_cost_usd),
    inputFingerprint: clean(item.input_fingerprint),
    promptPrefixId: clean(item.prompt_prefix_id),
    servedFrom: servedFrom === "model" || servedFrom === "afp_reuse" ? servedFrom : "deterministic_template",
  };
}

function references(value: unknown): Array<{ type: string; target: string; label: string }> {
  return Array.isArray(value) ? value.flatMap((entry) => {
    const item = record(entry);
    const type = clean(item.type);
    const target = clean(item.target);
    if (!type || !target) return [];
    return [{ type, target, label: clean(item.label) || type }];
  }) : [];
}

function attachments(value: unknown): AfpAttachment[] {
  return Array.isArray(value) ? value.filter((item): item is AfpAttachment => Boolean(
    item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string",
  )) : [];
}

/** Rebuilds the latest outreach draft/receipt state from append-only AFP history. */
export function projectWeddingVendorOutreachFlows(messages: readonly AfpMessage[]): WeddingVendorOutreachFlowState[] {
  const flows = new Map<string, WeddingVendorOutreachFlowState>();
  const ordered = [...messages].sort((left, right) => Date.parse(left.timestamp ?? "") - Date.parse(right.timestamp ?? ""));
  for (const message of ordered) {
    const kind = clean(message.kind) || clean(message.subtype);
    if (kind !== "wedding_vendor_outreach_draft" && kind !== "wedding_vendor_outreach_sent") continue;
    const content = record(message.content);
    const choiceId = clean(content.choice_id);
    if (!choiceId) continue;
    const previous = flows.get(choiceId);
    const base: WeddingVendorOutreachFlowState = previous ?? {
      choiceId,
      vendorName: clean(content.vendor_label) || "Wedding vendor",
      recipientEmail: clean(content.to) || null,
      stage: "draft_ready",
      subject: clean(content.subject),
      bodyMarkdown: clean(content.text),
      bodyHtml: clean(content.html) || null,
      groundedOnLabels: strings(content.grounded_on),
      groundedOnFields: strings(content.grounded_on_fields),
      sourceReferences: references(message.references),
      generation: generation(content.generation),
      permissions: normalizeWeddingVendorEnquiryPermissions(content.permissions),
      draftMessageId: clean(message.id) || null,
      revision: Math.max(1, finiteNumber(content.revision, 1)),
      hasUnpersistedChanges: false,
      sentAtIso: null,
      receiptRef: null,
      threadId: clean(message.thread_id) || null,
      blockedReason: null,
      attachments: attachments(message.attachments),
    };
    flows.set(choiceId, kind === "wedding_vendor_outreach_sent" ? {
      ...base,
      vendorName: clean(content.vendor_label) || base.vendorName,
      recipientEmail: clean(content.to) || base.recipientEmail,
      subject: clean(content.subject) || base.subject,
      bodyMarkdown: clean(content.text) || base.bodyMarkdown,
      bodyHtml: clean(content.html) || base.bodyHtml,
      stage: "sent",
      sentAtIso: clean(content.sent_at) || clean(message.timestamp) || base.sentAtIso,
      receiptRef: clean(content.client_message_id) || clean(content.provider_message_id) || base.receiptRef,
      threadId: clean(message.thread_id) || base.threadId,
      attachments: attachments(message.attachments).length ? attachments(message.attachments) : base.attachments,
    } : {
      ...base,
      vendorName: clean(content.vendor_label) || base.vendorName,
      recipientEmail: clean(content.to) || base.recipientEmail,
      subject: clean(content.subject),
      bodyMarkdown: clean(content.text),
      bodyHtml: clean(content.html) || null,
      groundedOnLabels: strings(content.grounded_on),
      groundedOnFields: strings(content.grounded_on_fields),
      sourceReferences: references(message.references),
      generation: generation(content.generation),
      permissions: normalizeWeddingVendorEnquiryPermissions(content.permissions),
      draftMessageId: clean(message.id) || base.draftMessageId,
      revision: Math.max(base.revision, finiteNumber(content.revision, base.revision)),
      hasUnpersistedChanges: false,
      stage: "draft_ready",
      threadId: clean(message.thread_id) || base.threadId,
      attachments: attachments(message.attachments),
    });
  }
  return [...flows.values()];
}
