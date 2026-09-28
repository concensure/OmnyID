import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudyReportArtifactExportManifest,
  buildStudyReportArtifactListState,
  buildStudyReportArtifactContinuationSeed,
  buildStudyReportArtifact,
  filterStudyReportArtifacts,
  loadStudyReportArtifacts,
  normalizeStudyReportArtifacts,
  saveStudyReportArtifact,
  STUDY_REPORT_ARTIFACTS_KEY,
} from "../src/lib/studyReportArtifactLocalState.ts";

function storageFixture(): Storage {
  const state = new Map<string, string>();
  return {
    get length() {
      return state.size;
    },
    clear() {
      state.clear();
    },
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    key(index: number) {
      return [...state.keys()][index] ?? null;
    },
    removeItem(key: string) {
      state.delete(key);
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

test("buildStudyReportArtifact creates a durable local report artifact", () => {
  const artifact = buildStudyReportArtifact({
    now: 1234,
    sourceLabels: ["Week 3.pdf", "Week 3.pdf", "Tutorial.docx"],
    policyLabel: "Keep extracted notes only",
    exportState: {
      title: "Exam prep",
      filename: "exam-prep.md",
      htmlFilename: "exam-prep.html",
      wordFilename: "exam-prep.doc",
      markdown: "# Exam prep\n",
      html: "<h1>Exam prep</h1>",
      mimeType: "text/markdown;charset=utf-8",
      printLabel: "Print",
      copyLabel: "Copy",
      downloadLabel: "Download",
      canExport: true,
      sectionCount: 3,
      exportTargets: [],
      readyExportTargets: [],
      plannedExportTargets: [],
      answersIncludedLabel: "Answer availability follows the saved output",
      answersIncluded: null,
      metadataLabels: [],
    },
  });

  assert.equal(artifact.id, "exam-prep.md:1234");
  assert.equal(artifact.reportKind, "exam_preparation");
  assert.equal(artifact.reportLabel, "exam preparation report");
  assert.deepEqual(artifact.sourceLabels, ["Week 3.pdf", "Tutorial.docx"]);
  assert.equal(artifact.policyLabel, "Keep extracted notes only");
  assert.equal(artifact.courseTag, null);
  assert.equal(artifact.academicKind, null);
  assert.equal(artifact.sessionId, null);
  assert.equal(artifact.routeSource, null);
  assert.equal(artifact.answersIncluded, null);
  assert.equal(artifact.structuredItemCount, 0);
});

test("buildStudyReportArtifact preserves course and session linkage metadata", () => {
  const artifact = buildStudyReportArtifact({
    now: 2345,
    sourceLabels: ["Week 3.pdf"],
    policyLabel: "Keep extracted notes only",
    courseTag: "course:econ101",
    chapterTag: "chapter:4",
    unitTag: "unit:market-failures",
    moduleLabel: "Module 2",
    dueLabel: "2026-10-03T22:00:00.000Z",
    deadlineId: "deadline-42",
    providerId: "gcal",
    academicKind: "study_course",
    sessionId: "session-1",
    routeSource: "study_lens",
    exportState: {
      title: "Course quiz",
      filename: "course-quiz.md",
      htmlFilename: "course-quiz.html",
      wordFilename: "course-quiz.doc",
      markdown: "# Quiz generator report\n",
      html: "<h1>Quiz generator report</h1>",
      mimeType: "text/markdown;charset=utf-8",
      printLabel: "Print",
      copyLabel: "Copy",
      downloadLabel: "Download",
      canExport: true,
      sectionCount: 2,
      exportTargets: [],
      readyExportTargets: [],
      plannedExportTargets: [],
      answersIncludedLabel: "Answers included where generated",
      answersIncluded: true,
      metadataLabels: ["course:econ101", "unit:market-failures", "chapter:4"],
    },
  });

  assert.equal(artifact.courseTag, "course:econ101");
  assert.equal(artifact.chapterTag, "chapter:4");
  assert.equal(artifact.unitTag, "unit:market-failures");
  assert.equal(artifact.moduleLabel, "Module 2");
  assert.equal(artifact.dueLabel, "2026-10-03T22:00:00.000Z");
  assert.equal(artifact.deadlineId, "deadline-42");
  assert.equal(artifact.providerId, "gcal");
  assert.equal(artifact.academicKind, "study_course");
  assert.equal(artifact.sessionId, "session-1");
  assert.equal(artifact.routeSource, "study_lens");
  assert.equal(artifact.answersIncluded, true);
  assert.equal(artifact.structuredItemCount, 0);
});

test("study report artifacts persist structured quiz and flashcard item counts", () => {
  const artifact = buildStudyReportArtifact({
    now: 3456,
    sourceLabels: ["Chapter 4.pdf"],
    courseTag: "course:law101",
    chapterTag: "chapter:4",
    unitTag: "unit:contracts",
    exportState: {
      title: "Flashcard deck report",
      filename: "flashcard-deck-report.md",
      htmlFilename: "flashcard-deck-report.html",
      wordFilename: "flashcard-deck-report.doc",
      csvFilename: "flashcard-deck-report.csv",
      markdown: "# Flashcard deck report\n\n- Front: Duty of care | Back: Legal obligation to avoid foreseeable harm.\n",
      html: "<h1>Flashcard deck report</h1>",
      csv: "\"kind\",\"prompt\",\"answer\",\"source\",\"difficulty\",\"tags\"\n",
      mimeType: "text/markdown;charset=utf-8",
      printLabel: "Print",
      copyLabel: "Copy",
      downloadLabel: "Download",
      canExport: true,
      sectionCount: 1,
      exportTargets: [],
      readyExportTargets: [],
      plannedExportTargets: [],
      answersIncludedLabel: "Answers included where generated",
      answersIncluded: true,
      metadataLabels: ["course:law101", "unit:contracts", "chapter:4", "Chapter 4.pdf"],
      csvRowCount: 1,
    },
  });
  const [normalized] = normalizeStudyReportArtifacts([{
    ...artifact,
    structuredItemCount: undefined,
  }]);

  assert.equal(artifact.structuredItemCount, 1);
  assert.equal(normalized?.structuredItemCount, 1);
  assert.deepEqual(filterStudyReportArtifacts([artifact], "structured item").map((item) => item.id), [artifact.id]);
});

test("study report artifacts count medical cloze vignette rows from saved markdown", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "med-deck",
      title: "Cardiology cloze vignette deck",
      filename: "cardiology-cloze-vignette-deck.md",
      markdown: "- cloze_text: {{c1::ACE inhibitors}} reduce afterload | vignette_stem: HFrEF with high afterload | answer: ACE inhibitors | source_locator: Chapter 7 page 12 | chapter_tag:chapter:heart-failure | reasoning_order:second_order\n",
      mimeType: "text/markdown;charset=utf-8",
      reportKind: "flashcard_deck",
      reportLabel: "flashcard deck report",
      outputFormat: "csv_flashcards",
      sourceLabels: ["Cardio lecture"],
      policyLabel: "Keep extracted notes only",
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
      academicKind: "medical_cloze_vignette",
      answersIncluded: true,
      sectionCount: 1,
      createdAt: 123,
    },
  ]);

  assert.equal(artifact?.structuredItemCount, 1);
  assert.equal(buildStudyReportArtifactExportManifest(artifact!).readyEntries.some((entry) => entry.id === "csv"), true);
  assert.deepEqual(filterStudyReportArtifacts([artifact!], "second_order chapter:heart-failure").map((item) => item.id), ["med-deck"]);
});

test("buildStudyReportArtifactExportManifest carries chapter, unit, and answer policy", () => {
  const artifact = normalizeStudyReportArtifacts([
    {
      id: "quiz-1",
      title: "Quiz generator report",
      filename: "quiz-generator-report.md",
      markdown: "# Quiz generator report\n",
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
      sessionId: "session-123",
      answersIncluded: false,
      createdAt: 123,
    },
  ])[0]!;

  const manifest = buildStudyReportArtifactExportManifest(artifact);

  assert.equal(manifest.answerPolicyLabel, "Answers export after completion");
  assert.equal(manifest.readyEntries.find((entry) => entry.id === "word_doc")?.filename, "quiz-generator-report.doc");
  assert.equal(manifest.plannedEntries.find((entry) => entry.id === "csv")?.filename, "quiz-generator-report.csv");
  assert.ok(manifest.metadataLabels.includes("chapter:4"));
  assert.ok(manifest.metadataLabels.includes("unit:contracts"));
  assert.ok(manifest.metadataLabels.includes("Module 2"));
  assert.ok(manifest.metadataLabels.includes("2026-10-03T22:00:00.000Z"));
  assert.ok(manifest.metadataLabels.includes("deadline-42"));
  assert.ok(manifest.metadataLabels.includes("gcal"));
  assert.ok(manifest.metadataLabels.includes("Chapter 4.pdf"));
});

test("buildStudyReportArtifactExportManifest allows explicit answer policy override", () => {
  const artifact = normalizeStudyReportArtifacts([
    {
      id: "quiz-1",
      title: "Quiz generator report",
      filename: "quiz-generator-report.md",
      markdown: "# Quiz generator report\n\n- Question 1: Define consideration. Answer: Value exchanged.\n",
      mimeType: "text/markdown;charset=utf-8",
      reportKind: "quiz_generator",
      sourceLabels: [],
      policyLabel: null,
      sectionCount: 1,
      answersIncluded: false,
      createdAt: 123,
    },
  ])[0]!;

  assert.equal(buildStudyReportArtifactExportManifest(artifact).answerPolicyLabel, "Answers export after completion");
  assert.equal(buildStudyReportArtifactExportManifest(artifact, true).answerPolicyLabel, "Answers included where generated");
});

test("study report artifact storage normalizes, sorts, and limits history", () => {
  const storage = storageFixture();
  for (let index = 0; index < 24; index += 1) {
    saveStudyReportArtifact({
      id: `artifact-${index}`,
      title: `Artifact ${index}`,
      filename: `artifact-${index}.md`,
      markdown: `# Artifact ${index}\n`,
      mimeType: "text/markdown;charset=utf-8",
      reportKind: null,
      reportLabel: null,
      outputFormat: null,
      sourceLabels: [],
      policyLabel: null,
      courseTag: null,
      academicKind: null,
      sessionId: null,
      routeSource: null,
      sectionCount: 1,
      createdAt: index + 1,
    }, storage);
  }

  const artifacts = loadStudyReportArtifacts(storage);
  assert.equal(artifacts.length, 20);
  assert.equal(artifacts[0]?.id, "artifact-23");
  assert.equal(artifacts.at(-1)?.id, "artifact-4");
  assert.ok(storage.getItem(STUDY_REPORT_ARTIFACTS_KEY));
});

test("study report artifact storage clears malformed payloads", () => {
  const storage = storageFixture();
  storage.setItem(STUDY_REPORT_ARTIFACTS_KEY, "{bad-json");

  assert.deepEqual(loadStudyReportArtifacts(storage), []);
  assert.equal(storage.getItem(STUDY_REPORT_ARTIFACTS_KEY), null);
});

test("normalizeStudyReportArtifacts rejects incomplete records", () => {
  assert.deepEqual(normalizeStudyReportArtifacts([
    { id: "missing-markdown", title: "Bad", filename: "bad.md", createdAt: 1 },
    {
      id: "good",
      title: "Good",
      filename: "good.md",
      markdown: "# Good\n",
      reportKind: null,
      reportLabel: null,
      outputFormat: null,
      createdAt: 2,
    },
  ]).map((item) => item.id), ["good"]);
});

test("filterStudyReportArtifacts searches title, source, policy, report type, and body", () => {
  const artifacts = normalizeStudyReportArtifacts([
    {
      id: "exam",
      title: "Economics exam prep",
      filename: "economics-exam-prep.md",
      markdown: "# Exam preparation report\n\nElasticity and market failures.",
      reportKind: "exam_preparation",
      outputFormat: "print_ready",
      sourceLabels: ["Week 3 slides.pdf"],
      policyLabel: "Keep extracted notes only",
      sectionCount: 2,
      createdAt: 2,
    },
    {
      id: "cards",
      title: "Biology cards",
      filename: "biology-cards.md",
      markdown: "# Flashcard deck report\n\nCellular respiration.",
      sourceLabels: ["Biology tutorial.docx"],
      sectionCount: 2,
      createdAt: 1,
    },
  ]);

  assert.deepEqual(filterStudyReportArtifacts(artifacts, "economics extracted").map((item) => item.id), ["exam"]);
  assert.deepEqual(filterStudyReportArtifacts(artifacts, "flashcard biology").map((item) => item.id), ["cards"]);
  assert.deepEqual(filterStudyReportArtifacts(artifacts, "").map((item) => item.id), ["exam", "cards"]);
});

test("filterStudyReportArtifacts searches course, academic kind, session, and route metadata", () => {
  const artifacts = normalizeStudyReportArtifacts([
    {
      id: "session",
      title: "Guided session output",
      filename: "guided-session.md",
      markdown: "# Guided study session report\n",
      reportKind: "guided_study_session",
      courseTag: "course:econ101",
      chapterTag: "chapter:4",
      unitTag: "unit:market-failures",
      moduleLabel: "Module 2",
      dueLabel: "2026-10-03T22:00:00.000Z",
      deadlineId: "deadline-42",
      providerId: "gcal",
      academicKind: "study_course",
      sessionId: "study-session-1",
      routeSource: "study_lens",
      sectionCount: 2,
      createdAt: 2,
    },
    {
      id: "other",
      title: "Biology output",
      filename: "biology.md",
      markdown: "# Lecture summary report\n",
      reportKind: "lecture_summary",
      courseTag: "course:bio100",
      sectionCount: 1,
      createdAt: 1,
    },
  ]);

  assert.deepEqual(filterStudyReportArtifacts(artifacts, "econ101 study_course").map((item) => item.id), ["session"]);
  assert.deepEqual(filterStudyReportArtifacts(artifacts, "chapter:4 market-failures").map((item) => item.id), ["session"]);
  assert.deepEqual(filterStudyReportArtifacts(artifacts, "deadline-42 gcal").map((item) => item.id), ["session"]);
  assert.deepEqual(filterStudyReportArtifacts(artifacts, "Module 2 2026-10-03").map((item) => item.id), ["session"]);
  assert.deepEqual(filterStudyReportArtifacts(artifacts, "study-session-1").map((item) => item.id), ["session"]);
  assert.deepEqual(filterStudyReportArtifacts(artifacts, "study_lens").map((item) => item.id), ["session"]);
});

test("buildStudyReportArtifactListState previews saved outputs and exposes hidden count", () => {
  const artifacts = normalizeStudyReportArtifacts(
    Array.from({ length: 7 }, (_, index) => ({
      id: `artifact-${index}`,
      title: `Artifact ${index}`,
      filename: `artifact-${index}.md`,
      markdown: "# Exam preparation report\n",
      createdAt: index + 1,
    })),
  );

  const preview = buildStudyReportArtifactListState({ artifacts, previewLimit: 5 });
  assert.equal(preview.totalCount, 7);
  assert.equal(preview.filteredCount, 7);
  assert.equal(preview.visibleCount, 5);
  assert.equal(preview.hiddenCount, 2);
  assert.equal(preview.summaryLabel, "7 saved");

  const full = buildStudyReportArtifactListState({ artifacts, previewLimit: 5, showAll: true });
  assert.equal(full.visibleCount, 7);
  assert.equal(full.hiddenCount, 0);
});

test("buildStudyReportArtifactListState exposes filter chips from saved metadata", () => {
  const artifacts = normalizeStudyReportArtifacts([
    {
      id: "exam",
      title: "Economics exam prep",
      filename: "economics-exam-prep.md",
      markdown: "# Exam preparation report\n\nElasticity.",
      reportKind: "exam_preparation",
      outputFormat: "print_ready",
      sourceLabels: ["Week 3 slides.pdf"],
      policyLabel: "Keep extracted notes only",
      courseTag: "course:econ101",
      sectionCount: 2,
      createdAt: 2,
    },
    {
      id: "cards",
      title: "Economics cards",
      filename: "economics-cards.md",
      markdown: "# Flashcard deck report\n\nMarkets.",
      reportKind: "flashcard_deck",
      outputFormat: "csv_flashcards",
      sourceLabels: ["Week 3 slides.pdf"],
      courseTag: "course:econ101",
      sessionId: "session-1",
      sectionCount: 2,
      createdAt: 1,
    },
  ]);

  const state = buildStudyReportArtifactListState({ artifacts });
  assert.deepEqual(
    state.filterChips
      .filter((chip) => chip.kind === "report")
      .map((chip) => chip.label),
    ["exam preparation report", "flashcard deck report"],
  );
  assert.equal(state.filterChips.find((chip) => chip.label === "Week 3 slides.pdf")?.count, 2);
  assert.equal(state.filterChips.find((chip) => chip.kind === "course" && chip.label === "course:econ101")?.count, 2);
  assert.equal(state.filterChips.find((chip) => chip.kind === "session" && chip.query === "session-1")?.count, 1);
  assert.ok(state.filterChips.some((chip) => chip.query === "csv_flashcards"));
});

test("buildStudyReportArtifactListState explains no-match searches", () => {
  const artifacts = normalizeStudyReportArtifacts([
    {
      id: "exam",
      title: "Economics exam prep",
      filename: "economics-exam-prep.md",
      markdown: "# Exam preparation report\n\nElasticity.",
      createdAt: 2,
    },
  ]);

  const state = buildStudyReportArtifactListState({ artifacts, query: "biology" });
  assert.equal(state.hasQuery, true);
  assert.equal(state.hasNoMatches, true);
  assert.equal(state.visibleCount, 0);
  assert.equal(state.summaryLabel, "0/1 saved");
  assert.match(state.emptyDetail ?? "", /source filename/i);
});

test("buildStudyReportArtifactContinuationSeed preserves report context", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "exam",
      title: "ECON101 exam prep",
      filename: "econ101-exam-prep.md",
      markdown: "# Exam preparation report\n\nElasticity.",
      reportKind: "exam_preparation",
      outputFormat: "print_ready",
      sourceLabels: ["Week 3 slides.pdf", "Tutorial notes.docx"],
      policyLabel: "Keep extracted notes only",
      courseTag: "course:econ101",
      chapterTag: "chapter:4",
      unitTag: "unit:market-failures",
      moduleLabel: "Module 2",
      dueLabel: "2026-10-03T22:00:00.000Z",
      deadlineId: "deadline-42",
      providerId: "gcal",
      academicKind: "study_course",
      sessionId: "session-1",
      routeSource: "study_lens",
      sectionCount: 2,
      createdAt: 2,
    },
  ]);

  const seed = buildStudyReportArtifactContinuationSeed(artifact!);
  assert.equal(seed.label, "Continue exam preparation report");
  assert.equal(seed.flowKind, "grounded_followup");
  assert.equal(seed.knowledgeMode, "connected_notes");
  assert.equal(seed.retentionMode, "keep_extracted_only");
  assert.match(seed.query, /Preserve the reusable output format: print ready/);
  assert.match(seed.query, /Keep the follow-up scoped to course:econ101/);
  assert.match(seed.query, /Keep the follow-up scoped to chapter:4/);
  assert.match(seed.query, /Keep the follow-up scoped to unit:market-failures/);
  assert.match(seed.query, /module Module 2/);
  assert.match(seed.query, /due date 2026-10-03T22:00:00.000Z/);
  assert.match(seed.query, /deadline context deadline-42/);
  assert.match(seed.query, /provider context gcal/);
  assert.ok(seed.focusBadges?.includes("report_kind:exam_preparation"));
  assert.ok(seed.focusBadges?.includes("output_format:print_ready"));
  assert.ok(seed.focusBadges?.includes("course_tag:course:econ101"));
  assert.ok(seed.focusBadges?.includes("chapter_tag:chapter:4"));
  assert.ok(seed.focusBadges?.includes("unit_tag:unit:market-failures"));
  assert.ok(seed.focusBadges?.includes("module:Module 2"));
  assert.ok(seed.focusBadges?.includes("due:2026-10-03T22:00:00.000Z"));
  assert.ok(seed.focusBadges?.includes("deadline:deadline-42"));
  assert.ok(seed.focusBadges?.includes("provider:gcal"));
  assert.ok(seed.focusBadges?.includes("academic_kind:study_course"));
  assert.ok(seed.focusBadges?.includes("session:session-1"));
  assert.ok(seed.focusBadges?.includes("route_source:study_lens"));
  assert.ok(seed.focusBadges?.includes("source:Week 3 slides.pdf"));
});

test("buildStudyReportArtifactContinuationSeed keeps Zettelkasten synthesis in note mode", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "zk",
      title: "Argument branch",
      filename: "argument-branch.md",
      markdown: "# Zettelkasten synthesis report\n",
      reportKind: "zettelkasten_synthesis",
      sourceLabels: ["Reading notes.md"],
      sectionCount: 1,
      createdAt: 2,
    },
  ]);

  const seed = buildStudyReportArtifactContinuationSeed(artifact!);
  assert.equal(seed.knowledgeMode, "zettelkasten");
  assert.match(seed.query, /contributes to, challenges, extends, or alters/);
  assert.ok(seed.focusBadges?.includes("report_kind:zettelkasten_synthesis"));
});

test("buildStudyReportArtifactContinuationSeed preserves medical concept-edge repair scope", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "medical-repair",
      title: "Cardiology concept-edge repair set",
      filename: "cardiology-concept-edge-repair.md",
      markdown: [
        "# Practice questions report",
        "Medical concept-edge repair queue: use relationship ID, score band, and graph tags.",
        "medical_edge_attempt | relationship_id: medical-deck:0:pathophys_to_presentation:pathophys | total_items: 5 | correct_items: 2 | course_tag: course:med101",
        "score_band:weak",
      ].join("\n"),
      reportKind: "practice_questions",
      sourceLabels: ["Heart failure lecture"],
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
      academicKind: "medical_cloze_vignette",
      sectionCount: 2,
      createdAt: 2,
    },
  ]);

  const seed = buildStudyReportArtifactContinuationSeed(artifact!);

  assert.match(seed.query, /Continue this as a medical concept-edge repair workflow/i);
  assert.match(seed.query, /medical-deck:0:pathophys_to_presentation:pathophys/i);
  assert.match(seed.query, /score_band:weak/i);
  assert.match(seed.query, /do not reuse or reconstruct proprietary question stems/i);
  assert.match(seed.query, /medical_edge_attempt row only after the student answers/i);
  assert.ok(seed.focusBadges?.includes("repair_kind:concept_edge_repair"));
  assert.ok(seed.focusBadges?.includes("score_band:weak"));
  assert.ok(seed.focusBadges?.includes("relationship:medical-deck:0:pathophys_to_presentation:pathophys"));
  assert.ok(seed.focusBadges?.includes("academic_kind:medical_cloze_vignette"));
});

test("buildStudyReportArtifactContinuationSeed preserves medical missed-topic repair scope", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "medical-missed-topic",
      title: "Cardiology missed-topic repair deck",
      filename: "cardiology-missed-topic-repair.md",
      markdown: "Medical missed-topic repair queue: safe metadata only. missed_topic: ACE inhibitor contraindications medical_missed_question_topics",
      reportKind: "flashcard_deck",
      sourceLabels: ["Heart failure lecture"],
      courseTag: "course:med101",
      academicKind: "medical_cloze_vignette",
      sectionCount: 1,
      createdAt: 2,
    },
  ]);

  const seed = buildStudyReportArtifactContinuationSeed(artifact!);

  assert.match(seed.query, /Continue this as a medical missed-topic repair workflow/i);
  assert.match(seed.query, /safe metadata only/i);
  assert.match(seed.query, /Avoid duplicate card creation/i);
  assert.ok(seed.focusBadges?.includes("repair_kind:missed_topic_repair"));
});

test("buildStudyReportArtifactContinuationSeed preserves medical graph-gap cloze workflow", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "medical-gap-deck",
      title: "Cardiology graph-gap cloze deck",
      filename: "cardiology-gap-deck.md",
      markdown: [
        "# Flashcard deck report",
        "Medical graph-gap cloze deck queue: generate Anki-compatible cloze rows for graph gaps.",
      ].join("\n"),
      reportKind: "flashcard_deck",
      outputFormat: "csv_flashcards",
      sourceLabels: ["Heart failure lecture"],
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
      academicKind: "medical_cloze_vignette",
      sectionCount: 2,
      createdAt: 2,
    },
  ]);

  const seed = buildStudyReportArtifactContinuationSeed(artifact!);

  assert.match(seed.query, /Continue this as a medical graph-gap cloze deck workflow/i);
  assert.match(seed.query, /Preserve graph-gap scope, source locators, chapter\/unit tags, and concept supertags/i);
  assert.match(seed.query, /avoid duplicating already-covered cards/i);
  assert.ok(seed.focusBadges?.includes("medical_workflow:graph_gap_cloze_deck"));
  assert.ok(seed.focusBadges?.includes("medical_gap_cloze_deck"));
});

test("buildStudyReportArtifactContinuationSeed preserves medical vignette block workflow", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "medical-vignette-block",
      title: "Cardiology vignette block",
      filename: "cardiology-vignette-block.md",
      markdown: [
        "# Practice questions report",
        "Medical vignette block queue: generate freshly phrased clinical application questions from the current concept graph.",
      ].join("\n"),
      reportKind: "practice_questions",
      outputFormat: "chat_markdown",
      sourceLabels: ["Heart failure lecture"],
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
      academicKind: "medical_cloze_vignette",
      sectionCount: 2,
      createdAt: 2,
    },
  ]);

  const seed = buildStudyReportArtifactContinuationSeed(artifact!);

  assert.match(seed.query, /Continue this as a medical vignette block workflow/i);
  assert.match(seed.query, /Regenerate freshly phrased clinical application questions from the same concept graph/i);
  assert.match(seed.query, /Vary patient framing, distractors, and management step/i);
  assert.ok(seed.focusBadges?.includes("medical_workflow:vignette_block"));
  assert.ok(seed.focusBadges?.includes("medical_vignette_block"));
});

test("buildStudyReportArtifactContinuationSeed preserves medical topology coverage scope", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "medical-topology",
      title: "Cardiology topology cloze deck",
      filename: "cardiology-topology.md",
      markdown: [
        "# Flashcard deck report",
        "- cloze_text: ACE inhibitors reduce afterload | source_locator: slide 21 | system_tag: system:cardiovascular | concept_tags: pharm; management | reasoning_order: second_order",
      ].join("\n"),
      reportKind: "flashcard_deck",
      outputFormat: "csv_flashcards",
      sourceLabels: ["Heart failure lecture"],
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
      academicKind: "medical_cloze_vignette",
      sectionCount: 2,
      createdAt: 2,
    },
  ]);

  const seed = buildStudyReportArtifactContinuationSeed(artifact!);

  assert.match(seed.query, /Continue this as a medical topology coverage workflow/i);
  assert.match(seed.query, /Preserve the carried coverage scope, source locator state, medical concept tags/i);
  assert.match(seed.query, /Source-locator evidence exists/i);
  assert.match(seed.query, /generate missing cloze\/vignette rows, request attempt evidence, reduce review load, or run a timed vignette block/i);
  assert.ok(seed.focusBadges?.includes("medical_topology_coverage"));
  assert.ok(seed.focusBadges?.includes("medical_topology:medical topology"));
  assert.ok(seed.focusBadges?.includes("medical_topology:system:cardiovascular"));
  assert.ok(seed.focusBadges?.includes("medical_topology:pharm"));
});

test("buildStudyReportArtifactContinuationSeed preserves missing medical locator warning", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "medical-topology-needs-locator",
      title: "Renal topology cloze deck",
      filename: "renal-topology.md",
      markdown: "Medical cloze row without locator. system_tag: system:renal | concept_tags: pathophys; complication",
      reportKind: "flashcard_deck",
      sourceLabels: ["Renal lecture"],
      courseTag: "course:med101",
      academicKind: "medical_cloze_vignette",
      sectionCount: 1,
      createdAt: 2,
    },
  ]);

  const seed = buildStudyReportArtifactContinuationSeed(artifact!);

  assert.match(seed.query, /Source-locator gap/i);
  assert.match(seed.query, /before treating the output as source-grounded/i);
  assert.ok(seed.focusBadges?.includes("medical_topology_coverage"));
  assert.ok(seed.focusBadges?.includes("topology_gap:needs_locator"));
  assert.ok(seed.focusBadges?.includes("medical_topology:needs locator"));
  assert.ok(seed.focusBadges?.includes("medical_topology:system:renal"));
});

test("buildStudyReportArtifactContinuationSeed preserves source-only medical topology gaps", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "medical-topology-source-only",
      title: "Cardiology source-only topology coverage",
      filename: "cardiology-source-only-topology.md",
      markdown: [
        "# Flashcard deck report",
        "Medical topology coverage readiness:Source only. Generate missing source-backed cloze rows.",
        "- source_label: Heart failure lecture | source_locator: slide 12 | system_tag: system:cardiovascular | concept_tags: pathophys; presentation",
      ].join("\n"),
      reportKind: "flashcard_deck",
      outputFormat: "csv_flashcards",
      sourceLabels: ["Heart failure lecture"],
      courseTag: "course:med101",
      academicKind: "medical_cloze_vignette",
      sectionCount: 1,
      createdAt: 2,
    },
  ]);

  const seed = buildStudyReportArtifactContinuationSeed(artifact!);

  assert.match(seed.query, /Source-only gap/i);
  assert.match(seed.query, /inventory or attempt evidence is still missing/i);
  assert.ok(seed.focusBadges?.includes("medical_topology_coverage"));
  assert.ok(seed.focusBadges?.includes("topology_gap:source_only"));
  assert.ok(seed.focusBadges?.includes("medical_topology:system:cardiovascular"));
});

test("buildStudyReportArtifactContinuationSeed preserves medical topology overload marker", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "medical-topology-shallow",
      title: "Cardiology shallow topology deck",
      filename: "cardiology-shallow-topology.md",
      markdown: Array.from({ length: 3 }, (_, index) =>
        `- cloze_text: Define term ${index} | source_locator: slide ${index + 1} | quality_flag: shallow | reasoning_order: first_order | system_tag: system:cardiovascular`
      ).join("\n"),
      reportKind: "flashcard_deck",
      outputFormat: "csv_flashcards",
      sourceLabels: ["Cardiology lecture"],
      courseTag: "course:med101",
      academicKind: "medical_cloze_vignette",
      sectionCount: 1,
      createdAt: 2,
    },
  ]);

  const seed = buildStudyReportArtifactContinuationSeed(artifact!);

  assert.ok(seed.focusBadges?.includes("medical_topology_coverage"));
  assert.ok(seed.focusBadges?.includes("topology_gap:overload"));
  assert.ok(seed.focusBadges?.includes("medical_topology:shallow first order"));
});

test("buildStudyReportArtifactContinuationSeed preserves medical trusted grounding and detail zoom", () => {
  const [artifact] = normalizeStudyReportArtifacts([
    {
      id: "medical-trusted-reference",
      title: "Cardiology trusted cloze deck",
      filename: "cardiology-trusted.md",
      markdown: [
        "# Flashcard deck report",
        "Medical detail zoom: fine detail.",
        "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
        "Source integrity: never treat LLM internal knowledge as source evidence.",
        "Clinical dataset boundary: do not use patient-level datasets such as MIMIC for ordinary card generation.",
      ].join("\n"),
      reportKind: "flashcard_deck",
      outputFormat: "csv_flashcards",
      sourceLabels: ["Heart failure lecture"],
      courseTag: "course:med101",
      chapterTag: "chapter:heart-failure",
      unitTag: "unit:cardiology",
      academicKind: "medical_cloze_vignette",
      sectionCount: 2,
      createdAt: 2,
    },
  ]);

  const seed = buildStudyReportArtifactContinuationSeed(artifact!);

  assert.match(seed.query, /Continue with medical trusted-grounding preserved at detail zoom: fine detail/i);
  assert.match(seed.query, /retained student uploads and source locators as primary evidence/i);
  assert.match(seed.query, /Use trusted open-reference snippets only when they are present/i);
  assert.match(seed.query, /Never treat LLM internal knowledge as source evidence/i);
  assert.match(seed.query, /clinical dataset boundary/i);
  assert.ok(seed.focusBadges?.includes("medical_trusted_grounding"));
  assert.ok(seed.focusBadges?.includes("detail_zoom:fine_detail"));
  assert.ok(seed.focusBadges?.includes("trusted_reference:supported"));
  assert.ok(seed.focusBadges?.includes("trusted_reference:student_source_primary"));
  assert.ok(seed.focusBadges?.includes("trusted_reference:clinical_dataset_restricted"));
});
