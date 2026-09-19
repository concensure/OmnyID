// @locs-version: 2.0
import type { WeddingPersistedApprovalReceipt } from "@/lib/weddingPersistedWorkspaceState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

export type WeddingProviderHandoffAuditCard = {
  id: string;
  title: string;
  statusLabel: "Setup needed" | "Connected";
  detailLabel: string;
  metadataLabels: string[];
  pendingReceiptTitles: string[];
  action: WeddingWorkspaceSidebarAction;
};

export function buildWeddingProviderHandoffAuditCard(
  receipts: readonly WeddingPersistedApprovalReceipt[] | null | undefined,
): WeddingProviderHandoffAuditCard | null {
  const externalReceipts = (receipts ?? []).filter((receipt) => receipt.externalProviderRequired);
  if (externalReceipts.length === 0) return null;
  const pending = externalReceipts.filter((receipt) =>
    !receipt.providerExecutorConnected || receipt.providerExecutorStatus !== "available"
  );
  const capabilities = Array.from(new Set(
    externalReceipts.map((receipt) => receipt.providerCapability).filter((value): value is string => Boolean(value)),
  ));
  const setupViews = Array.from(new Set(
    pending.map((receipt) => receipt.providerSetupView).filter((value): value is string => Boolean(value)),
  ));

  return {
    id: "provider-handoff-audit",
    title: "Connected apps for sending",
    statusLabel: pending.length > 0 ? "Setup needed" : "Connected",
    detailLabel: pending.length > 0
      ? `${pending.length} approved wedding action${pending.length === 1 ? "" : "s"} still need an app connection before sending.`
      : `${externalReceipts.length} approved wedding action${externalReceipts.length === 1 ? "" : "s"} can use connected apps.`,
    metadataLabels: [
      `${externalReceipts.length} send action${externalReceipts.length === 1 ? "" : "s"}`,
      `${pending.length} need setup`,
      ...capabilities.map((capability) => capability.replace(/_/g, " ")),
      ...setupViews.map((view) => `setup: ${view.replace(/_/g, " ")}`),
    ].slice(0, 8),
    pendingReceiptTitles: pending.map((receipt) => receipt.title).slice(0, 4),
    action: {
      kind: "open_connected_apps",
      label: "Open Connected Apps",
      enabled: pending.length > 0,
      reason: pending.length > 0 ? null : "All approved sending actions already have connected apps.",
      metadata: {
        provider_handoff_audit: {
          external_handoff_count: externalReceipts.length,
          pending_executor_count: pending.length,
          capabilities,
          setup_views: setupViews,
          pending_receipt_ids: pending.map((receipt) => receipt.id),
        },
      },
      contextLabels: pending.map((receipt) => receipt.title).slice(0, 4),
    },
  };
}
