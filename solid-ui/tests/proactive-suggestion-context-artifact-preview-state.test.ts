import test from "node:test";
import assert from "node:assert/strict";

import { proactiveSuggestionContextArtifactPreviewState } from "../src/lib/proactiveSuggestionContextArtifactPreviewState.ts";

test("context artifact preview groups source, consequence, and provenance into shared trust blocks", () => {
  const state = proactiveSuggestionContextArtifactPreviewState({
    artifactPreviewOpen: true,
    hasActionPayload: false,
    contextArtifactPreviewAvailable: true,
    titleText: "Topic pack",
    evidenceSummaryText: "2 evidence kinds",
    sourceSummaryText: "Based on 2 sources",
    scopeCueText: "decision scope",
    artifactLineItems: ["Line 1"],
    referenceLabels: ["ref:1"],
    objectLabels: ["obj:1"],
    fileLabels: ["file:1"],
    anchorRefs: ["thread:1"],
    readinessReasonText: "Current metadata already supports the next decision.",
    retrievalModeText: "Retrieval mode: metadata-first.",
    consequenceSummaryText: "Opening this reveals grouped context only; it does not trigger an external action.",
    provenanceSummaryText: "Traceable to grouped continuity sources in the append-only ledger.",
    topologyBudgetText: "3 context items scanned",
    workingSetText: "1 working-set ref",
    activeTopicText: "2 active topic anchors",
  });

  assert.equal(state.showPanel, true);
  assert.equal(state.showSharedTrustBlocks, true);
  assert.equal(state.sourceSummaryText, "Based on 2 sources");
  assert.equal(
    state.consequenceSummaryText,
    "Opening this reveals grouped context only; it does not trigger an external action.",
  );
  assert.equal(
    state.provenanceSummaryText,
    "Traceable to grouped continuity sources in the append-only ledger.",
  );
  assert.equal(state.showReadinessReason, true);
  assert.equal(state.showRetrievalMode, true);
  assert.equal(state.showTopologyBudget, true);
  assert.equal(state.showWorkingSet, true);
  assert.equal(state.showActiveTopicCount, true);
});

test("context artifact preview hides shared trust blocks when no trust summaries are available", () => {
  const state = proactiveSuggestionContextArtifactPreviewState({
    artifactPreviewOpen: true,
    hasActionPayload: false,
    contextArtifactPreviewAvailable: true,
    titleText: "Topic pack",
    artifactLineItems: [],
    referenceLabels: [],
    objectLabels: [],
    fileLabels: [],
    anchorRefs: [],
  });

  assert.equal(state.showPanel, true);
  assert.equal(state.showSharedTrustBlocks, false);
  assert.equal(state.showArtifactLines, false);
  assert.equal(state.showReferenceLabels, false);
});
