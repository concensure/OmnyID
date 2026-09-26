// @locs-version: 2.0
import type {
  WeddingDecisionLoadReliefState,
  WeddingPersonalOsRankedItem,
} from "@/lib/weddingPersonalOsProjectionState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

export type WeddingDecisionFocusActionIntent = "open_item" | "explain_item" | "review_all";

function actionKindForItem(item: WeddingPersonalOsRankedItem | null): WeddingWorkspaceSidebarAction["kind"] {
  if (item?.sourceSurface === "calendar") return "open_calendar";
  if (item?.sourceSurface === "decision_queue" || item?.sourceSurface === "approval_queue") return "approve_action";
  return "open_tasks";
}

function actionLabelForKind(kind: WeddingWorkspaceSidebarAction["kind"]): string {
  if (kind === "open_calendar") return "Open Calendar";
  if (kind === "approve_action") return "Open Decision Queue";
  if (kind === "defer_decision") return "Decide Later";
  return "Open Tasks";
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
    label: actionLabelForKind(kind),
    enabled: focusItems.length > 0,
    reason: focusItems.length > 0 ? null : "No decision-heavy wedding focus items are ready yet.",
    metadata: {
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
