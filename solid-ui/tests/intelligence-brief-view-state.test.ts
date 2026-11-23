import test from "node:test";
import assert from "node:assert/strict";

import {
  intelligenceBriefCollapsedGoalPulse,
  intelligenceBriefVisibleSections,
  loadIntelligenceBriefData,
  runIntelligenceBriefOfferAction,
} from "../src/lib/intelligenceBriefViewState.ts";
import type { BriefApiResponse, GoalPulseItem } from "../src/lib/intelligenceBriefState.ts";

const goalPulse: GoalPulseItem[] = [
  { domain: "career", momentum: "building", last_signal: "today" },
  { domain: "finance", momentum: "steady", last_signal: "yesterday" },
  { domain: "health", momentum: "quiet" },
  { domain: "creativity", momentum: "recent" },
  { domain: "community", momentum: "paused" },
];

const brief: BriefApiResponse = {
  brief_id: "brief-1",
  brief_date: "2026-09-01",
  greeting: "Good morning",
  sections: [
    { type: "context", title: "Context", body: "Overview", priority: 1 },
    { type: "goal_pulse", title: "Goals", body: "Goal motion", priority: 2 },
    { type: "ambient", title: "Ambient", body: "Ambient note", priority: 3 },
    { type: "agent_offer", title: "Offer", body: "Offer note", priority: 4, action: { label: "Run", intent: "do_it" } },
    { type: "peripheral", title: "Peripheral", body: "Peripheral note", priority: 5 },
  ],
  goal_pulse: goalPulse,
};

test("intelligenceBriefVisibleSections filters sections against settings", () => {
  assert.deepEqual(
    intelligenceBriefVisibleSections(brief, {
      show_goal_pulse: false,
      show_agent_offer: true,
      show_ambient: false,
    }).map((section) => section.type),
    ["context", "agent_offer"],
  );
});

test("intelligenceBriefCollapsedGoalPulse trims collapsed pills to the requested limit", () => {
  assert.deepEqual(
    intelligenceBriefCollapsedGoalPulse(goalPulse, 3).map((item) => item.domain),
    ["career", "finance", "health"],
  );
});

test("loadIntelligenceBriefData skips fetches when the brief should not load", async () => {
  let called = false;
  const result = await loadIntelligenceBriefData(
    { settingsEnabled: false, signedIn: true },
    {
      async fetchBriefToday() {
        called = true;
        return null;
      },
      async fetchActiveGoalsPulse() {
        called = true;
        return [];
      },
      async queueBriefOffer() {
        called = true;
      },
    },
  );

  assert.equal(called, false);
  assert.deepEqual(result, {
    shouldLoad: false,
    brief: null,
    goalPulse: [],
    briefErrorMessage: null,
    goalPulseErrorMessage: null,
  });
});

test("loadIntelligenceBriefData loads both resources and preserves one-sided failures", async () => {
  const result = await loadIntelligenceBriefData(
    { settingsEnabled: true, signedIn: true, goalLimit: 4 },
    {
      async fetchBriefToday() {
        return brief;
      },
      async fetchActiveGoalsPulse(limit?: number) {
        assert.equal(limit, 4);
        throw new Error("temporarily unavailable");
      },
      async queueBriefOffer() {},
    },
  );

  assert.equal(result.shouldLoad, true);
  assert.equal(result.brief?.brief_id, "brief-1");
  assert.deepEqual(result.goalPulse, []);
  assert.equal(result.briefErrorMessage, null);
  assert.equal(result.goalPulseErrorMessage, "temporarily unavailable");
});

test("runIntelligenceBriefOfferAction opens workflows immediately when no brief id exists", async () => {
  let queued = false;
  const result = await runIntelligenceBriefOfferAction(undefined, "draft_plan", {
    async fetchBriefToday() {
      return null;
    },
    async fetchActiveGoalsPulse() {
      return [];
    },
    async queueBriefOffer() {
      queued = true;
    },
  });

  assert.deepEqual(result, { openView: "workflows", queued: false });
  assert.equal(queued, false);
});

test("runIntelligenceBriefOfferAction queues the offer before opening workflows", async () => {
  const calls: string[] = [];
  const result = await runIntelligenceBriefOfferAction("brief-9", "draft_plan", {
    async fetchBriefToday() {
      return null;
    },
    async fetchActiveGoalsPulse() {
      return [];
    },
    async queueBriefOffer(briefId: string, intent: string) {
      calls.push(`${briefId}:${intent}`);
    },
  });

  assert.deepEqual(result, { openView: "workflows", queued: true });
  assert.deepEqual(calls, ["brief-9:draft_plan"]);
});
