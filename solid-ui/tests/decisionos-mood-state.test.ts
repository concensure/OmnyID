import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsAutoMoodActionLabel,
  decisionOsAutoMoodLabel,
  decisionOsAutoMoodReasonLabel,
  decisionOsAutoMoodSelection,
  decisionOsAutoQuickWinsActiveLabel,
  decisionOsMoodPromptLabel,
  decisionOsQueueClearMoodResetPlan,
  decisionOsQuickWinsOnlyLabel,
  decisionOsVisibleDecisionCountLabel,
  decisionOsMoodDiaryEntry,
  decisionOsMoodPinnedByUserAfterSelection,
  decisionOsMoodSelectionPlan,
} from "../src/lib/decisionOsMoodState.ts";

test("decisionos mood state updates pinned-by-user flag by source", () => {
  assert.equal(decisionOsMoodPinnedByUserAfterSelection(false, "user"), true);
  assert.equal(decisionOsMoodPinnedByUserAfterSelection(true, "agent"), true);
  assert.equal(decisionOsMoodPinnedByUserAfterSelection(true, "system"), false);
});

test("decisionos mood state builds diary entries only for user selections", () => {
  const option = { id: "tired" as const, emoji: "zzz", label: "Tired" };
  assert.deepEqual(
    decisionOsMoodDiaryEntry({
      mood: "tired",
      source: "user",
      option,
      now: new Date("2026-06-27T10:00:00Z"),
    }),
    {
      ts: "2026-06-27T10:00:00.000Z",
      type: "mood",
      icon: "zzz",
      title: "Mood: Tired",
      detail: "Queue filtered to quick wins automatically.",
    },
  );
  assert.equal(
    decisionOsMoodDiaryEntry({
      mood: "neutral",
      source: "agent",
      option: { id: "neutral", emoji: ":|", label: "Neutral" },
    }),
    null,
  );
});

test("decisionos mood state derives auto-mood helper labels and selection", () => {
  const options = [
    { id: "focused" as const, emoji: "fire", label: "Focused" },
    { id: "neutral" as const, emoji: ":|", label: "Neutral" },
  ];

  assert.equal(decisionOsAutoMoodLabel("focused", options), "Focused");
  assert.equal(decisionOsAutoMoodLabel(null, options), "Neutral");
  assert.equal(decisionOsAutoMoodActionLabel("focused", options), "Auto: Focused");
  assert.equal(decisionOsMoodPromptLabel(), "How are you feeling?");
  assert.equal(decisionOsAutoQuickWinsActiveLabel(3), "Auto quick wins active - 3 left");
  assert.equal(decisionOsQuickWinsOnlyLabel(2), "Showing quick wins only - 2 left");
  assert.equal(decisionOsVisibleDecisionCountLabel(1), "1 decision");
  assert.equal(decisionOsVisibleDecisionCountLabel(4), "4 decisions");
  assert.equal(
    decisionOsAutoMoodReasonLabel({
      pinnedByUser: true,
      inferred: { mood: "focused", reason: "Calendar is clear." },
    }),
    "Auto available: Calendar is clear.",
  );
  assert.equal(
    decisionOsAutoMoodReasonLabel({
      pinnedByUser: false,
      inferred: { mood: "focused", reason: "Calendar is clear." },
    }),
    "Auto: Calendar is clear.",
  );
  assert.deepEqual(decisionOsAutoMoodSelection("focused"), {
    mood: "focused",
    source: "system",
  });
  assert.equal(decisionOsAutoMoodSelection(null), null);
});

test("decisionos mood state derives a complete selection plan", () => {
  const option = { id: "tired" as const, emoji: "zzz", label: "Tired" };
  assert.deepEqual(
    decisionOsMoodSelectionPlan({
      mood: "tired",
      source: "user",
      currentPinnedByUser: false,
      option,
      now: new Date("2026-06-27T10:00:00Z"),
    }),
    {
      mood: "tired",
      pinnedByUser: true,
      diaryEntry: {
        ts: "2026-06-27T10:00:00.000Z",
        type: "mood",
        icon: "zzz",
        title: "Mood: Tired",
        detail: "Queue filtered to quick wins automatically.",
      },
    },
  );
});

test("decisionos mood state derives queue-clear mood reset only for tired or stressed full-clear states", () => {
  assert.deepEqual(
    decisionOsQueueClearMoodResetPlan({
      completedPct: 100,
      mood: "tired",
    }),
    {
      shouldReset: true,
      mood: "neutral",
      source: "system",
      toastMessage: "Queue clear - mood reset to Neutral.",
    },
  );

  assert.deepEqual(
    decisionOsQueueClearMoodResetPlan({
      completedPct: 80,
      mood: "tired",
    }),
    {
      shouldReset: false,
      mood: "tired",
      source: "system",
      toastMessage: null,
    },
  );

  assert.deepEqual(
    decisionOsQueueClearMoodResetPlan({
      completedPct: 100,
      mood: "focused",
    }),
    {
      shouldReset: false,
      mood: "focused",
      source: "system",
      toastMessage: null,
    },
  );
});

