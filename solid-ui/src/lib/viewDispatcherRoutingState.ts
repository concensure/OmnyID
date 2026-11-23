// @locs-version: 1.0
import type { AfpView } from "./api";

export const SUPPORTED_VIEW_DISPATCHER_FORMATS = new Set([
  "encrypted_placeholder",
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

export type ViewDispatcherRoutingInfo = {
  chosenView: AfpView | null;
  effectiveFormat: string;
  agentDriven: boolean;
};

export type ViewDispatcherRoutingInputs = {
  chosenView: AfpView | null;
  effectiveFormat: string;
  heuristicFormat: string;
  agentDriven: boolean;
  encrypted?: boolean;
};

function a2uiMountedViewFormat(view?: AfpView | null): string | null {
  const viewId =
    view?.content && typeof view.content === "object" && !Array.isArray(view.content)
      ? view.content["view_id"]
      : null;
  if (viewId === "inbox_canvas") return "inbox_canvas";
  if (viewId === "inbox_thread_dashboard") return "inbox_thread_dashboard";
  return null;
}

export function normalizeViewDispatcherFormat(format: string, view?: AfpView | null): string {
  if (format === "a2ui_render") {
    const mountedViewFormat = a2uiMountedViewFormat(view);
    if (mountedViewFormat) return mountedViewFormat;
  }
  if (format === "insight_line" || format === "action_chips" || format === "stat_row" || format === "a2ui_render") {
    return "a2ui.v1";
  }
  return format;
}

export function resolveViewDispatcherRoutingFromInputs(
  inputs: ViewDispatcherRoutingInputs,
): ViewDispatcherRoutingInfo {
  if (inputs.encrypted) {
    return { chosenView: null, effectiveFormat: "encrypted_placeholder", agentDriven: false };
  }
  const chosenView = inputs.chosenView ?? null;
  const normalizedEffective = normalizeViewDispatcherFormat(inputs.effectiveFormat, chosenView);
  const normalizedHeuristic = normalizeViewDispatcherFormat(inputs.heuristicFormat);

  if (SUPPORTED_VIEW_DISPATCHER_FORMATS.has(normalizedEffective)) {
    const agentDriven =
      Boolean(chosenView)
      && chosenView !== null
      && normalizeViewDispatcherFormat(chosenView.format, chosenView) === normalizedEffective
      && inputs.agentDriven;
    return { chosenView, effectiveFormat: normalizedEffective, agentDriven };
  }

  if (SUPPORTED_VIEW_DISPATCHER_FORMATS.has(normalizedHeuristic)) {
    return { chosenView, effectiveFormat: normalizedHeuristic, agentDriven: false };
  }

  return { chosenView, effectiveFormat: "email", agentDriven: false };
}
