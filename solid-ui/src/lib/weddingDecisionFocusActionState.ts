// @locs-version: 2.0
import type {
  WeddingDecisionLoadReliefState,
  WeddingPersonalOsRankedItem,
} from "@/lib/weddingPersonalOsProjectionState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

function actionKindForItem(item: WeddingPersonalOsRankedItem | null): WeddingWorkspaceSidebarAction["kind"] {
  if (item?.sourceSurface === "calendar") return "open_calendar";
  if (item?.sourceSurface === "decision_queue" || item?.sourceSurface === "approval_queue") return "approve_action";
  return "open_tasks";
}

function actionLabelForKind(kind: WeddingWorkspaceSidebarAction["kind"]): string {
  if (kind === "open_calendar") return "Open Calendar";
  if (kind === "approve_action") return "Open Decision Queue";
  return "Open Tasks";
}

export function buildWeddingDecisionFocusSidebarAction(
  state: Pick<WeddingDecisionLoadReliefState, "summaryLabel" | "backlogCount" | "focusItems">,
): WeddingWorkspaceSidebarAction {
  const focusItems = state.focusItems ?? [];
  const top = focusItems[0] ?? null;
  const kind = actionKindForItem(top);
  return {
    kind,
    label: actionLabelForKind(kind),
    enabled: focusItems.length > 0,
    reason: focusItems.length > 0 ? null : "No decision-heavy wedding focus items are ready yet.",
    metadata: {
      decision_focus: {
        version: 1,
        summary_label: state.summaryLabel,
        backlog_count: state.backlogCount,
        top_source_surface: top?.sourceSurface ?? null,
        focus_items: focusItems.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          pressure_family: item.pressureFamily,
          source_surface: item.sourceSurface,
          due_label: item.dueLabel,
          evidence_labels: item.evidenceLabels,
        })),
      },
    },
    contextLabels: focusItems.map((item) => item.title).slice(0, 3),
  };
}
