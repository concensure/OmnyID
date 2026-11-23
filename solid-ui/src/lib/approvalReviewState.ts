// @locs-version: 1.0
import type {
  ApprovalDraftPreview,
  ApprovalReviewLike,
  AutonomyDecisionLike,
} from "afp-ts/continuity";
import type { AfpMessage, AfpView } from "@/lib/api";
import {
  artifactSummaryDisplayedLines,
  boundedReasonSummary,
  consequencePreviewSummary,
  hasDistinctReasonSummary,
  provenanceCueSummary,
  sourceCountSummary,
} from "afp-ts/continuity";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { isRecord } from "@/lib/eventDetail";
import {
  simulatorPreviewBoundaryFallback,
  simulatorPreviewKindFromRaw,
  simulatorPreviewPersistenceFallback,
  simulatorPreviewRawKind,
  simulatorPreviewRolloutSummary,
  simulatorPreviewSummary,
  simulatorPreviewTitle,
  type SimulatorPreviewKind,
} from "@/lib/simulatorPreviewCopy";

export type SimulatorApprovalPreviewState = {
  title: string;
  summary: string;
  previewBoundarySummary: string;
  boundedReason: string | null;
  selectionReason: string | null;
  consequencePreview: string | null;
  provenanceCue: string | null;
  sourceSummary: string | null;
  approvalReview: ApprovalReviewLike | null;
  autonomyDecision: AutonomyDecisionLike | null;
};

export type SimulatorPreviewDetailState = {
  boundedReason: string | null;
  selectionReason: string | null;
  hasDistinctSelectionReason: boolean;
  consequencePreview: string | null;
  provenanceCue: string | null;
  sourceSummary: string | null;
  rolloutSummary: string | null;
  previewBoundarySummary: string | null;
  reversibilityHint: string | null;
};

export type SimulatorProactivePreviewState = {
  sourceSummary: string | null;
  persistenceReason: string | null;
  approvalKindLabel: string | null;
  draftPreview: ApprovalDraftPreview | null;
  draftPreviewSummary: string | null;
};

export type SimulatorPreviewCardSummaryState = {
  kind: "approval" | "reversible" | "fusion";
  title: string;
  boundedReason: string | null;
  leadSummaryLine: string | null;
  supportingSummaryLines: string[];
  consequencePreview: string | null;
  provenanceCue: string | null;
  sourceSummary: string | null;
  rolloutSummary: string | null;
  previewBoundarySummary: string | null;
};

export type SimulatorReviewSurfaceState = {
  kind: "approval" | "reversible" | "fusion";
  sourceSummary: string | null;
  persistenceReason: string | null;
  primarySourceRef: string | null;
  approvalKindLabel: string | null;
  draftPreview: ApprovalDraftPreview | null;
  draftPreviewSummary: string | null;
  previewBoundarySummary: string | null;
  consequencePreview: string | null;
  provenanceCue: string | null;
  rolloutSummary: string | null;
  reviewAvailable: boolean;
};

type ApprovalReviewRecordState = {
  title: string | null;
  reason: string | null;
  confidence: string | null;
  provenanceSummary: string | null;
  consequenceSummaryLines: string[];
  sourceRefs: string[];
  approvalKind: string | null;
  draftPreview: ApprovalDraftPreview | null;
  autonomyDecision: AutonomyDecisionLike | null;
};

type SimulatorPreviewRecordState = {
  kind: SimulatorPreviewKind;
  title: string | null;
  description: string | null;
  confidence: string | null;
  approvalKind: string | null;
  draftPreview: ApprovalDraftPreview | null;
  artifactSummaryLines: string[];
  sourceRefs: string[];
  evidenceKinds: string[];
  selectionReason: string | null;
  draftClass: string | null;
  readiness: string | null;
  responseDueHint: string | null;
  previewBoundarySummary: string | null;
  approvalOrReversibilityHint: string | null;
  persistedFromContinuity: boolean;
  persistenceReason: string | null;
  provenanceCue: string | null;
  explicitSourceSummary: string | null;
  rolloutSummary: string | null;
  rolloutStage: string | null;
  calibrationMode: string | null;
  reviewSurfaceAvailable: boolean;
  requiresApproval: boolean;
  urgency: string | null;
};

export function approvalStateRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function approvalMessageContent(
  message: AfpMessage,
  view?: Pick<AfpView, "content"> | null,
): Record<string, unknown> {
  return afpRecord(message.encryption ? decryptedDisplayContent(message) : view?.content ?? message.content);
}

export function approvalStateString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function proactiveAutonomyTier(value: unknown): "ask_always" | "notify_then_act" | "auto_execute" | null {
  const normalized = approvalStateString(value);
  switch (normalized) {
    case "ask_always":
    case "notify_then_act":
    case "auto_execute":
      return normalized;
    default:
      return null;
  }
}

export function approvalStateStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    )
    : [];
}

function reviewRecordState(record: Record<string, unknown>): ApprovalReviewRecordState {
  return {
    title: approvalStateString(record.title),
    reason: approvalStateString(record.reason),
    confidence: approvalStateString(record.confidence),
    provenanceSummary: approvalStateString(record.provenance_summary),
    consequenceSummaryLines: approvalStateStringArray(record.consequence_summary_lines),
    sourceRefs: approvalStateStringArray(record.source_refs),
    approvalKind: approvalStateString(record.approval_kind),
    draftPreview: approvalDraftPreviewFromUnknown(record.draft_preview),
    autonomyDecision: autonomyDecisionWithTierFallback(
      record.autonomy_decision,
      record.autonomy_tier,
    ),
  };
}

function simulatorPreviewRecordState(value: unknown): SimulatorPreviewRecordState | null {
  const record = approvalStateRecord(value);
  if (!record) return null;

  const kind = simulatorPreviewKindFromRaw(approvalStateString(record.kind));
  if (!kind) return null;

  return {
    kind,
    title: approvalStateString(record.title),
    description: approvalStateString(record.description),
    confidence: approvalStateString(record.confidence),
    approvalKind: approvalStateString(record.approval_kind),
    draftPreview: approvalDraftPreviewFromUnknown(record.draft_preview),
    artifactSummaryLines: approvalStateStringArray(record.artifact_summary_lines),
    sourceRefs: approvalStateStringArray(record.source_refs),
    evidenceKinds: approvalStateStringArray(record.evidence_kinds),
    selectionReason: approvalStateString(record.selection_reason),
    draftClass: approvalStateString(record.draft_class),
    readiness: approvalStateString(record.readiness),
    responseDueHint: approvalStateString(record.response_due_hint),
    previewBoundarySummary: approvalStateString(record.preview_boundary_summary),
    approvalOrReversibilityHint: approvalStateString(record.approval_or_reversibility_hint),
    persistedFromContinuity: record.persisted_from_continuity === true,
    persistenceReason: approvalStateString(record.persistence_reason),
    provenanceCue: approvalStateString(record.provenance_cue),
    explicitSourceSummary: approvalStateString(record.source_summary),
    rolloutSummary: approvalStateString(record.rollout_summary),
    rolloutStage: approvalStateString(record.rollout_stage),
    calibrationMode: approvalStateString(record.calibration_mode),
    reviewSurfaceAvailable: record.review_surface_available === true,
    requiresApproval: record.requires_approval === true,
    urgency: approvalStateString(record.urgency),
  };
}

function simulatorPreviewFallbackTitle(kind: SimulatorPreviewKind): string {
  return simulatorPreviewTitle(kind);
}

function simulatorPreviewFallbackSummary(kind: SimulatorPreviewKind): string {
  return simulatorPreviewSummary(kind);
}

function simulatorPreviewSummaryLineState(
  state: SimulatorPreviewRecordState,
  limit: number,
): string[] {
  return artifactSummaryDisplayedLines({
    artifact_summary_lines: state.artifactSummaryLines,
    description: state.description,
    draft_preview: state.draftPreview,
  }).slice(0, limit);
}

function simulatorPreviewBoundedReason(state: SimulatorPreviewRecordState): string | null {
  return boundedReasonSummary({
    kind: simulatorPreviewRawKind(state.kind),
    draft_class: state.draftClass ?? undefined,
    urgency: state.urgency ?? undefined,
    response_due_hint: state.responseDueHint ?? undefined,
    selection_reason: state.selectionReason ?? undefined,
  }) ?? state.description;
}

function simulatorPreviewConsequence(state: SimulatorPreviewRecordState): string | null {
  return state.approvalOrReversibilityHint
    ?? consequencePreviewSummary({
      kind: simulatorPreviewRawKind(state.kind),
      draft_class: state.draftClass ?? undefined,
      requires_approval: state.requiresApproval,
      readiness: state.readiness ?? undefined,
      response_due_hint: state.responseDueHint ?? undefined,
    });
}

function simulatorPreviewProvenance(state: SimulatorPreviewRecordState): string | null {
  return state.provenanceCue ?? provenanceCueSummary({
    kind: simulatorPreviewRawKind(state.kind),
    draft_class: state.draftClass ?? undefined,
    source_refs: state.sourceRefs,
    evidence_kinds: state.evidenceKinds,
  });
}

function simulatorPreviewRollout(state: SimulatorPreviewRecordState): string | null {
  return state.rolloutSummary ?? simulatorPreviewRolloutSummary({
    rolloutStage: state.rolloutStage,
    calibrationMode: state.calibrationMode,
    reviewSurfaceAvailable: state.reviewSurfaceAvailable,
  });
}

export function approvalDraftPreviewFromUnknown(value: unknown): ApprovalDraftPreview | null {
  const record = approvalStateRecord(value);
  if (!record) return null;
  const label = approvalStateString(record.label);
  const content = approvalStateString(record.content);
  const contentType = approvalStateString(record.content_type);
  return {
    ...(label ? { label } : {}),
    ...(content ? { content } : {}),
    ...(contentType ? { content_type: contentType } : {}),
  };
}

export function autonomyDecisionFromUnknown(value: unknown): AutonomyDecisionLike | null {
  const record = approvalStateRecord(value);
  if (!record) return null;
  const autonomyLevel = approvalStateString(record.autonomy_level);
  const approvalRequired = typeof record.approval_required === "boolean"
    ? record.approval_required
    : undefined;
  const reversibility = approvalStateString(record.reversibility)
    ?? (() => {
      if (approvalRequired === true) return "approval_required";
      if (record.reversible === true) return "reversible";
      if (record.reversible === false) return "not_reversible";
      return null;
    })();
  const consequenceLevel = approvalStateString(record.consequence_level)
    ?? approvalStateString(record.consequence);
  const confidence = approvalStateString(record.confidence);
  const interruptionBudget = approvalStateString(record.interruption_budget);
  const reason = approvalStateString(record.reason)
    ?? approvalStateString(record.rationale);
  return {
    ...(autonomyLevel ? { autonomy_level: autonomyLevel } : {}),
    ...(reversibility ? { reversibility } : {}),
    ...(consequenceLevel ? { consequence_level: consequenceLevel } : {}),
    ...(confidence ? { confidence } : {}),
    ...(approvalRequired !== undefined ? { approval_required: approvalRequired } : {}),
    ...(interruptionBudget ? { interruption_budget: interruptionBudget } : {}),
    ...(reason ? { reason } : {}),
  };
}

export function autonomyDecisionFromTier(value: unknown): AutonomyDecisionLike | null {
  const autonomyLevel = proactiveAutonomyTier(value);
  if (!autonomyLevel) return null;
  return { autonomy_level: autonomyLevel };
}

export function autonomyDecisionWithTierFallback(
  autonomyDecisionValue: unknown,
  autonomyTierValue: unknown,
): AutonomyDecisionLike | null {
  return autonomyDecisionFromUnknown(autonomyDecisionValue)
    ?? autonomyDecisionFromTier(autonomyTierValue);
}

export function approvalReviewFromUnknown(value: unknown): ApprovalReviewLike | null {
  const record = approvalStateRecord(value);
  if (!record) return null;
  const state = reviewRecordState(record);
  return {
    ...(state.title ? { title: state.title } : {}),
    ...(state.reason ? { reason: state.reason } : {}),
    ...(state.confidence ? { confidence: state.confidence } : {}),
    ...(state.provenanceSummary ? { provenance_summary: state.provenanceSummary } : {}),
    ...(state.consequenceSummaryLines.length > 0
      ? { consequence_summary_lines: state.consequenceSummaryLines }
      : {}),
    ...(state.sourceRefs.length > 0 ? { source_refs: state.sourceRefs } : {}),
    ...(state.approvalKind ? { approval_kind: state.approvalKind } : {}),
    ...(state.draftPreview ? { draft_preview: state.draftPreview } : {}),
    ...(state.autonomyDecision ? { autonomy_decision: state.autonomyDecision } : {}),
  };
}

export function approvalReviewForMessage(
  message: AfpMessage,
  view?: Pick<AfpView, "content"> | null,
): ApprovalReviewLike | null {
  const content = approvalMessageContent(message, view);
  return approvalReviewFromUnknown(content.approval_review)
    ?? approvalReviewFromUnknown(message.metadata?.approval_review);
}

export function autonomyDecisionForMessage(
  message: AfpMessage,
  view?: Pick<AfpView, "content"> | null,
): AutonomyDecisionLike | null {
  const content = approvalMessageContent(message, view);
  return autonomyDecisionWithTierFallback(content.autonomy_decision, content.autonomy_tier)
    ?? autonomyDecisionWithTierFallback(
      message.metadata?.autonomy_decision,
      message.metadata?.autonomy_tier,
    );
}

export function proactiveSuggestionApprovalReviewPanelStateFromUnknown(
  value: unknown,
): {
  reviewValue: ApprovalReviewLike | null;
  showPanel: boolean;
  fallbackReasonText: string | null;
  autonomyDecision: AutonomyDecisionLike | null;
} {
  const record = approvalStateRecord(value);
  const reviewValue = approvalReviewFromUnknown(record?.approval_review) ?? null;
  const fallbackReasonText = approvalStateString(record?.description)
    ?? approvalStateString(record?.selection_reason)
    ?? null;
  const autonomyDecision =
    autonomyDecisionWithTierFallback(record?.autonomy_decision, record?.autonomy_tier)
    ?? reviewValue?.autonomy_decision
    ?? null;
  return {
    reviewValue,
    showPanel: Boolean(reviewValue || autonomyDecision),
    fallbackReasonText,
    autonomyDecision,
  };
}

export function simulatorApprovalReviewFromUnknown(value: unknown): ApprovalReviewLike | null {
  const state = simulatorPreviewRecordState(value);
  if (!state || state.kind !== "approval") return null;
  return simulatorApprovalReviewFromState(state);
}

function simulatorApprovalReviewFromState(
  state: SimulatorPreviewRecordState,
): ApprovalReviewLike | null {
  if (state.kind !== "approval") return null;
  return approvalReviewFromUnknown({
    title: state.title ?? simulatorPreviewTitle("approval"),
    reason: state.description ?? simulatorPreviewSummary("approval"),
    confidence: state.confidence ?? undefined,
    approval_kind: state.approvalKind ?? undefined,
    draft_preview: state.draftPreview ?? undefined,
    consequence_summary_lines: state.artifactSummaryLines,
    source_refs: state.sourceRefs,
  });
}

export function simulatorPreviewKindFromUnknown(
  value: unknown,
): SimulatorPreviewKind | null {
  return simulatorPreviewRecordState(value)?.kind ?? null;
}

export function simulatorPreviewLinesFromUnknown(value: unknown, limit = 3): string[] {
  const state = simulatorPreviewRecordState(value);
  return state ? simulatorPreviewSummaryLineState(state, limit) : [];
}

export function simulatorApprovalPreviewStateFromUnknown(
  value: unknown,
): SimulatorApprovalPreviewState | null {
  const state = simulatorPreviewRecordState(value);
  if (!state || state.kind !== "approval") return null;

  const summary = state.description ?? simulatorPreviewSummary("approval");
  return {
    title: state.title ?? simulatorPreviewTitle("approval"),
    summary,
    previewBoundarySummary: state.previewBoundarySummary ?? simulatorPreviewBoundaryFallback(),
    boundedReason: simulatorPreviewBoundedReason(state) ?? summary,
    selectionReason: state.selectionReason,
    consequencePreview: simulatorPreviewConsequence(state),
    provenanceCue: simulatorPreviewProvenance(state),
    sourceSummary: sourceCountSummary(state.sourceRefs),
    approvalReview: simulatorApprovalReviewFromState(state),
    autonomyDecision: autonomyDecisionWithTierFallback(
      (value as Record<string, unknown>).autonomy_decision,
      (value as Record<string, unknown>).autonomy_tier,
    ),
  };
}

function simulatorPreviewDetailStateFromRecordState(
  state: SimulatorPreviewRecordState,
): SimulatorPreviewDetailState {
  const boundedReason = simulatorPreviewBoundedReason(state);
  return {
    boundedReason,
    selectionReason: state.selectionReason,
    hasDistinctSelectionReason: hasDistinctReasonSummary(
      state.selectionReason,
      boundedReason,
    ),
    consequencePreview: simulatorPreviewConsequence(state),
    provenanceCue: simulatorPreviewProvenance(state),
    sourceSummary: state.explicitSourceSummary ?? sourceCountSummary(state.sourceRefs),
    rolloutSummary: simulatorPreviewRollout(state),
    previewBoundarySummary: state.previewBoundarySummary,
    reversibilityHint: state.approvalOrReversibilityHint,
  };
}

export function simulatorPreviewDetailsFromUnknown(
  value: unknown,
): SimulatorPreviewDetailState {
  const state = simulatorPreviewRecordState(value);
  if (!state) {
    return {
      boundedReason: null,
      selectionReason: null,
      hasDistinctSelectionReason: false,
      consequencePreview: null,
      provenanceCue: null,
      sourceSummary: null,
      rolloutSummary: null,
      previewBoundarySummary: null,
      reversibilityHint: null,
    };
  }

  return simulatorPreviewDetailStateFromRecordState(state);
}

function simulatorProactivePreviewStateFromRecordState(
  state: SimulatorPreviewRecordState | null,
): SimulatorProactivePreviewState {
  const draftPreview = state?.draftPreview ?? null;
  return {
    sourceSummary: state ? (state.explicitSourceSummary ?? sourceCountSummary(state.sourceRefs)) : null,
    persistenceReason: state?.persistedFromContinuity
      ? state.persistenceReason ?? simulatorPreviewPersistenceFallback()
      : null,
    approvalKindLabel: state?.approvalKind?.replaceAll("_", " ") ?? null,
    draftPreview,
    draftPreviewSummary: draftPreview?.content ?? null,
  };
}

export function simulatorProactivePreviewStateFromUnknown(
  value: unknown,
): SimulatorProactivePreviewState {
  return simulatorProactivePreviewStateFromRecordState(simulatorPreviewRecordState(value));
}

export function simulatorPreviewCardSummaryStateFromUnknown(
  value: unknown,
): SimulatorPreviewCardSummaryState | null {
  const state = simulatorPreviewRecordState(value);
  if (!state) return null;

  const displayedSummaryLines = simulatorPreviewSummaryLineState(state, 2);
  const details = simulatorPreviewDetailStateFromRecordState(state);
  const fallbackSummary = simulatorPreviewFallbackSummary(state.kind);

  return {
    kind: state.kind,
    title: state.title ?? simulatorPreviewFallbackTitle(state.kind),
    boundedReason: details.boundedReason ?? state.description ?? fallbackSummary,
    leadSummaryLine: displayedSummaryLines[0] ?? null,
    supportingSummaryLines: displayedSummaryLines.slice(1),
    consequencePreview: details.consequencePreview,
    provenanceCue: details.provenanceCue,
    sourceSummary: details.sourceSummary,
    rolloutSummary: details.rolloutSummary,
    previewBoundarySummary: details.previewBoundarySummary,
  };
}

export function simulatorReviewSurfaceStateFromUnknown(
  value: unknown,
): SimulatorReviewSurfaceState | null {
  const state = simulatorPreviewRecordState(value);
  if (!state) return null;

  const summary = simulatorPreviewCardSummaryStateFromUnknown(value);
  const proactive = simulatorProactivePreviewStateFromRecordState(state);

  return {
    kind: state.kind,
    sourceSummary: proactive.sourceSummary,
    persistenceReason: proactive.persistenceReason,
    primarySourceRef: state.sourceRefs[0] ?? null,
    approvalKindLabel: proactive.approvalKindLabel,
    draftPreview: proactive.draftPreview,
    draftPreviewSummary: proactive.draftPreviewSummary,
    previewBoundarySummary: summary?.previewBoundarySummary ?? null,
    consequencePreview: summary?.consequencePreview ?? null,
    provenanceCue: summary?.provenanceCue ?? null,
    rolloutSummary: summary?.rolloutSummary ?? null,
    reviewAvailable: Boolean(
      state.reviewSurfaceAvailable
      ||
      (summary?.leadSummaryLine ?? null)
      || (summary?.supportingSummaryLines.length ?? 0) > 0
      || summary?.rolloutSummary
      || summary?.previewBoundarySummary
      || summary?.consequencePreview
      || summary?.provenanceCue
      || proactive.sourceSummary
      || proactive.approvalKindLabel
      || proactive.draftPreview,
    ),
  };
}
