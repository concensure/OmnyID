import assert from "node:assert/strict";
import test from "node:test";

import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import type { StudyCourse } from "../src/lib/studyCourseLocalState.ts";
import {
  buildStudyLensAttemptReportIntent,
  buildStudyLensCourseReportIntent,
  buildStudyLensFileLibraryIntent,
  buildStudyLensKnowledgeGraphIntent,
  buildStudyLensReportIntent,
} from "../src/lib/studyLensNavigationState.ts";

function course(overrides: Partial<StudyCourse> = {}): StudyCourse {
  return {
    id: "course",
    name: "Biology 101",
    courseTag: "course:bio101",
    termLabel: "Term 1",
    institutionLabel: "Example Uni",
    source: "manual",
    createdAt: 1,
    ...overrides,
  };
}

function attempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt",
    mode: "quiz",
    title: "Chapter 4 quiz",
    artifactId: null,
    courseTag: "course:bio101",
    totalItems: 20,
    correctItems: 13,
    durationSeconds: 900,
    source: "manual",
    createdAt: 1,
    ...overrides,
  };
}

test("study lens report intents carry course scope into Reports", () => {
  const intent = buildStudyLensReportIntent("exam_preparation", course());

  assert.equal(intent.source, "study_lens");
  assert.equal(intent.preferredKind, "exam_preparation");
  assert.equal(intent.courseTag, "course:bio101");
  assert.equal(intent.activeTag, "course:bio101");
  assert.equal(intent.academicKind, "study_course");
  assert.deepEqual(intent.knowledgeGraphLinkTags, ["course_source:manual", "term:Term 1"]);
  assert.match(intent.zettelkastenNextAction ?? "", /active Study Lens course context/i);
});

test("study lens course report intent specializes the generic report handoff", () => {
  const intent = buildStudyLensCourseReportIntent(course());

  assert.equal(intent.preferredKind, "course_builder");
  assert.equal(intent.searchQuery, "Biology 101 course plan for Term 1");
  assert.equal(intent.activeTag, "course:bio101");
  assert.match(intent.zettelkastenNextAction ?? "", /retained sources, deadlines, study attempts/i);
});

test("study lens attempt report intent targets weak evidence", () => {
  const intent = buildStudyLensAttemptReportIntent(attempt());

  assert.equal(intent.preferredKind, "practice_questions");
  assert.equal(intent.courseTag, "course:bio101");
  assert.equal(intent.activeTag, "study_attempt:quiz");
  assert.deepEqual(intent.knowledgeGraphLinkTags, ["attempt:quiz", "score:13/20"]);
  assert.match(intent.zettelkastenNextAction ?? "", /13\/20 correct \(65%\) completed in 15m/i);
});

test("study lens source actions carry course context into Files and Knowledge Graph", () => {
  const activeCourse = course();
  const fileIntent = buildStudyLensFileLibraryIntent(activeCourse);
  const graphIntent = buildStudyLensKnowledgeGraphIntent(activeCourse);

  assert.equal(fileIntent.query, "Biology 101 Term 1");
  assert.equal(fileIntent.tag, "course:bio101");
  assert.equal(fileIntent.academicKind, "study_course");
  assert.deepEqual(fileIntent.knowledgeGraphLinkTags, ["course:bio101", "course_source:manual", "term:Term 1"]);
  assert.match(fileIntent.notice ?? "", /Files context/i);

  assert.equal(graphIntent.activeLens, "study_materials");
  assert.equal(graphIntent.activeTag, "course:bio101");
  assert.equal(graphIntent.courseTag, "course:bio101");
  assert.equal(graphIntent.preferredConnectionStrength, "high");
  assert.deepEqual(graphIntent.knowledgeGraphLinkTags, ["course:bio101", "course_source:manual", "term:Term 1"]);
  assert.match(graphIntent.notice ?? "", /Knowledge Graph context/i);
});
