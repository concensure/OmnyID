import test from "node:test";
import assert from "node:assert/strict";
import { buildWeddingArtifactGenerationState } from "@/lib/weddingArtifactGenerationState";
import { markWeddingArtifactAfpProjectionSent } from "@/lib/weddingArtifactAfpProjectionState";
import {
  WEDDING_CALENDAR_AFP_PROJECTIONS_KEY,
  markWeddingProjectionSent,
  type WeddingPlanningScheduleItem,
} from "@/lib/weddingCalendarProjectionState";
import { buildWeddingProjectionQueueViewState } from "@/lib/weddingProjectionQueueViewState";
import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

const metadata = {
  weddingPlanId: "plan-view",
  responseWorkspaceId: "workspace-view",
  sourceResponseId: "response-view",
};

function artifactState() {
  return buildWeddingArtifactGenerationState({
    metadata,
    researchNotes: ["Compare reception layouts."],
  });
}

const scheduleItem: WeddingPlanningScheduleItem = {
  id: "rehearsal-1",
  title: "Rehearsal",
  kind: "rehearsal",
  startAt: "2026-10-02T08:00:00.000Z",
  metadata,
};

test("buildWeddingProjectionQueueViewState exposes save action and dispatch payload", () => {
  const state = buildWeddingProjectionQueueViewState({
    artifacts: artifactState().artifacts,
    scheduleItems: [scheduleItem],
    nowIso: "2026-09-12T00:00:00.000Z",
    storage: memoryStorage(),
  });

  assert.equal(state.statusTone, "ready");
  assert.equal(state.primaryAction.kind, "save_pending_outputs");
  assert.equal(state.primaryAction.enabled, true);
  assert.equal(state.dispatchPayload?.count, 2);
  assert.equal(state.dispatchPayload?.sendInputs.length, 2);
  assert.deepEqual(state.groups.map((group) => group.label), ["Files", "Calendar"]);
  assert.equal(state.groups[0]?.pendingCount, 1);
});

test("buildWeddingProjectionQueueViewState groups collaborator access records", () => {
  const state = buildWeddingProjectionQueueViewState({
    collaborationMetadata: metadata,
    collaborationInvites: [{
      id: "invite:planner",
      email: "planner@example.com",
      displayName: "Planner",
      role: "planner",
      roleLabel: "Wedding planner",
      status: "draft",
      statusLabel: "Draft",
      metadataLabels: ["Wedding planner", "Draft"],
      missingLabels: [],
      readyForInvite: true,
    }],
    storage: memoryStorage(),
  });

  assert.equal(state.groups[0]?.kind, "access_control");
  assert.equal(state.groups[0]?.label, "Access");
  assert.equal(state.dispatchPayload?.sendInputs[0]?.type, "access_control");
});

test("buildWeddingProjectionQueueViewState prefers blocked review action when nothing is dispatchable", () => {
  const state = buildWeddingProjectionQueueViewState({
    scheduleItems: [{ ...scheduleItem, startAt: null }],
    storage: memoryStorage(),
  });

  assert.equal(state.statusTone, "review");
  assert.equal(state.primaryAction.kind, "review_blocked_outputs");
  assert.equal(state.dispatchPayload, null);
  assert.equal(state.secondaryActions[0]?.enabled, true);
});

test("buildWeddingProjectionQueueViewState exposes saved state after projections are marked", () => {
  const storage = memoryStorage();
  const [artifact] = artifactState().artifacts;
  assert.ok(artifact);
  markWeddingArtifactAfpProjectionSent(artifact.summary.id, storage);
  markWeddingProjectionSent(scheduleItem.id, WEDDING_CALENDAR_AFP_PROJECTIONS_KEY, storage);

  const state = buildWeddingProjectionQueueViewState({
    artifacts: [artifact],
    scheduleItems: [scheduleItem],
    storage,
  });

  assert.equal(state.statusTone, "saved");
  assert.equal(state.primaryAction.kind, "open_saved_outputs");
  assert.equal(state.dispatchPayload, null);
  assert.equal(state.secondaryActions[1]?.enabled, true);
});

test("buildWeddingResponseWorkspaceViewState carries optional projection queue state", () => {
  const generated = artifactState();
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: generated.artifactInputs,
    generatedArtifacts: generated.artifacts,
    scheduleItems: [scheduleItem],
    projectionStorage: memoryStorage(),
  });

  assert.equal(state.projectionQueue?.primaryAction.kind, "save_pending_outputs");
  assert.ok((state.projectionQueue?.dispatchPayload?.count ?? 0) >= 2);
  assert.ok(state.projectionQueue?.groups.some((group) => group.kind === "artifact"));
  assert.ok(state.projectionQueue?.groups.some((group) => group.kind === "calendar_event"));
  assert.equal(state.headerTitle, "Wedding documents");
});

test("buildWeddingResponseWorkspaceViewState adds collaborator invites to save queue", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    collaboratorInvites: [{
      email: "planner@example.com",
      displayName: "Planner",
      role: "planner",
      status: "draft",
    }],
    projectionStorage: memoryStorage(),
  });

  assert.ok(state.projectionQueue?.groups.some((group) => group.kind === "access_control"));
  assert.ok(state.projectionQueue?.dispatchPayload?.sendInputs.some((input) => input.type === "access_control"));
});

test("buildWeddingResponseWorkspaceViewState can create preparation task projections without file inputs", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [{
      id: "artifact:plain-note",
      title: "Plain planning note",
      kind: "research",
      createdAt: 1,
      metadata,
      bodyText: "A general note about preferred colours and music.",
    }],
  });

  assert.equal(state.projectionQueue?.primaryAction.kind, "save_pending_outputs");
  assert.ok(state.projectionQueue?.groups.some((group) => group.kind === "task"));
  assert.ok(state.projectionQueue?.dispatchPayload?.sendInputs.some((input) =>
    input.type === "task" && input.metadata?.preparation_checklist === true
  ));
});
