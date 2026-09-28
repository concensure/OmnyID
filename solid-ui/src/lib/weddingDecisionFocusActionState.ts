// @locs-version: 2.0
import type {
  WeddingDecisionLoadReliefState,
  WeddingPersonalOsRankedItem,
} from "@/lib/weddingPersonalOsProjectionState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import { isWeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingDecisionFocusActionIntent = "open_item" | "explain_item" | "review_all";

function actionKindForItem(item: WeddingPersonalOsRankedItem | null): WeddingWorkspaceSidebarAction["kind"] {
  if (item?.sourceSurface === "calendar") return "open_calendar";
  if (item?.sourceSurface === "decision_queue" || item?.sourceSurface === "approval_queue") return "approve_action";
  if (item?.sourceSurface === "tasks" && item.linkedArtifactId && isWeddingWorkspaceMenuId(item.workspaceMenu)) return "open_workspace_menu";
  if (item?.sourceSurface === "tasks" && isWeddingWorkspaceMenuId(item.workspaceMenu) && item.actionMetadata?.vendor_lead_time_research_task === true) return "open_workspace_menu";
  return "open_tasks";
}

function actionLabelForItem(item: WeddingPersonalOsRankedItem | null): string {
  if (item?.sourceSurface === "calendar") return "Open date";
  if (item?.sourceSurface === "approval_queue") return "Review approval";
  if (item?.sourceSurface === "decision_queue") return "Choose option";
  if (item?.sourceSurface === "tasks" && isWeddingWorkspaceMenuId(item.workspaceMenu) && item.actionMetadata?.vendor_lead_time_research_task === true) return "Research this";
  if (item?.sourceSurface === "tasks" && item.linkedArtifactId && isWeddingWorkspaceMenuId(item.workspaceMenu)) {
    return item.evidenceLabels.some((label) => /top-three vendor comparison/i.test(label)) ? "Open comparison" : "Open file";
  }
  return "Open task";
}

export function buildWeddingDecisionFocusSidebarAction(
  state: Pick<WeddingDecisionLoadReliefState, "summaryLabel" | "backlogCount" | "focusItems">,
  intent: WeddingDecisionFocusActionIntent = "open_item",
): WeddingWorkspaceSidebarAction {
  const focusItems = state.focusItems ?? [];
  const top = focusItems[0] ?? null;
  const kind = actionKindForItem(top);
  return {
    kind,
    label: actionLabelForItem(top),
    enabled: focusItems.length > 0,
    reason: focusItems.length > 0 ? null : "No decision-heavy wedding focus items are ready yet.",
    metadata: {
      ...(top?.linkedArtifactId ? { linked_artifact_id: top.linkedArtifactId } : {}),
      ...(isWeddingWorkspaceMenuId(top?.workspaceMenu) ? { wedding_workspace_menu: top?.workspaceMenu } : {}),
      ...(top?.actionMetadata ?? {}),
      decision_focus: {
        version: 1,
        intent,
        summary_label: state.summaryLabel,
        backlog_count: state.backlogCount,
        top_source_surface: top?.sourceSurface ?? null,
        explanation: intent === "explain_item" ? top?.explanation ?? null : null,
        focus_items: focusItems.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          pressure_family: item.pressureFamily,
          source_surface: item.sourceSurface,
          due_label: item.dueLabel,
          linked_artifact_id: item.linkedArtifactId ?? null,
          wedding_workspace_menu: isWeddingWorkspaceMenuId(item.workspaceMenu) ? item.workspaceMenu : null,
          action_metadata: item.actionMetadata ?? null,
          evidence_labels: item.evidenceLabels,
        })),
      },
    },
    contextLabels: focusItems.map((item) => item.title).slice(0, 3),
  };
}

export function buildWeddingDecisionDeferSidebarAction(
  item: WeddingPersonalOsRankedItem,
): WeddingWorkspaceSidebarAction {
  return {
    kind: "defer_decision",
    label: "Decide Later",
    enabled: true,
    reason: null,
    metadata: {
      decision_deferral: {
        version: 1,
        id: item.id,
        kind: item.kind,
        title: item.title,
        pressure_family: item.pressureFamily,
        source_surface: item.sourceSurface,
        due_label: item.dueLabel,
        due_at: item.dueAt,
        explanation: item.explanation,
        evidence_labels: item.evidenceLabels,
        requested_state: "deferred",
        user_reason: "The couple chose Decide later from the wedding attention list.",
        resurface_policy: "Bring this back before the due date, after 7 days, or when the evidence changes.",
      },
    },
    contextLabels: [item.title, item.dueLabel ?? "No date yet"].filter(Boolean),
  };
}
