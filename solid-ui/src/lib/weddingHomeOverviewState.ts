// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import { weddingDayCountdownLabel } from "@/lib/weddingWorkspaceSidebarActionState";
import { weddingTimelineWeddingDateLabel } from "@/lib/weddingTimelineWeddingDateState";

export type WeddingHomeStatusTone = "good" | "attention" | "risk";

export type WeddingHomeStatusMetric = {
  id: string;
  label: string;
  value: string;
  tone: WeddingHomeStatusTone;
  menuId: WeddingWorkspaceMenuId;
};

export type WeddingHomeStatusState = {
  title: string;
  detail: string;
  tone: WeddingHomeStatusTone;
  actionLabel: string;
  menuId: WeddingWorkspaceMenuId;
  metrics: WeddingHomeStatusMetric[];
  a2ui: Record<string, unknown>;
};

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

export type WeddingHomePlanningProgress = {
  completedCount: number;
  totalCount: number;
  percentage: number;
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

function optionalArray<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function firstPlanningContextText(
  state: WeddingResponseWorkspaceViewState,
  key: "budgetComfort" | "guestCount" | "location",
): string {
  for (const card of state.contextCards ?? []) {
    const value = card.planningContext?.[key];
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function homeStatusA2ui(state: Omit<WeddingHomeStatusState, "a2ui">): Record<string, unknown> {
  return {
    schema_version: "a2ui.v1",
    kind: "wedding_home_status",
    title: state.title,
    description: state.detail,
    tone: state.tone,
    metrics: state.metrics.map((metric) => ({
      id: metric.id,
      label: metric.label,
      value: metric.value,
      tone: metric.tone,
      action: {
        kind: "open_wedding_menu",
        target_menu: metric.menuId,
      },
    })),
    primary_action: {
      label: state.actionLabel,
      kind: "open_wedding_menu",
      target_menu: state.menuId,
    },
  };
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
  const setup = weddingTimelineWeddingDateLabel(state) === null
    ? {
      detailLabel: "Next: Add your wedding date",
      menuId: "timeline" as const,
      actionLabel: "Add wedding date",
      selectedRowId: null,
    }
    : state.budgetTracking.budgetTargetAmount === null
      ? {
        detailLabel: "Next: Set a wedding budget",
        menuId: "budget" as const,
        actionLabel: "Set budget",
        selectedRowId: null,
      }
      : state.guestTracking.guestRowCount === 0
        ? {
          detailLabel: "Next: Start the guest list",
          menuId: "guests" as const,
          actionLabel: "Add guests",
          selectedRowId: null,
        }
        : null;
  if (setup) return { ...setup, a2ui: timelineA2ui(setup) };

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

export function buildWeddingHomePlanningProgress(state: WeddingResponseWorkspaceViewState): WeddingHomePlanningProgress {
  const tasks = optionalArray(state.planningTaskItems);
  const completedCount = tasks.filter(isDoneTimelineRow).length;
  const totalCount = tasks.length;
  return {
    completedCount,
    totalCount,
    percentage: totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100),
  };
}

export function buildWeddingHomeStatusState(state: WeddingResponseWorkspaceViewState): WeddingHomeStatusState {
  const tiles = buildWeddingHomeOverviewActionTiles(state);
  const budget = tiles.find((tile) => tile.id === "budget") ?? null;
  const guests = tiles.find((tile) => tile.id === "guests") ?? null;
  const vendors = tiles.find((tile) => tile.id === "vendors") ?? null;
  const location = firstPlanningContextText(state, "location");
  const openTasks = optionalArray(state.planningTaskItems).filter((task) => !isDoneTimelineRow(task)).length;
  const urgentChanges = state.resilience?.hasUrgentItem === true;
  const hasExactWeddingDate = weddingTimelineWeddingDateLabel(state) !== null;
  const urgentVendorCount = optionalArray(state.vendorContactCards).filter((card) => card.tone === "urgent").length;
  const budgetRisk = budget?.tone === "risk";
  const needsInput = tiles.some((tile) => tile.tone === "needs_input");
  const attentionCount = tiles.filter((tile) => tile.tone === "attention" || tile.tone === "risk").length
    + (state.resilience?.cards?.length ?? 0)
    + urgentVendorCount;
  const tone: WeddingHomeStatusTone = urgentChanges || budgetRisk || urgentVendorCount > 0
    ? "risk"
    : needsInput || attentionCount > 0
      ? "attention"
      : "good";
  const title = tone === "risk"
    ? "One thing needs attention before the plan narrows"
    : tone === "attention"
      ? "Your wedding plan has a clear next step"
      : "Your wedding plan is moving cleanly";
  const detailParts = [
    budget ? `Budget: ${budget.valueLabel}` : null,
    guests ? `Guests: ${guests.valueLabel}` : null,
    location ? `Location: ${location}` : null,
    `Date: ${weddingDayCountdownLabel(state)}`,
    openTasks > 0 ? `${openTasks} open task${openTasks === 1 ? "" : "s"}` : null,
  ].filter((part): part is string => Boolean(part));
  const actionTile = urgentChanges
    ? vendors ?? budget ?? guests
    : !hasExactWeddingDate
      ? null
    : budget?.tone === "needs_input" || budget?.tone === "risk"
      ? budget
      : guests?.tone === "needs_input" || guests?.tone === "attention"
        ? guests
        : vendors?.tone === "risk" || vendors?.tone === "attention"
          ? vendors
          : null;
  const actionLabel = !urgentChanges && !hasExactWeddingDate
    ? weddingDayCountdownLabel(state) === "Confirm date" ? "Pick exact date" : "Add wedding date"
    : actionTile?.actionLabel ?? (tone === "good" ? "Open plan" : "Review next step");
  const menuId = !urgentChanges && !hasExactWeddingDate
    ? "timeline"
    : actionTile?.menuId ?? "plan";
  const metrics: WeddingHomeStatusMetric[] = [
    {
      id: "date",
      label: "Wedding date",
      value: weddingDayCountdownLabel(state),
      tone: hasExactWeddingDate ? "good" : "attention",
      menuId: "timeline",
    },
    budget ? {
      id: "budget",
      label: "Budget",
      value: budget.valueLabel,
      tone: budget.tone === "risk" ? "risk" : budget.tone === "ready" ? "good" : "attention",
      menuId: budget.menuId,
    } : null,
    guests ? {
      id: "guests",
      label: "Guests",
      value: guests.valueLabel,
      tone: guests.tone === "risk" ? "risk" : guests.tone === "ready" ? "good" : "attention",
      menuId: guests.menuId,
    } : null,
    location ? {
      id: "location",
      label: "Location",
      value: location,
      tone: "good" as const,
      menuId: "plan" as const,
    } : null,
    {
      id: "tasks",
      label: "Open tasks",
      value: String(openTasks),
      tone: openTasks > 0 ? "attention" : "good",
      menuId: "helpers",
    },
  ].filter((metric): metric is WeddingHomeStatusMetric => metric !== null);
  const result = {
    title,
    detail: detailParts.join(" - "),
    tone,
    actionLabel,
    menuId,
    metrics,
  };
  return { ...result, a2ui: homeStatusA2ui(result) };
}

export function buildWeddingHomeOverviewActionTiles(state: WeddingResponseWorkspaceViewState): WeddingHomeOverviewActionTile[] {
  const budget = state.budgetTracking;
  const intakeBudgetComfort = firstPlanningContextText(state, "budgetComfort");
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
    ? intakeBudgetComfort
      ? "Open budget to set a numeric target."
      : "Add a target, then compare committed and expected costs."
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
      ? intakeBudgetComfort ? "Budget noted" : "—"
      : budgetRemaining === null
        ? currencyLabel(budgetTarget)
        : budgetRemaining >= 0
          ? currencyLabel(budgetRemaining)
          : `${currencyLabel(Math.abs(budgetRemaining))} over`,
    detailLabel: budgetTarget === null && intakeBudgetComfort
      ? `Intake: ${intakeBudgetComfort}`
      : `Paid ${currencyLabel(paidAmount)} - Estimated ${currencyLabel(estimatedAmount)} - Forecast ${currencyLabel(forecastAmount)}`,
    supportLabel: budgetSupport,
    tone: budgetTone as WeddingHomeOverviewActionTile["tone"],
    toneLabel: budgetTone === "needs_input" ? intakeBudgetComfort ? "Needs target" : "Action needed" : budgetTone === "risk" ? "Over target" : budgetTone === "attention" ? "In progress" : "On track",
    menuId: "budget" as const,
    actionLabel: budgetTarget === null ? "Add budget" : "Open budget",
  };

  const guestTracking = state.guestTracking;
  const intakeGuestCount = firstPlanningContextText(state, "guestCount");
  const responseSummary = guestTracking.rsvpResponseSummary;
  const respondedCount = responseSummary?.repliedCount ?? guestTracking.attendingCount + guestTracking.declinedCount;
  const awaitingCount = responseSummary?.awaitingCount ?? guestTracking.pendingCount;
  const incompleteCount = responseSummary?.incompleteCount ?? 0;
  const changedCount = responseSummary?.changedCount ?? 0;
  const hasGuests = guestTracking.guestRowCount > 0;
  const guestTile = {
    id: "guests" as const,
    valueLabel: hasGuests ? `${guestTracking.guestRowCount}` : intakeGuestCount ? `${intakeGuestCount}` : "—",
    detailLabel: hasGuests
      ? `${respondedCount} replied - ${awaitingCount} awaiting${incompleteCount > 0 ? ` - ${incompleteCount} need details` : ""}`
      : intakeGuestCount
        ? "Guest count captured from intake; make the guest list next."
        : "Add guests to unlock catering and seating.",
    supportLabel: hasGuests
      ? `${guestTracking.attendingCount} attending${changedCount > 0 ? ` - ${changedCount} changed` : ""}`
      : intakeGuestCount ? "Open guests to build list" : "Open guests",
    tone: !hasGuests ? intakeGuestCount ? "attention" as const : "needs_input" as const : awaitingCount > 0 || incompleteCount > 0 || changedCount > 0 ? "attention" as const : "ready" as const,
    toneLabel: !hasGuests ? intakeGuestCount ? "In progress" : "Action needed" : awaitingCount > 0 || incompleteCount > 0 || changedCount > 0 ? "In progress" : "On track",
    menuId: "guests" as const,
    actionLabel: hasGuests ? "Open guests" : "Add guests",
  };

  const seating = state.seatingPlan;
  const canSeatGuests = guestTracking.guestRowCount > 0 || guestTracking.attendingCount > 0 || seating.assignedSeatCount > 0 || seating.unassignedAttendingCount > 0;
  const seatingTile = {
    id: "seating" as const,
    valueLabel: canSeatGuests ? `${seating.assignedSeatCount}` : "—",
    detailLabel: canSeatGuests
      ? `${seating.unassignedAttendingCount} still unassigned`
      : "Needs your guest list first.",
    supportLabel: canSeatGuests ? "Open seating" : "Unlock by adding guests",
    tone: !canSeatGuests ? "needs_input" as const : seating.unassignedAttendingCount > 0 ? "attention" as const : "ready" as const,
    toneLabel: !canSeatGuests ? "Locked" : seating.unassignedAttendingCount > 0 ? "In progress" : "On track",
    menuId: canSeatGuests ? "seating" as const : "guests" as const,
    actionLabel: canSeatGuests ? "Open seating" : "Add guests to unlock",
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
          : "0",
    detailLabel: vendorCards.length > 0
      ? `${dueVendorCount} due - ${waitingVendorCount} waiting`
      : "Saved vendors and replies live here.",
    supportLabel: vendorCards.length > 0 ? `${closedVendorCount} closed` : "Open vendor tracking",
    tone: urgentVendorCount > 0 ? "risk" as const : dueVendorCount > 0 ? "attention" as const : vendorCards.length > 0 ? "ready" as const : "needs_input" as const,
    toneLabel: urgentVendorCount > 0 ? "Action needed" : dueVendorCount > 0 ? "In progress" : vendorCards.length > 0 ? "On track" : "Action needed",
    // Wedding vendor replies are represented by the wedding home follow-up
    // panel, not the unrelated, general-purpose Response Queue.
    menuId: "home" as const,
    actionLabel: vendorCards.length > 0 ? "Open vendor follow-ups" : "Track vendors",
  };

  return [
    { ...budgetTile, a2ui: tileA2ui(budgetTile) },
    { ...guestTile, a2ui: tileA2ui(guestTile) },
    { ...seatingTile, a2ui: tileA2ui(seatingTile) },
    { ...vendorTile, a2ui: tileA2ui(vendorTile) },
  ];
}
