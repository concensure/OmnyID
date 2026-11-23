import assert from "node:assert/strict";
import test from "node:test";

import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import {
  buildStudyLensEvidenceState,
} from "../src/lib/studyLensEvidenceState.ts";
import {
  buildStudyLensProgressMetrics,
} from "../src/lib/studyLensProgressState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import type { StudySession } from "../src/lib/studySessionLocalState.ts";

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
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

function attempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt",
    mode: "exam",
    title: "Timed exam attempt",
    artifactId: null,
    courseTag: "course:bio101",
    totalItems: 20,
    correctItems: 15,
    durationSeconds: 1800,
    source: "manual",
    createdAt: 2,
    ...overrides,
  };
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: "session",
    title: "Guided review",
    status: "planned",
    duration: "20_min",
    courseTag: "course:bio101",
    sourceCount: 1,
    deadlineCount: 1,
    attemptCount: 0,
    nextAction: null,
    source: "study_lens",
    createdAt: 3,
    ...overrides,
  };
}

test("buildStudyLensProgressMetrics avoids readiness scores without attempt evidence", () => {
  const artifacts = [
    artifact({ reportKind: "exam_preparation", sourceLabels: ["Lecture 1"] }),
  ];
  const evidence = buildStudyLensEvidenceState({ artifacts, attempts: [], deadlines: [], sessions: [] });
  const progress = buildStudyLensProgressMetrics(artifacts, [], evidence);

  assert.deepEqual(progress.find((metric) => metric.label === "Exam readiness"), {
    label: "Exam readiness",
    value: "Baseline set",
    detail: "Readiness exists from exam prep or guided session output",
    status: "partial",
  });
  assert.equal(progress.find((metric) => metric.label === "Grounded outputs")?.value, "1/1");
});

test("buildStudyLensProgressMetrics prefers recorded exam attempts for readiness", () => {
  const artifacts = [
    artifact({ reportKind: "flashcard_deck", sourceLabels: ["Lecture 1"] }),
  ];
  const attempts = [attempt()];
  const evidence = buildStudyLensEvidenceState({ artifacts, attempts, deadlines: [], sessions: [] });
  const progress = buildStudyLensProgressMetrics(artifacts, [], evidence);

  assert.equal(progress.find((metric) => metric.label === "Exam readiness")?.value, "15/20 correct (75%)");
  assert.match(progress.find((metric) => metric.label === "Drill coverage")?.detail ?? "", /recorded drill attempt|saved quiz\/card\/practice output/i);
});

test("buildStudyLensProgressMetrics reports session-loop evidence separately from mastery", () => {
  const sessions = [
    session({ id: "a", title: "First review" }),
    session({ id: "b", title: "Second review" }),
    session({ id: "c", title: "Third review", status: "completed" }),
  ];
  const evidence = buildStudyLensEvidenceState({ artifacts: [], attempts: [], deadlines: [], sessions });
  const progress = buildStudyLensProgressMetrics([], sessions, evidence);

  assert.deepEqual(progress.find((metric) => metric.label === "Session loop"), {
    label: "Session loop",
    value: "3/3",
    detail: "Latest planned session: First review",
    status: "ready",
  });
});
