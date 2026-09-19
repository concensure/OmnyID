import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingCollaborationLifecycleProjectionProofState } from "@/lib/weddingCollaborationLifecycleProjectionProofState";
import { buildWeddingOracleReleaseGateReadinessState } from "@/lib/weddingOracleReleaseGateReadinessState";
import { buildWeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";
import { buildWeddingProductionReadinessEvidenceState } from "@/lib/weddingProductionReadinessEvidenceState";
import { buildWeddingProviderExecutorSmokeProofState } from "@/lib/weddingProviderExecutorSmokeProofState";
import { buildWeddingWorkspaceRefreshScaleProofState } from "@/lib/weddingWorkspaceRefreshScaleProofState";

const baseReadyEvidence = {
  backendPaginationContractReady: true,
  approvalUi: { productionEvidenceReady: true } as any,
  expectedBehaviorAudit: { productionBlockerLabels: [] } as any,
  importParserReadiness: { productionReady: true, blockerLabels: [] } as any,
  collaboration: { productionReady: true } as any,
  collaborationLifecycleProjectionProof: readyCollaborationLifecycleProof(),
  adminWeddingAiRoutingPolicy: {
    productionReady: true,
    proofReferenceLabels: ["admin routing policy proof: admin-routing:ok"],
    lastVerifiedLabel: "verified 2026-09-15",
  } as any,
  adminOpsBackendMetrics: {
    productionReady: true,
    evidenceLabels: ["Oracle metrics proof reference mounted: oracle-metrics:ok"],
  } as any,
};

function readyCollaborationLifecycleProof() {
  return buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
    proofReferencePolicy: "required",
    proofRef: "collaboration-lifecycle:oracle-prod-1:2026-09-15",
  });
}

function readyScaleProof() {
  return buildWeddingWorkspaceRefreshScaleProofState({
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
}

function readySmokeProof() {
  return buildWeddingProviderExecutorSmokeProofState({
    approvalReceipts: [
      {
        id: "receipt:email",
        requestId: "request:email",
        actionKind: "contact_vendor",
        title: "Contact venue",
        status: "executed",
        createdAt: "2026-09-15T00:00:00.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: { provider_executor_mode: "live", external_delivery_performed: true, external_id: "gmail:message-1" },
      },
      {
        id: "receipt:calendar",
        requestId: "request:calendar",
        actionKind: "create_external_calendar_event",
        title: "Create calendar",
        status: "executed",
        createdAt: "2026-09-15T00:00:00.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: { provider_executor_mode: "live", external_delivery_performed: true, provider_event_id: "gcal:event-1", provider_event_link: "https://calendar.example/event-1" },
      },
      {
        id: "receipt:registry",
        requestId: "request:registry",
        actionKind: "publish_registry",
        title: "Publish registry",
        status: "executed",
        createdAt: "2026-09-15T00:00:00.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: { provider_executor_mode: "live", external_delivery_performed: true, provider_receipt_id: "registry:publish-1" },
      },
    ],
    vendorSearchReceipts: [{
      proofRef: "vendor-search:smoke:oracle-prod-1",
      providerLabels: ["Brave Search"],
      sourceUrls: ["https://search.example/sydney-venues"],
      sourceUrlCount: 6,
      queryContextLabel: "Sydney venues",
    }],
  });
}

function readyReleaseGate() {
  return buildWeddingOracleReleaseGateReadinessState({
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
}

test("production go/no-go packet blocks missing proof packets", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({ strictOracleProofs: true });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canUploadToOracle, false);
  assert.ok(packet.gates.some((gate) => gate.kind === "backend_scale" && gate.status === "missing"));
  assert.ok(packet.gates.some((gate) => gate.kind === "approval_ui" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "expected_behavior" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "import_parser" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "collaboration_access" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "admin_routing_policy" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "oracle_release" && gate.status === "missing"));
  assert.deepEqual(packet.gateCounts, { ready: 0, blocked: 8, missing: 2, total: 10 });
  assert.ok(packet.blockerLabels.includes("Backend pagination contract is missing."));
  assert.ok(packet.blockerLabels.includes("Approval UI proof is missing."));
  assert.ok(packet.blockerLabels.includes("Wedding import parser readiness is missing."));
  assert.ok(packet.nextActionLabels.includes("Prove approval execution UI and receipt handling."));
  assert.ok(packet.guardrailLabels.some((label) => /Do not deploy/i.test(label)));
});

test("production go/no-go packet blocks dry-run provider proof", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: buildWeddingProviderExecutorSmokeProofState({
      requiredCapabilities: ["email"],
      approvalReceipts: [{
        id: "receipt:dry-run",
        requestId: "request:email",
        actionKind: "send_email",
        title: "Dry-run email",
        status: "executed",
        createdAt: "2026-09-15T00:00:00.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          provider_executor_mode: "dry_run",
          provider_smoke_test_only: true,
          external_delivery_performed: false,
          external_id: "omnyid:wedding_provider_dry_run:email",
        },
      }],
    }),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);

  assert.equal(packet.status, "blocked");
  assert.equal(packet.gates.find((gate) => gate.kind === "provider_executors")?.status, "blocked");
  assert.equal(packet.gates.find((gate) => gate.kind === "approval_ui")?.status, "ready");
  assert.deepEqual(packet.gateCounts, { ready: 9, blocked: 1, missing: 0, total: 10 });
  assert.ok(packet.gates.find((gate) => gate.kind === "provider_executors")?.nextActionLabels.length);
  assert.ok(packet.guardrailLabels.some((label) => /dry-run provider receipts/i.test(label)));
});

test("production go/no-go packet allows upload only when all proof gates are ready", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);

  assert.equal(packet.status, "ready");
  assert.equal(packet.canUploadToOracle, true);
  assert.deepEqual(packet.gateCounts, { ready: 10, blocked: 0, missing: 0, total: 10 });
  assert.deepEqual(packet.gates.map((gate) => gate.status), [
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
  ]);
  assert.equal(packet.blockerLabels.length, 0);
  assert.deepEqual(packet.proofManifestCounts, { attached: 6, missing: 0, blocked: 0, total: 6 });
  assert.ok(packet.proofManifest.some((item) =>
    item.kind === "provider_executors" && item.proofReferenceLabels.length === 4
  ));
  assert.ok(packet.proofManifest.some((item) =>
    item.kind === "admin_ops_metrics" && item.proofReferenceLabels.some((label) => /oracle-metrics:ok/i.test(label))
  ));
});

test("production go/no-go packet blocks ready gates without admin metrics receipt manifest", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    adminOpsBackendMetrics: { productionReady: true, evidenceLabels: [] } as any,
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canUploadToOracle, false);
  assert.deepEqual(packet.gateCounts, { ready: 10, blocked: 0, missing: 0, total: 10 });
  assert.deepEqual(packet.proofManifestCounts, { attached: 5, missing: 1, blocked: 0, total: 6 });
  assert.ok(packet.blockerLabels.includes("Admin Oracle and user metrics proof reference is missing."));
});

test("production go/no-go packet blocks each individual required gate independently", () => {
  const readyInput = {
    ...baseReadyEvidence,
    strictOracleProofs: true,
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  };
  const cases = [
    ["approval_ui", { ...readyInput, approvalUi: { productionEvidenceReady: false } as any }],
    ["expected_behavior", { ...readyInput, expectedBehaviorAudit: { productionBlockerLabels: ["Guest messaging: needs delivery receipts."] } as any }],
    ["import_parser", { ...readyInput, importParserReadiness: { productionReady: false, blockerLabels: ["Spreadsheet parser missing."] } as any }],
    ["collaboration_access", { ...readyInput, collaboration: { productionReady: false } as any }],
    ["collaboration_lifecycle", {
      ...readyInput,
      collaborationLifecycleProjectionProof: buildWeddingCollaborationLifecycleProjectionProofState({
        projectedKinds: ["invite", "review"],
        guardedAccessControlProjection: true,
        sharedEditingDisabledByDefault: true,
        proofReferencePolicy: "required",
        proofRef: "collaboration-lifecycle:oracle-prod-1:2026-09-15",
      }),
    }],
    ["admin_routing_policy", { ...readyInput, adminWeddingAiRoutingPolicy: { productionReady: false } as any }],
    ["admin_ops_metrics", { ...readyInput, adminOpsBackendMetrics: { productionReady: false } as any }],
  ] as const;

  for (const [kind, input] of cases) {
    const packet = buildWeddingProductionGoNoGoPacketState(buildWeddingProductionReadinessEvidenceState(input));
    assert.equal(packet.canUploadToOracle, false, kind);
    assert.equal(packet.gates.find((gate) => gate.kind === kind)?.status, "blocked", kind);
    assert.equal(packet.gateCounts.blocked, 1, kind);
    assert.equal(packet.gateCounts.ready, 9, kind);
    assert.ok(packet.nextActionLabels.length > 0, kind);
  }
});
