// @locs-version: 2.0
import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";
import {
  weddingProductionGoNoGoPacketHasCompleteProofManifest,
  weddingProductionGoNoGoPacketHasCompleteReadyGates,
} from "@/lib/weddingProductionGoNoGoPacketState";
import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
} from "@/lib/weddingProductionLabelState";

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
  proofManifestLabels: string[];
  blockerLabels: string[];
  guardrailLabels: string[];
  proofReferenceLabels: string[];
  missingProofLabels: string[];
  nextActionLabel: string | null;
  nextActionLabels: string[];
};

function isVendorQuoteReplyLabel(label: string): boolean {
  return /vendor quote reply|inline quote|Tiptap|budget acknowledgement|live provider|connected[- ]provider|Gmail\/provider|proof drawer|durable provider receipt/i
    .test(label);
}

function isTemplateLaunchLabel(label: string): boolean {
  return /wedding template launch|first-run intake|Need-To-Know|planning-files workspace|real saved workspace|no-live-claims|template launch proof/i
    .test(label);
}

function cleanLabels(labels: readonly (string | null | undefined)[], maxLength?: number): string[] {
  return cleanWeddingProductionLabels(labels, { maxLength: maxLength ?? 180, wordAware: true });
}

function productionLabelPriority(label: string): number {
  if (isVendorQuoteReplyLabel(label)) return 0;
  if (isTemplateLaunchLabel(label)) return 1;
  return 2;
}

function prioritizeLaunchReadinessLabels(labels: readonly (string | null | undefined)[], limit: number): string[] {
  const uniqueLabels = cleanLabels(labels);
  return [...uniqueLabels]
    .sort((left, right) => productionLabelPriority(left) - productionLabelPriority(right))
    .slice(0, limit);
}

function proofManifestStatusLabel(
  item: WeddingProductionGoNoGoPacketState["proofManifest"][number],
): string {
  const statusLabel = item.status === "attached"
    ? "attached"
    : item.status === "blocked"
      ? "blocked"
      : "missing";
  const proofCount = cleanLabels(item.proofReferenceLabels).length;
  const missingCount = cleanLabels(item.missingProofLabels).length;
  const title = cleanWeddingProductionLabel(item.title, { maxLength: 96, wordAware: true }) ?? "Receipt group";
  return `${title}: ${statusLabel}`
    + (proofCount ? `, ${proofCount} proof ref${proofCount === 1 ? "" : "s"}` : "")
    + (missingCount ? `, ${missingCount} missing` : "");
}

function proofManifestPriority(item: WeddingProductionGoNoGoPacketState["proofManifest"][number]): number {
  if (item.kind === "vendor_quote_reply") return 0;
  if (item.kind === "template_launch") return 1;
  return 2;
}

function packetReadyForPresentation(packet: WeddingProductionGoNoGoPacketState | null | undefined): boolean {
  if (!packet) return false;
  if (packet.status !== "ready" || packet.canUploadToOracle !== true) return false;
  return weddingProductionGoNoGoPacketHasCompleteReadyGates(packet)
    && weddingProductionGoNoGoPacketHasCompleteProofManifest(packet);
}

export function buildWeddingProductionGatePresentationState(
  packet: WeddingProductionGoNoGoPacketState | null | undefined,
): WeddingProductionGatePresentationState {
  const structurallyReady = packetReadyForPresentation(packet);
  const canUploadToOracle = structurallyReady;
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
  const nextActionLabels = prioritizeLaunchReadinessLabels(
    packet?.nextActionLabels ?? ["Attach launch-readiness proof."],
    4,
  );
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
    proofManifestLabels: (packet?.proofManifest ?? [])
      .slice()
      .sort((left, right) => proofManifestPriority(left) - proofManifestPriority(right))
      .map(proofManifestStatusLabel)
      .slice(0, 7),
    blockerLabels: prioritizeLaunchReadinessLabels(
      packet
        ? structurallyReady
          ? packet.blockerLabels
          : [
              ...packet.blockerLabels,
              packet.canUploadToOracle === true
                ? "Launch checklist is marked ready but is missing complete gate counts or proof manifest receipts."
                : null,
            ]
        : ["Launch checklist is missing."],
      4,
    ),
    guardrailLabels: cleanLabels(packet?.guardrailLabels ?? [
      "Do not publish while launch checks are missing.",
      "Generate readiness proof before publishing.",
      "Record proof links before changing production.",
    ]).slice(0, 3),
    proofReferenceLabels: (packet?.proofManifest ?? [])
      .flatMap((item) => cleanLabels(item.proofReferenceLabels))
      .sort((left, right) => productionLabelPriority(left) - productionLabelPriority(right))
      .slice(0, 8),
    missingProofLabels: prioritizeLaunchReadinessLabels(
      (packet?.proofManifest ?? []).flatMap((item) => item.missingProofLabels),
      6,
    ),
    nextActionLabel: nextActionLabels[0] ?? null,
    nextActionLabels,
  };
}
