import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingApprovalUiReadinessState } from "@/lib/weddingApprovalUiReadinessState";
import { WEDDING_PRODUCTION_LABEL_MAX_LENGTH } from "@/lib/weddingProductionLabelState";

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
    proofReferenceLabels: ["approval-ui:playwright:oracle-prod-1"],
    errorCount: 0,
  });

  assert.equal(state.status, "ready");
  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.blockerLabels.length, 0);
  assert.deepEqual(state.proofReferenceLabels, ["approval-ui:playwright:oracle-prod-1"]);
  assert.ok(state.evidenceLabels.some((label) => /5\/5 required action kinds/i.test(label)));
});

test("buildWeddingApprovalUiReadinessState can require durable proof references", () => {
  const baseInput = {
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
    proofReferencePolicy: "required" as const,
    errorCount: 0,
  };
  const blocked = buildWeddingApprovalUiReadinessState(baseInput);
  const ready = buildWeddingApprovalUiReadinessState({
    ...baseInput,
    proofReferenceLabels: ["approval-ui:playwright:oracle-prod-1"],
  });

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.productionEvidenceReady, false);
  assert.ok(blocked.blockerLabels.some((label) => /Durable approval UI proof reference is missing/i.test(label)));
  assert.equal(ready.status, "ready");
  assert.equal(ready.productionEvidenceReady, true);
  assert.ok(ready.evidenceLabels.some((label) => /durable approval UI proof reference/i.test(label)));
});

test("buildWeddingApprovalUiReadinessState rejects weak proof references", () => {
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
    proofReferencePolicy: "required",
    proofReferenceLabels: [
      "receipt:local-approval-ui",
      "https://audit.example/approval-ui",
      "approval-ui:fake:latest",
      "display:approval-ui",
    ],
    errorCount: 0,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.deepEqual(state.proofReferenceLabels, []);
  assert.ok(state.blockerLabels.some((label) => /Durable approval UI proof reference is missing/i.test(label)));
});

test("buildWeddingApprovalUiReadinessState rejects test proof tokens but allows smoke receipts", () => {
  const baseInput = {
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
    proofReferencePolicy: "required" as const,
    errorCount: 0,
  };
  const blocked = buildWeddingApprovalUiReadinessState({
    ...baseInput,
    proofReferenceLabels: ["approval-ui:test:latest"],
  });
  const ready = buildWeddingApprovalUiReadinessState({
    ...baseInput,
    proofReferenceLabels: ["approval-ui:prod-smoke:2026-09-28"],
  });

  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.proofReferenceLabels, []);
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.proofReferenceLabels, ["approval-ui:prod-smoke:2026-09-28"]);
});

test("buildWeddingApprovalUiReadinessState rejects local-only proof references", () => {
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
    proofReferencePolicy: "required",
    proofReferenceLabels: [
      "approval-ui:local-only:2026-09-28",
      "approval-ui:http://localhost:5173/proof",
      "file:///tmp/approval-ui-proof.json",
    ],
    errorCount: 0,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.deepEqual(state.proofReferenceLabels, []);
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

test("buildWeddingApprovalUiReadinessState returns bounded production labels", () => {
  const state = buildWeddingApprovalUiReadinessState({
    approvalControlsRendered: true,
    testedActionKinds: [...actionKinds, ...actionKinds, "  send_email  "],
    errorCount: 9999,
  });

  assert.ok(state.evidenceLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.ok(state.blockerLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.equal(
    state.evidenceLabels.filter((label) => /required action kinds tested/i.test(label)).length,
    1,
  );
});
