import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingOracleReleaseGateReadinessState } from "@/lib/weddingOracleReleaseGateReadinessState";
import { buildWeddingOracleReleaseProofPacketState } from "@/lib/weddingOracleReleaseProofPacketState";

test("Oracle release proof packet summarizes missing release evidence", () => {
  const gate = buildWeddingOracleReleaseGateReadinessState({
    releaseReadinessPassed: false,
    productionGoNoGoPassed: true,
    backupVerified: false,
    restoreDrillPassed: false,
    secretsSynced: true,
    remoteProofPassed: false,
    targetLabel: "oracle-prod-1",
  });
  const packet = buildWeddingOracleReleaseProofPacketState(gate);

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearOracleReleaseGate, false);
  assert.match(packet.summary, /Oracle upload remains blocked/i);
  assert.ok(packet.requirements.some((requirement) => (
    requirement.kind === "release_readiness" &&
    requirement.status === "blocked" &&
    /release-readiness/i.test(requirement.blockerLabel ?? "")
  )));
  assert.ok(packet.missingProofLabels.includes("Fresh Oracle remote proof: proof receipt required"));
  assert.ok(packet.nextActionLabels.some((label) => /release-readiness checks/i.test(label)));
  assert.ok(packet.runbookLabels.some((label) => /file-backed secrets/i.test(label)));
});

test("Oracle release proof packet blocks stale remote proof", () => {
  const gate = buildWeddingOracleReleaseGateReadinessState({
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
    remoteProofRef: "oracle-remote:old",
    proofAgeHours: 36,
    maxProofAgeHours: 24,
    proofReferencePolicy: "required",
  });
  const packet = buildWeddingOracleReleaseProofPacketState(gate);
  const remoteProof = packet.requirements.find((requirement) => requirement.kind === "remote_proof");

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearOracleReleaseGate, false);
  assert.equal(remoteProof?.status, "blocked");
  assert.equal(remoteProof?.proofRef, "oracle-remote:old");
  assert.match(remoteProof?.blockerLabel ?? "", /stale/i);
  assert.ok(remoteProof?.nextActionLabel?.includes("Refresh stale Oracle remote proof"));
});

test("Oracle release proof packet blocks passed gates without durable proof refs", () => {
  const gate = buildWeddingOracleReleaseGateReadinessState({
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
  const packet = buildWeddingOracleReleaseProofPacketState(gate);
  const goNoGo = packet.requirements.find((requirement) => requirement.kind === "production_go_no_go");

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearOracleReleaseGate, false);
  assert.equal(goNoGo?.status, "blocked");
  assert.equal(goNoGo?.proofRef, null);
  assert.ok(packet.missingProofLabels.includes("Production go/no-go approval: proof receipt required"));
});

test("Oracle release proof packet rejects local and browser-only proof references", () => {
  const gate = buildWeddingOracleReleaseGateReadinessState({
    releaseReadinessPassed: true,
    releaseReadinessRef: "receipt:local-release-1",
    productionGoNoGoPassed: true,
    productionGoNoGoRef: "http://localhost:8787/go-no-go",
    backupVerified: true,
    backupVerificationRef: "file:///tmp/backup-proof.txt",
    restoreDrillPassed: true,
    restoreDrillRef: "restore:ok",
    secretsSynced: true,
    secretsSyncRef: "secret-sync:ok",
    remoteProofPassed: true,
    remoteProofRef: "oracle-remote:ok",
    proofAgeHours: 1,
    proofReferencePolicy: "required",
  });
  const packet = buildWeddingOracleReleaseProofPacketState(gate);

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearOracleReleaseGate, false);
  assert.equal(packet.requirements.find((requirement) => requirement.kind === "release_readiness")?.proofRef, null);
  assert.equal(packet.requirements.find((requirement) => requirement.kind === "production_go_no_go")?.proofRef, null);
  assert.equal(packet.requirements.find((requirement) => requirement.kind === "backup_verification")?.proofRef, null);
  assert.ok(packet.requirements.some((requirement) => (
    requirement.kind === "release_readiness" &&
    /not a local receipt/i.test(requirement.blockerLabel ?? "")
  )));
  assert.ok(packet.missingProofLabels.includes("Repository release-readiness: proof receipt required"));
  assert.ok(packet.missingProofLabels.includes("Production go/no-go approval: proof receipt required"));
  assert.ok(packet.missingProofLabels.includes("Backup verification: proof receipt required"));
});

test("Oracle release proof packet clears gate only with all proof refs", () => {
  const gate = buildWeddingOracleReleaseGateReadinessState({
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
  const packet = buildWeddingOracleReleaseProofPacketState(gate);

  assert.equal(packet.status, "ready");
  assert.equal(packet.canClearOracleReleaseGate, true);
  assert.deepEqual(packet.missingProofLabels, []);
  assert.deepEqual(packet.requirements.map((requirement) => requirement.status), [
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
  ]);
  assert.ok(packet.requirements.some((requirement) => (
    requirement.kind === "production_go_no_go" &&
    requirement.proofRef === "go-no-go:ok"
  )));
});
