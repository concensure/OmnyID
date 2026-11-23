// @locs-version: 1.0
import type { WeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";
import type { WeddingVendorQuoteReceiptPersistenceState } from "@/lib/weddingVendorQuoteReceiptPersistenceState";
import type {
  WeddingVendorQuoteReplyDraftPersistenceState,
  WeddingVendorQuoteReplyProofPersistenceState,
} from "@/lib/weddingVendorQuoteReplyFlowState";
import { cleanWeddingProductionLabels } from "@/lib/weddingProductionLabelState";

export type WeddingVendorQuoteReplyUiReadinessInput = {
  quoteSummaryMounted?: boolean | null;
  originalQuoteActionMounted?: boolean | null;
  inlineEmailEditorMounted?: boolean | null;
  wordingApprovalControlMounted?: boolean | null;
  budgetAcknowledgementControlMounted?: boolean | null;
  sendActionMounted?: boolean | null;
  primaryDecisionActionMounted?: boolean | null;
  secondaryDecisionActionMounted?: boolean | null;
  conditionalReplyEditorMounted?: boolean | null;
  sentReplyHistoryMounted?: boolean | null;
  undoWindowMounted?: boolean | null;
  persistentSentConfirmationMounted?: boolean | null;
  proofDrawerActionMounted?: boolean | null;
  proofDrawerStatusMounted?: boolean | null;
  providerSetupActionMounted?: boolean | null;
  liveRegionsMounted?: boolean | null;
  failureTelemetryMounted?: boolean | null;
  draftPersistence?: WeddingVendorQuoteReplyDraftPersistenceState | null;
  proofPersistence?: WeddingVendorQuoteReplyProofPersistenceState | null;
  receiptPersistence?: WeddingVendorQuoteReceiptPersistenceState | null;
  providerReadiness?: WeddingProviderExecutorReadinessState | null;
};

export type WeddingVendorQuoteReplyUiReadinessState = {
  status: "ready" | "partial" | "blocked";
  productionReady: boolean;
  summary: string;
  detail: string;
  evidenceLabels: string[];
  blockerLabels: string[];
  nextActionLabels: string[];
  telemetryEvent: string | null;
};

type ReadinessCheck = {
  ready: boolean;
  evidence: string;
  blocker: string;
};

function check(ready: boolean | null | undefined, evidence: string, blocker: string): ReadinessCheck {
  return { ready: ready === true, evidence, blocker };
}

function providerChecks(input: WeddingVendorQuoteReplyUiReadinessInput): ReadinessCheck[] {
  const provider = input.providerReadiness ?? null;
  const providerReady = provider?.productionReady === true;
  return [
    {
      ready: providerReady,
      evidence: provider ? `External email provider ready: ${provider.summary}` : "External email provider readiness mounted",
      blocker: provider
        ? `External email provider is not production-ready: ${provider.detail}`
        : "External email provider readiness is not mounted.",
    },
    ...(provider && !providerReady
      ? [check(
        input.providerSetupActionMounted,
        "Provider setup recovery action mounted",
        "Provider setup recovery action is not mounted.",
      )]
      : []),
  ];
}

function persistenceChecks(input: WeddingVendorQuoteReplyUiReadinessInput): ReadinessCheck[] {
  const draftBlocks = input.draftPersistence?.blocksExternalSend === true;
  const receiptProofIncomplete = input.receiptPersistence
    ? input.receiptPersistence.proofAttached !== true || input.receiptPersistence.proofReliability !== "vendor_thread"
    : false;
  const proofWarning = input.proofPersistence?.tone === "warning"
    || input.receiptPersistence?.needsAttention === true
    || receiptProofIncomplete;
  return [
    {
      ready: !draftBlocks,
      evidence: "Draft persistence does not allow local-only external send",
      blocker: input.draftPersistence?.detail
        ? `Draft persistence blocks external send: ${input.draftPersistence.detail}`
        : "Draft persistence blocks external send.",
    },
    {
      ready: !proofWarning,
      evidence: "Sent proof persistence is durable",
      blocker: input.receiptPersistence?.notice
        ? `Sent proof persistence needs attention: ${input.receiptPersistence.notice}`
        : input.proofPersistence?.detail
          ? `Sent proof persistence needs attention: ${input.proofPersistence.detail}`
        : "Sent proof persistence needs attention.",
    },
  ];
}

export function buildWeddingVendorQuoteReplyUiReadinessState(
  input: WeddingVendorQuoteReplyUiReadinessInput = {},
): WeddingVendorQuoteReplyUiReadinessState {
  const checks: ReadinessCheck[] = [
    check(input.quoteSummaryMounted, "Structured quote summary mounted", "Structured quote summary is not mounted."),
    check(input.originalQuoteActionMounted, "Original quote action mounted", "Original quote action is not mounted."),
    check(input.inlineEmailEditorMounted, "Inline email editor mounted", "Inline email editor is not mounted."),
    check(input.wordingApprovalControlMounted, "Separate wording approval control mounted", "Separate wording approval control is not mounted."),
    check(
      input.budgetAcknowledgementControlMounted,
      "Separate budget acknowledgement control mounted",
      "Separate budget acknowledgement control is not mounted.",
    ),
    check(input.sendActionMounted, "Plain send action mounted", "Plain send action is not mounted."),
    check(
      input.primaryDecisionActionMounted,
      "State-derived primary decision action mounted",
      "State-derived primary decision action is not mounted.",
    ),
    check(
      input.secondaryDecisionActionMounted,
      "State-derived secondary decision action mounted",
      "State-derived secondary decision action is not mounted.",
    ),
    check(
      input.conditionalReplyEditorMounted,
      "Conditional reply editor visibility mounted",
      "Conditional reply editor visibility is not mounted.",
    ),
    check(
      input.sentReplyHistoryMounted,
      "Sent reply history/log surface mounted",
      "Sent reply history/log surface is not mounted.",
    ),
    check(input.undoWindowMounted, "Undo window mounted before external send", "Undo window is not mounted before external send."),
    check(
      input.persistentSentConfirmationMounted,
      "Persistent sent confirmation mounted",
      "Persistent sent confirmation is not mounted.",
    ),
    check(input.proofDrawerActionMounted, "Sent proof drawer action mounted", "Sent proof drawer action is not mounted."),
    check(input.proofDrawerStatusMounted, "Proof drawer status region mounted", "Proof drawer status region is not mounted."),
    check(input.liveRegionsMounted, "Status and alert live regions mounted", "Status and alert live regions are not mounted."),
    check(input.failureTelemetryMounted, "Failure telemetry hooks mounted", "Failure telemetry hooks are not mounted."),
    ...providerChecks(input),
    ...persistenceChecks(input),
  ];
  const evidenceLabels = cleanWeddingProductionLabels(checks.filter((item) => item.ready).map((item) => item.evidence));
  const blockerLabels = cleanWeddingProductionLabels(checks.filter((item) => !item.ready).map((item) => item.blocker));
  const productionReady = blockerLabels.length === 0;
  const nextActionLabels = cleanWeddingProductionLabels(blockerLabels.map((label) => {
    if (/quote summary/i.test(label)) return "Mount the structured quote summary before the draft reply.";
    if (/Original quote/i.test(label)) return "Mount a secondary action for the original quote attachment.";
    if (/email editor/i.test(label)) return "Mount the Tiptap email editor inline in the quote card.";
    if (/wording approval/i.test(label)) return "Keep wording approval separate from send.";
    if (/budget acknowledgement/i.test(label)) return "Keep budget acknowledgement separate from wording approval.";
    if (/send action/i.test(label)) return "Mount a plain-language Send action after approvals.";
    if (/primary decision action/i.test(label)) return "Drive the primary CTA from the quote-reply decision stage.";
    if (/secondary decision action/i.test(label)) return "Drive the secondary CTA from quote/reply context.";
    if (/reply editor visibility/i.test(label)) return "Show the Tiptap editor only when wording work is needed.";
    if (/Sent reply history/i.test(label)) return "Move sent replies out of the active queue while keeping them in history.";
    if (/Undo window/i.test(label)) return "Mount a cancelable undo window before provider execution.";
    if (/sent confirmation/i.test(label)) return "Replace the editor with persistent sent confirmation after provider success.";
    if (/proof drawer/i.test(label)) return "Mount the sent-proof drawer and its status region.";
    if (/live regions/i.test(label)) return "Expose status and alert live regions for save, send, undo, and proof states.";
    if (/telemetry/i.test(label)) return "Emit telemetry for draft-save, provider, send, and proof failures.";
    if (/provider setup/i.test(label)) return "Mount the provider setup recovery action.";
    if (/Draft persistence/i.test(label)) return "Block external send until the draft is durably saved.";
    if (/Sent proof persistence/i.test(label)) return "Treat proof-save attention as not production-ready.";
    if (/provider/i.test(label)) return "Require connected email provider readiness before production send.";
    return "Complete vendor quote reply UI safeguard.";
  }));

  return {
    status: productionReady ? "ready" : evidenceLabels.length > 0 ? "partial" : "blocked",
    productionReady,
    summary: productionReady
      ? "Vendor quote reply UI has the required review, undo, provider, and proof safeguards."
      : "Vendor quote reply UI is not production-ready yet.",
    detail: productionReady
      ? "The card can keep the user in context while still separating wording approval, budget acknowledgement, external send, undo, and proof."
      : "Keep this flow behind the vendor-quote v1 gate until every visible safeguard and provider/proof check passes.",
    evidenceLabels,
    blockerLabels,
    nextActionLabels,
    telemetryEvent: productionReady ? null : "wedding_vendor_quote_reply_ui_readiness_blocked",
  };
}
