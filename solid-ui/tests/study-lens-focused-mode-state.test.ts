import assert from "node:assert/strict";
import test from "node:test";

import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import type { StudyDeadline } from "../src/lib/studyDeadlineLocalState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import { buildStudyLensFocusedModeContracts } from "../src/lib/studyLensFocusedModeState.ts";

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "artifact",
    title: "Study output",
    filename: "study.md",
    markdown: "# Study output",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "lecture_summary",
    reportLabel: null,
    outputFormat: null,
    sourceLabels: [],
    policyLabel: null,
    courseTag: null,
    chapterTag: null,
    unitTag: null,
    moduleLabel: null,
    dueLabel: null,
    deadlineId: null,
    providerId: null,
    academicKind: null,
    sessionId: null,
    routeSource: null,
    answersIncluded: null,
    structuredItemCount: 0,
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

function attempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt",
    mode: "quiz",
    title: "Quiz attempt",
    artifactId: null,
    courseTag: null,
    totalItems: 10,
    correctItems: 7,
    durationSeconds: null,
    source: "manual",
    createdAt: 1,
    ...overrides,
  };
}

function deadline(overrides: Partial<StudyDeadline> = {}): StudyDeadline {
  return {
    id: "deadline",
    title: "Final exam",
    kind: "exam",
    courseTag: null,
    dueLabel: "Friday",
    dueAt: null,
    source: "manual",
    createdAt: 1,
    ...overrides,
  };
}

test("buildStudyLensFocusedModeContracts exposes accessible mode contracts", () => {
  const modes = buildStudyLensFocusedModeContracts({
    artifacts: [
      artifact({
        id: "cards",
        reportKind: "flashcard_deck",
        structuredItemCount: 18,
        sourceLabels: ["Chapter 4.pdf"],
      }),
      artifact({
        id: "quiz",
        reportKind: "quiz_generator",
        markdown: "# Quiz\n\nQuestion 1: Define consideration.\n\nQuestion 2: Apply consideration.",
        sourceLabels: ["Chapter 4.pdf"],
      }),
      artifact({
        id: "exam",
        reportKind: "exam_preparation",
        sourceLabels: ["Chapter 4.pdf"],
      }),
    ],
    deadlines: [deadline({ id: "exam" })],
    attempts: [
      attempt({ mode: "flashcards", totalItems: 20, correctItems: 15 }),
      attempt({ mode: "quiz", totalItems: 10, correctItems: 7 }),
    ],
  });

  assert.equal(modes.length, 5);
  assert.equal(modes[0]?.kind, "flashcards");
  assert.equal(modes[0]?.readiness, "Deck available");
  assert.equal(modes[0]?.screen.layout, "card_flip");
  assert.equal(modes[0]?.screen.progressLabel, "15/20 correct (75%)");
  assert.equal(modes[0]?.actionReportKind, "flashcard_deck");
  assert.equal(modes[1]?.screen.progressLabel, "7/10 correct (70%)");
  assert.equal(modes[2]?.readiness, "Prep baseline exists");
  assert.equal(modes[2]?.screen.progressLabel, "Prep baseline saved; timed score not measured");
  assert.equal(modes[3]?.screen.progressLabel, "1 captured deadline");
  assert.equal(modes[4]?.readiness, "Sources detected");
  assert.equal(modes[4]?.actionView, "files");
});

test("buildStudyLensFocusedModeContracts stays conservative without evidence", () => {
  const modes = buildStudyLensFocusedModeContracts({});

  assert.equal(modes[0]?.readiness, "Needs deck");
  assert.equal(modes[0]?.screen.progressLabel, "No card generated yet");
  assert.equal(modes[1]?.readiness, "Needs quiz");
  assert.equal(modes[1]?.screen.progressLabel, "No question generated yet");
  assert.equal(modes[2]?.screen.progressLabel, "No exam baseline generated yet");
  assert.equal(modes[3]?.screen.progressLabel, "No study plan generated yet");
  assert.equal(modes[4]?.readiness, "Needs source");
  assert.equal(modes[4]?.screen.progressLabel, "No retained source labels detected");
});
