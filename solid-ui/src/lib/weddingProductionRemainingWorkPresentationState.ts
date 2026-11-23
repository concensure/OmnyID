// @locs-version: 2.0
import type {
  WeddingProductionRemainingWorkItem,
  WeddingProductionRemainingWorkState,
} from "@/lib/weddingProductionRemainingWorkState";
import { cleanWeddingProductionLabel } from "@/lib/weddingProductionLabelState";

export type WeddingProductionRemainingWorkPresentationItem = {
  id: WeddingProductionRemainingWorkItem["id"];
  label: string;
  summary: string;
  estimateLabel: string;
  tierLabel: "Oracle blocker" | "Production polish";
};

export type WeddingProductionRemainingWorkPresentationState = {
  visible: boolean;
  statusLabel: "Ready" | "Oracle blocked" | "Polish remaining";
  containerClass: string;
  statusClass: string;
  titleClass: string;
  summaryClass: string;
  headline: string;
  summary: string;
  oracleEstimateLabel: string;
  fullEstimateLabel: string;
  nextEstimateLabel: string;
  oracleCountLabel: string;
  polishCountLabel: string;
  nextItems: WeddingProductionRemainingWorkPresentationItem[];
};

function boundedPassCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.ceil(value), 99)
    : 0;
}

function passLabel(count: number): string {
  const boundedCount = boundedPassCount(count);
  return `${boundedCount} ${boundedCount === 1 ? "pass" : "passes"}`;
}

function itemLabel(item: WeddingProductionRemainingWorkItem): string {
  return cleanWeddingProductionLabel(item.label, { maxLength: 96, wordAware: true }) ?? String(item.id);
}

function itemSummary(item: WeddingProductionRemainingWorkItem): string {
  return cleanWeddingProductionLabel(item.summary, { maxLength: 180, wordAware: true }) ?? itemLabel(item);
}

function presentItem(item: WeddingProductionRemainingWorkItem): WeddingProductionRemainingWorkPresentationItem {
  return {
    id: item.id,
    label: itemLabel(item),
    summary: itemSummary(item),
    estimateLabel: passLabel(boundedPassCount(item.estimatedPasses)),
    tierLabel: item.readinessTier === "oracle_blocker" ? "Oracle blocker" : "Production polish",
  };
}

function statusLabel(state: WeddingProductionRemainingWorkState): WeddingProductionRemainingWorkPresentationState["statusLabel"] {
  if (state.productionReady) return "Ready";
  if (state.oracleBlockingItems.length > 0) return "Oracle blocked";
  return "Polish remaining";
}

function summaryLabel(state: WeddingProductionRemainingWorkState): string {
  if (state.productionReady) return "All production-readiness checks are complete.";
  if (state.oracleBlockingItems.length > 0) {
    return `${state.oracleBlockingItems.length} Oracle-blocking item${state.oracleBlockingItems.length === 1 ? "" : "s"} need proof before upload.`;
  }
  return `${state.productionPolishItems.length} production-polish item${state.productionPolishItems.length === 1 ? "" : "s"} remain after Oracle upload can clear.`;
}

export function buildWeddingProductionRemainingWorkPresentationState(
  state: WeddingProductionRemainingWorkState | null | undefined,
): WeddingProductionRemainingWorkPresentationState {
  const ready = state?.productionReady === true;
  const blocked = (state?.oracleBlockingItems.length ?? 0) > 0;
  const headline = cleanWeddingProductionLabel(state?.headline, { maxLength: 160, wordAware: true })
    ?? "Wedding planner production readiness is not available yet.";
  return {
    visible: true,
    statusLabel: state ? statusLabel(state) : "Oracle blocked",
    containerClass: ready
      ? "border-emerald-100/80 bg-emerald-50/80"
      : blocked || !state
        ? "border-red-100/80 bg-red-50/80"
        : "border-amber-100/80 bg-amber-50/80",
    statusClass: ready ? "text-emerald-900" : blocked || !state ? "text-red-900" : "text-amber-900",
    titleClass: ready ? "text-emerald-950" : blocked || !state ? "text-red-950" : "text-amber-950",
    summaryClass: ready ? "text-emerald-900/75" : blocked || !state ? "text-red-900/75" : "text-amber-900/75",
    headline,
    summary: state ? summaryLabel(state) : "Run production-readiness checks to see what remains.",
    oracleEstimateLabel: state ? `Oracle upload: ${passLabel(state.estimatedOraclePassesRemaining)}` : "Oracle upload: not checked",
    fullEstimateLabel: state ? `Full production: ${passLabel(state.estimatedFullProductionPassesRemaining)}` : "Full production: not checked",
    nextEstimateLabel: state ? `Next pass: ${passLabel(state.estimatedNextPasses)}` : "Next pass: not checked",
    oracleCountLabel: state ? `${state.oracleBlockingItems.length} Oracle blocker${state.oracleBlockingItems.length === 1 ? "" : "s"}` : "Oracle blockers not checked",
    polishCountLabel: state ? `${state.productionPolishItems.length} polish item${state.productionPolishItems.length === 1 ? "" : "s"}` : "Polish not checked",
    nextItems: (state?.nextRecommendedItems ?? []).slice(0, 3).map(presentItem),
  };
}
