import assert from "node:assert/strict";
import test from "node:test";

import { buildMedicalConceptRelationshipState } from "../src/lib/medicalConceptRelationshipState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "med-deck",
    title: "Cardiology cloze deck",
    filename: "cardiology.md",
    markdown: [
      "- cloze_text: ACE inhibitors are contraindicated in {{c1::pregnancy}} | answer: pregnancy | source_label: Heart failure lecture | source_locator: slide 24 | course_tag: course:med101 | system_tag: cardio | unit_tag: unit:cardiology | chapter_tag: chapter:heart-failure | concept_tags: pharm; contraindication | reasoning_order: second_order",
      "- vignette_stem: A patient with heart failure develops cough after starting therapy. What mechanism explains this presentation? | answer: bradykinin accumulation | source_label: Heart failure lecture | source_locator: slide 26 | course_tag: course:med101 | system_tag: cardio | unit_tag: unit:cardiology | chapter_tag: chapter:heart-failure | concept_tags: pathophys; presentation | reasoning_order: third_order",
    ].join("\n"),
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "flashcard_deck",
    reportLabel: "Flashcards",
    outputFormat: "csv_flashcards",
    sourceLabels: ["Heart failure lecture"],
    policyLabel: null,
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    academicKind: "medical_cloze_vignette",
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

test("buildMedicalConceptRelationshipState extracts medical graph edges from structured recall rows", () => {
  const state = buildMedicalConceptRelationshipState({
    artifacts: [artifact()],
    courseTag: "course:med101",
  });

  assert.equal(state.totalRelationships, 2);
  assert.equal(state.systemsCount, 1);
  assert.equal(state.chaptersCount, 1);
  assert.equal(state.relationships[0]?.relationship, "pharm_to_contraindication");
  assert.equal(state.relationships[0]?.chapterTag, "chapter:heart-failure");
  assert.equal(state.relationships[0]?.sourceLocator, "slide 24");
  assert.match(state.summaryLabel, /2 medical concept relationships/i);
  assert.ok(state.gapLabels.some((gap) => /more edges/i.test(gap)));
});

test("buildMedicalConceptRelationshipState carries trusted grounding from source artifact", () => {
  const state = buildMedicalConceptRelationshipState({
    artifacts: [artifact({
      markdown: [
        "Medical detail zoom: clinical reasoning.",
        "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
        "Clinical dataset boundary: do not use patient-level datasets such as MIMIC for ordinary card generation.",
        "- vignette_stem: A patient with heart failure develops cough after starting therapy. What mechanism explains this presentation? | answer: bradykinin accumulation | source_label: Heart failure lecture | source_locator: slide 26 | course_tag: course:med101 | system_tag: cardio | unit_tag: unit:cardiology | chapter_tag: chapter:heart-failure | concept_tags: pathophys; presentation | reasoning_order: third_order",
      ].join("\n"),
    })],
  });

  assert.equal(state.relationships[0]?.detailZoom, "clinical_reasoning");
  assert.equal(state.relationships[0]?.trustedReferenceSupported, true);
  assert.equal(state.relationships[0]?.studentSourcePrimary, true);
  assert.equal(state.relationships[0]?.clinicalDatasetRestricted, true);
});

test("buildMedicalConceptRelationshipState requires enough scoped edges for regeneration basis", () => {
  const rows = Array.from({ length: 6 }, (_, index) =>
    `- cloze_text: Mechanism ${index} causes {{c1::presentation ${index}}} | answer: presentation ${index} | source_label: Cardio source | source_locator: slide ${index} | course_tag: course:med101 | system_tag: cardio | unit_tag: unit:cardiology | chapter_tag: chapter:heart-failure | concept_tags: pathophys; presentation | reasoning_order: second_order`
  ).join("\n");
  const state = buildMedicalConceptRelationshipState({
    artifacts: [artifact({ markdown: rows })],
  });

  assert.equal(state.totalRelationships, 6);
  assert.equal(state.hasRegenerativeBasis, true);
  assert.deepEqual(state.gapLabels, []);
});

test("buildMedicalConceptRelationshipState respects course scope", () => {
  const state = buildMedicalConceptRelationshipState({
    artifacts: [
      artifact({ id: "med", courseTag: "course:med101" }),
      artifact({ id: "other", courseTag: "course:law101" }),
    ],
    courseTag: "course:med101",
  });

  assert.equal(state.totalRelationships, 2);
  assert.ok(state.relationships.every((relationship) => relationship.artifactId === "med"));
});
