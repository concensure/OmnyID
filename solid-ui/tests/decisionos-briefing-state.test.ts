import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsCompletedPct,
  decisionOsEffectiveQueueMinutes,
  decisionOsQueueEffortLabel,
  decisionOsQueueLoadLabel,
  decisionOsQueueLoadTone,
  decisionOsQueueOverloadSummary,
  decisionOsShouldShowQueuePriorityAction,
  decisionOsQueueTrendGlyph,
  shouldShowDecisionOsQueueOverload,
} from "../src/lib/decisionOsBriefingState.ts";

test("decisionos briefing state derives completion percent and effective queue minutes", () => {
  assert.equal(decisionOsCompletedPct(3, 8), 38);
  assert.equal(decisionOsCompletedPct(0, 0), 0);
  assert.equal(decisionOsEffectiveQueueMinutes(14, 22), 14);
  assert.equal(decisionOsEffectiveQueueMinutes(undefined, 22), 22);
});

test("decisionos briefing state formats queue effort labels and trend glyphs", () => {
  assert.equal(decisionOsQueueEffortLabel({ effectiveMinutes: 18 }), "~18 min to clear queue");
  assert.equal(
    decisionOsQueueEffortLabel({
      effectiveMinutes: 12,
      preparedWorkCue: { label: "Prepared response ready", detail: "Reply drafted" },
    }),
    "Focused lane · ~12 min to close prepared response",
  );
  assert.equal(
    decisionOsQueueEffortLabel({
      effectiveMinutes: 12,
      preparedWorkCue: {
        label: "Prepared decision support ready",
        detail: "Renewal review drafted",
      },
    }),
    "Focused lane · ~12 min to close prepared decision support",
  );
  assert.equal(
    decisionOsQueueEffortLabel({
      effectiveMinutes: 12,
      preparedWorkCue: { label: "Prepared work ready", detail: "Workspace note drafted" },
    }),
    "Focused lane · ~12 min to close prepared work",
  );
  assert.equal(
    decisionOsQueueEffortLabel({
      effectiveMinutes: 0,
      preparedWorkCue: { label: "Prepared context ready", detail: null },
    }),
    "Focused lane · Prepared context ready",
  );
  assert.equal(decisionOsQueueTrendGlyph("up"), "↑");
  assert.equal(decisionOsQueueTrendGlyph("down"), "↓");
  assert.equal(decisionOsQueueTrendGlyph("steady"), "→");
});

test("decisionos briefing state derives queue load visuals consistently", () => {
  assert.equal(decisionOsQueueLoadLabel(20), "Light");
  assert.equal(decisionOsQueueLoadLabel(45), "Moderate");
  assert.equal(decisionOsQueueLoadLabel(75), "Heavy");
  assert.equal(decisionOsQueueLoadTone(20), "text-emerald-600");
  assert.equal(decisionOsQueueLoadTone(45), "text-amber-600");
  assert.equal(decisionOsQueueLoadTone(75), "text-rose-600");
});

test("decisionos briefing state detects overload conditions", () => {
  assert.equal(shouldShowDecisionOsQueueOverload(6, 20), true);
  assert.equal(shouldShowDecisionOsQueueOverload(3, 61), true);
  assert.equal(shouldShowDecisionOsQueueOverload(3, 20), false);
  assert.equal(
    decisionOsQueueOverloadSummary(7, 85),
    "Heavy queue — 7 decisions · ~85 min total",
  );
});

test("decisionos briefing state shows queue priority action for visible queue work below completion", () => {
  assert.equal(
    decisionOsShouldShowQueuePriorityAction({
      hasVisibleQueueWork: true,
      completedPct: 72,
    }),
    true,
  );
  assert.equal(
    decisionOsShouldShowQueuePriorityAction({
      hasVisibleQueueWork: false,
      completedPct: 72,
    }),
    false,
  );
  assert.equal(
    decisionOsShouldShowQueuePriorityAction({
      hasVisibleQueueWork: true,
      completedPct: 100,
    }),
    false,
  );
});
