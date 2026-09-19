import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingApprovalUiReadinessState } from "@/lib/weddingApprovalUiReadinessState";

const actionKinds = [
  "send_email",
  "contact_vendor",
  "create_external_calendar_event",
  "share_artifact",
  "export_sensitive_bundle",
];

test("buildWeddingApprovalUiReadinessState passes complete approval UI evidence", () => {
  const state = buildWeddingApprovalUiReadinessState({
    approvalControlsRendered: true,
    rejectionControlsRendered: true,
    executionControlRendered: true,
    disclosurePreviewRendered: true,
    riskLabelsRendered: true,
    providerSetupRoutingRendered: true,
    durableReceiptProjectionReady: true,
    failureCopyRendered: true,
    keyboardFallbackReady: true,
    blockedStatePreventsExecution: true,
    testedActionKinds: actionKinds,
    errorCount: 0,
  });

  assert.equal(state.status, "ready");
  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.blockerLabels.length, 0);
  assert.ok(state.evidenceLabels.some((label) => /5\/5 required action kinds/i.test(label)));
});

test("buildWeddingApprovalUiReadinessState reports partial existing approval evidence", () => {
  const state = buildWeddingApprovalUiReadinessState({
    approvalControlsRendered: true,
    durableReceiptProjectionReady: true,
    blockedStatePreventsExecution: true,
    testedActionKinds: ["send_email"],
  });

  assert.equal(state.status, "partial");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /partial evidence/i);
  assert.ok(state.blockerLabels.some((label) => /Disclosure preview/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Required action kinds not tested/i.test(label)));
});

test("buildWeddingApprovalUiReadinessState blocks unsafe approval surfaces", () => {
  const state = buildWeddingApprovalUiReadinessState({
    approvalControlsRendered: false,
    disclosurePreviewRendered: false,
    blockedStatePreventsExecution: false,
    testedActionKinds: [],
    errorCount: 2,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /Approval controls/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Blocked requests/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /2 approval UI errors/i.test(label)));
});
