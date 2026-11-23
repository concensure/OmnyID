import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMedicalTrustedReferenceArtifactState,
  inferMedicalDetailZoom,
  medicalTrustedReferencePromptLines,
} from "../src/lib/medicalTrustedReferenceState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function artifact(markdown: string): StudyReportArtifact {
  return {
    id: "medical-trusted",
    title: "Trusted cardiology deck",
    filename: "trusted-cardiology.md",
    markdown,
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "flashcard_deck",
    reportLabel: null,
    outputFormat: "csv_flashcards",
    sourceLabels: ["Heart failure lecture"],
    policyLabel: null,
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    academicKind: "medical_cloze_vignette",
    structuredItemCount: 12,
    sectionCount: 1,
    createdAt: 1,
  };
}

test("inferMedicalDetailZoom respects explicit and natural-language depth requests", () => {
  assert.equal(inferMedicalDetailZoom({
    searchQuery: "detail_zoom:fine_detail cranial nerve innervation",
  }), "fine_detail");
  assert.equal(inferMedicalDetailZoom({
    searchQuery: "Give me the larger anatomy big picture before details",
  }), "survey");
  assert.equal(inferMedicalDetailZoom({
    searchQuery: "Build clinical reasoning vignettes from pathophys to presentation",
  }), "clinical_reasoning");
  assert.equal(inferMedicalDetailZoom({
    searchQuery: "high-yield exam prep for renal physiology",
  }), "exam_prep");
  assert.equal(inferMedicalDetailZoom({
    searchQuery: "lecture-level cardiology review",
  }), "course_level");
});

test("medicalTrustedReferencePromptLines keeps student sources primary and avoids invented citations", () => {
  const prompt = medicalTrustedReferencePromptLines({
    searchQuery: "trusted_medical_reference PubMed UMLS detail_zoom:fine_detail beta blockers",
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    knowledgeGraphLinkTags: ["concept graph", "source_tier:open_reference"],
  }).join("\n");

  assert.match(prompt, /Medical detail zoom: fine detail/i);
  assert.match(prompt, /retained student uploads and source locators first/i);
  assert.match(prompt, /trusted open-reference snippets are available/i);
  assert.match(prompt, /never treat LLM internal knowledge as source evidence/i);
  assert.match(prompt, /UMLS\/MeSH may normalize synonyms/i);
  assert.match(prompt, /course_tag, unit_tag, chapter_tag, source_locator/i);
});

test("medicalTrustedReferencePromptLines restricts clinical datasets and supports survey zoom", () => {
  const prompt = medicalTrustedReferencePromptLines({
    searchQuery: "MIMIC clinical dataset broad anatomy overview",
    zettelkastenNextAction: "Use de-identified clinical data only if allowed.",
  }).join("\n");

  assert.match(prompt, /Medical detail zoom: survey/i);
  assert.match(prompt, /prefer larger structures/i);
  assert.match(prompt, /do not use patient-level datasets such as MIMIC for ordinary card generation/i);
  assert.match(prompt, /never produce patient-specific advice/i);
  assert.match(prompt, /do not invent external citations/i);
});

test("buildMedicalTrustedReferenceArtifactState makes saved medical grounding searchable", () => {
  const state = buildMedicalTrustedReferenceArtifactState(artifact([
    "Medical detail zoom: fine detail.",
    "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
    "Source integrity: never treat LLM internal knowledge as source evidence.",
    "Clinical dataset boundary: do not use patient-level datasets such as MIMIC for ordinary card generation.",
  ].join("\n")));

  assert.equal(state.hasMedicalTrustedReferenceSignal, true);
  assert.equal(state.detailZoom, "fine_detail");
  assert.equal(state.usesTrustedReferenceSupport, true);
  assert.equal(state.usesStudentSourcePrimaryRule, true);
  assert.equal(state.restrictsClinicalDatasetUse, true);
  assert.ok(state.labels.includes("Detail zoom: fine detail"));
  assert.ok(state.labels.includes("Trusted reference supported"));
  assert.ok(state.labels.includes("Student-source primary"));
  assert.ok(state.labels.includes("Clinical dataset restricted"));
  assert.ok(state.searchTerms.includes("detail_zoom:fine_detail"));
});

test("buildMedicalTrustedReferenceArtifactState ignores non-medical outputs", () => {
  const state = buildMedicalTrustedReferenceArtifactState({
    ...artifact("Trusted medical grounding should not apply here."),
    academicKind: null,
    reportKind: "lecture_summary",
    title: "Economics lecture summary",
    markdown: "A non-medical summary mentioning trusted sources.",
  });

  assert.equal(state.hasMedicalTrustedReferenceSignal, false);
  assert.deepEqual(state.labels, []);
});
