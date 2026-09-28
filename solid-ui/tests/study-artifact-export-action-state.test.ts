import assert from "node:assert/strict";
import test from "node:test";

import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import {
  buildStudyArtifactAvailableActions,
  buildStudyArtifactCsvDownloadState,
  buildStudyArtifactDocumentDownloadState,
  buildStudyArtifactExportLabelState,
  isStudyArtifactPlannedAction,
  studyArtifactActionLabel,
  studyArtifactActionTone,
} from "../src/lib/studyArtifactExportActionState.ts";

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "quiz",
    title: "LAW101 Chapter 4 quiz",
    filename: "law101-chapter-4-quiz.md",
    markdown: "# Quiz generator report\n\n- Question 1: Define consideration. Answer: Value exchanged.",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "quiz_generator",
    reportLabel: "quiz generator report",
    outputFormat: "copyable_outline",
    sourceLabels: ["Chapter 4.pdf"],
    policyLabel: "Keep extracted notes only",
    courseTag: "course:law101",
    chapterTag: "chapter:4",
    unitTag: "unit:contracts",
    academicKind: "study_course",
    sessionId: "session-1",
    routeSource: "study_lens",
    answersIncluded: true,
    structuredItemCount: 1,
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

test("buildStudyArtifactExportLabelState separates ready and planned export labels", () => {
  const labels = buildStudyArtifactExportLabelState(artifact());

  assert.ok(labels.readyLabels.includes("Markdown ready"));
  assert.ok(labels.readyLabels.includes("HTML ready"));
  assert.ok(labels.readyLabels.includes("PDF via print"));
  assert.ok(labels.readyLabels.includes("Word (.doc) ready"));
  assert.ok(labels.readyLabels.includes("CSV ready"));
  assert.ok(labels.browserLabels.includes("PDF via browser"));
  assert.ok(labels.plannedLabels.includes("Word planned"));
  assert.ok(labels.plannedLabels.includes("JPG planned"));
  assert.ok(labels.plannedLabels.includes("PNG planned"));
  assert.match(labels.summary, /Ready downloads: Markdown, HTML, Word \(.doc\), CSV/);
  assert.match(labels.summary, /Browser export: PDF/);
  assert.match(labels.summary, /Planned converters: Word, JPG, PNG/);
});

test("buildStudyArtifactExportLabelState surfaces medical grounding export labels", () => {
  const labels = buildStudyArtifactExportLabelState(artifact({
    id: "medical-trusted",
    title: "Cardiology trusted cloze deck",
    filename: "cardiology-trusted.md",
    markdown: [
      "Medical detail zoom: fine detail.",
      "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
      "Source integrity: never treat LLM internal knowledge as source evidence.",
      "Clinical dataset boundary: do not use patient-level datasets such as MIMIC for ordinary card generation.",
      "- cloze_text: {{c1::ACE inhibitors}} reduce afterload | answer: ACE inhibitors | source_locator: slide 12 | chapter_tag: chapter:heart-failure",
    ].join("\n"),
    reportKind: "flashcard_deck",
    reportLabel: "flashcard deck",
    outputFormat: "csv_flashcards",
    sourceLabels: ["Heart failure lecture.pdf"],
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    academicKind: "medical_cloze_vignette",
  }));

  assert.ok(labels.readyLabels.includes("CSV ready"));
  assert.ok(labels.groundingLabels.includes("Medical trusted grounding"));
  assert.ok(labels.groundingLabels.includes("Detail zoom: fine detail"));
  assert.ok(labels.groundingLabels.includes("Trusted reference supported"));
  assert.ok(labels.groundingLabels.includes("Student-source primary"));
  assert.ok(labels.groundingLabels.includes("No internal-knowledge citations"));
  assert.ok(labels.groundingLabels.includes("Clinical dataset restricted"));
});

test("buildStudyArtifactAvailableActions exposes CSV only for parseable drill outputs", () => {
  const csvReady = buildStudyArtifactAvailableActions(artifact());
  const noCsv = buildStudyArtifactAvailableActions(artifact({
    markdown: "# Exam preparation report\n\nReview doctrine of consideration.",
    reportKind: "exam_preparation",
    reportLabel: "exam preparation report",
    structuredItemCount: 0,
  }));

  assert.ok(csvReady.includes("download_csv"));
  assert.ok(csvReady.includes("planned_docx"));
  assert.ok(csvReady.includes("planned_jpg"));
  assert.ok(csvReady.includes("planned_png"));
  assert.equal(noCsv.includes("download_csv"), false);
  assert.deepEqual(noCsv, [
    "continue",
    "copy",
    "download_markdown",
    "download_html",
    "download_word",
    "print_pdf",
    "planned_docx",
    "planned_jpg",
    "planned_png",
  ]);
});

test("buildStudyArtifactCsvDownloadState preserves full scope and medical grounding tags", () => {
  const state = buildStudyArtifactCsvDownloadState(artifact({
    id: "medical-trusted",
    title: "Cardiology trusted cloze deck",
    filename: "cardiology-trusted.md",
    markdown: [
      "Medical detail zoom: clinical reasoning.",
      "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
      "Source integrity: never treat LLM internal knowledge as source evidence.",
      "- cloze_text: {{c1::ACE inhibitors}} reduce afterload | answer: ACE inhibitors | source_locator: slide 12 | chapter_tag: chapter:heart-failure | reasoning_order: second_order",
    ].join("\n"),
    reportKind: "flashcard_deck",
    reportLabel: "flashcard deck",
    outputFormat: "csv_flashcards",
    sourceLabels: ["Heart failure lecture.pdf"],
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    moduleLabel: "Module 3",
    dueLabel: "2026-10-03T22:00:00.000Z",
    deadlineId: "deadline-42",
    providerId: "gcal",
    academicKind: "medical_cloze_vignette",
  }));

  assert.equal(state?.filename, "cardiology-trusted.csv");
  assert.equal(state?.mimeType, "text/csv;charset=utf-8");
  assert.equal(state?.rowCount, 1);
  assert.match(state?.csv ?? "", /course:med101/);
  assert.match(state?.csv ?? "", /unit:cardiology/);
  assert.match(state?.csv ?? "", /chapter:heart-failure/);
  assert.match(state?.csv ?? "", /Module 3/);
  assert.match(state?.csv ?? "", /deadline-42/);
  assert.match(state?.csv ?? "", /gcal/);
  assert.match(state?.csv ?? "", /medical_trusted_grounding/);
  assert.match(state?.csv ?? "", /detail_zoom:clinical_reasoning/);
  assert.match(state?.csv ?? "", /trusted_reference:student_source_primary/);
});

test("buildStudyArtifactDocumentDownloadState appends visible medical grounding when missing", () => {
  const state = buildStudyArtifactDocumentDownloadState(artifact({
    id: "medical-trusted",
    title: "Cardiology trusted cloze deck",
    filename: "cardiology-trusted.md",
    markdown: [
      "# Cardiology trusted cloze deck",
      "Medical detail zoom: fine detail.",
      "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
      "Source integrity: never treat LLM internal knowledge as source evidence.",
    ].join("\n"),
    reportKind: "flashcard_deck",
    reportLabel: "flashcard deck",
    outputFormat: "csv_flashcards",
    sourceLabels: ["Heart failure lecture.pdf"],
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    academicKind: "medical_cloze_vignette",
  }));

  assert.equal(state.htmlFilename, "cardiology-trusted.html");
  assert.equal(state.wordFilename, "cardiology-trusted.doc");
  assert.ok(state.groundingLabels.includes("Medical trusted grounding"));
  assert.match(state.markdown, /## Medical grounding/);
  assert.match(state.markdown, /Detail zoom: fine detail/);
  assert.match(state.html, /## Medical grounding/);
  assert.match(state.html, /Student-source primary/);
});

test("buildStudyArtifactDocumentDownloadState does not duplicate visible grounding section", () => {
  const state = buildStudyArtifactDocumentDownloadState(artifact({
    markdown: [
      "# Cardiology trusted cloze deck",
      "Medical detail zoom: fine detail.",
      "Trusted medical grounding: use retained student uploads and source locators first.",
      "## Medical grounding",
      "- Medical trusted grounding",
    ].join("\n"),
    academicKind: "medical_cloze_vignette",
  }));

  assert.equal((state.markdown.match(/## Medical grounding/g) ?? []).length, 1);
});

test("studyArtifactActionLabel and tone keep renderer copy consistent", () => {
  assert.equal(studyArtifactActionLabel("copy"), "Copy");
  assert.equal(studyArtifactActionLabel("copy", { copied: true }), "Copied");
  assert.equal(studyArtifactActionLabel("print_pdf"), "Print/PDF");
  assert.equal(studyArtifactActionLabel("planned_docx"), "DOCX planned");
  assert.equal(studyArtifactActionLabel("planned_jpg"), "JPG planned");
  assert.equal(studyArtifactActionLabel("planned_png"), "PNG planned");
  assert.equal(studyArtifactActionTone("continue"), "primary");
  assert.equal(studyArtifactActionTone("download_csv"), "csv");
  assert.equal(studyArtifactActionTone("download_markdown"), "markdown");
  assert.equal(studyArtifactActionTone("planned_docx"), "planned");
  assert.equal(isStudyArtifactPlannedAction("planned_docx"), true);
  assert.equal(isStudyArtifactPlannedAction("download_word"), false);
});
