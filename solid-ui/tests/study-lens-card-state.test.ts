import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudyAcademicIntegrationState,
} from "../src/lib/studyAcademicIntegrationState.ts";
import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import type { StudyCourse } from "../src/lib/studyCourseLocalState.ts";
import {
  buildStudyLensDashboardCards,
} from "../src/lib/studyLensCardState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function course(): StudyCourse {
  return {
    id: "course",
    name: "Biology 101",
    courseTag: "course:bio101",
    termLabel: "Term 1",
    institutionLabel: null,
    source: "manual",
    createdAt: 1,
  };
}

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
    sourceLabels: ["Lecture 1"],
    policyLabel: "Keep extracted content only",
    sectionCount: 1,
    createdAt: 1_000,
    ...overrides,
  };
}

function attempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt",
    mode: "exam",
    title: "Exam attempt",
    artifactId: null,
    courseTag: "course:bio101",
    totalItems: 10,
    correctItems: 7,
    durationSeconds: null,
    source: "manual",
    createdAt: 2_000,
    ...overrides,
  };
}

test("buildStudyLensDashboardCards creates the five compact Study Lens cards", () => {
  const cards = buildStudyLensDashboardCards({
    artifacts: [],
    attempts: [],
    course: null,
    academicIntegrations: buildStudyAcademicIntegrationState({ connectedAppIds: [] }),
    now: 10_000,
  });

  assert.deepEqual(cards.map((card) => card.kind), [
    "review_deck",
    "quick_quiz",
    "exam_readiness",
    "source_coverage",
    "semester_plan",
  ]);
  assert.equal(cards[0]?.primaryAction.reportKind, "flashcard_deck");
  assert.equal(cards[3]?.primaryAction.view, "files");
});

test("buildStudyLensDashboardCards carries saved outputs and course-scoped actions", () => {
  const cards = buildStudyLensDashboardCards({
    artifacts: [
      artifact({ id: "cards", title: "Biology flashcards", reportKind: "flashcard_deck", reportLabel: "Flashcards" }),
      artifact({ id: "exam", title: "Final readiness", reportKind: "exam_preparation" }),
      artifact({ id: "plan", title: "Weekly plan", reportKind: "course_builder" }),
    ],
    attempts: [attempt()],
    course: course(),
    academicIntegrations: buildStudyAcademicIntegrationState({ connectedAppIds: ["google-calendar"] }),
    now: 61_000,
  });

  const deck = cards.find((card) => card.kind === "review_deck");
  const readiness = cards.find((card) => card.kind === "exam_readiness");
  const source = cards.find((card) => card.kind === "source_coverage");

  assert.match(deck?.middle ?? "", /Biology flashcards/);
  assert.equal(deck?.primaryAction.reportIntent?.courseTag, "course:bio101");
  assert.equal(readiness?.metadata[0], "1 recorded attempt");
  assert.equal(source?.secondaryAction?.knowledgeGraphIntent?.courseTag, "course:bio101");
});
