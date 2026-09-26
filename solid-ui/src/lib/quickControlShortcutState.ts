// @locs-version: 1.0
import type { ViewName } from "@/lib/viewNames";

export type QuickControlActionId =
  | "quick_model_switch"
  | "quick_thread_privacy"
  | "quick_workspace_privacy";

export type QuickControlAction = {
  id: QuickControlActionId;
  label: string;
  shortcut: string;
  menuLabel: string;
  destinationView: ViewName;
  settingsTab?: "llm" | "mcp" | "skills" | "runtime";
  requiresConfirmation: boolean;
  detail: string;
};

export const QUICK_CONTROL_ACTIONS: readonly QuickControlAction[] = [
  {
    id: "quick_model_switch",
    label: "Switch LLM model",
    shortcut: "Ctrl+Shift+M",
    menuLabel: "Switch model",
    destinationView: "agent_settings",
    settingsTab: "llm",
    requiresConfirmation: false,
    detail: "Open AI Model Config so laptop users can switch backend/model without hunting through settings.",
  },
  {
    id: "quick_thread_privacy",
    label: "Thread privacy",
    shortcut: "Ctrl+Shift+P",
    menuLabel: "Thread privacy",
    destinationView: "threads",
    requiresConfirmation: true,
    detail: "Open the current thread surface where public or unencrypted state must be confirmed explicitly.",
  },
  {
    id: "quick_workspace_privacy",
    label: "Workspace privacy",
    shortcut: "Ctrl+Shift+U",
    menuLabel: "Workspace privacy",
    destinationView: "sovereignty_audit",
    requiresConfirmation: true,
    detail: "Open the workspace privacy surface before making a workspace public or unencrypted.",
  },
];

export function quickControlActionByShortcut(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "key">): QuickControlAction | null {
  if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "m") return QUICK_CONTROL_ACTIONS[0]!;
  if (key === "p") return QUICK_CONTROL_ACTIONS[1]!;
  if (key === "u") return QUICK_CONTROL_ACTIONS[2]!;
  return null;
}

export function quickControlActionById(id: string | null | undefined): QuickControlAction | null {
  const normalized = typeof id === "string" ? id.trim() : "";
  return QUICK_CONTROL_ACTIONS.find((action) => action.id === normalized) ?? null;
}

export function quickControlLaunchNotice(action: QuickControlAction): string {
  if (action.requiresConfirmation) {
    return `${action.label} opens ${action.destinationView.replace(/_/g, " ")}. Confirm any public or unencrypted change there before it applies.`;
  }
  return `${action.label} opens ${action.destinationView.replace(/_/g, " ")}.`;
}
