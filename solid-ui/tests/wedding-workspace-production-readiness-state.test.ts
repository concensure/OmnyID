import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";
import { buildWeddingProductionReadinessState } from "@/lib/weddingProductionReadinessState";
import { buildWeddingWorkspaceProductionReadinessState } from "@/lib/weddingWorkspaceProductionReadinessState";

function readyGoNoGoPacket(): WeddingProductionGoNoGoPacketState {
  return {
    status: "ready",
    canUploadToOracle: true,
    title: "Wedding Oracle upload go/no-go ready",
    summary: "All required proof gates are ready.",
    gates: [],
    gateCounts: { ready: 10, blocked: 0, missing: 0, total: 10 },
    proofManifest: [],
    proofManifestCounts: { attached: 0, missing: 0, blocked: 0, total: 0 },
    blockerLabels: [],
    nextActionLabels: [],
    guardrailLabels: [],
  };
}

test("buildWeddingWorkspaceProductionReadinessState defaults fail-closed", () => {
  const state = buildWeddingWorkspaceProductionReadinessState({});

  assert.equal(state.productionReadiness.oracleUploadAllowed, false);
  assert.equal(state.oracleUpdatePlan.status, "blocked");
  assert.ok(state.oracleUpdatePlan.steps.some((step) => step.kind === "blocked"));
});

test("buildWeddingWorkspaceProductionReadinessState honors supplied readiness proof", () => {
  const productionReadiness = buildWeddingProductionReadinessState({
    backend_pagination: "pass",
    approval_execution_ui: "pass",
    provider_executor_integrations: "pass",
    collaboration_access_controls: "pass",
    collaboration_lifecycle_audit: "pass",
    admin_ai_routing_policy: "pass",
    admin_ops_backend_metrics: "pass",
    import_parser_readiness: "pass",
    oracle_release_gate: "pass",
  });
  const state = buildWeddingWorkspaceProductionReadinessState({
    oracleTargetLabel: "Oracle wedding prod",
    productionReadiness,
    productionGoNoGoPacket: readyGoNoGoPacket(),
  });

  assert.equal(state.productionReadiness.oracleUploadAllowed, true);
  assert.equal(state.oracleUpdatePlan.status, "ready");
  assert.deepEqual(state.oracleUpdatePlan.steps.map((step) => step.kind), ["preflight", "deploy", "verify", "record"]);
});

test("buildWeddingWorkspaceProductionReadinessState derives fail-closed go/no-go from evidence", () => {
  const productionReadiness = buildWeddingProductionReadinessState({
    backend_pagination: "pass",
    approval_execution_ui: "pass",
    provider_executor_integrations: "pass",
    collaboration_access_controls: "pass",
    collaboration_lifecycle_audit: "pass",
    admin_ai_routing_policy: "pass",
    admin_ops_backend_metrics: "pass",
    import_parser_readiness: "pass",
    oracle_release_gate: "pass",
  });
  const state = buildWeddingWorkspaceProductionReadinessState({
    productionReadiness,
    productionReadinessEvidence: {
      strictOracleProofs: true,
      backendPaginationContractReady: true,
    },
  });

  assert.equal(state.productionReadiness.oracleUploadAllowed, true);
  assert.equal(state.productionReadinessEvidence?.evidence.backendPaginationReady, true);
  assert.equal(state.productionGoNoGoPacket?.canUploadToOracle, false);
  assert.equal(state.oracleUpdatePlan.status, "blocked");
  assert.ok(state.oracleUpdatePlan.blockerLabels.some((label) => /Production go\/no-go/i.test(label)));
});

test("buildWeddingWorkspaceProductionReadinessState defaults supplied evidence to strict Oracle proof mode", () => {
  const state = buildWeddingWorkspaceProductionReadinessState({
    productionReadinessEvidence: {
      backendPaginationContractReady: true,
      backendScaleProof: { status: "pass" } as any,
      approvalUi: { productionEvidenceReady: true } as any,
      importParserReadiness: { productionReady: true, blockerLabels: [] } as any,
      collaboration: { productionReady: true } as any,
      collaborationLifecycleProjectionReady: true,
      adminWeddingAiRoutingPolicy: { productionReady: true } as any,
      adminOpsBackendMetrics: { productionReady: true } as any,
      providerExecutors: [
        { capability: "email", requiredProvider: "Gmail or email provider", productionReady: true } as any,
        { capability: "calendar", requiredProvider: "Google Calendar or calendar provider", productionReady: true } as any,
        { capability: "registry", requiredProvider: "Registry provider", productionReady: true } as any,
        { capability: "vendor_search", requiredProvider: "Brave Search, Google Places, or OSM/Overpass provider", productionReady: true } as any,
      ],
      oracleReleaseGate: { productionEvidenceReady: true } as any,
    },
  });

  assert.equal(state.productionReadinessEvidence?.evidence.backendPaginationReady, true);
  assert.equal(state.productionReadinessEvidence?.evidence.backendScaleProofReady, false);
  assert.equal(state.productionReadinessEvidence?.evidence.providerExecutorsReady, false);
  assert.equal(state.productionReadinessEvidence?.evidence.adminAiRoutingPolicyReady, false);
  assert.equal(state.productionReadinessEvidence?.evidence.oracleReleaseGateReady, false);
  assert.equal(state.productionReadiness.oracleUploadAllowed, false);
  assert.equal(state.productionGoNoGoPacket?.canUploadToOracle, false);
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Backend saved-workspace scale proof reference is missing.",
  ));
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Provider executor proof references are incomplete.",
  ));
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Oracle release proof references are incomplete.",
  ));
});
