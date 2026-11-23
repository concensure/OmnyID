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

test("buildWeddingOracleReleaseGateReadinessState rejects placeholder proof references", () => {
  const state = buildWeddingOracleReleaseGateReadinessState({
    releaseReadinessPassed: true,
    releaseReadinessRef: "http://audit.omnyid.com/release",
    productionGoNoGoPassed: true,
    productionGoNoGoRef: "http://127.0.0.1:8787/go-no-go",
    backupVerified: true,
    backupVerificationRef: "https://0.0.0.0/backup",
    restoreDrillPassed: true,
    restoreDrillRef: "https://[::1]/restore",
    secretsSynced: true,
    secretsSyncRef: "...",
    remoteProofPassed: true,
    remoteProofRef: "oracle-remote:mock:latest",
    proofAgeHours: 1,
    proofReferencePolicy: "required",
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.deepEqual(state.proofReferenceLabels, []);
  assert.equal(
    state.blockerLabels.filter((label) => /remote HTTPS proof link/i.test(label)).length,
    6,
  );
  assert.ok(state.nextActionLabels.some((label) => /Attach durable proof references/i.test(label)));
});

test("buildWeddingOracleReleaseGateReadinessState rejects test proof tokens but allows smoke receipts", () => {
  const blocked = buildWeddingOracleReleaseGateReadinessState({
    releaseReadinessPassed: true,
    releaseReadinessRef: "release:prod-smoke:2026-09-28",
    productionGoNoGoPassed: true,
    productionGoNoGoRef: "go-no-go:test:latest",
    backupVerified: true,
    backupVerificationRef: "backup:prod-smoke:2026-09-28",
    restoreDrillPassed: true,
    restoreDrillRef: "restore:prod-smoke:2026-09-28",
    secretsSynced: true,
    secretsSyncRef: "secret-sync:prod-smoke:2026-09-28",
    remoteProofPassed: true,
    remoteProofRef: "oracle-remote:prod-smoke:2026-09-28",
    proofAgeHours: 1,
    proofReferencePolicy: "required",
  });

  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.blockerLabels.some((label) => /Production go\/no-go gate proof reference/i.test(label)));
  assert.ok(blocked.proofReferenceLabels.every((label) => !/go-no-go:test/i.test(label)));
  assert.ok(blocked.proofReferenceLabels.some((label) => /release:prod-smoke/i.test(label)));

  const ready = buildWeddingOracleReleaseGateReadinessState({
    releaseReadinessPassed: true,
    releaseReadinessRef: "release:prod-smoke:2026-09-28",
    productionGoNoGoPassed: true,
    productionGoNoGoRef: "go-no-go:prod-smoke:2026-09-28",
    backupVerified: true,
    backupVerificationRef: "backup:prod-smoke:2026-09-28",
    restoreDrillPassed: true,
    restoreDrillRef: "restore:prod-smoke:2026-09-28",
    secretsSynced: true,
    secretsSyncRef: "secret-sync:prod-smoke:2026-09-28",
    remoteProofPassed: true,
    remoteProofRef: "oracle-remote:prod-smoke:2026-09-28",
    proofAgeHours: 1,
    proofReferencePolicy: "required",
  });

  assert.equal(ready.status, "ready");
  assert.ok(ready.proofReferenceLabels.some((label) => /go-no-go:prod-smoke/i.test(label)));
});

test("buildWeddingOracleReleaseGateReadinessState bounds noisy target and proof labels", () => {
  const longRemoteProof = `oracle-remote:prod-1:${"proof-".repeat(60)}`;
  const state = buildWeddingOracleReleaseGateReadinessState({
    releaseReadinessPassed: true,
    releaseReadinessRef: `release:${"receipt-".repeat(60)}`,
    productionGoNoGoPassed: true,
    productionGoNoGoRef: `go-no-go:${"approval-".repeat(60)}`,
    backupVerified: true,
    backupVerificationRef: `backup:${"snapshot-".repeat(60)}`,
    restoreDrillPassed: true,
    restoreDrillRef: "restore:ok",
    secretsSynced: true,
    secretsSyncRef: "secret-sync:ok",
    remoteProofPassed: true,
    remoteProofRef: longRemoteProof,
    targetLabel: `  Oracle   ${"production ".repeat(40)} `,
    proofAgeHours: 1,
    proofReferencePolicy: "required",
  });

  assert.equal(state.status, "ready");
  assert.ok(state.summary.startsWith("Oracle production"));
  assert.ok(state.evidenceLabels.every((label) => label.length <= 240));
  assert.ok(state.proofReferenceLabels.every((label) => label.length <= 240));
  assert.ok(state.proofReferenceLabels.some((label) => label.startsWith("Oracle remote proof: oracle-remote:prod-1")));
  assert.ok(state.proofReferenceLabels.some((label) => label.endsWith("...")));
});
