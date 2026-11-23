import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeGraphStudyRecommendationReportIntent } from "../src/lib/knowledgeGraphStudyRecommendationActionState.ts";

const baseFocus = {
  source: "knowledge_graph" as const,
  activeLens: "linked_ideas" as const,
  activeTag: "system:cardiovascular",
  courseTag: "course:med101",
  weekTag: null,
  lectureTag: null,
  unitTag: "unit:cardiology",
  chapterTag: "chapter:heart-failure",
  searchQuery: "",
};

test("buildKnowledgeGraphStudyRecommendationReportIntent preserves medical topology source-only deck scope", () => {
  const intent = buildKnowledgeGraphStudyRecommendationReportIntent("generate_gap_cloze_deck", {
    ...baseFocus,
    academicKind: "medical_cloze_vignette",
    focusTags: [
      "medical_topology_coverage",
      "readiness:Source only",
      "system:cardiovascular",
      "pharm",
      "management",
    ],
  });

  assert.equal(intent?.preferredKind, "flashcard_deck");
  assert.equal(intent?.academicKind, "medical_cloze_vignette");
  assert.ok(intent?.knowledgeGraphLinkTags.includes("medical_topology_coverage"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("topology_gap:source_only"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("readiness:Source only"));
  assert.match(intent?.zettelkastenNextAction ?? "", /medical topology coverage/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /Preserve source locators/i);
});

test("buildKnowledgeGraphStudyRecommendationReportIntent preserves medical topology vignette practice scope", () => {
  const intent = buildKnowledgeGraphStudyRecommendationReportIntent("generate_vignette_block", {
    ...baseFocus,
    academicKind: "medical_cloze_vignette",
    focusTags: [
      "medical_topology_coverage",
      "readiness:Ready for timed block",
      "presentation",
      "management",
    ],
  });

  assert.equal(intent?.preferredKind, "practice_questions");
  assert.ok(intent?.knowledgeGraphLinkTags.includes("medical_vignette_block"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("medical_topology_coverage"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("topology_practice_ready"));
  assert.match(intent?.zettelkastenNextAction ?? "", /freshly phrased vignette\/application questions/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /no copied proprietary QBank text/i);
});

test("buildKnowledgeGraphStudyRecommendationReportIntent keeps review-load actions non-destructive", () => {
  const intent = buildKnowledgeGraphStudyRecommendationReportIntent("review_card_load", {
    ...baseFocus,
    academicKind: "medical_cloze_vignette",
    focusTags: [
      "medical_topology_coverage",
      "readiness:Review overload",
      "first_order",
      "shallow",
    ],
  });

  assert.equal(intent?.preferredKind, "practice_questions");
  assert.ok(intent?.knowledgeGraphLinkTags.includes("review_load:recommendation_only"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("quality_action:upgrade_first_order"));
  assert.match(intent?.zettelkastenNextAction ?? "", /recommendations only/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /do not auto-suspend or rewrite cards without approval/i);
});

test("buildKnowledgeGraphStudyRecommendationReportIntent maps generic graph recommendations to existing report types", () => {
  assert.equal(
    buildKnowledgeGraphStudyRecommendationReportIntent("generate_flashcards", baseFocus)?.preferredKind,
    "flashcard_deck",
  );
  assert.equal(
    buildKnowledgeGraphStudyRecommendationReportIntent("generate_cheatsheet", baseFocus)?.preferredKind,
    "cheatsheet",
  );
  assert.equal(
    buildKnowledgeGraphStudyRecommendationReportIntent("start_guided_session", baseFocus)?.preferredKind,
    "guided_study_session",
  );
  assert.equal(
    buildKnowledgeGraphStudyRecommendationReportIntent("generate_exam_report", baseFocus)?.preferredKind,
    "exam_preparation",
  );
  assert.equal(buildKnowledgeGraphStudyRecommendationReportIntent("show_strongest_links", baseFocus), null);
});
