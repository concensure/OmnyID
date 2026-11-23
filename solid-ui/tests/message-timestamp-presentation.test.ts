import test from "node:test";
import assert from "node:assert/strict";

import {
  absoluteDisplayTimestamp,
  absoluteUtcTimestamp,
  displayMessageTimestamp,
  relativeMessageTime,
  utcShortDateLabel,
  utcTitleDateLabel,
  utcWeekdayDateLabel,
} from "@/lib/messageTimestampPresentation";

test("message timestamp presentation formats relative time for recent timestamps", () => {
  const now = Date.parse("2026-08-31T12:00:00.000Z");
  assert.equal(relativeMessageTime("2026-08-31T11:59:45.000Z", now), "just now");
  assert.equal(relativeMessageTime("2026-08-31T11:10:00.000Z", now), "50m ago");
  assert.equal(relativeMessageTime("2026-08-31T08:00:00.000Z", now), "4h ago");
  assert.equal(relativeMessageTime("2026-08-29T12:00:00.000Z", now), "2d ago");
});

test("message timestamp presentation formats absolute displays consistently", () => {
  assert.equal(absoluteDisplayTimestamp("2026-08-31T12:34:56.000Z"), "2026-08-31 12:34");
  assert.equal(absoluteUtcTimestamp("2026-08-31T12:34:56.000Z"), "2026-08-31 12:34 UTC");
  assert.equal(utcShortDateLabel("2026-08-31T12:34:56.000Z"), "Aug 31");
  assert.equal(utcWeekdayDateLabel("2026-08-31T12:34:56.000Z"), "Mon, Aug 31");
  assert.equal(utcTitleDateLabel("2026-08-31T12:34:56.000Z"), "Aug 31, 2026");
  assert.equal(absoluteDisplayTimestamp("invalid"), "invalid");
});

test("message timestamp presentation switches to absolute display after seven days", () => {
  const now = Date.parse("2026-08-31T12:00:00.000Z");
  assert.equal(displayMessageTimestamp("2026-08-31T11:30:00.000Z", now), "30m ago");
  assert.equal(displayMessageTimestamp("2026-08-20T12:00:00.000Z", now), "2026-08-20 12:00");
});
