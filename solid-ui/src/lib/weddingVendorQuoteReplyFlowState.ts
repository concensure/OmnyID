// @locs-version: 1.0
import {
  buildWeddingApprovalRequestState,
  type WeddingApprovalRequestState,
} from "@/lib/weddingApprovalState";
import type { WeddingApprovalExecutionState } from "@/lib/weddingApprovalExecutionState";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import type { WeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";
import type { WeddingSemanticUiObject } from "@/lib/weddingSemanticUiState";

export {
  weddingVendorQuoteDraftAfpSendInput,
  weddingVendorQuoteIncomingAfpMessage,
} from "@/lib/weddingVendorQuoteReplyAfpState";

export type WeddingVendorQuoteReplyFlowStage =
  | "quote_received"
  | "draft_ready"
  | "needs_budget_acknowledgement"
  | "ready_to_send"
  | "sending_undo_window"
  | "sent"
  | "blocked";

export type WeddingVendorQuoteReplyInput = {
  quote: WeddingArtifactQuotePreview;
  metadata?: unknown;
  recipient: string;
  subject: string;
  draftBody: string;
  quoteMessageId?: string | null;
  draftMessageId?: string | null;
  approvedWording?: boolean | null;
  budgetImpactAcknowledged?: boolean | null;
  undoUntilIso?: string | null;
  nowIso?: string | null;
  execution?: WeddingApprovalExecutionState | null;
  createdAt?: string | null;
};

export type WeddingVendorQuoteReplyFlowState = {
  id: string;
  threadId: string;
  stage: WeddingVendorQuoteReplyFlowStage;
  title: string;
  summary: string;
  quote: WeddingArtifactQuotePreview;
  metadata: WeddingPlanningMetadata;
  recipient: string;
  subject: string;
  draftBody: string;
  recommendationLabel: string;
  recommendationRationale: string;
  recommendationWhyLabels: string[];
  recommendationConfidenceLabel: string;
  quoteMessageId: string | null;
  draftMessageId: string | null;
  approvalRequest: WeddingApprovalRequestState;
  approvedWording: boolean;
  budgetImpactAcknowledged: boolean;
  canApproveWording: boolean;
  canSend: boolean;
  undoUntilIso: string | null;
  sentConfirmationLabel: string | null;
  sentReceiptId: string | null;
  failureMessage: string | null;
  execution: WeddingApprovalExecutionState | null;
  semanticObject: WeddingSemanticUiObject;
};

export type WeddingVendorQuoteReplyDraftEditEffect = {
  changed: boolean;
  approvedWording: boolean;
  clearExecution: boolean;
};

export type WeddingVendorQuoteReplyEditorDirtyState = {
  dirty: boolean;
  approvalMatchesSavedDraft: boolean;
  sendBlockedReason: string | null;
};

export type WeddingVendorQuoteReplyDraftSyncState = {
  draft: string;
  syncedDraftBody: string;
  adoptedSavedDraft: boolean;
};

export type WeddingVendorQuoteReplyDraftPersistenceStatus =
  | "idle"
  | "saving"
  | "saved"
  | "local_only";

export type WeddingVendorQuoteReplyDraftPersistenceState = {
  status: WeddingVendorQuoteReplyDraftPersistenceStatus;
  tone: "neutral" | "success" | "warning";
  label: string;
  detail: string;
  blocksApproval: boolean;
  blocksExternalSend: boolean;
};

export type WeddingVendorQuoteReplyDraftSaveCompletionState = {
  shouldApply: boolean;
};

export type WeddingVendorQuoteReplyExecutionSelectionState = {
  execution: WeddingApprovalExecutionState | null;
};

export type WeddingVendorQuoteReplyRequestMatchState = {
  matches: boolean;
};

export type WeddingVendorQuoteReplySendGateBlocker =
  | "dirty_draft"
  | "draft_persistence"
  | "approval"
  | "provider"
  | "busy";

export type WeddingVendorQuoteReplySendGateState = {
  canStartSend: boolean;
  blockedBy: WeddingVendorQuoteReplySendGateBlocker | null;
  blockedReason: string | null;
};

export type WeddingVendorQuoteReplyConsentChangeState = {
  shouldRecord: boolean;
  ignoredReason: "not_checked" | "blocked" | "already_recorded" | null;
};

export type WeddingVendorQuoteReplyProofPersistenceState = {
  tone: "success" | "warning";
  label: string;
  detail: string;
  actionLabel: string;
};

export type WeddingVendorQuoteReplyPrimaryActionKind =
  | "save_reply"
  | "approve_wording"
  | "acknowledge_budget"
  | "send"
  | "resolve_blocker"
  | "undo_send"
  | "view_sent_log";

export type WeddingVendorQuoteReplySecondaryActionKind =
  | "view_quote"
  | "edit_reply";

export type WeddingVendorQuoteReplyPresentationState = {
  sendButtonLabel: string;
  primaryActionKind: WeddingVendorQuoteReplyPrimaryActionKind;
  primaryActionLabel: string;
  secondaryActionKind: WeddingVendorQuoteReplySecondaryActionKind | null;
  secondaryActionLabel: string | null;
  budgetAcknowledgementLabel: string | null;
  undoTitle: string | null;
  undoDetail: string | null;
  eyebrowLabel: string;
  decisionPromptLabel: string;
  replySectionLabel: string;
  showReplyEditor: boolean;
  readOnlyReplyLabel: string | null;
};

export type WeddingVendorQuoteReplyContextualSurfaceState = {
  lifecycleStage: "decision_surfaced" | "action_taken" | "resolved";
  surfaceWeight: "full_card" | "receipt";
  statusLabel: string;
  recommendationLabel: string;
  rationaleLabel: string;
  confidenceLabel: string;
  whyLabels: string[];
  primaryAction: {
    kind: WeddingVendorQuoteReplyPrimaryActionKind;
    label: string;
    enabled: boolean;
  };
  secondaryAction: {
    kind: WeddingVendorQuoteReplySecondaryActionKind;
    label: string;
  } | null;
};

export type WeddingVendorQuoteReplyHomeSurfaceState = {
  quoteActionLabel: string;
  quoteActionKind: "open_attachment" | "show_quote_details";
  replyActionLabel: string;
  replyActionKind: "open_reply_editor" | "review_send" | "review_budget" | "resolve_blocker";
  budgetImpactLabel: string | null;
};

export type WeddingVendorQuoteReplyPendingSendTokenState = {
  stillCurrent: boolean;
};

export type WeddingVendorQuoteReplyBusyLabelState = {
  label: string | null;
};

export type WeddingVendorQuoteReplyPendingSendRetryState = {
  shouldRetry: boolean;
  nextUndoUntilIso: string | null;
  delayMs: number;
  notice: string | null;
};

export type WeddingVendorQuoteReplyScheduledSendResolutionState = {
  canExecute: boolean;
  request: WeddingApprovalRequestState | null;
  blockedReason: string | null;
};

export type WeddingVendorQuoteReplyScheduledSendGateFlowState = {
  flowCanSend: boolean;
};

const DURABLE_SENT_RECEIPT_METADATA_KEYS = [
  "external_id",
  "provider_receipt_id",
  "provider_message_id",
  "message_id",
] as const;
const MAX_VENDOR_QUOTE_REPLY_UNDO_WINDOW_MS = 2 * 60 * 1000;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function displayDateTime(value: string | null | undefined): string | null {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function weddingVendorQuoteReplyDurableSentReceiptId(
  execution?: WeddingApprovalExecutionState | null,
): string | null {
  if (execution?.status !== "executed") return null;
  if (execution.actionKind !== "send_email" || execution.receipt.actionKind !== "send_email") return null;
  if (execution.receipt.status !== "executed") return null;
  const metadata = execution.receipt.metadata ?? {};
  if (metadata.external_delivery_performed !== true) return null;
  if (metadata.missing_durable_provider_receipt === true) return null;
  if (metadata.provider_result_ok === false) return null;
  const externalId = clean(execution.externalId);
  if (externalId) return externalId;
  for (const key of DURABLE_SENT_RECEIPT_METADATA_KEYS) {
    const metadataId = clean(metadata[key]);
    if (metadataId) return metadataId;
  }
  return null;
}

export function weddingVendorQuoteReplyDraftEditEffect(input: {
  previousDraft?: string | null;
  nextDraft?: string | null;
  approvedWording?: boolean | null;
  hadExecution?: boolean | null;
}): WeddingVendorQuoteReplyDraftEditEffect {
  const changed = clean(input.previousDraft) !== clean(input.nextDraft);
  return {
    changed,
    approvedWording: changed ? false : input.approvedWording === true,
    clearExecution: changed && input.hadExecution === true,
  };
}

export function weddingVendorQuoteReplyEditorDirtyState(input: {
  savedDraft?: string | null;
  editorDraft?: string | null;
  approvedWording?: boolean | null;
}): WeddingVendorQuoteReplyEditorDirtyState {
  const dirty = clean(input.savedDraft) !== clean(input.editorDraft);
  return {
    dirty,
    approvalMatchesSavedDraft: !dirty && input.approvedWording === true,
    sendBlockedReason: dirty
      ? "Save the edited reply before sending so approval applies to the latest wording."
      : null,
  };
}

export function weddingVendorQuoteReplyDraftSyncState(input: {
  currentDraft?: string | null;
  previousSavedDraft?: string | null;
  nextSavedDraft?: string | null;
}): WeddingVendorQuoteReplyDraftSyncState {
  const currentDraft = input.currentDraft ?? "";
  const previousSavedDraft = input.previousSavedDraft ?? "";
  const nextSavedDraft = input.nextSavedDraft ?? "";
  if (nextSavedDraft === previousSavedDraft) {
    return {
      draft: currentDraft,
      syncedDraftBody: previousSavedDraft,
      adoptedSavedDraft: false,
    };
  }
  return {
    draft: currentDraft === previousSavedDraft ? nextSavedDraft : currentDraft,
    syncedDraftBody: nextSavedDraft,
    adoptedSavedDraft: currentDraft === previousSavedDraft,
  };
}

export function weddingVendorQuoteReplyDraftPersistenceState(input: {
  status?: WeddingVendorQuoteReplyDraftPersistenceStatus | null;
}): WeddingVendorQuoteReplyDraftPersistenceState {
  if (input.status === "saving") {
    return {
      status: "saving",
      tone: "neutral",
      label: "Saving reply",
      detail: "OmnyID is saving the latest wording to this wedding before it can be approved or sent.",
      blocksApproval: true,
      blocksExternalSend: true,
    };
  }
  if (input.status === "saved") {
    return {
      status: "saved",
      tone: "success",
      label: "Reply saved",
      detail: "The latest wording is saved to this wedding record.",
      blocksApproval: false,
      blocksExternalSend: false,
    };
  }
  if (input.status === "local_only") {
    return {
      status: "local_only",
      tone: "warning",
      label: "Reply saved only on this device",
      detail: "Save it to the wedding record before approving or sending so there is a durable thread history.",
      blocksApproval: true,
      blocksExternalSend: true,
    };
  }
  return {
    status: "idle",
    tone: "neutral",
    label: "Reply draft",
    detail: "Save changes before approving or sending.",
    blocksApproval: false,
    blocksExternalSend: false,
  };
}

export function weddingVendorQuoteReplyDraftSaveCompletionState(input: {
  attemptId?: number | null;
  currentAttemptId?: number | null;
}): WeddingVendorQuoteReplyDraftSaveCompletionState {
  return {
    shouldApply: Number.isFinite(input.attemptId)
      && Number.isFinite(input.currentAttemptId)
      && input.attemptId === input.currentAttemptId,
  };
}

export function weddingVendorQuoteReplyExecutionSelectionState(input: {
  localExecution?: WeddingApprovalExecutionState | null;
  persistedExecution?: WeddingApprovalExecutionState | null;
  cleared?: boolean | null;
}): WeddingVendorQuoteReplyExecutionSelectionState {
  if (input.localExecution) return { execution: input.localExecution };
  return {
    execution: input.cleared === true ? null : input.persistedExecution ?? null,
  };
}

export function weddingVendorQuoteReplyRequestMatchState(input: {
  requestId?: string | null;
  currentRequestId?: string | null;
}): WeddingVendorQuoteReplyRequestMatchState {
  const requestId = clean(input.requestId);
  const currentRequestId = clean(input.currentRequestId);
  return {
    matches: Boolean(requestId && currentRequestId && requestId === currentRequestId),
  };
}

export function weddingVendorQuoteReplySendGateState(input: {
  flowCanSend?: boolean | null;
  dirtyState?: WeddingVendorQuoteReplyEditorDirtyState | null;
  draftPersistence?: WeddingVendorQuoteReplyDraftPersistenceState | null;
  providerReadiness?: WeddingProviderExecutorReadinessState | null;
  busy?: boolean | null;
}): WeddingVendorQuoteReplySendGateState {
  if (input.dirtyState?.dirty) {
    return {
      canStartSend: false,
      blockedBy: "dirty_draft",
      blockedReason: input.dirtyState.sendBlockedReason,
    };
  }
  if (input.draftPersistence?.blocksExternalSend) {
    return {
      canStartSend: false,
      blockedBy: "draft_persistence",
      blockedReason: input.draftPersistence.detail,
    };
  }
  if (input.flowCanSend !== true) {
    return {
      canStartSend: false,
      blockedBy: "approval",
      blockedReason: "Review the wording and budget acknowledgement before sending.",
    };
  }
  if (input.providerReadiness && !input.providerReadiness.productionReady) {
    return {
      canStartSend: false,
      blockedBy: "provider",
      blockedReason: input.providerReadiness.detail,
    };
  }
  if (input.busy === true) {
    return {
      canStartSend: false,
      blockedBy: "busy",
      blockedReason: "OmnyID is still finishing the current approval step.",
    };
  }
  return {
    canStartSend: true,
    blockedBy: null,
    blockedReason: null,
  };
}

export function weddingVendorQuoteReplyConsentChangeState(input: {
  checked?: boolean | null;
  blocked?: boolean | null;
  alreadyRecorded?: boolean | null;
}): WeddingVendorQuoteReplyConsentChangeState {
  if (input.alreadyRecorded === true) {
    return {
      shouldRecord: false,
      ignoredReason: "already_recorded",
    };
  }
  if (input.checked !== true) {
    return {
      shouldRecord: false,
      ignoredReason: "not_checked",
    };
  }
  if (input.blocked === true) {
    return {
      shouldRecord: false,
      ignoredReason: "blocked",
    };
  }
  return {
    shouldRecord: true,
    ignoredReason: null,
  };
}

export function weddingVendorQuoteReplyProofPersistenceState(input: {
  notice?: string | null;
}): WeddingVendorQuoteReplyProofPersistenceState | null {
  const notice = clean(input.notice);
  if (!notice) return null;
  const warning = /could not|until account saving|but/i.test(notice);
  return warning
    ? {
      tone: "warning",
      label: "Sent, proof still needs attention",
      detail: notice,
      actionLabel: "View saved thread",
    }
    : {
      tone: "success",
      label: "Sent proof saved",
      detail: notice,
      actionLabel: "View what was sent",
    };
}

export function weddingVendorQuoteReplyPresentationState(input: {
  flow: Pick<WeddingVendorQuoteReplyFlowState, "quote" | "stage" | "failureMessage" | "undoUntilIso" | "canSend">;
  dirtyState?: WeddingVendorQuoteReplyEditorDirtyState | null;
  draftPersistence?: WeddingVendorQuoteReplyDraftPersistenceState | null;
  nowIso?: string | null;
}): WeddingVendorQuoteReplyPresentationState {
  const vendorName = clean(input.flow.quote.vendorName) || "vendor";
  const budgetDelta = clean(input.flow.quote.budgetDeltaLabel);
  const attachmentUrl = clean(input.flow.quote.attachmentUrl);
  const undoUntil = clean(input.flow.undoUntilIso);
  const dirty = input.dirtyState?.dirty === true;
  const draftPersistenceBlocksSend = input.draftPersistence?.blocksExternalSend === true;
  const nowMs = Date.parse(clean(input.nowIso) || new Date().toISOString());
  const undoUntilMs = Date.parse(undoUntil);
  const remainingSeconds = Number.isFinite(nowMs) && Number.isFinite(undoUntilMs)
    ? Math.max(1, Math.ceil((undoUntilMs - nowMs) / 1000))
    : null;
  const sendButtonLabel = dirty
    ? "Save reply first"
    : draftPersistenceBlocksSend
      ? "Save to wedding first"
      : input.flow.failureMessage
        ? input.flow.canSend
          ? "Try sending again"
          : "Send unavailable"
        : `Send to ${vendorName}`;
  const primaryActionKind: WeddingVendorQuoteReplyPrimaryActionKind = dirty || draftPersistenceBlocksSend
    ? "save_reply"
    : input.flow.stage === "draft_ready" || input.flow.stage === "quote_received"
      ? "approve_wording"
      : input.flow.stage === "needs_budget_acknowledgement"
        ? "acknowledge_budget"
        : input.flow.stage === "ready_to_send" || (input.flow.stage === "blocked" && input.flow.canSend)
          ? "send"
          : input.flow.stage === "sending_undo_window"
            ? "undo_send"
            : input.flow.stage === "sent"
              ? "view_sent_log"
              : "resolve_blocker";
  const primaryActionLabel = primaryActionKind === "approve_wording"
    ? "Approve wording"
    : primaryActionKind === "acknowledge_budget"
      ? "Confirm budget impact"
      : primaryActionKind === "send"
        ? sendButtonLabel
        : primaryActionKind === "undo_send"
          ? "Undo send"
          : primaryActionKind === "view_sent_log"
            ? "View what was sent"
            : primaryActionKind === "resolve_blocker"
              ? "Resolve before sending"
              : sendButtonLabel;
  const showReplyEditor = input.flow.stage === "draft_ready" || dirty || draftPersistenceBlocksSend;
  const eyebrowLabel = input.flow.stage === "sent"
    ? "Decision logged"
    : input.flow.stage === "sending_undo_window"
      ? "Undo window"
      : input.flow.stage === "ready_to_send"
        ? "Ready for your decision"
        : input.flow.stage === "needs_budget_acknowledgement"
          ? "Needs your decision"
          : input.flow.stage === "blocked"
            ? "Needs attention"
            : "Needs your review";
  const decisionPromptLabel = dirty
    ? "Save the edited reply before OmnyID can send it."
    : draftPersistenceBlocksSend
      ? "Save this reply to the wedding thread before using the connected email provider."
      : input.flow.stage === "draft_ready"
        ? "Review the wording first. Nothing sends until you approve it."
        : input.flow.stage === "needs_budget_acknowledgement"
          ? "The wording is approved. Confirm the budget impact before sending."
          : input.flow.stage === "ready_to_send"
            ? "All checks are complete. You can send this reply now."
            : input.flow.stage === "blocked"
              ? input.flow.failureMessage || "This reply needs attention before it can be sent."
              : input.flow.stage === "sending_undo_window"
                ? "The reply has not left OmnyID yet."
                : "This decision has been saved to the wedding history.";
  return {
    sendButtonLabel,
    primaryActionKind,
    primaryActionLabel,
    secondaryActionKind: input.flow.stage === "sent"
      ? null
      : showReplyEditor
        ? "view_quote"
        : "edit_reply",
    secondaryActionLabel: input.flow.stage === "sent"
      ? null
      : showReplyEditor
        ? attachmentUrl
          ? "Open quote file"
          : "Show quote details"
        : "Edit reply",
    budgetAcknowledgementLabel: budgetDelta
      ? `I understand this is ${budgetDelta}, and I'm okay with that.`
      : null,
    undoTitle: input.flow.stage === "sending_undo_window"
      ? remainingSeconds
        ? `Sending to ${vendorName} in ${remainingSeconds}s`
        : `Sending to ${vendorName} soon`
      : null,
    undoDetail: input.flow.stage === "sending_undo_window"
      ? "The reply has not left OmnyID yet. Use Undo if you want to stop it."
      : null,
    eyebrowLabel,
    decisionPromptLabel,
    replySectionLabel: showReplyEditor
      ? "Suggested reply - edit or send as-is"
      : "Suggested reply reviewed",
    showReplyEditor,
    readOnlyReplyLabel: showReplyEditor
      ? null
      : `Reply wording is approved for ${vendorName}.`,
  };
}

export function weddingVendorQuoteReplyHomeSurfaceState(input: {
  flow: Pick<WeddingVendorQuoteReplyFlowState, "quote" | "stage" | "failureMessage" | "canSend">;
  presentation?: Pick<WeddingVendorQuoteReplyPresentationState, "budgetAcknowledgementLabel"> | null;
}): WeddingVendorQuoteReplyHomeSurfaceState {
  const hasAttachment = Boolean(clean(input.flow.quote.attachmentUrl));
  const budgetImpact = clean(input.presentation?.budgetAcknowledgementLabel)
    || (clean(input.flow.quote.budgetDeltaLabel)
      ? `Budget impact: ${clean(input.flow.quote.budgetDeltaLabel)}`
      : null);
  const replyActionKind: WeddingVendorQuoteReplyHomeSurfaceState["replyActionKind"] =
    input.flow.stage === "ready_to_send"
      ? "review_send"
      : input.flow.stage === "needs_budget_acknowledgement"
        ? "review_budget"
        : input.flow.stage === "blocked" && !input.flow.canSend
          ? "resolve_blocker"
          : "open_reply_editor";
  const replyActionLabel = replyActionKind === "review_send"
    ? "Review and send"
    : replyActionKind === "review_budget"
      ? "Review reply"
      : replyActionKind === "resolve_blocker"
        ? "Resolve setup"
        : "Suggest a reply";
  return {
    quoteActionLabel: "See the quote",
    quoteActionKind: hasAttachment ? "open_attachment" : "show_quote_details",
    replyActionLabel,
    replyActionKind,
    budgetImpactLabel: budgetImpact,
  };
}

export function weddingVendorQuoteReplyContextualSurfaceState(input: {
  flow: Pick<
    WeddingVendorQuoteReplyFlowState,
    | "quote"
    | "stage"
    | "summary"
    | "failureMessage"
    | "undoUntilIso"
    | "canSend"
    | "recommendationLabel"
    | "recommendationRationale"
    | "recommendationWhyLabels"
    | "recommendationConfidenceLabel"
    | "sentConfirmationLabel"
  >;
  dirtyState?: WeddingVendorQuoteReplyEditorDirtyState | null;
  draftPersistence?: WeddingVendorQuoteReplyDraftPersistenceState | null;
  primaryActionEnabled?: boolean | null;
  nowIso?: string | null;
}): WeddingVendorQuoteReplyContextualSurfaceState {
  const presentation = weddingVendorQuoteReplyPresentationState({
    flow: input.flow,
    dirtyState: input.dirtyState,
    draftPersistence: input.draftPersistence,
    nowIso: input.nowIso,
  });
  const vendorName = clean(input.flow.quote.vendorName) || "vendor";
  const lifecycleStage: WeddingVendorQuoteReplyContextualSurfaceState["lifecycleStage"] =
    input.flow.stage === "sent"
      ? "resolved"
      : input.flow.stage === "sending_undo_window"
        ? "action_taken"
        : "decision_surfaced";
  const statusLabel = input.flow.stage === "sent"
    ? input.flow.sentConfirmationLabel ?? `Reply sent to ${vendorName}.`
    : input.flow.stage === "sending_undo_window"
      ? presentation.undoTitle ?? `Sending to ${vendorName} soon.`
      : input.flow.stage === "blocked"
        ? input.flow.failureMessage || `The ${vendorName} quote reply needs attention.`
        : `${vendorName} sent a quote.`;
  const recommendationLabel = input.flow.stage === "sent"
    ? "Keep this as history"
    : input.flow.stage === "sending_undo_window"
      ? "Undo is still available"
      : input.flow.recommendationLabel;
  const rationaleLabel = input.flow.stage === "sent"
    ? "This workflow has left the live decision queue and is available as a saved thread proof."
    : input.flow.stage === "sending_undo_window"
      ? presentation.undoDetail ?? "The reply has not left OmnyID yet."
      : input.flow.recommendationRationale;
  return {
    lifecycleStage,
    surfaceWeight: input.flow.stage === "sent" ? "receipt" : "full_card",
    statusLabel,
    recommendationLabel,
    rationaleLabel,
    confidenceLabel: input.flow.stage === "sent" ? "Proof recorded" : input.flow.recommendationConfidenceLabel,
    whyLabels: input.flow.stage === "sent"
      ? ["The sent reply is retained in the vendor thread.", "Resolved quote replies collapse to history instead of staying in the live queue."]
      : input.flow.recommendationWhyLabels,
    primaryAction: {
      kind: presentation.primaryActionKind,
      label: presentation.primaryActionLabel,
      enabled: input.primaryActionEnabled !== false && presentation.primaryActionKind !== "resolve_blocker",
    },
    secondaryAction: presentation.secondaryActionKind && presentation.secondaryActionLabel
      ? {
        kind: presentation.secondaryActionKind,
        label: presentation.secondaryActionLabel,
      }
      : null,
  };
}

export function weddingVendorQuoteReplyPendingSendTokenState(input: {
  expectedUndoUntilIso?: string | null;
  currentUndoUntilIso?: string | null;
}): WeddingVendorQuoteReplyPendingSendTokenState {
  const expected = clean(input.expectedUndoUntilIso);
  const current = clean(input.currentUndoUntilIso);
  return {
    stillCurrent: Boolean(expected && current && expected === current),
  };
}

export function weddingVendorQuoteReplyBusyLabelState(input: {
  requestId?: string | null;
  runningRequestId?: string | null;
}): WeddingVendorQuoteReplyBusyLabelState {
  const requestId = clean(input.requestId);
  const runningRequestId = clean(input.runningRequestId);
  if (!runningRequestId) return { label: null };
  return {
    label: requestId && requestId === runningRequestId ? "Sending..." : "Waiting...",
  };
}

export function weddingVendorQuoteReplyPendingSendRetryState(input: {
  approvalRunning?: boolean | null;
  nowIso?: string | null;
}): WeddingVendorQuoteReplyPendingSendRetryState {
  if (input.approvalRunning !== true) {
    return {
      shouldRetry: false,
      nextUndoUntilIso: null,
      delayMs: 0,
      notice: null,
    };
  }
  const nowMs = Date.parse(clean(input.nowIso) || new Date().toISOString());
  const baseMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  return {
    shouldRetry: true,
    nextUndoUntilIso: new Date(baseMs + 1000).toISOString(),
    delayMs: 1000,
    notice: "Another approval is finishing. This reply will send next; Undo still works.",
  };
}

export function weddingVendorQuoteReplyScheduledSendResolutionState(input: {
  flow?: Pick<WeddingVendorQuoteReplyFlowState, "approvalRequest" | "stage"> | null;
  sendGate?: WeddingVendorQuoteReplySendGateState | null;
}): WeddingVendorQuoteReplyScheduledSendResolutionState {
  if (!input.flow) {
    return {
      canExecute: false,
      request: null,
      blockedReason: "The reply could not be sent because the quote thread is no longer available.",
    };
  }
  const isLiveUndoSend = input.flow.stage === "sending_undo_window"
    && input.flow.approvalRequest.canExecute
    && input.flow.approvalRequest.delivery !== null;
  if (input.sendGate?.blockedBy === "approval" && isLiveUndoSend) {
    return {
      canExecute: true,
      request: input.flow.approvalRequest,
      blockedReason: null,
    };
  }
  if (input.sendGate?.canStartSend !== true) {
    return {
      canExecute: false,
      request: null,
      blockedReason: input.sendGate?.blockedReason ?? "The reply could not be sent yet.",
    };
  }
  return {
    canExecute: true,
    request: input.flow.approvalRequest,
    blockedReason: null,
  };
}

export function weddingVendorQuoteReplyScheduledSendGateFlowState(input: {
  flow?: Pick<WeddingVendorQuoteReplyFlowState, "approvalRequest" | "canSend" | "stage"> | null;
}): WeddingVendorQuoteReplyScheduledSendGateFlowState {
  const flow = input.flow;
  if (!flow) return { flowCanSend: false };
  if (
    flow.stage === "sending_undo_window"
    && flow.approvalRequest.canExecute
    && flow.approvalRequest.delivery !== null
  ) {
    return { flowCanSend: true };
  }
  return { flowCanSend: flow.canSend };
}

export function weddingVendorQuoteReplyThreadId(input: {
  responseWorkspaceId?: string | null;
  vendorName: string;
  subject?: string | null;
}): string {
  return [
    "wedding_vendor_quote",
    safeWeddingLabel(input.responseWorkspaceId ?? "workspace"),
    safeWeddingLabel(input.vendorName),
    safeWeddingLabel(input.subject ?? "quote"),
  ].join(":");
}

function flowStage(input: {
  approvedWording: boolean;
  budgetImpactAcknowledged: boolean;
  undoUntilIso: string | null;
  execution: WeddingApprovalExecutionState | null;
  sentReceiptId: string | null;
  approvalRequest: WeddingApprovalRequestState;
  deliveryReady: boolean;
}): WeddingVendorQuoteReplyFlowStage {
  if (input.execution?.status === "executed") return input.sentReceiptId ? "sent" : "blocked";
  if (input.undoUntilIso) return "sending_undo_window";
  if (input.execution) return "blocked";
  if (!input.approvedWording) return "draft_ready";
  if (!input.budgetImpactAcknowledged) return "needs_budget_acknowledgement";
  return input.approvalRequest.canExecute && input.deliveryReady ? "ready_to_send" : "blocked";
}

function activeUndoUntilIso(undoUntilIso: string | null, nowIso?: string | null): string | null {
  const undoUntil = clean(undoUntilIso);
  if (!undoUntil) return null;
  const undoUntilMs = Date.parse(undoUntil);
  if (!Number.isFinite(undoUntilMs)) return null;
  const now = clean(nowIso);
  if (!now) return undoUntil;
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return null;
  if (undoUntilMs - nowMs > MAX_VENDOR_QUOTE_REPLY_UNDO_WINDOW_MS) return null;
  return undoUntilMs > nowMs ? undoUntil : null;
}

function semanticTone(stage: WeddingVendorQuoteReplyFlowStage): WeddingSemanticUiObject["tone"] {
  if (stage === "blocked") return "risk";
  if (stage === "draft_ready" || stage === "needs_budget_acknowledgement" || stage === "ready_to_send") return "action";
  return "status";
}

function semanticStateLabel(stage: WeddingVendorQuoteReplyFlowStage): string {
  const labels: Record<WeddingVendorQuoteReplyFlowStage, string> = {
    quote_received: "Quote received",
    draft_ready: "Review the reply",
    needs_budget_acknowledgement: "Confirm budget impact",
    ready_to_send: "Ready to send",
    sending_undo_window: "Sending soon",
    sent: "Sent",
    blocked: "Needs attention",
  };
  return labels[stage];
}

function buildSemanticObject(input: {
  id: string;
  stage: WeddingVendorQuoteReplyFlowStage;
  quote: WeddingArtifactQuotePreview;
  summary: string;
  recommendationRationale: string;
  canSend: boolean;
  undoUntilIso: string | null;
  failureMessage: string | null;
}): WeddingSemanticUiObject {
  const presentation = weddingVendorQuoteReplyPresentationState({
    flow: {
      quote: input.quote,
      stage: input.stage,
      failureMessage: input.failureMessage,
      undoUntilIso: input.undoUntilIso,
      canSend: input.canSend,
    },
  });
  const primaryActionKindByPresentation: Record<WeddingVendorQuoteReplyPrimaryActionKind, string> = {
    save_reply: "save_vendor_quote_reply",
    approve_wording: "approve_vendor_quote_reply_wording",
    acknowledge_budget: "acknowledge_vendor_quote_budget",
    send: "send_vendor_quote_reply",
    resolve_blocker: "resolve_vendor_quote_reply_blocker",
    undo_send: "undo_vendor_quote_reply_send",
    view_sent_log: "view_vendor_quote_reply_log",
  };
  const secondaryActionKindByPresentation: Record<WeddingVendorQuoteReplySecondaryActionKind, string> = {
    view_quote: "view_vendor_quote",
    edit_reply: "edit_vendor_quote_reply",
  };
  const actions: WeddingSemanticUiObject["actions"] = [
    {
      label: presentation.primaryActionLabel,
      kind: primaryActionKindByPresentation[presentation.primaryActionKind],
      enabled: presentation.primaryActionKind !== "resolve_blocker",
      targetMenu: input.stage === "sent" ? "response_queue" : "queue",
    },
    ...(presentation.secondaryActionKind && presentation.secondaryActionLabel
      ? [{
        label: presentation.secondaryActionLabel,
        kind: secondaryActionKindByPresentation[presentation.secondaryActionKind],
        enabled: true,
        targetMenu: "queue",
      }]
      : []),
  ];
  return {
    id: `${input.id}:semantic`,
    kind: input.stage === "blocked" ? "wedding_conflict" : "wedding_approval_required",
    title: `${input.quote.vendorName} quote reply`,
    stateLabel: semanticStateLabel(input.stage),
    tone: semanticTone(input.stage),
    summary: input.summary,
    comparison: {
      title: "Quote check",
      columns: [
        { label: "Item", kind: "text" },
        { label: "Value", kind: "price" },
        { label: "Meaning", kind: "rationale" },
      ],
      rows: [
        {
          id: "quote_amount",
          cells: ["Quote", input.quote.amountLabel, "Vendor supplied amount"],
        },
        {
          id: "budget_delta",
          cells: ["Budget impact", input.quote.budgetDeltaLabel ?? "Not measured", "Confirm before sending"],
        },
        {
          id: "recommendation_rationale",
          cells: ["Recommendation", input.canSend ? "Ready to send" : "Review needed", input.recommendationRationale],
        },
      ],
    },
    actions,
    semanticTags: uniqueStrings([
      "wedding_approval_required",
      "wedding_vendor_quote_reply",
      "wedding_budget_impact",
      input.stage,
    ]),
  };
}

export function weddingVendorQuoteRecommendationRationale(input: {
  quote: WeddingArtifactQuotePreview;
  recipient?: string | null;
  draftBody?: string | null;
}): string {
  const reasons: string[] = [];
  const vendorName = clean(input.quote.vendorName) || "this vendor";
  const budgetDelta = clean(input.quote.budgetDeltaLabel);
  const budgetDeltaAmount = typeof input.quote.budgetDeltaAmount === "number" ? input.quote.budgetDeltaAmount : null;
  const labelSaysUnderBudget = /\bunder budget|below budget|within budget|on budget\b/i.test(budgetDelta);
  const labelSaysOverBudget = /\bover budget|above budget|exceeds budget|higher than budget\b/i.test(budgetDelta);
  const appearsUnderBudget = labelSaysUnderBudget || (!labelSaysOverBudget && budgetDeltaAmount !== null && budgetDeltaAmount < 0);
  const appearsOverBudget = labelSaysOverBudget || (!labelSaysUnderBudget && budgetDeltaAmount !== null && budgetDeltaAmount > 0);
  const validUntil = clean(input.quote.validUntil);
  const attachmentUrl = clean(input.quote.attachmentUrl);
  const attachmentTextStatus = input.quote.attachmentTextStatus ?? (attachmentUrl ? "linked_unverified" : "none");
  const hasReplyTarget = Boolean(clean(input.recipient));
  const hasDraft = Boolean(clean(input.draftBody));

  if (input.quote.inclusions.length > 0) {
    const included = input.quote.inclusions.slice(0, 3).join(", ");
    reasons.push(`${vendorName} listed ${included}${input.quote.inclusions.length > 3 ? ", and more" : ""}.`);
  } else {
    reasons.push(`${vendorName} supplied a quote amount, but the inclusions still need confirmation.`);
  }

  if (budgetDelta) {
    if (appearsUnderBudget) {
      reasons.push(`The quote is ${budgetDelta}; the suggested reply asks for a provisional hold while payment and exclusion terms are confirmed.`);
    } else if (appearsOverBudget) {
      reasons.push(`The quote is ${budgetDelta}; the suggested reply asks for package adjustments before approval.`);
    } else {
      reasons.push(`The quote is ${budgetDelta}, so budget acknowledgement is required before sending.`);
    }
  } else {
    reasons.push("No measured budget variance was found, so the reply can focus on confirming availability, deposit terms, and exclusions.");
  }

  if (validUntil) reasons.push(`The offer is valid until ${validUntil}.`);
  if (attachmentTextStatus === "extracted") {
    reasons.push("Original quote attachment text was extracted; still open the file before relying on final terms.");
  } else if (attachmentUrl) {
    reasons.push("An original quote attachment is linked, but its PDF or document text has not been verified by OmnyID.");
  }
  if (!hasReplyTarget) reasons.push("Add the vendor email before OmnyID can send the reply.");
  if (!hasDraft) reasons.push("Add reply wording before approval.");
  return reasons.join(" ");
}

export function weddingVendorQuoteRecommendationHandoff(input: {
  quote: WeddingArtifactQuotePreview;
  recipient?: string | null;
  draftBody?: string | null;
}): {
  recommendationLabel: string;
  whyLabels: string[];
  confidenceLabel: string;
} {
  const budgetDelta = clean(input.quote.budgetDeltaLabel);
  const budgetDeltaAmount = typeof input.quote.budgetDeltaAmount === "number" ? input.quote.budgetDeltaAmount : null;
  const hasInclusions = input.quote.inclusions.length > 0;
  const hasValidUntil = Boolean(clean(input.quote.validUntil));
  const hasAttachment = Boolean(clean(input.quote.attachmentUrl));
  const attachmentTextStatus = input.quote.attachmentTextStatus ?? (hasAttachment ? "linked_unverified" : "none");
  const attachmentTextExtracted = attachmentTextStatus === "extracted";
  const hasReplyTarget = Boolean(clean(input.recipient));
  const hasDraft = Boolean(clean(input.draftBody));
  const appearsOverBudget = /\bover budget|above budget|exceeds budget|higher than budget\b/i.test(budgetDelta)
    || (budgetDeltaAmount !== null && budgetDeltaAmount > 0);
  const appearsUnderBudget = /\bunder budget|below budget|within budget|on budget\b/i.test(budgetDelta)
    || (budgetDeltaAmount !== null && budgetDeltaAmount < 0);

  const recommendationLabel = !hasReplyTarget || !hasDraft
    ? "Complete the reply details before sending"
    : appearsOverBudget
      ? "Ask for trade-offs before approving"
      : appearsUnderBudget
        ? "Consider a provisional hold"
        : "Review terms before sending";

  const whyLabels = [
    budgetDelta ? `Budget impact: ${budgetDelta}` : "Budget impact not measured yet",
    hasInclusions
      ? `Quote includes ${input.quote.inclusions.slice(0, 2).join(", ")}${input.quote.inclusions.length > 2 ? ", and more" : ""}`
      : "Inclusions need confirmation",
    hasValidUntil ? `Offer valid until ${clean(input.quote.validUntil)}` : "No validity date found",
    attachmentTextExtracted
      ? "Original quote attachment text was extracted; verify final terms in the file"
      : hasAttachment
        ? "Original quote attachment is linked but text extraction is not verified"
        : "No original quote attachment linked",
    ...(input.quote.attachmentEvidenceLabels ?? []).filter((label) => clean(label)).slice(0, 2),
    hasReplyTarget ? "Vendor email is present" : "Vendor email is missing",
    hasDraft ? "Reply draft is present" : "Reply wording is missing",
  ];

  const evidenceCount = [
    Boolean(budgetDelta),
    hasInclusions,
    hasValidUntil,
    !hasAttachment || attachmentTextExtracted,
    hasReplyTarget,
    hasDraft,
  ].filter(Boolean).length;
  const confidenceLabel = evidenceCount >= 6
    ? "Confidence: strong"
    : evidenceCount >= 4
      ? "Confidence: developing"
      : "Confidence: early";

  return {
    recommendationLabel,
    whyLabels,
    confidenceLabel,
  };
}

export function buildWeddingVendorQuoteReplyFlowState(
  input: WeddingVendorQuoteReplyInput,
): WeddingVendorQuoteReplyFlowState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const recipient = clean(input.recipient);
  const subject = clean(input.subject) || `${input.quote.vendorName} quote`;
  const draftBody = clean(input.draftBody);
  const recommendationRationale = weddingVendorQuoteRecommendationRationale({
    quote: input.quote,
    recipient,
    draftBody,
  });
  const recommendationHandoff = weddingVendorQuoteRecommendationHandoff({
    quote: input.quote,
    recipient,
    draftBody,
  });
  const quoteMessageId = clean(input.quoteMessageId) || null;
  const draftMessageId = clean(input.draftMessageId) || null;
  const approvedWording = input.approvedWording === true;
  const budgetImpactAcknowledged = input.budgetImpactAcknowledged === true || !input.quote.budgetDeltaLabel;
  const deliveryReferences = uniqueStrings([
    quoteMessageId,
    draftMessageId,
  ]);
  const threadId = weddingVendorQuoteReplyThreadId({
    responseWorkspaceId: metadata.responseWorkspaceId,
    vendorName: input.quote.vendorName,
    subject,
  });
  const id = `wedding_vendor_quote_reply:${safeWeddingLabel(threadId)}`;
  const approvalRequest = buildWeddingApprovalRequestState({
    id: `${id}:send`,
    actionKind: "send_email",
    title: `Send reply to ${input.quote.vendorName}`,
    metadata,
    recipients: recipient ? [recipient] : [],
    externalProvider: "Gmail",
    proposedMessage: draftBody,
    delivery: recipient && subject && draftBody
      ? {
        channel: "email",
        to: [recipient],
        subject,
        text: draftBody,
        threadId,
        references: deliveryReferences,
      }
      : null,
    decisionScopes: [
      {
        title: "Quote amount",
        detail: input.quote.amountLabel,
      },
      input.quote.budgetDeltaLabel
        ? {
          title: "Budget impact",
          detail: input.quote.budgetDeltaLabel,
        }
        : null,
    ].filter((item): item is { title: string; detail: string } => item !== null),
    userApproved: approvedWording && budgetImpactAcknowledged,
  });
  const missingDeliveryMessage = approvedWording && budgetImpactAcknowledged && !approvalRequest.delivery
    ? !recipient
      ? `Add ${input.quote.vendorName}'s email address before sending this reply.`
      : !draftBody
        ? "Add reply wording before sending this email."
        : "This reply is missing a complete email delivery payload, so OmnyID will not send it yet."
    : null;
  const sentReceiptId = weddingVendorQuoteReplyDurableSentReceiptId(input.execution);
  const undoUntilIso = activeUndoUntilIso(clean(input.undoUntilIso) || null, input.nowIso);
  const stage = flowStage({
    approvedWording,
    budgetImpactAcknowledged,
    undoUntilIso,
    execution: input.execution ?? null,
    sentReceiptId,
    approvalRequest,
    deliveryReady: approvalRequest.delivery !== null,
  });
  const sentTime = displayDateTime(input.execution?.receipt.createdAt);
  const sentConfirmationLabel = sentReceiptId
    ? `Sent to ${input.quote.vendorName}${sentTime ? ` - ${sentTime}` : ""}.`
    : null;
  const failureMessage = missingDeliveryMessage ?? (input.execution
    ? input.execution.status === "executed" && !sentReceiptId
      ? "This send record is missing a provider receipt, so OmnyID will not mark it sent yet."
      : input.execution.status !== "executed"
        ? clean(input.execution.message)
          || clean(input.execution.receipt.metadata.blocked_reason)
          || "This reply could not be sent yet."
        : null
    : null);
  const summary = stage === "sent"
    ? sentConfirmationLabel ?? "Reply sent."
    : stage === "blocked" && failureMessage
      ? failureMessage
    : stage === "needs_budget_acknowledgement"
      ? `${input.quote.amountLabel}${input.quote.budgetDeltaLabel ? `, ${input.quote.budgetDeltaLabel}` : ""}. Confirm the budget impact before sending.`
      : stage === "ready_to_send"
        ? `Reply reviewed for ${input.quote.vendorName}. Ready to send after the undo window.`
        : `${input.quote.vendorName} sent a quote for ${input.quote.amountLabel}.`;
  const canRetrySend = stage === "blocked"
    && input.execution?.canRetry === true
    && approvalRequest.delivery !== null
    && approvalRequest.canExecute;
  const canSend = stage === "ready_to_send" || canRetrySend;
  const execution = input.execution ?? null;
  return {
    id,
    threadId,
    stage,
    title: `${input.quote.vendorName} quote reply`,
    summary,
    quote: input.quote,
    metadata,
    recipient,
    subject,
    draftBody,
    recommendationLabel: recommendationHandoff.recommendationLabel,
    recommendationRationale,
    recommendationWhyLabels: recommendationHandoff.whyLabels,
    recommendationConfidenceLabel: recommendationHandoff.confidenceLabel,
    quoteMessageId,
    draftMessageId,
    approvalRequest,
    approvedWording,
    budgetImpactAcknowledged,
    canApproveWording: Boolean(draftBody && recipient),
    canSend,
    undoUntilIso,
    sentConfirmationLabel,
    sentReceiptId,
    failureMessage,
    execution,
    semanticObject: buildSemanticObject({
      id,
      stage,
      quote: input.quote,
      summary,
      recommendationRationale,
      canSend,
      undoUntilIso,
      failureMessage,
    }),
  };
}
