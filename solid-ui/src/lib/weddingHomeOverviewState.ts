// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingHomeOverviewActionTile = {
  id: "budget" | "guests" | "seating" | "vendors";
  valueLabel: string;
  detailLabel: string;
  supportLabel: string;
  tone: "ready" | "needs_input" | "attention" | "risk";
  toneLabel: string;
  menuId: WeddingWorkspaceMenuId;
  actionLabel: string;
  a2ui: Record<string, unknown>;
};

export type WeddingHomeTimelineOverview = {
  detailLabel: string;
  menuId: WeddingWorkspaceMenuId;
  actionLabel: string;
  selectedRowId: string | null;
  a2ui: Record<string, unknown>;
};

function currencyLabel(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "Set budget";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function finiteAmount(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rowStatusText(row: unknown): string {
  const record = row && typeof row === "object" ? row as Record<string, unknown> : {};
  return String(record.statusLabel ?? record.status ?? "").trim().toLowerCase();
}

function isDoneTimelineRow(row: unknown): boolean {
  const status = rowStatusText(row);
  return status === "done" || status === "complete" || status === "completed";
}

function dateSortValue(label: unknown): number {
  const parsed = Date.parse(String(label ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function tileA2ui(tile: Omit<WeddingHomeOverviewActionTile, "a2ui">): Record<string, unknown> {
  return {
    schema_version: "a2ui.v1",
    kind: "wedding_home_overview_tile",
    id: tile.id,
    title: tile.valueLabel,
    description: tile.detailLabel,
    support_label: tile.supportLabel,
    tone: tile.tone,
    tone_label: tile.toneLabel,
    nodes: [{
      id: `${tile.id}-open`,
      type: "action_chip",
      props: {
        label: tile.actionLabel,
        action: {
          kind: "open_wedding_menu",
          target_menu: tile.menuId,
        },
      },
    }],
  };
}

function timelineA2ui(timeline: Omit<WeddingHomeTimelineOverview, "a2ui">): Record<string, unknown> {
  return {
    schema_version: "a2ui.v1",
    kind: "wedding_home_timeline_overview",
    title: "Timeline",
    description: timeline.detailLabel,
    nodes: [{
      id: "timeline-open",
      type: "action_chip",
      props: {
        label: timeline.actionLabel,
        action: {
          kind: "open_wedding_menu",
          target_menu: timeline.menuId,
          selected_row_id: timeline.selectedRowId,
        },
      },
    }],
  };
}

export function buildWeddingHomeTimelineOverview(state: WeddingResponseWorkspaceViewState): WeddingHomeTimelineOverview {
  const upcoming = state.ganttTimeline.rows
    .filter((row) => !isDoneTimelineRow(row))
    .sort((left, right) => dateSortValue(left.endLabel) - dateSortValue(right.endLabel))[0] ?? null;
  const timeline = {
    detailLabel: upcoming ? `Next: ${upcoming.title}` : "No upcoming timeline items yet.",
    menuId: "timeline" as const,
    actionLabel: upcoming ? "Open timeline item" : "Open timeline",
    selectedRowId: upcoming?.id ?? null,
  };
  return { ...timeline, a2ui: timelineA2ui(timeline) };
}

export function buildWeddingHomeOverviewActionTiles(state: WeddingResponseWorkspaceViewState): WeddingHomeOverviewActionTile[] {
  const budget = state.budgetTracking;
  const budgetTarget = budget.budgetTargetAmount;
  const budgetInsights = budget.insights;
  const committedAmount = finiteAmount(budgetInsights?.committedAmount, finiteAmount(budget.totalKnownAmount));
  const paidAmount = finiteAmount(budgetInsights?.paidAmount);
  const estimatedAmount = finiteAmount(budgetInsights?.estimatedAmount, Math.max(0, finiteAmount(budget.totalProjectedAmount)));
  const forecastAmount = budgetInsights?.forecastAmount
    ?? (budgetTarget === null
      ? committedAmount > 0 ? committedAmount : null
      : Math.max(budgetTarget, committedAmount));
  const atRiskAmount = budgetInsights?.atRiskAmount ?? 0;
  const budgetRemaining = budget.remainingAmount;
  const budgetSupport = budgetTarget === null
    ? "Add a target, then compare committed and expected costs."
    : budgetInsights?.monthlyCashNeedsSummaryLabel
      ? budgetInsights.monthlyCashNeedsSummaryLabel
      : atRiskAmount > 0
        ? `${currencyLabel(atRiskAmount)} needs checking`
    : budgetRemaining === null
      ? "Expected final depends on remaining quotes."
      : budgetRemaining >= 0
        ? `${currencyLabel(budgetRemaining)} before forecast risk`
        : `${currencyLabel(Math.abs(budgetRemaining))} over target`;
  const budgetTone = budgetTarget === null
    ? "needs_input"
    : budgetRemaining !== null && budgetRemaining < 0
      ? "risk"
      : atRiskAmount > 0
        ? "attention"
      : "ready";
  const budgetTile = {
    id: "budget" as const,
    valueLabel: budgetTarget === null
      ? "Set budget"
      : budgetRemaining === null
        ? currencyLabel(budgetTarget)
        : budgetRemaining >= 0
          ? currencyLabel(budgetRemaining)
          : `${currencyLabel(Math.abs(budgetRemaining))} over`,
    detailLabel: `Paid ${currencyLabel(paidAmount)} - Estimated ${currencyLabel(estimatedAmount)} - Forecast ${currencyLabel(forecastAmount)}`,
    supportLabel: budgetSupport,
    tone: budgetTone as WeddingHomeOverviewActionTile["tone"],
    toneLabel: budgetTone === "needs_input" ? "Needs budget" : budgetTone === "risk" ? "Over target" : budgetTone === "attention" ? "Check risk" : "On track",
    menuId: "budget" as const,
    actionLabel: "Open budget",
  };

  const guestTracking = state.guestTracking;
  const respondedCount = guestTracking.attendingCount + guestTracking.declinedCount;
  const hasGuests = guestTracking.guestRowCount > 0;
  const guestTile = {
    id: "guests" as const,
    valueLabel: hasGuests ? `${guestTracking.guestRowCount} guests` : "Add guests",
    detailLabel: hasGuests
      ? `${respondedCount} replied - ${guestTracking.pendingCount} awaiting`
      : "Start the guest list so food, seating, and follow-ups have real numbers.",
    supportLabel: hasGuests ? `${guestTracking.attendingCount} attending` : "Open guests",
    tone: !hasGuests ? "needs_input" as const : guestTracking.pendingCount > 0 ? "attention" as const : "ready" as const,
    toneLabel: !hasGuests ? "Needs list" : guestTracking.pendingCount > 0 ? "Replies waiting" : "Replies clear",
    menuId: "guests" as const,
    actionLabel: "Open guests",
  };

  const seating = state.seatingPlan;
  const canSeatGuests = guestTracking.attendingCount > 0 || seating.assignedSeatCount > 0 || seating.unassignedAttendingCount > 0;
  const seatingTile = {
    id: "seating" as const,
    valueLabel: canSeatGuests ? `${seating.assignedSeatCount} seated` : "Plan seating",
    detailLabel: canSeatGuests
      ? `${seating.unassignedAttendingCount} still unassigned`
      : "Add attending guests first, then draft tables from the seating page.",
    supportLabel: canSeatGuests ? "Open seating" : "Add guests first",
    tone: !canSeatGuests ? "needs_input" as const : seating.unassignedAttendingCount > 0 ? "attention" as const : "ready" as const,
    toneLabel: !canSeatGuests ? "Needs guests" : seating.unassignedAttendingCount > 0 ? "Seats left" : "Seating clear",
    menuId: canSeatGuests ? "seating" as const : "guests" as const,
    actionLabel: canSeatGuests ? "Open seating" : "Open guests",
  };

  const vendorCards = state.vendorContactCards ?? [];
  const urgentVendorCount = vendorCards.filter((card) => card.tone === "urgent").length;
  const dueVendorCount = vendorCards.filter((card) => card.tone === "due").length;
  const waitingVendorCount = vendorCards.filter((card) => card.tone === "waiting").length;
  const closedVendorCount = vendorCards.filter((card) => card.tone === "closed").length;
  const vendorTile = {
    id: "vendors" as const,
    valueLabel: urgentVendorCount > 0
      ? `${urgentVendorCount} urgent`
      : dueVendorCount > 0
        ? `${dueVendorCount} due`
        : vendorCards.length > 0
          ? `${vendorCards.length} vendors`
          : "Track vendors",
    detailLabel: vendorCards.length > 0
      ? `${dueVendorCount} due - ${waitingVendorCount} waiting`
      : "Keep outreach, replies, and follow-ups in one place.",
    supportLabel: vendorCards.length > 0 ? `${closedVendorCount} closed` : "Open response queue",
    tone: urgentVendorCount > 0 ? "risk" as const : dueVendorCount > 0 ? "attention" as const : vendorCards.length > 0 ? "ready" as const : "needs_input" as const,
    toneLabel: urgentVendorCount > 0 ? "Urgent" : dueVendorCount > 0 ? "Follow up" : vendorCards.length > 0 ? "Tracked" : "Needs vendors",
    menuId: "response_queue" as const,
    actionLabel: vendorCards.length > 0 ? "Open vendor follow-ups" : "Open response queue",
  };

  return [
    { ...budgetTile, a2ui: tileA2ui(budgetTile) },
    { ...guestTile, a2ui: tileA2ui(guestTile) },
    { ...seatingTile, a2ui: tileA2ui(seatingTile) },
    { ...vendorTile, a2ui: tileA2ui(vendorTile) },
  ];
}
