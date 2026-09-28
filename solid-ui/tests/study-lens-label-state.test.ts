import assert from "node:assert/strict";
import test from "node:test";

import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import type { StudyCourse } from "../src/lib/studyCourseLocalState.ts";
import type { StudyDeadline } from "../src/lib/studyDeadlineLocalState.ts";
import {
  latestStudySessionForCourse,
  studyAttemptReportKind,
  studyAttemptScoreLabel,
  studyLensAttemptLabels,
  studyLensCreatedLabel,
  studyLensDeadlineLabels,
  studyLensMasteryEstimate,
  studyLensSavedOutputLabels,
  studyLensSessionLabels,
  studyLensSourceLabel,
  uniqueStudySourceLabels,
} from "../src/lib/studyLensLabelState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import type { StudySession } from "../src/lib/studySessionLocalState.ts";

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "artifact",
    title: "Final exam prep",
    filename: "final-exam-prep.md",
    markdown: "# Final exam prep\nExam deadline due Friday.",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "exam_preparation",
    reportLabel: null,
    outputFormat: null,
    sourceLabels: ["Lecture 1", "Lecture 2"],
    policyLabel: null,
    sectionCount: 1,
    createdAt: 1_000,
    ...overrides,
  };
}

function attempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt",
    mode: "quiz",
    title: "Quiz attempt",
    artifactId: null,
    courseTag: "course:bio101",
    totalItems: 10,
    correctItems: 7,
    durationSeconds: 600,
    source: "manual",
    createdAt: 2_000,
    ...overrides,
  };
}

function deadline(overrides: Partial<StudyDeadline> = {}): StudyDeadline {
  return {
    id: "deadline",
    title: "Midterm",
    kind: "exam",
    courseTag: "course:bio101",
    dueLabel: "Friday",
    dueAt: null,
    source: "manual",
    createdAt: 3_000,
    ...overrides,
  };
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: "session",
    title: "Review weak links",
    status: "planned",
    duration: "20_min",
    courseTag: "course:bio101",
    sourceCount: 2,
    deadlineCount: 1,
    attemptCount: 1,
    nextAction: null,
    source: "study_lens",
    createdAt: 4_000,
    ...overrides,
  };
}

test("study lens source and age labels stay conservative", () => {
  assert.equal(studyLensSourceLabel(null), "No retained course source yet");
  assert.equal(studyLensSourceLabel(artifact({ sourceLabels: [] })), "Saved OmnyID context");
  assert.equal(studyLensSourceLabel(artifact()), "Lecture 1 +1 source");
  assert.equal(studyLensCreatedLabel(null, 10_000), "Start now");
  assert.equal(studyLensCreatedLabel(artifact({ createdAt: 9_000 }), 10_000), "Saved just now");
  assert.equal(studyLensCreatedLabel(artifact({ createdAt: 0 }), 7_200_000), "Saved 2h ago");
});

test("attempt labels and report kind mapping preserve follow-up context", () => {
  const quizAttempt = attempt();
  assert.equal(studyAttemptScoreLabel(quizAttempt), "7/10 correct (70%)");
  assert.equal(studyAttemptReportKind("quiz"), "practice_questions");
  assert.deepEqual(studyLensAttemptLabels([quizAttempt]), [
    "Quiz (course:bio101): 7/10 correct (70%), 10m",
  ]);
});

test("deadline, source, session, and saved-output labels summarize dashboard evidence", () => {
  const artifacts = [
    artifact({
      id: "cards",
      title: "Flashcards",
      filename: "cards.md",
      reportKind: "flashcard_deck",
      outputFormat: "flashcards",
      sourceLabels: ["Lecture 1", "Lecture 1", "Reading A"],
    }),
    artifact({ id: "exam", title: "Final exam due next week", sourceLabels: ["Slides"] }),
  ];
  assert.deepEqual(uniqueStudySourceLabels(artifacts), ["Lecture 1", "Reading A", "Slides"]);
  assert.deepEqual(studyLensDeadlineLabels(artifacts, [deadline({ reviewStatus: "needs_review" })]), [
    "Midterm (course:bio101): Friday [review]",
    "Final exam prep",
    "Exam deadline due Friday",
    "Final exam due next week",
  ]);
  assert.deepEqual(studyLensSessionLabels([session({ status: "completed", duration: "45_min" })]), [
    "Completed 45m (course:bio101): Review weak links - 2 sources, 1 deadline, 1 attempt",
  ]);
  assert.ok(studyLensSavedOutputLabels(artifacts).some((label) => label.includes("exportable")));
});

test("study lens saved-output labels surface medical repair context", () => {
  const repairArtifacts = [
    artifact({
      id: "concept-edge-repair",
      title: "Cardiology concept-edge repair set",
      filename: "cardiology-concept-edge-repair.md",
      markdown: [
        "Medical concept-edge repair queue: use relationship ID, score band, and graph tags.",
        "medical_edge_attempt | relationship_id: medical-deck:0:pathophys_to_presentation:pathophys | total_items: 5 | correct_items: 2 | course_tag: course:med101",
        "score_band:weak",
      ].join("\n"),
      reportKind: "practice_questions",
      courseTag: "course:med101",
      unitTag: "unit:cardiology",
      chapterTag: "chapter:heart-failure",
      academicKind: "medical_cloze_vignette",
      structuredItemCount: 5,
      sourceLabels: ["Heart failure lecture"],
    }),
    artifact({
      id: "missed-topic-repair",
      title: "Cardiology missed-topic repair deck",
      filename: "cardiology-missed-topic-repair.md",
      markdown: "Medical missed-topic repair queue: safe metadata only. missed_topic: ACE inhibitor contraindications medical_missed_question_topics",
      reportKind: "flashcard_deck",
      courseTag: "course:med101",
      academicKind: "medical_cloze_vignette",
      structuredItemCount: 3,
      sourceLabels: ["Heart failure lecture"],
    }),
  ];

  const labels = studyLensSavedOutputLabels(repairArtifacts);

  assert.ok(labels.some((label) => label.includes("Medical concept-edge repair")));
  assert.ok(labels.some((label) => label.includes("Medical missed-topic repair")));
});

test("study lens saved-output labels surface medical graph-gap and vignette workflows", () => {
  const labels = studyLensSavedOutputLabels([
    artifact({
      id: "gap-deck",
      title: "Cardiology graph-gap cloze deck",
      filename: "cardiology-gap-deck.md",
      markdown: "Medical graph-gap cloze deck queue: generate Anki-compatible cloze rows for graph gaps.",
      reportKind: "flashcard_deck",
      courseTag: "course:med101",
      academicKind: "medical_cloze_vignette",
      outputFormat: "csv_flashcards",
      structuredItemCount: 6,
    }),
    artifact({
      id: "vignette-block",
      title: "Cardiology vignette block",
      filename: "cardiology-vignette-block.md",
      markdown: "Medical vignette block queue: generate freshly phrased clinical application questions from the current concept graph.",
      reportKind: "practice_questions",
      courseTag: "course:med101",
      academicKind: "medical_cloze_vignette",
      structuredItemCount: 8,
    }),
  ]);

  assert.ok(labels.some((label) => label.includes("Medical graph-gap cloze deck")));
  assert.ok(labels.some((label) => label.includes("Medical vignette block")));
});

test("study lens saved-output labels surface medical topology coverage", () => {
  const labels = studyLensSavedOutputLabels([
    artifact({
      id: "topology-coverage",
      title: "Cardiology topology coverage deck",
      filename: "cardiology-topology-coverage.md",
      markdown: [
        "- cloze_text: ACE inhibitors reduce afterload in HFrEF",
        "source_locator: slide 21",
        "system_tag: system:cardiovascular",
        "concept_tags: pharm; management",
        "reasoning_order: second_order",
      ].join(" | "),
      reportKind: "flashcard_deck",
      courseTag: "course:med101",
      unitTag: "unit:cardiology",
      chapterTag: "chapter:heart-failure",
      academicKind: "medical_cloze_vignette",
      outputFormat: "csv_flashcards",
      structuredItemCount: 1,
      sourceLabels: ["Heart failure lecture"],
    }),
  ]);

  assert.ok(labels.some((label) => label.includes("Medical topology coverage")));
  assert.ok(labels.some((label) => label.includes("chapter:heart-failure")));
});

test("study lens saved-output labels surface medical trusted reference context", () => {
  const labels = studyLensSavedOutputLabels([
    artifact({
      id: "trusted-medical-reference",
      title: "Cardiology trusted reference deck",
      filename: "cardiology-trusted-reference.md",
      markdown: [
        "Medical detail zoom: fine detail.",
        "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
        "Source integrity: never treat LLM internal knowledge as source evidence.",
        "Clinical dataset boundary: do not use patient-level datasets such as MIMIC for ordinary card generation.",
      ].join("\n"),
      reportKind: "flashcard_deck",
      courseTag: "course:med101",
      unitTag: "unit:cardiology",
      chapterTag: "chapter:heart-failure",
      academicKind: "medical_cloze_vignette",
      outputFormat: "csv_flashcards",
      structuredItemCount: 4,
      sourceLabels: ["Heart failure lecture"],
    }),
  ]);

  assert.ok(labels.some((label) => label.includes("Medical trusted grounding")));
  assert.ok(labels.some((label) => label.includes("Detail zoom: fine detail")));
  assert.ok(labels.some((label) => label.includes("chapter:heart-failure")));
});

test("latestStudySessionForCourse prefers matching course and mastery uses attempts before generated output", () => {
  const course: StudyCourse = {
    id: "course",
    name: "Biology 101",
    courseTag: "course:bio101",
    termLabel: null,
    institutionLabel: null,
    source: "manual",
    createdAt: 1,
  };
  const generic = session({ id: "generic", courseTag: null });
  const matched = session({ id: "matched", title: "Bio session", courseTag: "course:bio101" });
  assert.equal(latestStudySessionForCourse([generic, matched], course)?.id, "matched");
  assert.equal(studyLensMasteryEstimate([artifact({ reportKind: "flashcard_deck" })], []), "Early evidence from saved drill output");
  assert.equal(studyLensMasteryEstimate([], [attempt({ mode: "exam" })]), "1 recorded attempt");
});
