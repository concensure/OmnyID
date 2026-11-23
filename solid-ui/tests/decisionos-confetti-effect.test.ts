import test from "node:test";
import assert from "node:assert/strict";

import { appendDecisionOsConfetti } from "../src/lib/decisionOsConfettiEffect.js";

test("decisionos confetti effect appends particles and schedules cleanup", () => {
  const appended: Array<{ style: { cssText: string }; removed: boolean; remove: () => void }> = [];
  const scheduled: Array<{ delayMs: number; remove: () => void }> = [];

  const count = appendDecisionOsConfetti(
    {
      appendChild(node) {
        appended.push(node as typeof appended[number]);
      },
    },
    {
      particles: [
        {
          background: "#111111",
          leftPct: 12,
          topPct: 34,
          animationDelaySec: 0.2,
          rotateDeg: 45,
        },
        {
          background: "#222222",
          leftPct: 56,
          topPct: 22,
          animationDelaySec: 0.1,
          rotateDeg: 90,
        },
      ],
      createElement() {
        return {
          style: { cssText: "" },
          removed: false,
          remove() {
            this.removed = true;
          },
        };
      },
      scheduleRemoval(remove, delayMs) {
        scheduled.push({ remove, delayMs });
      },
    },
  );

  assert.equal(count, 2);
  assert.equal(appended.length, 2);
  assert.equal(scheduled.length, 2);
  assert.ok(appended[0]?.style.cssText.includes("background:#111111;"));
  assert.ok(appended[1]?.style.cssText.includes("left:56%;top:22%;"));
  assert.deepEqual(
    scheduled.map((item) => item.delayMs),
    [1500, 1500],
  );

  scheduled[0]?.remove();
  scheduled[1]?.remove();
  assert.equal(appended[0]?.removed, true);
  assert.equal(appended[1]?.removed, true);
});
