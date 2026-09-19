import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingOracleReleaseGateReadinessState,
} from "@/lib/weddingOracleReleaseGateReadinessState";

test("buildWeddingOracleReleaseGateReadinessState passes complete fresh Oracle proof", () => {
  const state = buildWeddingOracleReleaseGateReadinessState({
    releaseReadinessPassed: true,
    productionGoNoGoPassed: true,
    backupVerified: true,
    restoreDrillPassed: true,
    secretsSynced: true,
    secretsSyncRef: "vault-sync:2026-09-14",
    remoteProofPassed: true,
    remoteProofRef: "oracle-proof:prod-1:2026-09-14",
    targetLabel: "oracle-prod-1",
    proofAgeHours: 2,
    maxProofAgeHours: 24,
  });

  assert.equal(state.status, "ready");
  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.blockerLabels.length, 0);
  assert.match(state.summary, /oracle-prod-1 is ready/);
  assert.ok(state.evidenceLabels.some((label) => /release-readiness passed/i.test(label)));
  assert.ok(state.proofReferenceLabels.some((label) => /secret sync proof: vault-sync/i.test(label)));
  assert.equal(state.nextActionLabels.length, 0);
  assert.ok(state.runbookLabels.some((label) => /file-backed secrets/i.test(label)));
});

test("buildWeddingOracleReleaseGateReadinessState blocks missing release and recovery gates", () => {
  const state = buildWeddingOracleReleaseGateReadinessState({
    releaseReadinessPassed: false,
    productionGoNoGoPassed: true,
    backupVerified: false,
    restoreDrillPassed: false,
    secretsSynced: true,
    remoteProofPassed: false,
    targetLabel: "oracle-prod-1",
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /release-readiness gate/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Backup verification/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Restore drill/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Oracle remote proof/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /release-readiness checks/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /restore drill/i.test(label)));
});

test("buildWeddingOracleReleaseGateReadinessState blocks stale remote proof", () => {
  const state = buildWeddingOracleReleaseGateReadinessState({
    releaseReadinessPassed: true,
    productionGoNoGoPassed: true,
    backupVerified: true,
    restoreDrillPassed: true,
    secretsSynced: true,
    remoteProofPassed: true,
    proofAgeHours: 36,
    maxProofAgeHours: 24,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /stale/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Refresh stale Oracle remote proof/i.test(label)));
});

test("buildWeddingOracleReleaseGateReadinessState can require durable proof references", () => {
  const blocked = buildWeddingOracleReleaseGateReadinessState({
    releaseReadinessPassed: true,
    releaseReadinessRef: "release:ok",
    productionGoNoGoPassed: true,
    backupVerified: true,
    backupVerificationRef: "backup:ok",
    restoreDrillPassed: true,
    restoreDrillRef: "restore:ok",
    secretsSynced: true,
    secretsSyncRef: "secret-sync:ok",
    remoteProofPassed: true,
    remoteProofRef: "oracle-remote:ok",
    proofAgeHours: 1,
    proofReferencePolicy: "required",
  });

  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.blockerLabels.some((label) => /Production go\/no-go gate passed but has no durable proof reference/i.test(label)));
  assert.ok(blocked.nextActionLabels.some((label) => /Attach durable proof references/i.test(label)));

  const ready = buildWeddingOracleReleaseGateReadinessState({
    releaseReadinessPassed: true,
    releaseReadinessRef: "release:ok",
    productionGoNoGoPassed: true,
    productionGoNoGoRef: "go-no-go:ok",
    backupVerified: true,
    backupVerificationRef: "backup:ok",
    restoreDrillPassed: true,
    restoreDrillRef: "restore:ok",
    secretsSynced: true,
    secretsSyncRef: "secret-sync:ok",
    remoteProofPassed: true,
    remoteProofRef: "oracle-remote:ok",
    proofAgeHours: 1,
    proofReferencePolicy: "required",
  });

  assert.equal(ready.status, "ready");
  assert.equal(ready.productionEvidenceReady, true);
  assert.ok(ready.proofReferenceLabels.some((label) => /production go\/no-go proof: go-no-go:ok/i.test(label)));
});
