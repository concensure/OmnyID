import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsProactivePrimaryTrustBlockState,
  decisionOsProactiveTrustState,
} from "../src/lib/decisionOsProactiveTrustState.ts";

test("decisionOsProactiveTrustState prefers prepared-draft trust metadata", () => {
  assert.deepEqual(
    decisionOsProactiveTrustState({
      kind: "prepared_draft",
      draft_class: "decision_memo",
      selection_reason: "Because the recommendation is ready for supplier review.",
      requires_approval: true,
      readiness: "ready_now",
      response_due_hint: "Today",
      source_refs: ["thread:1"],
      approval_or_reversibility_hint: "Approval would send the supplier-ready recommendation.",
      provenance_cue: "Grounded in the supplier thread and scorecard.",
      autonomy_tier: "hard_confirm",
      autonomy_decision: {
        autonomy_level: "notify_then_act",
        reversibility: "reversible",
        reason: "This can proceed once the recommendation is surfaced.",
      },
    }),
    {
      boundedReasonText: "Due today.",
      distinctSelectionReasonText: "Because the recommendation is ready for supplier review.",
      priorityRationaleText: "Prioritized because it crosses an approval boundary.",
      consequenceSummaryText: "Approval would send the supplier-ready recommendation.",
      provenanceSummaryText: "Grounded in the supplier thread and scorecard.",
      sourceSummaryText: "Based on 1 source",
      autonomySummaryText: "notify then act: This can proceed once the recommendation is surfaced.",
    },
  );
});

test("decisionOsProactiveTrustState lets simulator summaries override generic fallback copy", () => {
  assert.deepEqual(
    decisionOsProactiveTrustState({
      kind: "simulator_approval_preview",
      draft_class: "communication_reply",
      selection_reason: "This mirrors the current simulator boundary.",
      requires_approval: true,
      readiness: "ready_now",
      response_due_hint: "Today",
      source_refs: ["thread:1"],
      evidence_kinds: ["thread"],
      approval_or_reversibility_hint: "Reviewable before send.",
      provenance_cue: "Grounded in one thread.",
      autonomy_tier: "notify_then_act",
      simulator_bounded_reason: "Simulator preview held inside reviewable boundaries.",
      simulator_has_distinct_selection_reason: false,
      simulator_consequence_preview: "Approving would create a reviewable hold.",
      simulator_provenance_cue: "Traceable to append-only continuity artifacts.",
      simulator_autonomy_summary: "notify then act: This stays inside reversible execution pathways.",
    }),
    {
      boundedReasonText: "Simulator preview held inside reviewable boundaries.",
      distinctSelectionReasonText: null,
      priorityRationaleText: "Prioritized because it crosses an approval boundary.",
      consequenceSummaryText: "Approving would create a reviewable hold.",
      provenanceSummaryText: "Traceable to append-only continuity artifacts.",
      sourceSummaryText: "Based on 1 source",
      autonomySummaryText: "notify then act: This stays inside reversible execution pathways.",
    },
  );
});

test("decisionOsProactiveTrustState hides duplicate selection reasons against the bounded summary", () => {
  assert.deepEqual(
    decisionOsProactiveTrustState({
      kind: "continuity_priority",
      selection_reason: "Based on 2 sources",
      source_refs: ["thread:1", "thread:2"],
    }),
    {
      boundedReasonText: "Based on 2 sources",
      distinctSelectionReasonText: null,
      priorityRationaleText: null,
      consequenceSummaryText: null,
      provenanceSummaryText: "Traceable to append-only continuity artifacts.",
      sourceSummaryText: "Based on 2 sources",
      autonomySummaryText: null,
    },
  );
});

test("decisionOsProactiveTrustState reuses context-pack rationale and supports simulator source override", () => {
  assert.deepEqual(
    decisionOsProactiveTrustState({
      kind: "context_pack",
      pack_kind: "topic_pack",
      selection_reason: "Shared Aurora references now cluster into one review point.",
      source_refs: ["thread:1", "file:aurora"],
      simulator_source_summary: "Simulator anchored this preview in 2 linked sources.",
    }),
    {
      boundedReasonText: "Shared Aurora references now cluster into one review point.",
      distinctSelectionReasonText: null,
      priorityRationaleText: "Prioritized because it groups one active topic across related evidence.",
      consequenceSummaryText: "Opening this reveals grouped context only; it does not trigger an external action.",
      provenanceSummaryText: "Traceable to grouped continuity sources in the append-only ledger.",
      sourceSummaryText: "Simulator anchored this preview in 2 linked sources.",
      autonomySummaryText: null,
    },
  );
});

test("decisionOsProactivePrimaryTrustBlockState prefers shared trust blocks on the main proactive card", () => {
  assert.deepEqual(
    decisionOsProactivePrimaryTrustBlockState({
      boundedReasonText: "Due today.",
      selectionReasonText: "Because the recommendation is ready for supplier review.",
      consequencePreviewText: "Approval would send the supplier-ready recommendation.",
      provenanceCueText: "Grounded in the supplier thread and scorecard.",
      sourceSummaryText: "Based on 1 source",
      confidenceText: "Confidence 0.84",
      hasApprovalReview: false,
      isSimulatorReviewPreview: false,
    }),
    {
      boundedReasonText: "Due today.",
      selectionReasonText: "Because the recommendation is ready for supplier review.",
      consequencePreviewText: "Approval would send the supplier-ready recommendation.",
      provenanceCueText: "Grounded in the supplier thread and scorecard.",
      sourceSummaryText: "Based on 1 source",
      confidenceText: "Confidence 0.84",
      showSharedTrustBlocks: true,
      showHeaderConfidence: false,
      showFooterSourceSummary: false,
    },
  );
});

test("decisionOsProactivePrimaryTrustBlockState keeps shared blocks off for approval review panels", () => {
  assert.deepEqual(
    decisionOsProactivePrimaryTrustBlockState({
      boundedReasonText: "Due today.",
      sourceSummaryText: "Based on 1 source",
      confidenceText: "Confidence 0.84",
      hasApprovalReview: true,
      isSimulatorReviewPreview: false,
    }),
    {
      boundedReasonText: "Due today.",
      selectionReasonText: null,
      consequencePreviewText: null,
      provenanceCueText: null,
      sourceSummaryText: "Based on 1 source",
      confidenceText: "Confidence 0.84",
      showSharedTrustBlocks: false,
      showHeaderConfidence: true,
      showFooterSourceSummary: false,
    },
  );
});

test("decisionOsProactivePrimaryTrustBlockState suppresses footer source summary for simulator review previews", () => {
  assert.deepEqual(
    decisionOsProactivePrimaryTrustBlockState({
      sourceSummaryText: "Based on 2 sources",
      hasApprovalReview: false,
      isSimulatorReviewPreview: true,
    }),
    {
      boundedReasonText: null,
      selectionReasonText: null,
      consequencePreviewText: null,
      provenanceCueText: null,
      sourceSummaryText: "Based on 2 sources",
      confidenceText: null,
      showSharedTrustBlocks: false,
      showHeaderConfidence: false,
      showFooterSourceSummary: false,
    },
  );
});
