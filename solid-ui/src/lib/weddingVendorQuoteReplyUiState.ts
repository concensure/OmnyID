// @locs-version: 1.0
import type { WeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";
import type { WeddingVendorQuoteReceiptPersistenceState } from "@/lib/weddingVendorQuoteReceiptPersistenceState";
import type {
  WeddingVendorQuoteReplyDraftPersistenceState,
  WeddingVendorQuoteReplyFlowState,
  WeddingVendorQuoteReplyProofPersistenceState,
  WeddingVendorQuoteReplySendGateState,
} from "@/lib/weddingVendorQuoteReplyFlowState";

export type WeddingVendorQuoteReplyUiNoticeTone = "neutral" | "success" | "warning" | "critical";

export type WeddingVendorQuoteReplyUiCopyState = {
  sendStatusCopy: string;
  draftNoticeRole: "status" | "alert";
  draftNoticeAriaLive: "polite" | "assertive";
  providerNoticeRole: "status" | "alert";
  providerNoticeAriaLive: "polite" | "assertive";
  proofNoticeRole: "status" | "alert";
  proofNoticeAriaLive: "polite" | "assertive";
  failureNoticeTitle: string;
  failureNoticeDetail: string | null;
  failureNoticeTone: WeddingVendorQuoteReplyUiNoticeTone;
  failureTelemetryEvent: string | null;
  undoStatusLabel: string;
  sentStatusLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function providerSendStatusCopy(input: {
  flow: Pick<WeddingVendorQuoteReplyFlowState, "failureMessage" | "canSend">;
  sendGate?: WeddingVendorQuoteReplySendGateState | null;
  providerReadiness?: WeddingProviderExecutorReadinessState | null;
}): string {
  const readiness = input.providerReadiness ?? null;
  const gateReason = clean(input.sendGate?.blockedReason);
  if (input.flow.failureMessage && !input.flow.canSend) return input.flow.failureMessage;
  if (gateReason) return gateReason;
  if (!readiness) {
    return input.flow.failureMessage
      ? "Try again when the sender is ready; the reply will wait through the undo window first."
      : "This reply will use the configured wedding email sender after the undo window.";
  }
  if (readiness.productionReady) {
    return input.flow.failureMessage
      ? "You can try sending again through the connected email provider after the undo window."
      : "This reply will be sent through the connected email provider after the undo window.";
  }
  if (readiness.credentialStatus === "stale") return "Reconnect the email provider before this can be sent.";
  if (readiness.executorStatus === "missing") {
    return "Email sending is approved in OmnyID, but the Gmail send action is not available yet.";
  }
  return "Connect Gmail before this reply can be sent outside OmnyID.";
}

function failureTelemetryEvent(input: {
  flow: Pick<WeddingVendorQuoteReplyFlowState, "failureMessage">;
  draftPersistence?: WeddingVendorQuoteReplyDraftPersistenceState | null;
  proofPersistence?: WeddingVendorQuoteReplyProofPersistenceState | null;
  receiptPersistence?: WeddingVendorQuoteReceiptPersistenceState | null;
  providerReadiness?: WeddingProviderExecutorReadinessState | null;
}): string | null {
  if (input.draftPersistence?.status === "local_only") return "wedding_vendor_quote_reply_draft_save_failed";
  if (input.receiptPersistence?.telemetryEvent) return input.receiptPersistence.telemetryEvent;
  if (input.proofPersistence?.tone === "warning") return "wedding_vendor_quote_reply_proof_save_attention";
  if (input.providerReadiness && !input.providerReadiness.productionReady) {
    return "wedding_vendor_quote_reply_provider_not_ready";
  }
  return clean(input.flow.failureMessage) ? "wedding_vendor_quote_reply_provider_send_failed" : null;
}

export function buildWeddingVendorQuoteReplyUiCopyState(input: {
  flow: Pick<WeddingVendorQuoteReplyFlowState, "failureMessage" | "canSend">;
  sendGate?: WeddingVendorQuoteReplySendGateState | null;
  draftPersistence?: WeddingVendorQuoteReplyDraftPersistenceState | null;
  proofPersistence?: WeddingVendorQuoteReplyProofPersistenceState | null;
  receiptPersistence?: WeddingVendorQuoteReceiptPersistenceState | null;
  providerReadiness?: WeddingProviderExecutorReadinessState | null;
}): WeddingVendorQuoteReplyUiCopyState {
  const draftBlocked = input.draftPersistence?.blocksExternalSend === true;
  const providerBlocked = input.providerReadiness ? !input.providerReadiness.productionReady : false;
  const proofWarning = input.proofPersistence?.tone === "warning" || input.receiptPersistence?.needsAttention === true;
  const failureDetail = clean(input.flow.failureMessage) || null;
  const telemetryEvent = failureTelemetryEvent(input);
  return {
    sendStatusCopy: providerSendStatusCopy(input),
    draftNoticeRole: draftBlocked ? "alert" : "status",
    draftNoticeAriaLive: draftBlocked ? "assertive" : "polite",
    providerNoticeRole: providerBlocked ? "alert" : "status",
    providerNoticeAriaLive: providerBlocked ? "assertive" : "polite",
    proofNoticeRole: proofWarning ? "alert" : "status",
    proofNoticeAriaLive: proofWarning ? "assertive" : "polite",
    failureNoticeTitle: providerBlocked ? "Provider setup needed" : "Could not send yet",
    failureNoticeDetail: failureDetail,
    failureNoticeTone: failureDetail ? "critical" : providerBlocked || draftBlocked || proofWarning ? "warning" : "neutral",
    failureTelemetryEvent: telemetryEvent,
    undoStatusLabel: "The reply is still inside OmnyID and can be stopped.",
    sentStatusLabel: input.receiptPersistence?.sentStatusLabel ?? (proofWarning
      ? "The provider send finished, but proof storage still needs attention."
      : "The provider send finished and proof is available."),
  };
}
