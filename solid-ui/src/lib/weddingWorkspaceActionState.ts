// @locs-version: 2.0
export type WeddingWorkspaceSidebarActionKind =
  | "continue_chat"
  | "open_graph"
  | "open_calendar"
  | "open_tasks"
  | "open_connected_apps"
  | "export_bundle"
  | "approve_action";

export type WeddingWorkspaceSidebarAction = {
  kind: WeddingWorkspaceSidebarActionKind;
  label: string;
  enabled: boolean;
  reason: string | null;
  metadata?: Record<string, unknown>;
  contextLabels?: string[];
};
