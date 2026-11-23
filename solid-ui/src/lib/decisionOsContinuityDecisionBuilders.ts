// @locs-version: 1.0
import {
  boundedReasonSummary,
  consequencePreviewSummary,
  priorityRationaleSummary,
  provenanceCueSummary,
  sourceCountSummary,
} from "afp-ts/continuity";
import { autonomySummaryWithFallback } from "./autonomyDecisionState";
import type {
  DecisionOsActionItem,
  DecisionOsPriorityCard,
} from "./decisionosContinuity";
import {
  calmPreparedActionDecision,
  calmPreparedPriorityDecision,
  continuityActionScopeCueSummary,
  continuityConfidenceExplanation,
  continuityConfidenceScore,
  continuitySynthesisSourceSummary,
  decisionScopeCueSummary,
} from "./decisionOsContinuityDecisionState";

export type DecisionWhyBullet = { icon: string; text: string };

export type DecisionContinuityPatch = {
  whyBullets: DecisionWhyBullet[];
  confidence?: number;
  confidenceReason?: string;
  urgencyOverride?: "medium";
  effortOverride?: "5 min";
  openActionLabel?: string;
  openActionDetail?: string;
};

function continuityAutonomySummary(input: {
  requiresApproval: boolean;
  autonomyDecision?: {
    autonomy_level?: string | null;
    reversibility?: string | null;
    consequence_level?: string | null;
    confidence?: string | null;
    approval_required?: boolean | null;
    interruption_budget?: string | null;
    reason?: string | null;
  } | null;
  autonomyTier?: string | null;
  confidence?: string | null;
  reason?: string | null;
}): string | null {
  return autonomySummaryWithFallback({
    autonomyDecision: input.autonomyDecision,
    autonomyTier: input.autonomyTier,
    requiresApproval: input.requiresApproval,
    confidence: input.confidence,
    reason: input.reason,
  });
}

function preparedContextPriorityCue(
  card: DecisionOsPriorityCard,
): string | null {
  const mode = card.retrieval_mode?.trim();
  const reason = card.readiness_reason?.trim();
  const modeText = mode
    ? card.deeper_retrieval_recommended
      ? `${mode} with deeper retrieval recommended`
      : `${mode} ready`
    : "";
  const counts = [
    typeof card.working_set_count === "number" && card.working_set_count > 0
      ? `${card.working_set_count} working-set refs`
      : null,
    typeof card.active_topic_count === "number" && card.active_topic_count > 0
      ? `${card.active_topic_count} active-topic anchors`
      : null,
  ].filter((value): value is string => Boolean(value));
  const topology =
    typeof card.topology_budget_used === "number" && card.topology_budget_used > 0
      ? `topology budget ${card.topology_budget_used}`
      : null;
  const metadata = [modeText || null, topology, ...counts]
    .filter((value): value is string => Boolean(value))
    .join("; ");
  if (reason && metadata) return `${reason} ${metadata}.`;
  if (reason) return reason;
  if (metadata) return metadata.charAt(0).toUpperCase() + metadata.slice(1) + ".";
  return null;
}

function continuityOpenActionCopy(destinationLabel: string): {
  label: string;
  detail: string;
} {
  const normalized = destinationLabel.trim().toLowerCase();
  if (normalized === "home") {
    return {
      label: "Open workspace",
      detail: "workspace",
    };
  }
  return {
    label: `Open ${destinationLabel}`,
    detail: destinationLabel,
  };
}

export function trustAwarePriorityDecisionPatch(
  card: DecisionOsPriorityCard,
  destinationLabel: string,
): DecisionContinuityPatch {
  const openAction = continuityOpenActionCopy(destinationLabel);
  const priorityReason =
    priorityRationaleSummary({
      requires_approval: card.requires_approval,
      draft_class: card.prepared_draft_class,
      source_refs: card.source_refs,
      object_refs: card.object_refs,
      object_labels: card.object_labels,
    }) ?? card.description;
  const sourceSummary = sourceCountSummary(card.source_refs);
  const consequencePreview = card.approval_or_reversibility_hint?.trim() || consequencePreviewSummary({
    requires_approval: card.requires_approval,
    draft_class: card.prepared_draft_class,
  });
  const scopeCue = decisionScopeCueSummary(card);
  const preparedContextCue = preparedContextPriorityCue(card);
  const synthesisSourceSummary = continuitySynthesisSourceSummary({
    sourceSummary,
    preparedDraftClass: card.prepared_draft_class,
    selectionReason: card.selection_reason,
  });
  const boundedReason = boundedReasonSummary({
    draft_class: card.prepared_draft_class,
    urgency: card.requires_approval ? "urgent" : "high",
    selection_reason: card.selection_reason,
  });
  const provenanceCue = card.provenance_cue?.trim() || provenanceCueSummary({
    draft_class: card.prepared_draft_class,
    source_refs: card.source_refs,
    object_refs: card.object_refs,
    object_labels: card.object_labels,
  });
  const confidenceExplanation = continuityConfidenceExplanation({
    confidence: card.confidence,
    requiresApproval: card.requires_approval,
    preparedDraftClass: card.prepared_draft_class,
    sourceRefs: card.source_refs,
    scopeCue,
    selectionReason: card.selection_reason,
  });
  const autonomySummary = continuityAutonomySummary({
    requiresApproval: card.requires_approval,
    autonomyDecision: card.autonomy_decision,
    autonomyTier: card.autonomy_tier,
    confidence: card.confidence,
    reason: card.requires_approval
      ? card.selection_reason ?? card.description
      : card.prepared_draft_class
        ? "Prepared work is ready for review before any action is taken."
        : card.selection_reason ?? card.description,
  });

  return {
    whyBullets: [
      { icon: card.requires_approval ? "!" : "-", text: priorityReason },
      ...(boundedReason ? [{ icon: "*", text: boundedReason }] : []),
      ...(autonomySummary ? [{ icon: "A", text: autonomySummary }] : []),
      ...(preparedContextCue ? [{ icon: "*", text: preparedContextCue }] : []),
      ...(scopeCue ? [{ icon: "*", text: scopeCue }] : []),
      ...(synthesisSourceSummary ? [{ icon: "#", text: synthesisSourceSummary }] : []),
      ...(consequencePreview ? [{ icon: "->", text: consequencePreview }] : []),
      ...(provenanceCue ? [{ icon: "P", text: provenanceCue }] : []),
      { icon: "->", text: openAction.label },
    ],
    confidence: continuityConfidenceScore(card.confidence),
    confidenceReason: confidenceExplanation,
    urgencyOverride: calmPreparedPriorityDecision(card) ? "medium" : undefined,
    effortOverride: calmPreparedPriorityDecision(card) ? "5 min" : undefined,
    openActionLabel: openAction.label,
    openActionDetail: openAction.detail,
  };
}

export function trustAwareActionDecisionPatch(
  item: DecisionOsActionItem,
): DecisionContinuityPatch {
  const priorityReason =
    priorityRationaleSummary({
      requires_approval: item.requires_approval,
      source_refs: item.source_refs,
    }) ?? item.suggested_action;
  const sourceSummary = sourceCountSummary(item.source_refs);
  const consequencePreview = item.approval_or_reversibility_hint?.trim() || consequencePreviewSummary({
    requires_approval: item.requires_approval,
  });
  const boundedReason = boundedReasonSummary({
    urgency: item.urgency,
    selection_reason: item.suggested_action,
  });
  const provenanceCue = item.provenance_cue?.trim() || provenanceCueSummary({
    source_refs: item.source_refs,
  });
  const scopeCue = continuityActionScopeCueSummary(item);
  const synthesisSourceSummary = continuitySynthesisSourceSummary({
    sourceSummary,
    selectionReason: item.suggested_action,
  });
  const confidenceExplanation = continuityConfidenceExplanation({
    confidence: item.confidence,
    requiresApproval: item.requires_approval,
    sourceRefs: item.source_refs,
    scopeCue,
    selectionReason: item.suggested_action,
  });
  const autonomySummary = continuityAutonomySummary({
    requiresApproval: item.requires_approval,
    autonomyDecision: item.autonomy_decision,
    autonomyTier: item.autonomy_tier,
    confidence: item.confidence,
    reason: item.requires_approval
      ? "This action still needs explicit approval before execution."
      : "Suggested next step stays reviewable before execution.",
  });

  return {
    whyBullets: [
      { icon: item.requires_approval ? "!" : "-", text: priorityReason },
      ...(boundedReason ? [{ icon: "*", text: boundedReason }] : []),
      ...(autonomySummary ? [{ icon: "A", text: autonomySummary }] : []),
      ...(scopeCue ? [{ icon: "*", text: scopeCue }] : []),
      ...(synthesisSourceSummary ? [{ icon: "#", text: synthesisSourceSummary }] : []),
      ...(consequencePreview ? [{ icon: "->", text: consequencePreview }] : []),
      ...(provenanceCue ? [{ icon: "P", text: provenanceCue }] : []),
    ],
    confidence: continuityConfidenceScore(item.confidence),
    confidenceReason: confidenceExplanation,
    urgencyOverride: calmPreparedActionDecision(item) ? "medium" : undefined,
    effortOverride: calmPreparedActionDecision(item) ? "5 min" : undefined,
  };
}
