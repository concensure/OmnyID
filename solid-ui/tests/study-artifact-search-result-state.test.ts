import assert from "node:assert/strict";
import test from "node:test";

import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import {
  buildStudyArtifactSearchResults,
} from "../src/lib/studyArtifactSearchResultState.ts";

function artifactFixture(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "quiz-1",
    title: "LAW101 Chapter 4 quiz",
    filename: "law101-chapter-4-quiz.md",
    markdown: [
      "# Quiz generator report",
      "",
      "- Question 1: What is consideration? Answer: Value exchanged. source: Chapter 4.pdf difficulty: medium",
    ].join("\n"),
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "quiz_generator",
    reportLabel: "quiz generator report",
    outputFormat: "copyable_outline",
    sourceLabels: ["Chapter 4.pdf"],
    policyLabel: "Keep extracted notes only",
    courseTag: "course:law101",
    chapterTag: "chapter:4",
    unitTag: "unit:contracts",
    moduleLabel: "Module 2",
    dueLabel: "2026-10-03T22:00:00.000Z",
    deadlineId: "deadline-42",
    providerId: "gcal",
    academicKind: "study_course",
    sessionId: "session-1",
    routeSource: "study_lens",
    answersIncluded: true,
    structuredItemCount: 1,
    sectionCount: 2,
    createdAt: 123,
    ...overrides,
  };
}

test("buildStudyArtifactSearchResults creates scoped searchable result cards", () => {
  const [result] = buildStudyArtifactSearchResults([artifactFixture()], "chapter:4 csv");

  assert.equal(result?.id, "quiz-1");
  assert.equal(result?.subtitle, "quiz generator report - course:law101 - unit:contracts - chapter:4 - Module 2 - 2026-10-03T22:00:00.000Z - gcal");
  assert.ok(result?.badges.includes("chapter:4"));
  assert.ok(result?.badges.includes("unit:contracts"));
  assert.ok(result?.badges.includes("Module 2"));
  assert.ok(result?.badges.includes("2026-10-03T22:00:00.000Z"));
  assert.ok(result?.badges.includes("deadline-42"));
  assert.ok(result?.badges.includes("gcal"));
  assert.ok(result?.badges.includes("answers included"));
  assert.ok(result?.badges.includes("1 structured rows"));
  assert.ok(result?.badges.some((badge) => badge.includes("Ready downloads: Markdown, HTML")));
  assert.ok(result?.badges.includes("csv ready"));
  assert.ok(result?.actions.includes("continue"));
  assert.ok(result?.actions.includes("print_pdf"));
  assert.ok(result?.actions.includes("download_csv"));
  assert.ok(result?.actions.includes("planned_docx"));
  assert.ok(result?.actions.includes("planned_jpg"));
  assert.ok(result?.actions.includes("planned_png"));
  assert.ok(result?.matchedFields.includes("chapter"));
  assert.ok(result?.matchedFields.includes("exports"));
});

test("buildStudyArtifactSearchResults exposes matched deadline and provider fields", () => {
  const [result] = buildStudyArtifactSearchResults([artifactFixture()], "deadline-42 gcal");

  assert.equal(result?.id, "quiz-1");
  assert.ok(result?.matchedFields.includes("deadline"));
  assert.ok(result?.matchedFields.includes("provider"));
});

test("buildStudyArtifactSearchResults withholds CSV action when rows are not parseable", () => {
  const [result] = buildStudyArtifactSearchResults([
    artifactFixture({
      markdown: "# Exam preparation report\n\nReview contract formation.",
      reportKind: "exam_preparation",
      reportLabel: "exam preparation report",
      answersIncluded: null,
      structuredItemCount: 0,
    }),
  ], "exam prep");

  assert.equal(result?.id, "quiz-1");
  assert.equal(result?.actions.includes("download_csv"), false);
  assert.ok(result?.actions.includes("planned_docx"));
  assert.ok(result?.actions.includes("planned_jpg"));
  assert.ok(result?.actions.includes("planned_png"));
  assert.ok(result?.badges.includes("browser pdf ready"));
  assert.ok(result?.badges.includes("native docx planned"));
  assert.ok(result?.badges.includes("image export planned"));
  assert.ok(result?.badges.some((badge) => badge.includes("Planned converters: Word, JPG, PNG")));
});

test("buildStudyArtifactSearchResults matches explicit export capability language", () => {
  const [result] = buildStudyArtifactSearchResults([artifactFixture()], "pdf browser export");

  assert.equal(result?.id, "quiz-1");
  assert.ok(result?.matchedFields.includes("exports"));
  assert.ok(result?.badges.some((badge) => badge.includes("Browser export: PDF")));
});

test("buildStudyArtifactSearchResults exposes medical repair badges and matched field", () => {
  const [result] = buildStudyArtifactSearchResults([
    artifactFixture({
      id: "medical-repair",
      title: "Cardiology concept-edge repair set",
      filename: "cardiology-concept-edge-repair.md",
      markdown: [
        "Medical concept-edge repair queue: use relationship ID, score band, and graph tags.",
        "medical_edge_attempt | relationship_id: medical-deck:0:pathophys_to_presentation:pathophys | total_items: 5 | correct_items: 2 | course_tag: course:med101",
        "score_band:weak",
      ].join("\n"),
      reportKind: "practice_questions",
      reportLabel: "practice questions report",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
      structuredItemCount: 5,
    }),
  ], "medical_concept_edge_repair score_band:weak");

  assert.equal(result?.id, "medical-repair");
  assert.ok(result?.badges.includes("Medical concept-edge repair"));
  assert.ok(result?.badges.includes("score band:weak"));
  assert.ok(result?.badges.includes("relationship:medical-deck:0:pathophys_to_presentation:pathophys"));
  assert.ok(result?.matchedFields.includes("repair"));
});

test("buildStudyArtifactSearchResults exposes medical quality badges and matched field", () => {
  const [result] = buildStudyArtifactSearchResults([
    artifactFixture({
      id: "medical-quality",
      title: "Cardiology shallow first-order upgrade",
      filename: "cardiology-shallow-upgrade.md",
      markdown: [
        "Medical shallow first-order card upgrade",
        "- cloze_text: Definition card | answer: fact | quality_flag: shallow | reasoning_order: first_order",
        "Bloat control: reduce review load before adding another broad deck.",
      ].join("\n"),
      reportKind: "practice_questions",
      reportLabel: "practice questions report",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
      structuredItemCount: 12,
    }),
  ], "quality_action:upgrade_first_order review overload");

  assert.equal(result?.id, "medical-quality");
  assert.ok(result?.badges.includes("Medical shallow-card upgrade"));
  assert.ok(result?.badges.includes("2 shallow first-order signals"));
  assert.ok(result?.badges.includes("Medical review-load control"));
  assert.ok(result?.matchedFields.includes("quality"));
});

test("buildStudyArtifactSearchResults exposes medical workflow badges and matched field", () => {
  const [result] = buildStudyArtifactSearchResults([
    artifactFixture({
      id: "medical-vignette-block",
      title: "Cardiology vignette block",
      filename: "cardiology-vignette-block.md",
      markdown: "Medical vignette block queue: generate freshly phrased clinical application questions from the current concept graph.",
      reportKind: "practice_questions",
      reportLabel: "practice questions report",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
      structuredItemCount: 8,
    }),
  ], "medical_vignette_block");

  assert.equal(result?.id, "medical-vignette-block");
  assert.ok(result?.badges.includes("Medical vignette block"));
  assert.ok(result?.matchedFields.includes("workflow"));
});

test("buildStudyArtifactSearchResults exposes medical topology badges and matched field", () => {
  const [result] = buildStudyArtifactSearchResults([
    artifactFixture({
      id: "medical-topology",
      title: "Cardiology cloze topology coverage",
      filename: "cardiology-topology.md",
      markdown: [
        "- cloze_text: ACE inhibitors reduce afterload | source_locator: slide 21 | system_tag: system:cardiovascular | concept_tags: pharm; management | reasoning_order: second_order",
        "- vignette_stem: A patient with HFrEF needs therapy | answer: ACE inhibitor | source_locator: slide 22 | concept_tags: condition:heart-failure; management:afterload",
      ].join("\n"),
      reportKind: "flashcard_deck",
      reportLabel: "flashcard deck report",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
      structuredItemCount: 2,
    }),
  ], "system:cardiovascular source locator coverage");

  assert.equal(result?.id, "medical-topology");
  assert.ok(result?.badges.includes("Medical topology coverage"));
  assert.ok(result?.badges.includes("system:cardiovascular"));
  assert.ok(result?.badges.includes("pharm"));
  assert.ok(result?.badges.includes("management"));
  assert.ok(result?.matchedFields.includes("topology"));
});

test("buildStudyArtifactSearchResults exposes medical topology gap badges and matched field", () => {
  const [sourceOnly] = buildStudyArtifactSearchResults([
    artifactFixture({
      id: "medical-source-only",
      title: "Cardiology source-only topology",
      filename: "cardiology-source-only.md",
      markdown: "Medical topology coverage readiness:Source only. system_tag: system:cardiovascular concept_tags: pharm; management",
      reportKind: "flashcard_deck",
      reportLabel: "flashcard deck report",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
    }),
  ], "topology_gap:source_only");
  const [overload] = buildStudyArtifactSearchResults([
    artifactFixture({
      id: "medical-overload",
      title: "Cardiology overloaded topology",
      filename: "cardiology-overload.md",
      markdown: "Medical topology coverage topology_gap:overload. system_tag: system:cardiovascular concept_tags: pharm; management",
      reportKind: "flashcard_deck",
      reportLabel: "flashcard deck report",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
    }),
  ], "topology_gap:overload");

  assert.equal(sourceOnly?.id, "medical-source-only");
  assert.ok(sourceOnly?.badges.includes("Source-only topology gap"));
  assert.ok(sourceOnly?.matchedFields.includes("topology"));
  assert.equal(overload?.id, "medical-overload");
  assert.ok(overload?.badges.includes("Review overload topology gap"));
  assert.ok(overload?.matchedFields.includes("topology"));
});

test("buildStudyArtifactSearchResults exposes medical trusted reference badges and matched field", () => {
  const [result] = buildStudyArtifactSearchResults([
    artifactFixture({
      id: "medical-trusted-reference",
      title: "Cardiology trusted cloze deck",
      filename: "cardiology-trusted.md",
      markdown: [
        "Medical detail zoom: fine detail.",
        "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
        "Source integrity: never treat LLM internal knowledge as source evidence.",
        "Clinical dataset boundary: do not use patient-level datasets such as MIMIC for ordinary card generation.",
      ].join("\n"),
      reportKind: "flashcard_deck",
      reportLabel: "flashcard deck report",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
    }),
  ], "detail_zoom:fine_detail trusted reference");

  assert.equal(result?.id, "medical-trusted-reference");
  assert.ok(result?.badges.includes("Medical trusted grounding"));
  assert.ok(result?.badges.includes("Detail zoom: fine detail"));
  assert.ok(result?.badges.includes("Trusted reference supported"));
  assert.ok(result?.badges.includes("Student-source primary"));
  assert.ok(result?.badges.includes("Clinical dataset restricted"));
  assert.ok(result?.matchedFields.includes("reference"));
});

test("buildStudyArtifactSearchResults limits results and keeps source/body matches visible", () => {
  const results = buildStudyArtifactSearchResults([
    artifactFixture({ id: "one", title: "First", createdAt: 3 }),
    artifactFixture({ id: "two", title: "Second", createdAt: 2 }),
    artifactFixture({ id: "three", title: "Third", createdAt: 1 }),
  ], "consideration Chapter", 2);

  assert.deepEqual(results.map((result) => result.id), ["one", "two"]);
  assert.ok(results[0]?.matchedFields.includes("source"));
  assert.ok(results[0]?.matchedFields.includes("body"));
});
