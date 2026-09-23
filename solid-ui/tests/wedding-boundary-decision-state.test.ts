import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingBoundaryRequestDecision } from "@/lib/weddingBoundaryDecisionState";
import { weddingBoundaryLedgerObjectToAfpSendInput } from "@/lib/weddingBoundaryLedgerState";
import type { WeddingBoundaryChangeRequest } from "@/lib/weddingBoundaryLedgerState";

const request: WeddingBoundaryChangeRequest = {
  id: "request:plus-one-for-taylor",
  kind: "wedding_boundary_change_request",
  title: "Add a plus-one for Taylor",
  visibility: "approved_shared",
  requestId: "request:plus-one-for-taylor",
  requestedBy: "person:janet",
  changeType: "plus_one_change",
  targetPersonId: "person:taylor",
  requestStatus: "pending",
  approvalRequired: true,
  policyIds: ["policy:no-extra-plus-ones"],
  publicReason: "Taylor may not know many people.",
  privateRationaleCiphertext: "sealed:original-private-note",
};

test("buildWeddingBoundaryRequestDecision approves a pending request without leaving it approval gated", () => {
  const result = buildWeddingBoundaryRequestDecision({
    request,
    decision: "approve",
    decidedBy: "person:alex",
    decidedAt: "2026-09-24T08:00:00.000Z",
    publicReason: "Approved because the venue count still works.",
  });

  assert.equal(result.updatedRequest.requestStatus, "approved");
  assert.equal(result.updatedRequest.status, "approved");
  assert.equal(result.updatedRequest.approvalRequired, false);
  assert.equal(result.updatedRequest.publicReason, "Approved because the venue count still works.");
  assert.equal(result.updatedRequest.metadata?.decision, "approve");
  assert.equal(result.rationale, null);
  assert.match(result.statusLabel, /approved/i);
});

test("buildWeddingBoundaryRequestDecision records declined requests with encrypted couple-only rationale", () => {
  const result = buildWeddingBoundaryRequestDecision({
    request,
    decision: "decline",
    decidedBy: "person:sam",
    decidedAt: "2026-09-24T09:00:00.000Z",
    publicReason: "We are keeping the guest count fixed.",
    privateRationaleCiphertext: "sealed:budget-and-family-context",
  });

  assert.equal(result.updatedRequest.requestStatus, "declined");
  assert.equal(result.updatedRequest.approvalRequired, false);
  assert.equal(result.rationale?.visibility, "couple_only");
  assert.equal(result.rationale?.rationaleCiphertext, "sealed:budget-and-family-context");
  assert.equal(result.rationale?.summaryPublic, "We are keeping the guest count fixed.");
  assert.equal(result.rationale?.metadata?.boundary_request_id, request.requestId);

  const sendInput = weddingBoundaryLedgerObjectToAfpSendInput(result.rationale!, {
    weddingPlanId: "wedding_plan:harbour",
    responseWorkspaceId: "response_workspace:harbour",
  });
  assert.equal(sendInput.type, "ledger");
  assert.equal(sendInput.kind, "wedding_boundary_decision_rationale");
  assert.equal(sendInput.metadata?.e2ee_required, true);
  assert.deepEqual(sendInput.metadata?.private_fields, ["encrypted_private_payload"]);
  assert.equal(sendInput.content.encrypted_private_payload, "sealed:budget-and-family-context");
});

test("buildWeddingBoundaryRequestDecision does not overwrite an already recorded request", () => {
  const approvedRequest: WeddingBoundaryChangeRequest = {
    ...request,
    status: "approved",
    requestStatus: "approved",
    approvalRequired: false,
    publicReason: "Already approved.",
  };

  const result = buildWeddingBoundaryRequestDecision({
    request: approvedRequest,
    decision: "decline",
    publicReason: "Late conflicting click.",
    privateRationaleCiphertext: "sealed:should-not-save",
  });

  assert.equal(result.updatedRequest, approvedRequest);
  assert.equal(result.updatedRequest.requestStatus, "approved");
  assert.equal(result.updatedRequest.publicReason, "Already approved.");
  assert.equal(result.rationale, null);
  assert.match(result.statusLabel, /already recorded/i);
});
