import assert from "node:assert/strict";
import test from "node:test";

import { dateTimeLabel, relativeTimeLabel } from "../src/lib/agentSettingsRuntimeFormat.ts";
import {
  runtimeRestoreDrillEntries,
  runtimeRestoreDrillHasEntries,
  runtimeRestoreDrillPreviewCard,
  runtimeRestoreDrillPreviewCards,
  runtimeRestoreDrillPreviewEntries,
  runtimeRestoreDrillStartedCompletedSummary,
  runtimeRestoreDrillStatusLabel,
} from "../src/lib/runtimeRestoreDrillsState.ts";

test("runtime restore drill selectors provide stable fallbacks", () => {
  assert.deepEqual(runtimeRestoreDrillEntries(null), []);
  assert.equal(runtimeRestoreDrillHasEntries(null), false);
  assert.deepEqual(runtimeRestoreDrillPreviewEntries(null), []);
  assert.deepEqual(runtimeRestoreDrillPreviewCards(null), []);
});

test("runtime restore drill selectors expose preview and status summaries", () => {
  const runtimeRestoreDrills = {
    entries: [
      {
        id: "drill-1",
        backup_id: "backup-1",
        status: "completed",
        started_at: "2026-08-14T07:30:00Z",
        completed_at: "2026-08-14T07:31:00Z",
        notes_summary: null,
      },
    ],
  };

  assert.equal(runtimeRestoreDrillHasEntries(runtimeRestoreDrills), true);
  assert.equal(runtimeRestoreDrillPreviewEntries(runtimeRestoreDrills).length, 1);
  assert.equal(runtimeRestoreDrillStatusLabel(runtimeRestoreDrills.entries[0]), "completed | backup backup-1");
  assert.equal(
    runtimeRestoreDrillStartedCompletedSummary(runtimeRestoreDrills.entries[0]),
    "started 2026-08-14T07:30:00Z | completed 2026-08-14T07:31:00Z",
  );
  assert.deepEqual(runtimeRestoreDrillPreviewCard(runtimeRestoreDrills.entries[0]), {
    statusLabel: "completed | backup backup-1",
    timingLine: `started ${dateTimeLabel("2026-08-14T07:30:00Z")} | completed ${dateTimeLabel("2026-08-14T07:31:00Z")} | duration 1m`,
    relativeTimingLine: `${relativeTimeLabel("2026-08-14T07:30:00Z")} | completed ${relativeTimeLabel("2026-08-14T07:31:00Z")}`,
    noteChips: [],
  });
  assert.deepEqual(runtimeRestoreDrillPreviewCards(runtimeRestoreDrills), [
    {
      statusLabel: "completed | backup backup-1",
      timingLine: `started ${dateTimeLabel("2026-08-14T07:30:00Z")} | completed ${dateTimeLabel("2026-08-14T07:31:00Z")} | duration 1m`,
      relativeTimingLine: `${relativeTimeLabel("2026-08-14T07:30:00Z")} | completed ${relativeTimeLabel("2026-08-14T07:31:00Z")}`,
      noteChips: [],
    },
  ]);
});
