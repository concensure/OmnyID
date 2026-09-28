// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingHelperTaskTab } from "@/lib/weddingHelpersNavigationState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import {
  buildWeddingSemanticSurfaceState,
  weddingSemanticObjectFromPlanningThreadItem,
  type WeddingSemanticSurfaceState,
} from "@/lib/weddingSemanticUiState";

export type WeddingPlanningThreadZoneId = "needs_you" | "being_handled" | "confirmed";
export type WeddingPlanningThreadStateTone = "risk" | "options" | "action" | "status";

export type WeddingPlanningThreadStep = {
  label: string;
  tone: WeddingPlanningThreadStateTone;
};

export type WeddingPlanningThreadItem = {
  id: string;
  title: string;
  detail: string;
  menuId: WeddingWorkspaceMenuId;
  artifactId?: string | null;
  actionLabel: string;
  stateLabel: string;
  stateTone: WeddingPlanningThreadStateTone;
  steps: WeddingPlanningThreadStep[];
  helperTaskTab?: WeddingHelperTaskTab;
};

export type WeddingPlanningThreadZone = {
  id: WeddingPlanningThreadZoneId;
  title: string;
  summary: string;
  items: WeddingPlanningThreadItem[];
};

export type WeddingPlanningThreadsState = {
  title: string;
  summary: string;
  snapshotLabel: string;
  zones: WeddingPlanningThreadZone[];
  shouldShow: boolean;
  semanticSurface: WeddingSemanticSurfaceState;
  a2ui: Record<string, unknown>;
};

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function moneyLabel(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function statusText(value: unknown): string {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return String(record.statusLabel ?? record.status ?? record.reviewStatus ?? record.approvalState ?? "").trim().toLowerCase();
}

function isDone(value: unknown): boolean {
  const status = statusText(value);
  return status === "done" || status === "complete" || status === "completed";
}

function zoneA2ui(zone: WeddingPlanningThreadZone): Record<string, unknown> {
  return {
    id: zone.id,
    title: zone.title,
    summary: zone.summary,
    items: zone.items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.detail,
      state: {
        label: item.stateLabel,
        tone: item.stateTone,
      },
      steps: item.steps,
      action: {
        kind: "open_wedding_menu",
        target_menu: item.menuId,
        label: item.actionLabel,
        ...(item.artifactId ? { artifact_id: item.artifactId } : {}),
        ...(item.helperTaskTab ? { helper_task_tab: item.helperTaskTab } : {}),
      },
    })),
  };
}

function topItems(items: WeddingPlanningThreadItem[]): WeddingPlanningThreadItem[] {
  return items.slice(0, 4);
}

function compactItems(items: Array<WeddingPlanningThreadItem | null>): WeddingPlanningThreadItem[] {
  return items.filter((item): item is WeddingPlanningThreadItem => item !== null);
}

function snapshotLabelFor(input: {
  needsYouCount: number;
  beingHandledCount: number;
  confirmedCount: number;
}): string {
  if (input.needsYouCount + input.beingHandledCount + input.confirmedCount === 0) {
    return "Nothing needs attention yet. Add your first date, budget, guest, or vendor to start the plan.";
  }
  const parts = [
    input.needsYouCount > 0 ? `${input.needsYouCount} need${input.needsYouCount === 1 ? "s" : ""} you` : null,
    input.beingHandledCount > 0 ? `${input.beingHandledCount} being handled` : null,
    input.confirmedCount > 0 ? `${input.confirmedCount} confirmed` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(", ");
}

export function buildWeddingPlanningThreadsState(state: WeddingResponseWorkspaceViewState): WeddingPlanningThreadsState {
  const focusItems = state.personalOsProjection.decisionLoadRelief.focusItems;
  const vendorComparisonFocus = focusItems.find((item) =>
    item.linkedArtifactId
    && (item.evidenceLabels ?? []).some((label) => /top-three vendor comparison/i.test(label))
  );
  const genericFocusCount = Math.max(0, focusItems.length - (vendorComparisonFocus ? 1 : 0));
  const focusCount = focusItems.length;
  const urgentVendorCount = state.vendorContactCards.filter((card) => card.tone === "urgent").length;
  const dueVendorCount = state.vendorContactCards.filter((card) => card.tone === "due").length;
  const waitingVendorCount = state.vendorContactCards.filter((card) => card.tone === "waiting").length;
  const closedVendorCount = state.vendorContactCards.filter((card) => card.tone === "closed").length;
  const sentQuoteReplyLogCount = state.vendorQuoteReplyLogFlows?.length ?? 0;
  const closedVendorPursuitCount = state.vendorPursuitLogCards?.length ?? 0;
  const pendingGuestCount = state.guestTracking.pendingCount;
  const unassignedSeatCount = state.seatingPlan.unassignedAttendingCount;
  const openPlanningTaskCount = state.planningTaskItems.filter((task) => !isDone(task)).length;
  const donePlanningTaskCount = state.planningTaskItems.filter(isDone).length;
  const upcomingTimelineCount = state.ganttTimeline.rows.filter((row) => !isDone(row)).length;
  const doneTimelineCount = state.ganttTimeline.rows.filter(isDone).length;
  const paidLabel = moneyLabel(state.budgetTracking.insights?.paidAmount);
  const needsYou = topItems(compactItems([
    vendorComparisonFocus ? {
      id: "vendor-comparison-choice",
      title: "Choose from top vendor comparison",
      detail: vendorComparisonFocus.title,
      menuId: "documents" as const,
      artifactId: vendorComparisonFocus.linkedArtifactId,
      actionLabel: "Open comparison",
      stateLabel: "Needs your choice",
      stateTone: "options" as const,
      steps: [
        { label: "Top 3 ready", tone: "options" as const },
        { label: "Choose vendors", tone: "action" as const },
        { label: "Approve outreach", tone: "status" as const },
      ],
    } : null,
    genericFocusCount > 0 ? {
      id: "top-decisions",
      title: countLabel(genericFocusCount, "decision"),
      detail: "Choices waiting for the couple before OmnyID narrows the plan.",
      menuId: "home" as const,
      actionLabel: "Review top decisions",
      stateLabel: "Needs your choice",
      stateTone: "action" as const,
      steps: [
        { label: "Options ready", tone: "options" as const },
        { label: "Choose", tone: "action" as const },
        { label: "Save decision", tone: "status" as const },
      ],
    } : null,
    state.budgetTracking.budgetTargetAmount === null ? {
      id: "set-budget",
      title: "Budget target missing",
      detail: "Add a target so every quote and vendor choice can be checked against it.",
      menuId: "budget" as const,
      actionLabel: "Set budget",
      stateLabel: "Needs your number",
      stateTone: "action" as const,
      steps: [
        { label: "Add budget", tone: "action" as const },
        { label: "Compare choices", tone: "options" as const },
        { label: "Track payments", tone: "status" as const },
      ],
    } : state.budgetTracking.remainingAmount !== null && state.budgetTracking.remainingAmount < 0 ? {
      id: "budget-risk",
      title: "Budget needs review",
      detail: `${moneyLabel(Math.abs(state.budgetTracking.remainingAmount))} is over the current target.`,
      menuId: "budget" as const,
      actionLabel: "Open budget",
      stateLabel: "High risk",
      stateTone: "risk" as const,
      steps: [
        { label: "Over target", tone: "risk" as const },
        { label: "Compare trade-offs", tone: "options" as const },
        { label: "Approve change", tone: "action" as const },
      ],
    } : null,
    pendingGuestCount > 0 ? {
      id: "pending-guests",
      title: countLabel(pendingGuestCount, "guest reply"),
      detail: "Guest numbers still affect catering, seating, and final counts.",
      menuId: "guests" as const,
      actionLabel: "Open guests",
      stateLabel: "No response yet",
      stateTone: "risk" as const,
      steps: [
        { label: "Invited", tone: "status" as const },
        { label: "No response", tone: "risk" as const },
        { label: "Send reminder", tone: "action" as const },
      ],
    } : null,
    unassignedSeatCount > 0 ? {
      id: "unassigned-seats",
      title: countLabel(unassignedSeatCount, "seat"),
      detail: "Attending guests still need a table before the seating plan is clear.",
      menuId: "seating" as const,
      actionLabel: "Open seating",
      stateLabel: "Needs arrangement",
      stateTone: "action" as const,
      steps: [
        { label: "Guests known", tone: "status" as const },
        { label: "Draft options", tone: "options" as const },
        { label: "Place guests", tone: "action" as const },
      ],
    } : null,
    urgentVendorCount + dueVendorCount > 0 ? {
      id: "vendor-follow-ups",
      title: countLabel(urgentVendorCount + dueVendorCount, "vendor follow-up"),
      detail: "Vendor outreach needs a reply, approval, or next message.",
      menuId: "response_queue" as const,
      actionLabel: "Open follow-ups",
      stateLabel: "No response / high risk",
      stateTone: "risk" as const,
      steps: [
        { label: "Outreach sent", tone: "status" as const },
        { label: "No response", tone: "risk" as const },
        { label: "Approve follow-up", tone: "action" as const },
      ],
    } : null,
  ]));
  const beingHandled = topItems(compactItems([
    waitingVendorCount > 0 ? {
      id: "waiting-vendors",
      title: countLabel(waitingVendorCount, "vendor"),
      detail: "Outreach has been sent and OmnyID is tracking the reply window.",
      menuId: "response_queue" as const,
      actionLabel: "Open follow-ups",
      stateLabel: "Waiting for reply",
      stateTone: "status" as const,
      steps: [
        { label: "Email sent", tone: "status" as const },
        { label: "Reply window open", tone: "status" as const },
        { label: "Next check queued", tone: "status" as const },
      ],
    } : null,
    openPlanningTaskCount > 0 ? {
      id: "active-tasks",
      title: countLabel(openPlanningTaskCount, "planning task"),
      detail: "Tasks are available for owners, due dates, and follow-up.",
      menuId: "helpers" as const,
      actionLabel: "Open who helps",
      stateLabel: "In progress",
      stateTone: "status" as const,
      steps: [
        { label: "Task created", tone: "status" as const },
        { label: "Owner / date", tone: "action" as const },
        { label: "Done", tone: "status" as const },
      ],
      helperTaskTab: "open" as const,
    } : null,
    upcomingTimelineCount > 0 ? {
      id: "upcoming-timeline",
      title: countLabel(upcomingTimelineCount, "timeline item"),
      detail: "Dated wedding work is visible on the timeline.",
      menuId: "timeline" as const,
      actionLabel: "Open timeline",
      stateLabel: "Scheduled",
      stateTone: "status" as const,
      steps: [
        { label: "Date set", tone: "status" as const },
        { label: "Track work", tone: "status" as const },
        { label: "Complete", tone: "status" as const },
      ],
    } : null,
  ]));
  const confirmed = topItems(compactItems([
    closedVendorCount > 0 ? {
      id: "closed-vendors",
      title: countLabel(closedVendorCount, "vendor reply"),
      detail: "Replies have been received and can be reviewed from follow-ups.",
      menuId: "response_queue" as const,
      actionLabel: "View replies",
      stateLabel: "Email received",
      stateTone: "status" as const,
      steps: [
        { label: "Email received", tone: "status" as const },
        { label: "Review reply", tone: "status" as const },
        { label: "Decide next", tone: "action" as const },
      ],
    } : null,
    sentQuoteReplyLogCount > 0 ? {
      id: "sent-quote-replies",
      title: countLabel(sentQuoteReplyLogCount, "sent vendor reply"),
      detail: "Sent quote replies are out of the decision queue and remain available as proof/history.",
      menuId: "response_queue" as const,
      actionLabel: "View sent replies",
      stateLabel: "Sent",
      stateTone: "status" as const,
      steps: [
        { label: "Approved", tone: "status" as const },
        { label: "Sent", tone: "status" as const },
        { label: "Proof saved", tone: "status" as const },
      ],
    } : null,
    closedVendorPursuitCount > 0 ? {
      id: "closed-vendor-pursuits",
      title: countLabel(closedVendorPursuitCount, "closed vendor path"),
      detail: "Vendors you stopped pursuing are out of the decision queue and still available in history.",
      menuId: "response_queue" as const,
      actionLabel: "View vendor history",
      stateLabel: "Not pursuing",
      stateTone: "status" as const,
      steps: [
        { label: "Compared", tone: "options" as const },
        { label: "Not pursuing", tone: "status" as const },
        { label: "Logged", tone: "status" as const },
      ],
    } : null,
    paidLabel ? {
      id: "paid-budget",
      title: `${paidLabel} paid`,
      detail: "Recorded payments are counted in the wedding budget.",
      menuId: "budget" as const,
      actionLabel: "Open budget",
      stateLabel: "Recorded",
      stateTone: "status" as const,
      steps: [
        { label: "Payment logged", tone: "status" as const },
        { label: "Budget updated", tone: "status" as const },
      ],
    } : null,
    doneTimelineCount > 0 ? {
      id: "done-timeline",
      title: countLabel(doneTimelineCount, "timeline item"),
      detail: "Completed timeline work is still available for review.",
      menuId: "timeline" as const,
      actionLabel: "Open timeline",
      stateLabel: "Done",
      stateTone: "status" as const,
      steps: [
        { label: "Done", tone: "status" as const },
        { label: "Available to review", tone: "status" as const },
      ],
    } : null,
    donePlanningTaskCount > 0 ? {
      id: "done-tasks",
      title: countLabel(donePlanningTaskCount, "finished task"),
      detail: "Finished tasks remain available if you need to reopen or check what happened.",
      menuId: "helpers" as const,
      actionLabel: "View done tasks",
      stateLabel: "Done",
      stateTone: "status" as const,
      steps: [
        { label: "Done", tone: "status" as const },
        { label: "Can reopen", tone: "action" as const },
      ],
      helperTaskTab: "done" as const,
    } : null,
    state.decisionRecordCards.length > 0 ? {
      id: "saved-decisions",
      title: countLabel(state.decisionRecordCards.length, "saved decision"),
      detail: "Saved decisions help OmnyID avoid reopening settled choices.",
      menuId: "home" as const,
      actionLabel: "Review decisions",
      stateLabel: "Saved",
      stateTone: "status" as const,
      steps: [
        { label: "Decision saved", tone: "status" as const },
        { label: "Used in plan", tone: "status" as const },
      ],
    } : null,
  ]));
  const zones: WeddingPlanningThreadZone[] = [
    {
      id: "needs_you",
      title: "Needs you",
      summary: needsYou.length > 0 ? "Decisions or details that need the couple." : "No urgent couple action right now.",
      items: needsYou,
    },
    {
      id: "being_handled",
      title: "Being handled",
      summary: beingHandled.length > 0 ? "Planning work already moving forward." : "Nothing is actively waiting on a follow-up yet.",
      items: beingHandled,
    },
    {
      id: "confirmed",
      title: "Confirmed",
      summary: confirmed.length > 0 ? "Work with evidence or saved progress." : "Confirmed progress will appear here.",
      items: confirmed,
    },
  ];
  const activeZones = zones.filter((zone) => zone.items.length > 0);
  const activeItemCount = activeZones.reduce((sum, zone) => sum + zone.items.length, 0);
  const semanticObjects = zones.flatMap((zone) => zone.items.map(weddingSemanticObjectFromPlanningThreadItem));
  const snapshotLabel = snapshotLabelFor({
    needsYouCount: needsYou.length,
    beingHandledCount: beingHandled.length,
    confirmedCount: confirmed.length,
  });
  return {
    title: "Wedding follow-through",
    summary: activeItemCount > 0
      ? `${activeItemCount} planning item${activeItemCount === 1 ? "" : "s"} visible across decisions, active work, and confirmed progress.`
      : "As you add dates, guests, vendors, and budget details, OmnyID will show what needs you, what is moving, and what is confirmed.",
    snapshotLabel,
    zones,
    shouldShow: activeItemCount > 0,
    semanticSurface: buildWeddingSemanticSurfaceState({
      semanticObjects,
      rendererFormatHint: "a2ui.v1",
    }),
    a2ui: {
      schema_version: "a2ui.v1",
      kind: "wedding_planning_threads",
      title: "Wedding follow-through",
      snapshot_label: snapshotLabel,
      summary: activeItemCount > 0 ? "Planning items grouped by status." : "No active planning items yet.",
      zones: zones.map(zoneA2ui),
      semantic_objects: semanticObjects,
    },
  };
}
