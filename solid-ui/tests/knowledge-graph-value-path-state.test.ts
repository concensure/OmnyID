import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeGraphValuePathState } from "../src/lib/knowledgeGraphValuePathState.ts";
import type { KnowledgeGraphCoverageState } from "../src/lib/knowledgeGraphCoverageState.ts";
import type { KnowledgeGraphRobustnessState } from "../src/lib/knowledgeGraphRobustnessState.ts";
import type { KnowledgeGraphTrustState } from "../src/lib/knowledgeGraphTrustState.ts";

const denseCoverage: KnowledgeGraphCoverageState = {
  grade: "dense",
  headline: "Dense",
  detail: "The strongest cluster inside this linked ideas focus is opportunity cost.",
  badge: "Dense clusters",
  sourceMixLabel: "3 cards already connect across different retained source types.",
  noteProgressLabel: "1 permanent note already exists.",
  recommendedTag: "topic:opportunity_cost",
  clusters: [{
    label: "opportunity cost",
    count: 4,
    reinforcedCount: 3,
    corroboratedCount: 2,
    filterTag: "topic:opportunity_cost",
    recommended: true,
  }],
};

const robustState: KnowledgeGraphRobustnessState = {
  grade: "robust",
  headline: "Robust",
  detail: "A healthy share of cards are reinforced by medium or strong links.",
  tone: "emerald",
  primaryActionId: "show_strong_links",
  primaryActionLabel: "Show strongest links",
  secondaryActionId: "open_study_workspace",
  secondaryActionLabel: "Ask from this study focus",
};

const trustedState: KnowledgeGraphTrustState = {
  grade: "trusted",
  headline: "Trusted",
  detail: "The current graph slice is trustworthy enough for fast revision.",
  badge: "Trusted focus",
  signals: [],
};

test("buildKnowledgeGraphValuePathState steers warm graphs to adjacent-source planning", () => {
  const state = buildKnowledgeGraphValuePathState({
    robustness: {
      grade: "warming_up",
      headline: "Warming",
      detail: "Cards exist, but meaningful links have not formed yet.",
      tone: "amber",
      primaryActionId: "open_files",
      primaryActionLabel: "Open retained sources",
      secondaryActionId: "open_study_workspace",
      secondaryActionLabel: "Add more study material",
    },
    trust: {
      grade: "fragile",
      headline: "Fragile",
      detail: "This graph focus is still too fragile to rely on heavily.",
      badge: "Fragile focus",
      signals: [],
    },
    coverage: null,
    activeLens: "all",
    activeTag: null,
    activeConnectionStrength: null,
    stronglyLinkedCount: 0,
    reviewQueueCount: 0,
    zettelkastenCount: 0,
  });

  assert.equal(state?.grade, "warmup");
  assert.equal(state?.primaryActionId, "plan_next_source");
});

test("buildKnowledgeGraphValuePathState prefers cluster focus for dense connected graphs", () => {
  const state = buildKnowledgeGraphValuePathState({
    robustness: robustState,
    trust: trustedState,
    coverage: denseCoverage,
    activeLens: "linked_ideas",
    activeTag: null,
    activeConnectionStrength: null,
    stronglyLinkedCount: 3,
    reviewQueueCount: 0,
    zettelkastenCount: 0,
  });

  assert.equal(state?.grade, "dense");
  assert.equal(state?.primaryActionId, "focus_cluster");
  assert.equal(state?.secondaryActionId, "show_strong_links");
});

test("buildKnowledgeGraphValuePathState prefers review queue for zettelkasten-heavy graph", () => {
  const state = buildKnowledgeGraphValuePathState({
    robustness: {
      grade: "developing",
      headline: "Developing",
      detail: "Review is backing up.",
      tone: "sky",
      primaryActionId: "focus_review_queue",
      primaryActionLabel: "Focus review queue",
      secondaryActionId: "open_study_workspace",
      secondaryActionLabel: "Continue note chain",
    },
    trust: null,
    coverage: {
      grade: "developing",
      headline: "Developing clusters",
      detail: "The clearest emerging thread is note branch.",
      badge: "Developing clusters",
      sourceMixLabel: "Source mix is narrow.",
      noteProgressLabel: "3 notes still sit in review.",
      recommendedTag: "zk:review_pending",
      clusters: [],
    },
    activeLens: "zettelkasten",
    activeTag: null,
    activeConnectionStrength: null,
    stronglyLinkedCount: 1,
    reviewQueueCount: 3,
    zettelkastenCount: 5,
  });

  assert.equal(state?.grade, "zettelkasten");
  assert.equal(state?.primaryActionId, "focus_review_queue");
});

test("buildKnowledgeGraphValuePathState uses strongest-links path for developing graph without cluster shift", () => {
  const state = buildKnowledgeGraphValuePathState({
    robustness: {
      grade: "developing",
      headline: "Developing",
      detail: "Some useful links exist already.",
      tone: "sky",
      primaryActionId: "show_strong_links",
      primaryActionLabel: "Show strongest links",
      secondaryActionId: "open_study_workspace",
      secondaryActionLabel: "Ask from this study focus",
    },
    trust: {
      grade: "developing",
      headline: "Developing trust",
      detail: "There is enough structure to start revising.",
      badge: "Developing trust",
      signals: [],
    },
    coverage: {
      grade: "developing",
      headline: "Developing clusters",
      detail: "The clearest emerging thread still needs reinforcement.",
      badge: "Developing clusters",
      sourceMixLabel: "Source mix is still forming.",
      noteProgressLabel: "No permanent-note depth yet.",
      recommendedTag: "topic:market_failures",
      clusters: [],
    },
    activeLens: "all",
    activeTag: "topic:market_failures",
    activeConnectionStrength: null,
    stronglyLinkedCount: 2,
    reviewQueueCount: 0,
    zettelkastenCount: 0,
  });

  assert.equal(state?.grade, "developing");
  assert.equal(state?.primaryActionId, "show_strong_links");
  assert.equal(state?.secondaryActionId, "plan_next_source");
});
