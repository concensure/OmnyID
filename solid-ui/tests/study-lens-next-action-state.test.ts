import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudyAcademicIntegrationState,
} from "../src/lib/studyAcademicIntegrationState.ts";
import type { StudyDeadline } from "../src/lib/studyDeadlineLocalState.ts";
import {
  buildStudyLensEvidenceState,
} from "../src/lib/studyLensEvidenceState.ts";
import {
  buildStudyLensNextAction,
} from "../src/lib/studyLensNextActionState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "artifact",
    title: "Lecture summary",
    filename: "lecture.md",
    markdown: "# Lecture summary",
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

function deadline(overrides: Partial<StudyDeadline> = {}): StudyDeadline {
  return {
    id: "deadline",
    title: "Final exam",
    kind: "exam",
    courseTag: "course:bio101",
    dueLabel: "Friday",
    dueAt: null,
    source: "manual",
    createdAt: 2,
    ...overrides,
  };
}

function nextActionFor(input: {
  artifacts?: StudyReportArtifact[];
  deadlines?: StudyDeadline[];
  connectedAppIds?: string[];
}) {
  const artifacts = input.artifacts ?? [];
  const deadlines = input.deadlines ?? [];
  const integrations = buildStudyAcademicIntegrationState({
    connectedAppIds: input.connectedAppIds,
    deadlines,
    courses: [],
  });
  const evidence = buildStudyLensEvidenceState({
    artifacts,
    deadlines,
    attempts: [],
    sessions: [],
  });
  return buildStudyLensNextAction(null, integrations, evidence);
}

test("buildStudyLensNextAction starts with source grounding", () => {
  const action = nextActionFor({});

  assert.equal(action.priority, "source");
  assert.equal(action.action.view, "files");
  assert.match(action.reason, /Source grounding/i);
});

test("buildStudyLensNextAction prefers provider setup after sources but before deadlines", () => {
  const action = nextActionFor({ artifacts: [artifact()] });

  assert.equal(action.priority, "integration");
  assert.equal(action.action.view, "connected_apps");
  assert.match(action.title, /Connect LMS or Google Calendar/i);
});

test("buildStudyLensNextAction routes imported dates through review before planning", () => {
  const action = nextActionFor({
    artifacts: [artifact()],
    connectedAppIds: ["google-calendar"],
    deadlines: [deadline({ source: "calendar", reviewStatus: "needs_review" })],
  });

  assert.equal(action.priority, "deadline");
  assert.equal(action.action.view, "reports");
  assert.equal(action.action.reportKind, "day_schedule");
  assert.match(action.title, /Review imported academic dates/i);
});

test("buildStudyLensNextAction advances through drill, readiness, and planning evidence", () => {
  const withDeadline = nextActionFor({
    artifacts: [artifact()],
    deadlines: [deadline()],
  });
  const withDrill = nextActionFor({
    artifacts: [artifact({ reportKind: "flashcard_deck" })],
    deadlines: [deadline()],
  });
  const withReadiness = nextActionFor({
    artifacts: [
      artifact({ id: "cards", reportKind: "flashcard_deck" }),
      artifact({ id: "exam", reportKind: "exam_preparation" }),
    ],
    deadlines: [deadline()],
  });

  assert.equal(withDeadline.priority, "drill");
  assert.equal(withDeadline.action.reportKind, "flashcard_deck");
  assert.equal(withDrill.priority, "readiness");
  assert.equal(withDrill.action.reportKind, "exam_preparation");
  assert.equal(withReadiness.priority, "planning");
  assert.equal(withReadiness.action.reportKind, "course_builder");
});
