// @locs-version: 2.0
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type {
  WeddingProductionRemainingWorkItem,
  WeddingProductionRemainingWorkState,
} from "@/lib/weddingProductionRemainingWorkState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedPassEstimate(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.ceil(value), 6)
    : 1;
}

function existingRemainingWorkKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const remainingWorkId = clean(record(item.metadata).production_remaining_work_item_id);
    if (remainingWorkId) keys.add(remainingWorkId);
  }
  return keys;
}

function taskKindForItem(item: WeddingProductionRemainingWorkItem): WeddingPlanningTaskItem["kind"] {
  if (item.id === "provider_executor_integrations") return "vendor_coordination";
  if (item.id === "seeded_vendor_corpus" || item.id === "live_map_geocoding") return "research";
  if (item.id === "approval_execution_ui" || item.id === "vendor_quote_reply_ui") return "email_draft";
  if (item.id === "template_launch_intake" || item.id === "backend_pagination") return "document_checklist";
  return "other";
}

function titleForItem(item: WeddingProductionRemainingWorkItem): string {
  return item.requiredForOracle
    ? `Clear launch blocker: ${item.label}`
    : `Finish production polish: ${item.label}`;
}

function dueLabelForItem(item: WeddingProductionRemainingWorkItem): string {
  return item.requiredForOracle
    ? "Before Oracle upload"
    : "Before calling the wedding planner production-ready";
}

function priorityForItem(item: WeddingProductionRemainingWorkItem): WeddingPlanningTaskItem["priority"] {
  const estimatedPasses = boundedPassEstimate(item.estimatedPasses);
  if (item.requiredForOracle) return estimatedPasses >= 2 ? "urgent" : "high";
  return estimatedPasses >= 2 ? "normal" : "low";
}

export function buildWeddingProductionRemainingWorkTaskItems(input: {
  remainingWork?: WeddingProductionRemainingWorkState | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  metadata?: unknown;
}): WeddingPlanningTaskItem[] {
  const remainingWork = input.remainingWork;
  if (!remainingWork || remainingWork.productionReady || remainingWork.nextRecommendedItems.length === 0) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingRemainingWorkKeys(input.existingTaskItems ?? []);
  return remainingWork.nextRecommendedItems
    .map((item): WeddingPlanningTaskItem => {
      const itemId = String(item.id);
      const estimatedPasses = boundedPassEstimate(item.estimatedPasses);
      return {
        id: `wedding_production_remaining_work:${safeWeddingLabel(itemId)}`,
        title: titleForItem(item),
        kind: taskKindForItem(item),
        dueLabel: dueLabelForItem(item),
        priority: priorityForItem(item),
        source: "agent",
        reviewStatus: "accepted",
        approvalState: "draft",
        metadata: {
          ...metadata,
          production_remaining_work_task: true,
          production_remaining_work_item_id: itemId,
          production_remaining_work_tier: item.readinessTier,
          production_remaining_work_required_for_oracle: item.requiredForOracle,
          production_remaining_work_estimated_passes: estimatedPasses,
          production_readiness_oracle_gate: item.requiredForOracle,
          preparation_checklist: true,
          preparation_checklist_item: `production-readiness-${safeWeddingLabel(itemId)}`,
          user_selectable: true,
          can_deselect_before_commit: true,
          schedule_basis: item.requiredForOracle ? "production_readiness_gate" : "production_polish",
          second_order_loop: item.requiredForOracle ? "commitment_timing" : "quality_polish",
          second_order_evidence_labels: [
            item.requiredForOracle ? "Oracle blocker" : "production polish",
            `${estimatedPasses} pass${estimatedPasses === 1 ? "" : "es"} estimated`,
          ],
          searchable_terms: [
            item.label,
            item.summary,
            item.id,
            item.readinessTier,
            remainingWork.headline,
            "production readiness",
            "remaining production work",
            item.requiredForOracle ? "launch blocker" : "production polish",
            metadata.weddingPlanId,
            metadata.responseWorkspaceId,
          ].filter(Boolean),
        },
        notes: [
          item.summary,
          `Estimated work: ${estimatedPasses} pass${estimatedPasses === 1 ? "" : "es"}.`,
          item.requiredForOracle
            ? "This must clear before Oracle upload."
            : "This can follow Oracle upload, but remains required before final production-ready signoff.",
        ].join(" "),
      };
    })
    .filter((item) => {
      const itemId = clean(record(item.metadata).production_remaining_work_item_id);
      return !existingKeys.has(item.id) && (!itemId || !existingKeys.has(itemId));
    });
}
