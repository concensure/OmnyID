import test from "node:test";
import assert from "node:assert/strict";

import { decisionOsTrustLaneState } from "../src/lib/decisionOsTrustLaneState.ts";

test("decisionOsTrustLaneState preserves undo-ready trust copy with stable ASCII quoting", () => {
  assert.deepEqual(
    decisionOsTrustLaneState({
      simulatorPreviewLane: null,
      provenanceCount: 0,
      actionAuditCount: 2,
      failedAuditCount: 0,
      pendingAuditCount: 0,
      successfulAuditCount: 2,
      reversibleActionCount: 3,
      undoReadyActionCount: 1,
      latestProvenanceActionType: null,
      latestAuditStatus: "",
      latestUndoLabel: "Undo calendar hold",
      fieldCalibrationNote: "Field calibration remains steady.",
    }),
    {
      title: "1 reversible action undo-ready",
      detail:
        "3 reversible actions are in audit history, most recently offering \"Undo calendar hold\". Field calibration remains steady.",
      badge: "undo-ready",
      reason: "reversible audit boundary available",
    },
  );
});

test("decisionOsTrustLaneState prefers simulator preview detail when no undo-ready action exists", () => {
  assert.deepEqual(
    decisionOsTrustLaneState({
      simulatorPreviewLane: {
        title: "Simulator reversible preview ready",
        detail:
          "Preview a reversible internal change. This remains a bounded preview and does not execute external work.",
        reason: "bounded simulator reversible preview available",
        sourceSummary: "Based on 1 source",
        consequencePreview: "Undo would remove the temporary hold.",
        provenanceCue: "Traceable to append-only continuity artifacts.",
        rolloutSummary: "Rollout stage: review. Calibration mode: bounded deterministic.",
      },
      provenanceCount: 2,
      actionAuditCount: 3,
      failedAuditCount: 0,
      pendingAuditCount: 1,
      successfulAuditCount: 3,
      reversibleActionCount: 2,
      undoReadyActionCount: 0,
      latestProvenanceActionType: "calendar_hold",
      latestAuditStatus: "waiting",
      latestUndoLabel: null,
      fieldCalibrationNote: null,
    }),
    {
      title: "Simulator reversible preview ready",
      detail:
        "Preview a reversible internal change. This remains a bounded preview and does not execute external work. Rollout stage: review. Calibration mode: bounded deterministic. Based on 1 source Undo would remove the temporary hold. Traceable to append-only continuity artifacts.",
      badge: "preview",
      reason: "bounded simulator reversible preview available",
    },
  );
});

test("decisionOsTrustLaneState accepts fusion simulator preview detail on the shared trust lane", () => {
  assert.deepEqual(
    decisionOsTrustLaneState({
      simulatorPreviewLane: {
        title: "Simulator conflict fusion ready",
        detail:
          "One bounded comparison keeps approval and reversible paths together without executing external work.",
        reason: "bounded simulator fusion preview available",
        sourceSummary: "Based on 2 sources",
      },
      provenanceCount: 1,
      actionAuditCount: 2,
      failedAuditCount: 0,
      pendingAuditCount: 0,
      successfulAuditCount: 2,
      reversibleActionCount: 1,
      undoReadyActionCount: 0,
      latestProvenanceActionType: "send_summary",
      latestAuditStatus: "",
      latestUndoLabel: null,
      fieldCalibrationNote: null,
    }),
    {
      title: "Simulator conflict fusion ready",
      detail:
        "One bounded comparison keeps approval and reversible paths together without executing external work. Based on 2 sources",
      badge: "preview",
      reason: "bounded simulator fusion preview available",
    },
  );
});
