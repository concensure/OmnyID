// @locs-version: 2.0
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingPersistedApprovalReceipt } from "@/lib/weddingPersistedWorkspaceState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pendingProviderHandoff(receipt: WeddingPersistedApprovalReceipt): boolean {
  return receipt.externalProviderRequired
    && (!receipt.providerExecutorConnected || receipt.providerExecutorStatus !== "available");
}

function existingProviderHandoffKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const receiptId = clean(record(item.metadata).provider_handoff_receipt_id);
    if (receiptId) keys.add(receiptId);
  }
  return keys;
}

function taskKindForCapability(capability: string | null): WeddingPlanningTaskItem["kind"] {
  if (capability === "calendar") return "vendor_coordination";
  if (capability === "vendor_search") return "research";
  if (capability === "registry") return "registry";
  return "vendor_follow_up";
}

function dueLabelForCapability(capability: string | null): string {
  if (capability === "calendar") return "Before external calendar sync is expected";
  if (capability === "vendor_search") return "Before live vendor research is relied on";
  if (capability === "registry") return "Before publishing registry changes";
  return "Before claiming vendor email/follow-up was sent";
}

export function buildWeddingProviderHandoffTaskItems(input: {
  approvalReceipts?: readonly WeddingPersistedApprovalReceipt[] | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  metadata?: unknown;
}): WeddingPlanningTaskItem[] {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingProviderHandoffKeys(input.existingTaskItems ?? []);
  return (input.approvalReceipts ?? [])
    .filter(pendingProviderHandoff)
    .map((receipt): WeddingPlanningTaskItem => {
      const capability = receipt.providerCapability ?? "provider";
      const provider = receipt.requiredProvider ?? receipt.providerSetupView ?? capability;
      return {
        id: `wedding_provider_handoff:${safeWeddingLabel(receipt.id)}`,
        title: `Connect external provider for: ${receipt.title}`,
        kind: taskKindForCapability(receipt.providerCapability),
        dueLabel: dueLabelForCapability(receipt.providerCapability),
        priority: receipt.status === "blocked" ? "high" : "normal",
        source: "agent",
        reviewStatus: "accepted",
        approvalState: "draft",
        metadata: {
          ...metadata,
          provider_handoff_task: true,
          provider_handoff_receipt_id: receipt.id,
          provider_handoff_action_kind: receipt.actionKind,
          provider_handoff_capability: capability,
          provider_handoff_setup_view: receipt.providerSetupView,
          provider_handoff_required_provider: receipt.requiredProvider,
          preparation_checklist: true,
          preparation_checklist_item: `provider-handoff-${safeWeddingLabel(capability)}`,
          user_selectable: true,
          can_deselect_before_commit: true,
          schedule_basis: "pending_provider_handoff",
          second_order_loop: "contact_closure",
          second_order_evidence_labels: [
            `provider capability: ${capability}`,
            `provider setup: ${receipt.providerSetupView ?? "unknown"}`,
            `executor: ${receipt.providerExecutorStatus ?? "unknown"}`,
          ],
          searchable_terms: [
            receipt.title,
            receipt.actionKind,
            receipt.blockedReason,
            receipt.executionMode,
            receipt.providerCapability,
            receipt.requiredProvider,
            receipt.providerSetupView,
            provider,
            "provider handoff",
            "external executor",
            "connected apps",
            metadata.weddingPlanId,
            metadata.responseWorkspaceId,
            ...receipt.riskLabels,
          ].filter(Boolean),
        },
        notes: [
          receipt.blockedReason ?? "External provider execution still needs a connected executor.",
          `Provider: ${provider}.`,
          `Capability: ${capability}.`,
          receipt.providerSetupView ? `Setup surface: ${receipt.providerSetupView}.` : null,
        ].filter(Boolean).join(" "),
      };
    })
    .filter((item) => {
      const receiptId = clean(record(item.metadata).provider_handoff_receipt_id);
      return !existingKeys.has(item.id) && (!receiptId || !existingKeys.has(receiptId));
    });
}
