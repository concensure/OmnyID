// @locs-version: 1.0
import type { WeddingSeatingPlanState } from "@/lib/weddingSeatingPlanState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

export function buildWeddingSeatingDraftSidebarAction(
  seatingPlan: WeddingSeatingPlanState,
): WeddingWorkspaceSidebarAction {
  const canDraft = seatingPlan.guestRowsConsidered > 0;
  return {
    kind: "open_tasks",
    label: canDraft ? "Draft seating plan" : "Add attending guests",
    enabled: true,
    reason: canDraft
      ? null
      : "Add attending guests before drafting a seating plan.",
    metadata: {
      wedding_seating_draft: {
        version: 1,
        guest_rows_considered: seatingPlan.guestRowsConsidered,
        assigned_seat_count: seatingPlan.assignedSeatCount,
        unassigned_attending_count: seatingPlan.unassignedAttendingCount,
        suggested_table_count: seatingPlan.suggestedTableCount,
        household_group_count: seatingPlan.householdGroupCount,
        status_label: seatingPlan.statusLabel,
      },
    },
    contextLabels: [
      "Seating plan",
      `${seatingPlan.guestRowsConsidered} attending guest${seatingPlan.guestRowsConsidered === 1 ? "" : "s"}`,
      `${seatingPlan.suggestedTableCount} suggested table${seatingPlan.suggestedTableCount === 1 ? "" : "s"}`,
    ],
  };
}
