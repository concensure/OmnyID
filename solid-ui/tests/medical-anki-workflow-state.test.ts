import assert from "node:assert/strict";
import test from "node:test";

import { buildMedicalAnkiWorkflowState } from "../src/lib/medicalAnkiWorkflowState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "medical-workflow",
    title: "Cardiology graph-gap cloze deck",
    filename: "cardiology-gap-deck.md",
    markdown: "Medical graph-gap cloze deck queue: generate Anki-compatible cloze rows for graph gaps.",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "flashcard_deck",
    reportLabel: "flashcard deck report",
    outputFormat: "csv_flashcards",
    sourceLabels: ["Heart failure lecture"],
    policyLabel: null,
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

test("buildMedicalAnkiWorkflowState detects graph-gap cloze decks", () => {
  const state = buildMedicalAnkiWorkflowState(artifact());

  assert.equal(state.workflowKind, "graph_gap_cloze_deck");
  assert.ok(state.labels.includes("Medical graph-gap cloze deck"));
  assert.ok(state.searchTerms.includes("medical_gap_cloze_deck"));
  assert.ok(state.focusBadges.includes("medical_workflow:graph_gap_cloze_deck"));
});

test("buildMedicalAnkiWorkflowState detects vignette blocks", () => {
  const state = buildMedicalAnkiWorkflowState(artifact({
    title: "Cardiology vignette block",
    filename: "cardiology-vignette-block.md",
    markdown: "Medical vignette block queue: generate freshly phrased clinical application questions from the current concept graph.",
    reportKind: "practice_questions",
    outputFormat: "chat_markdown",
  }));

  assert.equal(state.workflowKind, "vignette_block");
  assert.ok(state.labels.includes("Medical vignette block"));
  assert.ok(state.searchTerms.includes("medical_vignette_block"));
  assert.ok(state.focusBadges.includes("medical_workflow:vignette_block"));
});

test("buildMedicalAnkiWorkflowState ignores non-medical graph language", () => {
  const state = buildMedicalAnkiWorkflowState(artifact({
    title: "Economics graph gaps",
    markdown: "Graph gaps in elasticity notes.",
    academicKind: "study_course",
    courseTag: "course:econ101",
  }));

  assert.equal(state.workflowKind, null);
  assert.deepEqual(state.labels, []);
});
