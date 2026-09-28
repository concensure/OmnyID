import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeGraphStudyRecommendationState } from "../src/lib/knowledgeGraphStudyRecommendationState.ts";
import type { KnowledgeGraphCoverageState } from "../src/lib/knowledgeGraphCoverageState.ts";
import type { KnowledgeGraphRobustnessState } from "../src/lib/knowledgeGraphRobustnessState.ts";
import type { KnowledgeGraphTrustState } from "../src/lib/knowledgeGraphTrustState.ts";

const robust: KnowledgeGraphRobustnessState = {
  grade: "robust",
  headline: "Robust",
  detail: "A healthy share of cards are reinforced.",
  tone: "emerald",
  primaryActionId: "show_strong_links",
  primaryActionLabel: "Show strongest links",
  secondaryActionId: "open_study_workspace",
  secondaryActionLabel: "Ask from this study focus",
};

const trusted: KnowledgeGraphTrustState = {
  grade: "trusted",
  headline: "Trusted",
  detail: "Trustworthy enough for revision.",
  badge: "Trusted",
  signals: [],
};

const denseCoverage: KnowledgeGraphCoverageState = {
  grade: "dense",
  headline: "Dense",
  detail: "Dense supertag coverage.",
  badge: "Dense",
  sourceMixLabel: "Mixed sources.",
  noteProgressLabel: "Permanent notes exist.",
  recommendedTag: "topic:elasticity",
  clusters: [],
};

test("study recommendation state turns a strong graph into immediate study outputs", () => {
  const state = buildKnowledgeGraphStudyRecommendationState({
    visibleCount: 8,
    activeLens: "linked_ideas",
    activeTag: null,
    courseTag: "course:ECON101",
    weekTag: null,
    lectureTag: null,
    strongCount: 3,
    reviewQueueCount: 0,
    zettelkastenCount: 0,
    robustness: robust,
    trust: trusted,
    coverage: denseCoverage,
  });

  assert.equal(state?.badge, "Ready for study output");
  assert.equal(state?.recommendations.some((item) => item.actionId === "generate_exam_report"), true);
  assert.equal(state?.recommendations.some((item) => item.actionId === "generate_flashcards"), true);
  assert.equal(state?.recommendations[0]?.actionId, "focus_strongest_cluster");
});

test("study recommendation state steers fragile graphs to next-source planning", () => {
  const state = buildKnowledgeGraphStudyRecommendationState({
    visibleCount: 2,
    activeLens: "all",
    activeTag: null,
    courseTag: null,
    weekTag: null,
    lectureTag: null,
    strongCount: 0,
    reviewQueueCount: 0,
    zettelkastenCount: 0,
    robustness: {
      ...robust,
      grade: "warming_up",
      tone: "amber",
      headline: "Warming",
      detail: "Too few cards.",
    },
    trust: {
      ...trusted,
      grade: "fragile",
      detail: "Fragile focus.",
    },
    coverage: {
      ...denseCoverage,
      grade: "sparse",
      recommendedTag: null,
    },
  });

  assert.equal(state?.badge, "Needs source reinforcement");
  assert.equal(state?.recommendations[0]?.actionId, "plan_next_source");
});

test("study recommendation state adds guided sessions for zettelkasten review", () => {
  const state = buildKnowledgeGraphStudyRecommendationState({
    visibleCount: 5,
    activeLens: "review_queue",
    activeTag: "zk:review_pending",
    courseTag: null,
    weekTag: null,
    lectureTag: null,
    strongCount: 1,
    reviewQueueCount: 4,
    zettelkastenCount: 5,
    robustness: null,
    trust: null,
    coverage: null,
  });

  assert.equal(state?.recommendations.some((item) => item.actionId === "start_guided_session"), true);
});

test("study recommendation state adds medical cloze and vignette actions for medical graph focus", () => {
  const state = buildKnowledgeGraphStudyRecommendationState({
    visibleCount: 12,
    activeLens: "linked_ideas",
    activeTag: "chapter:heart-failure",
    courseTag: "course:med101",
    weekTag: null,
    lectureTag: null,
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    focusTags: [
      "medical_concept_edge_review",
      "score_band:unattempted",
      "pathophys",
      "presentation",
    ],
    strongCount: 4,
    reviewQueueCount: 0,
    zettelkastenCount: 0,
    robustness: robust,
    trust: trusted,
    coverage: {
      ...denseCoverage,
      recommendedTag: null,
    },
  });

  assert.equal(state?.recommendations.some((item) => item.actionId === "generate_gap_cloze_deck"), true);
  assert.equal(state?.recommendations.some((item) => item.actionId === "generate_vignette_block"), true);
  assert.equal(state?.recommendations.some((item) => item.actionId === "review_card_load"), true);
  assert.match(
    state?.recommendations.find((item) => item.actionId === "generate_gap_cloze_deck")?.detail ?? "",
    /source locators, chapter\/unit tags, and concept supertags/i,
  );
});

test("study recommendation state keeps medical review-load control non-destructive", () => {
  const state = buildKnowledgeGraphStudyRecommendationState({
    visibleCount: 6,
    activeLens: "linked_ideas",
    activeTag: "quality_action:upgrade_first_order",
    courseTag: "course:med101",
    weekTag: null,
    lectureTag: null,
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    focusTags: ["review_load:recommendation_only", "first_order", "shallow"],
    strongCount: 1,
    reviewQueueCount: 1,
    zettelkastenCount: 0,
    robustness: null,
    trust: trusted,
    coverage: null,
  });
  const reviewLoad = state?.recommendations.find((item) => item.actionId === "review_card_load");

  assert.equal(reviewLoad?.actionLabel, "Review load");
  assert.match(reviewLoad?.detail ?? "", /recommendations only/i);
  assert.match(reviewLoad?.detail ?? "", /do not auto-suspend or rewrite cards without explicit student approval/i);
});

test("study recommendation state treats medical topology source-only gaps as deck work", () => {
  const state = buildKnowledgeGraphStudyRecommendationState({
    visibleCount: 5,
    activeLens: "linked_ideas",
    activeTag: "system:cardiovascular",
    courseTag: "course:med101",
    weekTag: null,
    lectureTag: null,
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    focusTags: [
      "medical_topology_coverage",
      "readiness:Source only",
      "topology_gap:source_only",
      "pharm",
      "management",
    ],
    strongCount: 0,
    reviewQueueCount: 0,
    zettelkastenCount: 0,
    robustness: null,
    trust: null,
    coverage: null,
  });
  const fillGap = state?.recommendations.find((item) => item.actionId === "generate_gap_cloze_deck");

  assert.equal(fillGap?.actionLabel, "Fill topology gaps");
  assert.match(fillGap?.detail ?? "", /missing source-grounded cloze\/vignette rows/i);
  assert.match(fillGap?.detail ?? "", /source locators, chapter\/unit scope, and concept supertags/i);
});

test("study recommendation state treats medical topology source-only labels as deck work", () => {
  const state = buildKnowledgeGraphStudyRecommendationState({
    visibleCount: 5,
    activeLens: "linked_ideas",
    activeTag: "Source-only topology gap",
    courseTag: "course:med101",
    weekTag: null,
    lectureTag: null,
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    focusTags: [
      "medical_topology_coverage",
      "Source-only topology gap",
      "pharm",
      "management",
    ],
    strongCount: 0,
    reviewQueueCount: 0,
    zettelkastenCount: 0,
    robustness: null,
    trust: null,
    coverage: null,
  });
  const fillGap = state?.recommendations.find((item) => item.actionId === "generate_gap_cloze_deck");

  assert.equal(fillGap?.actionLabel, "Fill topology gaps");
  assert.match(fillGap?.detail ?? "", /missing source-grounded cloze\/vignette rows/i);
});

test("study recommendation state treats medical topology overload as recommendation-only load control", () => {
  const state = buildKnowledgeGraphStudyRecommendationState({
    visibleCount: 5,
    activeLens: "linked_ideas",
    activeTag: "system:cardiovascular",
    courseTag: "course:med101",
    weekTag: null,
    lectureTag: null,
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    focusTags: [
      "medical_topology_coverage",
      "readiness:Review overload",
      "topology_gap:overload",
    ],
    strongCount: 0,
    reviewQueueCount: 0,
    zettelkastenCount: 0,
    robustness: null,
    trust: null,
    coverage: null,
  });
  const reviewLoad = state?.recommendations.find((item) => item.actionId === "review_card_load");

  assert.equal(reviewLoad?.actionLabel, "Review load");
  assert.match(reviewLoad?.detail ?? "", /recommendations only/i);
  assert.match(reviewLoad?.detail ?? "", /do not auto-suspend or rewrite cards without explicit student approval/i);
});

test("study recommendation state treats medical topology overload labels as load control", () => {
  const state = buildKnowledgeGraphStudyRecommendationState({
    visibleCount: 5,
    activeLens: "linked_ideas",
    activeTag: "Review overload topology gap",
    courseTag: "course:med101",
    weekTag: null,
    lectureTag: null,
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    focusTags: [
      "medical_topology_coverage",
      "Review overload topology gap",
    ],
    strongCount: 0,
    reviewQueueCount: 0,
    zettelkastenCount: 0,
    robustness: null,
    trust: null,
    coverage: null,
  });
  const reviewLoad = state?.recommendations.find((item) => item.actionId === "review_card_load");

  assert.equal(reviewLoad?.actionLabel, "Review load");
  assert.match(reviewLoad?.detail ?? "", /recommendations only/i);
});
