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

function seededVendorCorpus() {
  return buildWeddingVendorSeedState({
    now: new Date("2026-09-14T12:00:00Z"),
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
    liveMapGeocoding: readyProof as any,
    graphCanvasHighlighting: readyProof as any,
    approvalUi: readyProof as any,
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
  assert.equal(state.evidence.liveMapGeocodingReady, true);
  assert.equal(state.evidence.graphCanvasHighlightingReady, true);
  assert.equal(state.evidence.approvalExecutionUiReady, true);
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
    backendScaleProof: readyScaleProof as any,
  });
  const readyState = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    backendPaginationContractReady: true,
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
      { capability: "vendor_search", requiredProvider: "Brave Search, Google Places, or OSM/Overpass provider", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
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
    providerExecutorSuite: { productionEvidenceReady: true } as any,
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
        "Brave Search, Google Places, or OSM/Overpass provider executor proof: vendor-search-smoke:ok",
      ],
    } as any,
  });

  assert.equal(blockedState.evidence.providerExecutorsReady, false);
  assert.ok(blockedState.missingRequiredEvidenceLabels.includes("Provider executor proof references are incomplete."));
  assert.equal(readyState.evidence.providerExecutorsReady, true);
  assert.ok(readyState.summaryLabels.includes("provider executors ready"));
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
