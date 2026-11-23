// @locs-version: 2.0
import type {
  WeddingProductionReadinessCheck,
  WeddingProductionReadinessState,
} from "@/lib/weddingProductionReadinessState";
import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";
import type { WeddingProductionReadinessEvidenceState } from "@/lib/weddingProductionReadinessEvidenceState";
import {
  weddingProductionGoNoGoPacketHasCompleteProofManifest,
  weddingProductionGoNoGoPacketHasCompleteReadyGates,
} from "@/lib/weddingProductionGoNoGoPacketState";
import {
  cleanWeddingProductionLabel,
} from "@/lib/weddingProductionLabelState";

export type WeddingProductionRemainingWorkItemId =
  | WeddingProductionReadinessCheck["id"]
  | "aggregate_go_no_go_packet";

export type WeddingProductionRemainingWorkItem = {
  id: WeddingProductionRemainingWorkItemId;
  label: string;
  requiredForOracle: boolean;
  readinessTier: "oracle_blocker" | "production_polish";
  estimatedPasses: number;
  summary: string;
};

export type WeddingProductionRemainingWorkState = {
  productionReady: boolean;
  oracleUploadAllowed: boolean;
  totalBlockedItems: number;
  oracleBlockingItems: WeddingProductionRemainingWorkItem[];
  productionPolishItems: WeddingProductionRemainingWorkItem[];
  nextRecommendedItems: WeddingProductionRemainingWorkItem[];
  estimatedOraclePassesRemaining: number;
  estimatedFullProductionPassesRemaining: number;
  estimatedNextPasses: number;
  headline: string;
};

const PASS_ESTIMATES: Record<WeddingProductionReadinessCheck["id"], number> = {
  backend_pagination: 1,
  template_launch_intake: 1,
  live_map_geocoding: 1,
  graph_canvas_highlighting: 1,
  approval_execution_ui: 1,
  vendor_comparison_ui: 1,
  vendor_quote_reply_ui: 1,
  native_export_workers: 2,
  llm_need_to_know_extraction: 2,
  seeded_vendor_corpus: 1,
  expected_behavior_coverage: 1,
  import_parser_readiness: 1,
  collaboration_access_controls: 2,
  collaboration_lifecycle_audit: 1,
  admin_ai_routing_policy: 1,
  admin_ops_backend_metrics: 1,
  provider_executor_integrations: 2,
  oracle_release_gate: 1,
};

const EXTRA_PASS_ESTIMATES: Record<Exclude<WeddingProductionRemainingWorkItemId, WeddingProductionReadinessCheck["id"]>, number> = {
  aggregate_go_no_go_packet: 1,
};

const PRIORITY_ORDER: readonly WeddingProductionRemainingWorkItemId[] = [
  "provider_executor_integrations",
  "approval_execution_ui",
  "template_launch_intake",
  "vendor_comparison_ui",
  "backend_pagination",
  "import_parser_readiness",
  "collaboration_access_controls",
  "collaboration_lifecycle_audit",
  "admin_ai_routing_policy",
  "admin_ops_backend_metrics",
  "aggregate_go_no_go_packet",
  "oracle_release_gate",
  "vendor_quote_reply_ui",
  "expected_behavior_coverage",
  "seeded_vendor_corpus",
  "live_map_geocoding",
  "graph_canvas_highlighting",
  "llm_need_to_know_extraction",
  "native_export_workers",
];

function priorityIndex(item: WeddingProductionRemainingWorkItem): number {
  const index = PRIORITY_ORDER.indexOf(item.id);
  return index === -1 ? PRIORITY_ORDER.length : index;
}

const EVIDENCE_LABEL_PATTERNS: Partial<Record<WeddingProductionReadinessCheck["id"], RegExp>> = {
  live_map_geocoding: /map\/geocoding proof reference/i,
  graph_canvas_highlighting: /graph canvas proof reference/i,
  native_export_workers: /native export worker proof references/i,
  llm_need_to_know_extraction: /Need-To-Know LLM extraction proof reference/i,
  seeded_vendor_corpus: /seeded vendor corpus proof reference/i,
  expected_behavior_coverage: /expected behavior audit proof reference/i,
};

function evidenceMissingProofSummary(
  check: WeddingProductionReadinessCheck,
  evidence: WeddingProductionReadinessEvidenceState | null | undefined,
): string | null {
  const pattern = EVIDENCE_LABEL_PATTERNS[check.id];
  if (!pattern) return null;
  return evidence?.missingRequiredEvidenceLabels.find((label) => pattern.test(label)) ?? null;
}

function itemSummary(
  check: WeddingProductionReadinessCheck,
  evidence?: WeddingProductionReadinessEvidenceState | null,
): string {
  const evidenceSummary = evidenceMissingProofSummary(check, evidence);
  if (evidenceSummary) return evidenceSummary;
  const detail = cleanWeddingProductionLabel(check.detail, { maxLength: 180, wordAware: true });
  return detail ?? check.label;
}

function toRemainingWorkItem(
  check: WeddingProductionReadinessCheck,
  evidence?: WeddingProductionReadinessEvidenceState | null,
): WeddingProductionRemainingWorkItem {
  return {
    id: check.id,
    label: cleanWeddingProductionLabel(check.label) ?? check.id,
    requiredForOracle: check.requiredForOracle,
    readinessTier: check.requiredForOracle ? "oracle_blocker" : "production_polish",
    estimatedPasses: PASS_ESTIMATES[check.id],
    summary: itemSummary(check, evidence),
  };
}

function aggregateGoNoGoPacketReady(packet: WeddingProductionGoNoGoPacketState | null | undefined): boolean {
  if (!packet) return false;
  if (packet.status !== "ready" || packet.canUploadToOracle !== true) return false;
  return weddingProductionGoNoGoPacketHasCompleteReadyGates(packet)
    && weddingProductionGoNoGoPacketHasCompleteProofManifest(packet);
}

function aggregateGoNoGoRemainingWorkItem(
  packet: WeddingProductionGoNoGoPacketState | null | undefined,
): WeddingProductionRemainingWorkItem | null {
  if (aggregateGoNoGoPacketReady(packet)) return null;
  const label = "Aggregate production go/no-go packet";
  const packetReason = packet
    ? "The aggregate packet is present but is not uploadable with complete ready gates and proof manifest receipts."
    : "The aggregate packet is missing, so the launch checklist cannot prove the same evidence the Oracle update path will enforce.";
  return {
    id: "aggregate_go_no_go_packet",
    label,
    requiredForOracle: true,
    readinessTier: "oracle_blocker",
    estimatedPasses: EXTRA_PASS_ESTIMATES.aggregate_go_no_go_packet,
    summary: packetReason,
  };
}

function blockedItems(
  readiness: WeddingProductionReadinessState,
  evidence?: WeddingProductionReadinessEvidenceState | null,
): WeddingProductionRemainingWorkItem[] {
  return readiness.checks
    .filter((check) => check.status === "blocked")
    .map((check) => toRemainingWorkItem(check, evidence));
}

function passEstimate(items: readonly WeddingProductionRemainingWorkItem[]): number {
  if (!items.length) return 0;
  return items.reduce((total, item) => {
    const estimate = Number.isFinite(item.estimatedPasses) && item.estimatedPasses > 0
      ? Math.min(Math.ceil(item.estimatedPasses), 6)
      : 1;
    return total + estimate;
  }, 0);
}

function nextRecommendedItems(
  oracleBlockingItems: readonly WeddingProductionRemainingWorkItem[],
  productionPolishItems: readonly WeddingProductionRemainingWorkItem[],
): WeddingProductionRemainingWorkItem[] {
  const activeLane = oracleBlockingItems.length ? oracleBlockingItems : productionPolishItems;
  return [...activeLane]
    .sort((left, right) => priorityIndex(left) - priorityIndex(right))
    .slice(0, 3);
}

export function buildWeddingProductionRemainingWorkState(
  readiness: WeddingProductionReadinessState,
  productionGoNoGoPacket?: WeddingProductionGoNoGoPacketState | null,
  productionReadinessEvidence?: WeddingProductionReadinessEvidenceState | null,
): WeddingProductionRemainingWorkState {
  const readinessBlockedItems = blockedItems(readiness, productionReadinessEvidence);
  const aggregateItem = readiness.oracleUploadAllowed
    ? aggregateGoNoGoRemainingWorkItem(productionGoNoGoPacket)
    : null;
  const remainingItems = aggregateItem ? [...readinessBlockedItems, aggregateItem] : readinessBlockedItems;
  const oracleBlockingItems = remainingItems.filter((item) => item.requiredForOracle);
  const productionPolishItems = remainingItems.filter((item) => !item.requiredForOracle);
  const recommendedItems = nextRecommendedItems(oracleBlockingItems, productionPolishItems);
  const estimatedOraclePassesRemaining = passEstimate(oracleBlockingItems);
  const estimatedFullProductionPassesRemaining = passEstimate(remainingItems);
  const estimatedNextPasses = passEstimate(recommendedItems);
  const headline = oracleBlockingItems.length
    ? readiness.oracleUploadAllowed
      ? "Wedding planner still needs aggregate launch proof before Oracle upload."
      : "Wedding planner still has Oracle-blocking production-readiness items."
    : readiness.status === "production_ready"
      ? "Wedding planner is production-ready."
      : "Wedding planner can clear Oracle upload, with production-polish items still open.";

  return {
    productionReady: readiness.status === "production_ready" && oracleBlockingItems.length === 0,
    oracleUploadAllowed: readiness.oracleUploadAllowed && oracleBlockingItems.length === 0,
    totalBlockedItems: remainingItems.length,
    oracleBlockingItems,
    productionPolishItems,
    nextRecommendedItems: recommendedItems,
    estimatedOraclePassesRemaining,
    estimatedFullProductionPassesRemaining,
    estimatedNextPasses,
    headline,
  };
}
