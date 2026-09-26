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

export type WeddingProductionReadinessEvidenceInput = {
  strictOracleProofs?: boolean | null;
  backendPaginationContractReady?: boolean | null;
  backendScaleProof?: WeddingWorkspaceRefreshScaleProofState | null;
  liveMapGeocoding?: WeddingMapGeocodingReadinessState | null;
  graphCanvasHighlighting?: WeddingGraphCanvasReadinessState | null;
  approvalUi?: WeddingApprovalUiReadinessState | null;
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

function seededVendorCorpusReady(seedState: WeddingVendorSeedState | null | undefined): boolean {
  return seedState?.status === "ready"
    && seedState.vendorCount >= 10
    && seedState.categoryCount >= 6
    && seedState.sourceCount >= 10
    && seedState.staleCount === 0
    && Boolean(seedState.summaryArtifact);
}

function hasScaleProofReference(scaleProof: WeddingWorkspaceRefreshScaleProofState | null | undefined): boolean {
  return (scaleProof?.evidenceLabels ?? []).some((label) => /^Scale proof reference:/i.test(label));
}

function durableProofReferenceLabels(input: {
  backendScaleProofPacket: WeddingWorkspaceRefreshScaleProofPacketState | null;
  providerExecutorProofPacket: WeddingProviderExecutorProofPacketState;
  oracleReleaseProofPacket: WeddingOracleReleaseProofPacketState | null;
  collaborationLifecycleProjectionProof?: WeddingCollaborationLifecycleProjectionProofState | null;
  adminWeddingAiRoutingPolicy?: AdminWeddingAiRoutingPolicyState | null;
  adminOpsBackendMetrics?: AdminWeddingOpsBackendMetricsReadinessState | null;
}): string[] {
  const labels = [
    ...(input.backendScaleProofPacket?.requirements ?? [])
      .filter((requirement) => requirement.kind === "proof_ref" && requirement.evidenceLabel)
      .map((requirement) => requirement.evidenceLabel as string),
    ...input.providerExecutorProofPacket.capabilityPackets
      .filter((packet) => packet.proofRef)
      .map((packet) => `${packet.requiredProvider} proof: ${packet.proofRef}`),
    input.collaborationLifecycleProjectionProof?.proofReferenceLabel ?? null,
    ...(input.adminWeddingAiRoutingPolicy?.proofReferenceLabels ?? []),
    ...(input.adminOpsBackendMetrics?.evidenceLabels ?? []).filter((label) => /proof reference/i.test(label)),
    ...(input.oracleReleaseProofPacket?.requirements ?? [])
      .filter((requirement) => requirement.proofRef)
      .map((requirement) => `${requirement.title} proof: ${requirement.proofRef}`),
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(labels));
}

function backendScaleProofReady(
  scaleProof: WeddingWorkspaceRefreshScaleProofState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (scaleProof?.status !== "pass") return false;
  return strictOracleProofs ? hasScaleProofReference(scaleProof) : true;
}

function oracleReleaseGateReady(
  releaseGate: WeddingOracleReleaseGateReadinessState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (releaseGate?.productionEvidenceReady !== true) return false;
  if (!strictOracleProofs) return true;
  return (releaseGate.proofReferenceLabels ?? []).length >= 6;
}

function providerExecutorsReady(
  providerExecutorSuite: WeddingProviderExecutorSuiteReadinessState | null | undefined,
  providers: readonly WeddingProviderExecutorReadinessState[] | null | undefined,
  apiStack: WeddingApiStackState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (apiStack && apiStack.missingRequiredLabels.length > 0) return false;
  if (providerExecutorSuite) {
    if (providerExecutorSuite.productionEvidenceReady !== true) return false;
    return strictOracleProofs ? (providerExecutorSuite.proofReferenceLabels ?? []).length >= 4 : true;
  }
  return strictOracleProofs ? false : allProviderExecutorsReady(providers);
}

function adminAiRoutingPolicyReady(
  policy: AdminWeddingAiRoutingPolicyState | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (policy?.productionReady !== true) return false;
  if (!strictOracleProofs) return true;
  return (policy.proofReferenceLabels ?? []).length > 0 && Boolean(policy.lastVerifiedLabel);
}

function collaborationLifecycleAuditReady(
  proof: WeddingCollaborationLifecycleProjectionProofState | null | undefined,
  legacyReady: boolean | null | undefined,
  strictOracleProofs: boolean,
): boolean {
  if (proof) {
    if (proof.productionEvidenceReady !== true) return false;
    return strictOracleProofs ? Boolean(proof.proofReferenceLabel) : true;
  }
  return strictOracleProofs ? false : legacyReady === true;
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
  const evidence: WeddingProductionReadinessEvidence = {
    backendPaginationReady: Boolean(input.backendPaginationContractReady),
    backendScaleProofReady: backendScaleProofReady(input.backendScaleProof, strictOracleProofs),
    liveMapGeocodingReady: input.liveMapGeocoding?.productionEvidenceReady === true,
    graphCanvasHighlightingReady: input.graphCanvasHighlighting?.productionEvidenceReady === true,
    approvalExecutionUiReady: input.approvalUi?.productionEvidenceReady === true,
    nativeExportWorkersReady: input.nativeExportWorkers?.productionEvidenceReady === true,
    llmNeedToKnowExtractionReady: input.llmNeedToKnowExtraction?.productionEvidenceReady === true,
    seededVendorCorpusReady: seededVendorCorpusReady(input.seededVendorCorpus),
    expectedBehaviorCoverageReady: input.expectedBehaviorAudit
      ? input.expectedBehaviorAudit.productionBlockerLabels.length === 0
      : false,
    importParserReady: input.importParserReadiness?.productionReady === true,
    collaborationAccessControlsReady: input.collaboration?.productionReady === true,
    collaborationLifecycleAuditReady: collaborationLifecycleAuditReady(
      input.collaborationLifecycleProjectionProof,
      input.collaborationLifecycleProjectionReady,
      strictOracleProofs,
    ),
    adminAiRoutingPolicyReady: adminAiRoutingPolicyReady(input.adminWeddingAiRoutingPolicy, strictOracleProofs),
    adminOpsBackendMetricsReady: input.adminOpsBackendMetrics?.productionReady === true,
    providerExecutorsReady: providerExecutorsReady(providerExecutorSuite, providerExecutors, input.apiStack, strictOracleProofs),
    oracleReleaseGateReady: oracleReleaseGateReady(input.oracleReleaseGate, strictOracleProofs),
  };
  const summaryLabels = [
    evidence.backendPaginationReady ? "backend pagination contract ready" : null,
    evidence.backendScaleProofReady ? "backend scale proof ready" : null,
    evidence.approvalExecutionUiReady ? "approval UI proof ready" : null,
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
  ].filter((value): value is string => Boolean(value));
  const missingRequiredEvidenceLabels = [
    evidence.backendPaginationReady ? null : "Backend pagination contract is missing.",
    evidence.backendScaleProofReady
      ? null
      : strictOracleProofs && input.backendScaleProof?.status === "pass"
        ? "Backend saved-workspace scale proof reference is missing."
        : "Backend saved-workspace scale proof is missing.",
    evidence.approvalExecutionUiReady ? null : "Approval UI proof is missing.",
    evidence.expectedBehaviorCoverageReady
      ? null
      : input.expectedBehaviorAudit
        ? `Wedding dependency-plan expected behavior audit is incomplete: ${input.expectedBehaviorAudit.productionBlockerLabels.join(" ")}`
        : "Wedding dependency-plan expected behavior audit is missing.",
    evidence.importParserReady
      ? null
      : input.importParserReadiness
        ? `Wedding import parser readiness is blocked: ${input.importParserReadiness.blockerLabels.join(" ")}`
        : "Wedding import parser readiness is missing.",
    evidence.collaborationAccessControlsReady ? null : "Shared wedding workspace access-control proof is missing.",
    evidence.collaborationLifecycleAuditReady
      ? null
      : input.collaborationLifecycleProjectionProof
        ? strictOracleProofs
          && input.collaborationLifecycleProjectionProof.productionEvidenceReady === true
          && !input.collaborationLifecycleProjectionProof.proofReferenceLabel
          ? "Collaborator lifecycle audit projection proof reference is missing."
          : `Collaborator lifecycle audit projection proof is incomplete: ${input.collaborationLifecycleProjectionProof.blockerLabels.join(" ")}`
        : "Collaborator lifecycle audit projection proof is missing.",
    evidence.adminAiRoutingPolicyReady
      ? null
      : strictOracleProofs && input.adminWeddingAiRoutingPolicy?.productionReady === true
        ? "Admin-funded wedding AI routing policy proof reference is missing."
        : "Admin-funded wedding AI routing policy proof is missing.",
    evidence.adminOpsBackendMetricsReady ? null : "Admin Oracle and user metrics proof is missing.",
    evidence.providerExecutorsReady
      ? null
      : input.apiStack?.missingRequiredLabels.length
        ? `Wedding API stack is missing required providers: ${input.apiStack.missingRequiredLabels.join(", ")}.`
      : strictOracleProofs && providerExecutorSuite.productionEvidenceReady === true
        ? "Provider executor proof references are incomplete."
        : input.providerExecutorSmokeProof?.blockerLabels.length
          ? `Provider executor proof is blocked: ${input.providerExecutorSmokeProof.blockerLabels.join(" ")}`
        : "Provider executor proof is missing.",
    evidence.oracleReleaseGateReady
      ? null
      : strictOracleProofs && input.oracleReleaseGate?.productionEvidenceReady === true
        ? "Oracle release proof references are incomplete."
        : "Oracle release proof is missing.",
  ].filter((value): value is string => Boolean(value));

  return {
    evidence,
    summaryLabels,
    durableProofReferenceLabels: durableProofReferenceLabels({
      backendScaleProofPacket,
      providerExecutorProofPacket,
      oracleReleaseProofPacket,
      collaborationLifecycleProjectionProof: input.collaborationLifecycleProjectionProof,
      adminWeddingAiRoutingPolicy: input.adminWeddingAiRoutingPolicy,
      adminOpsBackendMetrics: input.adminOpsBackendMetrics,
    }),
    missingRequiredEvidenceLabels,
    providerExecutorUnblockPlan,
    providerExecutorProofPacket,
    oracleReleaseProofPacket,
    backendScaleProofPacket,
  };
}
