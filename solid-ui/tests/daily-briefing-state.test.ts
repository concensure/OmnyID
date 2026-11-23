import assert from "node:assert/strict";
import test from "node:test";

import { dailyBriefingState } from "../src/lib/dailyBriefingState.ts";

test("daily briefing state provides stable empty fallbacks", () => {
  assert.deepEqual(dailyBriefingState([]), {
    headline: "Daily Briefing",
    summaryLine: null,
    focusItems: [],
    projectionCards: [],
    temporalProjectionSummaries: [],
    patternChips: [],
    hasContent: false,
  });
});

test("daily briefing state hides encrypted projection details before local decryption", () => {
  const state = dailyBriefingState([
    {
      id: "projection-encrypted",
      type: "projection",
      timestamp: "2026-08-31T12:00:00.000Z",
      content: {
        headline: "Hidden wedding deadline",
        body: "Private vendor detail",
        urgency: "high",
        ciphertext: "abc123",
        nonce: "nonce123",
      },
      encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
    },
  ] as any);

  assert.deepEqual(state.projectionCards, [
    {
      headline: "",
      body: "",
      urgencyToneClass: "text-on-surface-variant",
      categoryIcon: "#",
    },
  ]);
  assert.equal(state.hasContent, true);
});

test("daily briefing state centralizes synthesis projection and pattern presentation", () => {
  const state = dailyBriefingState([
    {
      id: "synthesis-1",
      type: "state_synthesis",
      content: {
        headline: "Morning briefing",
        active_task_count: 4,
        pending_decision_count: 2,
        calendar_pressure: "busy",
        focus_items: ["Finish launch checklist", "Reply to investor update"],
      },
    },
    {
      id: "projection-1",
      type: "projection",
      content: {
        headline: "Deadline collision ahead",
        body: "Two approvals and one shipment may land at the same time.",
        urgency: "high",
        category: "deadline_conflict",
      },
    },
    {
      id: "temporal-1",
      type: "temporal_projection",
      content: {
        summary: "Expect a heavier Wednesday due to onboarding reviews.",
      },
    },
    {
      id: "pattern-1",
      type: "behavior_pattern",
      content: {
        summary: "You clear administrative work faster before lunch.",
        category: "routine",
      },
    },
  ] as any);

  assert.equal(state.headline, "Morning briefing");
  assert.equal(state.summaryLine, "4 tasks · 2 decisions · calendar busy");
  assert.deepEqual(state.focusItems, [
    "Finish launch checklist",
    "Reply to investor update",
  ]);
  assert.deepEqual(state.projectionCards, [
    {
      headline: "Deadline collision ahead",
      body: "Two approvals and one shipment may land at the same time.",
      urgencyToneClass: "text-red-600",
      categoryIcon: "!",
    },
  ]);
  assert.deepEqual(state.temporalProjectionSummaries, [
    "Expect a heavier Wednesday due to onboarding reviews.",
  ]);
  assert.deepEqual(state.patternChips, [
    {
      summary: "You clear administrative work faster before lunch.",
      categoryIcon: "~",
    },
  ]);
  assert.equal(state.hasContent, true);
});
