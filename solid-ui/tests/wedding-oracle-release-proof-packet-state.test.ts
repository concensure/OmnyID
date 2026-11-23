import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingOracleReleaseGateReadinessState } from "@/lib/weddingOracleReleaseGateReadinessState";
import { buildWeddingOracleReleaseProofPacketState } from "@/lib/weddingOracleReleaseProofPacketState";
import { WEDDING_PRODUCTION_LABEL_MAX_LENGTH } from "@/lib/weddingProductionLabelState";

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
    /local, dry-run, placeholder, localhost, or browser-only/i.test(requirement.blockerLabel ?? "")
  )));
  assert.ok(packet.missingProofLabels.includes("Repository release-readiness: proof receipt required"));
  assert.ok(packet.missingProofLabels.includes("Production go/no-go approval: proof receipt required"));
  assert.ok(packet.missingProofLabels.includes("Backup verification: proof receipt required"));
});

test("Oracle release proof packet independently rejects forged weak proof labels", () => {
  const packet = buildWeddingOracleReleaseProofPacketState({
    status: "ready",
    productionEvidenceReady: true,
    evidenceLabels: [],
    blockerLabels: [],
    proofReferenceLabels: [
      "release-readiness proof: https://audit.omnyid.example/release",
      "production go/no-go proof: http://audit.omnyid.example/go-no-go",
      "backup verification proof: https://localhost/backup",
      "restore drill proof: data:application/json,{}",
      "secret sync proof: secret-sync:ok",
      "Oracle remote proof: oracle-remote:ok",
    ],
    nextActionLabels: [],
    runbookLabels: [],
    summary: "Forged ready gate.",
  });

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearOracleReleaseGate, false);
  assert.equal(packet.requirements.find((requirement) => requirement.kind === "release_readiness")?.status, "ready");
  assert.equal(packet.requirements.find((requirement) => requirement.kind === "production_go_no_go")?.proofRef, null);
  assert.equal(packet.requirements.find((requirement) => requirement.kind === "backup_verification")?.proofRef, null);
  assert.equal(packet.requirements.find((requirement) => requirement.kind === "restore_drill")?.proofRef, null);
  assert.ok(packet.requirements.some((requirement) => (
    requirement.kind === "production_go_no_go" &&
    /durable audit ID or remote HTTPS proof link/i.test(requirement.blockerLabel ?? "")
  )));
  assert.ok(packet.missingProofLabels.includes("Production go/no-go approval: proof receipt required"));
  assert.ok(packet.missingProofLabels.includes("Backup verification: proof receipt required"));
  assert.ok(packet.missingProofLabels.includes("Restore drill: proof receipt required"));
});

test("Oracle release proof packet independently rejects test proof tokens but allows smoke receipts", () => {
  const blocked = buildWeddingOracleReleaseProofPacketState({
    status: "ready",
    productionEvidenceReady: true,
    evidenceLabels: [],
    blockerLabels: [],
    proofReferenceLabels: [
      "release-readiness proof: release:prod-smoke:2026-09-28",
      "production go/no-go proof: go-no-go:test:latest",
      "backup verification proof: backup:prod-smoke:2026-09-28",
      "restore drill proof: restore:prod-smoke:2026-09-28",
      "secret sync proof: secret-sync:prod-smoke:2026-09-28",
      "Oracle remote proof: oracle-remote:prod-smoke:2026-09-28",
    ],
    nextActionLabels: [],
    runbookLabels: [],
    summary: "Forged ready gate.",
  });

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.canClearOracleReleaseGate, false);
  assert.equal(blocked.requirements.find((requirement) => requirement.kind === "production_go_no_go")?.proofRef, null);
  assert.ok(blocked.requirements.some((requirement) => (
    requirement.kind === "release_readiness" &&
    requirement.proofRef === "release:prod-smoke:2026-09-28"
  )));
  assert.ok(blocked.missingProofLabels.includes("Production go/no-go approval: proof receipt required"));

  const ready = buildWeddingOracleReleaseProofPacketState({
    status: "ready",
    productionEvidenceReady: true,
    evidenceLabels: [],
    blockerLabels: [],
    proofReferenceLabels: [
      "release-readiness proof: release:prod-smoke:2026-09-28",
      "production go/no-go proof: go-no-go:prod-smoke:2026-09-28",
      "backup verification proof: backup:prod-smoke:2026-09-28",
      "restore drill proof: restore:prod-smoke:2026-09-28",
      "secret sync proof: secret-sync:prod-smoke:2026-09-28",
      "Oracle remote proof: oracle-remote:prod-smoke:2026-09-28",
    ],
    nextActionLabels: [],
    runbookLabels: [],
    summary: "Ready gate.",
  });

  assert.equal(ready.status, "ready");
  assert.equal(ready.canClearOracleReleaseGate, true);
  assert.ok(ready.requirements.some((requirement) => (
    requirement.kind === "production_go_no_go" &&
    requirement.proofRef === "go-no-go:prod-smoke:2026-09-28"
  )));
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

test("Oracle release proof packet bounds noisy bypass labels", () => {
  const noisyProof = `release-readiness proof: release:${"x".repeat(400)}`;
  const noisyNext = `Run release-readiness checks ${"again ".repeat(90)}`;
  const packet = buildWeddingOracleReleaseProofPacketState({
    status: "blocked",
    productionEvidenceReady: false,
    evidenceLabels: [],
    blockerLabels: [
      `Repository release-readiness checks are incomplete ${"because evidence is missing ".repeat(60)}`,
    ],
    proofReferenceLabels: [noisyProof, noisyProof],
    nextActionLabels: [noisyNext, noisyNext],
    runbookLabels: [`Verify file-backed secrets ${"carefully ".repeat(80)}`],
    summary: "Oracle release gate is blocked.",
  } as any);

  assert.equal(packet.status, "blocked");
  assert.ok((packet.requirements[0]?.proofRef?.length ?? 0) <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH);
  assert.ok(packet.nextActionLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.equal(packet.nextActionLabels.length, 1);
  assert.ok(packet.runbookLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
});
