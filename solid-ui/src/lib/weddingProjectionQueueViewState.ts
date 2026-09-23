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

export type WeddingProjectionQueueViewState = {
  queue: WeddingProjectionQueueState;
  title: string;
  subtitle: string;
  statusTone: "ready" | "review" | "saved" | "empty";
  primaryAction: WeddingProjectionQueueAction;
  secondaryActions: WeddingProjectionQueueAction[];
  groups: WeddingProjectionQueueGroup[];
  dispatchPayload: {
    sendInputs: SendAfpMessageInput[];
    count: number;
  } | null;
};

const GROUP_LABELS: Record<WeddingProjectionQueueItemKind, string> = {
  context: "Context",
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

function primaryAction(queue: WeddingProjectionQueueState): WeddingProjectionQueueAction {
  if (queue.pendingItems.length > 0) {
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

  return {
    queue,
    title: "Approve planning outputs",
    subtitle: queue.summaryLabel,
    statusTone: statusTone(queue),
    primaryAction: primaryAction(queue),
    secondaryActions: secondaryActions(queue),
    groups: groupItems(queue.items),
    dispatchPayload: queue.canDispatch
      ? {
        sendInputs: queue.pendingSendInputs,
        count: pendingCount,
      }
      : null,
  };
}
