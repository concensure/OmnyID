import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingPlanningThreadsState } from "../src/lib/weddingPlanningThreadsState.ts";
import type { WeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";

function state(overrides: Partial<WeddingResponseWorkspaceViewState> = {}): WeddingResponseWorkspaceViewState {
  return {
    personalOsProjection: {
      decisionLoadRelief: {
        focusItems: [],
      },
    },
    vendorContactCards: [],
    guestTracking: {
      pendingCount: 0,
    },
    seatingPlan: {
      unassignedAttendingCount: 0,
    },
    planningTaskItems: [],
    ganttTimeline: {
      rows: [],
    },
    budgetTracking: {
      budgetTargetAmount: 50_000,
      remainingAmount: 5_000,
      insights: {
        paidAmount: 0,
      },
    },
    decisionRecordCards: [],
    vendorQuoteReplyLogFlows: [],
    vendorPursuitLogCards: [],
    ...overrides,
  } as unknown as WeddingResponseWorkspaceViewState;
}

function zone(stateValue: ReturnType<typeof buildWeddingPlanningThreadsState>, id: string) {
  return stateValue.zones.find((item) => item.id === id);
}

test("buildWeddingPlanningThreadsState stays hidden when nothing is active", () => {
  const threads = buildWeddingPlanningThreadsState(state());

  assert.equal(threads.shouldShow, false);
  assert.ok(threads.summary.includes("As you add dates"));
  assert.match(threads.snapshotLabel, /Nothing needs attention yet/);
  assert.equal(threads.a2ui.snapshot_label, threads.snapshotLabel);
  assert.equal(zone(threads, "needs_you")?.items.length, 0);
  assert.equal(zone(threads, "being_handled")?.items.length, 0);
  assert.equal(zone(threads, "confirmed")?.items.length, 0);
});

test("buildWeddingPlanningThreadsState groups wedding work into user-facing zones", () => {
  const threads = buildWeddingPlanningThreadsState(state({
    personalOsProjection: {
      decisionLoadRelief: {
        focusItems: [{ id: "decision-1" }, { id: "decision-2" }],
      },
    } as WeddingResponseWorkspaceViewState["personalOsProjection"],
    vendorContactCards: [
      { tone: "urgent" },
      { tone: "due" },
      { tone: "waiting" },
      { tone: "closed" },
    ] as WeddingResponseWorkspaceViewState["vendorContactCards"],
    guestTracking: { pendingCount: 3 } as WeddingResponseWorkspaceViewState["guestTracking"],
    seatingPlan: { unassignedAttendingCount: 4 } as WeddingResponseWorkspaceViewState["seatingPlan"],
    planningTaskItems: [
      { id: "task-1", reviewStatus: "needs_review" },
      { id: "task-2", approvalState: "draft" },
    ] as WeddingResponseWorkspaceViewState["planningTaskItems"],
    ganttTimeline: {
      rows: [
        { id: "done", statusLabel: "Done" },
        { id: "todo", statusLabel: "Planned" },
      ],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    budgetTracking: {
      budgetTargetAmount: 50_000,
      remainingAmount: -1_500,
      insights: { paidAmount: 12_000 },
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
    decisionRecordCards: [{ id: "saved" }] as WeddingResponseWorkspaceViewState["decisionRecordCards"],
  }));

  assert.equal(threads.shouldShow, true);
  assert.ok(threads.summary.includes("planning items"));
  assert.match(threads.snapshotLabel, /4 need you/);
  assert.match(threads.snapshotLabel, /3 being handled/);
  assert.match(threads.snapshotLabel, /4 confirmed/);
  assert.equal(threads.a2ui.snapshot_label, threads.snapshotLabel);
  assert.ok(zone(threads, "needs_you")?.items.some((item) => item.id === "top-decisions" && item.menuId === "home"));
  const budgetRisk = zone(threads, "needs_you")?.items.find((item) => item.id === "budget-risk");
  assert.equal(budgetRisk?.menuId, "budget");
  assert.equal(budgetRisk?.stateTone, "risk");
  assert.equal(budgetRisk?.stateLabel, "High risk");
  assert.ok(budgetRisk?.steps.some((step) => step.label === "Compare trade-offs" && step.tone === "options"));
  assert.ok(zone(threads, "being_handled")?.items.some((item) => item.id === "waiting-vendors" && item.menuId === "response_queue"));
  assert.ok(zone(threads, "being_handled")?.items.some((item) => item.id === "active-tasks" && item.menuId === "helpers"));
  const closedVendor = zone(threads, "confirmed")?.items.find((item) => item.id === "closed-vendors");
  assert.equal(closedVendor?.stateLabel, "Email received");
  assert.equal(closedVendor?.stateTone, "status");
  assert.ok(zone(threads, "confirmed")?.items.some((item) => item.title === "$12,000 paid"));
  assert.equal(threads.a2ui.kind, "wedding_planning_threads");
  const semanticObjects = threads.a2ui.semantic_objects as Array<Record<string, unknown>>;
  assert.ok(semanticObjects.some((object) => object.kind === "wedding_decision"));
  assert.ok(semanticObjects.some((object) => object.kind === "wedding_budget_impact"));
  assert.ok(semanticObjects.some((object) => object.kind === "wedding_external_wait"));
  assert.equal(threads.semanticSurface.source, "semantic");
  assert.equal(threads.semanticSurface.ignoredRendererFormat, "a2ui.v1");
  assert.ok(threads.semanticSurface.primitives.some((primitive) => primitive.primitiveKind === "decision_comparison"));
  assert.ok(threads.semanticSurface.primitives.some((primitive) => primitive.primitiveKind === "budget_delta"));
  assert.ok(threads.semanticSurface.primitives.some((primitive) => primitive.primitiveKind === "waiting_dependency"));
  const zones = threads.a2ui.zones as Array<{ id: string; items: Array<{ id: string; state: { label: string; tone: string }; steps: Array<{ label: string; tone: string }> }> }>;
  const budgetRiskA2ui = zones.find((entry) => entry.id === "needs_you")?.items.find((entry) => entry.id === "budget-risk");
  assert.deepEqual(budgetRiskA2ui?.state, { label: "High risk", tone: "risk" });
  assert.ok(budgetRiskA2ui?.steps.some((step) => step.label === "Approve change" && step.tone === "action"));
});

test("buildWeddingPlanningThreadsState surfaces top-three vendor comparison as its own decision thread", () => {
  const threads = buildWeddingPlanningThreadsState(state({
    personalOsProjection: {
      decisionLoadRelief: {
        focusItems: [{
          id: "task:wedding_vendor_search_task:choose-top-vendor-comparison:workspace",
          title: "Choose preferred vendors from the top-three comparison",
          linkedArtifactId: "wedding_artifact:vendor_comparison_top3:workspace",
          workspaceMenu: "documents",
          evidenceLabels: ["top-three vendor comparison"],
        }],
      },
    } as WeddingResponseWorkspaceViewState["personalOsProjection"],
  }));
  const item = zone(threads, "needs_you")?.items.find((entry) => entry.id === "vendor-comparison-choice");
  const zones = threads.a2ui.zones as Array<{ id: string; items: Array<{ id: string; action: Record<string, unknown> }> }>;
  const a2uiItem = zones.find((entry) => entry.id === "needs_you")?.items.find((entry) => entry.id === "vendor-comparison-choice");

  assert.equal(threads.shouldShow, true);
  assert.equal(item?.title, "Choose from top vendor comparison");
  assert.equal(item?.menuId, "documents");
  assert.equal(item?.artifactId, "wedding_artifact:vendor_comparison_top3:workspace");
  assert.equal(item?.actionLabel, "Open comparison");
  assert.equal(item?.stateTone, "options");
  assert.equal(a2uiItem?.action.target_menu, "documents");
  assert.equal(a2uiItem?.action.artifact_id, "wedding_artifact:vendor_comparison_top3:workspace");
});

test("buildWeddingPlanningThreadsState makes first-run missing budget actionable", () => {
  const threads = buildWeddingPlanningThreadsState(state({
    budgetTracking: {
      budgetTargetAmount: null,
      remainingAmount: null,
      insights: {},
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
  }));
  const item = zone(threads, "needs_you")?.items.find((entry) => entry.id === "set-budget");

  assert.equal(threads.shouldShow, true);
  assert.equal(threads.semanticSurface.source, "semantic");
  assert.ok(threads.semanticSurface.primitives.some((primitive) => primitive.title === "Budget target missing"));
  assert.equal(item?.title, "Budget target missing");
  assert.equal(item?.menuId, "budget");
  assert.equal(item?.actionLabel, "Set budget");
  assert.equal(item?.stateTone, "action");
  assert.ok(item?.steps.some((step) => step.label === "Compare choices" && step.tone === "options"));
});

test("buildWeddingPlanningThreadsState does not count finished tasks as active work", () => {
  const threads = buildWeddingPlanningThreadsState(state({
    planningTaskItems: [
      { id: "done-1", title: "Send invitations", reviewStatus: "done" },
      { id: "done-2", title: "Book celebrant", approvalState: "completed" },
      { id: "open-1", title: "Confirm menu", status: "pending" },
    ] as WeddingResponseWorkspaceViewState["planningTaskItems"],
  }));
  const activeTaskItem = zone(threads, "being_handled")?.items.find((entry) => entry.id === "active-tasks");
  const doneTaskItem = zone(threads, "confirmed")?.items.find((entry) => entry.id === "done-tasks");

  assert.equal(activeTaskItem?.title, "1 planning task");
  assert.equal(activeTaskItem?.menuId, "helpers");
  assert.equal(activeTaskItem?.helperTaskTab, "open");
  assert.equal(doneTaskItem?.title, "2 finished tasks");
  assert.equal(doneTaskItem?.actionLabel, "View done tasks");
  assert.equal(doneTaskItem?.helperTaskTab, "done");

  const zones = threads.a2ui.zones as Array<{ id: string; items: Array<{ id: string; action: Record<string, unknown> }> }>;
  const doneTaskA2ui = zones.find((entry) => entry.id === "confirmed")?.items.find((entry) => entry.id === "done-tasks");
  assert.equal(doneTaskA2ui?.action.target_menu, "helpers");
  assert.equal(doneTaskA2ui?.action.helper_task_tab, "done");
});

test("buildWeddingPlanningThreadsState keeps sent quote replies as confirmed history", () => {
  const threads = buildWeddingPlanningThreadsState(state({
    vendorQuoteReplyLogFlows: [
      {
        id: "flow:chloe",
        stage: "sent",
        sentReceiptId: "gmail-message-123",
      },
    ],
  } as Partial<WeddingResponseWorkspaceViewState>));
  const needsYouItems = zone(threads, "needs_you")?.items ?? [];
  const sentReplyItem = zone(threads, "confirmed")?.items.find((entry) => entry.id === "sent-quote-replies");
  const zones = threads.a2ui.zones as Array<{ id: string; items: Array<{ id: string; action: Record<string, unknown> }> }>;
  const sentReplyA2ui = zones.find((entry) => entry.id === "confirmed")?.items.find((entry) => entry.id === "sent-quote-replies");

  assert.equal(threads.shouldShow, true);
  assert.equal(needsYouItems.some((item) => /quote reply/i.test(item.title)), false);
  assert.equal(sentReplyItem?.title, "1 sent vendor reply");
  assert.equal(sentReplyItem?.actionLabel, "View sent replies");
  assert.equal(sentReplyItem?.menuId, "response_queue");
  assert.equal(sentReplyItem?.stateLabel, "Sent");
  assert.equal(sentReplyA2ui?.action.target_menu, "response_queue");
});

test("buildWeddingPlanningThreadsState keeps closed vendor pursuits as confirmed history", () => {
  const threads = buildWeddingPlanningThreadsState(state({
    vendorPursuitLogCards: [
      {
        id: "wedding_vendor_outreach_task:budget_lens",
        vendorLabel: "Budget Lens",
        title: "Stopped pursuing Budget Lens: Not suitable",
        reasonLabel: "Not suitable",
        detailLabel: "Budget Lens was removed from active vendor follow-up.",
        closedAtLabel: "Closed 2026-09-28",
        closedAtIso: "2026-09-28T00:00:00.000Z",
        categoryLabel: "Photographer",
        sourceLabel: "Top-three vendor comparison",
        noteLabel: "The style is less aligned than Harbour Studio.",
        metadataLabels: ["Photographer", "Closed 2026-09-28"],
      },
    ],
  } as Partial<WeddingResponseWorkspaceViewState>));
  const needsYouItems = zone(threads, "needs_you")?.items ?? [];
  const closedPursuitItem = zone(threads, "confirmed")?.items.find((entry) => entry.id === "closed-vendor-pursuits");
  const zones = threads.a2ui.zones as Array<{ id: string; items: Array<{ id: string; action: Record<string, unknown>; steps: Array<{ label: string; tone: string }> }> }>;
  const closedPursuitA2ui = zones.find((entry) => entry.id === "confirmed")?.items.find((entry) => entry.id === "closed-vendor-pursuits");

  assert.equal(threads.shouldShow, true);
  assert.equal(needsYouItems.some((item) => /Budget Lens|closed vendor/i.test(`${item.title} ${item.detail}`)), false);
  assert.equal(closedPursuitItem?.title, "1 closed vendor path");
  assert.equal(closedPursuitItem?.actionLabel, "View vendor history");
  assert.equal(closedPursuitItem?.menuId, "response_queue");
  assert.equal(closedPursuitItem?.stateLabel, "Not pursuing");
  assert.equal(closedPursuitItem?.stateTone, "status");
  assert.equal(closedPursuitA2ui?.action.target_menu, "response_queue");
  assert.ok(closedPursuitA2ui?.steps.some((step) => step.label === "Logged" && step.tone === "status"));
});
