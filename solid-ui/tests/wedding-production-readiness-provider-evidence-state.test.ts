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
