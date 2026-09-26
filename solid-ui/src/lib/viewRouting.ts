// @locs-version: 1.0
import type { AfpMessage, AfpView } from "@/lib/api";
import { KNOWN_VIEW_FORMATS, pickView } from "@/lib/api";
import { uiRenderStrategyForFormat, type UiRenderStrategy } from "@/lib/uiStrategy";
import { decryptedDisplayContent } from "./decryptedDisplayState";
import { resolveMountedViewRoutingFromInputs } from "./viewRoutingState";
import { isRecord } from "./eventDetail";

export type ViewRoutingInfo = {
  chosenView: AfpView | null;
  effectiveFormat: string;
  heuristicFormat: string;
  agentDriven: boolean;
  strategy: UiRenderStrategy;
};

function messageContentRecord(message: AfpMessage): Record<string, unknown> {
  const content = decryptedDisplayContent(message);
  return isRecord(content) ? content : {};
}

function messageContentString(message: AfpMessage, key: string): string {
  const value = messageContentRecord(message)[key];
  return typeof value === "string" ? value : "";
}

export function heuristicFormat(message: AfpMessage): string {
  if (message.encryption) return "encrypted_placeholder";
  const t = message.type;
  const subtype = message.subtype ?? "";
  const kind = messageContentString(message, "kind");
  if (t === "research" || t === "search_result" || t.includes("search")) return "search_result";
  if (t === "task" && subtype === "diff") return "ledger_diff";
  if (t === "task" && (subtype === "create" || subtype === "update")) return "ledger_board";
  if (t === "task") return "task_card";
  if (t === "multi_edit") return "multi_edit";
  if (t === "shell_command") return "shell_result";
  if (t === "export_request") return "export_request";
  if (t === "export_result") return "export_result";
  if (t === "content_digest_result") return "search_result";
  if (t === "document_extract_result") return "table";
  if (t === "tabular_dataset") return "table";
  if (t === "chart_spec") return "chart_view";
  if (t.includes("email") || t.includes("inbox") || t.includes("reply")) return "email";
  if (t === "calendar" || t.includes("calendar") || t.includes("event") || t.includes("booking")) return "calendar";
  if (t === "supertag_grid") return "supertag_grid";
  if (t === "formula") return "formula";
  if (t.includes("table") || t.includes("action_log") || t.includes("database")) return "table";
  if (t.includes("canvas") || t.includes("note")) return "canvas";
  if (t.includes("attachment") || t.includes("file")) return "attachments";
  if (t.includes("approval") || t.includes("decision") || t.includes("review")) return "approvals";
  if (t === "agent" && subtype === "ui_presentation") return "ui_presentation";
  if (t === "agent" && subtype === "orchestration_card") return "generative_card";
  if (t === "agent" && subtype === "plan") return "task_card";
  if (t === "agent" && subtype === "plan_with_forks") return "task_card";
  if (t === "planning" && subtype === "result") return "planning_result";
  if (t === "image_generate" || t === "qr_generate") return "media_card";
  if (t === "agent_session") return "a2ui.v1";
  if (t === "a2ui_render") {
    const vid = messageContentString(message, "view_id");
    if (vid === "inbox_canvas") return "inbox_canvas";
    if (vid === "inbox_thread_dashboard") return "inbox_thread_dashboard";
    return "a2ui_render";
  }
  if (
    t === "agent" &&
    (subtype === "dashboard_panel" ||
      subtype === "runner_editor" ||
      subtype === "workspace_panel" ||
      subtype === "a2ui_render")
  ) return "a2ui.v1";
  if (t === "note" && (subtype === "content" || kind.includes("note"))) return "canvas";
  if (t === "calendar" && (subtype === "plan" || kind.includes("schedule"))) return "calendar";
  if (t === "research" && (subtype === "content" || kind.includes("research"))) return "search_result";
  if (t === "parsed_document") return "parsed_document";
  if (t === "transcript") return "transcript";
  if (t.includes("blueprint") || t.includes("ui")) return "ui_blueprint";
  const c = decryptedDisplayContent(message);
  if (c && typeof c === "object" && !Array.isArray(c) && ("bullets" in c || "sources" in c)) return "search_result";
  return "unknown";
}

export function resolveViewRouting(
  message: AfpMessage,
  viewOverride?: AfpView | null,
): ViewRoutingInfo {
  const chosenView = viewOverride ?? pickView(message, [...KNOWN_VIEW_FORMATS]);
  const heuristic = heuristicFormat(message);
  const resolved = resolveMountedViewRoutingFromInputs({
    chosenView,
    heuristicFormat: heuristic,
  });
  return {
    ...resolved,
    strategy: uiRenderStrategyForFormat(resolved.effectiveFormat),
  };
}

export function exportableMessageDebugPayload(
  message: AfpMessage,
  viewOverride?: AfpView | null,
  extraDebug?: Record<string, unknown>,
): Record<string, unknown> {
  const routing = resolveViewRouting(message, viewOverride);
  return {
    afp_message: message,
    render_resolution: {
      effective_format: routing.effectiveFormat,
      heuristic_format: routing.heuristicFormat,
      agent_driven: routing.agentDriven,
      chosen_view: routing.chosenView,
      strategy: {
        zone: routing.strategy.zone,
        label: routing.strategy.zoneLabel,
        description: routing.strategy.description,
      },
    },
    ...(extraDebug ? { debug_context: extraDebug } : {}),
  };
}
