import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingNativeExportWorkerReadinessState } from "@/lib/weddingNativeExportWorkerReadinessState";
import { buildWeddingNeedToKnowLlmReadinessState } from "@/lib/weddingNeedToKnowLlmReadinessState";
import { buildWeddingProductionReadinessEvidenceState } from "@/lib/weddingProductionReadinessEvidenceState";
import { buildWeddingMapGeocodingReadinessState } from "@/lib/weddingMapGeocodingReadinessState";
import { buildWeddingGraphCanvasReadinessState } from "@/lib/weddingGraphCanvasReadinessState";
import { buildWeddingVendorSeedState } from "@/lib/weddingVendorSeedState";
import { buildWeddingExpectedBehaviorAuditState } from "@/lib/weddingExpectedBehaviorAuditState";

function readyNativeExportWorkers() {
  return buildWeddingNativeExportWorkerReadinessState({
    workers: [
      {
        id: "zip_packet_worker",
        connected: true,
        supportsSensitiveFilter: true,
        supportsDeterministicFilename: true,
        supportsReceipt: true,
        supportsFailureCopy: true,
        proofReferenceLabel: "native-export:zip_packet_worker:oracle-prod-1:2026-09-28",
      },
      {
        id: "docx_packet_worker",
        connected: true,
        supportsSensitiveFilter: true,
        supportsDeterministicFilename: true,
        supportsReceipt: true,
        supportsFailureCopy: true,
        proofReferenceLabel: "native-export:docx_packet_worker:oracle-prod-1:2026-09-28",
      },
      {
        id: "image_packet_worker",
        connected: true,
        supportsSensitiveFilter: true,
        supportsDeterministicFilename: true,
        supportsReceipt: true,
        supportsFailureCopy: true,
        proofReferenceLabel: "native-export:image_packet_worker:oracle-prod-1:2026-09-28",
      },
    ],
  });
}

function readyNeedToKnowLlmExtraction() {
  return buildWeddingNeedToKnowLlmReadinessState({
    llmExtractorConnected: true,
    transcriptInputsTested: 3,
    chatInputsTested: 3,
    extractedSlots: [
      "date_or_season",
      "location",
      "guest_count",
      "budget_comfort",
      "priorities",
      "noim_status",
      "celebrant_path",
    ],
    reviewLabelsProduced: ["Approximate guest count needs review"],
    deterministicFallbackAvailable: true,
    afpProjectionReady: true,
    preventsOverwriteWithoutReview: true,
    proofReferenceLabels: ["need-to-know-llm:oracle-prod-1:2026-09-28"],
  });
}

function readyMapGeocoding() {
  return buildWeddingMapGeocodingReadinessState({
    provider: "google_maps",
    geocodingConnected: true,
    routingConnected: true,
    locationsRequested: 2,
    locationsVerified: 2,
    routesRequested: 1,
    routesVerified: 1,
    maxRouteAgeMinutes: 12,
    hasTravelTimeCaveat: true,
    hasFallbackMapUrl: true,
    proofReferenceLabels: ["map-geocoding:oracle-prod-1:2026-09-28"],
  });
}

function readyGraphCanvas() {
  return buildWeddingGraphCanvasReadinessState({
    focusNodeIds: ["node:venue", "node:risk"],
    focusEdgeIds: ["edge:venue-risk"],
    highlightedNodeIds: ["node:venue", "node:risk"],
    highlightedEdgeIds: ["edge:venue-risk"],
    dimmedOutsideFocus: true,
    arrivalIntentConsumed: true,
    hasClearFocusControl: true,
    hasPathEmphasisLegend: true,
    proofReferenceLabels: ["graph-canvas:oracle-prod-1:2026-09-28"],
  });
}

function readySeededVendorCorpus() {
  const categories = ["Venue", "Florist", "DJ", "Caterer", "Cake Baker", "Photographer"];
  return buildWeddingVendorSeedState({
    now: new Date("2026-09-14T12:00:00Z"),
    location: "Sydney",
    selectedCategories: categories,
    preferenceText: "transparent pricing current availability",
    proofReferenceLabels: ["seeded-vendor-corpus:oracle-prod-1:2026-09-28"],
    seeds: Array.from({ length: 10 }, (_, index) => ({
      vendorSlug: `vendor-${index + 1}`,
      vendorName: `Vendor ${index + 1}`,
      category: categories[index % categories.length],
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

function readyExpectedBehaviorAudit() {
  return buildWeddingExpectedBehaviorAuditState({
    hasPlanningContext: true,
    hasDecisionProjection: true,
    hasNeedToKnowProbing: true,
    hasVendorChecklist: true,
    hasVendorSearchPlanning: true,
    vendorSearchProviderReady: true,
    approvalUiReady: true,
    providerExecutorsReady: true,
    hasLegalAdministration: true,
    hasAustralianLegalSetup: true,
    hasFinalPhaseCoordination: true,
    hasLifecycleManagement: true,
    weatherProviderReady: true,
    rsvpProviderReady: true,
    seatingCanvasReady: true,
    liveRunSheetExecutionReady: true,
    guestMessagingProviderReady: true,
    paymentVerificationProviderReady: true,
    hasPostWeddingWrapUp: true,
    hasPostWeddingFeedbackCollection: true,
    hasPostWeddingKeepsakeExport: true,
    proofReferenceLabels: ["expected-behavior-audit:oracle-prod-1:2026-09-28"],
  });
}

test("production evidence requires expected-behaviour audit proof reference in strict mode", () => {
  const blocked = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    expectedBehaviorAudit: {
      productionBlockerLabels: [],
      proofReferenceLabels: [],
    } as any,
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    expectedBehaviorAudit: readyExpectedBehaviorAudit(),
  });

  assert.equal(blocked.evidence.expectedBehaviorCoverageReady, false);
  assert.ok(blocked.missingRequiredEvidenceLabels.some((label) => /expected behavior audit proof reference/i.test(label)));
  assert.equal(ready.evidence.expectedBehaviorCoverageReady, true);
  assert.ok(ready.summaryLabels.includes("expected behaviour audit ready"));
  assert.ok(ready.durableProofReferenceLabels.includes("expected-behavior-audit:oracle-prod-1:2026-09-28"));
});

test("production evidence requires seeded vendor corpus proof reference in strict mode", () => {
  const blocked = buildWeddingProductionReadinessEvidenceState({
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
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    seededVendorCorpus: readySeededVendorCorpus(),
  });

  assert.equal(blocked.evidence.seededVendorCorpusReady, false);
  assert.ok(blocked.missingRequiredEvidenceLabels.some((label) => /seeded vendor corpus proof reference/i.test(label)));
  assert.equal(ready.evidence.seededVendorCorpusReady, true);
  assert.ok(ready.summaryLabels.includes("seeded vendor corpus ready"));
  assert.ok(ready.durableProofReferenceLabels.includes("seeded-vendor-corpus:oracle-prod-1:2026-09-28"));
});

test("production evidence requires map/geocoding proof reference in strict mode", () => {
  const blocked = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    liveMapGeocoding: {
      productionEvidenceReady: true,
      proofReferenceLabels: [],
    } as any,
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    liveMapGeocoding: readyMapGeocoding(),
  });

  assert.equal(blocked.evidence.liveMapGeocodingReady, false);
  assert.ok(blocked.missingRequiredEvidenceLabels.some((label) => /map\/geocoding proof reference/i.test(label)));
  assert.equal(ready.evidence.liveMapGeocodingReady, true);
  assert.ok(ready.summaryLabels.includes("live map/geocoding proof ready"));
  assert.ok(ready.durableProofReferenceLabels.includes("map-geocoding:oracle-prod-1:2026-09-28"));
});

test("production evidence requires graph canvas proof reference in strict mode", () => {
  const blocked = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    graphCanvasHighlighting: {
      productionEvidenceReady: true,
      proofReferenceLabels: [],
    } as any,
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    graphCanvasHighlighting: readyGraphCanvas(),
  });

  assert.equal(blocked.evidence.graphCanvasHighlightingReady, false);
  assert.ok(blocked.missingRequiredEvidenceLabels.some((label) => /graph canvas proof reference/i.test(label)));
  assert.equal(ready.evidence.graphCanvasHighlightingReady, true);
  assert.ok(ready.summaryLabels.includes("graph canvas proof ready"));
  assert.ok(ready.durableProofReferenceLabels.includes("graph-canvas:oracle-prod-1:2026-09-28"));
});

test("production evidence requires native export proof references in strict mode", () => {
  const weakReadiness = {
    productionEvidenceReady: true,
    proofReferenceLabels: [],
  };
  const blocked = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    nativeExportWorkers: weakReadiness as any,
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    nativeExportWorkers: readyNativeExportWorkers(),
  });

  assert.equal(blocked.evidence.nativeExportWorkersReady, false);
  assert.ok(blocked.missingRequiredEvidenceLabels.some((label) => /native export worker proof references/i.test(label)));
  assert.equal(ready.evidence.nativeExportWorkersReady, true);
  assert.ok(ready.summaryLabels.includes("native export worker proof ready"));
  assert.ok(ready.durableProofReferenceLabels.some((label) => /zip_packet_worker/i.test(label)));
  assert.ok(ready.durableProofReferenceLabels.some((label) => /docx_packet_worker/i.test(label)));
  assert.ok(ready.durableProofReferenceLabels.some((label) => /image_packet_worker/i.test(label)));
});

test("production evidence requires Need-To-Know LLM proof reference in strict mode", () => {
  const blocked = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    llmNeedToKnowExtraction: {
      productionEvidenceReady: true,
      proofReferenceLabels: [],
    } as any,
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    llmNeedToKnowExtraction: readyNeedToKnowLlmExtraction(),
  });

  assert.equal(blocked.evidence.llmNeedToKnowExtractionReady, false);
  assert.ok(blocked.missingRequiredEvidenceLabels.some((label) => /Need-To-Know LLM extraction proof reference/i.test(label)));
  assert.equal(ready.evidence.llmNeedToKnowExtractionReady, true);
  assert.ok(ready.summaryLabels.includes("Need-To-Know LLM extraction proof ready"));
  assert.ok(ready.durableProofReferenceLabels.includes("need-to-know-llm:oracle-prod-1:2026-09-28"));
});
