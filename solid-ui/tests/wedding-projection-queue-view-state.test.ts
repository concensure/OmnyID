import test from "node:test";
import assert from "node:assert/strict";
import { buildWeddingArtifactGenerationState } from "@/lib/weddingArtifactGenerationState";
import { markWeddingArtifactAfpProjectionSent } from "@/lib/weddingArtifactAfpProjectionState";
import {
  WEDDING_CALENDAR_AFP_PROJECTIONS_KEY,
  markWeddingProjectionSent,
  type WeddingPlanningTaskItem,
  type WeddingPlanningScheduleItem,
} from "@/lib/weddingCalendarProjectionState";
import { buildWeddingProjectionQueueViewState } from "@/lib/weddingProjectionQueueViewState";
import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { buildWeddingTemplateFollowUpState } from "@/lib/weddingTemplateFollowUpState";
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";

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

function contextProjection(storage = memoryStorage()) {
  return buildWeddingTemplateFollowUpState({
    weddingPlanId: "plan-view",
    responseWorkspaceId: "workspace-view",
    dateOrSeason: "2027-10-03",
    location: "Sydney",
    guestCount: 80,
    projectionStorage: storage,
  }).contextProjection;
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

test("buildWeddingProjectionQueueViewState exposes semantic objects for meaning-first UI", () => {
  const state = buildWeddingProjectionQueueViewState({
    contextItems: [contextProjection()],
    nowIso: "2026-09-12T00:00:00.000Z",
    storage: memoryStorage(),
  });

  assert.equal(state.dispatchPayload?.count, 2);
  assert.equal(state.dispatchPayload?.sendInputs.some((input) => input.subtype === "wedding_intake_profile"), true);
  assert.deepEqual(state.groups.map((group) => group.label), ["Context", "Profile"]);
  assert.equal(state.semanticObjects.length, 1);
  assert.equal(state.semanticObjects[0]?.kind, "wedding_active_loop");
  assert.ok(state.semanticObjects[0]?.semanticTags.includes("wedding_context"));
  assert.equal(state.semanticSurface.source, "semantic");
  assert.equal(state.semanticSurface.ignoredRendererFormat, "projection_queue");
  assert.equal(state.semanticSurface.primitives[0]?.primitiveKind, "progress_loop");
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

test("buildWeddingProjectionQueueViewState exposes selected-vendor draft previews", () => {
  const task: WeddingPlanningTaskItem = {
    id: "wedding_vendor_outreach_task:harbour-photos",
    title: "Prepare approval-gated quote request for Harbour Photos",
    kind: "vendor_follow_up",
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {
      ...metadata,
      vendor_outreach_from_selected_decision: true,
      vendor_outreach_vendor_label: "Harbour Photos",
      vendor_outreach_category_label: "Photographer",
      vendor_outreach_draft_subject: "Wedding quote request - Photographer",
      vendor_outreach_draft_body: "Hi Harbour Photos,\n\nCould you please confirm availability and current quote details?",
      vendor_outreach_request_checklist: ["availability", "current quote", "deposit"],
      vendor_outreach_draft_requires_approval: true,
      vendor_outreach_provider_receipt_required: true,
      approval_required_before_outreach: true,
      provider_receipt_required: true,
    },
  };

  const state = buildWeddingProjectionQueueViewState({
    taskItems: [task],
    nowIso: "2026-09-12T00:00:00.000Z",
    storage: memoryStorage(),
  });

  assert.equal(state.vendorOutreachDraftCards.length, 1);
  assert.equal(state.vendorOutreachDraftCards[0]?.vendorLabel, "Harbour Photos");
  assert.equal(state.vendorOutreachDraftCards[0]?.categoryLabel, "Photographer");
  assert.equal(state.vendorOutreachDraftCards[0]?.subjectLabel, "Wedding quote request - Photographer");
  assert.match(state.vendorOutreachDraftCards[0]?.bodyPreview ?? "", /confirm availability/);
  assert.deepEqual(state.vendorOutreachDraftCards[0]?.checklistLabels, ["availability", "current quote", "deposit"]);
  assert.equal(state.vendorOutreachDraftCards[0]?.saveLabel, "Saves an internal draft task");
  assert.equal(state.vendorOutreachDraftCards[0]?.externalSendGuardLabel, "No external send from this action");
  assert.equal(state.vendorOutreachDraftCards[0]?.approvalRequired, true);
  assert.equal(state.vendorOutreachDraftCards[0]?.providerReceiptRequired, true);
  assert.equal(state.title, "Save vendor draft tasks");
  assert.match(state.description, /does not send email/i);
  assert.equal(state.primaryAction.label, "Save 1 vendor draft");
  assert.match(state.primaryAction.reason ?? "", /no external outreach/i);
});

test("buildWeddingProjectionQueueViewState exposes selected-vendor decision consequences", () => {
  const decision: WeddingDecisionProjectionInput = {
    id: "wedding_decision:workspace-view:vendor-comparison:harbour-studio",
    metadata: {
      ...metadata,
      source: "vendor_search_comparison",
      vendorComparisonSelection: {
        selectedVendorsContinueToFollowUp: true,
        unselectedVendorsLeaveActiveQueues: true,
        approvalRequiredBeforeOutreach: true,
        noExternalSendWithoutApproval: true,
      },
    },
    artifactId: "artifact:top-vendor-comparison",
    artifactTitle: "Top vendor comparison",
    artifactKind: "vendor_table",
    sourceLabels: ["Top vendor comparison"],
    sourceUrls: ["https://harbour-studio.example"],
    selectedOption: {
      id: "vendor_choice:harbour_studio:1",
      rowIndex: 0,
      label: "Harbour Studio",
      detail: "Sydney documentary wedding photographer with transparent packages.",
      cells: ["#1 Harbour Studio", "Transparent packages", "https://harbour-studio.example"],
      selected: true,
      preferenceFitLabels: ["documentary"],
      missingPreferenceLabels: [],
      tradeoffLabels: [],
      preferenceSummaryLabel: "Selected by user",
    },
    source: "local_selection",
  };

  const state = buildWeddingProjectionQueueViewState({
    decisionItems: [decision],
    nowIso: "2026-09-12T00:00:00.000Z",
    storage: memoryStorage(),
  });

  assert.equal(state.vendorDecisionPolicyCards.length, 1);
  assert.equal(state.vendorDecisionPolicyCards[0]?.selectedVendorLabel, "Harbour Studio");
  assert.deepEqual(state.vendorDecisionPolicyCards[0]?.consequenceLabels, [
    "Selected vendor stays active",
    "Unselected vendors leave active queues",
    "No queue rehydration for unselected vendors",
  ]);
  assert.equal(state.vendorDecisionPolicyCards[0]?.approvalRequired, true);
  assert.equal(state.vendorDecisionPolicyCards[0]?.noExternalSendWithoutApproval, true);
  assert.equal(state.title, "Save selected vendor decisions");
  assert.match(state.description, /move unselected vendors out of the live decision queue/i);
  assert.equal(state.primaryAction.label, "Save 1 vendor decision");
  assert.match(state.primaryAction.reason ?? "", /removes unselected vendors from active queues/i);
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
