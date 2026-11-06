import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingDecisionDeferSidebarAction,
  buildWeddingDecisionFocusSidebarAction,
} from "../src/lib/weddingDecisionFocusActionState.ts";
import {
  buildWeddingDecisionFocusDisplayState,
  WEDDING_VISIBLE_DECISION_LIMIT,
  weddingVendorResearchQueryForDecision,
} from "../src/lib/weddingDecisionFocusDisplayState.ts";
import { weddingDecisionDeferralActionToAfpSendInput } from "../src/lib/weddingDecisionDeferralAfpState.ts";
import type { WeddingPersonalOsRankedItem } from "../src/lib/weddingPersonalOsProjectionState.ts";

function item(input: Partial<WeddingPersonalOsRankedItem> & Pick<WeddingPersonalOsRankedItem, "sourceSurface" | "title">): WeddingPersonalOsRankedItem {
  return {
    id: `item:${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind: "task",
    title: input.title,
    pressureFamily: "obligation",
    rankWeight: 42,
    dueLabel: null,
    dueAt: null,
    explanation: "Focus explanation.",
    evidenceLabels: ["payment review"],
    simulatorSeedKind: "commitment",
    ...input,
  };
}

test("decision focus presents one card while retaining the complete ranked queue", () => {
  const rings = item({ title: "Choose, size, order, and insure wedding rings", sourceSurface: "tasks" });
  const display = buildWeddingDecisionFocusDisplayState({
    relief: {
      summaryLabel: "Many decisions",
      focusLimit: 5,
      focusItems: [rings, item({ title: "Second", sourceSurface: "tasks" }), item({ title: "Third", sourceSurface: "tasks" }), item({ title: "Fourth", sourceSurface: "tasks" })],
      backlogCount: 1,
      reliefLabels: [],
    },
  });

  assert.equal(display.visibleFocusItems.length, WEDDING_VISIBLE_DECISION_LIMIT);
  assert.equal(display.queuedFocusItems.length, 4);
  assert.equal(display.remainingCount, 3);
  assert.equal(display.itemCards[0]?.recommendedActionLabel, "Research wedding ring jewellers before choosing");
  assert.equal(display.itemCards[0]?.compareLabel, "Research vendors");
  assert.equal(weddingVendorResearchQueryForDecision(rings), "wedding ring jewellers");
});

test("RSVP and research tasks expose consequence-specific primary actions", () => {
  const rsvp = buildWeddingDecisionFocusDisplayState({ relief: {
    summaryLabel: "One action",
    focusLimit: 1,
    focusItems: [item({ title: "Follow up 1 pending RSVP", sourceSurface: "tasks", evidenceLabels: ["guest follow-up"] })],
    backlogCount: 0,
    reliefLabels: [],
  }}).itemCards[0]!;
  assert.equal(rsvp.compareLabel, "Message guest");
  assert.match(rsvp.recommendedActionLabel, /contextual RSVP reminder/i);

  const hens = buildWeddingDecisionFocusDisplayState({ relief: {
    summaryLabel: "One action",
    focusLimit: 1,
    focusItems: [item({ title: "Plan hen's night activities, budget, guest list, and transport", sourceSurface: "tasks" })],
    backlogCount: 0,
    reliefLabels: [],
  }}).itemCards[0]!;
  assert.equal(hens.compareLabel, "View research");
});

test("vendor scheduling decisions request the correct source-backed shortlist", () => {
  assert.equal(
    weddingVendorResearchQueryForDecision(item({
      title: "Schedule hair and make up trial and final beauty timeline",
      sourceSurface: "tasks",
      evidenceLabels: ["personal style", "soft colour palette"],
    })),
    "wedding hair stylists",
  );
  assert.equal(
    weddingVendorResearchQueryForDecision(item({ title: "Research photographers", sourceSurface: "tasks" })),
    "wedding photographers",
  );
});

test("buildWeddingDecisionFocusSidebarAction routes task focus to Tasks with compact metadata", () => {
  const action = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "Focus on 2 wedding decisions now; 1 can wait.",
    backlogCount: 1,
    focusItems: [
      item({ title: "Verify venue balance before payment", sourceSurface: "tasks" }),
      item({ title: "Decide final caterer headcount", sourceSurface: "decision_queue" }),
    ],
  });

  const packet = action.metadata?.decision_focus as Record<string, unknown>;
  const focusItems = packet.focus_items as Array<Record<string, unknown>>;
  assert.equal(action.kind, "open_tasks");
  assert.equal(action.label, "Open task");
  assert.equal(action.enabled, true);
  assert.deepEqual(action.contextLabels, ["Verify venue balance before payment", "Decide final caterer headcount"]);
  assert.equal(packet.intent, "open_item");
  assert.equal(packet.summary_label, "Focus on 2 wedding decisions now; 1 can wait.");
  assert.equal(packet.backlog_count, 1);
  assert.equal(packet.top_source_surface, "tasks");
  assert.equal(focusItems[0]?.title, "Verify venue balance before payment");
  assert.deepEqual(focusItems[0]?.evidence_labels, ["payment review"]);
});

test("buildWeddingDecisionFocusSidebarAction opens linked vendor comparison artifacts", () => {
  const action = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "Focus on 1 wedding decision now; 0 can wait.",
    backlogCount: 0,
    focusItems: [
      item({
        title: "Choose preferred vendors from the top-three comparison",
        sourceSurface: "tasks",
        linkedArtifactId: "wedding_artifact:vendor_comparison_top3:workspace",
        workspaceMenu: "documents",
        evidenceLabels: ["top-three vendor comparison"],
      }),
    ],
  });
  const packet = action.metadata?.decision_focus as Record<string, unknown>;
  const focusItems = packet.focus_items as Array<Record<string, unknown>>;

  assert.equal(action.kind, "open_workspace_menu");
  assert.equal(action.label, "Open comparison");
  assert.equal(action.metadata?.wedding_workspace_menu, "documents");
  assert.equal(action.metadata?.linked_artifact_id, "wedding_artifact:vendor_comparison_top3:workspace");
  assert.equal(focusItems[0]?.linked_artifact_id, "wedding_artifact:vendor_comparison_top3:workspace");
  assert.equal(focusItems[0]?.wedding_workspace_menu, "documents");
});

test("buildWeddingDecisionFocusSidebarAction routes lead-time vendor research to the response queue", () => {
  const action = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "Focus on 1 wedding decision now; 0 can wait.",
    backlogCount: 0,
    focusItems: [
      item({
        title: "Vendor research, right now: Venue",
        sourceSurface: "tasks",
        workspaceMenu: "response_queue",
        evidenceLabels: ["vendor research timing"],
        actionMetadata: {
          vendor_lead_time_research_task: true,
          vendor_lead_time_category_id: "venue",
          vendor_search_review_task: true,
          vendor_search_action_id: "lead-time-venue",
          vendor_search_categories: ["Venue"],
          vendor_search_scope: "lead_time_category",
        },
      }),
    ],
  });
  const packet = action.metadata?.decision_focus as Record<string, unknown>;
  const focusItems = packet.focus_items as Array<Record<string, unknown>>;
  const itemMetadata = focusItems[0]?.action_metadata as Record<string, unknown>;

  assert.equal(action.kind, "open_workspace_menu");
  assert.equal(action.label, "Research this");
  assert.equal(action.metadata?.wedding_workspace_menu, "response_queue");
  assert.equal(action.metadata?.vendor_lead_time_category_id, "venue");
  assert.equal(action.metadata?.vendor_search_scope, "lead_time_category");
  assert.deepEqual(action.metadata?.vendor_search_categories, ["Venue"]);
  assert.equal(itemMetadata.vendor_search_action_id, "lead-time-venue");
});

test("buildWeddingDecisionFocusSidebarAction can request explanation instead of opening", () => {
  const action = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "Focus on 1 wedding decision now; 0 can wait.",
    backlogCount: 0,
    focusItems: [
      item({
        title: "Choose florist",
        sourceSurface: "decision_queue",
        explanation: "The floral quote is holding up the decor budget.",
      }),
    ],
  }, "explain_item");
  const packet = action.metadata?.decision_focus as Record<string, unknown>;

  assert.equal(action.kind, "approve_action");
  assert.equal(packet.intent, "explain_item");
  assert.equal(packet.explanation, "The floral quote is holding up the decor budget.");
});

test("buildWeddingDecisionFocusSidebarAction marks review-all actions explicitly", () => {
  const action = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "Focus on 2 wedding decisions now; 1 can wait.",
    backlogCount: 1,
    focusItems: [
      item({ title: "Review venue payment", sourceSurface: "tasks" }),
      item({ title: "Confirm ceremony time", sourceSurface: "calendar" }),
    ],
  }, "review_all");
  const packet = action.metadata?.decision_focus as Record<string, unknown>;

  assert.equal(packet.intent, "review_all");
  assert.equal(packet.explanation, null);
});

test("buildWeddingDecisionFocusSidebarAction routes calendar and decision focus to their destination surfaces", () => {
  const calendarAction = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "Focus on 1 wedding decision now; 0 can wait.",
    backlogCount: 0,
    focusItems: [item({ title: "Review ceremony hold date", sourceSurface: "calendar", kind: "calendar_event" })],
  });
  const decisionAction = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "Focus on 1 wedding decision now; 0 can wait.",
    backlogCount: 0,
    focusItems: [item({ title: "Confirm selected venue", sourceSurface: "decision_queue", kind: "decision" })],
  });

  assert.equal(calendarAction.kind, "open_calendar");
  assert.equal(calendarAction.label, "Open date");
  assert.equal(decisionAction.kind, "approve_action");
  assert.equal(decisionAction.label, "Choose option");
});

test("buildWeddingDecisionFocusSidebarAction disables empty focus packets without dropping metadata", () => {
  const action = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "No decision-heavy wedding items need focus right now.",
    backlogCount: 0,
    focusItems: [],
  });

  assert.equal(action.kind, "open_tasks");
  assert.equal(action.enabled, false);
  assert.match(action.reason ?? "", /No decision-heavy wedding focus items/i);
  assert.deepEqual((action.metadata?.decision_focus as Record<string, unknown>).focus_items, []);
});

test("buildWeddingDecisionDeferSidebarAction carries durable deferral metadata", () => {
  const action = buildWeddingDecisionDeferSidebarAction(item({
    title: "Choose photographer",
    sourceSurface: "decision_queue",
    dueLabel: "Needed by 3 October",
    dueAt: "2026-10-03T09:00:00.000Z",
    pressureFamily: "opportunity",
  }));

  const packet = action.metadata?.decision_deferral as Record<string, unknown>;
  assert.equal(action.kind, "defer_decision");
  assert.equal(action.label, "Decide Later");
  assert.equal(action.enabled, true);
  assert.deepEqual(action.contextLabels, ["Choose photographer", "Needed by 3 October"]);
  assert.equal(packet.version, 1);
  assert.equal(packet.title, "Choose photographer");
  assert.equal(packet.pressure_family, "opportunity");
  assert.equal(packet.source_surface, "decision_queue");
  assert.equal(packet.requested_state, "deferred");
  assert.match(String(packet.user_reason), /Decide later/i);
  assert.match(String(packet.resurface_policy), /evidence changes/i);
  assert.deepEqual(packet.evidence_labels, ["payment review"]);
});

test("buildWeddingDecisionFocusDisplayState hides locally deferred focus items immediately", () => {
  const first = item({ title: "Choose photographer", sourceSurface: "decision_queue" });
  const second = item({ title: "Review venue payment", sourceSurface: "tasks" });
  const state = buildWeddingDecisionFocusDisplayState({
    relief: {
      summaryLabel: "2 things need your attention; 0 can wait.",
      focusLimit: 3,
      focusItems: [first, second],
      backlogCount: 0,
      reliefLabels: [],
    },
    locallyDeferredIds: new Set([first.id]),
  });

  assert.deepEqual(state.visibleFocusItems.map((entry) => entry.title), ["Review venue payment"]);
  assert.deepEqual(state.itemCards.map((entry) => entry.title), ["Review venue payment"]);
  assert.equal(state.visibleCount, 1);
  assert.match(state.savedForLaterLabel ?? "", /Saved for later/i);
  assert.equal(state.reviewDisabled, false);
});

test("buildWeddingDecisionFocusDisplayState explains why-now, evidence, timing, and next action", () => {
  const state = buildWeddingDecisionFocusDisplayState({
    relief: {
      summaryLabel: "1 thing needs your attention; 0 can wait.",
      focusLimit: 3,
      focusItems: [item({
        title: "Review venue payment",
        sourceSurface: "tasks",
        dueLabel: "Due tomorrow",
        explanation: "Budget sheet shows a due amount, unpaid status, or payment risk.",
        evidenceLabels: ["payment review", "budget"],
      })],
      backlogCount: 0,
      reliefLabels: [],
    },
  });

  assert.equal(state.itemCards[0]?.neededByLabel, "Due tomorrow");
  assert.match(state.itemCards[0]?.whyNowLabel ?? "", /payment risk/i);
  assert.match(state.itemCards[0]?.checkedLabel ?? "", /payment review, budget/i);
  assert.equal(state.itemCards[0]?.recommendedActionLabel, "Open Budget and check the money detail");
  assert.equal(state.itemCards[0]?.compareLabel, "Open task");
});

test("buildWeddingDecisionFocusDisplayState uses destination-specific action wording", () => {
  const state = buildWeddingDecisionFocusDisplayState({
    relief: {
      summaryLabel: "3 things need your attention; 0 can wait.",
      focusLimit: 3,
      focusItems: [
        item({ title: "Approve vendor email", sourceSurface: "approval_queue", kind: "approval" }),
        item({ title: "Confirm venue", sourceSurface: "decision_queue", kind: "decision" }),
        item({ title: "Check tasting date", sourceSurface: "calendar", kind: "calendar_event" }),
      ],
      backlogCount: 0,
      reliefLabels: [],
    },
  });

  assert.deepEqual(state.queuedItemCards.map((card) => card.compareLabel), ["Review approval", "Compare", "View date"]);
  assert.match(state.itemCards[0]?.neededByLabel ?? "", /Before anything is sent/i);
  assert.match(state.queuedItemCards[1]?.recommendedActionLabel ?? "", /Compare the options/i);
  assert.match(state.queuedItemCards[2]?.recommendedActionLabel ?? "", /Open the date/i);
});

test("buildWeddingDecisionFocusDisplayState disables review when all focus items are deferred", () => {
  const first = item({ title: "Choose photographer", sourceSurface: "decision_queue" });
  const state = buildWeddingDecisionFocusDisplayState({
    relief: {
      summaryLabel: "1 thing needs your attention; 0 can wait.",
      focusLimit: 3,
      focusItems: [first],
      backlogCount: 0,
      reliefLabels: [],
    },
    locallyDeferredIds: new Set([first.id]),
  });

  assert.deepEqual(state.visibleFocusItems, []);
  assert.match(state.summaryLabel, /No decision-heavy wedding items/i);
  assert.equal(state.reviewDisabled, true);
});

test("weddingDecisionDeferralActionToAfpSendInput projects deferrals into AFP ledger shape", () => {
  const action = buildWeddingDecisionDeferSidebarAction(item({
    title: "Choose photographer",
    sourceSurface: "decision_queue",
    dueLabel: "Needed by 3 October",
  }));
  const sendInput = weddingDecisionDeferralActionToAfpSendInput(action, {
    weddingPlanId: "wedding_plan:focus",
    responseWorkspaceId: "response_workspace:focus",
    sourceResponseId: "response:focus",
    supertags: ["template:wedding_planning"],
  }, "2026-09-25T09:00:00.000Z");

  assert.ok(sendInput);
  assert.equal(sendInput.type, "ledger");
  assert.equal(sendInput.kind, "wedding_decision_deferral");
  assert.equal(sendInput.subtype, "wedding_decision_deferral");
  assert.equal(sendInput.store_in_relational, true);
  assert.ok(sendInput.supertags?.includes("decision:deferred"));
  assert.deepEqual(sendInput.to, ["agent://wedding-planning", "agent://decision-queue", "agent://knowledge-graph", "agent://topology"]);
  assert.equal(sendInput.content.focus_item_id, "item:choose-photographer");
  assert.equal(sendInput.content.requested_state, "deferred");
  assert.equal(sendInput.content.explanation, "Focus explanation.");
  assert.deepEqual(sendInput.content.resurface_policy, {
    due_window_days: 3,
    stale_after_days: 7,
    resurface_on_dependency_change: true,
  });
  assert.equal(sendInput.content.deferred_until_at, "2026-10-02T09:00:00.000Z");
  assert.equal(sendInput.content.stale_after_at, "2026-10-02T09:00:00.000Z");
  assert.match(String(sendInput.content.dependency_fingerprint), /choose-photographer/i);
  assert.equal(sendInput.content.response_workspace_id, "response_workspace:focus");
  assert.equal(sendInput.metadata.projection, "wedding_decision_deferral_to_afp");
  assert.equal(sendInput.metadata.resurface_policy, "Due in 3 days, unchanged for 7 days, or when the evidence changes.");
  assert.equal(sendInput.references?.some((ref) => ref.type === "deferred_focus_item" && ref.target === "item:choose-photographer"), true);
});
