import assert from "node:assert/strict";
import test from "node:test";

import { workflowDescribeHistoryTimestampLabel } from "../src/lib/workflowDeploymentHelpers.ts";
import { workflowSavedReviewSavedAtLabel, workflowRailVersionTimeLabel } from "../src/lib/workflowRailState.ts";
import { formatTimelineStamp } from "../src/lib/workflowRunAnalysis.ts";

test("workflow shared timestamp helpers use stable surface formatting", () => {
  const timestamp = "2026-09-01T04:05:00Z";

  assert.equal(workflowDescribeHistoryTimestampLabel(timestamp), "Sep 1, 2026, 2:05 PM");
  assert.equal(workflowSavedReviewSavedAtLabel(timestamp), "Sep 1, 2026, 2:05 PM");
  assert.equal(workflowRailVersionTimeLabel(timestamp), "2:05 PM");
  assert.equal(formatTimelineStamp(timestamp), "Sep 1, 2026, 2:05 PM");
});

test("workflow shared timestamp helpers preserve defensive fallbacks", () => {
  assert.equal(workflowDescribeHistoryTimestampLabel("invalid"), "invalid");
  assert.equal(workflowSavedReviewSavedAtLabel("invalid"), "invalid");
  assert.equal(workflowSavedReviewSavedAtLabel(null), null);
  assert.equal(workflowRailVersionTimeLabel("invalid"), "unknown");
  assert.equal(formatTimelineStamp("invalid"), null);
});
