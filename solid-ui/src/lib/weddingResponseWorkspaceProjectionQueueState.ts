// @locs-version: 2.0
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import type { WeddingCollaboratorInviteCard } from "@/lib/weddingCollaborationState";
import type { WeddingBoundaryLedgerObject } from "@/lib/weddingBoundaryLedgerState";
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import type { WeddingNeedToKnowProjectionContext } from "@/lib/weddingNeedToKnowAfpProjectionState";
import type { WeddingPreferenceConflictState } from "@/lib/weddingPreferenceConflictState";
import {
  buildWeddingProjectionQueueViewState,
  type WeddingProjectionQueueViewState,
} from "@/lib/weddingProjectionQueueViewState";

export type WeddingResponseWorkspaceProjectionQueueInput = {
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
};

export function buildWeddingResponseWorkspaceProjectionQueueState(
  input: WeddingResponseWorkspaceProjectionQueueInput,
): WeddingProjectionQueueViewState | null {
  const hasProjectionInputs = Boolean(
    input.contextItems?.length
    || input.decisionItems?.length
    || input.preferenceConflicts?.length
    || input.artifacts?.length
    || input.scheduleItems?.length
    || input.taskItems?.length
    || input.collaborationInvites?.length
    || input.boundaryObjects?.length,
  );
  if (!hasProjectionInputs) return null;
  return buildWeddingProjectionQueueViewState({
    contextItems: input.contextItems,
    decisionItems: input.decisionItems,
    preferenceConflicts: input.preferenceConflicts,
    artifacts: input.artifacts,
    scheduleItems: input.scheduleItems,
    taskItems: input.taskItems,
    collaborationInvites: input.collaborationInvites,
    collaborationMetadata: input.collaborationMetadata,
    boundaryObjects: input.boundaryObjects,
    boundaryMetadata: input.boundaryMetadata,
    nowIso: input.nowIso,
    storage: input.storage,
  });
}
