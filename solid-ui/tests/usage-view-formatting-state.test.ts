import assert from "node:assert/strict";
import test from "node:test";

import {
  joinUsageSummaryParts,
  readArtifactSourceSummaryLine,
  readUsageCategorySummaryLine,
  readUsageQuantitySummaryLine,
  readRuntimeRemediationPressureLine,
  readRuntimeRemediationReceiptMetaLine,
  readUsageEventSummaryLine,
} from "../src/lib/usageViewFormattingState.ts";

test("joinUsageSummaryParts drops blank segments and joins with a stable separator", () => {
  assert.equal(
    joinUsageSummaryParts(["issued cleanup receipt", "2026-08-30 10:00", "", null, "operator"]),
    "issued cleanup receipt | 2026-08-30 10:00 | operator",
  );
});

test("readRuntimeRemediationReceiptMetaLine formats the action and issued timestamp", () => {
  assert.equal(
    readRuntimeRemediationReceiptMetaLine({
      action: "issue_cleanup_receipt",
      issuedAtLabel: "8/30/2026, 8:00:00 PM",
    }),
    "issue cleanup receipt | 8/30/2026, 8:00:00 PM",
  );
});

test("readRuntimeRemediationPressureLine includes cleanup mode only when mounted", () => {
  assert.equal(
    readRuntimeRemediationPressureLine({
      pressureTotalRows: 19800,
      cleanupMode: "dry_run",
    }),
    "19,800 pressure rows | Cleanup mode: dry_run",
  );
  assert.equal(
    readRuntimeRemediationPressureLine({
      pressureTotalRows: null,
      cleanupMode: null,
    }),
    "Pressure rows unavailable",
  );
});

test("readUsageEventSummaryLine joins usage quantity, category, and source", () => {
  assert.equal(
    readUsageEventSummaryLine({
      quantityLabel: "42",
      usageUnit: "queries",
      billingCategory: "search",
      source: "tavily",
    }),
    "42 queries | search | tavily",
  );
  assert.equal(
    readUsageEventSummaryLine({
      quantityLabel: "1",
      usageUnit: "",
      billingCategory: "news",
      source: null,
    }),
    "1 | news",
  );
});

test("readUsageQuantitySummaryLine trims the optional usage unit", () => {
  assert.equal(
    readUsageQuantitySummaryLine({
      quantityLabel: "42",
      usageUnit: "queries",
    }),
    "42 queries",
  );
  assert.equal(
    readUsageQuantitySummaryLine({
      quantityLabel: "1",
      usageUnit: "",
    }),
    "1",
  );
});

test("readUsageCategorySummaryLine formats quantity and event count together", () => {
  assert.equal(
    readUsageCategorySummaryLine({
      quantityLabel: "42",
      usageUnit: "units",
      eventCount: 3,
    }),
    "42 units | across 3 events",
  );
  assert.equal(
    readUsageCategorySummaryLine({
      quantityLabel: "1",
      usageUnit: null,
      eventCount: 1,
    }),
    "1 units | across 1 event",
  );
});

test("readArtifactSourceSummaryLine joins artifact and source details only when present", () => {
  assert.equal(
    readArtifactSourceSummaryLine({
      artifactUpdatedLabel: "8/30/2026, 8:00:00 PM",
      source: "operator",
    }),
    "Artifact updated 8/30/2026, 8:00:00 PM. | Source: operator",
  );
  assert.equal(
    readArtifactSourceSummaryLine({
      artifactUpdatedLabel: null,
      source: "runtime lane",
    }),
    "Source: runtime lane",
  );
});
