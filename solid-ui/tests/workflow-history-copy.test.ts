import assert from "node:assert/strict";
import test from "node:test";

import {
  joinWorkflowHistorySegments,
  workflowHistoryPauseResumeLabel,
  workflowHistoryReplayDiffDetailText,
  workflowHistoryReplayDriftLabel,
  workflowHistoryStartedText,
} from "../src/lib/workflowHistoryCopy.ts";

test("joinWorkflowHistorySegments skips empty items and uses the canonical separator", () => {
  assert.equal(
    joinWorkflowHistorySegments(["started 2h ago", null, "Aug 18, 2026, 10:00:00 AM", ""]),
    "started 2h ago · Aug 18, 2026, 10:00:00 AM",
  );
});

test("workflowHistoryPauseResumeLabel formats singular and plural wait-chain summaries", () => {
  assert.equal(workflowHistoryPauseResumeLabel(1, 0), "1 pause");
  assert.equal(workflowHistoryPauseResumeLabel(2, 1), "2 pauses · 1 resume");
});

test("workflowHistoryReplayDiffDetailText formats deployment differences consistently", () => {
  assert.equal(
    workflowHistoryReplayDiffDetailText([
      { current: "manual", field: "approval_mode", next: "auto" },
      { current: null, field: "timeout_ms", next: "5000" },
    ]),
    "approval mode manual -> auto · timeout ms unset -> 5000",
  );
});

test("workflowHistoryStartedText combines relative and absolute timestamps", () => {
  assert.equal(
    workflowHistoryStartedText("2h ago", "Aug 18, 2026, 10:00:00 AM"),
    "started 2h ago · Aug 18, 2026, 10:00:00 AM",
  );
});

test("workflowHistoryReplayDriftLabel formats replay drift counts", () => {
  assert.equal(workflowHistoryReplayDriftLabel(2, 3), "2 node drift · 3 edge drift");
});
