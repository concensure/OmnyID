// @locs-version: 2.0
import type { SendAfpMessageInput } from "@/lib/api";
import {
  buildWeddingProjectionQueueState,
  type WeddingProjectionQueueItem,
  type WeddingProjectionQueueItemKind,
  type WeddingProjectionQueueState,
} from "@/lib/weddingProjectionQueueState";
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import type { WeddingNeedToKnowProjectionContext } from "@/lib/weddingNeedToKnowAfpProjectionState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import type { WeddingCollaboratorInviteCard } from "@/lib/weddingCollaborationState";
import type { WeddingBoundaryLedgerObject } from "@/lib/weddingBoundaryLedgerState";
import {
  buildWeddingSemanticSurfaceState,
  type WeddingSemanticSurfaceState,
  type WeddingSemanticUiObject,
} from "@/lib/weddingSemanticUiState";

export type WeddingProjectionQueueActionKind =
  | "save_pending_outputs"
  | "review_blocked_outputs"
  | "open_saved_outputs"
  | "generate_outputs";

export type WeddingProjectionQueueAction = {
  kind: WeddingProjectionQueueActionKind;
  label: string;
  enabled: boolean;
  reason: string | null;
};

export type WeddingProjectionQueueGroup = {
  kind: WeddingProjectionQueueItemKind;
  label: string;
  items: WeddingProjectionQueueItem[];
  pendingCount: number;
  sentCount: number;
  blockedCount: number;
};

export type WeddingProjectionVendorOutreachDraftCard = {
  id: string;
  vendorLabel: string;
  categoryLabel: string | null;
  subjectLabel: string;
  bodyPreview: string;
  checklistLabels: string[];
  saveLabel: string;
  externalSendGuardLabel: string;
  approvalRequired: boolean;
  providerReceiptRequired: boolean;
};

export type WeddingProjectionVendorDecisionPolicyCard = {
  id: string;
  selectedVendorLabel: string;
  consequenceLabels: string[];
  approvalRequired: boolean;
  noExternalSendWithoutApproval: boolean;
};

export type WeddingProjectionQueueViewState = {
  queue: WeddingProjectionQueueState;
  title: string;
  subtitle: string;
  description: string;
  statusTone: "ready" | "review" | "saved" | "empty";
  primaryAction: WeddingProjectionQueueAction;
  secondaryActions: WeddingProjectionQueueAction[];
  groups: WeddingProjectionQueueGroup[];
  vendorOutreachDraftCards: WeddingProjectionVendorOutreachDraftCard[];
  vendorDecisionPolicyCards: WeddingProjectionVendorDecisionPolicyCard[];
  semanticObjects: WeddingSemanticUiObject[];
  semanticSurface: WeddingSemanticSurfaceState;
  dispatchPayload: {
    sendInputs: SendAfpMessageInput[];
    count: number;
  } | null;
};

const GROUP_LABELS: Record<WeddingProjectionQueueItemKind, string> = {
  context: "Context",
  intake_profile: "Profile",
  decision: "Decisions",
  access_control: "Access",
  boundary: "Guest boundaries",
  artifact: "Files",
  calendar_event: "Calendar",
  task: "Tasks",
};

function groupItems(items: readonly WeddingProjectionQueueItem[]): WeddingProjectionQueueGroup[] {
  return (Object.keys(GROUP_LABELS) as WeddingProjectionQueueItemKind[])
    .map((kind) => {
      const groupItems = items.filter((item) => item.kind === kind);
      return {
        kind,
        label: GROUP_LABELS[kind],
        items: groupItems,
        pendingCount: groupItems.filter((item) => item.status === "pending").length,
        sentCount: groupItems.filter((item) => item.status === "sent").length,
        blockedCount: groupItems.filter((item) => item.status === "blocked").length,
      };
    })
    .filter((group) => group.items.length > 0);
}

function primaryAction(
  queue: WeddingProjectionQueueState,
  context: {
    vendorDraftCount: number;
    vendorDecisionPolicyCount: number;
  } = { vendorDraftCount: 0, vendorDecisionPolicyCount: 0 },
): WeddingProjectionQueueAction {
  if (queue.pendingItems.length > 0) {
    if (context.vendorDraftCount > 0 && context.vendorDraftCount === queue.pendingItems.length) {
      return {
        kind: "save_pending_outputs",
        label: `Save ${context.vendorDraftCount} vendor draft${context.vendorDraftCount === 1 ? "" : "s"}`,
        enabled: true,
        reason: "Saves internal vendor draft tasks only; no external outreach is sent from this action.",
      };
    }
    if (context.vendorDecisionPolicyCount > 0 && context.vendorDecisionPolicyCount === queue.pendingItems.length) {
      return {
        kind: "save_pending_outputs",
        label: `Save ${context.vendorDecisionPolicyCount} vendor decision${context.vendorDecisionPolicyCount === 1 ? "" : "s"}`,
        enabled: true,
        reason: "Saves selected vendor decisions and removes unselected vendors from active queues.",
      };
    }
    return {
      kind: "save_pending_outputs",
      label: queue.nextActionLabel,
      enabled: true,
      reason: "Saves ready wedding files, dates, and tasks.",
    };
  }
  if (queue.blockedItems.length > 0) {
    return {
      kind: "review_blocked_outputs",
      label: "Review items needing attention",
      enabled: true,
      reason: "Some wedding items need a clear date, title, or review decision first.",
    };
  }
  if (queue.sentItems.length > 0) {
    return {
      kind: "open_saved_outputs",
      label: "Open saved items",
      enabled: true,
      reason: "Planning items were already saved.",
    };
  }
  return {
    kind: "generate_outputs",
    label: "Create planning items",
    enabled: false,
    reason: "No wedding files, dates, or tasks are available to save yet.",
  };
}

function secondaryActions(queue: WeddingProjectionQueueState): WeddingProjectionQueueAction[] {
  return [
    {
      kind: "review_blocked_outputs",
      label: `Review ${queue.blockedItems.length} blocked`,
      enabled: queue.blockedItems.length > 0,
      reason: queue.blockedItems.length > 0 ? null : "No wedding items need attention.",
    },
    {
      kind: "open_saved_outputs",
      label: `Open ${queue.sentItems.length} saved`,
      enabled: queue.sentItems.length > 0,
      reason: queue.sentItems.length > 0 ? null : "No saved planning items yet.",
    },
  ];
}

function statusTone(queue: WeddingProjectionQueueState): WeddingProjectionQueueViewState["statusTone"] {
  if (queue.pendingItems.length > 0) return "ready";
  if (queue.blockedItems.length > 0) return "review";
  if (queue.sentItems.length > 0) return "saved";
  return "empty";
}

function semanticObjects(items: readonly WeddingProjectionQueueItem[]): WeddingSemanticUiObject[] {
  return items.flatMap((item) => item.semanticObject ? [item.semanticObject] : []);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function bodyPreview(value: unknown): string {
  const text = clean(value).replace(/\s+/g, " ");
  if (text.length <= 180) return text;
  return `${text.slice(0, 177).trimEnd()}...`;
}

function vendorOutreachDraftCards(
  items: readonly WeddingProjectionQueueItem[],
): WeddingProjectionVendorOutreachDraftCard[] {
  return items.flatMap((item): WeddingProjectionVendorOutreachDraftCard[] => {
    const metadata = record(item.sendInput?.metadata);
    if (metadata.vendor_outreach_from_selected_decision !== true) return [];
    const subjectLabel = clean(metadata.vendor_outreach_draft_subject);
    const body = bodyPreview(metadata.vendor_outreach_draft_body);
    if (!subjectLabel || !body) return [];
    return [{
      id: item.id,
      vendorLabel: clean(metadata.vendor_outreach_vendor_label) || item.title,
      categoryLabel: clean(metadata.vendor_outreach_category_label) || null,
      subjectLabel,
      bodyPreview: body,
      checklistLabels: stringArray(metadata.vendor_outreach_request_checklist).slice(0, 12),
      saveLabel: "Saves an internal draft task",
      externalSendGuardLabel: "No external send from this action",
      approvalRequired: metadata.vendor_outreach_draft_requires_approval === true
        || metadata.approval_required_before_outreach === true,
      providerReceiptRequired: metadata.vendor_outreach_provider_receipt_required === true
        || metadata.provider_receipt_required === true,
    }];
  }).slice(0, 4);
}

function vendorDecisionPolicyCards(
  items: readonly WeddingProjectionQueueItem[],
): WeddingProjectionVendorDecisionPolicyCard[] {
  return items.flatMap((item): WeddingProjectionVendorDecisionPolicyCard[] => {
    if (item.kind !== "decision") return [];
    const metadata = record(item.sendInput?.metadata);
    const policy = record(metadata.vendor_comparison_queue_policy);
    if (policy.unselected_vendors_audit_only !== true) return [];
    const consequenceLabels = [
      policy.selected_vendors_continue_to_follow_up === true ? "Selected vendor stays active" : null,
      policy.unselected_vendors_leave_active_queues === true ? "Unselected vendors leave active queues" : null,
      policy.no_queue_rehydration_for_unselected === true ? "No queue rehydration for unselected vendors" : null,
    ].filter((label): label is string => Boolean(label));
    return [{
      id: item.id,
      selectedVendorLabel: clean(metadata.selected_option_label) || item.title.replace(/^Decision:\s*/i, ""),
      consequenceLabels,
      approvalRequired: policy.approval_required_before_outreach === true,
      noExternalSendWithoutApproval: policy.no_external_send_without_approval === true,
    }];
  }).slice(0, 4);
}

function surfaceCopy(input: {
  queue: WeddingProjectionQueueState;
  vendorDraftCount: number;
  vendorDecisionPolicyCount: number;
}): Pick<WeddingProjectionQueueViewState, "title" | "subtitle" | "description"> {
  if (input.vendorDraftCount > 0) {
    return {
      title: "Save vendor draft tasks",
      subtitle: input.queue.summaryLabel,
      description: "Keep the editable vendor outreach drafts in this wedding plan. This does not send email or contact vendors.",
    };
  }
  if (input.vendorDecisionPolicyCount > 0) {
    return {
      title: "Save selected vendor decisions",
      subtitle: input.queue.summaryLabel,
      description: "Keep selected vendors active for follow-up and move unselected vendors out of the live decision queue.",
    };
  }
  return {
    title: "Save planning outputs",
    subtitle: input.queue.summaryLabel,
    description: "Save the files, dates, tasks, and notes OmnyID just prepared so they stay in this wedding plan.",
  };
}

export function buildWeddingProjectionQueueViewState(input: {
  contextItems?: readonly WeddingNeedToKnowProjectionContext[] | null;
  decisionItems?: readonly WeddingDecisionProjectionInput[] | null;
  artifacts?: readonly WeddingGeneratedArtifact[] | null;
  scheduleItems?: readonly WeddingPlanningScheduleItem[] | null;
  taskItems?: readonly WeddingPlanningTaskItem[] | null;
  collaborationInvites?: readonly WeddingCollaboratorInviteCard[] | null;
  collaborationMetadata?: unknown;
  boundaryObjects?: readonly WeddingBoundaryLedgerObject[] | null;
  boundaryMetadata?: unknown;
  nowIso?: string | null;
  storage?: Storage | null;
}): WeddingProjectionQueueViewState {
  const queue = buildWeddingProjectionQueueState(input);
  const pendingCount = queue.pendingItems.length;
  const vendorDraftCards = vendorOutreachDraftCards(queue.pendingItems);
  const vendorPolicyCards = vendorDecisionPolicyCards(queue.pendingItems);
  const copy = surfaceCopy({
    queue,
    vendorDraftCount: vendorDraftCards.length,
    vendorDecisionPolicyCount: vendorPolicyCards.length,
  });

  const objects = semanticObjects(queue.items);
  return {
    queue,
    title: copy.title,
    subtitle: copy.subtitle,
    description: copy.description,
    statusTone: statusTone(queue),
    primaryAction: primaryAction(queue, {
      vendorDraftCount: vendorDraftCards.length,
      vendorDecisionPolicyCount: vendorPolicyCards.length,
    }),
    secondaryActions: secondaryActions(queue),
    groups: groupItems(queue.items),
    vendorOutreachDraftCards: vendorDraftCards,
    vendorDecisionPolicyCards: vendorPolicyCards,
    semanticObjects: objects,
    semanticSurface: buildWeddingSemanticSurfaceState({
      semanticObjects: objects,
      rendererFormatHint: "projection_queue",
    }),
    dispatchPayload: queue.canDispatch
      ? {
        sendInputs: queue.pendingSendInputs,
        count: pendingCount,
      }
      : null,
  };
}
