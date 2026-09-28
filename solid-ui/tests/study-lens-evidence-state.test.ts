import assert from "node:assert/strict";
import test from "node:test";

import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import type { StudyDeadline } from "../src/lib/studyDeadlineLocalState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import type { StudySession } from "../src/lib/studySessionLocalState.ts";
import { buildStudyLensEvidenceState } from "../src/lib/studyLensEvidenceState.ts";

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "artifact",
    title: "Quiz output",
    filename: "quiz.md",
    markdown: "# Quiz\nFinal exam due Friday.",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "quiz_generator",
    reportLabel: "quiz generator report",
    outputFormat: null,
    sourceLabels: ["Lecture 1.pdf"],
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
    answersIncluded: true,
    structuredItemCount: 0,
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

function deadline(overrides: Partial<StudyDeadline> = {}): StudyDeadline {
  return {
    id: "deadline",
    title: "Final exam",
    kind: "exam",
    courseTag: "course:bio101",
    dueLabel: "Friday",
    dueAt: null,
    source: "manual",
    createdAt: 1,
    ...overrides,
  };
}

function attempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt",
    mode: "exam",
    title: "Mock exam",
    artifactId: null,
    courseTag: null,
    totalItems: 40,
    correctItems: 30,
    durationSeconds: null,
    source: "manual",
    createdAt: 1,
    ...overrides,
  };
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: "session",
    title: "Guided session",
    status: "planned",
    duration: "20_min",
    courseTag: null,
    sourceCount: 1,
    deadlineCount: 1,
    attemptCount: 1,
    nextAction: null,
    source: "reports",
    createdAt: 1,
    ...overrides,
  };
}

test("buildStudyLensEvidenceState centralizes dashboard evidence counts", () => {
  const evidence = buildStudyLensEvidenceState({
    artifacts: [
      artifact({ id: "quiz", reportKind: "quiz_generator" }),
      artifact({ id: "plan", reportKind: "course_builder", sourceLabels: [] }),
      artifact({ id: "exam", reportKind: "exam_preparation", sourceLabels: ["Lecture 2.pdf"] }),
    ],
    deadlines: [
      deadline({ id: "accepted", reviewStatus: "accepted" }),
      deadline({ id: "review", title: "Possible hold", reviewStatus: "needs_review" }),
      deadline({ id: "ignored", title: "Personal hold", reviewStatus: "ignored" }),
    ],
    attempts: [
      attempt({ id: "exam-weak", correctItems: 20, totalItems: 40, createdAt: 1 }),
      attempt({ id: "exam-best", correctItems: 35, totalItems: 40, createdAt: 2 }),
      attempt({ id: "quiz", mode: "quiz", correctItems: 8, totalItems: 10, createdAt: 3 }),
    ],
    sessions: [session({ title: "Latest guided session" })],
  });

  assert.deepEqual(evidence.sourceLabels, ["Lecture 1.pdf", "Lecture 2.pdf"]);
  assert.equal(evidence.drillOutputCount, 1);
  assert.equal(evidence.planningOutputCount, 1);
  assert.equal(evidence.readinessOutputCount, 1);
  assert.equal(evidence.groundedOutputCount, 2);
  assert.equal(evidence.acceptedDeadlineLabels.length, 2);
  assert.match(evidence.acceptedDeadlineLabels[0] ?? "", /Final exam/);
  assert.match(evidence.acceptedDeadlineLabels[1] ?? "", /Final exam due Friday/);
  assert.equal(evidence.drillAttempts.length, 1);
  assert.equal(evidence.examAttempts.length, 2);
  assert.equal(evidence.bestExamAttempt?.id, "exam-best");
  assert.equal(evidence.latestRelevantAttempt?.id, "exam-weak");
  assert.equal(evidence.latestSession?.title, "Latest guided session");
  assert.equal(evidence.hasSources, true);
  assert.equal(evidence.hasAcceptedDeadline, true);
  assert.equal(evidence.hasAttempt, true);
});

test("buildStudyLensEvidenceState preserves missing evidence without inventing mastery", () => {
  const evidence = buildStudyLensEvidenceState({});

  assert.deepEqual(evidence.sourceLabels, []);
  assert.deepEqual(evidence.acceptedDeadlineLabels, []);
  assert.equal(evidence.bestExamAttempt, null);
  assert.equal(evidence.latestRelevantAttempt, null);
  assert.equal(evidence.latestSession, null);
  assert.equal(evidence.hasSources, false);
  assert.equal(evidence.hasAcceptedDeadline, false);
  assert.equal(evidence.hasAttempt, false);
});
