import assert from "node:assert/strict";
import test from "node:test";

import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import type { StudyCourse } from "../src/lib/studyCourseLocalState.ts";
import type { StudyDeadline } from "../src/lib/studyDeadlineLocalState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import {
  activeStudyCourse,
  artifactsForStudyLensCoursePreference,
  inferredStudyCourseFromActivity,
  studyLensCourseLabels,
  studyLensCourseOptions,
} from "../src/lib/studyLensCourseContextState.ts";

function course(overrides: Partial<StudyCourse> = {}): StudyCourse {
  return {
    id: "course",
    name: "Biology 101",
    courseTag: "course:bio101",
    termLabel: "Term 1",
    institutionLabel: null,
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
    mode: "quiz",
    title: "Quiz attempt",
    artifactId: null,
    courseTag: "course:bio101",
    totalItems: 10,
    correctItems: 7,
    durationSeconds: null,
    source: "manual",
    createdAt: 1,
    ...overrides,
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
    sourceLabels: [],
    policyLabel: null,
    courseTag: "course:bio101",
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

test("activeStudyCourse prefers explicit course context over inferred activity", () => {
  const explicit = course({ courseTag: "course:law101", name: "Law 101" });
  const active = activeStudyCourse({
    courses: [explicit],
    deadlines: [deadline({ courseTag: "course:bio101" })],
    attempts: [attempt({ courseTag: "course:bio101" })],
    artifacts: [artifact({ courseTag: "course:bio101" })],
  });

  assert.equal(active, explicit);
});

test("inferredStudyCourseFromActivity creates migration-friendly course context", () => {
  const inferred = inferredStudyCourseFromActivity({
    deadlines: [deadline({ courseTag: "course:bio101" })],
  });

  assert.equal(inferred?.id, "inferred:course:bio101");
  assert.equal(inferred?.name, "Bio101");
  assert.equal(inferred?.courseTag, "course:bio101");
  assert.equal(inferred?.source, "inferred");
});

test("studyLensCourseLabels and options dedupe explicit and inferred courses", () => {
  const labels = studyLensCourseLabels({
    courses: [course()],
    deadlines: [deadline()],
    attempts: [attempt({ courseTag: "course:econ101" })],
    artifacts: [artifact({ courseTag: "course:bio101" })],
  });
  const options = studyLensCourseOptions({
    courses: [course()],
    deadlines: [deadline()],
    attempts: [attempt({ courseTag: "course:econ101" })],
    artifacts: [artifact({ courseTag: "course:bio101" })],
  });

  assert.deepEqual(labels, [
    "Biology 101 (course:bio101) - Term 1",
    "Inferred course:econ101",
  ]);
  assert.deepEqual(options, [
    {
      label: "Biology 101 (course:bio101) - Term 1",
      value: "course:bio101",
      source: "manual",
    },
    {
      label: "Inferred course:econ101",
      value: "course:econ101",
      source: "inferred_from_activity",
    },
  ]);
});

test("artifactsForStudyLensCoursePreference scopes saved outputs without hiding fallback context", () => {
  const bio = artifact({ id: "bio", courseTag: "course:bio101" });
  const econ = artifact({ id: "econ", courseTag: "course:econ101" });

  assert.deepEqual(
    artifactsForStudyLensCoursePreference([bio, econ], course()).map((item) => item.id),
    ["bio"],
  );
  assert.deepEqual(
    artifactsForStudyLensCoursePreference([econ], course()).map((item) => item.id),
    ["econ"],
  );
});
