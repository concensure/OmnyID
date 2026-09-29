import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";
import { buildWeddingProductionReadinessState } from "@/lib/weddingProductionReadinessState";
import { buildWeddingVendorComparisonUiReadinessState } from "@/lib/weddingVendorComparisonUiReadinessState";
import { buildWeddingVendorQuoteReplyUiReadinessState } from "@/lib/weddingVendorQuoteReplyUiReadinessState";
import { buildWeddingWorkspaceProductionReadinessState } from "@/lib/weddingWorkspaceProductionReadinessState";

const readyGateKinds: readonly WeddingProductionGoNoGoPacketState["gates"][number]["kind"][] = [
  "backend_scale",
  "template_launch",
  "approval_ui",
  "vendor_comparison_ui",
  "vendor_quote_reply",
  "provider_executors",
  "expected_behavior",
  "import_parser",
  "collaboration_access",
  "collaboration_lifecycle",
  "admin_routing_policy",
  "admin_ops_metrics",
  "oracle_release",
];

function completeReadyGates(): WeddingProductionGoNoGoPacketState["gates"] {
  return readyGateKinds.map((kind) => ({
    kind,
    title: `Ready ${kind.replace(/_/g, " ")}`,
    status: "ready",
    detail: "Production proof is complete.",
    blockerLabels: [],
    nextActionLabels: [],
  }));
}

const readyEmailProvider = {
  capability: "email",
  requiredProvider: "Gmail or email provider",
  credentialStatus: "connected",
  executorStatus: "available",
  productionReady: true,
  setupView: "email",
  summary: "Gmail or email provider ready",
  detail: "The connected app is ready.",
} as const;

function readyVendorQuoteReplyUi() {
  return buildWeddingVendorQuoteReplyUiReadinessState({
    quoteSummaryMounted: true,
    originalQuoteActionMounted: true,
    inlineEmailEditorMounted: true,
    wordingApprovalControlMounted: true,
    budgetAcknowledgementControlMounted: true,
    sendActionMounted: true,
    primaryDecisionActionMounted: true,
    secondaryDecisionActionMounted: true,
    conditionalReplyEditorMounted: true,
    sentReplyHistoryMounted: true,
    undoWindowMounted: true,
    persistentSentConfirmationMounted: true,
    proofDrawerActionMounted: true,
    proofDrawerStatusMounted: true,
    liveRegionsMounted: true,
    failureTelemetryMounted: true,
    providerReadiness: readyEmailProvider,
  });
}

function readyVendorComparisonUi() {
  return buildWeddingVendorComparisonUiReadinessState({
    comparisonTableMounted: true,
    expandableTopFiveControlMounted: true,
    multiSelectControlsMounted: true,
    sourceLinkActionsMounted: true,
    confirmSelectedActionMounted: true,
    followUpQueueActionMounted: true,
    approvalGatingCopyMounted: true,
    selectedVendorProjectionMounted: true,
    unselectedVendorQueueSuppressionMounted: true,
    closedVendorHistoryMounted: true,
    malformedSourceUrlGuardMounted: true,
    localSourceUrlGuardMounted: true,
  });
}

function readyVendorQuoteReplyProduction() {
  return {
    status: "ready",
    productionReady: true,
    summary: "Vendor quote inline reply v1 is production-ready with live provider proof.",
    detail: "Ready.",
    evidenceLabels: ["Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123"],
    blockerLabels: [],
    nextActionLabels: [],
    telemetryEvent: null,
  } as const;
}

function readyGoNoGoPacket(): WeddingProductionGoNoGoPacketState {
  return {
    status: "ready",
    canUploadToOracle: true,
    title: "Wedding Oracle upload go/no-go ready",
    summary: "All required proof gates are ready.",
    gates: completeReadyGates(),
    gateCounts: { ready: 13, blocked: 0, missing: 0, total: 13 },
    proofManifest: [
      {
        kind: "backend_scale",
        title: "Saved workspace backend pagination and scale receipts",
        status: "attached",
        proofReferenceLabels: ["backend-pagination:prod", "refresh-scale:prod"],
        missingProofLabels: [],
      },
      {
        kind: "provider_executors",
        title: "External provider executor receipts",
        status: "attached",
        proofReferenceLabels: ["email:prod", "calendar:prod", "registry:prod", "vendor-search:prod"],
        missingProofLabels: [],
      },
      {
        kind: "template_launch",
        title: "Wedding template launch receipt",
        status: "attached",
        proofReferenceLabels: ["template-launch:prod"],
        missingProofLabels: [],
      },
      {
        kind: "vendor_quote_reply",
        title: "Vendor quote reply live-send receipt",
        status: "attached",
        proofReferenceLabels: ["gmail-message:prod"],
        missingProofLabels: [],
      },
      {
        kind: "collaboration_lifecycle",
        title: "Collaborator lifecycle receipt",
        status: "attached",
        proofReferenceLabels: ["collaboration-lifecycle:prod"],
        missingProofLabels: [],
      },
      {
        kind: "admin_routing_policy",
        title: "Admin-funded AI routing policy receipt",
        status: "attached",
        proofReferenceLabels: ["admin-routing:prod"],
        missingProofLabels: [],
      },
      {
        kind: "admin_ops_metrics",
        title: "Admin Oracle metrics receipt",
        status: "attached",
        proofReferenceLabels: ["oracle-metrics:prod"],
        missingProofLabels: [],
      },
      {
        kind: "oracle_release",
        title: "Oracle release receipts",
        status: "attached",
        proofReferenceLabels: ["oracle-release:prod"],
        missingProofLabels: [],
      },
    ],
    proofManifestCounts: { attached: 8, missing: 0, blocked: 0, total: 8 },
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
    template_launch_intake: "pass",
    approval_execution_ui: "pass",
    vendor_comparison_ui: "pass",
    vendor_quote_reply_ui: "pass",
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
    template_launch_intake: "pass",
    approval_execution_ui: "pass",
    vendor_comparison_ui: "pass",
    vendor_quote_reply_ui: "pass",
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
  assert.equal(state.productionReadinessEvidence?.evidence.backendPaginationReady, false);
  assert.equal(state.productionGoNoGoPacket?.canUploadToOracle, false);
  assert.equal(state.oracleUpdatePlan.status, "blocked");
  assert.ok(state.oracleUpdatePlan.blockerLabels.some((label) => /Production go\/no-go/i.test(label)));
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Backend pagination contract proof reference is missing.",
  ));
  assert.equal(state.productionRemainingWork.oracleUploadAllowed, false);
  assert.ok(state.productionRemainingWork.oracleBlockingItems.some((item) =>
    item.id === "aggregate_go_no_go_packet"
  ));
});

test("buildWeddingWorkspaceProductionReadinessState defaults supplied evidence to strict Oracle proof mode", () => {
  const state = buildWeddingWorkspaceProductionReadinessState({
    productionReadinessEvidence: {
      backendPaginationContractReady: true,
      backendScaleProof: { status: "pass" } as any,
      approvalUi: { productionEvidenceReady: true } as any,
      vendorComparisonUi: readyVendorComparisonUi(),
      importParserReadiness: { productionReady: true, blockerLabels: [] } as any,
      collaboration: { productionReady: true } as any,
      collaborationLifecycleProjectionReady: true,
      adminWeddingAiRoutingPolicy: { productionReady: true } as any,
      adminOpsBackendMetrics: { productionReady: true } as any,
      providerExecutors: [
        { capability: "email", requiredProvider: "Gmail or email provider", productionReady: true } as any,
        { capability: "calendar", requiredProvider: "Google Calendar or calendar provider", productionReady: true } as any,
        { capability: "registry", requiredProvider: "Registry provider", productionReady: true } as any,
        { capability: "vendor_search", requiredProvider: "Brave Search, EXA Search, Google Places, or OSM/Overpass provider", productionReady: true } as any,
      ],
      oracleReleaseGate: { productionEvidenceReady: true } as any,
    },
  });

  assert.equal(state.productionReadinessEvidence?.evidence.backendPaginationReady, false);
  assert.equal(state.productionReadinessEvidence?.evidence.backendScaleProofReady, false);
  assert.equal(state.productionReadinessEvidence?.evidence.providerExecutorsReady, false);
  assert.equal(state.productionReadinessEvidence?.evidence.adminAiRoutingPolicyReady, false);
  assert.equal(state.productionReadinessEvidence?.evidence.oracleReleaseGateReady, false);
  assert.equal(state.productionReadiness.oracleUploadAllowed, false);
  assert.equal(state.productionGoNoGoPacket?.canUploadToOracle, false);
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Backend pagination contract proof reference is missing.",
  ));
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Backend saved-workspace scale proof reference is missing.",
  ));
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Wedding template launch proof is missing.",
  ));
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Provider executor proof references are incomplete.",
  ));
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Oracle release proof references are incomplete.",
  ));
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Vendor quote reply UI proof is missing.",
  ));
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Vendor quote reply live production proof is missing.",
  ));
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Shared wedding workspace access-control proof reference is missing.",
  ));
});

test("buildWeddingWorkspaceProductionReadinessState preserves vendor quote live proof in aggregate go/no-go", () => {
  const state = buildWeddingWorkspaceProductionReadinessState({
    productionReadinessEvidence: {
      vendorComparisonUi: readyVendorComparisonUi(),
      vendorQuoteReplyUi: readyVendorQuoteReplyUi(),
      vendorQuoteReplyProduction: readyVendorQuoteReplyProduction(),
    },
  });
  const comparisonGate = state.productionGoNoGoPacket?.gates.find((gate) => gate.kind === "vendor_comparison_ui");
  const vendorGate = state.productionGoNoGoPacket?.gates.find((gate) => gate.kind === "vendor_quote_reply");
  const vendorManifest = state.productionGoNoGoPacket?.proofManifest.find((item) => item.kind === "vendor_quote_reply");

  assert.equal(state.productionReadinessEvidence?.evidence.vendorComparisonUiReady, true);
  assert.equal(comparisonGate?.status, "ready");
  assert.equal(state.productionReadinessEvidence?.evidence.vendorQuoteReplyUiReady, true);
  assert.equal(state.productionReadinessEvidence?.evidence.vendorQuoteReplyProductionReady, true);
  assert.equal(vendorGate?.status, "ready");
  assert.equal(vendorManifest?.status, "attached");
  assert.ok(vendorManifest?.proofReferenceLabels.some((label) => /gmail-message-123/i.test(label)));
  assert.equal(state.productionGoNoGoPacket?.canUploadToOracle, false);
});

test("buildWeddingWorkspaceProductionReadinessState exposes strict proof blockers in remaining work", () => {
  const state = buildWeddingWorkspaceProductionReadinessState({
    productionReadinessEvidence: {
      strictOracleProofs: true,
      seededVendorCorpus: {
        status: "ready",
        vendorCount: 10,
        categoryCount: 6,
        sourceCount: 10,
        staleCount: 0,
        summaryArtifact: {},
        proofReferenceLabels: [],
      } as any,
    },
  });
  const seededCorpusItem = state.productionRemainingWork.productionPolishItems.find((item) =>
    item.id === "seeded_vendor_corpus"
  );

  assert.equal(seededCorpusItem?.summary, "Source-backed seeded vendor corpus proof reference is missing.");
});
