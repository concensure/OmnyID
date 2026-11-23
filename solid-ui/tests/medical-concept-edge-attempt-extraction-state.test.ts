import assert from "node:assert/strict";
import test from "node:test";

import { extractMedicalConceptEdgeAttemptsFromArtifact } from "../src/lib/medicalConceptEdgeAttemptExtractionState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "artifact",
    title: "Medical edge practice",
    filename: "edge-practice.md",
    markdown: "- medical_edge_attempt | relationship_id: edge:cardio:pharm | total_items: 5 | correct_items: 3 | course_tag: course:med101",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "practice_questions",
    reportLabel: "Practice questions",
    outputFormat: "chat_markdown",
    sourceLabels: ["Heart failure lecture"],
    policyLabel: null,
    courseTag: "course:med101",
    academicKind: "medical_cloze_vignette",
    sectionCount: 1,
    createdAt: 100,
    ...overrides,
  };
}

test("extractMedicalConceptEdgeAttemptsFromArtifact parses explicit edge attempt rows", () => {
  const attempts = extractMedicalConceptEdgeAttemptsFromArtifact(artifact());

  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.relationshipId, "edge:cardio:pharm");
  assert.equal(attempts[0]?.totalItems, 5);
  assert.equal(attempts[0]?.correctItems, 3);
  assert.equal(attempts[0]?.courseTag, "course:med101");
  assert.equal(attempts[0]?.source, "report_followup");
  assert.equal(attempts[0]?.createdAt, 100);
});

test("extractMedicalConceptEdgeAttemptsFromArtifact ignores generated question rows without attempt evidence", () => {
  const attempts = extractMedicalConceptEdgeAttemptsFromArtifact(artifact({
    markdown: [
      "- vignette_stem: A patient has cough after ACE inhibitor therapy | answer: bradykinin",
      "- medical_edge_attempt | relationship_id: | total_items: 0 | correct_items: 0",
    ].join("\n"),
  }));

  assert.deepEqual(attempts, []);
});

test("extractMedicalConceptEdgeAttemptsFromArtifact dedupes relationship rows", () => {
  const attempts = extractMedicalConceptEdgeAttemptsFromArtifact(artifact({
    markdown: [
      "- medical_edge_attempt | relationship_id: edge:1 | total_items: 4 | correct_items: 4",
      "- medical_edge_attempt | relationship_id: edge:1 | total_items: 4 | correct_items: 1",
      "- medical_edge_attempt | relationship_id: edge:2 | total_items: 3 | correct_items: 2",
    ].join("\n"),
  }));

  assert.deepEqual(attempts.map((attempt) => attempt.relationshipId), ["edge:1", "edge:2"]);
});
