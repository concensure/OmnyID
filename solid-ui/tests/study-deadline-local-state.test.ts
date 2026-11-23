import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptStudyDeadlineReview,
  buildImportedStudyDeadline,
  buildManualStudyDeadline,
  buildStudyDeadlineFromReportInput,
  classifyAcademicCalendarDeadline,
  ignoreStudyDeadlineReview,
  loadStudyDeadlines,
  normalizeStudyDeadlines,
  saveStudyDeadline,
  STUDY_DEADLINES_KEY,
} from "../src/lib/studyDeadlineLocalState.ts";

function storageFixture(): Storage {
  const state = new Map<string, string>();
  return {
    get length() {
      return state.size;
    },
    clear() {
      state.clear();
    },
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    key(index: number) {
      return [...state.keys()][index] ?? null;
    },
    removeItem(key: string) {
      state.delete(key);
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

test("buildManualStudyDeadline requires title and due label", () => {
  assert.equal(buildManualStudyDeadline({ title: "", dueLabel: "Friday" }), null);
  assert.equal(buildManualStudyDeadline({ title: "Final exam", dueLabel: "" }), null);

  const deadline = buildManualStudyDeadline({
    title: "Final exam",
    dueLabel: "Friday 9am",
    kind: "exam",
    courseTag: " course:bio101 ",
    now: 123,
  });

  assert.equal(deadline?.title, "Final exam");
  assert.equal(deadline?.dueLabel, "Friday 9am");
  assert.equal(deadline?.kind, "exam");
  assert.equal(deadline?.courseTag, "course:bio101");
  assert.equal(deadline?.source, "manual");
});

test("buildStudyDeadlineFromReportInput creates stable report-derived manual deadlines", () => {
  assert.equal(buildStudyDeadlineFromReportInput({
    deadlineText: " ",
    reportKind: "exam_preparation",
  }), null);

  const exam = buildStudyDeadlineFromReportInput({
    deadlineText: "Final exam next Friday, chapters 4-8",
    reportKind: "exam_preparation",
    courseTag: "course:econ101",
    now: 99,
  });
  const duplicate = buildStudyDeadlineFromReportInput({
    deadlineText: "Final exam next Friday, chapters 4-8",
    reportKind: "exam_preparation",
    courseTag: "course:econ101",
    now: 100,
  });
  const assignment = buildStudyDeadlineFromReportInput({
    deadlineText: "Essay due Monday",
    reportKind: "assignment_plan",
  });
  const quiz = buildStudyDeadlineFromReportInput({
    deadlineText: "Practice quiz tomorrow",
    reportKind: "quiz_generator",
  });

  assert.equal(exam?.id, duplicate?.id);
  assert.equal(exam?.kind, "exam");
  assert.equal(exam?.courseTag, "course:econ101");
  assert.equal(exam?.title, "Exam deadline");
  assert.equal(assignment?.kind, "assignment");
  assert.equal(quiz?.kind, "quiz");
});

test("buildImportedStudyDeadline creates provider-stable academic event records", () => {
  assert.equal(buildImportedStudyDeadline({
    providerId: "gcal",
    title: "",
    dueLabel: "Friday",
    source: "calendar",
  }), null);

  const deadline = buildImportedStudyDeadline({
    providerId: "google-classroom",
    externalId: "coursework-1",
    title: "Week 4 quiz",
    dueLabel: "2026-10-04 11:59pm",
    dueAt: "2026-10-04T12:59:00.000Z",
    kind: "quiz",
    courseTag: "course:bio101",
    source: "lms",
    now: 10,
  });
  const duplicate = buildImportedStudyDeadline({
    providerId: "google-classroom",
    externalId: "coursework-1",
    title: "Week 4 quiz renamed",
    dueLabel: "2026-10-04",
    source: "lms",
    now: 11,
  });

  assert.equal(deadline?.id, "lms:google-classroom:coursework-1");
  assert.equal(duplicate?.id, deadline?.id);
  assert.equal(deadline?.source, "lms");
  assert.equal(deadline?.kind, "quiz");
  assert.equal(deadline?.courseTag, "course:bio101");
  assert.equal(deadline?.providerId, "google-classroom");
  assert.equal(deadline?.providerRecordId, "coursework-1");
  assert.equal(deadline?.reviewStatus, "accepted");
});

test("classifyAcademicCalendarDeadline requires review for ambiguous events", () => {
  const exam = classifyAcademicCalendarDeadline({
    externalId: "event-1",
    title: "Final exam BIO101",
    startLabel: "2026-10-04 9am",
    startAt: "2026-10-03T22:00:00.000Z",
    courseTag: "course:bio101",
    now: 10,
  });
  const ambiguous = classifyAcademicCalendarDeadline({
    externalId: "event-2",
    title: "Possible study hold",
    description: "TBC",
    startLabel: "2026-10-05",
    now: 11,
  });

  assert.equal(exam?.id, "calendar:gcal:event-1");
  assert.equal(exam?.kind, "exam");
  assert.equal(exam?.reviewStatus, "accepted");
  assert.equal(ambiguous?.kind, "other");
  assert.equal(ambiguous?.reviewStatus, "needs_review");
});

test("study deadlines normalize, sort, and bound local history", () => {
  const deadlines = normalizeStudyDeadlines([
    { id: "later", title: "Later", dueLabel: "Later", dueAt: "2026-10-02", createdAt: 1 },
    { id: "bad", title: "", dueLabel: "No", createdAt: 2 },
    { id: "soon", title: "Soon", dueLabel: "Soon", dueAt: "2026-09-10", createdAt: 3 },
    { id: "floating", title: "Floating", dueLabel: "Next week", createdAt: 4 },
  ]);

  assert.deepEqual(deadlines.map((deadline) => deadline.id), ["soon", "later", "floating"]);
});

test("study deadline storage clears malformed payloads and dedupes by id", () => {
  const storage = storageFixture();
  storage.setItem(STUDY_DEADLINES_KEY, "{bad-json");

  assert.deepEqual(loadStudyDeadlines(storage), []);
  assert.equal(storage.getItem(STUDY_DEADLINES_KEY), null);

  const first = buildManualStudyDeadline({ title: "Essay", dueLabel: "Monday", now: 1 })!;
  const saved = saveStudyDeadline(first, storage);
  saveStudyDeadline({ ...saved, dueLabel: "Tuesday" }, storage);

  const loaded = loadStudyDeadlines(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.dueLabel, "Tuesday");
});

test("imported deadline review decisions persist across repeat syncs", () => {
  const storage = storageFixture();
  const imported = buildImportedStudyDeadline({
    providerId: "gcal",
    externalId: "event-1",
    title: "Possible exam hold",
    dueLabel: "Friday",
    source: "calendar",
    reviewStatus: "needs_review",
    now: 1,
  })!;

  saveStudyDeadline(imported, storage);
  const accepted = acceptStudyDeadlineReview(imported.id, storage);
  assert.equal(accepted?.reviewStatus, "accepted");

  saveStudyDeadline({ ...imported, title: "Possible exam hold updated", createdAt: 2 }, storage);

  const loaded = loadStudyDeadlines(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.reviewStatus, "accepted");
  assert.equal(loaded[0]?.title, "Possible exam hold updated");

  const ignored = ignoreStudyDeadlineReview(imported.id, storage);
  assert.equal(ignored?.reviewStatus, "ignored");
});

test("report-derived deadline storage updates repeat captures", () => {
  const storage = storageFixture();
  const first = buildStudyDeadlineFromReportInput({
    deadlineText: "Final exam next Friday",
    reportKind: "exam_preparation",
    now: 1,
  })!;
  const second = { ...first, createdAt: 2, courseTag: "course:bio101" };

  saveStudyDeadline(first, storage);
  saveStudyDeadline(second, storage);

  const loaded = loadStudyDeadlines(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.createdAt, 2);
  assert.equal(loaded[0]?.courseTag, "course:bio101");
});
