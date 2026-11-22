// @locs-version: 1.0
import type { WeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import type { WeddingApprovalExecutionState } from "@/lib/weddingApprovalExecutionState";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import type { WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import type { WeddingSemanticUiObject } from "@/lib/weddingSemanticUiState";

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
  createdAt: string | null;
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

export type WeddingVendorQuoteReplyDraftPersistenceStatus = "idle" | "saving" | "saved" | "local_only";

export type WeddingVendorQuoteReplyDraftPersistenceState = {
  status: WeddingVendorQuoteReplyDraftPersistenceStatus;
  tone: "neutral" | "success" | "warning";
  label: string;
  detail: string;
  blocksApproval: boolean;
  blocksExternalSend: boolean;
};

export type WeddingVendorQuoteReplyDraftSaveCompletionState = { shouldApply: boolean };
export type WeddingVendorQuoteReplyExecutionSelectionState = { execution: WeddingApprovalExecutionState | null };
export type WeddingVendorQuoteReplyRequestMatchState = { matches: boolean };

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

export type WeddingVendorQuoteReplySecondaryActionKind = "view_quote" | "edit_reply";

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
  primaryAction: { kind: WeddingVendorQuoteReplyPrimaryActionKind; label: string; enabled: boolean };
  secondaryAction: { kind: WeddingVendorQuoteReplySecondaryActionKind; label: string } | null;
};

export type WeddingVendorQuoteReplyHomeSurfaceState = {
  quoteActionLabel: string;
  quoteActionKind: "open_attachment" | "show_quote_details";
  replyActionLabel: string;
  replyActionKind: "open_reply_editor" | "review_send" | "review_budget" | "resolve_blocker";
  budgetImpactLabel: string | null;
};

export type WeddingVendorQuoteReplyPendingSendTokenState = { stillCurrent: boolean };
export type WeddingVendorQuoteReplyBusyLabelState = { label: string | null };
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
export type WeddingVendorQuoteReplyScheduledSendGateFlowState = { flowCanSend: boolean };
