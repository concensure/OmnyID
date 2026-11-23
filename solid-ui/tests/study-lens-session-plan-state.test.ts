import assert from "node:assert/strict";
import test from "node:test";

import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import type { StudyCourse } from "../src/lib/studyCourseLocalState.ts";
import type { StudyDeadline } from "../src/lib/studyDeadlineLocalState.ts";
import {
  buildStudyLensEvidenceState,
} from "../src/lib/studyLensEvidenceState.ts";
import {
  buildStudyLensSessionPlan,
} from "../src/lib/studyLensSessionPlanState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import type { StudySession } from "../src/lib/studySessionLocalState.ts";

function course(): StudyCourse {
  return {
    id: "course",
    name: "Biology 101",
    courseTag: "course:bio101",
    termLabel: null,
    institutionLabel: null,
    source: "manual",
    createdAt: 1,
  };
}

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "artifact",
    title: "Lecture summary",
    filename: "lecture.md",
    markdown: "# Lecture",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "lecture_summary",
    reportLabel: null,
    outputFormat: null,
    sourceLabels: ["Lecture 1"],
    policyLabel: null,
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

function deadline(): StudyDeadline {
  return {
    id: "deadline",
    title: "Final exam",
    kind: "exam",
    courseTag: "course:bio101",
    dueLabel: "Friday",
    dueAt: null,
    source: "manual",
    createdAt: 2,
  };
}

function attempt(): StudyAttempt {
  return {
    id: "attempt",
    mode: "quiz",
    title: "Quiz attempt",
    artifactId: null,
    courseTag: "course:bio101",
    totalItems: 10,
    correctItems: 8,
    durationSeconds: null,
    source: "manual",
    createdAt: 3,
  };
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: "session",
    title: "Focused review",
    status: "completed",
    duration: "45_min",
    courseTag: "course:bio101",
    sourceCount: 1,
    deadlineCount: 1,
    attemptCount: 1,
    nextAction: "Review weak terms",
    source: "study_lens",
    createdAt: 4,
    ...overrides,
  };
}

test("buildStudyLensSessionPlan blocks grounded sessions without retained sources", () => {
  const evidence = buildStudyLensEvidenceState({ artifacts: [], deadlines: [], attempts: [], sessions: [] });
  const plan = buildStudyLensSessionPlan([], course(), evidence);

  assert.equal(plan.readiness, "blocked");
  assert.equal(plan.action.view, "files");
  assert.equal(plan.items.find((item) => item.phase === "Review")?.status, "blocked");
  assert.match(plan.detail, /retained source context/i);
});

test("buildStudyLensSessionPlan becomes ready with source, deadline, and attempt evidence", () => {
  const sessions = [session()];
  const evidence = buildStudyLensEvidenceState({
    artifacts: [artifact()],
    deadlines: [deadline()],
    attempts: [attempt()],
    sessions,
  });
  const plan = buildStudyLensSessionPlan(sessions, course(), evidence);

  assert.equal(plan.readiness, "ready");
  assert.equal(plan.action.view, "reports");
  assert.equal(plan.items.find((item) => item.phase === "Recall")?.status, "ready");
  assert.match(plan.items.find((item) => item.phase === "Recall")?.detail ?? "", /8\/10 correct/);
  assert.match(plan.detail, /Review weak terms/i);
});
