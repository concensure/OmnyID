// @locs-version: 2.0
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import {
  hasSentWeddingArtifactAfpProjection,
  weddingGeneratedArtifactToAfpSendInput,
} from "@/lib/weddingArtifactAfpProjectionState";
import {
  hasSentWeddingNeedToKnowAfpProjection,
  weddingNeedToKnowContextToAfpSendInput,
  type WeddingNeedToKnowProjectionContext,
} from "@/lib/weddingNeedToKnowAfpProjectionState";
import {
  hasSentWeddingDecisionAfpProjection,
  weddingDecisionProjectionToAfpSendInput,
  type WeddingDecisionProjectionInput,
} from "@/lib/weddingDecisionAfpProjectionState";
import {
  WEDDING_CALENDAR_AFP_PROJECTIONS_KEY,
  WEDDING_TASK_AFP_PROJECTIONS_KEY,
  hasSentWeddingProjection,
  shouldProjectWeddingScheduleItemToAfpCalendarEvent,
  shouldProjectWeddingTaskItemToAfpTaskMessage,
  weddingScheduleItemToAfpSendInput,
  weddingTaskItemToAfpSendInput,
  type WeddingPlanningScheduleItem,
  type WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import type { WeddingCollaboratorInviteCard } from "@/lib/weddingCollaborationState";
import {
  hasSentWeddingCollaborationAfpProjection,
  weddingCollaborationAccessActionForInvite,
  weddingCollaborationAccessProjectionId,
  weddingCollaborationAccessToAfpSendInput,
} from "@/lib/weddingCollaborationAfpProjectionState";
import {
  weddingBoundaryLedgerObjectToAfpSendInput,
  type WeddingBoundaryLedgerObject,
} from "@/lib/weddingBoundaryLedgerState";

export const WEDDING_BOUNDARY_AFP_PROJECTIONS_KEY = "omnyid.wedding.boundary_afp_projections.v1";

export type WeddingProjectionQueueItemKind = "context" | "artifact" | "calendar_event" | "task" | "decision" | "access_control" | "boundary";
export type WeddingProjectionQueueItemStatus = "pending" | "sent" | "blocked";

export type WeddingProjectionQueueItem = {
  id: string;
  sourceId: string;
  kind: WeddingProjectionQueueItemKind;
  title: string;
  status: WeddingProjectionQueueItemStatus;
  statusLabel: string;
  blockedReason: string | null;
  sendInput: SendAfpMessageInput | null;
};

export type WeddingProjectionQueueState = {
  items: WeddingProjectionQueueItem[];
  pendingItems: WeddingProjectionQueueItem[];
  sentItems: WeddingProjectionQueueItem[];
  blockedItems: WeddingProjectionQueueItem[];
  pendingSendInputs: SendAfpMessageInput[];
  summaryLabel: string;
  nextActionLabel: string;
  canDispatch: boolean;
};

export type WeddingProjectionQueueSelectionState = {
  queue: WeddingProjectionQueueState;
  selectedPendingItems: WeddingProjectionQueueItem[];
  selectedPendingCount: number;
  totalPendingCount: number;
  selectionSummaryLabel: string | null;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sentenceCase(value: string): string {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

function emptyProjectionStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  };
}

function projectionStorage(storage?: Storage | null): Storage {
  if (storage) return storage;
  return typeof localStorage === "undefined" ? emptyProjectionStorage() : localStorage;
}

function artifactItem(
  artifact: WeddingGeneratedArtifact,
  nowIso: string,
  storage: Storage,
): WeddingProjectionQueueItem {
  const sent = hasSentWeddingArtifactAfpProjection(artifact.summary.id, storage);
  return {
    id: `artifact:${artifact.summary.id}`,
    sourceId: artifact.summary.id,
    kind: "artifact",
    title: artifact.summary.title,
    status: sent ? "sent" : "pending",
    statusLabel: sent ? "Already saved to Files" : "Ready to save to Files",
    blockedReason: null,
    sendInput: sent ? null : weddingGeneratedArtifactToAfpSendInput(artifact, nowIso),
  };
}

function contextItem(
  context: WeddingNeedToKnowProjectionContext,
  nowIso: string,
  storage: Storage,
): WeddingProjectionQueueItem {
  const sourceId = context.metadata.responseWorkspaceId;
  const sent = context.projectionSaved === true || hasSentWeddingNeedToKnowAfpProjection(sourceId, storage);
  return {
    id: `context:${sourceId}`,
    sourceId,
    kind: "context",
    title: "Key wedding details",
    status: sent ? "sent" : "pending",
    statusLabel: sent ? "Already saved as context" : "Ready to save as context",
    blockedReason: null,
    sendInput: sent ? null : weddingNeedToKnowContextToAfpSendInput(context, nowIso),
  };
}

function decisionItem(
  decision: WeddingDecisionProjectionInput,
  nowIso: string,
  storage: Storage,
): WeddingProjectionQueueItem {
  const sent = hasSentWeddingDecisionAfpProjection(decision.id, storage);
  return {
    id: `decision:${decision.id}`,
    sourceId: decision.id,
    kind: "decision",
    title: `Decision: ${decision.selectedOption.label}`,
    status: sent ? "sent" : "pending",
    statusLabel: sent ? "Already saved to Decisions" : "Ready to save to Decisions",
    blockedReason: null,
    sendInput: sent ? null : weddingDecisionProjectionToAfpSendInput(decision, nowIso),
  };
}

function calendarItem(
  item: WeddingPlanningScheduleItem,
  nowIso: string,
  storage: Storage,
): WeddingProjectionQueueItem {
  const sent = hasSentWeddingProjection(item.id, WEDDING_CALENDAR_AFP_PROJECTIONS_KEY, storage);
  const sendInput = sent ? null : weddingScheduleItemToAfpSendInput(item, nowIso);
  const blockedReason = shouldProjectWeddingScheduleItemToAfpCalendarEvent(item)
    ? null
    : item.reviewStatus === "ignored"
      ? "Ignored calendar item"
      : item.reviewStatus === "needs_review"
        ? "Needs date review before saving to Calendar"
        : item.approvalState === "archived"
          ? "Archived calendar item"
          : "Needs a clear start date before saving to Calendar";
  return {
    id: `calendar_event:${item.id}`,
    sourceId: item.id,
    kind: "calendar_event",
    title: clean(item.title) ?? "Untitled wedding date",
    status: sent ? "sent" : sendInput ? "pending" : "blocked",
    statusLabel: sent ? "Already saved to Calendar" : sendInput ? "Ready to save to Calendar" : "Not ready for Calendar",
    blockedReason: sent ? null : blockedReason,
    sendInput,
  };
}

function taskItem(item: WeddingPlanningTaskItem, nowIso: string, storage: Storage): WeddingProjectionQueueItem {
  const sent = hasSentWeddingProjection(item.id, WEDDING_TASK_AFP_PROJECTIONS_KEY, storage);
  const sendInput = sent ? null : weddingTaskItemToAfpSendInput(item, nowIso);
  const blockedReason = shouldProjectWeddingTaskItemToAfpTaskMessage(item)
    ? null
    : item.reviewStatus === "ignored"
      ? "Ignored task"
      : item.approvalState === "archived"
        ? "Archived task"
        : "Needs a task title before saving";
  return {
    id: `task:${item.id}`,
    sourceId: item.id,
    kind: "task",
    title: clean(item.title) ?? "Untitled wedding task",
    status: sent ? "sent" : sendInput ? "pending" : "blocked",
    statusLabel: sent ? "Already saved to Tasks" : sendInput ? "Ready to save to Tasks" : "Not ready for Tasks",
    blockedReason: sent ? null : blockedReason,
    sendInput,
  };
}

function collaborationItem(
  invite: WeddingCollaboratorInviteCard,
  metadata: unknown,
  nowIso: string,
  storage: Storage,
): WeddingProjectionQueueItem {
  const action = weddingCollaborationAccessActionForInvite(invite);
  const sourceId = weddingCollaborationAccessProjectionId(metadata, invite, action ?? "invite");
  const sent = hasSentWeddingCollaborationAfpProjection(sourceId, storage);
  const sendInput = sent || !action ? null : weddingCollaborationAccessToAfpSendInput({ metadata, invite, action, createdAt: nowIso });
  const actionLabel = action === "revoke" ? "revocation" : action === "expire" ? "expiry" : action === "review" ? "review" : "invite";
  return {
    id: `access_control:${sourceId}`,
    sourceId,
    kind: "access_control",
    title: `${sentenceCase(actionLabel)} ${invite.displayName} access`,
    status: sent ? "sent" : sendInput ? "pending" : "blocked",
    statusLabel: sent ? "Already saved to access records" : sendInput ? `Ready to save ${actionLabel} record` : "Access record needs review",
    blockedReason: sent ? null : invite.missingLabels.join(", ") || "No access lifecycle action needed",
    sendInput,
  };
}

function boundaryObjectId(object: WeddingBoundaryLedgerObject): string {
  if (object.kind === "wedding_boundary_household") return object.householdId;
  if (object.kind === "wedding_boundary_guest_profile") return object.personId;
  if (object.kind === "wedding_boundary_event_invitation") return object.invitationId;
  if (object.kind === "wedding_boundary_change_request") return object.requestId;
  if (object.kind === "wedding_boundary_decision_rationale") return object.decisionId;
  if (object.kind === "wedding_boundary_decline_template") return object.templateId;
  if (object.kind === "wedding_boundary_visibility_page") return object.pageId;
  return object.id;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isPersistedBoundaryObject(object: WeddingBoundaryLedgerObject): boolean {
  const metadata = record(object.metadata);
  return metadata.persisted_boundary_ledger === true || Boolean(clean(metadata.persisted_afp_message_id));
}

function boundaryItem(
  object: WeddingBoundaryLedgerObject,
  metadata: unknown,
  nowIso: string,
  storage: Storage,
): WeddingProjectionQueueItem {
  const sourceId = boundaryObjectId(object);
  const sent = isPersistedBoundaryObject(object) || hasSentWeddingProjection(sourceId, WEDDING_BOUNDARY_AFP_PROJECTIONS_KEY, storage);
  return {
    id: `boundary:${sourceId}`,
    sourceId,
    kind: "boundary",
    title: object.title,
    status: sent ? "sent" : "pending",
    statusLabel: sent ? "Already saved to guest boundaries" : "Ready to save to guest boundaries",
    blockedReason: null,
    sendInput: sent ? null : weddingBoundaryLedgerObjectToAfpSendInput(object, metadata, nowIso),
  };
}

function summaryLabel(pendingCount: number, sentCount: number, blockedCount: number): string {
  if (pendingCount === 0 && sentCount === 0 && blockedCount === 0) return "No wedding items to save";
  const parts = [
    pendingCount > 0 ? `${pendingCount} ready` : null,
    sentCount > 0 ? `${sentCount} already saved` : null,
    blockedCount > 0 ? `${blockedCount} need review` : null,
  ].filter(Boolean);
  return parts.join(", ");
}

export function buildWeddingProjectionQueueState(input: {
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
}): WeddingProjectionQueueState {
  const nowIso = clean(input.nowIso) ?? new Date().toISOString();
  const storage = projectionStorage(input.storage);
  const items = [
    ...(input.contextItems ?? []).map((context) => contextItem(context, nowIso, storage)),
    ...(input.decisionItems ?? []).map((decision) => decisionItem(decision, nowIso, storage)),
    ...(input.artifacts ?? []).map((artifact) => artifactItem(artifact, nowIso, storage)),
    ...(input.scheduleItems ?? []).map((item) => calendarItem(item, nowIso, storage)),
    ...(input.taskItems ?? []).map((item) => taskItem(item, nowIso, storage)),
    ...(input.collaborationInvites ?? []).map((invite) => collaborationItem(invite, input.collaborationMetadata, nowIso, storage)),
    ...(input.boundaryObjects ?? []).map((object) => boundaryItem(object, input.boundaryMetadata ?? input.collaborationMetadata, nowIso, storage)),
  ];
  const pendingItems = items.filter((item) => item.status === "pending");
  const sentItems = items.filter((item) => item.status === "sent");
  const blockedItems = items.filter((item) => item.status === "blocked");
  const pendingSendInputs = pendingItems.flatMap((item) => item.sendInput ? [item.sendInput] : []);

  return {
    items,
    pendingItems,
    sentItems,
    blockedItems,
    pendingSendInputs,
    summaryLabel: summaryLabel(pendingItems.length, sentItems.length, blockedItems.length),
    nextActionLabel: pendingItems.length > 0
      ? `Save ${pendingItems.length} planning item${pendingItems.length === 1 ? "" : "s"}`
      : blockedItems.length > 0
        ? "Review items that need attention"
        : sentItems.length > 0 ? "Planning items saved" : "Create planning items",
    canDispatch: pendingSendInputs.length > 0,
  };
}

export function buildWeddingProjectionQueueSelectionState(input: {
  queue: WeddingProjectionQueueState;
  deselectedItemIds?: Readonly<Record<string, boolean>> | null;
}): WeddingProjectionQueueSelectionState {
  const deselectedItemIds = input.deselectedItemIds ?? {};
  const selectedPendingItems = input.queue.pendingItems.filter((item) => !deselectedItemIds[item.id]);
  const selectedIds = new Set(selectedPendingItems.map((item) => item.id));
  const items = input.queue.items.filter((item) => item.status !== "pending" || selectedIds.has(item.id));
  const pendingItems = items.filter((item) => item.status === "pending");
  const sentItems = items.filter((item) => item.status === "sent");
  const blockedItems = items.filter((item) => item.status === "blocked");
  const pendingSendInputs = pendingItems.flatMap((item) => item.sendInput ? [item.sendInput] : []);

  return {
    queue: {
      ...input.queue,
      items,
      pendingItems,
      sentItems,
      blockedItems,
      pendingSendInputs,
      canDispatch: pendingSendInputs.length > 0,
      summaryLabel: pendingItems.length > 0
        ? `${pendingItems.length} selected item${pendingItems.length === 1 ? "" : "s"} ready`
        : "No selected items to save",
      nextActionLabel: pendingItems.length > 0
        ? `Save ${pendingItems.length} selected item${pendingItems.length === 1 ? "" : "s"}`
        : "Select items to save",
    },
    selectedPendingItems,
    selectedPendingCount: selectedPendingItems.length,
    totalPendingCount: input.queue.pendingItems.length,
    selectionSummaryLabel: input.queue.pendingItems.length > 0
      ? `${selectedPendingItems.length}/${input.queue.pendingItems.length} ready items selected`
      : null,
  };
}
