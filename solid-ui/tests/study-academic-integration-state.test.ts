import assert from "node:assert/strict";
import test from "node:test";

import {
  applyStudyAcademicImportBatch,
  buildStudyAcademicDeadlineReviewQueueState,
  buildStudyAcademicImportBatch,
  buildStudyAcademicIntegrationState,
  normalizeStudyIntegrationProviderId,
} from "../src/lib/studyAcademicIntegrationState.ts";
import type { StudyCourse } from "../src/lib/studyCourseLocalState.ts";
import type { StudyDeadline } from "../src/lib/studyDeadlineLocalState.ts";

test("study academic integrations expose LMS and Google Calendar providers", () => {
  const state = buildStudyAcademicIntegrationState({
    connectedAppIds: ["canvas-lms", "gcal"],
    courses: [],
    deadlines: [],
  });

  assert.deepEqual(state.connectedProviderNames, ["Canvas LMS", "Google Calendar"]);
  assert.equal(state.hasConnectedAcademicSource, true);
  assert.equal(state.hasImportedAcademicEvidence, false);
  assert.equal(state.nextActionLabel, "Import academic dates");
  assert.equal(state.providers.find((provider) => provider.id === "google-classroom")?.name, "Google Classroom");
  assert.equal(state.providers.find((provider) => provider.id === "blackboard-lms")?.kind, "lms");
});

test("study academic integrations normalize external provider aliases", () => {
  assert.equal(normalizeStudyIntegrationProviderId("google-calendar"), "gcal");
  assert.equal(normalizeStudyIntegrationProviderId("googlecalendar"), "gcal");
  assert.equal(normalizeStudyIntegrationProviderId("canvas"), "canvas-lms");
  assert.equal(normalizeStudyIntegrationProviderId("blackboard"), "blackboard-lms");

  const state = buildStudyAcademicIntegrationState({
    connectedAppIds: ["google-calendar"],
    connections: [
      {
        tool_slug: "canvas",
        connected: true,
      } as never,
    ],
    courses: [],
    deadlines: [],
  });

  assert.deepEqual(state.connectedProviderNames, ["Canvas LMS", "Google Calendar"]);
  assert.equal(state.providers.find((provider) => provider.id === "gcal")?.status, "connected");
  assert.equal(state.providers.find((provider) => provider.id === "canvas-lms")?.status, "connected");
});

test("study academic integrations count only imported course and deadline evidence", () => {
  const state = buildStudyAcademicIntegrationState({
    connectedAppIds: ["google-classroom"],
    courses: [
      {
        id: "lms:google-classroom:bio101",
        name: "Biology 101",
        courseTag: "course:bio101",
        termLabel: null,
        institutionLabel: null,
        source: "lms",
        createdAt: 1,
      },
      {
        id: "manual:law101",
        name: "Law 101",
        courseTag: "course:law101",
        termLabel: null,
        institutionLabel: null,
        source: "manual",
        createdAt: 2,
      },
    ],
    deadlines: [
      {
        id: "calendar:gcal:event-1",
        title: "Final exam",
        kind: "exam",
        courseTag: "course:bio101",
        dueLabel: "2026-10-03 09:00",
        dueAt: "2026-10-02T22:00:00.000Z",
        source: "calendar",
        createdAt: 3,
      },
    ],
  });

  assert.equal(state.importedCourseCount, 1);
  assert.equal(state.importedDeadlineCount, 1);
  assert.equal(state.hasImportedAcademicEvidence, true);
  assert.match(state.summaryLabel, /1 imported course \/ 1 reviewed deadline/);
});

test("study academic deadline review queue separates accepted review and ignored imports", () => {
  const queue = buildStudyAcademicDeadlineReviewQueueState({
    deadlines: [
      {
        id: "calendar:gcal:event-ignored",
        title: "Gym",
        kind: "other",
        courseTag: null,
        dueLabel: "2026-10-05",
        dueAt: "2026-10-05T00:00:00.000Z",
        source: "calendar",
        providerId: "gcal",
        providerRecordId: "event-ignored",
        reviewStatus: "ignored",
        createdAt: 1,
      },
      {
        id: "calendar:gcal:event-review",
        title: "Possible exam hold",
        kind: "other",
        courseTag: "course:bio101",
        dueLabel: "2026-10-04",
        dueAt: "2026-10-04T00:00:00.000Z",
        source: "calendar",
        providerId: "gcal",
        providerRecordId: "event-review",
        reviewStatus: "needs_review",
        createdAt: 2,
      },
      {
        id: "lms:canvas-lms:assignment-1",
        title: "Genetics quiz",
        kind: "quiz",
        courseTag: "course:bio101",
        dueLabel: "2026-10-03",
        dueAt: "2026-10-03T00:00:00.000Z",
        source: "lms",
        providerId: "canvas-lms",
        providerRecordId: "assignment-1",
        unitTag: "unit:genetics",
        chapterTag: "chapter:4",
        moduleLabel: "Module 2",
        reviewStatus: "accepted",
        createdAt: 3,
      },
      {
        id: "manual:deadline",
        title: "Manual exam",
        kind: "exam",
        courseTag: "course:law101",
        dueLabel: "2026-10-02",
        dueAt: null,
        source: "manual",
        createdAt: 4,
      },
    ],
  });

  assert.equal(queue.totalCount, 3);
  assert.equal(queue.acceptedCount, 1);
  assert.equal(queue.reviewCount, 1);
  assert.equal(queue.ignoredCount, 1);
  assert.equal(queue.summaryLabel, "1 accepted / 1 to review / 1 ignored");
  assert.equal(queue.nextActionLabel, "Review imported dates");
  assert.equal(queue.items[0]?.id, "calendar:gcal:event-review");
  assert.equal(queue.reviewItems[0]?.providerLabel, "Google Calendar");
  assert.equal(queue.reviewItems[0]?.primaryAction, "accept");
  assert.equal(queue.reviewItems[0]?.secondaryAction, "ignore");
  assert.equal(queue.acceptedItems[0]?.canDrivePlanning, true);
  assert.equal(queue.acceptedItems[0]?.scopeLabel, "course:bio101 / unit:genetics / chapter:4 / Module 2");
  assert.equal(queue.ignoredItems[0]?.primaryAction, "restore");
  assert.equal(queue.ignoredItems[0]?.canDrivePlanning, false);
});

test("study academic deadline review queue handles empty imports", () => {
  const queue = buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] });

  assert.equal(queue.totalCount, 0);
  assert.equal(queue.summaryLabel, "No imported academic dates");
  assert.equal(queue.nextActionLabel, "Connect LMS/calendar");
  assert.equal(queue.emptyLabel, "No LMS or calendar dates imported yet");
});

test("study academic import batch normalizes LMS units, chapters, and stable provider IDs", () => {
  const batch = buildStudyAcademicImportBatch({
    providerId: "canvas-lms",
    now: 10,
    courses: [
      {
        providerId: "canvas-lms",
        externalId: "course-1",
        name: "Biology 101",
        courseTag: "course:bio101",
        unitTags: ["unit:genetics"],
        chapterTags: ["chapter:4"],
      },
      {
        providerId: "canvas-lms",
        name: "",
      },
    ],
    deadlines: [
      {
        providerId: "canvas-lms",
        externalId: "assignment-1",
        title: "Genetics quiz",
        dueLabel: "2026-10-04",
        kind: "quiz",
        courseTag: "course:bio101",
        unitTag: "unit:genetics",
        chapterTag: "chapter:4",
        moduleLabel: "Module 2",
      },
    ],
  });

  assert.equal(batch.savedCourseCount, 1);
  assert.equal(batch.skippedCourseCount, 1);
  assert.equal(batch.savedDeadlineCount, 1);
  assert.equal(batch.acceptedDeadlineCount, 1);
  assert.equal(batch.courses[0]?.id, "lms:canvas-lms:course-1");
  assert.deepEqual(batch.courses[0]?.unitTags, ["unit:genetics"]);
  assert.deepEqual(batch.courses[0]?.chapterTags, ["chapter:4"]);
  assert.equal(batch.deadlines[0]?.id, "lms:canvas-lms:assignment-1");
  assert.equal(batch.deadlines[0]?.unitTag, "unit:genetics");
  assert.equal(batch.deadlines[0]?.chapterTag, "chapter:4");
  assert.equal(batch.deadlines[0]?.moduleLabel, "Module 2");
});

test("study academic import batch classifies ambiguous Google Calendar items for review", () => {
  const batch = buildStudyAcademicImportBatch({
    providerId: "google-calendar",
    now: 10,
    deadlines: [
      {
        providerId: "google-calendar",
        externalId: "event-1",
        title: "Final exam",
        dueLabel: "2026-10-04 09:00",
      },
      {
        providerId: "google-calendar",
        externalId: "event-2",
        title: "Possible study hold",
        description: "TBC",
        dueLabel: "2026-10-05",
      },
    ],
  });

  assert.equal(batch.savedDeadlineCount, 2);
  assert.equal(batch.providerId, "gcal");
  assert.equal(batch.acceptedDeadlineCount, 1);
  assert.equal(batch.reviewNeededDeadlineCount, 1);
  assert.equal(batch.deadlines[0]?.providerId, "gcal");
  assert.equal(batch.deadlines[0]?.kind, "exam");
  assert.equal(batch.deadlines[0]?.reviewStatus, "accepted");
  assert.equal(batch.deadlines[1]?.reviewStatus, "needs_review");
});

test("applyStudyAcademicImportBatch persists through injected stores", () => {
  const savedCourses: StudyCourse[] = [];
  const savedDeadlines: StudyDeadline[] = [];
  const result = applyStudyAcademicImportBatch({
    providerId: "google-classroom",
    now: 20,
    courses: [
      {
        providerId: "google-classroom",
        externalId: "course-1",
        name: "Law 101",
        courseTag: "course:law101",
      },
    ],
    deadlines: [
      {
        providerId: "google-classroom",
        externalId: "coursework-1",
        title: "Case brief",
        dueLabel: "Friday",
        kind: "assignment",
        courseTag: "course:law101",
      },
    ],
  }, {
    saveCourse: (course) => {
      savedCourses.push(course);
      return course;
    },
    saveDeadline: (deadline) => {
      savedDeadlines.push(deadline);
      return deadline;
    },
  });

  assert.equal(result.savedCourseCount, 1);
  assert.equal(result.savedDeadlineCount, 1);
  assert.equal(result.savedCourses[0]?.id, "lms:google-classroom:course-1");
  assert.equal(result.savedDeadlines[0]?.id, "lms:google-classroom:coursework-1");
  assert.equal(savedCourses.length, 1);
  assert.equal(savedDeadlines.length, 1);
});
