// @locs-version: 1.0
import type { WeddingNavigationIntent } from "@/lib/weddingNavigationState";
import {
  isWeddingWorkspaceMenuId,
  type WeddingWorkspaceMenuId,
} from "@/lib/weddingWorkspaceMenuState";

export function weddingWorkspaceMenuForArrival(
  intent: WeddingNavigationIntent | null | undefined,
): WeddingWorkspaceMenuId | null {
  if (!intent || intent.view !== "response_queue") return null;
  if (intent.surface === "budget") return "budget";
  if (intent.surface === "workspace_menu") {
    const menu = intent.metadata?.wedding_workspace_menu;
    return isWeddingWorkspaceMenuId(menu) ? menu : null;
  }
  if (intent.surface === "planning_files" && intent.sourceResponseId) return "documents";
  return null;
}

export function weddingTemplateHomeResetKey(
  intent: WeddingNavigationIntent | null | undefined,
): string | null {
  if (!intent || intent.view !== "response_queue") return null;
  if (intent.surface !== "planning_files" || intent.sourceResponseId) return null;
  return `${intent.weddingPlanId}:${intent.responseWorkspaceId}`;
}
