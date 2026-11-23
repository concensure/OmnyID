import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudyResultExportCapabilitySummary,
  buildStudyResultExportManifest,
  buildStudyResultExportState,
  csvForStudyRows,
  extractStudyCsvRowsFromMarkdown,
  htmlFilenameForMarkdownFilename,
  printableHtmlForMarkdown,
  wordFilenameForMarkdownFilename,
} from "../src/lib/studyResultExportState.ts";

test("buildStudyResultExportState creates reusable markdown from study sections", () => {
  const state = buildStudyResultExportState({
    query: "Create a flashcard deck report for biology week 4",
    summary: "This result turns retained source material into active recall.",
    sourceLabels: ["Week 4 Slides.pdf", "Tutorial Questions.docx"],
    policyLabel: "Connected notes + Keep extracted notes only",
    sections: [
      {
        id: "concepts",
        title: "Main concepts",
        items: ["Cellular respiration converts glucose into ATP.", "Mitochondria are central to aerobic respiration."],
      },
      {
        id: "actions",
        title: "Next revision actions",
        items: ["Drill ten recall cards before attempting practice questions."],
      },
    ],
  });

  assert.equal(state?.canExport, true);
  assert.equal(state?.filename, "create-a-flashcard-deck-report-for-biology-week-4.md");
  assert.equal(state?.htmlFilename, "create-a-flashcard-deck-report-for-biology-week-4.html");
  assert.equal(state?.wordFilename, "create-a-flashcard-deck-report-for-biology-week-4.doc");
  assert.equal(state?.mimeType, "text/markdown;charset=utf-8");
  assert.equal(state?.downloadLabel, "Download Markdown");
  assert.equal(state?.answersIncludedLabel, "Answer availability follows the saved output");
  assert.equal(state?.sectionCount, 2);
  assert.deepEqual(state?.readyExportTargets.map((target) => target.id), ["markdown", "html", "pdf", "word_doc"]);
  assert.ok(state?.plannedExportTargets.some((target) => target.id === "docx"));
  assert.ok(state?.plannedExportTargets.some((target) => target.id === "jpg"));
  assert.ok(state?.plannedExportTargets.some((target) => target.id === "csv"));
  assert.match(state?.markdown ?? "", /^# Create a flashcard deck report for biology week 4/m);
  assert.match(state?.html ?? "", /<h1>Create a flashcard deck report for biology week 4<\/h1>/);
  assert.match(state?.markdown ?? "", /## Sources used/);
  assert.match(state?.markdown ?? "", /Week 4 Slides\.pdf/);
  assert.match(state?.markdown ?? "", /## Retention policy/);
  assert.match(state?.markdown ?? "", /Connected notes \+ Keep extracted notes only/);
  assert.match(state?.markdown ?? "", /## Main concepts/);
  assert.match(state?.markdown ?? "", /Cellular respiration converts glucose into ATP/);
  assert.match(state?.markdown ?? "", /## Next revision actions/);
});

test("buildStudyResultExportState tracks quiz answer export policy", () => {
  const unfinished = buildStudyResultExportState({
    query: "Quiz generator report",
    answersIncluded: false,
    sections: [{ id: "quiz", title: "Quiz", items: ["Question 1: Define consideration."] }],
  });
  const completed = buildStudyResultExportState({
    query: "Quiz generator report",
    answersIncluded: true,
    sections: [{ id: "quiz", title: "Quiz", items: ["Question 1: Define consideration. Answer: value exchanged."] }],
  });

  assert.equal(unfinished?.answersIncludedLabel, "Answers export after completion");
  assert.ok(unfinished?.exportTargets.every((target) => target.answerPolicy === "when_completed"));
  assert.equal(completed?.answersIncludedLabel, "Answers included where generated");
  assert.ok(completed?.exportTargets.every((target) => target.answerPolicy === "included"));
});

test("buildStudyResultExportState enables CSV for parseable drill rows", () => {
  const state = buildStudyResultExportState({
    query: "Quiz generator report",
    answersIncluded: true,
    sourceLabels: ["Chapter 4.pdf"],
    sections: [
      {
        id: "quiz",
        title: "Quiz",
        items: [
          "Question 1: Define consideration. Answer: Value exchanged in a contract. Source: Chapter 4.pdf Difficulty: easy",
          "Front: Promissory estoppel | Back: Reliance-based exception to strict consideration rules.",
        ],
      },
    ],
  });

  assert.equal(state?.csvFilename, "quiz-generator-report.csv");
  assert.equal(state?.csvRowCount, 2);
  assert.ok(state?.csv?.includes('"Define consideration."'));
  assert.ok(state?.csv?.includes('"Value exchanged in a contract."'));
  assert.ok(state?.csv?.includes('"Chapter 4.pdf"'));
  assert.ok(state?.csv?.includes('"easy"'));
  assert.ok(state?.readyExportTargets.some((target) => target.id === "csv"));
  assert.equal(state?.plannedExportTargets.some((target) => target.id === "csv"), false);
});

test("buildStudyResultExportState carries course unit and chapter metadata into generated CSV", () => {
  const state = buildStudyResultExportState({
    query: "Flashcard deck report",
    answersIncluded: true,
    sourceLabels: ["Chapter 4.pdf"],
    policyLabel: "Keep extracted notes only",
    courseTag: "course:law101",
    unitTag: "unit:contracts",
    chapterTag: "chapter:4",
    moduleLabel: "Module 2",
    dueLabel: "2026-10-03T22:00:00.000Z",
    deadlineId: "deadline-42",
    providerId: "gcal",
    academicKind: "study_course",
    sessionId: "session-123",
    sections: [
      {
        id: "actions",
        title: "Cards",
        items: ["Front: Duty of care | Back: Legal obligation to avoid foreseeable harm."],
      },
    ],
  });

  assert.ok(state?.metadataLabels.includes("course:law101"));
  assert.ok(state?.metadataLabels.includes("unit:contracts"));
  assert.ok(state?.metadataLabels.includes("chapter:4"));
  assert.ok(state?.metadataLabels.includes("Module 2"));
  assert.ok(state?.metadataLabels.includes("2026-10-03T22:00:00.000Z"));
  assert.ok(state?.metadataLabels.includes("deadline-42"));
  assert.ok(state?.metadataLabels.includes("gcal"));
  assert.ok(state?.metadataLabels.includes("study_course"));
  assert.ok(state?.metadataLabels.includes("session-123"));
  assert.ok(state?.metadataLabels.includes("Keep extracted notes only"));
  assert.match(state?.markdown ?? "", /## Study scope/);
  assert.match(state?.html ?? "", /<h2>Study scope<\/h2>/);
  assert.match(state?.csv ?? "", /course:law101; unit:contracts; chapter:4; Module 2; 2026-10-03T22:00:00.000Z; deadline-42; gcal/);
});

test("buildStudyResultExportState preserves medical grounding and detail zoom in exports", () => {
  const state = buildStudyResultExportState({
    query: "Cardiology cloze deck",
    summary: "Generate source-grounded cloze cards from retained cardiology material.",
    sourceLabels: ["Heart failure lecture.pdf"],
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    academicKind: "medical_cloze_vignette",
    sections: [
      {
        id: "cards",
        title: "Cards",
        items: [
          "Medical detail zoom: fine detail.",
          "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
          "Source integrity: never treat LLM internal knowledge as source evidence.",
          "cloze_text: {{c1::ACE inhibitors}} reduce afterload | answer: ACE inhibitors | source_locator: Heart failure lecture slide 12 | chapter_tag: chapter:heart-failure | reasoning_order: second_order",
        ],
      },
    ],
  });

  assert.ok(state?.metadataLabels.includes("Medical trusted grounding"));
  assert.ok(state?.metadataLabels.includes("Detail zoom: fine detail"));
  assert.ok(state?.metadataLabels.includes("Trusted reference supported"));
  assert.ok(state?.metadataLabels.includes("Student-source primary"));
  assert.ok(state?.metadataLabels.includes("No internal-knowledge citations"));
  assert.match(state?.markdown ?? "", /## Medical grounding/);
  assert.match(state?.markdown ?? "", /Detail zoom: fine detail/);
  assert.match(state?.html ?? "", /<h2>Medical grounding<\/h2>/);
  assert.match(state?.html ?? "", /Student-source primary/);
  assert.match(state?.csv ?? "", /medical_trusted_grounding/);
  assert.match(state?.csv ?? "", /detail_zoom:fine_detail/);
  assert.match(state?.csv ?? "", /trusted_reference:student_source_primary/);
});

test("extractStudyCsvRowsFromMarkdown redacts answers for unfinished quizzes", () => {
  const rows = extractStudyCsvRowsFromMarkdown(
    "- Question 1: Define consideration. Answer: Value exchanged.\n",
    {
      answersIncluded: false,
      sourceLabels: ["Chapter 4.pdf"],
      courseTag: "course:law101",
      unitTag: "unit:contracts",
      chapterTag: "chapter:4",
      moduleLabel: "Module 2",
      dueLabel: "2026-10-03T22:00:00.000Z",
      deadlineId: "deadline-42",
      providerId: "gcal",
    },
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.answer, "");
  assert.equal(rows[0]?.source, "Chapter 4.pdf");
  assert.equal(rows[0]?.tags, "course:law101; unit:contracts; chapter:4; Module 2; 2026-10-03T22:00:00.000Z; deadline-42; gcal");
  assert.match(csvForStudyRows(rows), /^"kind","prompt","answer","source","difficulty","tags"/);
});

test("extractStudyCsvRowsFromMarkdown preserves medical cloze vignette fields", () => {
  const rows = extractStudyCsvRowsFromMarkdown(
    [
      "- cloze_text: {{c1::ACE inhibitors}} reduce afterload in HFrEF | plain_question: Which drug class reduces afterload in HFrEF? | vignette_stem: A patient has systolic heart failure and high afterload. | answer: ACE inhibitors | extra: Watch potassium and creatinine | wrong_answer_rationale: Beta blockers are useful but not the afterload-focused answer here | source_label: Cardio lecture | source_locator: Chapter 7 page 12 | course_tag: course:med101 | system_tag: cardio | unit_tag: unit:cardiology | chapter_tag: chapter:heart-failure | lecture_tag: lecture:hf | concept_tags: pathophys, pharm | difficulty: medium | review_priority: high | quality_flag: source_grounded | reasoning_order: second_order",
    ].join("\n"),
    {
      answersIncluded: true,
      sourceLabels: ["Fallback.pdf"],
      courseTag: "course:med101",
      unitTag: "unit:cardiology",
      chapterTag: "chapter:heart-failure",
    },
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, "practice");
  assert.equal(rows[0]?.prompt, "{{c1::ACE inhibitors}} reduce afterload in HFrEF");
  assert.equal(rows[0]?.answer, "ACE inhibitors");
  assert.equal(rows[0]?.source, "Cardio lecture");
  assert.equal(rows[0]?.sourceLocator, "Chapter 7 page 12");
  assert.equal(rows[0]?.chapterTag, "chapter:heart-failure");
  assert.equal(rows[0]?.reasoningOrder, "second_order");
  assert.equal(rows[0]?.wrongAnswerRationale, "Beta blockers are useful but not the afterload-focused answer here");
  assert.match(csvForStudyRows(rows), /"cloze_text","plain_question","vignette_stem"/);
  assert.match(csvForStudyRows(rows), /"chapter:heart-failure"/);
  assert.match(csvForStudyRows(rows), /"second_order"/);
});

test("extractStudyCsvRowsFromMarkdown adds medical trusted-grounding tags to CSV rows", () => {
  const rows = extractStudyCsvRowsFromMarkdown(
    [
      "Medical detail zoom: clinical reasoning.",
      "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
      "Source integrity: never treat LLM internal knowledge as source evidence.",
      "- cloze_text: {{c1::ACE inhibitors}} reduce afterload | answer: ACE inhibitors | source_locator: Chapter 7 page 12 | course_tag: course:med101 | chapter_tag: chapter:heart-failure | reasoning_order: second_order",
    ].join("\n"),
    { answersIncluded: true },
  );

  assert.equal(rows.length, 1);
  assert.match(rows[0]?.tags ?? "", /medical_trusted_grounding/);
  assert.match(rows[0]?.tags ?? "", /detail_zoom:clinical_reasoning/);
  assert.match(rows[0]?.tags ?? "", /trusted_reference:supported/);
  assert.match(rows[0]?.tags ?? "", /trusted_reference:student_source_primary/);
  assert.match(rows[0]?.tags ?? "", /trusted_reference:no_internal_knowledge_citations/);
  assert.match(csvForStudyRows(rows), /medical_trusted_grounding/);
  assert.match(csvForStudyRows(rows), /detail_zoom:clinical_reasoning/);
});

test("extractStudyCsvRowsFromMarkdown withholds medical answers and rationales before completion", () => {
  const rows = extractStudyCsvRowsFromMarkdown(
    "- cloze_text: {{c1::loop diuretics}} relieve congestion | answer: furosemide | wrong_answer_rationale: ACE inhibitors are not acute decongestants | source_locator: Chapter 8 | chapter_tag:chapter:hf | reasoning_order:first_order\n",
    { answersIncluded: false },
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.answer, "");
  assert.equal(rows[0]?.wrongAnswerRationale, "");
  assert.equal(rows[0]?.sourceLocator, "Chapter 8");
});

test("buildStudyResultExportManifest exposes ready and planned standard formats", () => {
  const manifest = buildStudyResultExportManifest({
    title: "Quiz generator report",
    filename: "quiz-generator-report.md",
    answersIncluded: false,
    reportKind: "quiz_generator",
    outputFormat: "copyable_outline",
    courseTag: "course:law101",
    unitTag: "unit:contracts",
    chapterTag: "chapter:consideration",
    moduleLabel: "Module 2",
    dueLabel: "2026-10-03T22:00:00.000Z",
    deadlineId: "deadline-42",
    providerId: "gcal",
    academicKind: "study_course",
    sessionId: "session-123",
    policyLabel: "Keep extracted notes only",
    sourceLabels: ["Chapter 4.pdf", "Tutorial notes.docx"],
  });

  assert.equal(manifest.answerPolicyLabel, "Answers export after completion");
  assert.deepEqual(manifest.readyEntries.map((entry) => entry.id), ["markdown", "html", "pdf", "word_doc"]);
  assert.deepEqual(manifest.plannedEntries.map((entry) => entry.id), ["docx", "jpg", "png", "csv"]);
  assert.equal(manifest.entries.find((entry) => entry.id === "pdf")?.action, "print");
  assert.equal(manifest.entries.find((entry) => entry.id === "docx")?.enabled, false);
  assert.equal(manifest.entries.find((entry) => entry.id === "word_doc")?.filename, "quiz-generator-report.doc");
  assert.equal(manifest.entries.find((entry) => entry.id === "jpg")?.filename, "quiz-generator-report.jpg");
  assert.ok(manifest.metadataLabels.includes("course:law101"));
  assert.ok(manifest.metadataLabels.includes("unit:contracts"));
  assert.ok(manifest.metadataLabels.includes("chapter:consideration"));
  assert.ok(manifest.metadataLabels.includes("Module 2"));
  assert.ok(manifest.metadataLabels.includes("2026-10-03T22:00:00.000Z"));
  assert.ok(manifest.metadataLabels.includes("deadline-42"));
  assert.ok(manifest.metadataLabels.includes("gcal"));
  assert.ok(manifest.metadataLabels.includes("Chapter 4.pdf"));
});

test("buildStudyResultExportManifest includes medical grounding metadata for saved artifacts", () => {
  const manifest = buildStudyResultExportManifest({
    title: "Cardiology trusted cloze deck",
    filename: "cardiology-trusted.md",
    markdown: [
      "Medical detail zoom: clinical reasoning.",
      "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
      "Clinical dataset boundary: do not use patient-level datasets such as MIMIC for ordinary card generation.",
    ].join("\n"),
    reportKind: "flashcard_deck",
    outputFormat: "csv_flashcards",
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    academicKind: "medical_cloze_vignette",
    sourceLabels: ["Heart failure lecture.pdf"],
    answersIncluded: true,
  });

  assert.ok(manifest.metadataLabels.includes("Medical trusted grounding"));
  assert.ok(manifest.metadataLabels.includes("Detail zoom: clinical reasoning"));
  assert.ok(manifest.metadataLabels.includes("Trusted reference supported"));
  assert.ok(manifest.metadataLabels.includes("Student-source primary"));
  assert.ok(manifest.metadataLabels.includes("Clinical dataset restricted"));
  assert.ok(manifest.metadataLabels.includes("chapter:heart-failure"));
});

test("buildStudyResultExportCapabilitySummary separates direct browser and planned exports", () => {
  const manifest = buildStudyResultExportManifest({
    title: "Exam prep report",
    filename: "exam-prep.md",
    answersIncluded: false,
    markdown: "- Question 1: Define duty of care. Answer: Legal obligation.\n",
  });
  const summary = buildStudyResultExportCapabilitySummary(manifest);

  assert.deepEqual(summary.readyDownloadLabels, ["Markdown", "HTML", "Word (.doc)", "CSV"]);
  assert.deepEqual(summary.browserActionLabels, ["PDF"]);
  assert.deepEqual(summary.plannedConversionLabels, ["Word", "JPG", "PNG"]);
  assert.match(summary.studentSummary, /Ready downloads: Markdown, HTML, Word \(.doc\), CSV/);
  assert.match(summary.studentSummary, /Browser export: PDF/);
  assert.match(summary.studentSummary, /Planned converters: Word, JPG, PNG/);
  assert.ok(summary.searchLabels.includes("PDF browser export"));
  assert.ok(summary.searchLabels.includes("JPG planned converter"));
  assert.ok(summary.searchLabels.includes("Answers export after completion"));
});

test("buildStudyResultExportManifest enables CSV from saved markdown when parseable", () => {
  const manifest = buildStudyResultExportManifest({
    title: "Flashcard deck report",
    filename: "flashcard-deck-report.md",
    markdown: "- Front: Duty of care | Back: A legal obligation to avoid foreseeable harm.\n",
    reportKind: "flashcard_deck",
    answersIncluded: true,
  });

  assert.equal(manifest.readyEntries.some((entry) => entry.id === "csv"), true);
  assert.equal(manifest.plannedEntries.some((entry) => entry.id === "csv"), false);
  assert.equal(manifest.entries.find((entry) => entry.id === "csv")?.filename, "flashcard-deck-report.csv");
});

test("buildStudyResultExportState returns null for empty non-study output", () => {
  assert.equal(buildStudyResultExportState({ sections: [] }), null);
});

test("printableHtmlForMarkdown supports saved artifact HTML and Word exports", () => {
  const html = printableHtmlForMarkdown("Quiz <Answers>", "# Quiz\n\n- A < B & C");

  assert.equal(htmlFilenameForMarkdownFilename("quiz.md"), "quiz.html");
  assert.equal(wordFilenameForMarkdownFilename("quiz.md"), "quiz.doc");
  assert.match(html, /<title>Quiz &lt;Answers&gt;<\/title>/);
  assert.match(html, /# Quiz/);
  assert.match(html, /A &lt; B &amp; C/);
});

test("buildStudyResultExportState trims long query headings", () => {
  const state = buildStudyResultExportState({
    query: "x".repeat(120),
    sections: [{ id: "actions", title: "Next revision actions", items: ["Start now."] }],
  });

  assert.equal(state?.title.length, 90);
  assert.match(state?.title ?? "", /\.\.\.$/);
  assert.match(state?.filename ?? "", /^x+\.md$/);
});

test("buildStudyResultExportState falls back to a safe filename", () => {
  const state = buildStudyResultExportState({
    query: "???",
    sections: [{ id: "actions", title: "Next revision actions", items: ["Start now."] }],
  });

  assert.equal(state?.filename, "study-result.md");
});
