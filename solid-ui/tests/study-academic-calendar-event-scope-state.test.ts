import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyAcademicCalendarEventScope } from "../src/lib/studyAcademicCalendarEventScopeState.ts";

test("buildStudyAcademicCalendarEventScope centralizes academic calendar scope", () => {
  const scope = buildStudyAcademicCalendarEventScope({
    academicKind: "exam",
    courseTag: "course:bio101",
    unitTag: "unit:genetics",
    chapterTag: "chapter:4",
    moduleLabel: "Module 2",
    providerId: "gcal",
    providerRecordId: "event-42",
    studyDeadlineId: "deadline-42",
    dueLabel: "2026-10-03T22:00:00.000Z",
    source: "calendar",
    reviewStatus: "accepted",
  });

  assert.equal(scope.scopeLabel, "course:bio101 - unit:genetics - chapter:4 - Module 2");
  assert.equal(scope.providerLabel, "gcal");
  assert.deepEqual(scope.scopeParts, ["course:bio101", "unit:genetics", "chapter:4", "Module 2"]);
  assert.ok(scope.supertags.includes("deadline:exam"));
  assert.ok(scope.supertags.includes("provider:gcal"));
  assert.ok(scope.chips.includes("deadline:deadline-42"));
  assert.ok(scope.knowledgeGraphLinkTags.includes("provider:gcal"));
  assert.equal(scope.metadata.academic_chapter_tag, "chapter:4");
  assert.equal(scope.metadata.provider_record_id, "event-42");
  assert.ok(scope.searchableTerms.includes("2026-10-03T22:00:00.000Z"));
});

test("buildStudyAcademicCalendarEventScope handles unscoped imported events conservatively", () => {
  const scope = buildStudyAcademicCalendarEventScope({
    source: "lms",
    providerId: "canvas-lms",
  });

  assert.equal(scope.scopeLabel, "No course scope saved");
  assert.equal(scope.providerLabel, "canvas-lms");
  assert.deepEqual(scope.scopeParts, []);
  assert.ok(scope.chips.includes("academic_deadline"));
  assert.ok(scope.chips.includes("canvas-lms"));
  assert.ok(scope.supertags.includes("provider:canvas-lms"));
});
