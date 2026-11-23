// @locs-version: 1.0
import {
  artifactSummaryDisplayedLines,
  hasDistinctReasonSummary,
  boundedReasonSummary,
  consequencePreviewSummary,
  preparedDraftDestinationForItem,
  provenanceCueSummary,
  responseItemPreparedDraftLeadSummary,
  sourceCountSummary,
} from "afp-ts/continuity";
import { autonomySummaryWithFallback } from "@/lib/autonomyDecisionState";
import {
  approvalDraftPreviewFromUnknown,
  approvalStateString,
  autonomyDecisionFromUnknown,
  simulatorPreviewCardSummaryStateFromUnknown,
  simulatorProactivePreviewStateFromUnknown,
} from "@/lib/approvalReviewState";
import type { DecisionOsQueueCompanionState } from "@/lib/decisionOsQueueBootstrapState";
import type {
  DecisionOsPreparedDraftItem,
  DecisionOsResponseItem,
} from "@/lib/decisionosContinuity";
import {
  simulatorPreviewAvailabilityReason,
  simulatorPreviewBoundarySentence,
  simulatorPreviewKindFromRaw,
  simulatorPreviewRawKind,
  simulatorPreviewReadyTitle,
  simulatorPreviewSummary,
  simulatorPreviewTitle,
  type SimulatorPreviewKind,
} from "@/lib/simulatorPreviewCopy";

type PreparedWorkSimulatorKind = SimulatorPreviewKind;

function preparedWorkCueLabel(
  item: { prepared_draft_class?: string | null },
): string {
  if (!item.prepared_draft_class) return "Prepared response ready";
  const destination = preparedDraftDestinationForItem({
    draft_class: item.prepared_draft_class,
  });
  if (destination === "decision_queue") return "Prepared decision support ready";
  if (destination === "home") return "Prepared work ready";
  return "Prepared response ready";
}

function preparedWorkContextDetail(
  item?: { title?: string | null; summary?: string | null } | null,
): string | null {
  const summary = item?.summary?.trim();
  if (summary) return summary;
  const title = item?.title?.trim();
  return title || null;
}

export function decisionOsPreparedDraftAutonomySummary(
  item: Pick<DecisionOsPreparedDraftItem, "autonomy_decision" | "autonomy_tier"> | null | undefined,
): string | null {
  if (!item) return null;
  return autonomySummaryWithFallback({
    autonomyDecision: item.autonomy_decision ?? null,
    autonomyTier: item.autonomy_tier ?? null,
  });
}

export function decisionOsPreparedDraftTrustState(
  item: Pick<
    DecisionOsPreparedDraftItem,
    | "autonomy_decision"
    | "autonomy_tier"
    | "approval_or_reversibility_hint"
    | "provenance_cue"
    | "draft_class"
    | "requires_approval"
    | "readiness"
    | "response_due_hint"
    | "source_refs"
  > | null | undefined,
): {
  consequencePreview: string | null;
  provenanceCue: string | null;
  autonomySummary: string | null;
} {
  return {
    consequencePreview: item?.approval_or_reversibility_hint?.trim()
      || consequencePreviewSummary({
        draft_class: item?.draft_class ?? null,
        requires_approval: item?.requires_approval ?? false,
        readiness: item?.readiness ?? null,
        response_due_hint: item?.response_due_hint ?? null,
      }),
    provenanceCue: item?.provenance_cue?.trim()
      || provenanceCueSummary({
        draft_class: item?.draft_class ?? null,
        source_refs: item?.source_refs ?? [],
      }),
    autonomySummary: decisionOsPreparedDraftAutonomySummary(item),
  };
}

export function decisionOsPreparedDraftPresentationState(
  item: Pick<
    DecisionOsPreparedDraftItem,
    | "autonomy_decision"
    | "autonomy_tier"
    | "approval_or_reversibility_hint"
    | "provenance_cue"
    | "draft_class"
    | "requires_approval"
    | "readiness"
    | "response_due_hint"
    | "selection_reason"
    | "suggested_action"
    | "source_refs"
  > | null | undefined,
): {
  boundedReason: string | null;
  distinctSelectionReason: string | null;
  distinctSuggestedAction: string | null;
  sourceSummary: string | null;
  consequencePreview: string | null;
  provenanceCue: string | null;
  autonomySummary: string | null;
} {
  const selectionReason = approvalStateString(item?.selection_reason);
  const suggestedAction = approvalStateString(item?.suggested_action);
  const boundedReason = boundedReasonSummary({
    draft_class: item?.draft_class ?? null,
    response_due_hint: item?.response_due_hint ?? null,
    selection_reason: selectionReason,
  });
  const trustState = decisionOsPreparedDraftTrustState(item);
  const sourceSummary = sourceCountSummary(item?.source_refs ?? []);

  return {
    boundedReason,
    distinctSelectionReason: hasDistinctReasonSummary(selectionReason, boundedReason)
      ? selectionReason
      : null,
    distinctSuggestedAction: hasDistinctReasonSummary(suggestedAction, boundedReason)
      ? suggestedAction
      : null,
    sourceSummary,
    consequencePreview: trustState.consequencePreview,
    provenanceCue: trustState.provenanceCue,
    autonomySummary: trustState.autonomySummary,
  };
}

export function decisionOsResponsePreparedDraftAutonomySummary(
  item: Pick<DecisionOsResponseItem, "prepared_draft_autonomy_decision"> | null | undefined,
): string | null {
  if (!item) return null;
  return autonomySummaryWithFallback({
    autonomyDecision: item.prepared_draft_autonomy_decision ?? null,
  });
}

export function decisionOsResponsePreparedDraftTrustState(
  item: Pick<
    DecisionOsResponseItem,
    | "prepared_draft_class"
    | "prepared_draft_requires_approval"
    | "prepared_draft_readiness"
    | "response_due_hint"
    | "source_refs"
    | "prepared_draft_object_refs"
    | "prepared_draft_object_labels"
    | "prepared_draft_autonomy_decision"
  > | null | undefined,
): {
  consequencePreview: string | null;
  provenanceCue: string | null;
  autonomySummary: string | null;
} {
  return {
    consequencePreview: consequencePreviewSummary({
      draft_class: item?.prepared_draft_class ?? null,
      requires_approval: item?.prepared_draft_requires_approval,
      readiness: item?.prepared_draft_readiness ?? null,
      response_due_hint: item?.response_due_hint ?? null,
    }),
    provenanceCue: provenanceCueSummary({
      draft_class: item?.prepared_draft_class ?? null,
      source_refs: item?.source_refs ?? [],
      object_refs: item?.prepared_draft_object_refs,
      object_labels: item?.prepared_draft_object_labels,
    }),
    autonomySummary: decisionOsResponsePreparedDraftAutonomySummary(item),
  };
}

export function decisionOsResponsePreparedDraftPresentationState(
  item: Pick<
    DecisionOsResponseItem,
    | "prepared_draft_class"
    | "prepared_draft_requires_approval"
    | "prepared_draft_readiness"
    | "prepared_draft_selection_reason"
    | "response_due_hint"
    | "source_refs"
    | "prepared_draft_object_refs"
    | "prepared_draft_object_labels"
    | "prepared_draft_autonomy_decision"
    | "urgency"
    | "suggested_action"
  > | null | undefined,
): {
  boundedReason: string | null;
  distinctSelectionReason: string | null;
  distinctSuggestedAction: string | null;
  sourceSummary: string | null;
  consequencePreview: string | null;
  provenanceCue: string | null;
  autonomySummary: string | null;
} {
  const selectionReason = approvalStateString(item?.prepared_draft_selection_reason);
  const suggestedAction = approvalStateString(item?.suggested_action);
  const boundedReason = boundedReasonSummary({
    draft_class: item?.prepared_draft_class ?? null,
    urgency: item?.urgency ?? null,
    response_due_hint: item?.response_due_hint ?? null,
    selection_reason: selectionReason,
  });
  const trustState = decisionOsResponsePreparedDraftTrustState(item);
  const sourceSummary = sourceCountSummary(item?.source_refs ?? []);

  return {
    boundedReason,
    distinctSelectionReason: hasDistinctReasonSummary(selectionReason, boundedReason)
      ? selectionReason
      : null,
    distinctSuggestedAction: hasDistinctReasonSummary(suggestedAction, boundedReason)
      ? suggestedAction
      : null,
    sourceSummary,
    consequencePreview: trustState.consequencePreview,
    provenanceCue: trustState.provenanceCue,
    autonomySummary: trustState.autonomySummary,
  };
}

function preparedWorkStringArray(
  value: unknown,
): string[] {
  return Array.isArray(value)
    ? value.map((entry) => approvalStateString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
}

function preparedWorkSimulatorKind(value: string | null): PreparedWorkSimulatorKind | null {
  return simulatorPreviewKindFromRaw(value);
}

function preparedWorkSimulatorRawKind(kind: PreparedWorkSimulatorKind): string {
  return simulatorPreviewRawKind(kind);
}

function preparedWorkSimulatorFallbackTitle(kind: PreparedWorkSimulatorKind): string {
  return simulatorPreviewTitle(kind);
}

function preparedWorkSimulatorFallbackSummary(kind: PreparedWorkSimulatorKind): string {
  return simulatorPreviewSummary(kind);
}

function preparedWorkAutonomySummaryFromRecord(
  item: Record<string, unknown> | null | undefined,
): string | null {
  if (!item) return null;
  return autonomySummaryWithFallback({
    autonomyDecision: autonomyDecisionFromUnknown(item.autonomy_decision),
    autonomyTier: approvalStateString(item.autonomy_tier),
  });
}

function preparedWorkSimulatorDisplayedLines(item: Record<string, unknown>): string[] {
  return artifactSummaryDisplayedLines({
    artifact_summary_lines: preparedWorkStringArray(item.artifact_summary_lines),
    description: approvalStateString(item.description),
    draft_preview: approvalDraftPreviewFromUnknown(item.draft_preview),
  });
}

function preparedWorkSimulatorBoundedReason(
  item: Record<string, unknown>,
  kind: PreparedWorkSimulatorKind,
): string {
  return approvalStateString(item.description)
    ?? boundedReasonSummary({
      kind: preparedWorkSimulatorRawKind(kind),
      pack_kind: approvalStateString(item.pack_kind),
      draft_class: approvalStateString(item.draft_class),
      urgency: approvalStateString(item.readiness) === "ready_now" ? "today" : null,
      response_due_hint: approvalStateString(item.response_due_hint),
      selection_reason: approvalStateString(item.selection_reason),
    })
    ?? preparedWorkSimulatorFallbackSummary(kind);
}

function preparedWorkSimulatorTrustState(
  item: Record<string, unknown>,
  kind: PreparedWorkSimulatorKind,
): {
  consequencePreview: string | null;
  previewBoundarySummary: string | null;
  provenanceCue: string | null;
  sourceSummary: string | null;
  rolloutSummary: string | null;
  persistenceReason: string | null;
  autonomySummary: string | null;
} {
  const rawKind = preparedWorkSimulatorRawKind(kind);
  const summaryState = simulatorPreviewCardSummaryStateFromUnknown(item);
  const proactiveState = simulatorProactivePreviewStateFromUnknown(item);
  const autonomySummary = preparedWorkAutonomySummaryFromRecord(item);
  return {
    consequencePreview: summaryState?.consequencePreview
      ?? approvalStateString(item.approval_or_reversibility_hint)
      ?? consequencePreviewSummary({
        kind: rawKind,
        pack_kind: approvalStateString(item.pack_kind),
        draft_class: approvalStateString(item.draft_class),
        requires_approval: Boolean(item.requires_approval),
        readiness: approvalStateString(item.readiness),
        response_due_hint: approvalStateString(item.response_due_hint),
      }),
    previewBoundarySummary: summaryState?.previewBoundarySummary
      ?? approvalStateString(item.preview_boundary_summary)
      ?? simulatorPreviewBoundarySentence(),
    provenanceCue: summaryState?.provenanceCue
      ?? provenanceCueSummary({
        kind: rawKind,
        pack_kind: approvalStateString(item.pack_kind),
        draft_class: approvalStateString(item.draft_class),
        source_refs: preparedWorkStringArray(item.source_refs),
        evidence_kinds: preparedWorkStringArray(item.evidence_kinds),
      }),
    sourceSummary: summaryState?.sourceSummary
      ?? proactiveState.sourceSummary
      ?? sourceCountSummary(preparedWorkStringArray(item.source_refs)),
    rolloutSummary: summaryState?.rolloutSummary ?? null,
    persistenceReason: proactiveState.persistenceReason ?? null,
    autonomySummary,
  };
}

export function decisionOsPreparedWorkSimulatorPreviewState(
  item: Record<string, unknown> | null | undefined,
): {
  boundedReason: string | null;
  hasDistinctSelectionReason: boolean;
  leadSummaryLine: string | null;
  supportingSummaryLines: string[];
  consequencePreview: string | null;
  previewBoundarySummary: string | null;
  provenanceCue: string | null;
  sourceSummary: string | null;
  rolloutSummary: string | null;
  persistenceReason: string | null;
  autonomySummary: string | null;
} | null {
  if (!item) return null;
  const kind = preparedWorkSimulatorKind(approvalStateString(item.kind));
  if (!kind) return null;
  const boundedReason = preparedWorkSimulatorBoundedReason(item, kind);
  const displayedLines = preparedWorkSimulatorDisplayedLines(item);
  const selectionReason = approvalStateString(item.selection_reason);
  const trustState = preparedWorkSimulatorTrustState(item, kind);
  return {
    boundedReason,
    hasDistinctSelectionReason: hasDistinctReasonSummary(selectionReason, boundedReason),
    leadSummaryLine: displayedLines[0] ?? null,
    supportingSummaryLines: displayedLines.slice(1, 2),
    consequencePreview: trustState.consequencePreview,
    previewBoundarySummary: trustState.previewBoundarySummary,
    provenanceCue: trustState.provenanceCue,
    sourceSummary: trustState.sourceSummary,
    rolloutSummary: trustState.rolloutSummary,
    persistenceReason: trustState.persistenceReason,
    autonomySummary: trustState.autonomySummary,
  };
}

export function decisionOsPreparedWorkSimulatorSuggestionState(
  item: Record<string, unknown> | null | undefined,
): {
  boundedReason: string | null;
  hasDistinctSelectionReason: boolean;
  leadSummaryLine: string | null;
  supportingSummaryLines: string[];
  consequencePreview: string | null;
  previewBoundarySummary: string | null;
  provenanceCue: string | null;
  sourceSummary: string | null;
  rolloutSummary: string | null;
  persistenceReason: string | null;
  autonomySummary: string | null;
} | null {
  if (!item) return null;
  const kind = approvalStateString(item.kind);
  const normalizedKind = preparedWorkSimulatorKind(kind);
  if (!normalizedKind || kind === "prepared_draft") {
    return null;
  }
  const preview = decisionOsPreparedWorkSimulatorPreviewState(item);
  const displayedLines = preparedWorkSimulatorDisplayedLines(item);
  const boundedReason = preview?.boundedReason ?? boundedReasonSummary({
    kind,
    pack_kind: approvalStateString(item.pack_kind),
    draft_class: approvalStateString(item.draft_class),
    urgency: approvalStateString(item.readiness) === "ready_now" ? "today" : null,
    response_due_hint: approvalStateString(item.response_due_hint),
    selection_reason: approvalStateString(item.selection_reason),
  });
  const selectionReason = approvalStateString(item.selection_reason);
  const hasDistinctSelectionReason = preview?.hasDistinctSelectionReason
    ?? (() => {
      const reason = boundedReason?.trim() ?? "";
      if (!selectionReason) return false;
      if (!reason) return true;
      return selectionReason.toLowerCase() !== reason.toLowerCase();
    })();
  return {
    boundedReason,
    hasDistinctSelectionReason,
    leadSummaryLine: preview?.leadSummaryLine ?? displayedLines[0] ?? null,
    supportingSummaryLines: preview?.supportingSummaryLines ?? displayedLines.slice(1),
    consequencePreview: preview?.consequencePreview
      ?? approvalStateString(item.approval_or_reversibility_hint)
      ?? consequencePreviewSummary({
        kind,
        pack_kind: approvalStateString(item.pack_kind),
        draft_class: approvalStateString(item.draft_class),
        requires_approval: Boolean(item.requires_approval),
        readiness: approvalStateString(item.readiness),
        response_due_hint: approvalStateString(item.response_due_hint),
      }),
    previewBoundarySummary: preview?.previewBoundarySummary ?? approvalStateString(item.preview_boundary_summary),
    provenanceCue: preview?.provenanceCue ?? provenanceCueSummary({
      kind,
      pack_kind: approvalStateString(item.pack_kind),
      draft_class: approvalStateString(item.draft_class),
      source_refs: preparedWorkStringArray(item.source_refs),
      evidence_kinds: preparedWorkStringArray(item.evidence_kinds),
    }),
    sourceSummary: preview?.sourceSummary ?? sourceCountSummary(preparedWorkStringArray(item.source_refs)),
    rolloutSummary: preview?.rolloutSummary ?? null,
    persistenceReason: preview?.persistenceReason ?? null,
    autonomySummary: preview?.autonomySummary ?? null,
  };
}

export function decisionOsPreparedWorkSimulatorLaneState(
  item: Record<string, unknown> | null | undefined,
): {
  kind: "approval" | "reversible" | "fusion";
  title: string;
  detail: string;
  reason: string;
  consequencePreview: string | null;
  provenanceCue: string | null;
  sourceSummary: string | null;
  rolloutSummary: string | null;
} | null {
  const tileState = decisionOsPreparedWorkSimulatorTileState(item);
  if (!tileState) return null;
  return {
    kind: tileState.kind,
    title: simulatorPreviewReadyTitle(tileState.kind),
    detail: tileState.leadSummaryLine
      ? `${tileState.leadSummaryLine} ${simulatorPreviewBoundarySentence()}`
      : tileState.detail,
    reason: simulatorPreviewAvailabilityReason(tileState.kind),
    consequencePreview: tileState.consequencePreview,
    provenanceCue: tileState.provenanceCue,
    sourceSummary: tileState.sourceSummary,
    rolloutSummary: tileState.rolloutSummary,
  };
}

export function decisionOsPreparedWorkSimulatorTileState(
  item: Record<string, unknown> | null | undefined,
): {
  kind: "approval" | "reversible" | "fusion";
  title: string;
  detail: string;
  leadSummaryLine: string | null;
  supportingSummaryLines: string[];
  consequencePreview: string | null;
  provenanceCue: string | null;
  previewBoundarySummary: string | null;
  sourceSummary: string | null;
  rolloutSummary: string | null;
  persistenceReason: string | null;
  autonomySummary: string | null;
} | null {
  if (!item) return null;
  const kind = preparedWorkSimulatorKind(approvalStateString(item.kind));
  if (!kind) return null;
  const title = approvalStateString(item.title) ?? preparedWorkSimulatorFallbackTitle(kind);
  const displayedLines = preparedWorkSimulatorDisplayedLines(item);
  const trustState = preparedWorkSimulatorTrustState(item, kind);
  return {
    kind,
    title,
    detail: preparedWorkSimulatorBoundedReason(item, kind),
    leadSummaryLine: displayedLines[0] ?? null,
    supportingSummaryLines: displayedLines.slice(1, 2),
    consequencePreview: trustState.consequencePreview,
    provenanceCue: trustState.provenanceCue,
    previewBoundarySummary: trustState.previewBoundarySummary,
    sourceSummary: trustState.sourceSummary,
    rolloutSummary: trustState.rolloutSummary,
    persistenceReason: trustState.persistenceReason,
    autonomySummary: trustState.autonomySummary,
  };
}

export function decisionOsPreparedWorkCue(args: {
  suggestedMood?: string | null;
  queueCompanionState: DecisionOsQueueCompanionState;
}): {
  label: string;
  detail: string | null;
} | null {
  if (args.suggestedMood?.trim().toLowerCase() !== "focused") return null;

  const preparedResponse = args.queueCompanionState.responseItems.find(
    (item) => item.prepared_draft_available || item.prepared_draft_id,
  );
  if (preparedResponse) {
    return {
      label: preparedWorkCueLabel(preparedResponse),
      detail:
        responseItemPreparedDraftLeadSummary(preparedResponse)
        || preparedResponse.title?.trim()
        || null,
    };
  }

  const preparedContext = args.queueCompanionState.contextPackItems.find(
    (item) => item.title?.trim() || item.summary?.trim(),
  );
  if (preparedContext) {
    return {
      label: "Prepared context ready",
      detail: preparedWorkContextDetail(preparedContext),
    };
  }

  return null;
}
