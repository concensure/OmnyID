import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import { buildStudyAcademicCalendarSearchState } from "../src/lib/studyAcademicCalendarSearchState.ts";

function message(overrides: Partial<AfpMessage>): AfpMessage {
  return {
    id: "afp-calendar-event:calendar:gcal:event-42",
    thread_id: "calendar_event:calendar:gcal:event-42",
    from: "system://study-lens",
    to: ["agent://calendar", "agent://study"],
    timestamp: "2026-09-10T00:00:00.000Z",
    type: "calendar_event",
    kind: "event",
    subtype: "academic_deadline",
    supertags: ["academic", "calendar_event", "course:bio101", "chapter:4"],
    content: {
      kind: "calendar_event",
      title: "BIO101 final exam",
      description: "Scope: course:bio101 / unit:genetics / chapter:4.",
      start_at: "2026-10-03T22:00:00.000Z",
      all_day: false,
      status: "confirmed",
    },
    metadata: {
      origin: "study_lens",
      projection: "study_deadline_to_afp_calendar_event",
      academic_course_tag: "course:bio101",
      academic_unit_tag: "unit:genetics",
      academic_chapter_tag: "chapter:4",
      academic_module_label: "Module 2",
      provider_id: "gcal",
      source_deadline_id: "deadline-42",
    },
    views: [],
    attachments: [],
    references: [],
    ...overrides,
  };
}

test("buildStudyAcademicCalendarSearchState summarizes first-class AFP academic calendar events", () => {
  const state = buildStudyAcademicCalendarSearchState({
    messages: [message({})],
  });

  assert.equal(state?.count, 1);
  assert.equal(state?.headline, "1 academic calendar event matched");
  assert.match(state?.detail ?? "", /first-class AFP calendar_event/i);
  assert.equal(state?.cards[0]?.title, "BIO101 final exam");
  assert.equal(state?.cards[0]?.dueLabel, "2026-10-03T22:00:00.000Z");
  assert.equal(state?.cards[0]?.eventId, "afp-calendar-event:calendar:gcal:event-42");
  assert.equal(state?.cards[0]?.eventDate, "2026-10-03");
  assert.equal(state?.cards[0]?.scopeLabel, "course:bio101 - unit:genetics - chapter:4 - Module 2");
  assert.equal(state?.cards[0]?.providerLabel, "gcal");
  assert.equal(state?.cards[0]?.reportIntent.source, "object_search");
  assert.equal(state?.cards[0]?.reportIntent.preferredKind, "exam_preparation");
  assert.equal(state?.cards[0]?.reportIntent.courseTag, "course:bio101");
  assert.equal(state?.cards[0]?.reportIntent.unitTag, "unit:genetics");
  assert.equal(state?.cards[0]?.reportIntent.chapterTag, "chapter:4");
  assert.equal(state?.cards[0]?.reportIntent.moduleLabel, "Module 2");
  assert.equal(state?.cards[0]?.reportIntent.dueLabel, "2026-10-03T22:00:00.000Z");
  assert.equal(state?.cards[0]?.reportIntent.deadlineId, "deadline-42");
  assert.equal(state?.cards[0]?.reportIntent.providerId, "gcal");
  assert.ok(state?.cards[0]?.reportIntent.knowledgeGraphLinkTags?.includes("provider:gcal"));
  assert.ok(state?.cards[0]?.reportIntent.knowledgeGraphLinkTags?.includes("module:Module 2"));
  assert.match(state?.cards[0]?.reportIntent.goalHint ?? "", /BIO101 final exam|course:bio101/i);
  assert.ok(state?.cards[0]?.chips.includes("academic_deadline"));
  assert.ok(state?.cards[0]?.chips.includes("deadline:deadline-42"));
  assert.ok(state?.facetQueries.includes("course:bio101"));
  assert.ok(state?.facetQueries.includes("unit:genetics"));
  assert.ok(state?.facetQueries.includes("chapter:4"));
});

test("buildStudyAcademicCalendarSearchState chooses report handoff kind from academic event text", () => {
  const state = buildStudyAcademicCalendarSearchState({
    messages: [
      message({
        id: "assignment",
        content: { title: "Research essay assignment", start_at: "2026-10-09T00:00:00Z" },
        metadata: { academic_kind: "assignment", academic_course_tag: "course:eng101" },
      }),
      message({
        id: "quiz",
        content: { title: "Week 5 quiz", start_at: "2026-10-10T00:00:00Z" },
        metadata: { academic_kind: "quiz", academic_course_tag: "course:bio101" },
      }),
      message({
        id: "study",
        content: { title: "Study block for finals", start_at: "2026-10-11T00:00:00Z" },
        metadata: { academic_kind: "study_block", academic_course_tag: "course:law101" },
      }),
    ],
  });

  assert.deepEqual(
    state?.cards.map((card) => card.reportIntent.preferredKind),
    ["assignment_plan", "quiz_generator", "guided_study_session"],
  );
});

test("buildStudyAcademicCalendarSearchState ignores ordinary and non-calendar AFP messages", () => {
  const state = buildStudyAcademicCalendarSearchState({
    messages: [
      message({
        id: "ordinary-calendar",
        subtype: "meeting",
        supertags: ["calendar_event"],
        metadata: { provider_id: "gcal" },
      }),
      message({
        id: "knowledge-card",
        type: "knowledge_card",
        subtype: undefined,
        metadata: { academic_course_tag: "course:bio101" },
      }),
    ],
  });

  assert.equal(state, null);
});

test("buildStudyAcademicCalendarSearchState hides encrypted calendar content until local decryption is available", () => {
  const state = buildStudyAcademicCalendarSearchState({
    messages: [
      message({
        id: "encrypted-calendar",
        content: {
          title: "Hidden chapter exam",
          start_at: "2026-10-01T00:00:00Z",
          ciphertext: "abc123",
          nonce: "nonce123",
        },
        encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" } as any,
      }),
    ],
  });

  assert.equal(state?.count, 1);
  assert.equal(state?.cards[0]?.title, "Academic deadline");
  assert.equal(state?.cards[0]?.dueLabel, "Date pending");
  assert.equal(state?.cards[0]?.reportIntent.dueLabel, "Date pending");
  assert.doesNotMatch(state?.cards[0]?.reportIntent.goalHint ?? "", /Hidden chapter exam/);
});

test("buildStudyAcademicCalendarSearchState caps visible cards while counting all matches", () => {
  const state = buildStudyAcademicCalendarSearchState({
    limit: 2,
    messages: [
      message({ id: "one", content: { title: "One", start_at: "2026-10-01T00:00:00Z" } }),
      message({ id: "two", content: { title: "Two", start_at: "2026-10-02T00:00:00Z" } }),
      message({ id: "three", content: { title: "Three", start_at: "2026-10-03T00:00:00Z" } }),
    ],
  });

  assert.equal(state?.count, 3);
  assert.deepEqual(state?.cards.map((card) => card.title), ["One", "Two"]);
});
