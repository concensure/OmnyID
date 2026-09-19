import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingWorkspaceRefreshScaleProofPacketState } from "@/lib/weddingWorkspaceRefreshScaleProofPacketState";
import { buildWeddingWorkspaceRefreshScaleProofState } from "@/lib/weddingWorkspaceRefreshScaleProofState";

test("workspace refresh scale proof packet clears only complete durable proof", () => {
  const scaleProof = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 3,
    totalLoaded: 240,
    maxPageMs: 820,
    pageOffsets: [0, 96, 192],
    duplicateMessageIds: [],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
    proofReferencePolicy: "required",
    proofRef: "refresh-scale:oracle-prod-1:2026-09-15",
  });
  const packet = buildWeddingWorkspaceRefreshScaleProofPacketState(scaleProof);

  assert.equal(packet.status, "ready");
  assert.equal(packet.canClearBackendScaleGate, true);
  assert.deepEqual(packet.missingEvidenceLabels, []);
  assert.ok(packet.requirements.every((requirement) => requirement.status === "ready"));
  assert.ok(packet.requirements.some((requirement) => (
    requirement.kind === "proof_ref" &&
    requirement.evidenceLabel === "Scale proof reference: refresh-scale:oracle-prod-1:2026-09-15"
  )));
});

test("workspace refresh scale proof packet fails closed when proof receipt is required but missing", () => {
  const scaleProof = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 2,
    totalLoaded: 160,
    maxPageMs: 700,
    pageOffsets: [0, 96],
    duplicateMessageIds: [],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
    proofReferencePolicy: "required",
  });
  const packet = buildWeddingWorkspaceRefreshScaleProofPacketState(scaleProof);

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearBackendScaleGate, false);
  assert.ok(packet.missingEvidenceLabels.includes("Durable scale-proof receipt: evidence required"));
  assert.ok(packet.nextActionLabels.some((label) => /scale-proof receipt/i.test(label)));
});

test("workspace refresh scale proof packet points to incomplete pagination evidence", () => {
  const scaleProof = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 120,
    pageCount: 1,
    totalLoaded: 12,
    maxPageMs: 3100,
    pageOffsets: [0, 120],
    duplicateMessageIds: ["msg_1"],
    errorCount: 1,
    hasMoreAfterFinalPage: true,
  });
  const packet = buildWeddingWorkspaceRefreshScaleProofPacketState(scaleProof);

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearBackendScaleGate, false);
  assert.ok(packet.requirements.some((requirement) => requirement.kind === "page_size" && requirement.status === "blocked"));
  assert.ok(packet.requirements.some((requirement) => requirement.kind === "multi_page" && requirement.status === "blocked"));
  assert.ok(packet.requirements.some((requirement) => requirement.kind === "dedupe" && /msg_1/.test(requirement.blockerLabel ?? "")));
  assert.ok(packet.missingEvidenceLabels.some((label) => /Refresh latency/i.test(label)));
});
