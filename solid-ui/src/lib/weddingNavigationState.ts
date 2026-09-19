// @locs-version: 2.0
import { customEventRecordDetail } from "@/lib/eventDetail";
import type {
  WeddingPresentationAction,
  WeddingPresentationActionKind,
} from "@/lib/weddingPresentationState";
import type {
  WeddingWorkspaceSidebarAction,
  WeddingWorkspaceSidebarActionKind,
} from "@/lib/weddingWorkspaceActionState";
import type { ViewName } from "@/lib/viewNames";

export const OPEN_WEDDING_PLANNING_INTENT_EVENT = "omnyid:open-wedding-planning-intent";

export type WeddingNavigationSurface =
  | "planning_files"
  | "continue_chat"
  | "probe"
  | "map"
  | "calendar"
  | "knowledge_graph"
  | "tasks"
  | "connected_apps"
  | "approval"
  | "export";

export type WeddingNavigationIntent = {
  view: ViewName;
  surface: WeddingNavigationSurface;
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId: string | null;
  artifactId: string | null;
  sectionId: string | null;
  notice: string;
  metadata: Record<string, unknown>;
};

const WEDDING_NAVIGATION_SURFACES = new Set<WeddingNavigationSurface>([
  "planning_files",
  "continue_chat",
  "probe",
  "map",
  "calendar",
  "knowledge_graph",
  "tasks",
  "connected_apps",
  "approval",
  "export",
]);

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isWeddingNavigationSurface(value: string): value is WeddingNavigationSurface {
  return WEDDING_NAVIGATION_SURFACES.has(value as WeddingNavigationSurface);
}

function surfaceForPresentationAction(kind: WeddingPresentationActionKind): WeddingNavigationSurface {
  if (kind === "open_planning_files") return "planning_files";
  if (kind === "continue_chat") return "continue_chat";
  if (kind === "answer_probe") return "probe";
  if (kind === "open_map") return "map";
  if (kind === "open_calendar") return "calendar";
  if (kind === "open_graph") return "knowledge_graph";
  if (kind === "open_task_list") return "tasks";
  if (kind === "approve_draft") return "approval";
  return "export";
}

function surfaceForSidebarAction(kind: WeddingWorkspaceSidebarActionKind): WeddingNavigationSurface {
  if (kind === "continue_chat") return "continue_chat";
  if (kind === "open_graph") return "knowledge_graph";
  if (kind === "open_calendar") return "calendar";
  if (kind === "open_tasks") return "tasks";
  if (kind === "open_connected_apps") return "connected_apps";
  if (kind === "approve_action") return "approval";
  return "export";
}

function viewForSurface(surface: WeddingNavigationSurface): ViewName {
  if (surface === "calendar") return "calendar";
  if (surface === "knowledge_graph") return "knowledge_graph";
  if (surface === "tasks") return "tasks";
  if (surface === "connected_apps") return "connected_apps";
  if (surface === "approval") return "decision_queue";
  if (surface === "export") return "files";
  if (surface === "map") return "search";
  if (surface === "continue_chat" || surface === "probe") return "threads";
  return "response_queue";
}

function noticeFor(surface: WeddingNavigationSurface, responseWorkspaceId: string, artifactId: string | null): string {
  if (surface === "planning_files") return `Opening wedding documents for ${responseWorkspaceId}.`;
  if (surface === "continue_chat") return `Continuing chat with wedding workspace ${responseWorkspaceId}.`;
  if (surface === "probe") return "Continuing the wedding plan with the next need-to-know question.";
  if (surface === "map") return "Opening wedding map/search context from this response.";
  if (surface === "calendar") return "Opening wedding dates in Calendar.";
  if (surface === "knowledge_graph") return "Opening wedding topology in Knowledge Graph.";
  if (surface === "tasks") return "Opening wedding tasks and critical-path items.";
  if (surface === "connected_apps") return "Opening Connected Apps for wedding provider setup.";
  if (surface === "approval") return artifactId
    ? `Opening approval review for ${artifactId}.`
    : "Opening approval review for this wedding plan.";
  return artifactId ? `Opening export options for ${artifactId}.` : "Opening wedding export options.";
}

function buildIntent(input: {
  surface: WeddingNavigationSurface;
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId?: string | null;
  artifactId?: string | null;
  sectionId?: string | null;
  metadata?: Record<string, unknown> | null;
}): WeddingNavigationIntent {
  const artifactId = clean(input.artifactId);
  const sectionId = clean(input.sectionId);
  const extraMetadata = record(input.metadata);
  return {
    view: viewForSurface(input.surface),
    surface: input.surface,
    weddingPlanId: input.weddingPlanId,
    responseWorkspaceId: input.responseWorkspaceId,
    sourceResponseId: clean(input.sourceResponseId),
    artifactId,
    sectionId,
    notice: noticeFor(input.surface, input.responseWorkspaceId, artifactId),
    metadata: {
      ...extraMetadata,
      template: "wedding_planning",
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      source_response_id: clean(input.sourceResponseId),
      artifact_id: artifactId,
      section_id: sectionId,
      surface: input.surface,
    },
  };
}

export function buildWeddingNavigationIntentFromPresentationAction(
  action: WeddingPresentationAction,
): WeddingNavigationIntent {
  return buildIntent({
    surface: surfaceForPresentationAction(action.kind),
    weddingPlanId: action.weddingPlanId,
    responseWorkspaceId: action.responseWorkspaceId,
    sourceResponseId: action.sourceResponseId,
    artifactId: action.artifactId,
    sectionId: action.sectionId,
  });
}

export function buildWeddingNavigationIntentFromSidebarAction(input: {
  action: WeddingWorkspaceSidebarAction;
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId?: string | null;
  artifactId?: string | null;
  metadata?: Record<string, unknown> | null;
}): WeddingNavigationIntent {
  return buildIntent({
    surface: surfaceForSidebarAction(input.action.kind),
    weddingPlanId: input.weddingPlanId,
    responseWorkspaceId: input.responseWorkspaceId,
    sourceResponseId: input.sourceResponseId,
    artifactId: input.artifactId,
    metadata: {
      ...(input.action.metadata ?? {}),
      ...(input.metadata ?? {}),
    },
  });
}

export function dispatchWeddingNavigationIntent(
  intent: WeddingNavigationIntent,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(OPEN_WEDDING_PLANNING_INTENT_EVENT, { detail: intent }));
}

export function normalizeWeddingNavigationIntent(value: unknown): WeddingNavigationIntent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const view = clean(raw.view);
  const surface = clean(raw.surface);
  const weddingPlanId = clean(raw.weddingPlanId);
  const responseWorkspaceId = clean(raw.responseWorkspaceId);
  if (!view || !surface || !isWeddingNavigationSurface(surface) || !weddingPlanId || !responseWorkspaceId) return null;
  return buildIntent({
    surface,
    weddingPlanId,
    responseWorkspaceId,
    sourceResponseId: clean(raw.sourceResponseId),
    artifactId: clean(raw.artifactId),
    sectionId: clean(raw.sectionId),
    metadata: record(raw.metadata),
  });
}

export function readWeddingNavigationIntentEventDetail(event: Event): WeddingNavigationIntent | null {
  return normalizeWeddingNavigationIntent(customEventRecordDetail(event));
}

export function subscribeWeddingNavigationIntent(
  callback: (intent: WeddingNavigationIntent) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readWeddingNavigationIntentEventDetail(event);
    if (detail) callback(detail);
  };
  target.addEventListener(OPEN_WEDDING_PLANNING_INTENT_EVENT, handler);
  return () => target.removeEventListener(OPEN_WEDDING_PLANNING_INTENT_EVENT, handler);
}
