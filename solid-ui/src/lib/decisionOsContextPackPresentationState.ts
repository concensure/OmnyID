// @locs-version: 1.0
import {
  boundedReasonSummary,
  consequencePreviewSummary,
  hasDistinctReasonSummary,
  priorityRationaleSummary,
  provenanceCueSummary,
  sourceCountSummary,
} from "afp-ts/continuity";

import type { DecisionOsContextPackItem } from "@/lib/decisionosContinuity";

type DecisionOsPreparedContextKind = "context_pack" | "context_ready";

type DecisionOsPreparedContextTrustInput = Pick<
  DecisionOsContextPackItem,
  | "pack_kind"
  | "source_refs"
  | "retrieval_mode"
  | "deeper_retrieval_recommended"
  | "readiness_reason"
  | "topology_budget_used"
  | "working_set_count"
  | "active_topic_count"
> & {
  kind?: DecisionOsPreparedContextKind;
  why_surfaced?: string | null;
  evidence_kinds?: string[];
};

export type DecisionOsContextPackTrustState = {
  boundedReasonText: string | null;
  distinctWhySurfacedText: string | null;
  priorityRationaleText: string | null;
  consequenceSummaryText: string | null;
  provenanceSummaryText: string | null;
  sourceSummaryText: string | null;
  retrievalModeText: string | null;
  readinessReasonText: string | null;
  topologyBudgetText: string | null;
  workingSetText: string | null;
  activeTopicText: string | null;
  showBoundedReason: boolean;
  showDistinctWhySurfaced: boolean;
  showPriorityRationale: boolean;
  showConsequenceSummary: boolean;
  showProvenanceSummary: boolean;
  showSourceSummary: boolean;
  showRetrievalMode: boolean;
  showReadinessReason: boolean;
  showTopologyBudget: boolean;
  showWorkingSet: boolean;
  showActiveTopicCount: boolean;
};

export function decisionOsContextPackTrustState(
  item: DecisionOsPreparedContextTrustInput,
): DecisionOsContextPackTrustState {
  const kind = item.kind ?? "context_pack";
  const whySurfacedText = item.why_surfaced?.trim() || null;
  const boundedReasonText = boundedReasonSummary({
    kind,
    pack_kind: kind === "context_pack" ? item.pack_kind : undefined,
    selection_reason: whySurfacedText,
  });
  const distinctWhySurfacedText = hasDistinctReasonSummary(whySurfacedText, boundedReasonText)
    ? whySurfacedText
    : null;
  const rawPriorityRationaleText = priorityRationaleSummary({
    kind,
    pack_kind: kind === "context_pack" ? item.pack_kind : undefined,
    source_refs: item.source_refs,
  });
  const priorityRationaleText =
    hasDistinctReasonSummary(rawPriorityRationaleText, boundedReasonText)
    && hasDistinctReasonSummary(rawPriorityRationaleText, distinctWhySurfacedText)
      ? rawPriorityRationaleText
      : null;
  const consequenceSummaryText = consequencePreviewSummary({
    kind,
    pack_kind: kind === "context_pack" ? item.pack_kind : undefined,
  });
  const provenanceSummaryText = provenanceCueSummary({
    kind,
    pack_kind: kind === "context_pack" ? item.pack_kind : undefined,
    source_refs: item.source_refs,
    evidence_kinds: item.evidence_kinds,
  });
  const sourceSummaryText = sourceCountSummary(item.source_refs);
  const retrievalModeText = contextPackRetrievalModeText(
    item.retrieval_mode,
    item.deeper_retrieval_recommended,
  );
  const readinessReasonText = item.readiness_reason?.trim() || null;
  const topologyBudgetText =
    typeof item.topology_budget_used === "number" && item.topology_budget_used > 0
      ? `${item.topology_budget_used} context item${item.topology_budget_used === 1 ? "" : "s"} scanned`
      : null;
  const workingSetText =
    typeof item.working_set_count === "number" && item.working_set_count > 0
      ? `${item.working_set_count} working-set ref${item.working_set_count === 1 ? "" : "s"}`
      : null;
  const activeTopicText =
    typeof item.active_topic_count === "number" && item.active_topic_count > 0
      ? `${item.active_topic_count} active topic anchor${item.active_topic_count === 1 ? "" : "s"}`
      : null;

  return {
    boundedReasonText,
    distinctWhySurfacedText,
    priorityRationaleText,
    consequenceSummaryText,
    provenanceSummaryText,
    sourceSummaryText,
    retrievalModeText,
    readinessReasonText,
    topologyBudgetText,
    workingSetText,
    activeTopicText,
    showBoundedReason: Boolean(boundedReasonText),
    showDistinctWhySurfaced: Boolean(distinctWhySurfacedText),
    showPriorityRationale: Boolean(priorityRationaleText),
    showConsequenceSummary: Boolean(consequenceSummaryText),
    showProvenanceSummary: Boolean(provenanceSummaryText),
    showSourceSummary: Boolean(sourceSummaryText),
    showRetrievalMode: Boolean(retrievalModeText),
    showReadinessReason: Boolean(readinessReasonText),
    showTopologyBudget: Boolean(topologyBudgetText),
    showWorkingSet: Boolean(workingSetText),
    showActiveTopicCount: Boolean(activeTopicText),
  };
}

function contextPackRetrievalModeLabel(mode?: string | null): string | null {
  if (!mode) return null;
  if (mode === "metadata_first_with_selective_deepening") {
    return "metadata-first + deepen";
  }
  if (mode === "metadata_first") {
    return "metadata-first";
  }
  return mode.replaceAll("_", " ");
}

function contextPackRetrievalModeText(
  mode?: string | null,
  deeperRetrievalRecommended?: boolean,
): string | null {
  const label = contextPackRetrievalModeLabel(mode);
  if (!label) return null;
  return `Retrieval mode: ${label}${deeperRetrievalRecommended ? " with deeper retrieval recommended." : "."}`;
}
