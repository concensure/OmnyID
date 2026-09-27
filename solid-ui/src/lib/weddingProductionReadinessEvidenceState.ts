// @locs-version: 2.0
import type { WeddingApprovalUiReadinessState } from "@/lib/weddingApprovalUiReadinessState";
import type { AdminWeddingAiRoutingPolicyState } from "@/lib/adminWeddingAiRoutingPolicyState";
import type { AdminWeddingOpsBackendMetricsReadinessState } from "@/lib/adminWeddingOpsBackendMetricsReadinessState";
import type { WeddingGraphCanvasReadinessState } from "@/lib/weddingGraphCanvasReadinessState";
import type { WeddingMapGeocodingReadinessState } from "@/lib/weddingMapGeocodingReadinessState";
import type { WeddingNativeExportWorkerReadinessState } from "@/lib/weddingNativeExportWorkerReadinessState";
import type { WeddingNeedToKnowLlmReadinessState } from "@/lib/weddingNeedToKnowLlmReadinessState";
import type { WeddingOracleReleaseGateReadinessState } from "@/lib/weddingOracleReleaseGateReadinessState";
import type { WeddingExpectedBehaviorAuditState } from "@/lib/weddingExpectedBehaviorAuditState";
import type { WeddingImportParserReadinessState } from "@/lib/weddingImportParserReadinessState";
import type { WeddingCollaborationState } from "@/lib/weddingCollaborationState";
import type { WeddingCollaborationLifecycleProjectionProofState } from "@/lib/weddingCollaborationLifecycleProjectionProofState";
import type { WeddingProductionReadinessEvidence } from "@/lib/weddingProductionReadinessState";
import type { WeddingVendorSeedState } from "@/lib/weddingVendorSeedState";
import {
  buildWeddingVendorSearchProviderReadinessFromConnectedApps,
  type WeddingProviderExecutorReadinessState,
} from "@/lib/weddingProviderExecutorReadinessState";
import type { WeddingProviderExecutorSuiteReadinessState } from "@/lib/weddingProviderExecutorSuiteReadinessState";
import {
  buildWeddingProviderExecutorSuiteReadinessState,
  WEDDING_REQUIRED_PROVIDER_EXECUTOR_CAPABILITIES,
} from "@/lib/weddingProviderExecutorSuiteReadinessState";
import {
  buildWeddingProviderExecutorUnblockPlanState,
  type WeddingProviderExecutorUnblockPlanState,
} from "@/lib/weddingProviderExecutorUnblockPlanState";
import {
  buildWeddingProviderExecutorProofPacketState,
  type WeddingProviderExecutorProofPacketState,
} from "@/lib/weddingProviderExecutorProofPacketState";
import type { WeddingVendorSearchProviderEnvState } from "@/lib/weddingVendorSearchProviderEnvState";
import type { WeddingVendorQuoteReplyProductionReadinessState } from "@/lib/weddingVendorQuoteReplyProductionReadinessState";
import type { WeddingVendorQuoteReplyUiReadinessState } from "@/lib/weddingVendorQuoteReplyUiReadinessState";
import type { WeddingTemplateProductionReadinessState } from "@/lib/weddingTemplateProductionReadinessState";
import type { WeddingWorkspaceRefreshScaleProofState } from "@/lib/weddingWorkspaceRefreshScaleProofState";
import {
  buildWeddingOracleReleaseProofPacketState,
  type WeddingOracleReleaseProofPacketState,
} from "@/lib/weddingOracleReleaseProofPacketState";
import {
  buildWeddingWorkspaceRefreshScaleProofPacketState,
  type WeddingWorkspaceRefreshScaleProofPacketState,
} from "@/lib/weddingWorkspaceRefreshScaleProofPacketState";
import type { WeddingProviderExecutorSmokeProofState } from "@/lib/weddingProviderExecutorSmokeProofState";
import type { WeddingApiStackState } from "@/lib/weddingApiStackState";
import {
  cleanWeddingProductionLabels,
  durableWeddingProductionProofLabels,
  hasDurableWeddingProductionProofLabel,
  isWeakWeddingProductionProofReference,
  joinWeddingProductionLabels,
} from "@/lib/weddingProductionLabelState";

export type WeddingProductionReadinessEvidenceInput = {
  strictOracleProofs?: boolean | null;
  backendPaginationContractReady?: boolean | null;
  backendPaginationProofRef?: string | null;
  backendScaleProof?: WeddingWorkspaceRefreshScaleProofState | null;
  templateLaunchReadiness?: WeddingTemplateProductionReadinessState | null;
  liveMapGeocoding?: WeddingMapGeocodingReadinessState | null;
  graphCanvasHighlighting?: WeddingGraphCanvasReadinessState | null;
  approvalUi?: WeddingApprovalUiReadinessState | null;
  vendorQuoteReplyUi?: WeddingVendorQuoteReplyUiReadinessState | null;
  vendorQuoteReplyProduction?: WeddingVendorQuoteReplyProductionReadinessState | null;
  nativeExportWorkers?: WeddingNativeExportWorkerReadinessState | null;
  llmNeedToKnowExtraction?: WeddingNeedToKnowLlmReadinessState | null;
  seededVendorCorpus?: WeddingVendorSeedState | null;
  expectedBehaviorAudit?: WeddingExpectedBehaviorAuditState | null;
  importParserReadiness?: WeddingImportParserReadinessState | null;
  collaboration?: WeddingCollaborationState | null;
  collaborationLifecycleProjectionProof?: WeddingCollaborationLifecycleProjectionProofState | null;
  collaborationLifecycleProjectionReady?: boolean | null;
  adminWeddingAiRoutingPolicy?: AdminWeddingAiRoutingPolicyState | null;
  adminOpsBackendMetrics?: AdminWeddingOpsBackendMetricsReadinessState | null;
  providerExecutors?: readonly WeddingProviderExecutorReadinessState[] | null;
  providerExecutorSuite?: WeddingProviderExecutorSuiteReadinessState | null;
  providerExecutorSmokeProof?: WeddingProviderExecutorSmokeProofState | null;
  connectedAppIds?: readonly string[] | null;
  vendorSearchProviders?: WeddingVendorSearchProviderEnvState | null;
  vendorSearchExecutorAvailable?: boolean | null;
  apiStack?: WeddingApiStackState | null;
  oracleReleaseGate?: WeddingOracleReleaseGateReadinessState | null;
};

export type WeddingProductionReadinessEvidenceState = {
  evidence: WeddingProductionReadinessEvidence;
  summaryLabels: string[];
  durableProofReferenceLabels: string[];
  missingRequiredEvidenceLabels: string[];
  vendorQuoteReplyUi: WeddingVendorQuoteReplyUiReadinessState | null;
  vendorQuoteReplyProduction: WeddingVendorQuoteReplyProductionReadinessState | null;
  templateLaunchReadiness: WeddingTemplateProductionReadinessState | null;
  providerExecutorUnblockPlan: WeddingProviderExecutorUnblockPlanState;
  providerExecutorProofPacket: WeddingProviderExecutorProofPacketState;
  oracleReleaseProofPacket: WeddingOracleReleaseProofPacketState | null;
  backendScaleProofPacket: WeddingWorkspaceRefreshScaleProofPacketState | null;
};

function allProviderExecutorsReady(
  providers: readonly WeddingProviderExecutorReadinessState[] | null | undefined,
): boolean {
  return WEDDING_REQUIRED_PROVIDER_EXECUTOR_CAPABILITIES.every((capability) =>
    (providers ?? []).some((provider) => provider.capability === capability && provider.productionReady),
  );
}

function providerExecutorsWithConnectedAppEvidence(
  input: WeddingProductionReadinessEvidenceInput,
): readonly WeddingProviderExecutorReadinessState[] | null | undefined {
  const providers = input.providerExecutors ?? [];
  const connectedAppIds = [
    ...(input.connectedAppIds ?? []),
    ...(input.vendorSearchProviders?.connectedAppIds ?? []),
  ];
  if (!connectedAppIds.length && input.vendorSearchExecutorAvailable == null) {
    return input.providerExecutors;
  }
  if (providers.some((provider) => provider.capability === "vendor_search")) {
    return providers;
  }
  return [
    ...providers,
    buildWeddingVendorSearchProviderReadinessFromConnectedApps({
      connectedAppIds,
      executorAvailable: input.vendorSearchExecutorAvailable,
    }),
  ];
}

function providerExecutorSuiteForPlan(
  input: WeddingProductionReadinessEvidenceInput,
  providers: readonly WeddingProviderExecutorReadinessState[] | null | undefined,
): WeddingProviderExecutorSuiteReadinessState {
  if (input.providerExecutorSuite?.checks) return input.providerExecutorSuite;
  if (input.providerExecutorSuite?.productionEvidenceReady === true) {
    return buildWeddingProviderExecutorSuiteReadinessState({
      providers: WEDDING_REQUIRED_PROVIDER_EXECUTOR_CAPABILITIES.map((capability) => ({
        capability,
        requiredProvider: null,
        credentialStatus: "connected",
        executorStatus: "available",
        productionReady: true,
        setupView: null,
        summary: "Provider executor ready from aggregate suite proof.",
        detail: "Detailed provider checks were not supplied.",
      })),
      executorProofRefs: proofRefsFromProviderSuite(input.providerExecutorSuite),
    });
  }
  if (input.providerExecutorSmokeProof) {
    return buildWeddingProviderExecutorSuiteReadinessState({
      providers: input.providerExecutorSmokeProof.providers,
      executorProofRefs: input.providerExecutorSmokeProof.executorProofRefs,
      proofReferencePolicy: "required",
    });
  }
  return buildWeddingProviderExecutorSuiteReadinessState({ providers });
}

function proofRefsFromProviderSuite(
  suite: WeddingProviderExecutorSuiteReadinessState,
): Partial<Record<(typeof WEDDING_REQUIRED_PROVIDER_EXECUTOR_CAPABILITIES)[number], string>> {
  const labels = suite.proofReferenceLabels ?? [];
  const refs: Partial<Record<(typeof WEDDING_REQUIRED_PROVIDER_EXECUTOR_CAPABILITIES)[number], string>> = {};
  for (const label of labels) {
    const value = typeof label === "string" ? label.trim() : "";
    const [, ref] = value.split(/:\s(.+)/, 2);
    if (!ref) continue;
    if (/Gmail|email provider/i.test(value)) refs.email = ref;
    if (/Google Calendar|calendar provider/i.test(value)) refs.calendar = ref;
    if (/Registry provider/i.test(value)) refs.registry = ref;
    if (/Brave Search|Google Places|OSM|Overpass/i.test(value)) refs.vendor_search = ref;
  }
  return refs;
}

function seededVendorCorpusReady(
  seedState: WeddingVendorSeedState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  return seedState?.status === "ready"
    && seedState.vendorCount >= 10
    && seedState.categoryCount >= 6
    && seedState.sourceCount >= 10
    && seedState.staleCount === 0
    && Boolean(seedState.summaryArtifact)
    && (!strictOracleProofs || hasDurableProofLabels(seedState.proofReferenceLabels));
}

function hasScaleProofReference(scaleProof: WeddingWorkspaceRefreshScaleProofState | null | undefined): boolean {
  return (scaleProof?.evidenceLabels ?? []).some((label) => /^Scale proof reference:/i.test(label));
}

function durableProofLabels(values: readonly (string | null | undefined)[] | null | undefined): string[] {
  return durableWeddingProductionProofLabels(values);
}

function hasDurableProofLabels(values: readonly (string | null | undefined)[] | null | undefined): boolean {
  return hasDurableWeddingProductionProofLabel(values);
}

function backendPaginationProofLabel(proofRef: string | null | undefined): string | null {
  const [label] = cleanWeddingProductionLabels([proofRef]);
  if (!label || isWeakWeddingProductionProofReference(label)) return null;
  return `Backend pagination contract proof: ${label}`;
}

function durableProofReferenceLabels(input: {
  backendPaginationProofLabel?: string | null;
  backendScaleProofPacket: WeddingWorkspaceRefreshScaleProofPacketState | null;
  providerExecutorProofPacket: WeddingProviderExecutorProofPacketState;
  oracleReleaseProofPacket: WeddingOracleReleaseProofPacketState | null;
  collaborationLifecycleProjectionProof?: WeddingCollaborationLifecycleProjectionProofState | null;
  adminWeddingAiRoutingPolicy?: AdminWeddingAiRoutingPolicyState | null;
  adminOpsBackendMetrics?: AdminWeddingOpsBackendMetricsReadinessState | null;
  liveMapGeocoding?: WeddingMapGeocodingReadinessState | null;
  graphCanvasHighlighting?: WeddingGraphCanvasReadinessState | null;
  approvalUi?: WeddingApprovalUiReadinessState | null;
  nativeExportWorkers?: WeddingNativeExportWorkerReadinessState | null;
  llmNeedToKnowExtraction?: WeddingNeedToKnowLlmReadinessState | null;
  importParserReadiness?: WeddingImportParserReadinessState | null;
  seededVendorCorpus?: WeddingVendorSeedState | null;
  expectedBehaviorAudit?: WeddingExpectedBehaviorAuditState | null;
  collaboration?: WeddingCollaborationState | null;
  vendorQuoteReplyProduction?: WeddingVendorQuoteReplyProductionReadinessState | null;
  templateLaunchReadiness?: WeddingTemplateProductionReadinessState | null;
}): string[] {
  const labels = [
    input.backendPaginationProofLabel ?? null,
    ...(input.backendScaleProofPacket?.requirements ?? [])
      .filter((requirement) => requirement.kind === "proof_ref" && requirement.evidenceLabel)
      .map((requirement) => requirement.evidenceLabel as string),
    ...input.providerExecutorProofPacket.capabilityPackets
      .filter((packet) => packet.proofRef)
      .map((packet) => `${packet.requiredProvider} proof: ${packet.proofRef}`),
    input.collaborationLifecycleProjectionProof?.proofReferenceLabel ?? null,
    ...(input.adminWeddingAiRoutingPolicy?.proofReferenceLabels ?? []),
    ...(input.adminOpsBackendMetrics?.evidenceLabels ?? []).filter((label) => /proof reference/i.test(label)),
    ...(input.liveMapGeocoding?.proofReferenceLabels ?? []),
    ...(input.graphCanvasHighlighting?.proofReferenceLabels ?? []),
    ...(input.approvalUi?.proofReferenceLabels ?? []),
    ...(input.nativeExportWorkers?.proofReferenceLabels ?? []),
    ...(input.llmNeedToKnowExtraction?.proofReferenceLabels ?? []),
    ...(input.importParserReadiness?.proofReferenceLabels ?? []),
    ...(input.seededVendorCorpus?.proofReferenceLabels ?? []),
    ...(input.expectedBehaviorAudit?.proofReferenceLabels ?? []),
    ...(input.collaboration?.proofReferenceLabels ?? []),
    ...(input.vendorQuoteReplyProduction?.evidenceLabels ?? []).filter((label) => /Actual connected provider send verified/i.test(label)),
    input.templateLaunchReadiness?.proofReferenceLabel ?? null,
    ...(input.oracleReleaseProofPacket?.requirements ?? [])
      .filter((requirement) => requirement.proofRef)
      .map((requirement) => `${requirement.title} proof: ${requirement.proofRef}`),
  ];
  return durableProofLabels(labels);
}

function backendScaleProofReady(
  scaleProof: WeddingWorkspaceRefreshScaleProofState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (scaleProof?.status !== "pass") return false;
  if (!strictOracleProofs) return true;
  return hasScaleProofReference(scaleProof)
    && buildWeddingWorkspaceRefreshScaleProofPacketState(scaleProof).canClearBackendScaleGate;
}

function backendPaginationContractReady(
  ready: boolean | null | undefined,
  proofLabel: string | null,
  strictOracleProofs: boolean,
): boolean {
  if (ready !== true) return false;
  return strictOracleProofs ? Boolean(proofLabel) : true;
}

function approvalUiReady(
  approvalUi: WeddingApprovalUiReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (approvalUi?.productionEvidenceReady !== true) return false;
  return strictOracleProofs ? hasDurableProofLabels(approvalUi.proofReferenceLabels) : true;
}

function templateLaunchIntakeReady(
  readiness: WeddingTemplateProductionReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (readiness?.productionEvidenceReady !== true) return false;
  return strictOracleProofs ? hasDurableProofLabels([readiness.proofReferenceLabel]) : true;
}

function liveMapGeocodingReady(
  readiness: WeddingMapGeocodingReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (readiness?.productionEvidenceReady !== true) return false;
  return strictOracleProofs ? hasDurableProofLabels(readiness.proofReferenceLabels) : true;
}

function graphCanvasHighlightingReady(
  readiness: WeddingGraphCanvasReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (readiness?.productionEvidenceReady !== true) return false;
  return strictOracleProofs ? hasDurableProofLabels(readiness.proofReferenceLabels) : true;
}

function importParserReady(
  readiness: WeddingImportParserReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (readiness?.productionReady !== true) return false;
  return strictOracleProofs ? hasDurableProofLabels(readiness.proofReferenceLabels) : true;
}

function nativeExportWorkersReady(
  readiness: WeddingNativeExportWorkerReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (readiness?.productionEvidenceReady !== true) return false;
  return strictOracleProofs ? durableProofLabels(readiness.proofReferenceLabels).length >= 3 : true;
}

function llmNeedToKnowExtractionReady(
  readiness: WeddingNeedToKnowLlmReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (readiness?.productionEvidenceReady !== true) return false;
  return strictOracleProofs ? hasDurableProofLabels(readiness.proofReferenceLabels) : true;
}

function oracleReleaseGateReady(
  releaseGate: WeddingOracleReleaseGateReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (releaseGate?.productionEvidenceReady !== true) return false;
  if (!strictOracleProofs) return true;
  return durableProofLabels(releaseGate.proofReferenceLabels).length >= 6;
}

function providerExecutorsReady(
  providerExecutorSuite: WeddingProviderExecutorSuiteReadinessState | null | undefined,
  providers: readonly WeddingProviderExecutorReadinessState[] | null | undefined,
  apiStack: WeddingApiStackState | null | undefined,
  proofPacket: WeddingProviderExecutorProofPacketState,
  strictOracleProofs: boolean,
): boolean {
  if (apiStack && apiStack.missingRequiredLabels.length > 0) return false;
  if (providerExecutorSuite) {
    if (providerExecutorSuite.productionEvidenceReady !== true) return false;
    return strictOracleProofs ? proofPacket.canClearOracleProviderGate : true;
  }
  return strictOracleProofs ? false : allProviderExecutorsReady(providers);
}

function adminAiRoutingPolicyReady(
  policy: AdminWeddingAiRoutingPolicyState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (policy?.productionReady !== true) return false;
  if (!strictOracleProofs) return true;
  return hasDurableProofLabels(policy.proofReferenceLabels) && Boolean(policy.lastVerifiedLabel);
}

function adminOpsBackendMetricsReady(
  metrics: AdminWeddingOpsBackendMetricsReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (metrics?.productionReady !== true) return false;
  if (!strictOracleProofs) return true;
  return durableProofLabels(metrics.evidenceLabels ?? [])
    .some((label) => /Oracle metrics proof reference mounted:/i.test(label));
}

function vendorQuoteReplyProductionReady(
  readiness: WeddingVendorQuoteReplyProductionReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (readiness?.productionReady !== true) return false;
  if (!strictOracleProofs) return true;
  return durableProofLabels(readiness.evidenceLabels ?? [])
    .some((label) => /Actual connected provider send verified:/i.test(label));
}

const REQUIRED_VENDOR_QUOTE_REPLY_UI_EVIDENCE_PATTERNS = [
  /Structured quote summary mounted/i,
  /Inline email editor mounted/i,
  /Separate wording approval control mounted/i,
  /Separate budget acknowledgement control mounted/i,
  /Undo window mounted before external send/i,
  /Persistent sent confirmation mounted/i,
  /Sent proof drawer action mounted/i,
  /Status and alert live regions mounted/i,
  /Failure telemetry hooks mounted/i,
  /External email provider ready/i,
] as const;

function vendorQuoteReplyUiReady(
  readiness: WeddingVendorQuoteReplyUiReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (readiness?.productionReady !== true) return false;
  if (!strictOracleProofs) return true;
  const labels = readiness.evidenceLabels ?? [];
  return REQUIRED_VENDOR_QUOTE_REPLY_UI_EVIDENCE_PATTERNS.every((pattern) =>
    labels.some((label) => pattern.test(label)),
  );
}

function collaborationLifecycleAuditReady(
  proof: WeddingCollaborationLifecycleProjectionProofState | null | undefined,
  legacyReady: boolean | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (proof) {
    if (proof.productionEvidenceReady !== true) return false;
    return strictOracleProofs ? hasDurableProofLabels([proof.proofReferenceLabel]) : true;
  }
  return strictOracleProofs ? false : legacyReady === true;
}

function collaborationAccessControlsReady(
  collaboration: WeddingCollaborationState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (collaboration?.productionReady !== true) return false;
  return strictOracleProofs ? hasDurableProofLabels(collaboration.proofReferenceLabels) : true;
}

function expectedBehaviorCoverageReady(
  audit: WeddingExpectedBehaviorAuditState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (!audit || audit.productionBlockerLabels.length > 0) return false;
  return strictOracleProofs ? hasDurableProofLabels(audit.proofReferenceLabels) : true;
}

export function buildWeddingProductionReadinessEvidenceState(
  input: WeddingProductionReadinessEvidenceInput = {},
): WeddingProductionReadinessEvidenceState {
  const strictOracleProofs = input.strictOracleProofs === true;
  const providerExecutors = providerExecutorsWithConnectedAppEvidence(input);
  const providerExecutorSuite = providerExecutorSuiteForPlan(input, providerExecutors);
  const providerExecutorUnblockPlan = buildWeddingProviderExecutorUnblockPlanState(providerExecutorSuite);
  const providerExecutorProofPacket = buildWeddingProviderExecutorProofPacketState(providerExecutorSuite);
  const oracleReleaseProofPacket = input.oracleReleaseGate
    ? buildWeddingOracleReleaseProofPacketState(input.oracleReleaseGate)
    : null;
  const backendScaleProofPacket = input.backendScaleProof
    ? buildWeddingWorkspaceRefreshScaleProofPacketState(input.backendScaleProof)
    : null;
  const backendPaginationProofReferenceLabel = backendPaginationProofLabel(input.backendPaginationProofRef);
  const evidence: WeddingProductionReadinessEvidence = {
    backendPaginationReady: backendPaginationContractReady(
      input.backendPaginationContractReady,
      backendPaginationProofReferenceLabel,
      strictOracleProofs,
    ),
    backendScaleProofReady: backendScaleProofReady(input.backendScaleProof, strictOracleProofs),
    templateLaunchIntakeReady: templateLaunchIntakeReady(input.templateLaunchReadiness, strictOracleProofs),
    liveMapGeocodingReady: liveMapGeocodingReady(input.liveMapGeocoding, strictOracleProofs),
    graphCanvasHighlightingReady: graphCanvasHighlightingReady(input.graphCanvasHighlighting, strictOracleProofs),
    approvalExecutionUiReady: approvalUiReady(input.approvalUi, strictOracleProofs),
    vendorQuoteReplyUiReady: vendorQuoteReplyUiReady(input.vendorQuoteReplyUi, strictOracleProofs),
    vendorQuoteReplyProductionReady: vendorQuoteReplyProductionReady(input.vendorQuoteReplyProduction, strictOracleProofs),
    nativeExportWorkersReady: nativeExportWorkersReady(input.nativeExportWorkers, strictOracleProofs),
    llmNeedToKnowExtractionReady: llmNeedToKnowExtractionReady(input.llmNeedToKnowExtraction, strictOracleProofs),
    seededVendorCorpusReady: seededVendorCorpusReady(input.seededVendorCorpus, strictOracleProofs),
    expectedBehaviorCoverageReady: expectedBehaviorCoverageReady(input.expectedBehaviorAudit, strictOracleProofs),
    importParserReady: importParserReady(input.importParserReadiness, strictOracleProofs),
    collaborationAccessControlsReady: collaborationAccessControlsReady(input.collaboration, strictOracleProofs),
    collaborationLifecycleAuditReady: collaborationLifecycleAuditReady(
      input.collaborationLifecycleProjectionProof,
      input.collaborationLifecycleProjectionReady,
      strictOracleProofs,
    ),
    adminAiRoutingPolicyReady: adminAiRoutingPolicyReady(input.adminWeddingAiRoutingPolicy, strictOracleProofs),
    adminOpsBackendMetricsReady: adminOpsBackendMetricsReady(input.adminOpsBackendMetrics, strictOracleProofs),
    providerExecutorsReady: providerExecutorsReady(
      providerExecutorSuite,
      providerExecutors,
      input.apiStack,
      providerExecutorProofPacket,
      strictOracleProofs,
    ),
    oracleReleaseGateReady: oracleReleaseGateReady(input.oracleReleaseGate, strictOracleProofs),
  };
  const summaryLabels = cleanWeddingProductionLabels([
    evidence.backendPaginationReady ? "backend pagination contract ready" : null,
    backendPaginationProofReferenceLabel,
    evidence.backendScaleProofReady ? "backend scale proof ready" : null,
    evidence.templateLaunchIntakeReady ? "wedding template launch proof ready" : null,
    evidence.liveMapGeocodingReady ? "live map/geocoding proof ready" : null,
    evidence.graphCanvasHighlightingReady ? "graph canvas proof ready" : null,
    evidence.approvalExecutionUiReady ? "approval UI proof ready" : null,
    evidence.vendorQuoteReplyUiReady ? "vendor quote reply UI proof ready" : null,
    evidence.vendorQuoteReplyProductionReady ? "vendor quote reply live proof ready" : null,
    evidence.nativeExportWorkersReady ? "native export worker proof ready" : null,
    evidence.llmNeedToKnowExtractionReady ? "Need-To-Know LLM extraction proof ready" : null,
    evidence.seededVendorCorpusReady ? "seeded vendor corpus ready" : null,
    evidence.expectedBehaviorCoverageReady ? "expected behaviour audit ready" : null,
    evidence.importParserReady ? "import parser readiness clear" : null,
    evidence.collaborationAccessControlsReady ? "collaboration access controls ready" : null,
    evidence.collaborationLifecycleAuditReady ? "collaboration lifecycle audit ready" : null,
    input.collaborationLifecycleProjectionProof?.proofReferenceLabel ?? null,
    evidence.adminAiRoutingPolicyReady ? "admin AI routing policy ready" : null,
    evidence.adminOpsBackendMetricsReady ? "admin ops backend metrics ready" : null,
    evidence.providerExecutorsReady ? "provider executors ready" : null,
    evidence.oracleReleaseGateReady ? "Oracle release proof ready" : null,
  ]);
  const missingRequiredEvidenceLabels = cleanWeddingProductionLabels([
    evidence.backendPaginationReady
      ? null
      : strictOracleProofs && input.backendPaginationContractReady === true
        ? "Backend pagination contract proof reference is missing."
        : "Backend pagination contract is missing.",
    evidence.backendScaleProofReady
      ? null
      : strictOracleProofs && input.backendScaleProof?.status === "pass"
        ? "Backend saved-workspace scale proof reference is missing."
        : "Backend saved-workspace scale proof is missing.",
    evidence.templateLaunchIntakeReady
      ? null
      : strictOracleProofs
        && input.templateLaunchReadiness?.productionEvidenceReady === true
        && !hasDurableProofLabels([input.templateLaunchReadiness.proofReferenceLabel])
        ? "Wedding template launch proof reference is missing."
      : input.templateLaunchReadiness
        ? `Wedding template launch proof is blocked: ${joinWeddingProductionLabels(input.templateLaunchReadiness.blockerLabels)}`
        : "Wedding template launch proof is missing.",
    evidence.approvalExecutionUiReady
      ? null
      : strictOracleProofs
        && input.approvalUi?.productionEvidenceReady === true
        && !hasDurableProofLabels(input.approvalUi.proofReferenceLabels)
        ? "Approval UI proof reference is missing."
        : "Approval UI proof is missing.",
    evidence.vendorQuoteReplyUiReady
      ? null
      : strictOracleProofs
        && input.vendorQuoteReplyUi?.productionReady === true
        ? "Vendor quote reply UI safeguard evidence is incomplete."
      : input.vendorQuoteReplyUi
        ? `Vendor quote reply UI proof is blocked: ${joinWeddingProductionLabels(input.vendorQuoteReplyUi.blockerLabels)}`
        : "Vendor quote reply UI proof is missing.",
    evidence.vendorQuoteReplyProductionReady
      ? null
      : strictOracleProofs
        && input.vendorQuoteReplyProduction?.productionReady === true
        && !durableProofLabels(input.vendorQuoteReplyProduction.evidenceLabels ?? [])
          .some((label) => /Actual connected provider send verified:/i.test(label))
        ? "Vendor quote reply live provider proof reference is missing."
      : input.vendorQuoteReplyProduction
        ? `Vendor quote reply live production proof is blocked: ${joinWeddingProductionLabels(input.vendorQuoteReplyProduction.blockerLabels)}`
        : "Vendor quote reply live production proof is missing.",
    evidence.liveMapGeocodingReady
      ? null
      : strictOracleProofs
        && input.liveMapGeocoding?.productionEvidenceReady === true
        && !hasDurableProofLabels(input.liveMapGeocoding.proofReferenceLabels)
        ? "Live map/geocoding proof reference is missing."
        : null,
    evidence.graphCanvasHighlightingReady
      ? null
      : strictOracleProofs
        && input.graphCanvasHighlighting?.productionEvidenceReady === true
        && !hasDurableProofLabels(input.graphCanvasHighlighting.proofReferenceLabels)
        ? "Graph canvas proof reference is missing."
        : null,
    evidence.nativeExportWorkersReady
      ? null
      : strictOracleProofs
        && input.nativeExportWorkers?.productionEvidenceReady === true
        && durableProofLabels(input.nativeExportWorkers.proofReferenceLabels).length < 3
        ? "Native export worker proof references are incomplete."
        : null,
    evidence.llmNeedToKnowExtractionReady
      ? null
      : strictOracleProofs
        && input.llmNeedToKnowExtraction?.productionEvidenceReady === true
        && !hasDurableProofLabels(input.llmNeedToKnowExtraction.proofReferenceLabels)
        ? "Need-To-Know LLM extraction proof reference is missing."
        : null,
    evidence.seededVendorCorpusReady
      ? null
      : strictOracleProofs
        && input.seededVendorCorpus?.status === "ready"
        && !hasDurableProofLabels(input.seededVendorCorpus.proofReferenceLabels)
        ? "Source-backed seeded vendor corpus proof reference is missing."
        : null,
    evidence.expectedBehaviorCoverageReady
      ? null
      : strictOracleProofs
        && input.expectedBehaviorAudit
        && input.expectedBehaviorAudit.productionBlockerLabels.length === 0
        && !hasDurableProofLabels(input.expectedBehaviorAudit.proofReferenceLabels)
        ? "Wedding dependency-plan expected behavior audit proof reference is missing."
      : input.expectedBehaviorAudit
        ? `Wedding dependency-plan expected behavior audit is incomplete: ${joinWeddingProductionLabels(input.expectedBehaviorAudit.productionBlockerLabels)}`
        : "Wedding dependency-plan expected behavior audit is missing.",
    evidence.importParserReady
      ? null
      : strictOracleProofs
        && input.importParserReadiness?.productionReady === true
        && !hasDurableProofLabels(input.importParserReadiness.proofReferenceLabels)
        ? "Wedding import parser readiness proof reference is missing."
      : input.importParserReadiness
        ? `Wedding import parser readiness is blocked: ${joinWeddingProductionLabels(input.importParserReadiness.blockerLabels)}`
        : "Wedding import parser readiness is missing.",
    evidence.collaborationAccessControlsReady
      ? null
      : strictOracleProofs
        && input.collaboration?.productionReady === true
        && !hasDurableProofLabels(input.collaboration.proofReferenceLabels)
        ? "Shared wedding workspace access-control proof reference is missing."
        : "Shared wedding workspace access-control proof is missing.",
    evidence.collaborationLifecycleAuditReady
      ? null
      : input.collaborationLifecycleProjectionProof
        ? strictOracleProofs
          && input.collaborationLifecycleProjectionProof.productionEvidenceReady === true
          && !hasDurableProofLabels([input.collaborationLifecycleProjectionProof.proofReferenceLabel])
          ? "Collaborator lifecycle audit projection proof reference is missing."
          : `Collaborator lifecycle audit projection proof is incomplete: ${joinWeddingProductionLabels(input.collaborationLifecycleProjectionProof.blockerLabels)}`
        : "Collaborator lifecycle audit projection proof is missing.",
    evidence.adminAiRoutingPolicyReady
      ? null
      : strictOracleProofs && input.adminWeddingAiRoutingPolicy?.productionReady === true
        ? "Admin-funded wedding AI routing policy proof reference is missing."
        : "Admin-funded wedding AI routing policy proof is missing.",
    evidence.adminOpsBackendMetricsReady
      ? null
      : strictOracleProofs && input.adminOpsBackendMetrics?.productionReady === true
        ? "Admin Oracle and user metrics proof reference is missing."
        : "Admin Oracle and user metrics proof is missing.",
    evidence.providerExecutorsReady
      ? null
      : input.apiStack?.missingRequiredLabels.length
        ? `Wedding API stack is missing required providers: ${cleanWeddingProductionLabels(input.apiStack.missingRequiredLabels).join(", ")}.`
      : strictOracleProofs && providerExecutorSuite.productionEvidenceReady === true
        ? "Provider executor proof references are incomplete."
        : input.providerExecutorSmokeProof?.blockerLabels.length
          ? `Provider executor proof is blocked: ${joinWeddingProductionLabels(input.providerExecutorSmokeProof.blockerLabels)}`
        : "Provider executor proof is missing.",
    evidence.oracleReleaseGateReady
      ? null
      : strictOracleProofs && input.oracleReleaseGate?.productionEvidenceReady === true
        ? "Oracle release proof references are incomplete."
        : "Oracle release proof is missing.",
  ]);

  return {
    evidence,
    summaryLabels,
    durableProofReferenceLabels: durableProofReferenceLabels({
      backendPaginationProofLabel: backendPaginationProofReferenceLabel,
      backendScaleProofPacket,
      providerExecutorProofPacket,
      oracleReleaseProofPacket,
      collaborationLifecycleProjectionProof: input.collaborationLifecycleProjectionProof,
      adminWeddingAiRoutingPolicy: input.adminWeddingAiRoutingPolicy,
      adminOpsBackendMetrics: input.adminOpsBackendMetrics,
      liveMapGeocoding: input.liveMapGeocoding,
      graphCanvasHighlighting: input.graphCanvasHighlighting,
      approvalUi: input.approvalUi,
      nativeExportWorkers: input.nativeExportWorkers,
      llmNeedToKnowExtraction: input.llmNeedToKnowExtraction,
      importParserReadiness: input.importParserReadiness,
      seededVendorCorpus: input.seededVendorCorpus,
      expectedBehaviorAudit: input.expectedBehaviorAudit,
      collaboration: input.collaboration,
      vendorQuoteReplyProduction: input.vendorQuoteReplyProduction,
      templateLaunchReadiness: input.templateLaunchReadiness,
    }),
    missingRequiredEvidenceLabels,
    vendorQuoteReplyUi: input.vendorQuoteReplyUi ?? null,
    vendorQuoteReplyProduction: input.vendorQuoteReplyProduction ?? null,
    templateLaunchReadiness: input.templateLaunchReadiness ?? null,
    providerExecutorUnblockPlan,
    providerExecutorProofPacket,
    oracleReleaseProofPacket,
    backendScaleProofPacket,
  };
}
