import assert from "node:assert/strict";
import test from "node:test";

import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import {
  buildStudyArtifactFilterChips,
  buildStudyArtifactSearchIndex,
  searchStudyArtifacts,
} from "../src/lib/studyArtifactSearchIndexState.ts";

function artifactFixture(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "artifact-1",
    title: "LAW101 contracts quiz",
    filename: "law101-contracts-quiz.md",
    markdown: [
      "# Quiz generator report",
      "",
      "- Question 1: What is consideration? Answer: Value exchanged. source: Chapter 4.pdf difficulty: medium chapter_tag:chapter:4 unit_tag:unit:contracts",
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
    sessionId: "study-session-1",
    routeSource: "study_lens",
    answersIncluded: true,
    structuredItemCount: 1,
    sectionCount: 2,
    createdAt: 123,
    ...overrides,
  };
}

test("buildStudyArtifactSearchIndex preserves academic scope and export contract metadata", () => {
  const [entry] = buildStudyArtifactSearchIndex([artifactFixture()]);

  assert.equal(entry?.courseTag, "course:law101");
  assert.equal(entry?.chapterTag, "chapter:4");
  assert.equal(entry?.unitTag, "unit:contracts");
  assert.equal(entry?.moduleLabel, "Module 2");
  assert.equal(entry?.dueLabel, "2026-10-03T22:00:00.000Z");
  assert.equal(entry?.deadlineId, "deadline-42");
  assert.equal(entry?.providerId, "gcal");
  assert.equal(entry?.answersIncluded, true);
  assert.equal(entry?.structuredItemCount, 1);
  assert.ok(entry?.scopeRequirements.includes("chapter"));
  assert.ok(entry?.scopeRequirements.includes("unit"));
  assert.ok(entry?.structureRequirements.includes("answer_policy"));
  assert.ok(entry?.structureRequirements.includes("structured_rows"));
  assert.ok(entry?.readyExportFormats.includes("csv"));
  assert.ok(entry?.readyExportFormats.includes("browser_pdf"));
  assert.ok(entry?.plannedExportFormats.includes("native_docx_planned"));
  assert.ok(entry?.plannedExportFormats.includes("image_export_planned"));
  assert.match(entry?.exportCapabilitySummary ?? "", /Ready downloads: Markdown, HTML, Word \(.doc\), CSV/);
  assert.match(entry?.exportCapabilitySummary ?? "", /Browser export: PDF/);
  assert.match(entry?.exportCapabilitySummary ?? "", /Planned converters: Word, JPG, PNG/);
  assert.ok(entry?.exportCapabilityLabels.includes("PDF browser export"));
  assert.ok(entry?.exportCapabilityLabels.includes("JPG planned converter"));
});

test("searchStudyArtifacts finds saved outputs by chapter, unit, answer policy, and export terms", () => {
  const quiz = artifactFixture();
  const summary = artifactFixture({
    id: "summary",
    title: "Biology lecture summary",
    filename: "biology-summary.md",
    markdown: "# Lecture summary report\n\nCellular respiration.",
    reportKind: "lecture_summary",
    reportLabel: "lecture summary report",
    sourceLabels: ["Week 2 lecture.pdf"],
    courseTag: "course:bio100",
    chapterTag: "chapter:2",
    unitTag: "unit:respiration",
    moduleLabel: null,
    dueLabel: null,
    deadlineId: null,
    providerId: null,
    answersIncluded: null,
    structuredItemCount: 0,
    createdAt: 122,
  });

  assert.deepEqual(searchStudyArtifacts([quiz, summary], "chapter:4 csv").map((item) => item.id), ["artifact-1"]);
  assert.deepEqual(searchStudyArtifacts([quiz, summary], "unit:contracts answers included").map((item) => item.id), ["artifact-1"]);
  assert.deepEqual(searchStudyArtifacts([quiz, summary], "Module 2 deadline-42").map((item) => item.id), ["artifact-1"]);
  assert.deepEqual(searchStudyArtifacts([quiz, summary], "gcal 2026-10-03").map((item) => item.id), ["artifact-1"]);
  assert.deepEqual(searchStudyArtifacts([quiz, summary], "native docx planned").map((item) => item.id), ["artifact-1", "summary"]);
  assert.deepEqual(searchStudyArtifacts([quiz, summary], "image export planned").map((item) => item.id), ["artifact-1", "summary"]);
  assert.deepEqual(searchStudyArtifacts([quiz, summary], "browser pdf").map((item) => item.id), ["artifact-1", "summary"]);
  assert.deepEqual(searchStudyArtifacts([quiz, summary], "planned converter jpg").map((item) => item.id), ["artifact-1", "summary"]);
  assert.deepEqual(searchStudyArtifacts([quiz, summary], "pdf browser export").map((item) => item.id), ["artifact-1", "summary"]);
  assert.deepEqual(searchStudyArtifacts([quiz, summary], "lecture respiration").map((item) => item.id), ["summary"]);
});

test("searchStudyArtifacts finds withheld-answer and structured-row drill outputs", () => {
  const pendingQuiz = artifactFixture({
    answersIncluded: false,
    structuredItemCount: 12,
  });

  assert.deepEqual(searchStudyArtifacts([pendingQuiz], "answers withheld").map((item) => item.id), ["artifact-1"]);
  assert.deepEqual(searchStudyArtifacts([pendingQuiz], "12 structured items").map((item) => item.id), ["artifact-1"]);
  assert.deepEqual(searchStudyArtifacts([pendingQuiz], "answer policy structured rows").map((item) => item.id), ["artifact-1"]);
});

test("searchStudyArtifacts finds medical cloze vignette outputs by chapter and reasoning order", () => {
  const medicalDeck = artifactFixture({
    id: "medical-deck",
    title: "Cardiology cloze vignette deck",
    filename: "cardiology-cloze-vignette-deck.md",
    markdown: "- cloze_text: {{c1::ACE inhibitors}} reduce afterload | vignette_stem: HFrEF with high afterload | answer: ACE inhibitors | source_locator: Chapter 7 page 12 | chapter_tag:chapter:heart-failure | system_tag:cardio | concept_tags:pathophys, pharm | reasoning_order:second_order\n",
    reportKind: "flashcard_deck",
    reportLabel: "flashcard deck report",
    outputFormat: "csv_flashcards",
    sourceLabels: ["Cardio lecture"],
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    structuredItemCount: 1,
  });

  const [entry] = buildStudyArtifactSearchIndex([medicalDeck]);

  assert.equal(entry?.academicKind, "medical_cloze_vignette");
  assert.equal(entry?.chapterTag, "chapter:heart-failure");
  assert.ok(entry?.readyExportFormats.includes("csv"));
  assert.deepEqual(searchStudyArtifacts([medicalDeck], "second_order heart-failure vignette").map((item) => item.id), ["medical-deck"]);
  assert.deepEqual(searchStudyArtifacts([medicalDeck], "source locator chapter 7").map((item) => item.id), ["medical-deck"]);
});

test("searchStudyArtifacts finds medical repair outputs by repair kind, score band, and relationship", () => {
  const repairDeck = artifactFixture({
    id: "medical-repair",
    title: "Cardiology concept-edge repair set",
    filename: "cardiology-concept-edge-repair.md",
    markdown: [
      "Medical concept-edge repair queue: use relationship ID, score band, and graph tags.",
      "medical concept-edge review: pathophys -> presentation",
      "medical_edge_attempt | relationship_id: medical-deck:0:pathophys_to_presentation:pathophys | total_items: 5 | correct_items: 2 | course_tag: course:med101",
      "score_band:weak",
    ].join("\n"),
    reportKind: "practice_questions",
    reportLabel: "practice questions report",
    outputFormat: "chat_markdown",
    sourceLabels: ["Cardio lecture"],
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    structuredItemCount: 5,
  });
  const [entry] = buildStudyArtifactSearchIndex([repairDeck]);

  assert.ok(entry?.metadataLabels.includes("Medical concept-edge repair"));
  assert.ok(entry?.metadataLabels.includes("score band:weak"));
  assert.ok(entry?.metadataLabels.includes("relationship:medical-deck:0:pathophys_to_presentation:pathophys"));
  assert.deepEqual(searchStudyArtifacts([repairDeck], "medical_concept_edge_repair weak").map((item) => item.id), ["medical-repair"]);
  assert.deepEqual(searchStudyArtifacts([repairDeck], "score_band:weak pathophys_to_presentation").map((item) => item.id), ["medical-repair"]);
  assert.deepEqual(searchStudyArtifacts([repairDeck], "relationship:medical-deck:0:pathophys_to_presentation:pathophys").map((item) => item.id), ["medical-repair"]);
});

test("searchStudyArtifacts finds medical quality and review-load outputs", () => {
  const qualityDeck = artifactFixture({
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
    outputFormat: "chat_markdown",
    sourceLabels: ["Cardio lecture"],
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    structuredItemCount: 12,
  });
  const [entry] = buildStudyArtifactSearchIndex([qualityDeck]);

  assert.ok(entry?.metadataLabels.includes("Medical shallow-card upgrade"));
  assert.ok(entry?.metadataLabels.includes("2 shallow first-order signals"));
  assert.ok(entry?.metadataLabels.includes("Medical review-load control"));
  assert.deepEqual(searchStudyArtifacts([qualityDeck], "quality_action:upgrade_first_order").map((item) => item.id), ["medical-quality"]);
  assert.deepEqual(searchStudyArtifacts([qualityDeck], "review overload").map((item) => item.id), ["medical-quality"]);
  assert.deepEqual(searchStudyArtifacts([qualityDeck], "shallow first_order").map((item) => item.id), ["medical-quality"]);
});

test("searchStudyArtifacts finds medical graph-gap and vignette workflow outputs", () => {
  const graphGapDeck = artifactFixture({
    id: "medical-gap-deck",
    title: "Cardiology graph-gap cloze deck",
    filename: "cardiology-gap-deck.md",
    markdown: "Medical graph-gap cloze deck queue: generate Anki-compatible cloze rows for graph gaps.",
    reportKind: "flashcard_deck",
    reportLabel: "flashcard deck report",
    outputFormat: "csv_flashcards",
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
  });
  const vignetteBlock = artifactFixture({
    id: "medical-vignette-block",
    title: "Cardiology vignette block",
    filename: "cardiology-vignette-block.md",
    markdown: "Medical vignette block queue: generate freshly phrased clinical application questions from the current concept graph.",
    reportKind: "practice_questions",
    reportLabel: "practice questions report",
    outputFormat: "chat_markdown",
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
  });
  const entries = buildStudyArtifactSearchIndex([graphGapDeck, vignetteBlock]);

  assert.ok(entries.find((entry) => entry.id === "medical-gap-deck")?.metadataLabels.includes("Medical graph-gap cloze deck"));
  assert.ok(entries.find((entry) => entry.id === "medical-vignette-block")?.metadataLabels.includes("Medical vignette block"));
  assert.deepEqual(searchStudyArtifacts([graphGapDeck, vignetteBlock], "medical_gap_cloze_deck").map((item) => item.id), ["medical-gap-deck"]);
  assert.deepEqual(searchStudyArtifacts([graphGapDeck, vignetteBlock], "medical_vignette_block").map((item) => item.id), ["medical-vignette-block"]);
});

test("searchStudyArtifacts finds medical topology coverage by system, concept, and locator state", () => {
  const locatedDeck = artifactFixture({
    id: "medical-located",
    title: "Cardiology cloze deck",
    filename: "cardiology-cloze.md",
    markdown: [
      "- cloze_text: ACE inhibitors reduce afterload | source_locator: slide 21 | system_tag: system:cardiovascular | concept_tags: pharm; management | reasoning_order: second_order",
      "- vignette_stem: A patient with HFrEF needs therapy | answer: ACE inhibitor | source_locator: slide 22 | concept_tags: condition:heart-failure; management:afterload",
    ].join("\n"),
    reportKind: "flashcard_deck",
    reportLabel: "flashcard deck report",
    academicKind: "medical_cloze_vignette",
  });
  const needsLocator = artifactFixture({
    id: "medical-needs-locator",
    title: "Renal cloze deck",
    filename: "renal-cloze.md",
    markdown: "Medical cloze row without locator. system_tag: system:renal concept_tags: pathophys; complication",
    reportKind: "flashcard_deck",
    reportLabel: "flashcard deck report",
    academicKind: "medical_cloze_vignette",
  });
  const sourceOnly = artifactFixture({
    id: "medical-source-only",
    title: "Cardiology source-only topology",
    filename: "cardiology-source-only.md",
    markdown: "Medical topology coverage readiness:Source only. system_tag: system:cardiovascular concept_tags: pharm; management",
    reportKind: "flashcard_deck",
    reportLabel: "flashcard deck report",
    academicKind: "medical_cloze_vignette",
  });
  const overload = artifactFixture({
    id: "medical-overload",
    title: "Cardiology overloaded topology",
    filename: "cardiology-overload.md",
    markdown: "Medical topology coverage topology_gap:overload. system_tag: system:cardiovascular concept_tags: pharm; management",
    reportKind: "flashcard_deck",
    reportLabel: "flashcard deck report",
    academicKind: "medical_cloze_vignette",
  });
  const entries = buildStudyArtifactSearchIndex([locatedDeck, needsLocator, sourceOnly, overload]);

  assert.ok(entries.find((entry) => entry.id === "medical-located")?.metadataLabels.includes("Medical topology coverage"));
  assert.ok(entries.find((entry) => entry.id === "medical-located")?.metadataLabels.includes("system:cardiovascular"));
  assert.ok(entries.find((entry) => entry.id === "medical-located")?.metadataLabels.includes("2 source locators"));
  assert.ok(entries.find((entry) => entry.id === "medical-needs-locator")?.metadataLabels.includes("Needs source locator"));
  assert.ok(entries.find((entry) => entry.id === "medical-source-only")?.metadataLabels.includes("Source-only topology gap"));
  assert.ok(entries.find((entry) => entry.id === "medical-overload")?.metadataLabels.includes("Review overload topology gap"));
  assert.deepEqual(searchStudyArtifacts([locatedDeck, needsLocator, sourceOnly, overload], "system:renal needs locator").map((item) => item.id), ["medical-needs-locator"]);
  assert.deepEqual(searchStudyArtifacts([locatedDeck, needsLocator, sourceOnly, overload], "topology_gap:source_only").map((item) => item.id), ["medical-source-only"]);
  assert.deepEqual(searchStudyArtifacts([locatedDeck, needsLocator, sourceOnly, overload], "topology_gap:overload").map((item) => item.id), ["medical-overload"]);
  assert.deepEqual(searchStudyArtifacts([locatedDeck, needsLocator, sourceOnly, overload], "medical coverage").map((item) => item.id), ["medical-located", "medical-needs-locator", "medical-source-only", "medical-overload"]);
});

test("searchStudyArtifacts finds medical trusted reference and detail zoom labels", () => {
  const trusted = artifactFixture({
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
  });
  const [entry] = buildStudyArtifactSearchIndex([trusted]);

  assert.ok(entry?.metadataLabels.includes("Medical trusted grounding"));
  assert.ok(entry?.metadataLabels.includes("Detail zoom: fine detail"));
  assert.ok(entry?.metadataLabels.includes("Trusted reference supported"));
  assert.ok(entry?.metadataLabels.includes("Student-source primary"));
  assert.ok(entry?.metadataLabels.includes("Clinical dataset restricted"));
  assert.deepEqual(searchStudyArtifacts([trusted], "detail_zoom:fine_detail trusted_medical_reference").map((item) => item.id), ["medical-trusted-reference"]);
  assert.deepEqual(searchStudyArtifacts([trusted], "clinical dataset restricted").map((item) => item.id), ["medical-trusted-reference"]);
});

test("buildStudyArtifactFilterChips exposes scope, export, answer, and structure chips", () => {
  const chips = buildStudyArtifactFilterChips([artifactFixture()]);

  assert.equal(chips.find((chip) => chip.kind === "course")?.query, "course:law101");
  assert.equal(chips.find((chip) => chip.kind === "chapter")?.query, "chapter:4");
  assert.equal(chips.find((chip) => chip.kind === "unit")?.query, "unit:contracts");
  assert.equal(chips.find((chip) => chip.kind === "module")?.query, "Module 2");
  assert.equal(chips.find((chip) => chip.kind === "deadline" && chip.query === "deadline-42")?.query, "deadline-42");
  assert.equal(chips.find((chip) => chip.kind === "provider")?.query, "gcal");
  assert.ok(chips.some((chip) => chip.kind === "format" && chip.query === "csv"));
  assert.ok(chips.some((chip) => chip.kind === "format" && chip.query === "browser_pdf"));
  assert.ok(chips.some((chip) => chip.kind === "answer" && chip.query === "answers included"));
  assert.ok(chips.some((chip) => chip.kind === "structure" && chip.query === "structured rows"));
});

test("buildStudyArtifactFilterChips exposes medical repair chips", () => {
  const chips = buildStudyArtifactFilterChips([
    artifactFixture({
      id: "medical-repair",
      title: "Cardiology concept-edge repair set",
      filename: "cardiology-concept-edge-repair.md",
      markdown: [
        "Medical concept-edge repair queue: use relationship ID, score band, and graph tags.",
        "medical_edge_attempt | relationship_id: medical-deck:0:pathophys_to_presentation:pathophys | total_items: 5 | correct_items: 2 | course_tag: course:med101",
        "score_band:weak",
      ].join("\n"),
      academicKind: "medical_cloze_vignette",
    }),
  ]);

  assert.ok(chips.some((chip) => chip.kind === "repair" && chip.query === "Medical concept-edge repair"));
  assert.ok(chips.some((chip) => chip.kind === "repair" && chip.query === "score band:weak"));
  assert.ok(chips.some((chip) => chip.kind === "repair" && chip.query === "relationship:medical-deck:0:pathophys_to_presentation:pathophys"));
});

test("buildStudyArtifactFilterChips exposes medical quality chips", () => {
  const chips = buildStudyArtifactFilterChips([
    artifactFixture({
      id: "medical-quality",
      title: "Cardiology shallow first-order upgrade",
      filename: "cardiology-shallow-upgrade.md",
      markdown: [
        "Medical shallow first-order card upgrade",
        "- cloze_text: Definition card | answer: fact | quality_flag: shallow | reasoning_order: first_order",
        "Bloat control: reduce review load before adding another broad deck.",
      ].join("\n"),
      academicKind: "medical_cloze_vignette",
    }),
  ]);

  assert.ok(chips.some((chip) => chip.kind === "quality" && chip.query === "Medical shallow-card upgrade"));
  assert.ok(chips.some((chip) => chip.kind === "quality" && chip.query === "2 shallow first-order signals"));
  assert.ok(chips.some((chip) => chip.kind === "quality" && chip.query === "Medical review-load control"));
});

test("buildStudyArtifactFilterChips exposes medical workflow chips", () => {
  const chips = buildStudyArtifactFilterChips([
    artifactFixture({
      id: "medical-gap-deck",
      title: "Cardiology graph-gap cloze deck",
      filename: "cardiology-gap-deck.md",
      markdown: "Medical graph-gap cloze deck queue: generate Anki-compatible cloze rows for graph gaps.",
      academicKind: "medical_cloze_vignette",
    }),
    artifactFixture({
      id: "medical-vignette-block",
      title: "Cardiology vignette block",
      filename: "cardiology-vignette-block.md",
      markdown: "Medical vignette block queue: generate freshly phrased clinical application questions from the current concept graph.",
      academicKind: "medical_cloze_vignette",
    }),
  ]);

  assert.ok(chips.some((chip) => chip.kind === "workflow" && chip.query === "Medical graph-gap cloze deck"));
  assert.ok(chips.some((chip) => chip.kind === "workflow" && chip.query === "Medical vignette block"));
});

test("buildStudyArtifactFilterChips exposes medical topology chips", () => {
  const chips = buildStudyArtifactFilterChips([
    artifactFixture({
      id: "medical-located",
      title: "Cardiology cloze deck",
      filename: "cardiology-cloze.md",
      markdown: "- cloze_text: ACE inhibitor | source_locator: slide 21 | system_tag: system:cardiovascular | concept_tags: pharm; management readiness:Source only",
      academicKind: "medical_cloze_vignette",
    }),
  ]);

  assert.ok(chips.some((chip) => chip.kind === "topology" && chip.query === "Medical topology coverage"));
  assert.ok(chips.some((chip) => chip.kind === "topology" && chip.query === "system:cardiovascular"));
  assert.ok(chips.some((chip) => chip.kind === "topology" && chip.query === "1 source locator"));
  assert.ok(chips.some((chip) => chip.kind === "topology" && chip.query === "Source-only topology gap"));
});

test("buildStudyArtifactFilterChips exposes medical trusted reference chips", () => {
  const chips = buildStudyArtifactFilterChips([
    artifactFixture({
      id: "medical-trusted-reference",
      title: "Cardiology trusted cloze deck",
      filename: "cardiology-trusted.md",
      markdown: [
        "Medical detail zoom: fine detail.",
        "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
        "Source integrity: never treat LLM internal knowledge as source evidence.",
      ].join("\n"),
      academicKind: "medical_cloze_vignette",
    }),
  ]);

  assert.ok(chips.some((chip) => chip.kind === "reference" && chip.query === "Medical trusted grounding"));
  assert.ok(chips.some((chip) => chip.kind === "reference" && chip.query === "Detail zoom: fine detail"));
  assert.ok(chips.some((chip) => chip.kind === "reference" && chip.query === "Trusted reference supported"));
  assert.ok(chips.some((chip) => chip.kind === "reference" && chip.query === "Student-source primary"));
});
