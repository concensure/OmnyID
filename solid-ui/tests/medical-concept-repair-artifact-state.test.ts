import assert from "node:assert/strict";
import test from "node:test";

import { buildMedicalConceptRepairArtifactState } from "../src/lib/medicalConceptRepairArtifactState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "repair-artifact",
    title: "Medical concept-edge repair practice",
    filename: "medical-concept-edge-repair.md",
    markdown: [
      "Medical concept-edge repair queue: use the supplied relationship ID, score band, and graph tags.",
      "Focus: medical concept-edge review: pathophys -> presentation.",
      "medical_edge_attempt | relationship_id: medical-deck:0:pathophys_to_presentation:pathophys | total_items: 5 | correct_items: 2 | course_tag: course:med101",
      "score_band:weak",
    ].join("\n"),
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "practice_questions",
    reportLabel: "practice questions report",
    outputFormat: "chat_markdown",
    sourceLabels: ["Heart failure lecture"],
    policyLabel: "Keep extracted notes only",
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    answersIncluded: true,
    structuredItemCount: 3,
    sectionCount: 2,
    createdAt: 123,
    ...overrides,
  };
}

test("buildMedicalConceptRepairArtifactState detects concept-edge repair artifacts", () => {
  const state = buildMedicalConceptRepairArtifactState(artifact());

  assert.equal(state.isMedicalConceptRepair, true);
  assert.equal(state.repairKind, "concept_edge_repair");
  assert.deepEqual(state.relationshipIds, ["medical-deck:0:pathophys_to_presentation:pathophys"]);
  assert.deepEqual(state.scoreBands, ["weak"]);
  assert.ok(state.labels.includes("Medical concept-edge repair"));
  assert.ok(state.labels.includes("score band:weak"));
  assert.ok(state.labels.includes("relationship:medical-deck:0:pathophys_to_presentation:pathophys"));
  assert.ok(state.searchTerms.includes("medical_concept_edge_repair"));
  assert.ok(state.searchTerms.includes("score_band:weak"));
});

test("buildMedicalConceptRepairArtifactState detects missed-topic repair artifacts", () => {
  const state = buildMedicalConceptRepairArtifactState(artifact({
    title: "Medical missed-topic repair deck",
    markdown: "Medical missed-topic repair queue: safe metadata only. missed_topic: ACE inhibitor contraindications medical_missed_question_topics",
  }));

  assert.equal(state.isMedicalConceptRepair, true);
  assert.equal(state.repairKind, "missed_topic_repair");
  assert.deepEqual(state.relationshipIds, []);
  assert.deepEqual(state.scoreBands, []);
  assert.ok(state.labels.includes("Medical missed-topic repair"));
  assert.ok(state.searchTerms.includes("medical_missed_topic_repair"));
});

test("buildMedicalConceptRepairArtifactState ignores ordinary medical decks", () => {
  const state = buildMedicalConceptRepairArtifactState(artifact({
    title: "Cardiology cloze vignette deck",
    markdown: "- cloze_text: {{c1::ACE inhibitors}} reduce afterload | answer: ACE inhibitors",
  }));

  assert.equal(state.isMedicalConceptRepair, false);
  assert.equal(state.repairKind, null);
  assert.deepEqual(state.labels, []);
});
