import test from "node:test";
import assert from "node:assert/strict";

import {
  surfaceDateTimeLabel,
  surfaceDateTitleLabel,
  surfaceNoteHeaderTimestamp,
  surfaceRelativeTimestamp,
  surfaceShortDateLabel,
  surfaceTimeLabel,
} from "@/lib/surfaceTimestampPresentation";

test("surface timestamp presentation centralizes relative collaboration timestamps", () => {
  const now = Date.parse("2026-09-01T12:00:00.000Z");
  assert.equal(surfaceRelativeTimestamp("2026-09-01T11:59:45.000Z", now), "just now");
  assert.equal(surfaceRelativeTimestamp("2026-09-01T11:15:00.000Z", now), "45m ago");
  assert.equal(surfaceRelativeTimestamp("2026-09-01T09:00:00.000Z", now), "3h ago");
  assert.equal(surfaceRelativeTimestamp("2026-08-30T12:00:00.000Z", now), "2d ago");
});

test("surface timestamp presentation centralizes short date, title date, time, and note header labels", () => {
  const timestamp = "2026-09-01T06:05:00.000Z";
  assert.equal(surfaceShortDateLabel(timestamp), "Sep 1");
  assert.equal(surfaceDateTitleLabel(timestamp), "Sep 1, 2026");
  assert.equal(surfaceDateTimeLabel(timestamp), "Sep 1, 2026, 4:05 PM");
  assert.equal(surfaceTimeLabel(timestamp), "4:05 PM");
  assert.equal(surfaceNoteHeaderTimestamp(timestamp), "Sep 1, 4:05 PM");
});

test("surface timestamp presentation fail-closes invalid timestamps", () => {
  assert.equal(surfaceRelativeTimestamp("invalid"), "");
  assert.equal(surfaceShortDateLabel(""), "");
  assert.equal(surfaceDateTitleLabel(null), "");
  assert.equal(surfaceDateTimeLabel(undefined), "");
  assert.equal(surfaceTimeLabel(undefined), "");
  assert.equal(surfaceNoteHeaderTimestamp("invalid"), "");
});
