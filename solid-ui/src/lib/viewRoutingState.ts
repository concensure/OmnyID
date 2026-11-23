// @locs-version: 1.0
import type { AfpView } from "./api";

function a2uiMountedViewFormat(view?: AfpView | null): string | null {
  const viewId =
    view?.content && typeof view.content === "object" && !Array.isArray(view.content)
      ? view.content["view_id"]
      : null;
  if (viewId === "inbox_canvas") return "inbox_canvas";
  if (viewId === "inbox_thread_dashboard") return "inbox_thread_dashboard";
  return null;
}

function normalizeViewRoutingFormat(format: string, view?: AfpView | null): string {
  if (format === "a2ui_render") {
    const mountedViewFormat = a2uiMountedViewFormat(view);
    if (mountedViewFormat) return mountedViewFormat;
  }
  if (format === "insight_line" || format === "action_chips" || format === "stat_row" || format === "a2ui_render") {
    return "a2ui.v1";
  }
  return format;
}

const SUPPORTED_MOUNTED_VIEW_ROUTING_FORMATS = new Set([
  "email",
  "canvas",
  "table",
  "calendar",
  "attachments",
  "approvals",
  "search_result",
  "task_card",
  "ledger_diff",
  "ledger_board",
  "multi_edit",
  "shell_result",
  "planning_result",
  "export_request",
  "export_result",
  "proactive_suggestion",
  "generative_card",
  "a2ui.v1",
  "ui_presentation",
  "rich_text",
  "inbox_canvas",
  "inbox_thread_dashboard",
  "parsed_document",
  "transcript",
  "supertag_grid",
  "ui_blueprint",
  "blueprint",
]);

export type ViewRoutingState = {
  chosenView: AfpView | null;
  effectiveFormat: string;
  heuristicFormat: string;
  agentDriven: boolean;
};

export type ViewRoutingInputs = {
  chosenView: AfpView | null;
  heuristicFormat: string;
};

export function resolveViewRoutingFromInputs(
  inputs: ViewRoutingInputs,
): ViewRoutingState {
  const chosenView = inputs.chosenView ?? null;
  const heuristicFormat = normalizeViewRoutingFormat(inputs.heuristicFormat);
  const effectiveFormat = chosenView
    ? normalizeViewRoutingFormat(chosenView.format, chosenView)
    : heuristicFormat;

  return {
    chosenView,
    effectiveFormat,
    heuristicFormat,
    agentDriven:
      Boolean(chosenView?.format)
      && normalizeViewRoutingFormat(chosenView!.format, chosenView) !== heuristicFormat,
  };
}

export function resolveMountedViewRoutingFromInputs(
  inputs: ViewRoutingInputs,
): ViewRoutingState {
  const shared = resolveViewRoutingFromInputs(inputs);
  const normalizedEffective = normalizeViewRoutingFormat(shared.effectiveFormat, shared.chosenView);
  const normalizedHeuristic = normalizeViewRoutingFormat(shared.heuristicFormat);

  if (SUPPORTED_MOUNTED_VIEW_ROUTING_FORMATS.has(normalizedEffective)) {
    return {
      chosenView: shared.chosenView,
      effectiveFormat: normalizedEffective,
      heuristicFormat: shared.heuristicFormat,
      agentDriven:
        Boolean(shared.chosenView)
        && normalizeViewRoutingFormat(shared.chosenView!.format, shared.chosenView) === normalizedEffective
        && shared.agentDriven,
    };
  }

  if (SUPPORTED_MOUNTED_VIEW_ROUTING_FORMATS.has(normalizedHeuristic)) {
    return {
      chosenView: shared.chosenView,
      effectiveFormat: normalizedHeuristic,
      heuristicFormat: shared.heuristicFormat,
      agentDriven: false,
    };
  }

  return {
    chosenView: shared.chosenView,
    effectiveFormat: "email",
    heuristicFormat: shared.heuristicFormat,
    agentDriven: false,
  };
}
