import assert from "node:assert/strict";
import test from "node:test";

import { buildMedicalAnkiQualityState } from "../src/lib/medicalAnkiQualityState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "medical-quality",
    title: "Cardiology shallow card upgrade",
    filename: "cardiology-shallow-upgrade.md",
    markdown: [
      "Medical shallow first-order card upgrade",
      "- cloze_text: Definition card | answer: fact | quality_flag: shallow | reasoning_order: first_order",
      "Bloat control: reduce review load before adding another broad deck.",
    ].join("\n"),
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "practice_questions",
    reportLabel: "practice questions report",
    outputFormat: "chat_markdown",
    sourceLabels: ["Cardio lecture"],
    policyLabel: null,
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    structuredItemCount: 12,
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

test("buildMedicalAnkiQualityState detects shallow upgrade and review-load signals", () => {
  const state = buildMedicalAnkiQualityState(artifact());

  assert.equal(state.hasQualitySignal, true);
  assert.equal(state.shallowFirstOrderCount, 2);
  assert.equal(state.hasShallowUpgradeAction, true);
  assert.equal(state.hasReviewOverloadSignal, true);
  assert.ok(state.labels.includes("Medical shallow-card upgrade"));
  assert.ok(state.labels.includes("2 shallow first-order signals"));
  assert.ok(state.labels.includes("Medical review-load control"));
  assert.ok(state.searchTerms.includes("quality_action:upgrade_first_order"));
});

test("buildMedicalAnkiQualityState ignores non-medical study reports", () => {
  const state = buildMedicalAnkiQualityState(artifact({
    title: "Law quiz",
    filename: "law-quiz.md",
    markdown: "first_order does not mean medical Anki here.",
    academicKind: "study_course",
    courseTag: "course:law101",
  }));

  assert.equal(state.hasQualitySignal, false);
  assert.deepEqual(state.labels, []);
});
