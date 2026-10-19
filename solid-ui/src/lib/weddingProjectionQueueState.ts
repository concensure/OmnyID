// @locs-version: 2.0
import {
  buildContinuityProjectionQueueSelectionState,
  buildContinuityProjectionQueueState,
  type ContinuityProjectionQueueItem,
  type ContinuityProjectionQueueState,
  type ContinuityProjectionQueueSelectionState,
} from "@/lib/continuityProjectionState";
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
  hasSentWeddingIntakeProfileAfpProjection,
  weddingIntakeProfileProjectionId,
  weddingIntakeProfileToAfpSendInput,
} from "@/lib/weddingIntakeProfileAfpProjectionState";
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
import type {
  WeddingSemanticUiKind,
  WeddingSemanticUiObject,
} from "@/lib/weddingSemanticUiState";
import type { WeddingPreferenceConflictState } from "@/lib/weddingPreferenceConflictState";
import {
  hasSentWeddingPreferenceConflictAfpProjection,
  weddingPreferenceConflictProjectionId,
  weddingPreferenceConflictToAfpSendInput,
} from "@/lib/weddingPreferenceConflictAfpProjectionState";
import {
  isWeddingSemanticUiKind,
  weddingSemanticUiObjectsFromAfpLikeMessage,
} from "@/lib/weddingSemanticUiState";

export const WEDDING_BOUNDARY_AFP_PROJECTIONS_KEY = "omnyid.wedding.boundary_afp_projections.v1";

export type WeddingProjectionQueueItemKind = "context" | "intake_profile" | "artifact" | "calendar_event" | "task" | "decision" | "preference_conflict" | "access_control" | "boundary";
export type WeddingProjectionQueueItemStatus = ContinuityProjectionQueueItem<WeddingProjectionQueueItemKind>["status"];
export type WeddingProjectionQueueItem = ContinuityProjectionQueueItem<WeddingProjectionQueueItemKind> & {
  semanticKind: WeddingSemanticUiKind | null;
  semanticTags: string[];
  semanticObject: WeddingSemanticUiObject | null;
};
export type WeddingProjectionQueueState = Omit<
  ContinuityProjectionQueueState<WeddingProjectionQueueItemKind>,
  "items" | "pendingItems" | "sentItems" | "blockedItems"
> & {
  items: WeddingProjectionQueueItem[];
  pendingItems: WeddingProjectionQueueItem[];
  sentItems: WeddingProjectionQueueItem[];
  blockedItems: WeddingProjectionQueueItem[];
};
export type WeddingProjectionQueueSelectionState = Omit<
  ContinuityProjectionQueueSelectionState<WeddingProjectionQueueItemKind>,
  "queue" | "selectedPendingItems"
> & {
  queue: WeddingProjectionQueueState;
  selectedPendingItems: WeddingProjectionQueueItem[];
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function semanticQueueFields(
  sendInput: WeddingProjectionQueueItem["sendInput"],
  sourceLike?: unknown,
): Pick<WeddingProjectionQueueItem, "semanticKind" | "semanticObject" | "semanticTags"> {
  if (!sendInput && !sourceLike) {
    return {
      semanticKind: null,
      semanticObject: null,
      semanticTags: [],
    };
  }
  const metadata = record(sendInput?.metadata);
  const [object = null] = [
    ...weddingSemanticUiObjectsFromAfpLikeMessage(sendInput),
    ...weddingSemanticUiObjectsFromAfpLikeMessage(sourceLike),
  ];
  const semanticKind = object?.kind ?? (isWeddingSemanticUiKind(metadata.semantic_kind) ? metadata.semantic_kind : null);
  return {
    semanticKind,
    semanticObject: object,
    semanticTags: Array.from(new Set([
      ...stringArray(metadata.semantic_tags),
      ...stringArray(object?.semanticTags),
      semanticKind,
    ].filter((tag): tag is string => Boolean(tag)))),
  };
}

function queueItem(
  item: ContinuityProjectionQueueItem<WeddingProjectionQueueItemKind>,
  sourceLike?: unknown,
): WeddingProjectionQueueItem {
  return {
    ...item,
    ...semanticQueueFields(item.sendInput, sourceLike),
  };
}

function artifactItem(
  artifact: WeddingGeneratedArtifact,
  nowIso: string,
  storage: Storage,
): WeddingProjectionQueueItem {
  const sent = hasSentWeddingArtifactAfpProjection(artifact.summary.id, storage);
  return queueItem({
    id: `artifact:${artifact.summary.id}`,
    sourceId: artifact.summary.id,
    kind: "artifact",
    title: artifact.summary.title,
    status: sent ? "sent" : "pending",
    statusLabel: sent ? "Already saved to Files" : "Ready to save to Files",
    blockedReason: null,
    sendInput: sent ? null : weddingGeneratedArtifactToAfpSendInput(artifact, nowIso),
  });
}

function contextItem(
  context: WeddingNeedToKnowProjectionContext,
  nowIso: string,
  storage: Storage,
): WeddingProjectionQueueItem {
  const sourceId = context.metadata.responseWorkspaceId;
  const sent = context.projectionSaved === true || hasSentWeddingNeedToKnowAfpProjection(sourceId, storage);
  return queueItem({
    id: `context:${sourceId}`,
    sourceId,
    kind: "context",
    title: "Key wedding details",
    status: sent ? "sent" : "pending",
    statusLabel: sent ? "Already saved as context" : "Ready to save as context",
    blockedReason: null,
    sendInput: sent ? null : weddingNeedToKnowContextToAfpSendInput(context, nowIso),
  });
}

function hasIntakeProfilePlanningValue(context: WeddingNeedToKnowProjectionContext): boolean {
  const planning = record(context.planningContext);
  return [
    planning.dateOrSeason,
    planning.date_or_season,
    planning.location,
    planning.guestCount,
    planning.guest_count,
    planning.budgetComfort,
    planning.budget_comfort,
    planning.atmosphereDescription,
    planning.atmosphere_description,
    planning.noimDownloaded,
    planning.noim_downloaded,
    planning.celebrantPath,
    planning.celebrant_path,
    planning.vowPreference,
    planning.vow_preference,
  ].some((value) => typeof value === "number" || typeof value === "boolean" || Boolean(clean(value)))
    || stringArray(planning.topPriorities ?? planning.top_priorities).length > 0
    || stringArray(planning.inspirationImageUrls ?? planning.inspiration_image_urls).length > 0
    || stringArray(context.answeredLabels).length > 0;
}

function intakeProfileItem(
  context: WeddingNeedToKnowProjectionContext,
  nowIso: string,
  storage: Storage,
): WeddingProjectionQueueItem {
  const sourceId = weddingIntakeProfileProjectionId(context);
  const sent = hasSentWeddingIntakeProfileAfpProjection(sourceId, storage);
  return queueItem({
    id: `intake_profile:${sourceId}`,
    sourceId,
    kind: "intake_profile",
    title: "Wedding intake profile",
    status: sent ? "sent" : "pending",
    statusLabel: sent ? "Already saved as structured profile" : "Ready to save as structured profile",
    blockedReason: null,
    sendInput: sent ? null : weddingIntakeProfileToAfpSendInput(context, nowIso),
  });
}

function decisionItem(
  decision: WeddingDecisionProjectionInput,
  nowIso: string,
  storage: Storage,
): WeddingProjectionQueueItem {
  const sent = hasSentWeddingDecisionAfpProjection(decision.id, storage);
  return queueItem({
    id: `decision:${decision.id}`,
    sourceId: decision.id,
    kind: "decision",
    title: `Decision: ${decision.selectedOption.label}`,
    status: sent ? "sent" : "pending",
    statusLabel: sent ? "Already saved to Decisions" : "Ready to save to Decisions",
    blockedReason: null,
    sendInput: sent ? null : weddingDecisionProjectionToAfpSendInput(decision, nowIso),
  });
}

function preferenceConflictItem(
  state: WeddingPreferenceConflictState,
  nowIso: string,
  storage: Storage,
): WeddingProjectionQueueItem {
  const sourceId = weddingPreferenceConflictProjectionId(state);
  const sent = hasSentWeddingPreferenceConflictAfpProjection(sourceId, storage);
  return queueItem({
    id: `preference_conflict:${sourceId}`,
    sourceId,
    kind: "preference_conflict",
    title: state.conflictObject?.title ?? "Partner preferences",
    status: sent ? "sent" : "pending",
    statusLabel: sent ? "Already saved to Decisions" : "Ready to save for couple review",
    blockedReason: null,
    sendInput: sent ? null : weddingPreferenceConflictToAfpSendInput(state, nowIso),
  }, state);
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
  return queueItem({
    id: `calendar_event:${item.id}`,
    sourceId: item.id,
    kind: "calendar_event",
    title: clean(item.title) ?? "Untitled wedding date",
    status: sent ? "sent" : sendInput ? "pending" : "blocked",
    statusLabel: sent ? "Already saved to Calendar" : sendInput ? "Ready to save to Calendar" : "Not ready for Calendar",
    blockedReason: sent ? null : blockedReason,
    sendInput,
  }, item);
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
  return queueItem({
    id: `task:${item.id}`,
    sourceId: item.id,
    kind: "task",
    title: clean(item.title) ?? "Untitled wedding task",
    status: sent ? "sent" : sendInput ? "pending" : "blocked",
    statusLabel: sent ? "Already saved to Tasks" : sendInput ? "Ready to save to Tasks" : "Not ready for Tasks",
    blockedReason: sent ? null : blockedReason,
    sendInput,
  }, item);
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
  return queueItem({
    id: `access_control:${sourceId}`,
    sourceId,
    kind: "access_control",
    title: `${sentenceCase(actionLabel)} ${invite.displayName} access`,
    status: sent ? "sent" : sendInput ? "pending" : "blocked",
    statusLabel: sent ? "Already saved to access records" : sendInput ? `Ready to save ${actionLabel} record` : "Access record needs review",
    blockedReason: sent ? null : invite.missingLabels.join(", ") || "No access lifecycle action needed",
    sendInput,
  });
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
  return queueItem({
    id: `boundary:${sourceId}`,
    sourceId,
    kind: "boundary",
    title: object.title,
    status: sent ? "sent" : "pending",
    statusLabel: sent ? "Already saved to guest boundaries" : "Ready to save to guest boundaries",
    blockedReason: null,
    sendInput: sent ? null : weddingBoundaryLedgerObjectToAfpSendInput(object, metadata, nowIso),
  });
}

export function buildWeddingProjectionQueueState(input: {
  contextItems?: readonly WeddingNeedToKnowProjectionContext[] | null;
  decisionItems?: readonly WeddingDecisionProjectionInput[] | null;
  preferenceConflicts?: readonly WeddingPreferenceConflictState[] | null;
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
    ...(input.contextItems ?? []).flatMap((context) => [
      contextItem(context, nowIso, storage),
      ...(hasIntakeProfilePlanningValue(context) ? [intakeProfileItem(context, nowIso, storage)] : []),
    ]),
    ...(input.decisionItems ?? []).map((decision) => decisionItem(decision, nowIso, storage)),
    ...(input.preferenceConflicts ?? []).map((state) => preferenceConflictItem(state, nowIso, storage)),
    ...(input.artifacts ?? []).map((artifact) => artifactItem(artifact, nowIso, storage)),
    ...(input.scheduleItems ?? []).map((item) => calendarItem(item, nowIso, storage)),
    ...(input.taskItems ?? []).map((item) => taskItem(item, nowIso, storage)),
    ...(input.collaborationInvites ?? []).map((invite) => collaborationItem(invite, input.collaborationMetadata, nowIso, storage)),
    ...(input.boundaryObjects ?? []).map((object) => boundaryItem(object, input.boundaryMetadata ?? input.collaborationMetadata, nowIso, storage)),
  ];
  return buildContinuityProjectionQueueState({
    items,
    copy: {
      emptyLabel: "No wedding items to save",
      itemNoun: "planning item",
      nextActionSavedLabel: "Planning items saved",
      nextActionEmptyLabel: "Create planning items",
    },
  }) as WeddingProjectionQueueState;
}

export function buildWeddingProjectionQueueSelectionState(input: {
  queue: WeddingProjectionQueueState;
  deselectedItemIds?: Readonly<Record<string, boolean>> | null;
}): WeddingProjectionQueueSelectionState {
  return buildContinuityProjectionQueueSelectionState({
    queue: input.queue,
    deselectedItemIds: input.deselectedItemIds,
  }) as WeddingProjectionQueueSelectionState;
}
