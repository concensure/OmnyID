import test from "node:test";
import assert from "node:assert/strict";

import type { CalendarEvent } from "@/lib/api";
import {
  CALENDAR_CATEGORY_META,
  calendarAbsoluteDateLabel,
  calendarBuildMiniCalendar,
  calendarCommandSummary,
  calendarDateTimeIso,
  calendarDerivedCategory,
  calendarEventOverlaps,
  calendarEventsFromAfpMessages,
  calendarItemFromEvent,
  calendarLongDateLabel,
  calendarMatchesSearch,
  mergeCalendarEvents,
  calendarMonthLabel,
  calendarMonthShortLabel,
  calendarMonthStartIso,
  calendarReviewActionLabel,
  calendarReviewSummaryText,
  calendarSemanticTag,
  calendarTimeLabel,
} from "@/lib/monthlyCalendarViewState";

function event(
  overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "title" | "start_at" | "all_day" | "status">,
): CalendarEvent {
  return {
    id: overrides.id,
    title: overrides.title,
    start_at: overrides.start_at,
    all_day: overrides.all_day,
    status: overrides.status,
    description: overrides.description,
    end_at: overrides.end_at,
    location: overrides.location,
    note_kind: overrides.note_kind,
    prep_lead_minutes: overrides.prep_lead_minutes,
    profile: overrides.profile,
  };
}

test("monthly calendar state centralizes deterministic date labels", () => {
  const localDate = new Date(2026, 7, 31, 17, 5);

  assert.equal(calendarMonthLabel(2026, 7), "August 2026");
  assert.equal(calendarMonthStartIso(2026, 7), "2026-08-01");
  assert.equal(calendarDateTimeIso(2026, 7, 31, "17:05"), "2026-08-31T17:05:00");
  assert.equal(calendarMonthShortLabel(localDate), "Aug 31");
  assert.equal(calendarLongDateLabel(localDate), "Monday, August 31, 2026");
  assert.equal(calendarLongDateLabel(localDate, { includeYear: false }), "Monday, August 31");
  assert.equal(calendarAbsoluteDateLabel("2026-08-31T17:05:00"), "Aug 31, 2026, 5:05 PM");
  assert.equal(calendarTimeLabel("2026-08-31T17:05:00"), "5:05 PM");
});

test("monthly calendar state derives presentation fields from events", () => {
  const item = calendarItemFromEvent(event({
    id: "evt-1",
    title: "Interview with Sarah",
    description: "Bondi prep note for Sarah Chen (Zoom) and sunny weather",
    start_at: "2026-08-31T09:30:00",
    end_at: "2026-08-31T10:00:00",
    all_day: false,
    status: "tentative",
    note_kind: "high_stakes_prep",
    profile: { schedule_anchor_type: "interview" },
  }));

  assert.equal(calendarDerivedCategory(item), "weather");
  assert.equal(calendarSemanticTag(item), "interview · high stakes prep");
  assert.equal(item.markerColor, "#F97316");
  assert.deepEqual(item.relatedPeople, ["Interview", "Sarah", "Sarah Chen"]);
  assert.equal(item.relatedLocation, "Zoom");
  assert.equal(item.weatherTag, "sunny");
  assert.equal(item.sourceLabel, CALENDAR_CATEGORY_META.weather.label);
});

test("monthly calendar state centralizes reversible review copy", () => {
  const summary = {
    latest_tentative_note_kind: "high_stakes_prep",
    latest_tentative_prep_lead_minutes: 45,
    latest_tentative_location: "Town Hall",
    latest_tentative_profile: { schedule_anchor_type: "medical" },
  };

  assert.equal(calendarReviewActionLabel(summary), "Review medical prep");
  assert.equal(
    calendarReviewSummaryText(summary),
    "Current reversible hold is classified as medical. Prep mode: high stakes prep. Protected lead time: 45 minutes. Location: Town Hall.",
  );
});

test("monthly calendar state centralizes command summary, search, and overlap logic", () => {
  const first = calendarItemFromEvent(event({
    id: "evt-1",
    title: "Inbox review",
    description: "Reply to Alex from Office",
    start_at: "2026-08-31T09:00:00",
    end_at: "2026-08-31T10:00:00",
    all_day: false,
    status: "confirmed",
  }));
  const second = calendarItemFromEvent(event({
    id: "evt-2",
    title: "Planning call",
    description: "Slack sync with Sam",
    start_at: "2026-08-31T09:30:00",
    end_at: "2026-08-31T10:30:00",
    all_day: false,
    status: "confirmed",
  }));

  assert.equal(calendarCommandSummary({ summary: "Possible collision." }), "Possible collision.");
  assert.equal(calendarCommandSummary({ ok: true }), null);
  assert.equal(calendarMatchesSearch(first, "alex"), true);
  assert.equal(calendarMatchesSearch(first, "melbourne"), false);
  assert.equal(calendarEventOverlaps(first, [first, second]), true);
});

test("monthly calendar state treats academic AFP events as searchable calendar items", () => {
  const [projected] = calendarEventsFromAfpMessages([
    {
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
        provider_id: "gcal",
      },
      views: [],
      attachments: [],
      references: [],
    },
  ]);

  const item = calendarItemFromEvent(projected!);
  assert.equal(item.derivedCategory, "academic");
  assert.equal(item.sourceLabel, "Academic");
  assert.equal(calendarMatchesSearch(item, "chapter:4"), true);
  assert.equal(calendarMatchesSearch(item, "genetics"), true);
  assert.equal(calendarMatchesSearch(item, "gcal"), true);
});

test("monthly calendar state merges AFP-projected events before API events without duplicates", () => {
  const apiEvent = event({
    id: "api-1",
    title: "Planning call",
    start_at: "2026-08-31T09:30:00",
    all_day: false,
    status: "confirmed",
  });
  const projected = event({
    id: "api-1",
    title: "Projected duplicate",
    start_at: "2026-08-31T09:30:00",
    all_day: false,
    status: "confirmed",
  });

  const merged = mergeCalendarEvents([apiEvent], [projected]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.title, "Projected duplicate");
});

test("monthly calendar state builds full mini-calendar rows", () => {
  const cells = calendarBuildMiniCalendar(2026, 7);

  assert.equal(cells.length, 42);
  assert.deepEqual(cells.slice(0, 6), [null, null, null, null, null, null]);
  assert.equal(cells[6], 1);
  assert.equal(cells[36], 31);
  assert.equal(cells.at(-1), null);
});
