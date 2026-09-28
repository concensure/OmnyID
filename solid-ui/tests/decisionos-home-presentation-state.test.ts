import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsClearStreakLabel,
  decisionEffortMinutes,
  decisionOsEmptyQueueDayReturnLabel,
  decisionOsEmptyQueueNextStepsLabel,
  decisionOsEmptyQueueOpenResponseQueueLabel,
  decisionOsEmptyQueueSummary,
  decisionOsEmptyQueueReviewWeekLabel,
  decisionOsEmptyQueueTitle,
  decisionOsGreeting,
  decisionOsOutcomeCheckBadgeLabel,
  inferDecisionOsSnoozeOptions,
  isDecisionOsQuickWin,
  outcomeCheckLabel,
  totalDecisionOsEffortMinutes,
} from "../src/lib/decisionOsHomePresentationState.ts";

test("decisionos home presentation state formats greeting by time and urgency", () => {
  assert.equal(
    decisionOsGreeting(
      { urgentCount: 2, estimatedMinutes: 18 },
      new Date("2026-06-27T08:00:00"),
    ),
    "Good morning. Clear 2 urgent items before 10 AM.",
  );

  assert.equal(
    decisionOsGreeting(
      { estimatedMinutes: 22 },
      new Date("2026-06-27T15:00:00"),
    ),
    "Good afternoon. You can likely clear this queue in about 22 minutes.",
  );
});

test("decisionos home presentation state parses effort labels and outcome checks", () => {
  assert.equal(decisionEffortMinutes("15 min"), 15);
  assert.equal(decisionEffortMinutes("2 h"), 120);
  assert.equal(decisionEffortMinutes("unknown"), 30);
  assert.equal(isDecisionOsQuickWin("15 min"), true);
  assert.equal(isDecisionOsQuickWin("16 min"), false);
  assert.equal(
    totalDecisionOsEffortMinutes([
      { effort: "15 min" },
      { effort: "2 h" },
      { effort: "unknown" },
    ]),
    165,
  );

  assert.equal(
    outcomeCheckLabel("2026-06-30T00:00:00Z", new Date("2026-06-27T00:00:00Z").getTime()),
    "3d",
  );
  assert.equal(
    decisionOsEmptyQueueSummary("day"),
    "Your agent will surface new decisions as they arise.",
  );
  assert.equal(
    decisionOsEmptyQueueSummary("week"),
    "No week decisions in your queue.",
  );
  assert.equal(decisionOsEmptyQueueDayReturnLabel(), "Back to Today's view");
  assert.equal(decisionOsEmptyQueueNextStepsLabel(), "What's next");
  assert.equal(decisionOsEmptyQueueTitle(), "Queue is clear");
  assert.equal(decisionOsEmptyQueueReviewWeekLabel(), "Review this week");
  assert.equal(decisionOsEmptyQueueOpenResponseQueueLabel(), "Open response queue");
  assert.equal(decisionOsClearStreakLabel(3), "3-day streak");
  assert.equal(
    decisionOsOutcomeCheckBadgeLabel(
      "2026-06-27T02:00:00Z",
      new Date("2026-06-27T00:00:00Z").getTime(),
    ),
    "Check in 2h",
  );
});

test("decisionos home presentation state infers bounded snooze options for busy days", () => {
  const options = inferDecisionOsSnoozeOptions({
    confirmedEventCount: 4,
    now: new Date("2026-06-27T10:00:00"),
  });

  assert.equal(options.length, 4);
  assert.ok(options.some((option) => option.id === "after_lunch"));
  assert.ok(!options.some((option) => option.id === "tonight"));
});

test("decisionos home presentation state prioritizes tentative holds in bounded snooze options", () => {
  const options = inferDecisionOsSnoozeOptions({
    confirmedEventCount: 4,
    nextTentativeStartAt: "2026-06-27T11:00:00",
    latestTentativeTitle: "Project hold",
    now: new Date("2026-06-27T10:00:00"),
  });

  assert.equal(options.length, 4);
  assert.equal(options[0]?.id, "after_next_hold");
  assert.match(options[0]?.label ?? "", /Project hold/i);
});
