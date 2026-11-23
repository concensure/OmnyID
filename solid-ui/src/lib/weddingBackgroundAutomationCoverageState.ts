// @locs-version: 2.0
import type { WeddingPlanningScheduleItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingBudgetTrackingState } from "@/lib/weddingBudgetTrackingState";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import type { WeddingPersistedApprovalReceipt } from "@/lib/weddingPersistedWorkspaceState";
import type { WeddingSeatingPlanState } from "@/lib/weddingSeatingPlanState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingBackgroundAutomationId =
  | "caterer_estimate_recalc"
  | "household_invitation_inheritance"
  | "gmail_vendor_reply_sync"
  | "booked_vendor_timeline_sync"
  | "guest_seating_summary";

export type WeddingBackgroundAutomationCoverageItem = {
  id: WeddingBackgroundAutomationId;
  title: string;
  status: "matched" | "differentiated" | "blocked";
  detailLabel: string;
  evidenceLabels: string[];
  nextActionLabel: string | null;
};

export type WeddingBackgroundAutomationCoverageState = {
  status: "strong" | "partial" | "blocked";
  matchedCount: number;
  blockedCount: number;
  summaryLabel: string;
  items: WeddingBackgroundAutomationCoverageItem[];
  omnyidDifferentiatorLabels: string[];
};

function hasLiveVendorReplySync(receipts: readonly WeddingPersistedApprovalReceipt[] | null | undefined): boolean {
  return (receipts ?? []).some((receipt) =>
    receipt.status === "executed"
    && receipt.providerExecutorConnected
    && Boolean(receipt.externalId)
    && /email|gmail|vendor|contact/i.test(`${receipt.providerCapability ?? ""} ${receipt.requiredProvider ?? ""} ${receipt.executionMode ?? ""}`),
  );
}

function hasBookedVendorTimeline(scheduleItems: readonly WeddingPlanningScheduleItem[] | null | undefined): boolean {
  return (scheduleItems ?? []).some((item) =>
    /vendor|photographer|caterer|florist|band|dj|celebrant|officiant/i.test(`${item.title} ${item.notes ?? ""}`)
    && /\b(arriv\w*|depart\w*|load[-\s]?in|pack[-\s]?down|bump[-\s]?in|bump[-\s]?out)\b/i.test(`${item.title} ${item.notes ?? ""}`),
  );
}

function taskKindForAutomation(id: WeddingBackgroundAutomationId): WeddingPlanningTaskItem["kind"] {
  if (id === "caterer_estimate_recalc") return "budget_review";
  if (id === "household_invitation_inheritance" || id === "guest_seating_summary") return "guest_list";
  return "vendor_coordination";
}

function existingAutomationTaskKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? item.metadata as Record<string, unknown>
      : {};
    const automationId = typeof metadata.background_automation_id === "string" ? metadata.background_automation_id : null;
    if (automationId) keys.add(automationId);
  }
  return keys;
}

export function buildWeddingBackgroundAutomationCoverageState(input: {
  guestTracking?: WeddingGuestTrackingState | null;
  budgetTracking?: WeddingBudgetTrackingState | null;
  seatingPlan?: WeddingSeatingPlanState | null;
  approvalReceipts?: readonly WeddingPersistedApprovalReceipt[] | null;
  scheduleItems?: readonly WeddingPlanningScheduleItem[] | null;
}): WeddingBackgroundAutomationCoverageState {
  const guests = input.guestTracking;
  const budget = input.budgetTracking;
  const seating = input.seatingPlan;
  const catererEstimateReady = Boolean(guests && guests.finalCountOptions.some((option) => option.budgetImpactAmount !== null));
  const householdReady = Boolean(guests && guests.householdCount > 0);
  const vendorReplyReady = hasLiveVendorReplySync(input.approvalReceipts);
  const timelineReady = hasBookedVendorTimeline(input.scheduleItems);
  const summaryReady = Boolean(guests && seating && (guests.guestRowCount > 0 || seating.guestRowsConsidered > 0));
  const items: WeddingBackgroundAutomationCoverageItem[] = [
    {
      id: "caterer_estimate_recalc",
      title: "Catering estimate updates",
      status: catererEstimateReady ? "matched" : "blocked",
      detailLabel: catererEstimateReady
        ? "Final guest-count options update the catering budget estimate."
        : "Add per-guest pricing or a selected caterer quote before RSVP changes can update catering estimates.",
      evidenceLabels: [
        guests ? `${guests.attendingCount} attending / ${guests.pendingCount} pending` : "No guest list yet",
        budget ? `${budget.projectedCount + budget.quotedCount} priced budget item(s)` : "No budget items yet",
      ],
      nextActionLabel: catererEstimateReady ? null : "Capture caterer per-head pricing or a selected caterer quote.",
    },
    {
      id: "household_invitation_inheritance",
      title: "Household invitation inheritance",
      status: householdReady ? "matched" : "blocked",
      detailLabel: householdReady
        ? "Guest rows preserve household grouping for invitation, seating, and guest-summary logic."
        : "Needs household/family grouping before new members can safely inherit invitations.",
      evidenceLabels: [guests ? `${guests.householdCount} household group(s)` : "No guest tracking evidence"],
      nextActionLabel: householdReady ? null : "Add a household/family/group column to the guest list.",
    },
    {
      id: "gmail_vendor_reply_sync",
      title: "Vendor replies from connected Gmail",
      status: vendorReplyReady ? "matched" : "blocked",
      detailLabel: vendorReplyReady
        ? "Connected email has recorded vendor replies."
        : "Connect email before the planner can watch for vendor replies.",
      evidenceLabels: vendorReplyReady ? ["Vendor email activity found"] : ["No connected email reply tracking yet"],
      nextActionLabel: vendorReplyReady ? null : "Connect email and confirm vendor replies are being saved.",
    },
    {
      id: "booked_vendor_timeline_sync",
      title: "Booked vendor times sync to day-of timeline",
      status: timelineReady ? "matched" : "blocked",
      detailLabel: timelineReady
        ? "Booked vendor arrival and departure times are in the schedule."
        : "Add booked vendor arrival and departure times before day-of timing can update automatically.",
      evidenceLabels: [timelineReady ? "Vendor arrival/departure times found" : "No booked vendor arrival/departure times yet"],
      nextActionLabel: timelineReady ? null : "Store booked vendor arrival and departure times on run-sheet schedule items.",
    },
    {
      id: "guest_seating_summary",
      title: "Attendance, meals, dietary needs, and seating summaries",
      status: summaryReady ? "differentiated" : "blocked",
      detailLabel: summaryReady
        ? "Guest and seating details can summarize attendance, meals, access needs, households, and table notes."
        : "Add guest-list and seating details before reliable summaries can be made.",
      evidenceLabels: [
        guests ? `${guests.guestRowCount} guest(s), ${guests.dietaryCount} dietary note(s), ${guests.accessibilityCount} accessibility need(s)` : "No guest list yet",
        seating ? `${seating.tableCount} table(s), ${seating.householdGroupCount} household group(s)` : "No seating plan yet",
      ],
      nextActionLabel: summaryReady ? null : "Add structured guest-list and seating-table artifacts.",
    },
  ];
  const matchedCount = items.filter((item) => item.status !== "blocked").length;
  const blockedCount = items.length - matchedCount;
  return {
    status: blockedCount === 0 ? "strong" : matchedCount > 0 ? "partial" : "blocked",
    matchedCount,
    blockedCount,
    summaryLabel: `${matchedCount}/${items.length} automatic wedding helper${items.length === 1 ? "" : "s"} ready.`,
    items,
    omnyidDifferentiatorLabels: [
      "Wedding actions stay prioritized beside the user's wider life tasks.",
      "Follow-ups we can handle cover weather, legal, contracts, vendor replies, and budget consequences.",
      "Readiness checks separate safe automation from actions that still need setup.",
      "Australian NOIM and celebrant legal timing remain first-class planning constraints.",
    ],
  };
}

export function buildWeddingBackgroundAutomationTaskItems(input: {
  backgroundAutomationCoverage?: WeddingBackgroundAutomationCoverageState | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  metadata?: unknown;
}): WeddingPlanningTaskItem[] {
  const coverage = input.backgroundAutomationCoverage;
  if (!coverage) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingAutomationTaskKeys(input.existingTaskItems ?? []);
  return coverage.items
    .filter((item) => item.status === "blocked" && item.nextActionLabel)
    .map((item): WeddingPlanningTaskItem => ({
      id: `wedding_background_automation:${safeWeddingLabel(item.id)}`,
      title: `Set up automatic helper: ${item.title}`,
      kind: taskKindForAutomation(item.id),
      dueLabel: item.id === "gmail_vendor_reply_sync" || item.id === "booked_vendor_timeline_sync"
        ? "Before claiming live vendor automation"
        : "Before relying on automated wedding summaries",
      priority: item.id === "gmail_vendor_reply_sync" ? "high" : "normal",
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        ...metadata,
        background_automation_task: true,
        background_automation_id: item.id,
        background_automation_status: item.status,
        preparation_checklist: true,
        preparation_checklist_item: `background-automation-${safeWeddingLabel(item.id)}`,
        user_selectable: true,
        can_deselect_before_commit: true,
        schedule_basis: "background_automation_gap",
        second_order_loop: item.id === "caterer_estimate_recalc" ? "budget_drift" : "contact_closure",
        second_order_evidence_labels: item.evidenceLabels,
        searchable_terms: [
          item.title,
          item.detailLabel,
          item.nextActionLabel,
          item.id,
          "background automation",
          "competitor parity",
          metadata.weddingPlanId,
          metadata.responseWorkspaceId,
          ...item.evidenceLabels,
        ].filter(Boolean),
      },
      notes: [item.detailLabel, `Next action: ${item.nextActionLabel}.`, ...item.evidenceLabels].join(" "),
    }))
    .filter((item) => {
      const metadata = item.metadata as Record<string, unknown>;
      const automationId = metadata.background_automation_id as string;
      return !existingKeys.has(item.id) && !existingKeys.has(automationId);
    });
}
