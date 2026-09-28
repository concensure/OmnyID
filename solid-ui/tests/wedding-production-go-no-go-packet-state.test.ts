import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingCollaborationLifecycleProjectionProofState } from "@/lib/weddingCollaborationLifecycleProjectionProofState";
import { buildWeddingOracleReleaseGateReadinessState } from "@/lib/weddingOracleReleaseGateReadinessState";
import {
  buildWeddingProductionGoNoGoPacketState,
  weddingProductionGoNoGoPacketHasCompleteProofManifest,
  weddingProductionGoNoGoPacketHasCompleteReadyGates,
} from "@/lib/weddingProductionGoNoGoPacketState";
import { buildWeddingProductionReadinessEvidenceState } from "@/lib/weddingProductionReadinessEvidenceState";
import { buildWeddingProviderExecutorSmokeProofState } from "@/lib/weddingProviderExecutorSmokeProofState";
import { buildWeddingVendorComparisonUiReadinessState } from "@/lib/weddingVendorComparisonUiReadinessState";
import { buildWeddingVendorQuoteReplyUiReadinessState } from "@/lib/weddingVendorQuoteReplyUiReadinessState";
import { buildWeddingWorkspaceRefreshScaleProofState } from "@/lib/weddingWorkspaceRefreshScaleProofState";

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

function readyTemplateLaunchReadiness() {
  return {
    status: "ready",
    productionEvidenceReady: true,
    summary: "Wedding template launch and first-run intake proof is complete.",
    detail: "Ready.",
    evidenceLabels: ["Wedding template launch proof: wedding-template:prod-smoke:2026-09-28"],
    blockerLabels: [],
    nextActionLabels: [],
    proofReferenceLabel: "Wedding template launch proof: wedding-template:prod-smoke:2026-09-28",
  } as const;
}

const baseReadyEvidence = {
  backendPaginationContractReady: true,
  backendPaginationProofRef: "backend-pagination:oracle-prod-1:2026-09-28",
  approvalUi: {
    productionEvidenceReady: true,
    proofReferenceLabels: ["approval-ui:playwright:oracle-prod-1"],
  } as any,
  templateLaunchReadiness: readyTemplateLaunchReadiness(),
  vendorComparisonUi: readyVendorComparisonUi(),
  vendorQuoteReplyUi: readyVendorQuoteReplyUi(),
  vendorQuoteReplyProduction: readyVendorQuoteReplyProduction(),
  expectedBehaviorAudit: {
    productionBlockerLabels: [],
    proofReferenceLabels: ["expected-behavior-audit:oracle-prod-1:2026-09-28"],
  } as any,
  importParserReadiness: {
    productionReady: true,
    blockerLabels: [],
    proofReferenceLabels: ["Wedding import parser proof: no-current-imports"],
  } as any,
  collaboration: {
    productionReady: true,
    proofReferenceLabels: ["collaboration-access:oracle-prod-1:2026-09-28"],
  } as any,
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

function emailDelivery(to = "vendor@example.com") {
  return {
    channel: "email",
    to: [to],
    subject: "Wedding planning follow-up",
    text: "Hi, we are following up on our wedding planning request.",
  };
}

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
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
          external_id: "gmail:message-1",
          delivery: emailDelivery("events@venue.example"),
        },
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
  assert.ok(packet.gates.some((gate) => gate.kind === "template_launch" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "approval_ui" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "vendor_comparison_ui" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "vendor_quote_reply" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "expected_behavior" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "import_parser" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "collaboration_access" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "admin_routing_policy" && gate.status === "blocked"));
  assert.ok(packet.gates.some((gate) => gate.kind === "oracle_release" && gate.status === "missing"));
  assert.deepEqual(packet.gateCounts, { ready: 0, blocked: 11, missing: 2, total: 13 });
  assert.ok(packet.blockerLabels.includes("Backend pagination contract is missing."));
  assert.ok(packet.blockerLabels.includes("Wedding template launch proof is missing."));
  assert.ok(packet.blockerLabels.includes("Approval UI proof is missing."));
  assert.ok(packet.blockerLabels.includes("Vendor comparison UI proof is missing."));
  assert.ok(packet.blockerLabels.includes("Vendor quote reply UI proof is missing."));
  assert.ok(packet.blockerLabels.includes("Vendor quote reply live production proof is missing or blocked."));
  assert.ok(packet.blockerLabels.includes("Wedding import parser readiness is missing."));
  assert.ok(packet.nextActionLabels.includes("Prove approval execution UI and receipt handling."));
  assert.ok(packet.nextActionLabels.includes(
    "Prove inline quote summary, state-derived decision CTAs, conditional Tiptap editor, undo-send, sent-history proof, live regions, and telemetry.",
  ));
  assert.ok(packet.nextActionLabels.includes(
    "Prove the vendor quote reply flow with live provider send, undo, durable receipt, and proof drawer reconstruction.",
  ));
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
  assert.deepEqual(packet.gateCounts, { ready: 12, blocked: 1, missing: 0, total: 13 });
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
  assert.deepEqual(packet.gateCounts, { ready: 13, blocked: 0, missing: 0, total: 13 });
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
    "ready",
    "ready",
    "ready",
  ]);
  assert.equal(packet.blockerLabels.length, 0);
  assert.deepEqual(packet.proofManifestCounts, { attached: 8, missing: 0, blocked: 0, total: 8 });
  assert.ok(packet.proofManifest.some((item) =>
    item.kind === "provider_executors" && item.proofReferenceLabels.length === 4
  ));
  assert.ok(packet.proofManifest.some((item) =>
    item.kind === "backend_scale"
      && item.proofReferenceLabels.some((label) => /backend-pagination:oracle-prod-1/i.test(label))
      && item.proofReferenceLabels.some((label) => /refresh-scale:oracle-prod-1/i.test(label))
  ));
  assert.ok(packet.proofManifest.some((item) =>
    item.kind === "admin_ops_metrics" && item.proofReferenceLabels.some((label) => /oracle-metrics:ok/i.test(label))
  ));
  assert.ok(packet.proofManifest.some((item) =>
    item.kind === "vendor_quote_reply" && item.proofReferenceLabels.some((label) => /gmail-message-123/i.test(label))
  ));
  assert.ok(packet.proofManifest.some((item) =>
    item.kind === "template_launch" && item.proofReferenceLabels.some((label) => /wedding-template:prod-smoke/i.test(label))
  ));
});

test("production go/no-go ready gate validator rejects forged ready counts", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);

  assert.equal(weddingProductionGoNoGoPacketHasCompleteReadyGates(packet), true);
  assert.equal(weddingProductionGoNoGoPacketHasCompleteReadyGates({
    ...packet,
    gates: packet.gates.filter((gate) => gate.kind !== "vendor_quote_reply"),
    gateCounts: { ready: 12, blocked: 0, missing: 0, total: 12 },
  }), false);
  assert.equal(weddingProductionGoNoGoPacketHasCompleteReadyGates({
    ...packet,
    gates: packet.gates.map((gate) => gate.kind === "template_launch" ? { ...gate, status: "blocked" } : gate),
    gateCounts: { ready: 12, blocked: 0, missing: 0, total: 12 },
  }), false);
});

test("production go/no-go proof manifest validator rejects forged local proof references", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);

  assert.equal(weddingProductionGoNoGoPacketHasCompleteProofManifest(packet), true);
  assert.equal(weddingProductionGoNoGoPacketHasCompleteProofManifest({
    ...packet,
    proofManifest: packet.proofManifest.map((item) => item.kind === "template_launch"
      ? {
        ...item,
        proofReferenceLabels: ["http://localhost:5173/proof"],
      }
      : item),
  }), false);
  assert.equal(weddingProductionGoNoGoPacketHasCompleteProofManifest({
    ...packet,
    proofManifest: packet.proofManifest.map((item) => item.kind === "vendor_quote_reply"
      ? {
        ...item,
        proofReferenceLabels: ["vendor-quote:local-only"],
      }
      : item),
  }), false);
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
  assert.deepEqual(packet.gateCounts, { ready: 12, blocked: 1, missing: 0, total: 13 });
  assert.deepEqual(packet.proofManifestCounts, { attached: 7, missing: 0, blocked: 1, total: 8 });
  assert.ok(packet.blockerLabels.includes("Admin Oracle and user metrics proof reference is missing."));
});

test("production go/no-go packet blocks backend gate when scale proof is ready but pagination proof is missing", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    backendPaginationProofRef: null,
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);
  const gate = packet.gates.find((item) => item.kind === "backend_scale");
  const manifestItem = packet.proofManifest.find((item) => item.kind === "backend_scale");

  assert.equal(evidence.evidence.backendScaleProofReady, true);
  assert.equal(evidence.evidence.backendPaginationReady, false);
  assert.equal(gate?.status, "blocked");
  assert.ok(gate?.blockerLabels.includes("Backend pagination contract proof reference is missing."));
  assert.equal(manifestItem?.status, "blocked");
  assert.ok(manifestItem?.missingProofLabels.includes("Backend pagination contract proof reference is missing."));
  assert.ok(packet.blockerLabels.includes("Backend pagination contract proof reference is missing."));
  assert.equal(packet.canUploadToOracle, false);
});

test("production go/no-go packet keeps vendor quote blocked when live proof is ready but UI proof is missing", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    vendorQuoteReplyUi: null,
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);
  const gate = packet.gates.find((item) => item.kind === "vendor_quote_reply");
  const manifestItem = packet.proofManifest.find((item) => item.kind === "vendor_quote_reply");

  assert.equal(gate?.status, "blocked");
  assert.ok(gate?.blockerLabels.includes("Vendor quote reply UI proof is missing."));
  assert.match(gate?.detail ?? "", /quote summary, state-derived primary and secondary actions, conditional Tiptap editor/i);
  assert.equal(manifestItem?.status, "blocked");
  assert.ok(manifestItem?.missingProofLabels.includes("Vendor quote reply UI proof is missing."));
  assert.equal(packet.canUploadToOracle, false);
  assert.ok(packet.blockerLabels.includes("Vendor quote reply UI proof is missing."));
});

test("production go/no-go packet blocks missing dynamic vendor comparison UI", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    vendorComparisonUi: buildWeddingVendorComparisonUiReadinessState({
      comparisonTableMounted: true,
      expandableTopFiveControlMounted: true,
      multiSelectControlsMounted: false,
      sourceLinkActionsMounted: true,
      confirmSelectedActionMounted: true,
      followUpQueueActionMounted: false,
      approvalGatingCopyMounted: true,
      selectedVendorProjectionMounted: true,
      unselectedVendorQueueSuppressionMounted: true,
      closedVendorHistoryMounted: true,
      malformedSourceUrlGuardMounted: true,
      localSourceUrlGuardMounted: true,
    }),
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);
  const gate = packet.gates.find((item) => item.kind === "vendor_comparison_ui");

  assert.equal(evidence.evidence.vendorComparisonUiReady, false);
  assert.equal(gate?.status, "blocked");
  assert.ok(gate?.blockerLabels.includes("Vendor comparison UI proof is missing."));
  assert.ok(packet.blockerLabels.some((label) =>
    /Vendor comparison UI proof is blocked/.test(label)
    && /Multi-select vendor controls are not mounted/.test(label)
    && /Follow-up queue action is not mounted/.test(label)
  ));
  assert.equal(packet.canUploadToOracle, false);
});

test("production go/no-go packet does not attach weak vendor quote proof refs", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    vendorQuoteReplyProduction: {
      ...readyVendorQuoteReplyProduction(),
      evidenceLabels: ["Actual connected provider send verified: placeholder-gmail-message"],
    },
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);
  const manifestItem = packet.proofManifest.find((item) => item.kind === "vendor_quote_reply");

  assert.equal(evidence.evidence.vendorQuoteReplyProductionReady, false);
  assert.equal(manifestItem?.status, "blocked");
  assert.ok(manifestItem?.missingProofLabels.includes(
    "Vendor quote reply live provider proof reference is missing.",
  ));
  assert.ok(packet.blockerLabels.includes(
    "Vendor quote reply live provider proof reference is missing.",
  ));
  assert.equal(packet.canUploadToOracle, false);
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
    ["template_launch", {
      ...readyInput,
      templateLaunchReadiness: {
        ...readyTemplateLaunchReadiness(),
        productionEvidenceReady: false,
        status: "blocked",
        blockerLabels: ["Wedding template first-run intake gate is not proven before generated planning work."],
      },
    }],
    ["approval_ui", { ...readyInput, approvalUi: { productionEvidenceReady: false } as any }],
    ["vendor_comparison_ui", { ...readyInput, vendorComparisonUi: null }],
    ["vendor_quote_reply", {
      ...readyInput,
      vendorQuoteReplyProduction: {
        ...readyVendorQuoteReplyProduction(),
        productionReady: false,
        status: "partial",
        blockerLabels: ["Actual connected Gmail/provider send proof is not attached."],
      },
    }],
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
    assert.equal(packet.gateCounts.ready, 12, kind);
    assert.ok(packet.nextActionLabels.length > 0, kind);
  }
});

test("production go/no-go packet surfaces granular vendor quote reply production blockers", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    vendorQuoteReplyProduction: {
      ...readyVendorQuoteReplyProduction(),
      productionReady: false,
      status: "partial",
      blockerLabels: [
        "Server thread proof round-trip has not been verified.",
        "Actual connected Gmail/provider send proof is not attached.",
      ],
      nextActionLabels: [
        "Reload the vendor quote thread and confirm the proof drawer reconstructs quote, draft, and durable provider receipt.",
        "Run a real connected-provider send verification and attach the durable provider proof reference.",
      ],
    },
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);
  const gate = packet.gates.find((item) => item.kind === "vendor_quote_reply");
  const manifestItem = packet.proofManifest.find((item) => item.kind === "vendor_quote_reply");

  assert.equal(gate?.status, "blocked");
  assert.deepEqual(gate?.blockerLabels, [
    "Server thread proof round-trip has not been verified.",
    "Actual connected Gmail/provider send proof is not attached.",
  ]);
  assert.ok(gate?.nextActionLabels.some((label) => /real connected-provider send verification/i.test(label)));
  assert.equal(manifestItem?.status, "blocked");
  assert.ok(manifestItem?.missingProofLabels.some((label) => /server thread proof round-trip/i.test(label)));
  assert.ok(packet.blockerLabels.includes("Actual connected Gmail/provider send proof is not attached."));
});

test("production go/no-go packet normalizes noisy vendor quote blocker labels once upstream", () => {
  const longBlockerLabel = `Actual connected Gmail/provider send proof is not attached because ${"receipt ".repeat(40)}`;
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    vendorQuoteReplyProduction: {
      ...readyVendorQuoteReplyProduction(),
      productionReady: false,
      status: "partial",
      blockerLabels: [
        "  Server thread proof round-trip has not been verified.  ",
        "Server   thread proof round-trip has not been verified.",
        longBlockerLabel,
        "",
      ],
      nextActionLabels: [
        "  Run a real connected-provider send verification and attach the durable provider proof reference.  ",
        "Run a real connected-provider send verification and attach the durable provider proof reference.",
      ],
    },
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);
  const gate = packet.gates.find((item) => item.kind === "vendor_quote_reply");
  const manifestItem = packet.proofManifest.find((item) => item.kind === "vendor_quote_reply");

  assert.deepEqual(gate?.blockerLabels, [
    "Server thread proof round-trip has not been verified.",
    `${longBlockerLabel.slice(0, 237)}...`,
  ]);
  assert.deepEqual(gate?.nextActionLabels, [
    "Run a real connected-provider send verification and attach the durable provider proof reference.",
  ]);
  assert.deepEqual(manifestItem?.missingProofLabels, gate?.blockerLabels);
  assert.equal(
    packet.blockerLabels.filter((label) => label === "Server thread proof round-trip has not been verified.").length,
    1,
  );
  assert.ok(packet.blockerLabels.every((label) => label.length <= 240));
});

test("production go/no-go packet carries granular vendor quote UI blockers into the live-send gate", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    ...baseReadyEvidence,
    strictOracleProofs: true,
    vendorQuoteReplyUi: buildWeddingVendorQuoteReplyUiReadinessState({
      quoteSummaryMounted: true,
      originalQuoteActionMounted: true,
      inlineEmailEditorMounted: false,
      wordingApprovalControlMounted: true,
      budgetAcknowledgementControlMounted: false,
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
    }),
    backendScaleProof: readyScaleProof(),
    providerExecutorSmokeProof: readySmokeProof(),
    oracleReleaseGate: readyReleaseGate(),
  });
  const packet = buildWeddingProductionGoNoGoPacketState(evidence);
  const gate = packet.gates.find((item) => item.kind === "vendor_quote_reply");

  assert.equal(gate?.status, "blocked");
  assert.ok(gate?.blockerLabels.includes("Inline email editor is not mounted."));
  assert.ok(gate?.blockerLabels.includes("Separate budget acknowledgement control is not mounted."));
  assert.ok(gate?.nextActionLabels.some((label) => /Mount the Tiptap email editor/i.test(label)));
});
