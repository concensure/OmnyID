// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
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
      groundedOnLabels: strings(content.grounded_on),
      sentAtIso: null,
      receiptRef: null,
      threadId: clean(message.thread_id) || null,
      blockedReason: null,
    };
    flows.set(choiceId, kind === "wedding_vendor_outreach_sent" ? {
      ...base,
      vendorName: clean(content.vendor_label) || base.vendorName,
      recipientEmail: clean(content.to) || base.recipientEmail,
      subject: clean(content.subject) || base.subject,
      bodyMarkdown: clean(content.text) || base.bodyMarkdown,
      stage: "sent",
      sentAtIso: clean(content.sent_at) || clean(message.timestamp) || base.sentAtIso,
      receiptRef: clean(content.client_message_id) || clean(content.provider_message_id) || base.receiptRef,
      threadId: clean(message.thread_id) || base.threadId,
    } : {
      ...base,
      vendorName: clean(content.vendor_label) || base.vendorName,
      recipientEmail: clean(content.to) || base.recipientEmail,
      subject: clean(content.subject),
      bodyMarkdown: clean(content.text),
      groundedOnLabels: strings(content.grounded_on),
      stage: "draft_ready",
      threadId: clean(message.thread_id) || base.threadId,
    });
  }
  return [...flows.values()];
}
