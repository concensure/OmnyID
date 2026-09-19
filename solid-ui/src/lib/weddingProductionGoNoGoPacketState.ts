// @locs-version: 2.0
import type { WeddingProductionReadinessEvidenceState } from "@/lib/weddingProductionReadinessEvidenceState";

export type WeddingProductionGoNoGoGateKind =
  | "backend_scale"
  | "approval_ui"
  | "provider_executors"
  | "expected_behavior"
  | "import_parser"
  | "collaboration_access"
  | "collaboration_lifecycle"
  | "admin_routing_policy"
  | "admin_ops_metrics"
  | "oracle_release";

export type WeddingProductionGoNoGoGate = {
  kind: WeddingProductionGoNoGoGateKind;
  title: string;
  status: "ready" | "blocked" | "missing";
  detail: string;
  blockerLabels: string[];
  nextActionLabels: string[];
};

export type WeddingProductionGoNoGoGateCounts = {
  ready: number;
  blocked: number;
  missing: number;
  total: number;
};

export type WeddingProductionGoNoGoProofManifestItem = {
  kind: WeddingProductionGoNoGoGateKind;
  title: string;
  status: "attached" | "missing" | "blocked";
  proofReferenceLabels: string[];
  missingProofLabels: string[];
};

export type WeddingProductionGoNoGoPacketState = {
  status: "ready" | "blocked";
  canUploadToOracle: boolean;
  title: string;
  summary: string;
  gates: WeddingProductionGoNoGoGate[];
  gateCounts: WeddingProductionGoNoGoGateCounts;
  proofManifest: WeddingProductionGoNoGoProofManifestItem[];
  proofManifestCounts: {
    attached: number;
    missing: number;
    blocked: number;
    total: number;
  };
  blockerLabels: string[];
  nextActionLabels: string[];
  guardrailLabels: string[];
};

function gateStatus(ready: boolean | null | undefined, present: boolean): "ready" | "blocked" | "missing" {
  if (!present) return "missing";
  return ready ? "ready" : "blocked";
}

function gateDetail(status: WeddingProductionGoNoGoGate["status"], readyDetail: string, blockedDetail: string): string {
  if (status === "ready") return readyDetail;
  if (status === "missing") return "No proof packet is attached for this production gate.";
  return blockedDetail;
}

function booleanGate(input: {
  kind: WeddingProductionGoNoGoGateKind;
  title: string;
  ready: boolean | null | undefined;
  readyDetail: string;
  blockedDetail: string;
  blockerLabel: string;
  nextActionLabel: string;
}): WeddingProductionGoNoGoGate {
  const status = gateStatus(input.ready, true);
  return {
    kind: input.kind,
    title: input.title,
    status,
    detail: gateDetail(status, input.readyDetail, input.blockedDetail),
    blockerLabels: status === "ready" ? [] : [input.blockerLabel],
    nextActionLabels: status === "ready" ? [] : [input.nextActionLabel],
  };
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function gateCounts(gates: readonly WeddingProductionGoNoGoGate[]): WeddingProductionGoNoGoGateCounts {
  return {
    ready: gates.filter((gate) => gate.status === "ready").length,
    blocked: gates.filter((gate) => gate.status === "blocked").length,
    missing: gates.filter((gate) => gate.status === "missing").length,
    total: gates.length,
  };
}

function manifestItem(input: {
  kind: WeddingProductionGoNoGoGateKind;
  title: string;
  proofReferenceLabels: readonly (string | null | undefined)[];
  missingProofLabels: readonly string[];
  gateStatus?: WeddingProductionGoNoGoGate["status"];
}): WeddingProductionGoNoGoProofManifestItem {
  const proofReferenceLabels = unique(input.proofReferenceLabels.filter((label): label is string => Boolean(label)));
  const missingProofLabels = unique(input.missingProofLabels);
  return {
    kind: input.kind,
    title: input.title,
    status: input.gateStatus === "blocked"
      ? "blocked"
      : proofReferenceLabels.length > 0 && missingProofLabels.length === 0
        ? "attached"
        : "missing",
    proofReferenceLabels,
    missingProofLabels,
  };
}

function proofManifestCounts(items: readonly WeddingProductionGoNoGoProofManifestItem[]) {
  return {
    attached: items.filter((item) => item.status === "attached").length,
    missing: items.filter((item) => item.status === "missing").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    total: items.length,
  };
}

export function buildWeddingProductionGoNoGoPacketState(
  evidence: WeddingProductionReadinessEvidenceState,
): WeddingProductionGoNoGoPacketState {
  const backendScaleStatus = gateStatus(
    evidence.backendScaleProofPacket?.canClearBackendScaleGate,
    Boolean(evidence.backendScaleProofPacket),
  );
  const providerStatus = gateStatus(
    evidence.providerExecutorProofPacket.canClearOracleProviderGate,
    Boolean(evidence.providerExecutorProofPacket),
  );
  const releaseStatus = gateStatus(
    evidence.oracleReleaseProofPacket?.canClearOracleReleaseGate,
    Boolean(evidence.oracleReleaseProofPacket),
  );
  const gates: WeddingProductionGoNoGoGate[] = [
    {
      kind: "backend_scale",
      title: "Saved workspace backend scale proof",
      status: backendScaleStatus,
      detail: gateDetail(
        backendScaleStatus,
        "Bounded saved-workspace refresh proof is complete.",
        evidence.backendScaleProofPacket?.summary ?? "Backend scale proof is blocked.",
      ),
      blockerLabels: evidence.backendScaleProofPacket?.missingEvidenceLabels ?? ["Backend saved-workspace scale proof packet is missing."],
      nextActionLabels: evidence.backendScaleProofPacket?.nextActionLabels ?? ["Run saved-workspace backend scale proof."],
    },
    booleanGate({
      kind: "approval_ui",
      title: "Approval execution UI proof",
      ready: evidence.evidence.approvalExecutionUiReady,
      readyDetail: "Approval execution UI proof is complete.",
      blockedDetail: "Approval execution UI proof is missing or incomplete.",
      blockerLabel: "Approval UI proof is missing.",
      nextActionLabel: "Prove approval execution UI and receipt handling.",
    }),
    {
      kind: "provider_executors",
      title: "External provider executor proof",
      status: providerStatus,
      detail: gateDetail(
        providerStatus,
        "External provider executor proof is complete.",
        evidence.providerExecutorProofPacket.summary,
      ),
      blockerLabels: evidence.providerExecutorProofPacket.missingProofRefs,
      nextActionLabels: evidence.providerExecutorProofPacket.nextActionLabels,
    },
    booleanGate({
      kind: "expected_behavior",
      title: "Wedding dependency-plan behavior audit",
      ready: evidence.evidence.expectedBehaviorCoverageReady,
      readyDetail: "Wedding dependency-plan expected behavior audit is complete.",
      blockedDetail: "Wedding dependency-plan expected behavior audit has blockers or is missing.",
      blockerLabel: "Wedding dependency-plan expected behavior audit is missing or blocked.",
      nextActionLabel: "Prove every wedding dependency-plan behavior audit item or keep it blocked from production.",
    }),
    booleanGate({
      kind: "import_parser",
      title: "Wedding import parser readiness",
      ready: evidence.evidence.importParserReady,
      readyDetail: "Wedding import parser readiness is clear.",
      blockedDetail: "Wedding import parser readiness has blockers or unparsed spreadsheet evidence.",
      blockerLabel: "Wedding import parser readiness is blocked.",
      nextActionLabel: "Review unprocessed wedding imports or connect Excel workbook import proof.",
    }),
    booleanGate({
      kind: "collaboration_access",
      title: "Shared workspace access-control proof",
      ready: evidence.evidence.collaborationAccessControlsReady,
      readyDetail: "Shared wedding workspace access controls are complete.",
      blockedDetail: "Shared wedding workspace access-control proof is missing or incomplete.",
      blockerLabel: "Shared wedding workspace access-control proof is missing.",
      nextActionLabel: "Prove shared workspace ACL, E2EE, audit, and conflict controls.",
    }),
    booleanGate({
      kind: "collaboration_lifecycle",
      title: "Collaborator lifecycle audit proof",
      ready: evidence.evidence.collaborationLifecycleAuditReady,
      readyDetail: "Collaborator lifecycle projection proof is complete.",
      blockedDetail: "Collaborator invite, expiry, revocation, and stale-access-review proof is missing or incomplete.",
      blockerLabel: "Collaborator lifecycle audit projection proof is missing.",
      nextActionLabel: "Prove collaborator lifecycle AFP projections.",
    }),
    booleanGate({
      kind: "admin_routing_policy",
      title: "Admin-funded AI routing policy proof",
      ready: evidence.evidence.adminAiRoutingPolicyReady,
      readyDetail: "Admin-funded wedding AI routing policy proof is complete.",
      blockedDetail: "Admin-funded wedding AI routing policy proof is missing or incomplete.",
      blockerLabel: "Admin-funded wedding AI routing policy proof is missing.",
      nextActionLabel: "Prove admin-funded wedding AI routing policy enforcement.",
    }),
    booleanGate({
      kind: "admin_ops_metrics",
      title: "Admin Oracle and user metrics proof",
      ready: evidence.evidence.adminOpsBackendMetricsReady,
      readyDetail: "Admin Oracle and user metrics proof is complete.",
      blockedDetail: "Admin Oracle/user metrics proof is missing or incomplete.",
      blockerLabel: "Admin Oracle and user metrics proof is missing.",
      nextActionLabel: "Mount admin Oracle metrics and exact user count proof.",
    }),
    {
      kind: "oracle_release",
      title: "Oracle release proof",
      status: releaseStatus,
      detail: gateDetail(
        releaseStatus,
        "Oracle release proof is complete and fresh.",
        evidence.oracleReleaseProofPacket?.summary ?? "Oracle release proof is blocked.",
      ),
      blockerLabels: evidence.oracleReleaseProofPacket?.missingProofLabels ?? ["Oracle release proof packet is missing."],
      nextActionLabels: evidence.oracleReleaseProofPacket?.nextActionLabels ?? ["Run Oracle release proof."],
    },
  ];
  const counts = gateCounts(gates);
  const collaborationLifecycleProofRefs = evidence.durableProofReferenceLabels
    .filter((label) => /collaboration-lifecycle|Collaborator lifecycle/i.test(label));
  const adminRoutingProofRefs = evidence.durableProofReferenceLabels
    .filter((label) => /admin routing|routing policy/i.test(label));
  const adminOpsMetricsProofRefs = evidence.durableProofReferenceLabels
    .filter((label) => /oracle metrics|ops backend metrics|user metrics/i.test(label));
  const proofManifest = [
    manifestItem({
      kind: "backend_scale",
      title: "Saved workspace backend scale receipt",
      gateStatus: backendScaleStatus,
      proofReferenceLabels: evidence.backendScaleProofPacket?.requirements
        .filter((requirement) => requirement.kind === "proof_ref")
        .map((requirement) => requirement.evidenceLabel) ?? [],
      missingProofLabels: evidence.backendScaleProofPacket?.missingEvidenceLabels
        .filter((label) => /receipt|proof/i.test(label)) ?? ["Backend saved-workspace scale proof packet is missing."],
    }),
    manifestItem({
      kind: "provider_executors",
      title: "External provider executor receipts",
      gateStatus: providerStatus,
      proofReferenceLabels: evidence.providerExecutorProofPacket.capabilityPackets
        .map((packet) => packet.proofRef ? `${packet.requiredProvider}: ${packet.proofRef}` : null),
      missingProofLabels: evidence.providerExecutorProofPacket.missingProofRefs,
    }),
    manifestItem({
      kind: "collaboration_lifecycle",
      title: "Collaborator lifecycle receipt",
      gateStatus: gates.find((gate) => gate.kind === "collaboration_lifecycle")?.status,
      proofReferenceLabels: collaborationLifecycleProofRefs,
      missingProofLabels: collaborationLifecycleProofRefs.length ? [] : ["Collaborator lifecycle audit projection proof reference is missing."],
    }),
    manifestItem({
      kind: "admin_routing_policy",
      title: "Admin-funded AI routing policy receipt",
      gateStatus: gates.find((gate) => gate.kind === "admin_routing_policy")?.status,
      proofReferenceLabels: adminRoutingProofRefs,
      missingProofLabels: adminRoutingProofRefs.length ? [] : ["Admin-funded wedding AI routing policy proof reference is missing."],
    }),
    manifestItem({
      kind: "admin_ops_metrics",
      title: "Admin Oracle metrics receipt",
      gateStatus: gates.find((gate) => gate.kind === "admin_ops_metrics")?.status,
      proofReferenceLabels: adminOpsMetricsProofRefs,
      missingProofLabels: adminOpsMetricsProofRefs.length ? [] : ["Admin Oracle and user metrics proof reference is missing."],
    }),
    manifestItem({
      kind: "oracle_release",
      title: "Oracle release receipts",
      gateStatus: releaseStatus,
      proofReferenceLabels: evidence.oracleReleaseProofPacket?.requirements.map((requirement) =>
        requirement.proofRef ? `${requirement.title}: ${requirement.proofRef}` : null,
      ) ?? [],
      missingProofLabels: evidence.oracleReleaseProofPacket?.missingProofLabels ?? ["Oracle release proof packet is missing."],
    }),
  ];
  const manifestCounts = proofManifestCounts(proofManifest);
  const blockerLabels = unique([
    ...evidence.missingRequiredEvidenceLabels,
    ...gates.flatMap((gate) => gate.status === "ready" ? [] : gate.blockerLabels),
    ...proofManifest.flatMap((item) => item.status === "attached" ? [] : item.missingProofLabels),
  ]);
  const canUploadToOracle = gates.every((gate) => gate.status === "ready")
    && evidence.missingRequiredEvidenceLabels.length === 0
    && manifestCounts.blocked === 0
    && manifestCounts.missing === 0;

  return {
    status: canUploadToOracle ? "ready" : "blocked",
    canUploadToOracle,
    title: canUploadToOracle ? "Wedding Oracle upload go/no-go ready" : "Wedding Oracle upload blocked",
    summary: canUploadToOracle
      ? "All wedding-specific backend, provider, and Oracle release proof gates are ready for upload."
      : "Do not upload the wedding template to Oracle until every required proof gate is ready.",
    gates,
    gateCounts: counts,
    proofManifest,
    proofManifestCounts: manifestCounts,
    blockerLabels,
    nextActionLabels: unique(gates.flatMap((gate) => gate.status === "ready" ? [] : gate.nextActionLabels)),
    guardrailLabels: [
      "Do not deploy while any gate is missing or blocked.",
      "Do not treat dry-run provider receipts as live production execution proof.",
      "Keep secrets file-backed and out of AFP/search/UI logs.",
      "Record durable proof references before changing Oracle production.",
    ],
  };
}
