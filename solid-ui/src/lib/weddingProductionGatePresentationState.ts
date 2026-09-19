// @locs-version: 2.0
import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";

export type WeddingProductionGatePresentationState = {
  visible: boolean;
  canUploadToOracle: boolean;
  statusLabel: "Ready" | "Needs checks";
  containerClass: string;
  titleClass: string;
  summaryClass: string;
  statusClass: string;
  summary: string;
  gateCountLabel: string | null;
  proofManifestCountLabel: string | null;
  gates: WeddingProductionGoNoGoPacketState["gates"];
  proofManifest: WeddingProductionGoNoGoPacketState["proofManifest"];
  blockerLabels: string[];
  guardrailLabels: string[];
  proofReferenceLabels: string[];
  missingProofLabels: string[];
  nextActionLabel: string | null;
  nextActionLabels: string[];
};

export function buildWeddingProductionGatePresentationState(
  packet: WeddingProductionGoNoGoPacketState | null | undefined,
): WeddingProductionGatePresentationState {
  const canUploadToOracle = packet?.canUploadToOracle === true;
  const gateCountLabel = packet
    ? `${packet.gateCounts.ready}/${packet.gateCounts.total} gates ready`
      + (packet.gateCounts.blocked ? `, ${packet.gateCounts.blocked} blocked` : "")
      + (packet.gateCounts.missing ? `, ${packet.gateCounts.missing} missing` : "")
    : null;
  const proofManifestCountLabel = packet
    ? `${packet.proofManifestCounts.attached}/${packet.proofManifestCounts.total} receipt groups attached`
      + (packet.proofManifestCounts.blocked ? `, ${packet.proofManifestCounts.blocked} blocked` : "")
      + (packet.proofManifestCounts.missing ? `, ${packet.proofManifestCounts.missing} missing` : "")
    : null;
  const nextActionLabels = (packet?.nextActionLabels ?? ["Attach launch-readiness proof."]).slice(0, 4);
  return {
    visible: true,
    canUploadToOracle,
    statusLabel: canUploadToOracle ? "Ready" : "Needs checks",
    containerClass: canUploadToOracle
      ? "border-emerald-100/80 bg-emerald-50/80"
      : "border-red-100/80 bg-red-50/80",
    titleClass: canUploadToOracle ? "text-sm font-semibold text-emerald-950" : "text-sm font-semibold text-red-950",
    summaryClass: canUploadToOracle ? "mt-2 text-[11px] leading-5 text-emerald-900/75" : "mt-2 text-[11px] leading-5 text-red-900/75",
    statusClass: canUploadToOracle ? "text-emerald-900" : "text-red-900",
    summary: packet?.summary ?? "Launch checks are not complete yet. Finish the required proof and safety checks before publishing this wedding template.",
    gateCountLabel,
    proofManifestCountLabel,
    gates: packet?.gates ?? [],
    proofManifest: packet?.proofManifest ?? [],
    blockerLabels: (packet?.blockerLabels ?? ["Launch checklist is missing."]).slice(0, 4),
    guardrailLabels: (packet?.guardrailLabels ?? [
      "Do not publish while launch checks are missing.",
      "Generate readiness proof before publishing.",
      "Record proof links before changing production.",
    ]).slice(0, 3),
    proofReferenceLabels: (packet?.proofManifest ?? [])
      .flatMap((item) => item.proofReferenceLabels)
      .slice(0, 8),
    missingProofLabels: (packet?.proofManifest ?? [])
      .flatMap((item) => item.missingProofLabels)
      .slice(0, 6),
    nextActionLabel: nextActionLabels[0] ?? null,
    nextActionLabels,
  };
}
