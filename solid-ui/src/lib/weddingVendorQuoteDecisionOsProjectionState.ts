// @locs-version: 2.0
// Pure, idempotent projection of an unresolved vendor quote into the AFP decision queue.

import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export const WEDDING_VENDOR_QUOTE_DECISION_ACTIONS = [
  "ACCEPT_VENDOR", "NEGOTIATE_QUOTE", "EXPLORE_ALTERNATIVE", "DEFER_DECISION",
] as const;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: readonly unknown[]): string[] {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

export function weddingVendorQuoteDecisionId(input: {
  weddingPlanId?: string | null;
  quoteMessageId: string;
}): string {
  return `wedding_vendor_quote:${safeWeddingLabel(input.weddingPlanId)}:${safeWeddingLabel(input.quoteMessageId)}`;
}

export function buildWeddingVendorQuoteDecisionOsProjection(input: {
  quoteMessageId: string;
  quoteThreadId: string;
  quote: WeddingArtifactQuotePreview;
  metadata?: unknown;
  category?: string | null;
  preferenceRefs?: readonly string[] | null;
  lifecycle?: "unresolved" | "resolved" | "deferred";
  createdAt?: string | null;
}): { status: "active" | "resolved" | "not_projected"; decisionId: string; idempotencyKey: string; sendInput: SendAfpMessageInput | null } {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const quoteMessageId = clean(input.quoteMessageId);
  const quoteThreadId = clean(input.quoteThreadId);
  const decisionId = weddingVendorQuoteDecisionId({ weddingPlanId: metadata.weddingPlanId, quoteMessageId });
  const resolved = input.lifecycle === "resolved";
  const idempotencyKey = `${decisionId}:${resolved ? "resolved" : "active"}:v1`;
  if (!quoteMessageId || !quoteThreadId) {
    return { status: "not_projected", decisionId, idempotencyKey, sendInput: null };
  }
  const deferred = input.lifecycle === "deferred";
  const title = `${input.quote.vendorName || "Vendor"} quote decision`;
  const sourceRefs = unique([quoteMessageId, metadata.sourceResponseId, metadata.responseWorkspaceId]);
  return {
    status: resolved ? "resolved" : "active",
    decisionId,
    idempotencyKey,
    sendInput: {
      thread_id: quoteThreadId,
      from: "system://wedding-planning",
      to: ["agent://decision-queue", "agent://wedding-planning"],
      timestamp: clean(input.createdAt) || new Date().toISOString(),
      type: resolved ? "decision_result" : "decision_request",
      kind: resolved ? "wedding_vendor_quote_decision_resolved" : "wedding_vendor_quote_decision",
      subtype: resolved ? "wedding_vendor_quote_resolved" : deferred ? "wedding_vendor_quote_deferred" : "wedding_vendor_quote_decision",
      content: {
        decision_id: decisionId,
        title,
        source_refs: sourceRefs, ...(resolved ? { resolution: "vendor_reply_sent", active: false } : { allowed_actions: WEDDING_VENDOR_QUOTE_DECISION_ACTIONS, approval_required: true }),
        open_intent: { kind: "open_wedding_vendor_quote", thread_id: quoteThreadId, quote_message_id: quoteMessageId },
        quote_summary: {
          vendor_name: input.quote.vendorName,
          amount: input.quote.amount,
          currency: input.quote.currency,
          amount_label: input.quote.amountLabel,
          budget_delta_amount: input.quote.budgetDeltaAmount,
          budget_delta_label: input.quote.budgetDeltaLabel,
          inclusions: input.quote.inclusions,
          valid_until: input.quote.validUntil,
          attachment_text_status: input.quote.attachmentTextStatus ?? "none",
          unknown_fields: [input.quote.amount === null ? "amount" : null, input.quote.validUntil ? null : "validity deadline"].filter(Boolean),
        },
      },
      views: [{ format: "a2ui", content: { kind: "wedding_vendor_quote_decision", title, decision_id: decisionId } }],
      attachments: [],
      references: sourceRefs.map((target) => ({ type: target === quoteMessageId ? "wedding_vendor_quote" : "wedding_context", target, label: "Wedding quote context" })),
      supertags: unique(["wedding", "wedding_vendor_quote", "decisionos", `vendor:${safeWeddingLabel(input.quote.vendorName)}`, resolved ? "decision:resolved" : deferred ? "decision:deferred" : "decision:active"]),
      metadata: {
        origin: "wedding_vendor_quote_projection", projection: "wedding_quote_to_decisionos", decision_id: decisionId,
        idempotency_key: idempotencyKey, pattern_id: "wedding.vendor_quote_response", pattern_version: 1,
        situation_type: "vendor_quote_received", wedding_plan_id: metadata.weddingPlanId,
        response_workspace_id: metadata.responseWorkspaceId, quote_message_id: quoteMessageId, quote_thread_id: quoteThreadId,
        category: clean(input.category) || null, preference_refs: unique(input.preferenceRefs ?? []), lifecycle: resolved ? "resolved" : deferred ? "deferred" : "unresolved",
      },
      store_in_relational: true,
    },
  };
}
