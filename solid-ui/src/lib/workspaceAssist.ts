// @locs-version: 1.0
import type { DashboardBootstrap } from "@/lib/api";
import {
  buildWorkspaceAssistCandidatesFromDashboard,
  buildWorkspaceAssistRecentTitlesFromDashboard,
  buildWorkspaceAssistSurfaceKey,
  createWorkspaceAssistRefreshCoordinator as createSharedWorkspaceAssistRefreshCoordinator,
} from "afp-ts/workspace-assistance";
import type {
  WorkspaceAssistCandidate,
  WorkspaceAssistDraftRefreshInput,
  WorkspaceAssistRefreshOrigin,
  WorkspaceAssistSurfaceKind,
} from "afp-ts/workspace-assistance";
export type {
  WorkspaceAssistDraftRefreshInput,
  WorkspaceAssistRefreshOrigin,
} from "afp-ts/workspace-assistance";
import type { ViewName } from "@/lib/viewNames";

export const WORKSPACE_ASSIST_NAVIGATION_VIEWS = [
  "home",
  "search",
  "response_queue",
  "decision_queue",
  "files",
] as const;

export type WorkspaceAssistNavigationView = (typeof WORKSPACE_ASSIST_NAVIGATION_VIEWS)[number];

export function isWorkspaceAssistNavigationView(
  value: string | null | undefined,
): value is WorkspaceAssistNavigationView {
  return Boolean(
    value
    && (WORKSPACE_ASSIST_NAVIGATION_VIEWS as readonly string[]).includes(value),
  );
}

export function workspaceAssistNavigationView(
  value: string | null | undefined,
): WorkspaceAssistNavigationView | null {
  const destination = value?.trim();
  return isWorkspaceAssistNavigationView(destination) ? destination : null;
}

export function workspaceAssistSurfaceKindFromView(view: ViewName): WorkspaceAssistSurfaceKind | null {
  if (view === "runner") return "runner";
  if (view === "email") return "email";
  if (view === "note") return "note";
  if (view === "threads") return "thread";
  return null;
}

export function workspaceAssistSurfaceRefreshKey(input: {
  view: ViewName;
  openThreadId?: string | null;
}): string | null {
  const surface = workspaceAssistSurfaceKindFromView(input.view);
  if (!surface) return null;
  return buildWorkspaceAssistSurfaceKey({
    surface,
    threadId: input.openThreadId,
  });
}

export function createWorkspaceAssistRefreshCoordinator() {
  const shared = createSharedWorkspaceAssistRefreshCoordinator();

  return {
    requestSurfaceEntry(input: {
      view: ViewName;
      openThreadId?: string | null;
      now?: number;
    }): boolean {
      const surfaceKey = workspaceAssistSurfaceRefreshKey({
        view: input.view,
        openThreadId: input.openThreadId,
      });
      return shared.requestSurfaceKeyEntry({
        surfaceKey,
        now: input.now,
      });
    },
    requestDraftChange(input: WorkspaceAssistDraftRefreshInput & { now?: number }): boolean {
      return shared.requestDraftChange(input);
    },
    resetDraftChannel(channelId: string) {
      shared.resetDraftChannel(channelId);
    },
  };
}

export function buildDashboardWorkspaceAssistRecentTitles(
  payload: DashboardBootstrap | null,
): string[] {
  return buildWorkspaceAssistRecentTitlesFromDashboard(payload);
}

export function buildDashboardWorkspaceAssistCandidates(
  payload: DashboardBootstrap | null,
  options?: {
    refreshOrigin?: WorkspaceAssistRefreshOrigin | null;
  },
): WorkspaceAssistCandidate[] {
  return buildWorkspaceAssistCandidatesFromDashboard(payload, options);
}
