// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import {
  isWeddingWorkspaceMenuId,
  type WeddingWorkspaceMenuId,
} from "@/lib/weddingWorkspaceMenuState";
import { weddingTimelineStatusLabel } from "@/lib/weddingTimelineDisplayState";
import {
  weddingTargetDateOrSeasonLabel,
  weddingTimelineWeddingDateLabel,
} from "@/lib/weddingTimelineWeddingDateState";

type WeddingPlanningTask = WeddingResponseWorkspaceViewState["planningTaskItems"][number];

export function currencyLabel(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "Set budget";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function weddingDayCountdownLabel(state: WeddingResponseWorkspaceViewState): string {
  const weddingDate = weddingTimelineWeddingDateLabel(state);
  if (!weddingDate) return weddingTargetDateOrSeasonLabel(state) ? "Confirm date" : "Add date";
  const weddingTime = new Date(`${weddingDate}T09:00:00.000Z`).getTime();
  if (!Number.isFinite(weddingTime)) return "Add date";
  const days = Math.ceil((weddingTime - Date.now()) / 86_400_000);
  if (days < 0) return "Passed";
  if (days === 0) return "Today";
  return String(days);
}

export function weddingDayCountdownDetail(state: WeddingResponseWorkspaceViewState): string {
  const weddingDate = weddingTimelineWeddingDateLabel(state);
  if (weddingDate) return `Wedding day: ${weddingDate}`;
  const target = weddingTargetDateOrSeasonLabel(state);
  return target ? `Target captured: ${target}. Pick the exact date to start the countdown.` : "Add the wedding date to start the countdown.";
}

export function weddingTimelineSidebarAction(
  kind: Extract<WeddingWorkspaceSidebarAction["kind"], "open_calendar" | "open_tasks">,
  state: WeddingResponseWorkspaceViewState,
  rowId?: string,
): WeddingWorkspaceSidebarAction {
  const row = rowId ? state.ganttTimeline.rows.find((item) => item.id === rowId) : null;
  const undated = rowId ? state.ganttTimeline.undatedItems.find((item) => item.id === rowId) : null;
  const selectedTitle = row?.title ?? undated?.title ?? null;
  const selectedStatus = undated ? weddingTimelineStatusLabel(undated.statusLabel) : row ? weddingTimelineStatusLabel(row.statusLabel) : null;
  const selectedBucket = row ? "dated" : undated ? selectedStatus === "Done" ? "done_or_no_date" : "no_date" : null;
  return {
    kind,
    label: kind === "open_calendar"
      ? "Open wedding calendar"
      : selectedStatus === "Done"
        ? "Open completed wedding tasks"
        : "Open wedding tasks",
    enabled: kind === "open_calendar" ? state.ganttTimeline.rows.length > 0 : true,
    reason: state.ganttTimeline.rows.length > 0 || kind === "open_tasks"
      ? null
      : "Add dated wedding tasks before opening the calendar timeline.",
    metadata: {
      wedding_timeline: {
        version: 1,
        selected_row_id: row?.id ?? undated?.id ?? null,
        selected_title: selectedTitle,
        selected_start: row?.startLabel ?? null,
        selected_end: row?.endLabel ?? null,
        selected_status: selectedStatus,
        selected_bucket: selectedBucket,
        linked_artifact_id: undated?.linkedArtifactId ?? row?.linkedArtifactId ?? null,
        dated_count: state.ganttTimeline.rows.length,
        undated_count: state.ganttTimeline.undatedItems.length,
      },
    },
    contextLabels: row
      ? [row.title, row.startLabel, row.endLabel]
      : undated
        ? [undated.title, selectedStatus ?? "Task"]
        : state.ganttTimeline.rows.slice(0, 3).map((item) => item.title),
  };
}

export function weddingTimelinePrimarySidebarAction(
  state: WeddingResponseWorkspaceViewState,
  rowId?: string | null,
): WeddingWorkspaceSidebarAction {
  return weddingTimelineSidebarAction(
    state.ganttTimeline.rows.length > 0 ? "open_calendar" : "open_tasks",
    state,
    rowId ?? undefined,
  );
}

export function weddingBudgetSidebarAction(state: WeddingResponseWorkspaceViewState): WeddingWorkspaceSidebarAction {
  return {
    kind: "open_budget",
    label: "Open wedding budget",
    enabled: true,
    reason: null,
    metadata: {
      wedding_budget: {
        version: 1,
        target_amount: state.budgetTracking.budgetTargetAmount,
        remaining_amount: state.budgetTracking.remainingAmount,
        known_amount: state.budgetTracking.totalKnownAmount,
      },
    },
    contextLabels: ["Budget", currencyLabel(state.budgetTracking.remainingAmount)],
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function taskWorkspaceMenuId(task: WeddingPlanningTask): WeddingWorkspaceMenuId | null {
  const menuId = record(task.metadata).wedding_workspace_menu;
  return typeof menuId === "string" && isWeddingWorkspaceMenuId(menuId) ? menuId : null;
}

export function weddingTaskSidebarAction(
  task: WeddingPlanningTask,
  state: WeddingResponseWorkspaceViewState,
): WeddingWorkspaceSidebarAction {
  const menuId = taskWorkspaceMenuId(task);
  if (!menuId) return weddingTimelineSidebarAction("open_tasks", state, task.id);
  const metadata = record(task.metadata);
  const label = typeof metadata.preferred_action_label === "string" && metadata.preferred_action_label.trim()
    ? metadata.preferred_action_label.trim()
    : "Open wedding section";
  return {
    kind: "open_workspace_menu",
    label,
    enabled: true,
    reason: null,
    metadata: {
      wedding_workspace_menu: menuId,
      source_task_id: task.id,
      source_task_title: task.title,
      a2ui_primary_action: typeof metadata.a2ui_primary_action === "string" ? metadata.a2ui_primary_action : null,
    },
    contextLabels: [task.title, menuId],
  };
}

export function calendarActionLabel(state: WeddingResponseWorkspaceViewState): string {
  return state.ganttTimeline.rows.length > 0 ? "Open wedding calendar" : "Pick exact wedding date";
}
