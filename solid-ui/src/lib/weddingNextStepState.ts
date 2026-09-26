// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import { weddingTimelineWeddingDateLabel } from "@/lib/weddingTimelineWeddingDateState";

export type WeddingNextStepPriority =
  | "wedding_date"
  | "budget"
  | "guests"
  | "vendor_follow_up"
  | "seating"
  | "helpers"
  | "inspiration_storage"
  | "on_track";

export type WeddingNextStepViewState = {
  priority: WeddingNextStepPriority;
  title: string;
  detail: string;
  actionLabel: string;
  menuId: WeddingWorkspaceMenuId;
  secondaryLabels: string[];
  a2ui: Record<string, unknown>;
};

function currencyLabel(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "not set";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function daysLabel(state: WeddingResponseWorkspaceViewState): string {
  const dateLabel = weddingTimelineWeddingDateLabel(state);
  if (!dateLabel) return "date not set";
  const time = new Date(`${dateLabel}T09:00:00.000Z`).getTime();
  if (!Number.isFinite(time)) return dateLabel;
  const days = Math.ceil((time - Date.now()) / 86_400_000);
  if (days < 0) return "date passed";
  if (days === 0) return "today";
  return `${days} days`;
}

function buildA2ui(input: Omit<WeddingNextStepViewState, "a2ui">): Record<string, unknown> {
  return {
    schema_version: "a2ui.v1",
    kind: "wedding_next_step",
    title: input.title,
    description: input.detail,
    layout: { type: "stack", gap: "md" },
    nodes: [
      {
        id: "wedding-next-step-callout",
        type: "callout",
        props: {
          tone: input.priority === "on_track" ? "success" : "info",
          title: input.title,
          body: input.detail,
        },
      },
      {
        id: "wedding-next-step-context",
        type: "bullet_list",
        props: {
          title: "Why this is next",
          items: input.secondaryLabels,
        },
      },
      {
        id: "wedding-next-step-action",
        type: "action_chips",
        props: {
          action_chips: [input.actionLabel],
          labels: [input.actionLabel],
          actions: [{
            label: input.actionLabel,
            kind: "open_wedding_menu",
            target_menu: input.menuId,
          }],
        },
      },
    ],
  };
}

export function buildWeddingNextStepState(state: WeddingResponseWorkspaceViewState): WeddingNextStepViewState {
  const guestCount = state.guestTracking.guestRowCount;
  const respondedCount = state.guestTracking.attendingCount + state.guestTracking.declinedCount;
  const hasWeddingDate = weddingTimelineWeddingDateLabel(state) !== null;
  const budgetTarget = state.budgetTracking.budgetTargetAmount;
  const openTasks = state.planningTaskItems.filter((task) => {
    const status = (task.reviewStatus ?? task.approvalState ?? "").toLowerCase();
    return status !== "done" && status !== "complete" && status !== "completed";
  });
  const assignedTaskCount = openTasks.filter((task) => typeof task.assignee === "string" && task.assignee.trim().length > 0).length;
  const vendorsNeedingAction = state.vendorContactCards.filter((card) => card.tone === "urgent" || card.tone === "due");

  const baseLabels = [
    `Budget left: ${currencyLabel(state.budgetTracking.remainingAmount)}`,
    `Guests: ${respondedCount} of ${guestCount} replied`,
    `Wedding date: ${daysLabel(state)}`,
  ];

  const make = (input: Omit<WeddingNextStepViewState, "a2ui">): WeddingNextStepViewState => ({
    ...input,
    a2ui: buildA2ui(input),
  });

  if (!hasWeddingDate) {
    return make({
      priority: "wedding_date",
      title: "Add the wedding date first",
      detail: "Once the date is known, OmnyID can place legal deadlines, payment reminders, and vendor follow-ups on the timeline.",
      actionLabel: "Open plan",
      menuId: "plan",
      secondaryLabels: ["Calendar and reminders need a date.", ...baseLabels.slice(0, 2)],
    });
  }
  if (budgetTarget === null) {
    return make({
      priority: "budget",
      title: "Set the overall budget",
      detail: "A budget lets the planner show what is safe, what is tight, and which vendor choices could make later costs unaffordable.",
      actionLabel: "Open budget",
      menuId: "budget",
      secondaryLabels: ["Budget is not set yet.", ...baseLabels.filter((label) => !label.startsWith("Budget"))],
    });
  }
  if (guestCount === 0) {
    return make({
      priority: "guests",
      title: "Start the guest list",
      detail: "Add guests or import a list so seating, catering estimates, family rules, and RSVP follow-ups have real numbers to work from.",
      actionLabel: "Open people",
      menuId: "people",
      secondaryLabels: ["No guests are saved yet.", `Budget left: ${currencyLabel(state.budgetTracking.remainingAmount)}`],
    });
  }
  if (vendorsNeedingAction.length > 0) {
    return make({
      priority: "vendor_follow_up",
      title: "Review vendor follow-ups",
      detail: "Some vendors need a reply, a follow-up, or a clear next step so outreach does not stall.",
      actionLabel: "Open plan",
      menuId: "plan",
      secondaryLabels: [
        `${vendorsNeedingAction.length} vendor${vendorsNeedingAction.length === 1 ? "" : "s"} need attention.`,
        ...vendorsNeedingAction.slice(0, 2).map((card) => `${card.vendorName}: ${card.statusLabel}`),
      ],
    });
  }
  if (state.seatingPlan.unassignedAttendingCount > 0 && state.seatingPlan.assignedSeatCount === 0) {
    return make({
      priority: "seating",
      title: "Draft the first seating plan",
      detail: "Use the attending guests to start table groups, accessibility notes, and vendor meal counts.",
      actionLabel: "Open people",
      menuId: "people",
      secondaryLabels: [`${state.seatingPlan.unassignedAttendingCount} attending guests are not seated yet.`, ...baseLabels.slice(0, 2)],
    });
  }
  if (openTasks.length > 0 && assignedTaskCount === 0) {
    return make({
      priority: "helpers",
      title: "Choose who is helping",
      detail: "Assigning owners makes the plan easier to share and prevents one person carrying all open tasks.",
      actionLabel: "Open who helps",
      menuId: "helpers",
      secondaryLabels: [`${openTasks.length} open tasks need an owner.`, "Helpers can be partners, family, bridal party, or a coordinator."],
    });
  }
  if (state.inspiration.unsavedOriginalFileCount > 0) {
    return make({
      priority: "inspiration_storage",
      title: "Save inspiration originals",
      detail: "Your inspiration is understood as planning clues. Save the original files too, so you can reopen them later.",
      actionLabel: "Open inspiration",
      menuId: "inspiration",
      secondaryLabels: [
        state.inspiration.originalFileStatusLabel,
        "This keeps images, screenshots, PDFs, and notes useful after OmnyID has organized them.",
      ],
    });
  }
  return make({
    priority: "on_track",
    title: "You have a workable plan",
    detail: "Keep reviewing the next decisions, follow-ups, and dates. OmnyID will keep surfacing the next item as the plan changes.",
    actionLabel: "Open plan",
    menuId: "plan",
    secondaryLabels: baseLabels,
  });
}
