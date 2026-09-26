// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingWorkspaceAggregateAction = {
  id: string;
  title: string;
  detail: string;
  metaLabel: string;
  targetMenu: WeddingWorkspaceMenuId | "share_plan";
  enabled: boolean;
};

export type WeddingWorkspaceAggregateState = {
  title: string;
  detail: string;
  summaryPills: string[];
  actions: WeddingWorkspaceAggregateAction[];
  a2ui: Record<string, unknown>;
};

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinLabels(labels: (string | null | undefined)[], fallback: string): string {
  const present = labels.filter((label): label is string => Boolean(label));
  return present.length > 0 ? present.join(" - ") : fallback;
}

function firstMeaningfulLabel(labels: (string | null | undefined)[], fallback: string): string {
  return labels.find((label): label is string => Boolean(label)) ?? fallback;
}

function isDoneTimelineRow(row: unknown): boolean {
  const status = String((row as { status?: unknown } | null | undefined)?.status ?? "").trim().toLowerCase();
  return status === "done" || status === "complete" || status === "completed";
}

function a2uiFor(state: Omit<WeddingWorkspaceAggregateState, "a2ui">): Record<string, unknown> {
  return {
    schema_version: "a2ui.v1",
    kind: "wedding_workspace_aggregate",
    title: state.title,
    description: state.detail,
    sections: [
      { title: "Current status", items: state.summaryPills },
      {
        title: "Where to go next",
        items: state.actions.map((action) => ({
          label: action.title,
          detail: action.detail,
          meta: action.metaLabel,
          target: action.targetMenu,
          enabled: action.enabled,
        })),
      },
    ],
  };
}

function make(input: Omit<WeddingWorkspaceAggregateState, "a2ui">): WeddingWorkspaceAggregateState {
  return {
    ...input,
    a2ui: a2uiFor(input),
  };
}

export function buildWeddingPeopleAggregateState(state: WeddingResponseWorkspaceViewState): WeddingWorkspaceAggregateState {
  const activeGuestRuleCount = state.guestTracking.boundaryRuleLabels.length + state.guestTracking.invitationScopeLabels.length;
  const pendingFamilyRequestCount = state.boundaryState.pendingApprovalCount;
  const privateItemCount = state.boundaryState.privateObjectCount;
  const familyMetaLabels = [
    `${countLabel(pendingFamilyRequestCount, "request")} waiting for review`,
    activeGuestRuleCount > 0 ? `${countLabel(activeGuestRuleCount, "rule")} active` : "No guest rules saved yet",
    privateItemCount > 0 ? `${countLabel(privateItemCount, "private note")} couple-only` : null,
  ].filter((label): label is string => Boolean(label));
  return make({
    title: "People",
    detail: "Guests, seating, family rules, plus-ones, children, access needs, and people-sensitive decisions.",
    summaryPills: [
      countLabel(state.guestTracking.guestRowCount, "guest"),
      `${countLabel(state.guestTracking.pendingCount, "reply", "replies")} waiting`,
      `${countLabel(state.seatingPlan.unassignedAttendingCount, "seat")} unassigned`,
      activeGuestRuleCount > 0 ? `${countLabel(activeGuestRuleCount, "rule")} active` : "No guest rules yet",
      pendingFamilyRequestCount > 0 ? `${countLabel(pendingFamilyRequestCount, "family request")} waiting` : "No family requests",
    ],
    actions: [
      {
        id: "guests",
        title: "Guests and family boundaries",
        detail: "Add guests, manage plus-ones, review children rules, and approve family-sensitive changes.",
        metaLabel: familyMetaLabels.join(" - "),
        targetMenu: "guests",
        enabled: true,
      },
      {
        id: "seating",
        title: "Seating plan",
        detail: "Draft tables, keep conflicts apart, place access needs carefully, and prepare vendor-ready notes.",
        metaLabel: `${countLabel(state.seatingPlan.assignedSeatCount, "guest")} already seated`,
        targetMenu: "seating",
        enabled: true,
      },
    ],
  });
}

export function buildWeddingPlanAggregateState(
  state: WeddingResponseWorkspaceViewState,
  options: { sharePlanOpen?: boolean; sharePlanAvailable?: boolean } = {},
): WeddingWorkspaceAggregateState {
  const urgentFollowUps = state.vendorContactCards.filter((card) => card.tone === "urgent");
  const dueFollowUps = state.vendorContactCards.filter((card) => card.tone === "due");
  const waitingFollowUps = state.vendorContactCards.filter((card) => card.tone === "waiting");
  const closedFollowUps = state.vendorContactCards.filter((card) => card.tone === "closed");
  const openFollowUpCount = urgentFollowUps.length + dueFollowUps.length + waitingFollowUps.length;
  const doneTimelineRows = state.ganttTimeline.rows.filter(isDoneTimelineRow);
  const upcomingTimelineRows = state.ganttTimeline.rows.filter((row) => !isDoneTimelineRow(row));
  const undatedItemCount = state.ganttTimeline.undatedItems.length;
  const sharePlanOpen = Boolean(options.sharePlanOpen);
  const sharePlanAvailable = options.sharePlanAvailable !== false;
  const followUpSummary = firstMeaningfulLabel([
    urgentFollowUps.length > 0 ? `${countLabel(urgentFollowUps.length, "urgent follow-up")} needs attention` : null,
    dueFollowUps.length > 0 ? `${countLabel(dueFollowUps.length, "due follow-up")} ready` : null,
    waitingFollowUps.length > 0 ? `${countLabel(waitingFollowUps.length, "vendor")} waiting` : null,
  ], "No vendor follow-ups");
  const timelineSummary = firstMeaningfulLabel([
    upcomingTimelineRows.length > 0 ? `${countLabel(upcomingTimelineRows.length, "upcoming item")}` : null,
    doneTimelineRows.length > 0 ? `${countLabel(doneTimelineRows.length, "done item")}` : null,
  ], "No timeline items");
  const followUpMeta = joinLabels([
    urgentFollowUps.length > 0 ? countLabel(urgentFollowUps.length, "urgent item") : null,
    dueFollowUps.length > 0 ? countLabel(dueFollowUps.length, "due item") : null,
    waitingFollowUps.length > 0 ? `${countLabel(waitingFollowUps.length, "vendor")} waiting` : null,
    closedFollowUps.length > 0 ? `${countLabel(closedFollowUps.length, "closed loop")}` : null,
  ], "No open vendor loops");
  const timelineMeta = joinLabels([
    upcomingTimelineRows.length > 0 ? countLabel(upcomingTimelineRows.length, "upcoming item") : null,
    doneTimelineRows.length > 0 ? countLabel(doneTimelineRows.length, "done item") : null,
    undatedItemCount > 0 ? countLabel(undatedItemCount, "anytime item") : null,
  ], "No active timeline work");
  const sharingLabel = !sharePlanAvailable ? "Sharing unavailable" : `Sharing ${sharePlanOpen ? "open" : "closed"}`;
  return make({
    title: "Plan",
    detail: "Timing, follow-ups, and sharing in one place. Nothing external is sent before approval.",
    summaryPills: [
      followUpSummary,
      timelineSummary,
      undatedItemCount > 0 ? countLabel(undatedItemCount, "anytime item") : "No anytime items",
      sharingLabel,
    ],
    actions: [
      {
        id: "follow-ups",
        title: "Follow-ups",
        detail: "Review vendor replies, draft approved emails, and close loops without losing contact history.",
        metaLabel: followUpMeta,
        targetMenu: "response_queue",
        enabled: true,
      },
      {
        id: "timeline",
        title: "Timeline",
        detail: "See dated tasks, done items, file links, and planning work that can happen anytime.",
        metaLabel: timelineMeta,
        targetMenu: "timeline",
        enabled: true,
      },
      {
        id: "share-plan",
        title: "Share the Plan",
        detail: "Invite partners or helpers, set permissions, and keep shared details separate from private notes.",
        metaLabel: !sharePlanAvailable
          ? "Sharing setup is not connected."
          : sharePlanOpen
            ? "Sharing options are visible."
            : "Open sharing options.",
        targetMenu: "share_plan",
        enabled: sharePlanAvailable,
      },
    ],
  });
}
