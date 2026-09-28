import assert from "node:assert/strict";
import test from "node:test";

import {
  afpMessagesToCalendarEvents,
  hasSentStudyDeadlineAfpProjection,
  loadStudyDeadlineAfpProjectionIds,
  markStudyDeadlineAfpProjectionSent,
  shouldProjectStudyDeadlineToAfpCalendarEvent,
  STUDY_DEADLINE_AFP_PROJECTIONS_KEY,
  studyDeadlineToAfpCalendarMessage,
  studyDeadlineToAfpSendInput,
  studyDeadlinesToAfpCalendarMessages,
  unmarkStudyDeadlineAfpProjectionSent,
} from "../src/lib/studyDeadlineAfpProjectionState.ts";
import { buildImportedStudyDeadline } from "../src/lib/studyDeadlineLocalState.ts";

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

test("study deadline AFP projection creates searchable first-class calendar events", () => {
  const deadline = buildImportedStudyDeadline({
    providerId: "gcal",
    externalId: "event-42",
    title: "BIO101 final exam",
    dueLabel: "October 4, 9am",
    dueAt: "2026-10-03T22:00:00.000Z",
    kind: "exam",
    courseTag: "course:bio101",
    unitTag: "unit:genetics",
    chapterTag: "chapter:4",
    moduleLabel: "Module 4",
    source: "calendar",
    reviewStatus: "accepted",
    now: 10,
  })!;

  const message = studyDeadlineToAfpCalendarMessage(deadline, "2026-09-10T00:00:00.000Z");
  assert.equal(shouldProjectStudyDeadlineToAfpCalendarEvent(deadline), true);
  assert.equal(message?.id, "afp-calendar-event:calendar:gcal:event-42");
  assert.equal(message?.type, "calendar_event");
  assert.equal(message?.kind, "event");
  assert.equal(message?.subtype, "academic_deadline");
  assert.deepEqual(message?.to, ["agent://calendar", "agent://study"]);
  assert.equal(message?.content.start_at, "2026-10-03T22:00:00.000Z");
  assert.equal(message?.metadata?.academic_course_tag, "course:bio101");
  assert.equal(message?.metadata?.academic_unit_tag, "unit:genetics");
  assert.equal(message?.metadata?.academic_chapter_tag, "chapter:4");
  assert.deepEqual(message?.metadata?.searchable_terms, [
    "calendar",
    "calendar_event",
    "academic",
    "study_deadline",
    "deadline:exam",
    "course:bio101",
    "unit:genetics",
    "chapter:4",
    "module:Module 4",
    "provider:gcal",
  ]);
  assert.ok(message?.supertags?.includes("chapter:4"));
  assert.equal(message?.views[0]?.content && typeof message.views[0].content === "object" && "academic_scope" in message.views[0].content
    ? message.views[0].content.academic_scope
    : null, "course:bio101 - unit:genetics - chapter:4 - Module 4");
  assert.ok(message?.references?.some((reference) => reference.type === "study_deadline" && reference.target === deadline.id));

  const [event] = afpMessagesToCalendarEvents([message!]);
  assert.equal(event?.id, message?.id);
  assert.equal(event?.title, "BIO101 final exam");
  assert.equal(event?.start_at, "2026-10-03T22:00:00.000Z");
  assert.equal(event?.profile?.academic_chapter_tag, "chapter:4");

  const sendInput = studyDeadlineToAfpSendInput(deadline, "2026-09-10T00:00:00.000Z");
  assert.equal(sendInput?.type, "calendar_event");
  assert.equal(sendInput?.store_in_relational, true);
});

test("study deadline AFP projection only promotes accepted timestamped imported dates", () => {
  const accepted = buildImportedStudyDeadline({
    providerId: "canvas",
    externalId: "assignment-1",
    title: "Essay due",
    dueLabel: "Friday",
    dueAt: "2026-10-03T22:00:00.000Z",
    source: "lms",
    reviewStatus: "accepted",
  })!;
  const needsReview = { ...accepted, id: "calendar:gcal:maybe", source: "calendar" as const, reviewStatus: "needs_review" as const };
  const missingTime = { ...accepted, id: "lms:canvas:floating", dueAt: null };

  assert.deepEqual(studyDeadlinesToAfpCalendarMessages([accepted, needsReview, missingTime]).map((message) => message.id), [
    "afp-calendar-event:lms:canvas:assignment-1",
  ]);
});

test("study deadline AFP projection sent markers are storage-safe and deduped", () => {
  const storage = storageFixture();
  storage.setItem(STUDY_DEADLINE_AFP_PROJECTIONS_KEY, "{bad-json");

  assert.deepEqual(loadStudyDeadlineAfpProjectionIds(storage), []);
  assert.equal(storage.getItem(STUDY_DEADLINE_AFP_PROJECTIONS_KEY), null);

  markStudyDeadlineAfpProjectionSent("deadline-1", storage);
  markStudyDeadlineAfpProjectionSent("deadline-1", storage);

  assert.equal(hasSentStudyDeadlineAfpProjection("deadline-1", storage), true);
  assert.deepEqual(loadStudyDeadlineAfpProjectionIds(storage), ["deadline-1"]);

  unmarkStudyDeadlineAfpProjectionSent("deadline-1", storage);
  assert.equal(hasSentStudyDeadlineAfpProjection("deadline-1", storage), false);
  assert.equal(storage.getItem(STUDY_DEADLINE_AFP_PROJECTIONS_KEY), null);
});
