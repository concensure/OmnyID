// @locs-version: 1.0
import {
  boundedReasonSummary,
  consequencePreviewSummary,
  hasDistinctReasonSummary,
  priorityRationaleSummary,
  provenanceCueSummary,
  sourceCountSummary,
} from "afp-ts/continuity";

import { autonomySummaryWithFallback } from "./autonomyDecisionState";
import { decisionOsFlagReasoningFallbackDetail } from "./decisionOsDecisionCardPopoverState";
import type { QueueEntry } from "./decisionQueueModel";

export type QueueEntryTrustState = {
  sourceSummary: string | null;
  priorityRationale: string | null;
  consequencePreview: string | null;
  provenanceCue: string | null;
  boundedReason: string | null;
  suggestedActionText: string | null;
  rawReasonText: string | null;
};

function queueEntrySourceRefs(entry: QueueEntry): string[] | undefined {
  return entry.source === "priority"
    ? entry.queuePriorityCard?.source_refs
    : entry.queueActionItem?.source_refs;
}

function queueEntrySelectionReason(entry: QueueEntry): string | null {
  if (entry.source === "priority") {
    return entry.queuePriorityCard?.selection_reason?.trim() || null;
  }
  return entry.queueActionItem?.selection_reason?.trim()
    || entry.queueActionItem?.suggested_action?.trim()
    || null;
}

function queueEntryAutonomyReason(entry: QueueEntry): string | null {
  if (entry.source === "priority") {
    if (entry.queuePriorityCard?.requires_approval) {
      return entry.queuePriorityCard.selection_reason?.trim()
        || entry.queuePriorityCard.description?.trim()
        || "This path crosses an approval boundary before action.";
    }
    if (entry.queuePriorityCard?.prepared_draft_class) {
      return "Prepared work is ready for review before any action is taken.";
    }
    return entry.queuePriorityCard?.selection_reason?.trim()
      || entry.queuePriorityCard?.description?.trim()
      || "Suggested next step stays reviewable before execution.";
  }
  if (entry.queueActionItem?.requires_approval) {
    return "This action still needs explicit approval before execution.";
  }
  return "Suggested next step stays reviewable before execution.";
}

function queueEntryAutonomyLevel(entry: QueueEntry): string {
  if (entry.source === "priority") {
    const explicitTier = entry.queuePriorityCard?.autonomy_tier?.trim();
    if (explicitTier) {
      return explicitTier;
    }
    return entry.queuePriorityCard?.requires_approval
      ? "request_approval"
      : "suggest_with_artifact";
  }

  const explicitTier = entry.queueActionItem?.autonomy_tier?.trim();
  if (explicitTier) {
    return explicitTier;
  }
  return entry.queueActionItem?.requires_approval
    ? "request_approval"
    : "suggest_with_artifact";
}

function queueEntryPriorityRationaleValue(entry: QueueEntry): string | null {
  if (entry.source === "priority") {
    return priorityRationaleSummary({
      requires_approval: entry.queuePriorityCard?.requires_approval,
      draft_class: entry.queuePriorityCard?.prepared_draft_class,
      source_refs: entry.queuePriorityCard?.source_refs,
      object_refs: entry.queuePriorityCard?.object_refs,
      object_labels: entry.queuePriorityCard?.object_labels,
    });
  }
  return priorityRationaleSummary({
    requires_approval: entry.queueActionItem?.requires_approval,
    source_refs: entry.queueActionItem?.source_refs,
  });
}

function queueEntryConsequencePreviewValue(entry: QueueEntry): string | null {
  const explicitHint = entry.source === "priority"
    ? entry.queuePriorityCard?.approval_or_reversibility_hint?.trim()
    : entry.queueActionItem?.approval_or_reversibility_hint?.trim();
  if (explicitHint) return explicitHint;
  if (entry.source === "priority") {
    return consequencePreviewSummary({
      requires_approval: entry.queuePriorityCard?.requires_approval,
      draft_class: entry.queuePriorityCard?.prepared_draft_class,
    });
  }
  return consequencePreviewSummary({
    requires_approval: entry.queueActionItem?.requires_approval,
  });
}

export function queueEntryAutonomySummary(entry: QueueEntry): string | null {
  if (entry.source === "priority") {
    return autonomySummaryWithFallback({
      autonomyDecision: entry.queuePriorityCard?.autonomy_decision ?? null,
      autonomyTier: queueEntryAutonomyLevel(entry),
      requiresApproval: entry.queuePriorityCard?.requires_approval,
      confidence: entry.queuePriorityCard?.confidence ?? undefined,
      reason: queueEntryAutonomyReason(entry) ?? undefined,
    });
  }
  return autonomySummaryWithFallback({
    autonomyDecision: entry.queueActionItem?.autonomy_decision ?? null,
    autonomyTier: queueEntryAutonomyLevel(entry),
    requiresApproval: entry.queueActionItem?.requires_approval,
    confidence: entry.queueActionItem?.confidence ?? undefined,
    reason: queueEntryAutonomyReason(entry) ?? undefined,
  });
}

function queueEntryProvenanceCueValue(entry: QueueEntry): string | null {
  const explicitCue = entry.source === "priority"
    ? entry.queuePriorityCard?.provenance_cue?.trim()
    : entry.queueActionItem?.provenance_cue?.trim();
  if (explicitCue) return explicitCue;
  if (entry.source === "priority") {
    return provenanceCueSummary({
      draft_class: entry.queuePriorityCard?.prepared_draft_class,
      source_refs: entry.queuePriorityCard?.source_refs,
      object_refs: entry.queuePriorityCard?.object_refs,
      object_labels: entry.queuePriorityCard?.object_labels,
    });
  }
  return provenanceCueSummary({
    source_refs: entry.queueActionItem?.source_refs,
  });
}

function queueEntryBoundedReasonValue(entry: QueueEntry): string | null {
  const selectionReason = queueEntrySelectionReason(entry);
  if (entry.source === "priority") {
    return boundedReasonSummary({
      draft_class: entry.queuePriorityCard?.prepared_draft_class,
      urgency: entry.decision.urgency,
      selection_reason: selectionReason,
    });
  }
  return boundedReasonSummary({
    urgency: entry.decision.urgency,
    selection_reason: selectionReason,
  });
}

export function queueEntryTrustState(entry: QueueEntry): QueueEntryTrustState {
  const sourceSummary = sourceCountSummary(queueEntrySourceRefs(entry)) ?? null;
  const priorityRationale = queueEntryPriorityRationaleValue(entry);
  const consequencePreview = queueEntryConsequencePreviewValue(entry);
  const provenanceCue = queueEntryProvenanceCueValue(entry);
  const boundedReason = queueEntryBoundedReasonValue(entry);
  const selectionReason = queueEntrySelectionReason(entry);
  const suggestedAction = entry.source === "action"
    ? entry.queueActionItem?.suggested_action?.trim() || null
    : null;

  return {
    sourceSummary,
    priorityRationale,
    consequencePreview,
    provenanceCue,
    boundedReason,
    suggestedActionText: hasDistinctReasonSummary(suggestedAction, boundedReason)
      ? suggestedAction
      : null,
    rawReasonText: hasDistinctReasonSummary(selectionReason, boundedReason)
      ? selectionReason
      : null,
  };
}

export function queueEntrySourceSummary(entry: QueueEntry): string | null {
  return queueEntryTrustState(entry).sourceSummary;
}

export function queueEntryPriorityRationale(entry: QueueEntry): string | null {
  return queueEntryTrustState(entry).priorityRationale;
}

export function queueEntryConsequencePreview(entry: QueueEntry): string | null {
  return queueEntryTrustState(entry).consequencePreview;
}

export function queueEntryProvenanceCue(entry: QueueEntry): string | null {
  return queueEntryTrustState(entry).provenanceCue;
}

export function queueEntryBoundedReason(entry: QueueEntry): string | null {
  return queueEntryTrustState(entry).boundedReason;
}

export function queueEntrySuggestedActionText(entry: QueueEntry): string | null {
  return queueEntryTrustState(entry).suggestedActionText;
}

export function queueEntryRawReasonText(entry: QueueEntry): string | null {
  return queueEntryTrustState(entry).rawReasonText;
}

export function queueEntryConfidenceLabel(entry: QueueEntry): string | null {
  const confidence = entry.decision.confidence;
  return confidence !== undefined ? `${Math.round(confidence * 100)}%` : null;
}

export function queueEntryConfidenceReason(entry: QueueEntry): string {
  return entry.decision.confidenceReason?.trim() || decisionOsFlagReasoningFallbackDetail();
}
