import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingCollaborationLifecycleProjectionProofState } from "@/lib/weddingCollaborationLifecycleProjectionProofState";

test("collaboration lifecycle projection proof passes only with every guarded action", () => {
  const state = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
    proofRef: "collaboration-lifecycle:prod",
  });

  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.status, "ready");
  assert.equal(state.blockerLabels.length, 0);
  assert.ok(state.evidenceLabels.includes("stale-access review projection covered"));
  assert.equal(state.proofReferenceLabel, "collaboration lifecycle proof: collaboration-lifecycle:prod");
});

test("collaboration lifecycle projection proof can require durable proof reference", () => {
  const missing = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
    proofReferencePolicy: "required",
  });
  const local = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
    proofRef: "http://localhost:8787/collaboration-proof",
    proofReferencePolicy: "required",
  });

  assert.equal(missing.productionEvidenceReady, false);
  assert.ok(missing.blockerLabels.some((label) => /proof reference is not mounted/i.test(label)));
  assert.equal(local.productionEvidenceReady, false);
  assert.equal(local.proofReferenceLabel, null);
  assert.ok(local.blockerLabels.some((label) => /not a local receipt/i.test(label)));
});

test("collaboration lifecycle projection proof fails closed on partial action coverage", () => {
  const state = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
  });

  assert.equal(state.productionEvidenceReady, false);
  assert.equal(state.status, "blocked");
  assert.deepEqual(state.missingKindLabels, ["expiry", "revocation"]);
  assert.ok(state.blockerLabels.includes("Backend grant-blocked-without-ACL proof is missing."));
  assert.ok(state.summary.includes("fail-closed"));
});
