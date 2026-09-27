// @locs-version: 2.0
import type { WeddingProductionReadinessEvidenceState } from "@/lib/weddingProductionReadinessEvidenceState";
import {
  cleanWeddingProductionLabels,
  isWeakWeddingProductionProofReference,
} from "@/lib/weddingProductionLabelState";

export type WeddingProductionGoNoGoGateKind =
  | "backend_scale"
  | "template_launch"
  | "approval_ui"
  | "vendor_quote_reply"
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

const ORACLE_REQUIRED_PROOF_MANIFEST_KINDS: readonly WeddingProductionGoNoGoGateKind[] = [
  "backend_scale",
  "provider_executors",
  "template_launch",
  "vendor_quote_reply",
  "collaboration_lifecycle",
  "admin_routing_policy",
  "admin_ops_metrics",
  "oracle_release",
];

const ORACLE_REQUIRED_READY_GATE_KINDS: readonly WeddingProductionGoNoGoGateKind[] = [
  "backend_scale",
  "template_launch",
  "approval_ui",
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

export function weddingProductionGoNoGoPacketHasCompleteReadyGates(
  packet: WeddingProductionGoNoGoPacketState | null | undefined,
): boolean {
  if (!packet) return false;
  if (packet.gateCounts.total !== ORACLE_REQUIRED_READY_GATE_KINDS.length) return false;
  if (packet.gateCounts.blocked !== 0 || packet.gateCounts.missing !== 0) return false;
  if (packet.gateCounts.ready !== packet.gateCounts.total) return false;
  if (packet.gates.length !== packet.gateCounts.total) return false;

  const gatesByKind = new Map(packet.gates.map((gate) => [gate.kind, gate]));
  return ORACLE_REQUIRED_READY_GATE_KINDS.every((kind) => gatesByKind.get(kind)?.status === "ready");
}

export function weddingProductionGoNoGoPacketHasCompleteProofManifest(
  packet: WeddingProductionGoNoGoPacketState | null | undefined,
): boolean {
  if (!packet) return false;
  if (packet.proofManifestCounts.total !== ORACLE_REQUIRED_PROOF_MANIFEST_KINDS.length) return false;
  if (packet.proofManifestCounts.blocked !== 0 || packet.proofManifestCounts.missing !== 0) return false;
  if (packet.proofManifestCounts.attached !== packet.proofManifestCounts.total) return false;
  if (packet.proofManifest.length !== packet.proofManifestCounts.total) return false;

  const manifestByKind = new Map(packet.proofManifest.map((item) => [item.kind, item]));
  return ORACLE_REQUIRED_PROOF_MANIFEST_KINDS.every((kind) => {
    const item = manifestByKind.get(kind);
    const proofReferenceLabels = cleanWeddingProductionLabels(item?.proofReferenceLabels ?? []);
    return item?.status === "attached"
      && proofReferenceLabels.length > 0
      && proofReferenceLabels.every((label) => !isWeakWeddingProductionProofReference(label));
  });
}

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

function normalizeGate(gate: WeddingProductionGoNoGoGate): WeddingProductionGoNoGoGate {
  return {
    ...gate,
    blockerLabels: cleanWeddingProductionLabels(gate.blockerLabels),
    nextActionLabels: cleanWeddingProductionLabels(gate.nextActionLabels),
  };
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
  const proofReferenceLabels = cleanWeddingProductionLabels(input.proofReferenceLabels);
  const weakProofReferenceLabels = proofReferenceLabels.filter(isWeakWeddingProductionProofReference);
  const missingProofLabels = cleanWeddingProductionLabels([
    ...input.missingProofLabels,
    weakProofReferenceLabels.length
      ? "One or more proof references are placeholders, dry-run receipts, or non-production examples."
      : null,
  ]);
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

function vendorQuoteReplyGate(
  evidence: WeddingProductionReadinessEvidenceState,
): WeddingProductionGoNoGoGate {
  const ui = evidence.vendorQuoteReplyUi;
  const production = evidence.vendorQuoteReplyProduction;
  const ready = evidence.evidence.vendorQuoteReplyUiReady
    && evidence.evidence.vendorQuoteReplyProductionReady;
  const status = gateStatus(ready, true);
  const blockerLabels = cleanWeddingProductionLabels([
    ...(ui && !ui.productionReady ? ui.blockerLabels : []),
    ...(production?.blockerLabels.length ? production.blockerLabels : []),
    ...(!ui ? ["Vendor quote reply UI proof is missing."] : []),
    ...(production && !production.productionReady && !production.blockerLabels.length
      ? ["Vendor quote reply live production proof is missing or blocked."]
      : []),
    ...(!production ? ["Vendor quote reply live production proof is missing or blocked."] : []),
  ]);
  const nextActionLabels = cleanWeddingProductionLabels([
    ...(ui && !ui.productionReady ? ui.nextActionLabels : []),
    ...(production?.nextActionLabels.length ? production.nextActionLabels : []),
    ...(!ui ? ["Prove inline quote summary, Tiptap editor, separate approvals, undo-send, sent proof, live regions, and telemetry."] : []),
    ...(production && !production.productionReady && !production.nextActionLabels.length
      ? ["Prove the vendor quote reply flow with live provider send, undo, durable receipt, and proof drawer reconstruction."]
      : []),
    ...(!production ? ["Prove the vendor quote reply flow with live provider send, undo, durable receipt, and proof drawer reconstruction."] : []),
  ]);
  const blockedDetail = !ui
    ? "Vendor quote reply UI proof is missing: quote summary, Tiptap editor, approval controls, undo-send, sent proof, live regions, and telemetry must be verified."
    : ui.productionReady
      ? production?.summary ?? "Vendor quote reply proof is missing provider-send, thread round-trip, regression, or live proof evidence."
      : ui.summary;

  return {
    kind: "vendor_quote_reply",
    title: "Vendor quote reply live-send proof",
    status,
    detail: gateDetail(
      status,
      "Vendor quote reply live provider proof is complete.",
      blockedDetail,
    ),
    blockerLabels: status === "ready" ? [] : blockerLabels,
    nextActionLabels: status === "ready" ? [] : nextActionLabels,
  };
}

function templateLaunchGate(
  evidence: WeddingProductionReadinessEvidenceState,
): WeddingProductionGoNoGoGate {
  const readiness = evidence.templateLaunchReadiness;
  const status = gateStatus(evidence.evidence.templateLaunchIntakeReady, true);
  return {
    kind: "template_launch",
    title: "Wedding template launch and intake proof",
    status,
    detail: gateDetail(
      status,
      "Wedding template launch and first-run intake proof is complete.",
      readiness?.summary ?? "Wedding template launch proof is missing or incomplete.",
    ),
    blockerLabels: status === "ready"
      ? []
      : readiness?.blockerLabels.length
        ? readiness.blockerLabels
        : ["Wedding template launch proof is missing."],
    nextActionLabels: status === "ready"
      ? []
      : readiness?.nextActionLabels.length
        ? readiness.nextActionLabels
        : ["Prove wedding template deep link, first-run intake, real workspace creation, and launch guardrails."],
  };
}

export function buildWeddingProductionGoNoGoPacketState(
  evidence: WeddingProductionReadinessEvidenceState,
): WeddingProductionGoNoGoPacketState {
  const backendReady = evidence.evidence.backendPaginationReady
    && evidence.backendScaleProofPacket?.canClearBackendScaleGate === true;
  const backendStatus = gateStatus(
    backendReady,
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
      title: "Saved workspace backend pagination and scale proof",
      status: backendStatus,
      detail: gateDetail(
        backendStatus,
        "Bounded saved-workspace pagination and refresh proof is complete.",
        evidence.backendScaleProofPacket?.summary ?? "Backend scale proof is blocked.",
      ),
      blockerLabels: cleanWeddingProductionLabels([
        ...evidence.missingRequiredEvidenceLabels.filter((label) => /Backend pagination contract/i.test(label)),
        ...(evidence.backendScaleProofPacket?.missingEvidenceLabels ?? ["Backend saved-workspace scale proof packet is missing."]),
      ]),
      nextActionLabels: evidence.backendScaleProofPacket?.nextActionLabels ?? ["Run saved-workspace backend scale proof."],
    },
    templateLaunchGate(evidence),
    booleanGate({
      kind: "approval_ui",
      title: "Approval execution UI proof",
      ready: evidence.evidence.approvalExecutionUiReady,
      readyDetail: "Approval execution UI proof is complete.",
      blockedDetail: "Approval execution UI proof is missing or incomplete.",
      blockerLabel: "Approval UI proof is missing.",
      nextActionLabel: "Prove approval execution UI and receipt handling.",
    }),
    vendorQuoteReplyGate(evidence),
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
  const normalizedGates = gates.map(normalizeGate);
  const counts = gateCounts(normalizedGates);
  const backendPaginationProofRefs = evidence.durableProofReferenceLabels
    .filter((label) => /Backend pagination contract proof/i.test(label));
  const collaborationLifecycleProofRefs = evidence.durableProofReferenceLabels
    .filter((label) => /collaboration-lifecycle|Collaborator lifecycle/i.test(label));
  const adminRoutingProofRefs = evidence.durableProofReferenceLabels
    .filter((label) => /admin routing|routing policy/i.test(label));
  const adminOpsMetricsProofRefs = evidence.durableProofReferenceLabels
    .filter((label) => /oracle metrics|ops backend metrics|user metrics/i.test(label));
  const templateLaunchProofRefs = evidence.durableProofReferenceLabels
    .filter((label) => /Wedding template launch proof/i.test(label));
  const vendorQuoteReplyProofRefs = evidence.durableProofReferenceLabels
    .filter((label) => /Actual connected provider send verified/i.test(label));
  const vendorQuoteReplyGateItem = normalizedGates.find((gate) => gate.kind === "vendor_quote_reply");
  const vendorQuoteReplyGateStatus = vendorQuoteReplyGateItem?.status;
  const proofManifest = [
    manifestItem({
      kind: "backend_scale",
      title: "Saved workspace backend pagination and scale receipts",
      gateStatus: backendStatus,
      proofReferenceLabels: [
        ...backendPaginationProofRefs,
        ...(evidence.backendScaleProofPacket?.requirements
        .filter((requirement) => requirement.kind === "proof_ref")
        .map((requirement) => requirement.evidenceLabel) ?? []),
      ],
      missingProofLabels: cleanWeddingProductionLabels([
        ...(backendPaginationProofRefs.length ? [] : evidence.missingRequiredEvidenceLabels.filter((label) => /Backend pagination contract/i.test(label))),
        ...(evidence.backendScaleProofPacket?.missingEvidenceLabels
          .filter((label) => /receipt|proof/i.test(label)) ?? ["Backend saved-workspace scale proof packet is missing."]),
      ]),
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
      kind: "template_launch",
      title: "Wedding template launch receipt",
      gateStatus: normalizedGates.find((gate) => gate.kind === "template_launch")?.status,
      proofReferenceLabels: templateLaunchProofRefs,
      missingProofLabels: templateLaunchProofRefs.length ? [] : ["Wedding template launch proof reference is missing."],
    }),
    manifestItem({
      kind: "vendor_quote_reply",
      title: "Vendor quote reply live-send receipt",
      gateStatus: vendorQuoteReplyGateStatus,
      proofReferenceLabels: vendorQuoteReplyProofRefs,
      missingProofLabels: vendorQuoteReplyGateStatus === "ready"
        ? []
        : vendorQuoteReplyGateItem?.blockerLabels.length
          ? vendorQuoteReplyGateItem.blockerLabels
          : vendorQuoteReplyProofRefs.length
            ? []
            : ["Vendor quote reply live provider proof reference is missing."],
    }),
    manifestItem({
      kind: "collaboration_lifecycle",
      title: "Collaborator lifecycle receipt",
      gateStatus: normalizedGates.find((gate) => gate.kind === "collaboration_lifecycle")?.status,
      proofReferenceLabels: collaborationLifecycleProofRefs,
      missingProofLabels: collaborationLifecycleProofRefs.length ? [] : ["Collaborator lifecycle audit projection proof reference is missing."],
    }),
    manifestItem({
      kind: "admin_routing_policy",
      title: "Admin-funded AI routing policy receipt",
      gateStatus: normalizedGates.find((gate) => gate.kind === "admin_routing_policy")?.status,
      proofReferenceLabels: adminRoutingProofRefs,
      missingProofLabels: adminRoutingProofRefs.length ? [] : ["Admin-funded wedding AI routing policy proof reference is missing."],
    }),
    manifestItem({
      kind: "admin_ops_metrics",
      title: "Admin Oracle metrics receipt",
      gateStatus: normalizedGates.find((gate) => gate.kind === "admin_ops_metrics")?.status,
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
  const blockerLabels = cleanWeddingProductionLabels([
    ...evidence.missingRequiredEvidenceLabels,
    ...normalizedGates.flatMap((gate) => gate.status === "ready" ? [] : gate.blockerLabels),
    ...proofManifest.flatMap((item) => item.status === "attached" ? [] : item.missingProofLabels),
  ]);
  const canUploadToOracle = normalizedGates.every((gate) => gate.status === "ready")
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
    gates: normalizedGates,
    gateCounts: counts,
    proofManifest,
    proofManifestCounts: manifestCounts,
    blockerLabels,
    nextActionLabels: cleanWeddingProductionLabels(normalizedGates.flatMap((gate) => gate.status === "ready" ? [] : gate.nextActionLabels)),
    guardrailLabels: cleanWeddingProductionLabels([
      "Do not deploy while any gate is missing or blocked.",
      "Do not treat dry-run provider receipts as live production execution proof.",
      "Keep secrets file-backed and out of AFP/search/UI logs.",
      "Record durable proof references before changing Oracle production.",
    ]),
  };
}
