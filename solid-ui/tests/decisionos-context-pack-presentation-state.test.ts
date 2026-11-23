import test from "node:test";
import assert from "node:assert/strict";

import { decisionOsContextPackTrustState } from "../src/lib/decisionOsContextPackPresentationState.ts";

test("decisionOsContextPackTrustState prioritizes bounded reasons and suppresses duplicate raw copy", () => {
  assert.deepEqual(
    decisionOsContextPackTrustState({
      pack_kind: "decision_packet",
      why_surfaced: "Multiple linked signals now point to the same renewal decision.",
      source_refs: ["sample-email-3", "sample-task-3", "sample-db-3"],
    }),
    {
      boundedReasonText: "Multiple linked signals now point to the same renewal decision.",
      distinctWhySurfacedText: null,
      priorityRationaleText: "Prioritized because multiple continuity sources point to the same need.",
      consequenceSummaryText: "Opening this reveals grouped context only; it does not trigger an external action.",
      provenanceSummaryText: "Traceable to grouped continuity sources in the append-only ledger.",
      sourceSummaryText: "Based on 3 sources",
      retrievalModeText: null,
      readinessReasonText: null,
      topologyBudgetText: null,
      workingSetText: null,
      activeTopicText: null,
      showBoundedReason: true,
      showDistinctWhySurfaced: false,
      showPriorityRationale: true,
      showConsequenceSummary: true,
      showProvenanceSummary: true,
      showSourceSummary: true,
      showRetrievalMode: false,
      showReadinessReason: false,
      showTopologyBudget: false,
      showWorkingSet: false,
      showActiveTopicCount: false,
    },
  );
});

test("decisionOsContextPackTrustState falls back to priority rationale when no why-surfaced copy is available", () => {
  const state = decisionOsContextPackTrustState({
    pack_kind: "topic_pack",
    why_surfaced: "",
    source_refs: ["thread:1"],
  });

  assert.equal(state.boundedReasonText, null);
  assert.equal(state.distinctWhySurfacedText, null);
  assert.equal(
    state.priorityRationaleText,
    "Prioritized because it groups one active topic across related evidence.",
  );
  assert.equal(
    state.consequenceSummaryText,
    "Opening this reveals grouped context only; it does not trigger an external action.",
  );
  assert.equal(
    state.provenanceSummaryText,
    "Traceable to grouped continuity sources in the append-only ledger.",
  );
  assert.equal(state.sourceSummaryText, "Based on 1 source");
  assert.equal(state.showBoundedReason, false);
  assert.equal(state.showDistinctWhySurfaced, false);
  assert.equal(state.showPriorityRationale, true);
  assert.equal(state.showConsequenceSummary, true);
  assert.equal(state.showProvenanceSummary, true);
  assert.equal(state.showSourceSummary, true);
});

test("decisionOsContextPackTrustState preserves retrieval and readiness metadata", () => {
  assert.deepEqual(
    decisionOsContextPackTrustState({
      pack_kind: "obligation_pack",
      why_surfaced: "Upcoming due follow-up is clustered with linked references.",
      source_refs: ["thread:1", "task:1"],
      retrieval_mode: "metadata_first_with_selective_deepening",
      deeper_retrieval_recommended: true,
      readiness_reason: "Metadata is sufficient now, but deeper retrieval would help if timing changes.",
      topology_budget_used: 4,
      working_set_count: 2,
      active_topic_count: 1,
    }),
    {
      boundedReasonText: "Upcoming due follow-up is clustered with linked references.",
      distinctWhySurfacedText: null,
      priorityRationaleText: "Prioritized because it bundles related obligations into one review point.",
      consequenceSummaryText: "Opening this reveals grouped context only; it does not trigger an external action.",
      provenanceSummaryText: "Traceable to grouped continuity sources in the append-only ledger.",
      sourceSummaryText: "Based on 2 sources",
      retrievalModeText: "Retrieval mode: metadata-first + deepen with deeper retrieval recommended.",
      readinessReasonText: "Metadata is sufficient now, but deeper retrieval would help if timing changes.",
      topologyBudgetText: "4 context items scanned",
      workingSetText: "2 working-set refs",
      activeTopicText: "1 active topic anchor",
      showBoundedReason: true,
      showDistinctWhySurfaced: false,
      showPriorityRationale: true,
      showConsequenceSummary: true,
      showProvenanceSummary: true,
      showSourceSummary: true,
      showRetrievalMode: true,
      showReadinessReason: true,
      showTopologyBudget: true,
      showWorkingSet: true,
      showActiveTopicCount: true,
    },
  );
});

test("decisionOsContextPackTrustState supports context-ready trust metadata", () => {
  assert.deepEqual(
    decisionOsContextPackTrustState({
      kind: "context_ready",
      why_surfaced: "Prepared context packet is ready for review.",
      source_refs: ["thread:1", "memory:2"],
      retrieval_mode: "metadata_first",
      deeper_retrieval_recommended: false,
      readiness_reason: "Current metadata already supports the next decision.",
      topology_budget_used: 3,
      working_set_count: 1,
      active_topic_count: 2,
    }),
    {
      boundedReasonText: "Prepared context packet is ready for review.",
      distinctWhySurfacedText: null,
      priorityRationaleText: null,
      consequenceSummaryText: null,
      provenanceSummaryText: "Traceable to append-only continuity artifacts.",
      sourceSummaryText: "Based on 2 sources",
      retrievalModeText: "Retrieval mode: metadata-first.",
      readinessReasonText: "Current metadata already supports the next decision.",
      topologyBudgetText: "3 context items scanned",
      workingSetText: "1 working-set ref",
      activeTopicText: "2 active topic anchors",
      showBoundedReason: true,
      showDistinctWhySurfaced: false,
      showPriorityRationale: false,
      showConsequenceSummary: false,
      showProvenanceSummary: true,
      showSourceSummary: true,
      showRetrievalMode: true,
      showReadinessReason: true,
      showTopologyBudget: true,
      showWorkingSet: true,
      showActiveTopicCount: true,
    },
  );
});
