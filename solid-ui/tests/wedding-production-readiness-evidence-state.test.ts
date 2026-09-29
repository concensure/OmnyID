import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProductionReadinessEvidenceState,
} from "@/lib/weddingProductionReadinessEvidenceState";
import { buildAdminWeddingAiRoutingPolicyState } from "@/lib/adminWeddingAiRoutingPolicyState";
import { buildAdminWeddingOpsBackendMetricsReadinessState } from "@/lib/adminWeddingOpsBackendMetricsReadinessState";
import { buildWeddingVendorSearchProviderEnvState } from "@/lib/weddingVendorSearchProviderEnvState";
import { buildWeddingVendorSeedState } from "@/lib/weddingVendorSeedState";
import { buildWeddingWorkspaceRefreshScaleProofState } from "@/lib/weddingWorkspaceRefreshScaleProofState";
import { buildWeddingProviderExecutorSmokeProofState } from "@/lib/weddingProviderExecutorSmokeProofState";
import { buildWeddingCollaborationLifecycleProjectionProofState } from "@/lib/weddingCollaborationLifecycleProjectionProofState";
import { buildWeddingVendorQuoteReplyUiReadinessState } from "@/lib/weddingVendorQuoteReplyUiReadinessState";
import { buildWeddingVendorComparisonUiReadinessState } from "@/lib/weddingVendorComparisonUiReadinessState";

const readyProof = { productionEvidenceReady: true };
const blockedProof = { productionEvidenceReady: false };
const readyScaleProof = { status: "pass" };
const readyScaleProofWithReceipt = buildWeddingWorkspaceRefreshScaleProofState({
  requestedPageSize: 96,
  pageCount: 3,
  totalLoaded: 240,
  maxPageMs: 820,
  pageOffsets: [0, 96, 192],
  duplicateMessageIds: [],
  errorCount: 0,
  hasMoreAfterFinalPage: false,
  proofReferencePolicy: "required",
  proofRef: "refresh-scale:oracle-prod-1:2026-09-14",
});
const blockedScaleProof = { status: "blocked" };

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

function seededVendorCorpus(proofReferenceLabels?: readonly string[]) {
  return buildWeddingVendorSeedState({
    now: new Date("2026-09-14T12:00:00Z"),
    proofReferenceLabels,
    seeds: Array.from({ length: 10 }, (_, index) => ({
      vendorSlug: `vendor-${index + 1}`,
      vendorName: `Vendor ${index + 1}`,
      category: ["Venue", "Florist", "DJ", "Caterer", "Cake Baker", "Photographer", "Transport"][index % 7],
      serviceArea: "Sydney, NSW",
      websiteUrl: `https://vendor-${index + 1}.example`,
      sourceUrl: `https://vendor-${index + 1}.example/source`,
      sourceLabel: `Vendor ${index + 1} source`,
      sourceCheckedAt: "2026-09-14",
      evidence: {
        verified_fields: ["category", "service_area", "price", "availability"],
        service_notes: ["Sydney wedding service", "transparent pricing"],
        price_basis: "official current package guide verified",
        availability_basis: "date-specific availability confirmed by vendor inquiry",
      },
    })),
  });
}

test("buildWeddingProductionReadinessEvidenceState maps complete helper proofs", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
    backendPaginationContractReady: true,
    backendScaleProof: readyScaleProof as any,
    templateLaunchReadiness: readyTemplateLaunchReadiness(),
    liveMapGeocoding: readyProof as any,
    graphCanvasHighlighting: readyProof as any,
    approvalUi: readyProof as any,
    vendorComparisonUi: readyVendorComparisonUi(),
    vendorQuoteReplyUi: readyVendorQuoteReplyUi(),
    vendorQuoteReplyProduction: readyVendorQuoteReplyProduction(),
    nativeExportWorkers: readyProof as any,
    llmNeedToKnowExtraction: readyProof as any,
    seededVendorCorpus: seededVendorCorpus(),
    expectedBehaviorAudit: { productionBlockerLabels: [] } as any,
    importParserReadiness: { productionReady: true, blockerLabels: [] } as any,
    collaboration: { productionReady: true } as any,
    collaborationLifecycleProjectionReady: true,
    adminWeddingAiRoutingPolicy: { productionReady: true } as any,
    adminOpsBackendMetrics: { productionReady: true } as any,
    providerExecutors: [
      { capability: "email", productionReady: true } as any,
      { capability: "calendar", productionReady: true } as any,
      { capability: "registry", productionReady: true } as any,
      { capability: "vendor_search", productionReady: true } as any,
    ],
    oracleReleaseGate: readyProof as any,
  });

  assert.equal(state.evidence.backendPaginationReady, true);
  assert.equal(state.evidence.backendScaleProofReady, true);
  assert.equal(state.evidence.templateLaunchIntakeReady, true);
  assert.equal(state.evidence.liveMapGeocodingReady, true);
  assert.equal(state.evidence.graphCanvasHighlightingReady, true);
  assert.equal(state.evidence.approvalExecutionUiReady, true);
  assert.equal(state.evidence.vendorComparisonUiReady, true);
  assert.equal(state.evidence.vendorQuoteReplyUiReady, true);
  assert.equal(state.evidence.vendorQuoteReplyProductionReady, true);
  assert.equal(state.vendorQuoteReplyUi?.productionReady, true);
  assert.equal(state.vendorQuoteReplyProduction?.productionReady, true);
  assert.equal(state.evidence.nativeExportWorkersReady, true);
  assert.equal(state.evidence.llmNeedToKnowExtractionReady, true);
  assert.equal(state.evidence.seededVendorCorpusReady, true);
  assert.equal(state.evidence.expectedBehaviorCoverageReady, true);
  assert.equal(state.evidence.importParserReady, true);
  assert.equal(state.evidence.collaborationAccessControlsReady, true);
  assert.equal(state.evidence.collaborationLifecycleAuditReady, true);
  assert.equal(state.evidence.adminAiRoutingPolicyReady, true);
  assert.equal(state.evidence.adminOpsBackendMetricsReady, true);
  assert.equal(state.evidence.providerExecutorsReady, true);
  assert.equal(state.evidence.oracleReleaseGateReady, true);
  assert.deepEqual(state.missingRequiredEvidenceLabels, []);
  assert.ok(state.durableProofReferenceLabels.includes(
    "Wedding template launch proof: wedding-template:prod-smoke:2026-09-28",
  ));
  assert.ok(state.durableProofReferenceLabels.includes(
    "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
  ));
});

test("buildWeddingProductionReadinessEvidenceState surfaces vendor comparison UI blockers", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
    vendorComparisonUi: buildWeddingVendorComparisonUiReadinessState({
      comparisonTableMounted: true,
      expandableTopFiveControlMounted: true,
      multiSelectControlsMounted: false,
      sourceLinkActionsMounted: true,
      confirmSelectedActionMounted: true,
      followUpQueueActionMounted: false,
      approvalGatingCopyMounted: true,
      selectedVendorProjectionMounted: false,
      unselectedVendorQueueSuppressionMounted: true,
      closedVendorHistoryMounted: true,
      malformedSourceUrlGuardMounted: true,
      localSourceUrlGuardMounted: true,
    }),
  });

  assert.equal(state.evidence.vendorComparisonUiReady, false);
  assert.ok(!state.summaryLabels.includes("vendor comparison UI proof ready"));
  assert.ok(state.missingRequiredEvidenceLabels.some((label) =>
    /Vendor comparison UI proof is blocked/.test(label)
    && /Multi-select vendor controls are not mounted/.test(label)
    && /Follow-up queue action is not mounted/.test(label)
    && /Selected-vendor projection fan-out is not mounted/.test(label)
  ));
});

test("buildWeddingProductionReadinessEvidenceState requires approval UI proof reference in strict mode", () => {
  const readyApprovalUi = {
    productionEvidenceReady: true,
    proofReferenceLabels: ["approval-ui:playwright:oracle-prod-1"],
  };
  const missingRef = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    approvalUi: { productionEvidenceReady: true, proofReferenceLabels: [] } as any,
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    approvalUi: readyApprovalUi as any,
  });

  assert.equal(missingRef.evidence.approvalExecutionUiReady, false);
  assert.ok(missingRef.missingRequiredEvidenceLabels.some((label) =>
    /Approval UI proof reference is missing/i.test(label),
  ));
  assert.equal(ready.evidence.approvalExecutionUiReady, true);
  assert.ok(ready.durableProofReferenceLabels.includes("approval-ui:playwright:oracle-prod-1"));
});

test("buildWeddingProductionReadinessEvidenceState requires template launch proof reference in strict mode", () => {
  const missingRef = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    templateLaunchReadiness: {
      ...readyTemplateLaunchReadiness(),
      proofReferenceLabel: null,
    } as any,
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    templateLaunchReadiness: readyTemplateLaunchReadiness(),
  });

  assert.equal(missingRef.evidence.templateLaunchIntakeReady, false);
  assert.ok(missingRef.missingRequiredEvidenceLabels.some((label) =>
    /Wedding template launch proof reference is missing/i.test(label),
  ));
  assert.equal(ready.evidence.templateLaunchIntakeReady, true);
  assert.ok(ready.durableProofReferenceLabels.includes(
    "Wedding template launch proof: wedding-template:prod-smoke:2026-09-28",
  ));
});

test("buildWeddingProductionReadinessEvidenceState surfaces vendor quote reply UI blockers", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
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
  });

  assert.equal(state.evidence.vendorQuoteReplyUiReady, false);
  assert.ok(!state.summaryLabels.includes("vendor quote reply UI proof ready"));
  assert.ok(state.missingRequiredEvidenceLabels.some((label) =>
    /Inline email editor is not mounted/.test(label) &&
    /Separate budget acknowledgement control is not mounted/.test(label)
  ));
});

test("buildWeddingProductionReadinessEvidenceState surfaces vendor quote live proof blockers", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
    vendorQuoteReplyUi: readyVendorQuoteReplyUi(),
    vendorQuoteReplyProduction: {
      ...readyVendorQuoteReplyProduction(),
      status: "partial",
      productionReady: false,
      blockerLabels: ["Actual connected Gmail/provider send proof is not attached."],
      telemetryEvent: "wedding_vendor_quote_reply_production_readiness_blocked",
    },
  });

  assert.equal(state.evidence.vendorQuoteReplyUiReady, true);
  assert.equal(state.evidence.vendorQuoteReplyProductionReady, false);
  assert.ok(state.summaryLabels.includes("vendor quote reply UI proof ready"));
  assert.ok(!state.summaryLabels.includes("vendor quote reply live proof ready"));
  assert.ok(state.missingRequiredEvidenceLabels.includes(
    "Vendor quote reply live production proof is blocked: Actual connected Gmail/provider send proof is not attached.",
  ));
});

test("buildWeddingProductionReadinessEvidenceState normalizes noisy vendor quote production evidence labels", () => {
  const longBlockerLabel = `Actual connected Gmail/provider send proof is not attached because ${"receipt ".repeat(40)}`;
  const state = buildWeddingProductionReadinessEvidenceState({
    vendorQuoteReplyUi: readyVendorQuoteReplyUi(),
    vendorQuoteReplyProduction: {
      ...readyVendorQuoteReplyProduction(),
      status: "partial",
      productionReady: false,
      evidenceLabels: [
        "  Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123  ",
        "Actual   connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
        "",
      ],
      blockerLabels: [
        "  Actual connected Gmail/provider send proof is not attached.  ",
        "Actual   connected Gmail/provider send proof is not attached.",
        longBlockerLabel,
      ],
    },
  });

  assert.deepEqual(state.durableProofReferenceLabels, [
    "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
  ]);
  assert.deepEqual(state.missingRequiredEvidenceLabels, [
    "Backend pagination contract is missing.",
    "Backend saved-workspace scale proof is missing.",
    "Wedding template launch proof is missing.",
    "Approval UI proof is missing.",
    "Vendor comparison UI proof is missing.",
    `Vendor quote reply live production proof is blocked: Actual connected Gmail/provider send proof is not attached. ${longBlockerLabel}`.slice(0, 237) + "...",
    "Wedding dependency-plan expected behavior audit is missing.",
    "Wedding import parser readiness is missing.",
    "Shared wedding workspace access-control proof is missing.",
    "Collaborator lifecycle audit projection proof is missing.",
    "Admin-funded wedding AI routing policy proof is missing.",
    "Admin Oracle and user metrics proof is missing.",
    "Provider executor proof is missing.",
    "Oracle release proof is missing.",
  ]);
});

test("buildWeddingProductionReadinessEvidenceState blocks missing import parser readiness", () => {
  const state = buildWeddingProductionReadinessEvidenceState();

  assert.equal(state.evidence.importParserReady, false);
  assert.ok(!state.summaryLabels.includes("import parser readiness clear"));
  assert.ok(state.missingRequiredEvidenceLabels.includes("Wedding import parser readiness is missing."));
});

test("buildWeddingProductionReadinessEvidenceState reports blocked import parser details", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
    importParserReadiness: {
      productionReady: false,
      blockerLabels: ["Unreadable XLS import needs server parser proof."],
    } as any,
  });

  assert.equal(state.evidence.importParserReady, false);
  assert.ok(state.missingRequiredEvidenceLabels.some((label) => /Unreadable XLS import/.test(label)));
});

test("buildWeddingProductionReadinessEvidenceState requires import parser proof reference in strict mode", () => {
  const missingRef = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    importParserReadiness: {
      productionReady: true,
      blockerLabels: [],
      proofReferenceLabels: [],
    } as any,
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    importParserReadiness: {
      productionReady: true,
      blockerLabels: [],
      proofReferenceLabels: ["Wedding import parser proof: no-current-imports"],
    } as any,
  });

  assert.equal(missingRef.evidence.importParserReady, false);
  assert.ok(missingRef.missingRequiredEvidenceLabels.some((label) =>
    /Wedding import parser readiness proof reference is missing/i.test(label),
  ));
  assert.equal(ready.evidence.importParserReady, true);
  assert.ok(ready.durableProofReferenceLabels.includes("Wedding import parser proof: no-current-imports"));
});

test("buildWeddingProductionReadinessEvidenceState keeps collaboration lifecycle proof separate", () => {
  const blockedState = buildWeddingProductionReadinessEvidenceState({
    collaboration: { productionReady: true } as any,
  });
  const readyState = buildWeddingProductionReadinessEvidenceState({
    collaboration: { productionReady: true } as any,
    collaborationLifecycleProjectionReady: true,
  });

  assert.equal(blockedState.evidence.collaborationAccessControlsReady, true);
  assert.equal(blockedState.evidence.collaborationLifecycleAuditReady, false);
  assert.ok(blockedState.missingRequiredEvidenceLabels.includes("Collaborator lifecycle audit projection proof is missing."));
  assert.equal(readyState.evidence.collaborationLifecycleAuditReady, true);
  assert.ok(readyState.summaryLabels.includes("collaboration lifecycle audit ready"));
});

test("buildWeddingProductionReadinessEvidenceState requires collaboration access-control proof refs in strict mode", () => {
  const missingRef = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    collaboration: { productionReady: true, proofReferenceLabels: [] } as any,
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    collaboration: {
      productionReady: true,
      proofReferenceLabels: ["collaboration-access:oracle-prod-1:2026-09-28"],
    } as any,
  });

  assert.equal(missingRef.evidence.collaborationAccessControlsReady, false);
  assert.ok(missingRef.missingRequiredEvidenceLabels.some((label) =>
    /Shared wedding workspace access-control proof reference is missing/i.test(label),
  ));
  assert.equal(ready.evidence.collaborationAccessControlsReady, true);
  assert.ok(ready.durableProofReferenceLabels.includes("collaboration-access:oracle-prod-1:2026-09-28"));
});

test("buildWeddingProductionReadinessEvidenceState accepts structured collaboration lifecycle projection proof", () => {
  const blockedProof = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
  });
  const readyProof = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
    proofRef: "collaboration-lifecycle:oracle-prod-1:2026-09-15",
  });
  const blockedState = buildWeddingProductionReadinessEvidenceState({
    collaboration: { productionReady: true } as any,
    collaborationLifecycleProjectionProof: blockedProof,
  });
  const readyState = buildWeddingProductionReadinessEvidenceState({
    collaboration: { productionReady: true } as any,
    collaborationLifecycleProjectionProof: readyProof,
  });

  assert.equal(blockedState.evidence.collaborationLifecycleAuditReady, false);
  assert.ok(blockedState.missingRequiredEvidenceLabels.some((label) => /revocation projection proof is missing/i.test(label)));
  assert.equal(readyState.evidence.collaborationLifecycleAuditReady, true);
  assert.ok(readyState.summaryLabels.includes("collaboration lifecycle audit ready"));
  assert.ok(readyState.summaryLabels.includes("collaboration lifecycle proof: collaboration-lifecycle:oracle-prod-1:2026-09-15"));
});

test("buildWeddingProductionReadinessEvidenceState requires collaboration lifecycle proof refs in strict mode", () => {
  const completeNoRef = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
  });
  const legacyBooleanState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    collaboration: { productionReady: true } as any,
    collaborationLifecycleProjectionReady: true,
  });
  const noRefState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    collaboration: { productionReady: true } as any,
    collaborationLifecycleProjectionProof: completeNoRef,
  });
  const readyState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    collaboration: { productionReady: true } as any,
    collaborationLifecycleProjectionProof: buildWeddingCollaborationLifecycleProjectionProofState({
      projectedKinds: ["invite", "expire", "revoke", "review"],
      guardedAccessControlProjection: true,
      sharedEditingDisabledByDefault: true,
      backendGrantBlockedWithoutAcl: true,
      searchableAfpRecords: true,
      proofRef: "collaboration-lifecycle:oracle-prod-1:2026-09-15",
      proofReferencePolicy: "required",
    }),
  });

  assert.equal(legacyBooleanState.evidence.collaborationLifecycleAuditReady, false);
  assert.equal(noRefState.evidence.collaborationLifecycleAuditReady, false);
  assert.ok(noRefState.missingRequiredEvidenceLabels.some((label) => /proof reference/i.test(label)));
  assert.equal(readyState.evidence.collaborationLifecycleAuditReady, true);
});

test("buildWeddingProductionReadinessEvidenceState derives seeded vendor corpus proof conservatively", () => {
  const readyState = buildWeddingProductionReadinessEvidenceState({
    seededVendorCorpus: seededVendorCorpus(),
  });
  const tooSmallState = buildWeddingProductionReadinessEvidenceState({
    seededVendorCorpus: buildWeddingVendorSeedState({
      now: new Date("2026-09-14T12:00:00Z"),
      seeds: [{
        vendorSlug: "one",
        vendorName: "One Vendor",
        category: "Venue",
        serviceArea: "Sydney, NSW",
        websiteUrl: "https://one.example",
        sourceUrl: "https://one.example/source",
        sourceLabel: "One source",
        sourceCheckedAt: "2026-09-14",
      }],
    }),
  });

  assert.equal(readyState.evidence.seededVendorCorpusReady, true);
  assert.ok(readyState.summaryLabels.includes("seeded vendor corpus ready"));
  assert.equal(tooSmallState.evidence.seededVendorCorpusReady, false);
  assert.ok(!tooSmallState.missingRequiredEvidenceLabels.some((label) => /vendor corpus/i.test(label)));
});

test("buildWeddingProductionReadinessEvidenceState requires seeded vendor corpus proof in strict mode", () => {
  const proofRef = "seeded-vendor-corpus:prod-smoke:2026-09-28";
  const missingRefState = buildWeddingProductionReadinessEvidenceState({ strictOracleProofs: true, seededVendorCorpus: seededVendorCorpus() });
  const readyState = buildWeddingProductionReadinessEvidenceState({ strictOracleProofs: true, seededVendorCorpus: seededVendorCorpus([proofRef]) });
  assert.equal(missingRefState.evidence.seededVendorCorpusReady, false);
  assert.ok(missingRefState.missingRequiredEvidenceLabels.some((label) => /seeded vendor corpus/i.test(label)));
  assert.equal(readyState.evidence.seededVendorCorpusReady, true);
  assert.ok(readyState.durableProofReferenceLabels.includes(proofRef));
});

test("buildWeddingProductionReadinessEvidenceState keeps pagination contract separate from scale proof", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
    backendPaginationContractReady: true,
    backendScaleProof: blockedScaleProof as any,
  });

  assert.equal(state.evidence.backendPaginationReady, true);
  assert.equal(state.evidence.backendScaleProofReady, false);
  assert.ok(state.summaryLabels.includes("backend pagination contract ready"));
  assert.ok(state.missingRequiredEvidenceLabels.includes("Backend saved-workspace scale proof is missing."));
});

test("buildWeddingProductionReadinessEvidenceState can require durable scale-proof receipt", () => {
  const blockedState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    backendPaginationContractReady: true,
    backendPaginationProofRef: "backend-pagination:oracle-prod-1:2026-09-14",
    backendScaleProof: readyScaleProof as any,
  });
  const readyState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    backendPaginationContractReady: true,
    backendPaginationProofRef: "backend-pagination:oracle-prod-1:2026-09-14",
    backendScaleProof: readyScaleProofWithReceipt as any,
  });

  assert.equal(blockedState.evidence.backendScaleProofReady, false);
  assert.equal(blockedState.backendScaleProofPacket?.status, "blocked");
  assert.equal(blockedState.backendScaleProofPacket?.canClearBackendScaleGate, false);
  assert.ok(blockedState.missingRequiredEvidenceLabels.includes("Backend saved-workspace scale proof reference is missing."));
  assert.equal(readyState.evidence.backendScaleProofReady, true);
  assert.equal(readyState.backendScaleProofPacket?.status, "ready");
  assert.equal(readyState.backendScaleProofPacket?.canClearBackendScaleGate, true);
  assert.ok(readyState.summaryLabels.includes("backend scale proof ready"));
});

test("buildWeddingProductionReadinessEvidenceState follows scale proof packet completeness in strict mode", () => {
  const incompleteScaleProof = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 2,
    totalLoaded: 160,
    maxPageMs: 700,
    duplicateMessageIds: [],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
    proofReferencePolicy: "required",
    proofRef: "refresh-scale:oracle-prod-1:missing-offsets",
  });
  const state = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    backendPaginationContractReady: true,
    backendPaginationProofRef: "backend-pagination:oracle-prod-1:2026-09-14",
    backendScaleProof: incompleteScaleProof,
  });

  assert.equal(incompleteScaleProof.status, "pass");
  assert.equal(state.evidence.backendScaleProofReady, false);
  assert.equal(state.backendScaleProofPacket?.canClearBackendScaleGate, false);
  assert.ok(state.backendScaleProofPacket?.missingEvidenceLabels.includes("Sequential page offsets: evidence required"));
});

test("buildWeddingProductionReadinessEvidenceState can require complete Oracle release proof references", () => {
  const blockedState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    oracleReleaseGate: {
      productionEvidenceReady: true,
      proofReferenceLabels: ["Oracle remote proof: oracle-proof:prod-1"],
    } as any,
  });
  const readyState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    oracleReleaseGate: {
      productionEvidenceReady: true,
      proofReferenceLabels: [
        "release-readiness proof: release:ok",
        "production go/no-go proof: go-no-go:ok",
        "backup verification proof: backup:ok",
        "restore drill proof: restore:ok",
        "secret sync proof: secret-sync:ok",
        "Oracle remote proof: oracle-remote:ok",
      ],
    } as any,
  });

  assert.equal(blockedState.evidence.oracleReleaseGateReady, false);
  assert.ok(blockedState.missingRequiredEvidenceLabels.includes("Oracle release proof references are incomplete."));
  assert.equal(blockedState.oracleReleaseProofPacket?.status, "blocked");
  assert.equal(blockedState.oracleReleaseProofPacket?.canClearOracleReleaseGate, false);
  assert.equal(readyState.evidence.oracleReleaseGateReady, true);
  assert.equal(readyState.oracleReleaseProofPacket?.status, "ready");
  assert.equal(readyState.oracleReleaseProofPacket?.canClearOracleReleaseGate, true);
  assert.ok(readyState.summaryLabels.includes("Oracle release proof ready"));
});

test("buildWeddingProductionReadinessEvidenceState requires all external provider executors", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
    providerExecutors: [
      { capability: "email", requiredProvider: "Gmail or email provider", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
      { capability: "calendar", requiredProvider: "Google Calendar or calendar provider", credentialStatus: "connected", executorStatus: "missing", productionReady: false } as any,
      { capability: "vendor_search", requiredProvider: "Brave Search, EXA Search, Google Places, or OSM/Overpass provider", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
      { capability: "none", requiredProvider: null, productionReady: true } as any,
    ],
  });

  assert.equal(state.evidence.providerExecutorsReady, false);
  assert.ok(state.missingRequiredEvidenceLabels.includes("Provider executor proof is missing."));
  assert.equal(state.providerExecutorUnblockPlan.status, "blocked");
  assert.equal(state.providerExecutorProofPacket.status, "blocked");
  assert.equal(state.providerExecutorProofPacket.canClearOracleProviderGate, false);
  assert.ok(state.providerExecutorUnblockPlan.steps.some((step) => step.capability === "calendar" && step.kind === "build_executor"));
});

test("buildWeddingProductionReadinessEvidenceState accepts explicit provider suite proof", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
    providerExecutors: [
      { capability: "email", requiredProvider: "Gmail or email provider", productionReady: true } as any,
    ],
    providerExecutorSuite: {
      productionEvidenceReady: true,
      proofReferenceLabels: [
        "Gmail or email provider executor proof: email-smoke:ok",
        "Google Calendar or calendar provider executor proof: calendar-smoke:ok",
        "Registry provider executor proof: registry-smoke:ok",
        "Brave Search, EXA Search, Google Places, or OSM/Overpass provider executor proof: vendor-search-smoke:ok",
      ],
    } as any,
  });

  assert.equal(state.evidence.providerExecutorsReady, true);
  assert.equal(state.providerExecutorUnblockPlan.status, "ready");
  assert.equal(state.providerExecutorProofPacket.status, "ready");
  assert.equal(state.providerExecutorUnblockPlan.nextStep, null);
});

test("buildWeddingProductionReadinessEvidenceState can require provider executor proof references", () => {
  const blockedState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    providerExecutorSuite: {
      productionEvidenceReady: true,
      proofReferenceLabels: ["Gmail or email provider executor proof: email-smoke:ok"],
    } as any,
  });
  const readyState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    providerExecutorSuite: {
      productionEvidenceReady: true,
      proofReferenceLabels: [
        "Gmail or email provider executor proof: email-smoke:ok",
        "Google Calendar or calendar provider executor proof: calendar-smoke:ok",
        "Registry provider executor proof: registry-smoke:ok",
        "Brave Search, EXA Search, Google Places, or OSM/Overpass provider executor proof: vendor-search-smoke:ok",
      ],
    } as any,
  });

  assert.equal(blockedState.evidence.providerExecutorsReady, false);
  assert.ok(blockedState.missingRequiredEvidenceLabels.includes("Provider executor proof references are incomplete."));
  assert.equal(readyState.evidence.providerExecutorsReady, true);
  assert.ok(readyState.summaryLabels.includes("provider executors ready"));
});

test("buildWeddingProductionReadinessEvidenceState follows provider proof packet for weak aggregate refs", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    providerExecutorSuite: {
      productionEvidenceReady: true,
      proofReferenceLabels: [
        "Gmail or email provider executor proof: https://audit.omnyid.example/email",
        "Google Calendar or calendar provider executor proof: data:application/json,{}",
        "Registry provider executor proof: registry-smoke:fake:latest",
        "Brave Search, EXA Search, Google Places, or OSM/Overpass provider executor proof: vendor-search-smoke:ok",
      ],
    } as any,
  });

  assert.equal(state.providerExecutorProofPacket.canClearOracleProviderGate, false);
  assert.equal(state.evidence.providerExecutorsReady, false);
  assert.ok(state.missingRequiredEvidenceLabels.includes("Provider executor proof references are incomplete."));
  assert.ok(state.providerExecutorProofPacket.missingProofRefs.includes("Gmail or email provider: proof receipt required"));
  assert.ok(state.providerExecutorProofPacket.missingProofRefs.includes("Google Calendar or calendar provider: proof receipt required"));
  assert.ok(state.providerExecutorProofPacket.missingProofRefs.includes("Registry provider: proof receipt required"));
});

test("buildWeddingProductionReadinessEvidenceState derives provider gate from live smoke receipts", () => {
  const smokeProof = buildWeddingProviderExecutorSmokeProofState({
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
          delivery: {
            channel: "email",
            to: ["events@venue.example"],
            subject: "Wedding planning follow-up",
            text: "Hi, we are following up on our wedding planning request.",
          },
        },
      },
      {
        id: "receipt:calendar",
        requestId: "request:calendar",
        actionKind: "create_external_calendar_event",
        title: "Create venue tour",
        status: "executed",
        createdAt: "2026-09-15T00:00:00.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
          provider_event_id: "gcal:event-1",
          provider_event_link: "https://calendar.example/event-1",
        },
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
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
          provider_receipt_id: "registry:publish-1",
        },
      },
    ],
    vendorSearchReceipts: [{
      proofRef: "vendor-search:smoke:oracle-prod-1",
      providerLabels: ["Brave Search"],
      sourceUrls: ["https://search.example/sydney-celebrants"],
      sourceUrlCount: 6,
      queryContextLabel: "Sydney celebrants",
    }],
  });
  const state = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    providerExecutorSmokeProof: smokeProof,
  });

  assert.equal(state.evidence.providerExecutorsReady, true);
  assert.equal(state.providerExecutorProofPacket.canClearOracleProviderGate, true);
  assert.ok(state.summaryLabels.includes("provider executors ready"));
});

test("buildWeddingProductionReadinessEvidenceState blocks weak live receipts without durable provider ids", () => {
  const smokeProof = buildWeddingProviderExecutorSmokeProofState({
    requiredCapabilities: ["calendar"],
    approvalReceipts: [
      {
        id: "receipt:calendar-local-only",
        requestId: "request:calendar",
        actionKind: "create_external_calendar_event",
        title: "Create venue tour",
        status: "executed",
        createdAt: "2026-09-15T00:00:00.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
          provider_event_link: "https://calendar.example/event-1",
        },
      },
    ],
  });
  const state = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    providerExecutorSmokeProof: smokeProof,
  });

  assert.equal(state.evidence.providerExecutorsReady, false);
  assert.equal(state.providerExecutorProofPacket.canClearOracleProviderGate, false);
  assert.ok(state.missingRequiredEvidenceLabels.some((label) =>
    /Provider executor proof is blocked/i.test(label) && /calendar provider smoke proof is missing/i.test(label),
  ));
});

test("buildWeddingProductionReadinessEvidenceState keeps dry-run smoke receipts blocked", () => {
  const smokeProof = buildWeddingProviderExecutorSmokeProofState({
    requiredCapabilities: ["email"],
    approvalReceipts: [{
      id: "receipt:email-dry-run",
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
  });
  const state = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    providerExecutorSmokeProof: smokeProof,
  });

  assert.equal(state.evidence.providerExecutorsReady, false);
  assert.equal(state.providerExecutorProofPacket.canClearOracleProviderGate, false);
  assert.ok(state.providerExecutorProofPacket.capabilityPackets.some((packet) => (
    packet.capability === "email" &&
    packet.blockers.some((blocker) => /credentials are missing|not production-ready/i.test(blocker))
  )));
});

test("buildWeddingProductionReadinessEvidenceState derives vendor-search proof from connected search providers", () => {
  for (const connectedAppId of ["brave-search-api", "google-places-api", "overpass-api"]) {
    const state = buildWeddingProductionReadinessEvidenceState({
      connectedAppIds: [connectedAppId],
      vendorSearchExecutorAvailable: true,
      providerExecutors: [
        { capability: "email", requiredProvider: "Gmail or email provider", productionReady: true } as any,
        { capability: "calendar", requiredProvider: "Google Calendar or calendar provider", productionReady: true } as any,
        { capability: "registry", requiredProvider: "Registry provider", productionReady: true } as any,
      ],
    });

    assert.equal(state.evidence.providerExecutorsReady, true, connectedAppId);
    assert.ok(state.summaryLabels.includes("provider executors ready"), connectedAppId);
  }
});

test("buildWeddingProductionReadinessEvidenceState derives vendor-search proof from server env state", () => {
  const vendorSearchProviders = buildWeddingVendorSearchProviderEnvState({
    OMNYID_GOOGLE_PLACES_API_KEY: "secret-google-key",
    OMNYID_OVERPASS_API_URL: "https://overpass-api.de/api/interpreter",
    OMNYID_OVERPASS_CONTACT_EMAIL: "ops@example.com",
    OMNYID_OVERPASS_RATE_LIMIT_PER_MINUTE: "30",
  });
  const state = buildWeddingProductionReadinessEvidenceState({
    vendorSearchProviders,
    vendorSearchExecutorAvailable: true,
    providerExecutors: [
      { capability: "email", requiredProvider: "Gmail or email provider", productionReady: true } as any,
      { capability: "calendar", requiredProvider: "Google Calendar or calendar provider", productionReady: true } as any,
      { capability: "registry", requiredProvider: "Registry provider", productionReady: true } as any,
    ],
  });

  assert.equal(state.evidence.providerExecutorsReady, true);
  assert.ok(state.summaryLabels.includes("provider executors ready"));
  assert.doesNotMatch(JSON.stringify(state), /secret-google-key/);
});

test("buildWeddingProductionReadinessEvidenceState does not let vendor-search connection mask missing provider gates", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
    connectedAppIds: ["google-places-api"],
    vendorSearchExecutorAvailable: true,
    providerExecutors: [
      { capability: "email", requiredProvider: "Gmail or email provider", productionReady: true } as any,
    ],
  });

  assert.equal(state.evidence.providerExecutorsReady, false);
  assert.ok(state.missingRequiredEvidenceLabels.includes("Provider executor proof is missing."));
});

test("buildWeddingProductionReadinessEvidenceState derives expected behaviour coverage from audit blockers", () => {
  const readyState = buildWeddingProductionReadinessEvidenceState({
    expectedBehaviorAudit: { productionBlockerLabels: [] } as any,
  });
  const blockedState = buildWeddingProductionReadinessEvidenceState({
    expectedBehaviorAudit: { productionBlockerLabels: ["Weather contingency: Needs provider proof."] } as any,
  });

  assert.equal(readyState.evidence.expectedBehaviorCoverageReady, true);
  assert.ok(readyState.summaryLabels.includes("expected behaviour audit ready"));
  assert.equal(blockedState.evidence.expectedBehaviorCoverageReady, false);
  assert.ok(blockedState.missingRequiredEvidenceLabels.some((label) => (
    /expected behavior audit is incomplete/i.test(label)
    && /Weather contingency/i.test(label)
  )));
});

test("buildWeddingProductionReadinessEvidenceState derives admin AI routing policy proof conservatively", () => {
  const blockedState = buildWeddingProductionReadinessEvidenceState({
    adminWeddingAiRoutingPolicy: buildAdminWeddingAiRoutingPolicyState({
      backendPolicyEndpointMounted: true,
      auditReceiptProjectionReady: true,
    }),
  });
  const readyState = buildWeddingProductionReadinessEvidenceState({
    adminWeddingAiRoutingPolicy: buildAdminWeddingAiRoutingPolicyState({
      backendPolicyEndpointMounted: true,
      auditReceiptProjectionReady: true,
      tenantBoundaryEnforced: true,
      budgetGuardrailsReady: true,
      weddingTemplateScopeOnly: true,
      masterAgentQueryExcluded: true,
    }),
  });

  assert.equal(blockedState.evidence.adminAiRoutingPolicyReady, false);
  assert.ok(blockedState.missingRequiredEvidenceLabels.includes("Admin-funded wedding AI routing policy proof is missing."));
  assert.equal(readyState.evidence.adminAiRoutingPolicyReady, true);
  assert.ok(readyState.summaryLabels.includes("admin AI routing policy ready"));
});

test("buildWeddingProductionReadinessEvidenceState can require admin routing policy proof reference", () => {
  const policyInput = {
    backendPolicyEndpointMounted: true,
    auditReceiptProjectionReady: true,
    tenantBoundaryEnforced: true,
    budgetGuardrailsReady: true,
    weddingTemplateScopeOnly: true,
    masterAgentQueryExcluded: true,
  };
  const blockedState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    adminWeddingAiRoutingPolicy: buildAdminWeddingAiRoutingPolicyState({
      ...policyInput,
      lastVerifiedAt: "2026-09-14T09:00:00.000Z",
    }),
  });
  const readyState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    adminWeddingAiRoutingPolicy: buildAdminWeddingAiRoutingPolicyState({
      ...policyInput,
      lastVerifiedAt: "2026-09-14T09:00:00.000Z",
      policyProofRef: "admin-routing-policy:oracle-prod-1:2026-09-14",
    }),
  });

  assert.equal(blockedState.evidence.adminAiRoutingPolicyReady, false);
  assert.ok(blockedState.missingRequiredEvidenceLabels.includes("Admin-funded wedding AI routing policy proof reference is missing."));
  assert.equal(readyState.evidence.adminAiRoutingPolicyReady, true);
  assert.ok(readyState.summaryLabels.includes("admin AI routing policy ready"));
});

test("buildWeddingProductionReadinessEvidenceState derives admin ops backend metrics proof conservatively", () => {
  const blockedState = buildWeddingProductionReadinessEvidenceState({
    adminOpsBackendMetrics: buildAdminWeddingOpsBackendMetricsReadinessState({
      operatorUsers: { users: [], limit: 25, total_users: 12 },
    }),
  });
  const readyState = buildWeddingProductionReadinessEvidenceState({
    adminOpsBackendMetrics: buildAdminWeddingOpsBackendMetricsReadinessState({
      operatorUsers: { users: [], limit: 25, total_users: 12 },
      oracleMetrics: {
        diskUsedLabel: "31 GB",
        diskTotalLabel: "100 GB",
        ramUsedLabel: "3.2 GB",
        ramTotalLabel: "8 GB",
        sourceLabel: "oracle-prod-1",
      },
    }),
  });

  assert.equal(blockedState.evidence.adminOpsBackendMetricsReady, false);
  assert.ok(blockedState.missingRequiredEvidenceLabels.includes("Admin Oracle and user metrics proof is missing."));
  assert.equal(readyState.evidence.adminOpsBackendMetricsReady, true);
  assert.ok(readyState.summaryLabels.includes("admin ops backend metrics ready"));
});

test("buildWeddingProductionReadinessEvidenceState requires admin ops proof reference in strict mode", () => {
  const baseMetrics = {
    operatorUsers: { users: [], limit: 25, total_users: 12 },
    oracleMetrics: {
      diskUsedLabel: "31 GB",
      diskTotalLabel: "100 GB",
      ramUsedLabel: "3.2 GB",
      ramTotalLabel: "8 GB",
      sourceLabel: "oracle-prod-1",
      collectedAtLabel: "2026-09-28T10:00:00Z",
      metricAgeMinutes: 4,
      maxMetricAgeMinutes: 15,
    },
  } as const;
  const missingRef = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    adminOpsBackendMetrics: buildAdminWeddingOpsBackendMetricsReadinessState({
      operatorUsers: baseMetrics.operatorUsers,
      oracleMetrics: {
        diskUsedLabel: baseMetrics.oracleMetrics.diskUsedLabel,
        diskTotalLabel: baseMetrics.oracleMetrics.diskTotalLabel,
        ramUsedLabel: baseMetrics.oracleMetrics.ramUsedLabel,
        ramTotalLabel: baseMetrics.oracleMetrics.ramTotalLabel,
        sourceLabel: baseMetrics.oracleMetrics.sourceLabel,
      },
    }),
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    adminOpsBackendMetrics: buildAdminWeddingOpsBackendMetricsReadinessState({
      ...baseMetrics,
      freshnessPolicy: "required",
      oracleMetrics: {
        ...baseMetrics.oracleMetrics,
        proofRef: "oracle-metrics:prod-1:2026-09-28T10",
      },
    }),
  });

  assert.equal(missingRef.evidence.adminOpsBackendMetricsReady, false);
  assert.ok(missingRef.missingRequiredEvidenceLabels.includes("Admin Oracle and user metrics proof reference is missing."));
  assert.equal(ready.evidence.adminOpsBackendMetricsReady, true);
  assert.ok(ready.durableProofReferenceLabels.some((label) => /oracle-metrics:prod-1:2026-09-28T10/i.test(label)));
});
