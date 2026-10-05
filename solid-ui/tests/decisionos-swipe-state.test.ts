import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsSwipeActionPlan,
  decisionOsSwipeColor,
  decisionOsSwipeMovePlan,
  decisionOsSwipeOpacity,
  decisionOsSwipeOutcome,
  decisionOsSwipeAxisLock,
  decisionOsSwipeDirection,
} from "../src/lib/decisionOsSwipeState.ts";

test("decisionos swipe state derives approve and dismiss outcomes", () => {
  assert.equal(
    decisionOsSwipeOutcome({ dx: 60, elapsedMs: 200, rootFontSizePx: 16 }),
    "approve",
  );
  assert.equal(
    decisionOsSwipeOutcome({ dx: -60, elapsedMs: 200, rootFontSizePx: 16 }),
    "dismiss",
  );
  assert.equal(
    decisionOsSwipeOutcome({ dx: 10, elapsedMs: 200, rootFontSizePx: 16 }),
    null,
  );
});

test("decisionos swipe state allows fast flick completions under hard threshold", () => {
  assert.equal(
    decisionOsSwipeOutcome({ dx: 25, elapsedMs: 20, rootFontSizePx: 16 }),
    "approve",
  );
  assert.equal(
    decisionOsSwipeOutcome({ dx: -25, elapsedMs: 20, rootFontSizePx: 16 }),
    "dismiss",
  );
});

test("decisionos swipe state derives overlay opacity and color", () => {
  assert.equal(decisionOsSwipeOpacity(30), 0.18);
  assert.equal(decisionOsSwipeOpacity(6), 0.1);
  assert.equal(decisionOsSwipeColor(6), "rgba(34,197,94,0.1)");
  assert.equal(decisionOsSwipeColor(-6), "rgba(239,68,68,0.1)");
});

test("decisionos swipe state ignores vertical moves and preserves horizontal swipes", () => {
  assert.deepEqual(
    decisionOsSwipeMovePlan({
      startX: 10,
      startY: 10,
      currentX: 40,
      currentY: 18,
    }),
    {
      shouldPreventDefault: true,
      swipeDx: 30,
    },
  );

  assert.deepEqual(
    decisionOsSwipeMovePlan({
      startX: 10,
      startY: 10,
      currentX: 18,
      currentY: 40,
    }),
    {
      shouldPreventDefault: false,
      swipeDx: null,
    },
  );
});

test("decisionos swipe state resolves action plans with optional chosen option ids", () => {
  assert.deepEqual(
    decisionOsSwipeActionPlan({
      dx: 60,
      elapsedMs: 200,
      rootFontSizePx: 16,
      optionId: "option-a",
    }),
    {
      action: "approve",
      optionId: "option-a",
    },
  );

  assert.deepEqual(
    decisionOsSwipeActionPlan({
      dx: -60,
      elapsedMs: 200,
      rootFontSizePx: 16,
      optionId: "option-a",
    }),
    {
      action: "dismiss",
      optionId: "option-a",
    },
  );
});

test("four-way focus deck swipe keeps approval distance-only", () => {
  assert.equal(decisionOsSwipeAxisLock({ dx: 4, dy: 3 }), null);
  assert.equal(decisionOsSwipeAxisLock({ dx: 12, dy: 4 }), "horizontal");
  assert.equal(decisionOsSwipeDirection({ dx: 100, dy: 0, elapsedMs: 300, cardWidth: 360, cardHeight: 500, mapping: "left_is_prev" }), "next");
  assert.equal(decisionOsSwipeDirection({ dx: -100, dy: 0, elapsedMs: 300, cardWidth: 360, cardHeight: 500, mapping: "left_is_prev" }), "prev");
  assert.equal(decisionOsSwipeDirection({ dx: 0, dy: 40, elapsedMs: 10, cardWidth: 360, cardHeight: 500, mapping: "left_is_prev" }), null);
  assert.equal(decisionOsSwipeDirection({ dx: 0, dy: 130, elapsedMs: 300, cardWidth: 360, cardHeight: 500, mapping: "left_is_prev" }), "approve");
});
