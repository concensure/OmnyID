import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardFeedActiveTypeScopeLabel,
  buildDashboardFeedAllCaughtUpSummaryParts,
} from "../src/lib/dashboardFeedSummaryState.ts";

test("buildDashboardFeedActiveTypeScopeLabel summarizes one type by label", () => {
  assert.equal(
    buildDashboardFeedActiveTypeScopeLabel(["email"], (type) => type.toUpperCase()),
    "type EMAIL",
  );
});

test("buildDashboardFeedActiveTypeScopeLabel summarizes multiple types by count", () => {
  assert.equal(
    buildDashboardFeedActiveTypeScopeLabel(["email", "task"], (type) => type),
    "2 types",
  );
});

test("buildDashboardFeedAllCaughtUpSummaryParts preserves summary order", () => {
  assert.deepEqual(
    buildDashboardFeedAllCaughtUpSummaryParts({
      dismissedCount: 2,
      snoozedCount: 1,
      activeTypeScopeLabel: "type Email",
      activeSupertag: "finance",
      activeTopicKindLabel: "Thread",
    }),
    [
      "2 cards dismissed",
      "1 snoozed",
      "type Email",
      "topic #finance",
      "kind Thread",
    ],
  );
});

test("buildDashboardFeedAllCaughtUpSummaryParts omits empty segments", () => {
  assert.deepEqual(
    buildDashboardFeedAllCaughtUpSummaryParts({
      dismissedCount: 0,
      snoozedCount: 0,
      activeTypeScopeLabel: null,
      activeSupertag: null,
      activeTopicKindLabel: null,
    }),
    [],
  );
});
