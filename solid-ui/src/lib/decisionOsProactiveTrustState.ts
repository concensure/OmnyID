// @locs-version: 1.0
import {
  boundedReasonSummary,
  consequencePreviewSummary,
  hasDistinctReasonSummary,
  priorityRationaleSummary,
  provenanceCueSummary,
  sourceCountSummary,
} from "afp-ts/continuity";

import { autonomyDecisionFromUnknown } from "@/lib/approvalReviewState";
import { autonomySummaryWithFallback } from "@/lib/autonomyDecisionState";
import { decisionOsContextPackTrustState } from "@/lib/decisionOsContextPackPresentationState";
import { decisionOsPreparedDraftTrustState } from "@/lib/decisionosPreparedWorkState";

type DecisionOsProactiveTrustInput = {
  kind?: string | null;
  pack_kind?: string | null;
  draft_class?: string | null;
  selection_reason?: string | null;
  requires_approval?: boolean | null;
  readiness?: string | null;
  response_due_hint?: string | null;
  source_refs?: string[];
  evidence_kinds?: string[];
  approval_or_reversibility_hint?: string | null;
  provenance_cue?: string | null;
  autonomy_tier?: string | null;
  autonomy_decision?: unknown;
  simulator_bounded_reason?: string | null;
  simulator_has_distinct_selection_reason?: boolean | null;
  simulator_consequence_preview?: string | null;
  simulator_provenance_cue?: string | null;
  simulator_source_summary?: string | null;
  simulator_autonomy_summary?: string | null;
};

export type DecisionOsProactiveTrustState = {
  boundedReasonText: string | null;
  distinctSelectionReasonText: string | null;
  priorityRationaleText: string | null;
  consequenceSummaryText: string | null;
  provenanceSummaryText: string | null;
  sourceSummaryText: string | null;
  autonomySummaryText: string | null;
};

export type DecisionOsProactivePrimaryTrustBlockInput = {
  boundedReasonText?: string | null;
  selectionReasonText?: string | null;
  consequencePreviewText?: string | null;
  provenanceCueText?: string | null;
  sourceSummaryText?: string | null;
  confidenceText?: string | null;
  hasApprovalReview?: boolean;
  isSimulatorReviewPreview?: boolean;
};

export type DecisionOsProactivePrimaryTrustBlockState = {
  boundedReasonText: string | null;
  selectionReasonText: string | null;
  consequencePreviewText: string | null;
  provenanceCueText: string | null;
  sourceSummaryText: string | null;
  confidenceText: string | null;
  showSharedTrustBlocks: boolean;
  showHeaderConfidence: boolean;
  showFooterSourceSummary: boolean;
};

function trimmed(value: string | null | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

export function decisionOsProactiveTrustState(
  input: DecisionOsProactiveTrustInput,
): DecisionOsProactiveTrustState {
  const contextPackTrust =
    input.kind === "context_pack" || input.kind === "context_ready"
      ? decisionOsContextPackTrustState({
        kind: input.kind,
        pack_kind: input.pack_kind ?? "",
        why_surfaced: input.selection_reason ?? null,
        source_refs: input.source_refs ?? [],
      })
      : null;
  const preparedDraftTrust = input.kind === "prepared_draft"
    ? decisionOsPreparedDraftTrustState({
      draft_class: input.draft_class ?? "",
      requires_approval: input.requires_approval ?? false,
      readiness: input.readiness ?? "",
      response_due_hint: input.response_due_hint ?? "",
      source_refs: input.source_refs ?? [],
      approval_or_reversibility_hint: input.approval_or_reversibility_hint ?? null,
      provenance_cue: input.provenance_cue ?? null,
      autonomy_tier: input.autonomy_tier ?? null,
      autonomy_decision: autonomyDecisionFromUnknown(input.autonomy_decision),
    })
    : null;
  const boundedReasonText =
    trimmed(input.simulator_bounded_reason)
    ?? boundedReasonSummary({
      kind: input.kind ?? null,
      pack_kind: input.pack_kind ?? null,
      draft_class: input.draft_class ?? null,
      urgency: input.readiness === "ready_now" ? "today" : null,
      response_due_hint: input.response_due_hint ?? null,
      selection_reason: input.selection_reason ?? null,
    });
  const selectionReasonText = trimmed(input.selection_reason);
  const hasDistinctSelectionReason = typeof input.simulator_has_distinct_selection_reason === "boolean"
    ? input.simulator_has_distinct_selection_reason
    : hasDistinctReasonSummary(selectionReasonText, boundedReasonText);
  const rawPriorityRationaleText =
    contextPackTrust?.priorityRationaleText
    ?? priorityRationaleSummary({
      kind: input.kind ?? null,
      pack_kind: input.pack_kind ?? null,
      draft_class: input.draft_class ?? null,
      requires_approval: input.requires_approval ?? false,
      readiness: input.readiness ?? null,
      response_due_hint: input.response_due_hint ?? null,
      source_refs: input.source_refs ?? [],
    });
  const priorityRationaleText =
    hasDistinctReasonSummary(rawPriorityRationaleText, boundedReasonText)
    && hasDistinctReasonSummary(rawPriorityRationaleText, selectionReasonText)
      ? rawPriorityRationaleText
      : null;
  const sourceSummaryText =
    trimmed(input.simulator_source_summary)
    ?? sourceCountSummary(input.source_refs ?? []);

  return {
    boundedReasonText,
    distinctSelectionReasonText: hasDistinctSelectionReason ? selectionReasonText : null,
    priorityRationaleText,
    consequenceSummaryText:
      trimmed(input.simulator_consequence_preview)
      ?? contextPackTrust?.consequenceSummaryText
      ?? preparedDraftTrust?.consequencePreview
      ?? trimmed(input.approval_or_reversibility_hint)
      ?? consequencePreviewSummary({
        kind: input.kind ?? null,
        pack_kind: input.pack_kind ?? null,
        draft_class: input.draft_class ?? null,
        requires_approval: input.requires_approval ?? false,
        readiness: input.readiness ?? null,
        response_due_hint: input.response_due_hint ?? null,
      }),
    provenanceSummaryText:
      trimmed(input.simulator_provenance_cue)
      ?? contextPackTrust?.provenanceSummaryText
      ?? preparedDraftTrust?.provenanceCue
      ?? trimmed(input.provenance_cue)
      ?? provenanceCueSummary({
        kind: input.kind ?? null,
        pack_kind: input.pack_kind ?? null,
        draft_class: input.draft_class ?? null,
        source_refs: input.source_refs ?? [],
        evidence_kinds: input.evidence_kinds ?? [],
      }),
    sourceSummaryText,
    autonomySummaryText:
      trimmed(input.simulator_autonomy_summary)
      ?? preparedDraftTrust?.autonomySummary
      ?? autonomySummaryWithFallback({
        autonomyDecision: autonomyDecisionFromUnknown(input.autonomy_decision),
        autonomyTier: input.autonomy_tier ?? null,
        requiresApproval: input.requires_approval ?? null,
      }),
  };
}

export function decisionOsProactivePrimaryTrustBlockState(
  input: DecisionOsProactivePrimaryTrustBlockInput,
): DecisionOsProactivePrimaryTrustBlockState {
  const boundedReasonText = trimmed(input.boundedReasonText);
  const selectionReasonText = trimmed(input.selectionReasonText);
  const consequencePreviewText = trimmed(input.consequencePreviewText);
  const provenanceCueText = trimmed(input.provenanceCueText);
  const sourceSummaryText = trimmed(input.sourceSummaryText);
  const confidenceText = trimmed(input.confidenceText);
  const showSharedTrustBlocks =
    !input.hasApprovalReview
    && !input.isSimulatorReviewPreview
    && Boolean(
      boundedReasonText
      || selectionReasonText
      || consequencePreviewText
      || provenanceCueText
      || sourceSummaryText
      || confidenceText,
    );
  const showFooterSourceSummary =
    Boolean(sourceSummaryText)
    && !showSharedTrustBlocks
    && !input.hasApprovalReview
    && !input.isSimulatorReviewPreview;

  return {
    boundedReasonText,
    selectionReasonText,
    consequencePreviewText,
    provenanceCueText,
    sourceSummaryText,
    confidenceText,
    showSharedTrustBlocks,
    showHeaderConfidence: Boolean(confidenceText) && !showSharedTrustBlocks,
    showFooterSourceSummary,
  };
}
