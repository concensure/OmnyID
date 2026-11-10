// @locs-version: 1.0
export const VIEW_NAMES = [
  "home",
  "search",
  "threads",
  "workflows",
  "email",
  "study",
  "note",
  "calendar",
  "database",
  "templates",
  "runner",
  "agent_settings",
  "diary",
  "discover",
  "cofounder_studio",
  "space_feed",
  "public_feed",
  "knowledge_graph",
  "reports",
  "sovereignty_audit",
  "contacts",
  "connected_apps",
  "decision_queue",
  "response_queue",
  "tasks",
  "cost_dashboard",
  "admin_dashboard",
  "tools",
  "pulse",
  "goals",
  "a2ui_card",
  "para",
  "files",
] as const;

export type ViewName = (typeof VIEW_NAMES)[number];

export function isViewName(value: string): value is ViewName {
  return (VIEW_NAMES as readonly string[]).includes(value);
}

export function normalizeViewName(value: string | null | undefined): ViewName | null {
  const view = value?.trim();
  return view && isViewName(view) ? view : null;
}
