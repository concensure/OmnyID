// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import { weddingPreferenceConflictLifecycleActionToAfpSendInput } from "@/lib/weddingPreferenceConflictLifecycleAfpState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

export function runWeddingPreferenceConflictLifecycleAction(input: {
  action: WeddingWorkspaceSidebarAction;
  metadata?: unknown;
  saveProjection?: ((message: SendAfpMessageInput) => Promise<unknown>) | null;
  onNotice: (notice: string) => void;
  onSaved?: (() => void) | null;
}): boolean {
  if (input.action.kind !== "record_resilience_lifecycle") return false;
  const sendInput = weddingPreferenceConflictLifecycleActionToAfpSendInput(input.action, input.metadata);
  if (!sendInput) {
    input.onNotice("This preference review could not be saved yet.");
    return true;
  }
  if (!input.saveProjection) {
    input.onNotice("Account saving is not connected, so this preference review is still open.");
    return true;
  }
  input.onNotice("Saving your preference review...");
  void input.saveProjection(sendInput)
    .then(() => {
      input.onNotice(input.action.label === "Resolved together"
        ? "Saved as resolved. No planning rule was created."
        : "Removed from this review list. It will return if the preferences change.");
      input.onSaved?.();
    })
    .catch(() => input.onNotice("This preference review could not be saved yet."));
  return true;
}
