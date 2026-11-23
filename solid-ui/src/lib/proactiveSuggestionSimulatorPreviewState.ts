// @locs-version: 1.0
import type {
  ApprovalReviewLike,
  AutonomyDecisionLike,
} from "afp-ts/continuity";
import { approvalReviewTrustBlockState } from "@/lib/approvalReviewSummaryState";

export type ProactiveSuggestionSimulatorPreviewPanelState = {
  showPanel: boolean;
  showApprovalPreview: boolean;
  showReversiblePreview: boolean;
  showFusionPreview: boolean;
  approvalKindLabelText: string | null;
  showApprovalKindLabel: boolean;
  boundarySummaryText: string;
  showBoundarySummary: boolean;
  sourceSummaryText: string | null;
  showSourceSummary: boolean;
  persistenceReasonText: string | null;
  showPersistenceReason: boolean;
  rolloutSummaryText: string | null;
  showRolloutSummary: boolean;
  consequencePreviewText: string | null;
  showConsequencePreview: boolean;
  provenanceCueText: string | null;
  showProvenanceCue: boolean;
  draftPreviewTitleText: string | null;
  showDraftPreviewTitle: boolean;
  draftPreviewSummaryText: string | null;
  showDraftPreviewSummary: boolean;
  primarySourceRef: string | null;
  showPrimarySourceRef: boolean;
};

function trimmed(value: string | null | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

function normalizeTrustText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/[.]+$/g, "").toLowerCase();
}

export function proactiveSuggestionSimulatorPreviewPanelState(input: {
  artifactPreviewOpen: boolean;
  hasActionPayload: boolean;
  simulatorPreviewReviewAvailable: boolean;
  showApprovalPreview: boolean;
  showReversiblePreview: boolean;
  showFusionPreview: boolean;
  approvalKindLabelText?: string | null;
  boundarySummaryText: string;
  sourceSummaryText?: string | null;
  persistenceReasonText?: string | null;
  rolloutSummaryText?: string | null;
  consequencePreviewText?: string | null;
  provenanceCueText?: string | null;
  draftPreviewTitleText?: string | null;
  draftPreviewSummaryText?: string | null;
  primarySourceRef?: string | null;
  approvalReview?: ApprovalReviewLike | null;
  autonomyDecision?: AutonomyDecisionLike | null;
  fallbackReasonText?: string | null;
}): ProactiveSuggestionSimulatorPreviewPanelState {
  const approvalReviewTrust = approvalReviewTrustBlockState({
    approvalReview: input.approvalReview,
    autonomyDecision: input.autonomyDecision,
    fallbackReason: input.fallbackReasonText,
  });
  const sourceSummaryText = trimmed(input.sourceSummaryText);
  const consequencePreviewText = trimmed(input.consequencePreviewText);
  const provenanceCueText = trimmed(input.provenanceCueText);
  const dedupedSourceSummaryText =
    normalizeTrustText(sourceSummaryText) === normalizeTrustText(approvalReviewTrust.sourceSummary)
      ? null
      : sourceSummaryText;
  const dedupedConsequencePreviewText =
    normalizeTrustText(consequencePreviewText)
      === normalizeTrustText(approvalReviewTrust.consequencePreview)
      ? null
      : consequencePreviewText;
  const dedupedProvenanceCueText =
    normalizeTrustText(provenanceCueText) === normalizeTrustText(approvalReviewTrust.provenanceCue)
      ? null
      : provenanceCueText;

  return {
    showPanel:
      input.artifactPreviewOpen
      && !input.hasActionPayload
      && input.simulatorPreviewReviewAvailable,
    showApprovalPreview: input.showApprovalPreview,
    showReversiblePreview: input.showReversiblePreview,
    showFusionPreview: input.showFusionPreview,
    approvalKindLabelText: trimmed(input.approvalKindLabelText),
    showApprovalKindLabel: Boolean(trimmed(input.approvalKindLabelText)),
    boundarySummaryText: input.boundarySummaryText,
    showBoundarySummary: Boolean(input.boundarySummaryText.trim()),
    sourceSummaryText: dedupedSourceSummaryText,
    showSourceSummary: Boolean(dedupedSourceSummaryText),
    persistenceReasonText: trimmed(input.persistenceReasonText),
    showPersistenceReason: Boolean(trimmed(input.persistenceReasonText)),
    rolloutSummaryText: trimmed(input.rolloutSummaryText),
    showRolloutSummary: Boolean(trimmed(input.rolloutSummaryText)),
    consequencePreviewText: dedupedConsequencePreviewText,
    showConsequencePreview: Boolean(dedupedConsequencePreviewText),
    provenanceCueText: dedupedProvenanceCueText,
    showProvenanceCue: Boolean(dedupedProvenanceCueText),
    draftPreviewTitleText: trimmed(input.draftPreviewTitleText),
    showDraftPreviewTitle: Boolean(trimmed(input.draftPreviewTitleText)),
    draftPreviewSummaryText: trimmed(input.draftPreviewSummaryText),
    showDraftPreviewSummary: Boolean(trimmed(input.draftPreviewSummaryText)),
    primarySourceRef: trimmed(input.primarySourceRef),
    showPrimarySourceRef: Boolean(trimmed(input.primarySourceRef)),
  };
}
