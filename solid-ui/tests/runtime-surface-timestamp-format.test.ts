import assert from "node:assert/strict";
import test from "node:test";

import { dateTimeLabel, relativeTimeLabel } from "../src/lib/agentSettingsRuntimeFormat.ts";
import { readMountedDateLabel, readMountedDateTimeLabel } from "../src/lib/usageViewSharedState.ts";

test("agent settings runtime timestamp helpers use stable surface labels", () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-09-01T05:05:00Z");
  try {
    assert.equal(dateTimeLabel("2026-09-01T04:05:00Z"), "Sep 1, 2026, 2:05 PM");
    assert.equal(relativeTimeLabel("2026-09-01T04:05:00Z"), "Used 1h ago");
    assert.equal(dateTimeLabel(null), "-");
    assert.equal(relativeTimeLabel(null), "Not used yet");
  } finally {
    Date.now = originalNow;
  }
});

test("usage shared timestamp helpers normalize mounted dates with stable labels", () => {
  assert.equal(readMountedDateLabel("2026-09-01T04:05:00Z"), "Sep 1, 2026");
  assert.equal(readMountedDateTimeLabel("2026-09-01T04:05:00Z"), "Sep 1, 2026, 2:05 PM");
  assert.equal(readMountedDateLabel(""), null);
  assert.equal(readMountedDateTimeLabel("invalid"), null);
});
