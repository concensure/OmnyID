// @locs-version: 2.0
// Pure, idempotent projection of an unresolved vendor quote into the AFP decision queue.

import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";
import {
  WEDDING_VENDOR_PATTERN_VERSION,
  WEDDING_VENDOR_QUOTE_ACTIONS,
  WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID,
  verifyWeddingDecisionPattern,
  weddingDecisionPattern,
  weddingDecisionPatternAllowsProjection,
  weddingQuoteSafetyEnvelope,
  type WeddingDecisionPatternVerification,
} from "@/lib/weddingVendorDecisionPatternState";

export const WEDDING_VENDOR_QUOTE_DECISION_ACTIONS = WEDDING_VENDOR_QUOTE_ACTIONS;

export type WeddingVenueQuoteDecisionState =
  | "unreadable_quote"
  | "no_deadline"
  | "over_budget"
  | "hold_expiring"
  | "hold_lapsed"
  | "chosen"
  | "booked";

export type WeddingVenueQuoteDecisionContent = {
  state: WeddingVenueQuoteDecisionState;
  question: string;
  heading: string;
  primaryActionLabel: string;
  oneThingToConfirm: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: readonly unknown[]): string[] {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function validDate(value: unknown): Date | null {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function buildWeddingVenueQuoteDecisionContent(input: {
  quote: WeddingArtifactQuotePreview;
  now?: Date;
}): WeddingVenueQuoteDecisionContent {
  const quote = input.quote;
  const now = input.now ?? new Date();
  const vendor = clean(quote.vendorName) || "this venue";
  const date = clean(quote.eventDate) || "your wedding date";
  const hold = validDate(quote.dateHoldExpiresAt);
  const holdDays = hold ? Math.ceil((hold.getTime() - now.getTime()) / 86_400_000) : null;
  const unreadable = Boolean(quote.attachmentUrl) && quote.attachmentTextStatus === "linked_unverified";
  const state: WeddingVenueQuoteDecisionState = unreadable
    ? "unreadable_quote"
    : quote.bookingStatus === "booked"
      ? "booked"
      : quote.bookingStatus === "chosen"
        ? "chosen"
        : holdDays !== null && holdDays < 0
          ? "hold_lapsed"
          : holdDays !== null && holdDays <= 7
            ? "hold_expiring"
            : (quote.budgetDeltaAmount ?? 0) > 0
              ? "over_budget"
              : "no_deadline";
  const question = state === "booked"
    ? `What should be confirmed next for ${vendor}?`
    : state === "chosen"
      ? `Confirm ${vendor} as your venue for ${date}?`
      : `Hold ${vendor} for ${date}?`;
  const byState: Record<WeddingVenueQuoteDecisionState, Omit<WeddingVenueQuoteDecisionContent, "state" | "question">> = {
    unreadable_quote: { heading: `${vendor}'s quote needs unlocking`, primaryActionLabel: "Open the original quote", oneThingToConfirm: "The quote amount, inclusions and any stated date-hold deadline." },
    no_deadline: { heading: `No date-hold deadline is stated for ${vendor}`, primaryActionLabel: "Ask about a date hold", oneThingToConfirm: "Whether the venue can hold the date, and until when." },
    over_budget: { heading: `${vendor} is above the saved allowance`, primaryActionLabel: "Compare the budget trade-off", oneThingToConfirm: "Whether the quoted scope justifies the budget difference." },
    hold_expiring: { heading: `${vendor}'s date hold is expiring`, primaryActionLabel: "Review the date hold", oneThingToConfirm: "Whether to ask the venue to keep holding the date; sending still needs approval." },
    hold_lapsed: { heading: `${vendor}'s stated date hold has lapsed`, primaryActionLabel: "Check the date again", oneThingToConfirm: "Whether the wedding date is still available." },
    chosen: { heading: `${vendor} is your saved preference`, primaryActionLabel: "Confirm our venue choice", oneThingToConfirm: "Whether this preference is ready to become the couple's confirmed choice." },
    booked: { heading: `${vendor} is recorded as booked`, primaryActionLabel: "Add booking details", oneThingToConfirm: "The contract, deposit, payment dates and run-sheet details." },
  };
  return { state, question, ...byState[state] };
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
}): {
  status: "active" | "resolved" | "not_projected";
  decisionId: string;
  idempotencyKey: string;
  sendInput: SendAfpMessageInput | null;
  patternVerification: WeddingDecisionPatternVerification;
} {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const quoteMessageId = clean(input.quoteMessageId);
  const quoteThreadId = clean(input.quoteThreadId);
  const decisionId = weddingVendorQuoteDecisionId({ weddingPlanId: metadata.weddingPlanId, quoteMessageId });
  const resolved = input.lifecycle === "resolved";
  const idempotencyKey = `${decisionId}:${resolved ? "resolved" : "active"}:v1`;
  const optionalGaps = [
    input.quote.amount === null ? "amount" : null,
    clean(input.quote.currency) ? null : "currency",
    input.quote.inclusions.length ? null : "scope",
    input.quote.validUntil ? null : "valid_until",
    input.quote.budgetDeltaAmount === null ? "budget_context" : null,
    (input.preferenceRefs ?? []).length ? null : "preference_refs",
  ].filter((value): value is string => Boolean(value));
  const patternVerification = verifyWeddingDecisionPattern({
    patternId: WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID,
    patternVersion: WEDDING_VENDOR_PATTERN_VERSION,
    situationType: "vendor_quote_received",
    presentInputs: [
      decisionId ? "decision_id" : "",
      quoteMessageId ? "quote_message_id" : "",
      quoteThreadId ? "quote_thread_id" : "",
      clean(input.quote.vendorName) ? "vendor_identity" : "",
    ],
    presentEvidence: [quoteMessageId ? "source_quote" : "", quoteThreadId ? "vendor_thread" : ""],
    allowedActions: WEDDING_VENDOR_QUOTE_DECISION_ACTIONS,
    executionContracts: ["wedding.vendor_quote_reply@1"],
    optionalGaps,
  });
  if (!quoteMessageId || !quoteThreadId) {
    return { status: "not_projected", decisionId, idempotencyKey, sendInput: null, patternVerification };
  }
  if (!weddingDecisionPatternAllowsProjection(patternVerification)) {
    return { status: "not_projected", decisionId, idempotencyKey, sendInput: null, patternVerification };
  }
  const deferred = input.lifecycle === "deferred";
  const title = `${input.quote.vendorName || "Vendor"} quote decision`;
  const sourceRefs = unique([quoteMessageId, metadata.sourceResponseId, metadata.responseWorkspaceId]);
  const pattern = weddingDecisionPattern(WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID, WEDDING_VENDOR_PATTERN_VERSION);
  const createdAt = clean(input.createdAt);
  const safetyEnvelope = weddingQuoteSafetyEnvelope({
    validUntil: input.quote.validUntil,
    dateHoldExpiresAt: input.quote.dateHoldExpiresAt,
    now: createdAt ? new Date(createdAt) : new Date(),
  });
  const venueDecision = buildWeddingVenueQuoteDecisionContent({
    quote: input.quote,
    now: createdAt ? new Date(createdAt) : new Date(),
  });
  const watcherCaughtKind = venueDecision.state === "hold_expiring"
    ? "expiring_hold"
    : venueDecision.state === "over_budget"
      ? "over_budget_quote"
      : null;
  return {
    status: resolved ? "resolved" : "active",
    decisionId,
    idempotencyKey,
    patternVerification,
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
        source_refs: sourceRefs, ...(resolved ? { resolution: "vendor_reply_sent", active: false } : {
          allowed_actions: WEDDING_VENDOR_QUOTE_DECISION_ACTIONS,
          approval_required: true,
          execution_contract: pattern?.executionContracts[0],
          safety_envelope: safetyEnvelope,
          venue_decision: venueDecision,
          pattern_verification: patternVerification,
        }),
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
          date_hold_expires_at: input.quote.dateHoldExpiresAt ?? null,
          booking_status: input.quote.bookingStatus ?? "open",
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
        idempotency_key: idempotencyKey,
        pattern_id: WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID,
        pattern_version: WEDDING_VENDOR_PATTERN_VERSION,
        projection_recipe: pattern?.projectionRecipe,
        verification_outcome: patternVerification.outcome,
        situation_type: "vendor_quote_received", wedding_plan_id: metadata.weddingPlanId,
        response_workspace_id: metadata.responseWorkspaceId, quote_message_id: quoteMessageId, quote_thread_id: quoteThreadId,
        category: clean(input.category) || null, preference_refs: unique(input.preferenceRefs ?? []), lifecycle: resolved ? "resolved" : deferred ? "deferred" : "unresolved",
        venue_decision_state: venueDecision.state,
        vendor_date_hold_expires_at: input.quote.dateHoldExpiresAt ?? null,
        quote_valid_until: input.quote.validUntil,
        watcher_caught_kind: watcherCaughtKind,
        watcher_caught_at: watcherCaughtKind ? clean(input.createdAt) || new Date().toISOString() : null,
      },
      store_in_relational: true,
    },
  };
}
