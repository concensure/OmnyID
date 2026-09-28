import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudyAcademicScopeCarryoverBadges,
  buildStudyAcademicScopeContinuationLines,
  buildStudyAcademicScopeCsvTags,
  buildStudyAcademicScopeFocusBadges,
  buildStudyAcademicScopeLabels,
  buildStudyAcademicScopePromptValues,
  buildStudyAcademicScopeSearchValues,
} from "../src/lib/studyAcademicScopeState.ts";

const scope = {
  courseTag: "course:law101",
  unitTag: "unit:contracts",
  chapterTag: "chapter:4",
  moduleLabel: "Module 2",
  dueLabel: "2026-10-03T22:00:00.000Z",
  deadlineId: "deadline-42",
  providerId: "gcal",
  academicKind: "study_course",
  sessionId: "study-session-1",
  routeSource: "study_lens",
};

test("buildStudyAcademicScopeLabels orders student-visible scope before internal routing", () => {
  assert.deepEqual(buildStudyAcademicScopeLabels(scope), [
    "course:law101",
    "unit:contracts",
    "chapter:4",
    "Module 2",
    "2026-10-03T22:00:00.000Z",
  ]);
  assert.deepEqual(buildStudyAcademicScopeLabels(scope, {
    includeDeadlineId: true,
    includeProviderId: true,
    includeAcademicKind: true,
    includeSessionId: true,
    includeRouteSource: true,
  }), [
    "course:law101",
    "unit:contracts",
    "chapter:4",
    "Module 2",
    "2026-10-03T22:00:00.000Z",
    "deadline-42",
    "gcal",
    "study_course",
    "study-session-1",
    "study_lens",
  ]);
});

test("buildStudyAcademicScopeLabels dedupes and limits labels conservatively", () => {
  assert.deepEqual(buildStudyAcademicScopeLabels({
    courseTag: "course:law101",
    unitTag: "COURSE:LAW101",
    chapterTag: "chapter:4",
    moduleLabel: "Module 2",
  }, { limit: 2 }), ["course:law101", "chapter:4"]);
});

test("buildStudyAcademicScopeCsvTags includes deadline and provider for drill exports", () => {
  assert.equal(
    buildStudyAcademicScopeCsvTags(scope),
    "course:law101; unit:contracts; chapter:4; Module 2; 2026-10-03T22:00:00.000Z; deadline-42; gcal",
  );
});

test("buildStudyAcademicScopeSearchValues includes route metadata for saved-output discovery", () => {
  assert.deepEqual(buildStudyAcademicScopeSearchValues(scope), [
    "course:law101",
    "unit:contracts",
    "chapter:4",
    "Module 2",
    "2026-10-03T22:00:00.000Z",
    "deadline-42",
    "gcal",
    "study_course",
    "study-session-1",
    "study_lens",
  ]);
});

test("buildStudyAcademicScopeFocusBadges creates report-continuation badges", () => {
  assert.deepEqual(buildStudyAcademicScopeFocusBadges(scope), [
    "course_tag:course:law101",
    "chapter_tag:chapter:4",
    "unit_tag:unit:contracts",
    "module:Module 2",
    "due:2026-10-03T22:00:00.000Z",
    "deadline:deadline-42",
    "provider:gcal",
    "academic_kind:study_course",
    "session:study-session-1",
    "route_source:study_lens",
  ]);
});

test("buildStudyAcademicScopeContinuationLines creates student-readable continuation constraints", () => {
  const lines = buildStudyAcademicScopeContinuationLines(scope);

  assert.ok(lines.includes("Keep the follow-up scoped to course:law101."));
  assert.ok(lines.includes("Keep the follow-up scoped to chapter:4."));
  assert.ok(lines.includes("Keep the follow-up scoped to unit:contracts."));
  assert.ok(lines.includes("Keep the follow-up scoped to module Module 2."));
  assert.ok(lines.includes("Keep the follow-up tied to due date 2026-10-03T22:00:00.000Z."));
  assert.ok(lines.includes("Reuse deadline context deadline-42."));
  assert.ok(lines.includes("Keep provider context gcal visible for source/audit checks."));
  assert.ok(lines.includes("Treat this as continuation evidence from guided session study-session-1."));
});

test("buildStudyAcademicScopeCarryoverBadges creates display-safe next-session badges", () => {
  assert.deepEqual(buildStudyAcademicScopeCarryoverBadges(scope), [
    "course:law101",
    "unit:contracts",
    "chapter:4",
    "Module 2",
    "2026-10-03T22:00:00.000Z",
    "gcal",
    "guided session study-session-1",
    "from study lens",
  ]);
  assert.deepEqual(buildStudyAcademicScopeCarryoverBadges(scope, { limit: 4 }), [
    "course:law101",
    "unit:contracts",
    "chapter:4",
    "Module 2",
  ]);
});

test("buildStudyAcademicScopePromptValues creates report-prompt focus values", () => {
  assert.deepEqual(buildStudyAcademicScopePromptValues(scope), [
    "academic_kind:study_course",
    "course:law101",
    "unit:contracts",
    "chapter:4",
    "module:Module 2",
    "due:2026-10-03T22:00:00.000Z",
    "deadline:deadline-42",
    "provider:gcal",
    "session:study-session-1",
    "route_source:study_lens",
  ]);
});
