import assert from "node:assert/strict";
import test from "node:test";

import {
  readExternalToolCostTrustPanelModel,
  readExternalToolEstimateDetail,
  readExternalToolMeasurementLabel,
  readExternalToolRetentionDetail,
  readExternalToolSettlementLabel,
} from "../src/lib/externalToolBillingCoverageState.ts";

test("readExternalToolSettlementLabel humanizes settlement state and falls back safely", () => {
  assert.equal(readExternalToolSettlementLabel("invoice_pending"), "invoice pending");
  assert.equal(readExternalToolSettlementLabel(" "), "not settled");
});

test("readExternalToolMeasurementLabel humanizes measurement state and falls back safely", () => {
  assert.equal(readExternalToolMeasurementLabel("provider_estimated"), "provider estimated");
  assert.equal(readExternalToolMeasurementLabel(null), "estimated usage");
});

test("readExternalToolEstimateDetail prefers mounted coverage summary then month start fallback", () => {
  assert.equal(
    readExternalToolEstimateDetail({
      coverageSummary: "Provider estimates only. Final invoice may differ.",
      currentMonthStartLabel: "8/1/2026",
    }),
    "Provider estimates only. Final invoice may differ.",
  );
  assert.equal(
    readExternalToolEstimateDetail({
      coverageSummary: " ",
      currentMonthStartLabel: "8/1/2026",
    }),
    "Estimated usage cost since 8/1/2026. This is not yet invoice-grade billing.",
  );
});

test("readExternalToolRetentionDetail formats combined, single-axis, and default retention copy", () => {
  assert.equal(
    readExternalToolRetentionDetail({
      maxEventAgeDays: 30,
      maxEventRowsPerUser: 5000,
    }),
    "Rolling retention keeps about the most recent 5,000 events per user and prunes events older than 30 days.",
  );
  assert.equal(
    readExternalToolRetentionDetail({
      maxEventAgeDays: 14,
      maxEventRowsPerUser: null,
    }),
    "Rolling retention prunes usage events older than 14 days.",
  );
  assert.equal(
    readExternalToolRetentionDetail({
      maxEventAgeDays: null,
      maxEventRowsPerUser: 250,
    }),
    "Rolling retention keeps about the most recent 250 events per user.",
  );
  assert.equal(
    readExternalToolRetentionDetail({
      maxEventAgeDays: 0,
      maxEventRowsPerUser: 0,
    }),
    "Usage-event history is retained on a rolling basis rather than forever.",
  );
});

test("readExternalToolCostTrustPanelModel centralizes trust guidance copy and merges caveats", () => {
  assert.deepEqual(
    readExternalToolCostTrustPanelModel({
      estimateDetail: "Estimated usage cost since 8/1/2026. This is not yet invoice-grade billing.",
      guidanceCoverage: [
        "Storage quota and remaining capacity come from mounted billing status.",
        "Hosted AI budget tracking is included.",
      ],
      guidanceCaveats: [
        "Some provider paths may land later.",
      ],
      externalCoverageCaveats: [
        " Firecrawl invoice exports are not linked yet. ",
        "",
      ],
    }),
    {
      heading: "How to read these numbers",
      detail: "Estimated usage cost since 8/1/2026. This is not yet invoice-grade billing.",
      coverageTitle: "What is covered",
      coverageItems: [
        "Storage quota and remaining capacity come from mounted billing status.",
        "Hosted AI budget tracking is included.",
      ],
      caveatsTitle: "What may still lag",
      caveatItems: [
        "Some provider paths may land later.",
        "Firecrawl invoice exports are not linked yet.",
      ],
    },
  );
});
