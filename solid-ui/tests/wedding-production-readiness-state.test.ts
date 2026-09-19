import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWeddingProductionReadinessState,
} from "../src/lib/weddingProductionReadinessState.ts";
import {
  buildWeddingProductionReadinessEvidenceState,
} from "../src/lib/weddingProductionReadinessEvidenceState.ts";

test("wedding production readiness blocks Oracle upload while required gates remain blocked", () => {
  const state = buildWeddingProductionReadinessState();

  assert.equal(state.status, "not_production_ready");
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(state.blockerCount > 0);
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
  assert.ok(state.nextActions.includes("Shared wedding workspace access controls"));
  assert.ok(state.nextActions.includes("Collaborator lifecycle audit records"));
  assert.ok(state.nextActions.includes("Admin-funded wedding AI routing policy"));
  assert.ok(state.nextActions.includes("Admin Oracle and user metrics"));
  assert.ok(state.nextActions.includes("Wedding import parser readiness"));
});

test("optional gaps do not block Oracle upload when required gates pass", () => {
  const state = buildWeddingProductionReadinessState({
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

  assert.equal(state.status, "not_production_ready");
  assert.equal(state.oracleUploadAllowed, true);
  assert.equal(state.nextActions.length, 0);
  assert.ok(state.blockerCount > 0);
});

test("backend pagination contract alone does not satisfy live scale-proof gate", () => {
  const state = buildWeddingProductionReadinessState({}, { backendPaginationReady: true });

  const backendCheck = state.checks.find((check) => check.id === "backend_pagination");
  assert.equal(backendCheck?.status, "blocked");
  assert.match(backendCheck?.detail ?? "", /live multi-page scale proof/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
  assert.ok(state.nextActions.includes("Admin-funded wedding AI routing policy"));
});

test("backend pagination and scale evidence satisfy that gate without masking other blockers", () => {
  const state = buildWeddingProductionReadinessState(
    {},
    { backendPaginationReady: true, backendScaleProofReady: true },
  );

  const backendCheck = state.checks.find((check) => check.id === "backend_pagination");
  assert.equal(backendCheck?.status, "pass");
  assert.match(backendCheck?.detail ?? "", /repeatable scale-proof evidence/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(!state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
});

test("approval execution UI evidence clears only the approval UI gate", () => {
  const state = buildWeddingProductionReadinessState({}, { approvalExecutionUiReady: true });

  const approvalCheck = state.checks.find((check) => check.id === "approval_execution_ui");
  assert.equal(approvalCheck?.status, "pass");
  assert.match(approvalCheck?.detail ?? "", /disclosure preview/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(!state.nextActions.includes("Real approval execution UI"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
});

test("live map evidence clears only the map/geocoding gate", () => {
  const state = buildWeddingProductionReadinessState({}, { liveMapGeocodingReady: true });

  const mapCheck = state.checks.find((check) => check.id === "live_map_geocoding");
  assert.equal(mapCheck?.status, "pass");
  assert.match(mapCheck?.detail ?? "", /verified live geocodes/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
});

test("graph canvas evidence clears only the graph highlighting gate", () => {
  const state = buildWeddingProductionReadinessState({}, { graphCanvasHighlightingReady: true });

  const graphCheck = state.checks.find((check) => check.id === "graph_canvas_highlighting");
  assert.equal(graphCheck?.status, "pass");
  assert.match(graphCheck?.detail ?? "", /node highlights/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
});

test("provider executor evidence clears provider gate only when explicitly proven", () => {
  const state = buildWeddingProductionReadinessState({}, { providerExecutorsReady: true });

  const providerCheck = state.checks.find((check) => check.id === "provider_executor_integrations");
  assert.equal(providerCheck?.status, "pass");
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(!state.nextActions.includes("Provider executor integrations"));
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Admin-funded wedding AI routing policy"));
});

test("collaboration access-control evidence clears only the shared editing gate", () => {
  const state = buildWeddingProductionReadinessState({}, { collaborationAccessControlsReady: true });

  const collaborationCheck = state.checks.find((check) => check.id === "collaboration_access_controls");
  assert.equal(collaborationCheck?.status, "pass");
  assert.match(collaborationCheck?.detail ?? "", /backend ACLs/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(!state.nextActions.includes("Shared wedding workspace access controls"));
  assert.ok(state.nextActions.includes("Collaborator lifecycle audit records"));
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
});

test("collaboration lifecycle audit evidence clears only the lifecycle projection gate", () => {
  const state = buildWeddingProductionReadinessState({}, { collaborationLifecycleAuditReady: true });

  const lifecycleCheck = state.checks.find((check) => check.id === "collaboration_lifecycle_audit");
  assert.equal(lifecycleCheck?.status, "pass");
  assert.match(lifecycleCheck?.detail ?? "", /stale-access-review/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(!state.nextActions.includes("Collaborator lifecycle audit records"));
  assert.ok(state.nextActions.includes("Shared wedding workspace access controls"));
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
});

test("admin AI routing policy evidence clears only the admin routing gate", () => {
  const state = buildWeddingProductionReadinessState({}, { adminAiRoutingPolicyReady: true });

  const policyCheck = state.checks.find((check) => check.id === "admin_ai_routing_policy");
  assert.equal(policyCheck?.status, "pass");
  assert.match(policyCheck?.detail ?? "", /Master Agent query exclusion/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(!state.nextActions.includes("Admin-funded wedding AI routing policy"));
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
});

test("admin ops backend metrics evidence clears only the admin metrics gate", () => {
  const state = buildWeddingProductionReadinessState({}, { adminOpsBackendMetricsReady: true });

  const metricsCheck = state.checks.find((check) => check.id === "admin_ops_backend_metrics");
  assert.equal(metricsCheck?.status, "pass");
  assert.match(metricsCheck?.detail ?? "", /exact user count/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(!state.nextActions.includes("Admin Oracle and user metrics"));
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
});

test("expected behaviour coverage evidence clears only the behaviour audit gate", () => {
  const state = buildWeddingProductionReadinessState({}, { expectedBehaviorCoverageReady: true });

  const auditCheck = state.checks.find((check) => check.id === "expected_behavior_coverage");
  assert.equal(auditCheck?.status, "pass");
  assert.match(auditCheck?.detail ?? "", /ready, provider-blocked, and UI-blocked labels/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
});

test("expected behaviour coverage is visible but does not block Oracle when required gates pass", () => {
  const state = buildWeddingProductionReadinessState({
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

  const auditCheck = state.checks.find((check) => check.id === "expected_behavior_coverage");
  assert.equal(auditCheck?.status, "blocked");
  assert.equal(auditCheck?.requiredForOracle, false);
  assert.equal(state.oracleUploadAllowed, true);
  assert.ok(!state.nextActions.includes("Expected wedding behaviour coverage"));
});

test("missing import parser readiness stays Oracle-blocking by default", () => {
  const state = buildWeddingProductionReadinessState(
    {
      backend_pagination: "pass",
      approval_execution_ui: "pass",
      provider_executor_integrations: "pass",
      collaboration_access_controls: "pass",
      collaboration_lifecycle_audit: "pass",
      admin_ai_routing_policy: "pass",
      admin_ops_backend_metrics: "pass",
      oracle_release_gate: "pass",
    },
    {},
  );

  const importCheck = state.checks.find((check) => check.id === "import_parser_readiness");
  assert.equal(importCheck?.status, "blocked");
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(state.nextActions.includes("Wedding import parser readiness"));
});

test("explicit import parser evidence clears only the import readiness gate", () => {
  const state = buildWeddingProductionReadinessState({}, { importParserReady: true });

  const importCheck = state.checks.find((check) => check.id === "import_parser_readiness");
  assert.equal(importCheck?.status, "pass");
  assert.match(importCheck?.detail ?? "", /safe for CSV\/TSV\/text/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(!state.nextActions.includes("Wedding import parser readiness"));
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
});

test("explicit blocked import parser evidence keeps the import readiness gate blocked", () => {
  const state = buildWeddingProductionReadinessState({}, { importParserReady: false });

  const importCheck = state.checks.find((check) => check.id === "import_parser_readiness");
  assert.equal(importCheck?.status, "blocked");
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(state.nextActions.includes("Wedding import parser readiness"));
});

test("native export worker evidence clears only the native export gate", () => {
  const state = buildWeddingProductionReadinessState({}, { nativeExportWorkersReady: true });

  const nativeExportCheck = state.checks.find((check) => check.id === "native_export_workers");
  assert.equal(nativeExportCheck?.status, "pass");
  assert.match(nativeExportCheck?.detail ?? "", /private-file filtering/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
});

test("LLM Need-To-Know extraction evidence clears only that extraction gate", () => {
  const state = buildWeddingProductionReadinessState({}, { llmNeedToKnowExtractionReady: true });

  const extractionCheck = state.checks.find((check) => check.id === "llm_need_to_know_extraction");
  assert.equal(extractionCheck?.status, "pass");
  assert.match(extractionCheck?.detail ?? "", /transcript\/chat proof/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
});

test("seeded vendor corpus evidence clears only the optional vendor seed gate", () => {
  const state = buildWeddingProductionReadinessState({}, { seededVendorCorpusReady: true });

  const seedCheck = state.checks.find((check) => check.id === "seeded_vendor_corpus");
  assert.equal(seedCheck?.status, "pass");
  assert.equal(seedCheck?.requiredForOracle, false);
  assert.match(seedCheck?.detail ?? "", /source-backed rows/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
});

test("Oracle release evidence clears only the Oracle release gate", () => {
  const state = buildWeddingProductionReadinessState({}, { oracleReleaseGateReady: true });

  const oracleCheck = state.checks.find((check) => check.id === "oracle_release_gate");
  assert.equal(oracleCheck?.status, "pass");
  assert.match(oracleCheck?.detail ?? "", /fresh Oracle remote proof/);
  assert.equal(state.oracleUploadAllowed, false);
  assert.ok(state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(state.nextActions.includes("Provider executor integrations"));
  assert.ok(!state.nextActions.includes("Oracle release gate"));
});

test("all checks passing marks wedding planning production ready", () => {
  const state = buildWeddingProductionReadinessState({
    backend_pagination: "pass",
    live_map_geocoding: "pass",
    graph_canvas_highlighting: "pass",
    approval_execution_ui: "pass",
    native_export_workers: "pass",
    llm_need_to_know_extraction: "pass",
    seeded_vendor_corpus: "pass",
    expected_behavior_coverage: "pass",
    import_parser_readiness: "pass",
    provider_executor_integrations: "pass",
    collaboration_access_controls: "pass",
    collaboration_lifecycle_audit: "pass",
    admin_ai_routing_policy: "pass",
    admin_ops_backend_metrics: "pass",
    oracle_release_gate: "pass",
  });

  assert.equal(state.status, "production_ready");
  assert.equal(state.oracleUploadAllowed, true);
  assert.equal(state.blockerCount, 0);
});

test("production readiness accepts aggregated helper evidence", () => {
  const evidenceState = buildWeddingProductionReadinessEvidenceState({
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
  });
  const state = buildWeddingProductionReadinessState({}, evidenceState.evidence);

  assert.equal(state.oracleUploadAllowed, true);
  assert.ok(state.blockerCount > 0);
  assert.ok(!state.nextActions.includes("Backend refresh pagination and query tuning"));
  assert.ok(!state.nextActions.includes("Real approval execution UI"));
  assert.ok(!state.nextActions.includes("Provider executor integrations"));
  assert.ok(!state.nextActions.includes("Wedding import parser readiness"));
  assert.ok(!state.nextActions.includes("Shared wedding workspace access controls"));
  assert.ok(!state.nextActions.includes("Collaborator lifecycle audit records"));
  assert.ok(!state.nextActions.includes("Admin-funded wedding AI routing policy"));
  assert.ok(!state.nextActions.includes("Admin Oracle and user metrics"));
  assert.ok(!state.nextActions.includes("Oracle release gate"));
});
