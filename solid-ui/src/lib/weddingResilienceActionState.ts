// @locs-version: 1.0
import type {
  WeddingResilienceAttentionItem,
  WeddingResilienceLedgerState,
} from "@/lib/weddingResilienceLedgerState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingResilienceActionIntent =
  | "open_item"
  | "review_all"
  | "defer_item"
  | "resolve_item"
  | "dismiss_item";

function menuFor(item: WeddingResilienceAttentionItem): WeddingWorkspaceMenuId {
  return item.kind === "recovery_plan" ? "response_queue" : "home";
}

function actionLabel(item: WeddingResilienceAttentionItem, intent: WeddingResilienceActionIntent): string {
  if (intent === "defer_item") return "Review Later";
  if (intent === "resolve_item") return "Resolved together";
  if (intent === "dismiss_item") return "Not a conflict";
  if (intent === "review_all") return "Review Wedding Changes";
  return item.actionLabel;
}

function actionKind(intent: WeddingResilienceActionIntent): WeddingWorkspaceSidebarAction["kind"] {
  return intent === "defer_item" ? "defer_decision" : "open_workspace_menu";
}

function lifecyclePacket(
  item: WeddingResilienceAttentionItem,
  intent: WeddingResilienceActionIntent,
): Record<string, unknown> | null {
  const lifecycle = item.preferenceConflictLifecycle;
  const outcome = intent === "resolve_item" ? "resolved" : intent === "dismiss_item" ? "dismissed" : null;
  if (!lifecycle || !outcome) return null;
  return {
    schema_version: "wedding.preference_conflict_lifecycle.v1",
    conflict_id: lifecycle.conflictId,
    source_message_id: item.sourceMessageId,
    revision_fingerprint: lifecycle.revisionFingerprint,
    outcome,
    creates_planning_rule: false,
  };
}

function packetFor(
  item: WeddingResilienceAttentionItem,
  intent: WeddingResilienceActionIntent,
): Record<string, unknown> {
  return {
    version: 1,
    intent,
    item_id: item.id,
    item_kind: item.kind,
    title: item.title,
    priority: item.priority,
    detail: item.detail,
    action_label: item.actionLabel,
    source_message_id: item.sourceMessageId,
    metadata_labels: item.metadataLabels,
    comparison_preview: item.comparisonPreview,
    wedding_workspace_menu: menuFor(item),
    a2ui: item.a2ui,
  };
}

function deferralPacket(item: WeddingResilienceAttentionItem): Record<string, unknown> {
  return {
    version: 1,
    id: item.id,
    kind: item.kind,
    title: item.title,
    pressure_family: "attention",
    source_surface: menuFor(item),
    due_label: null,
    due_at: null,
    explanation: item.detail,
    evidence_labels: item.metadataLabels,
    requested_state: "deferred",
    user_reason: "The couple chose to review this later.",
    resurface_policy: "Bring this back after 7 days or when the evidence changes.",
  };
}

export function buildWeddingResilienceSidebarAction(
  item: WeddingResilienceAttentionItem | null,
  intent: WeddingResilienceActionIntent = "open_item",
): WeddingWorkspaceSidebarAction {
  const lifecycle = item ? lifecyclePacket(item, intent) : null;
  return {
    kind: lifecycle ? "record_resilience_lifecycle" : item ? actionKind(intent) : "open_workspace_menu",
    label: item ? actionLabel(item, intent) : "Review Wedding Changes",
    enabled: item !== null,
    reason: item ? null : "No partner conflicts or recovery plans need attention.",
    metadata: {
      wedding_workspace_menu: item ? menuFor(item) : "home",
      ...(item && intent === "defer_item" ? { decision_deferral: deferralPacket(item) } : {}),
      ...(lifecycle ? { preference_conflict_lifecycle: lifecycle } : {}),
      wedding_resilience: item ? packetFor(item, intent) : {
        version: 1,
        intent,
        item_id: null,
        item_kind: null,
      },
    },
    contextLabels: item ? [item.title, item.detail, ...item.metadataLabels].slice(0, 5) : [],
  };
}

export function buildWeddingResilienceReviewAllAction(
  state: Pick<WeddingResilienceLedgerState, "summaryLabel" | "attentionItems" | "unresolvedCount" | "urgentCount">,
): WeddingWorkspaceSidebarAction {
  const top = state.attentionItems[0] ?? null;
  return {
    kind: "open_workspace_menu",
    label: "Review Wedding Changes",
    enabled: state.attentionItems.length > 0,
    reason: state.attentionItems.length > 0 ? null : "No partner conflicts or recovery plans need attention.",
    metadata: {
      wedding_workspace_menu: top ? menuFor(top) : "home",
      wedding_resilience: {
        version: 1,
        intent: "review_all",
        summary_label: state.summaryLabel,
        unresolved_count: state.unresolvedCount,
        urgent_count: state.urgentCount,
        item_ids: state.attentionItems.map((item) => item.id),
        items: state.attentionItems.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          priority: item.priority,
          action_label: item.actionLabel,
          source_message_id: item.sourceMessageId,
        })),
      },
    },
    contextLabels: [
      state.summaryLabel,
      ...state.attentionItems.map((item) => item.title),
    ].slice(0, 5),
  };
}
