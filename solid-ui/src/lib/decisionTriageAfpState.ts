// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import type { FocusDeckItem } from "@/lib/mobileFocusHomeState";

export type DecisionTriageAction = "approve" | "defer" | "undo";
export function decisionTriageToAfpSendInput(input: {
  action: DecisionTriageAction;
  item: FocusDeckItem;
  deckPosition: number;
  deckSize: number;
  inputMethod: "swipe" | "button" | "keyboard";
  deferredUntilAt?: string | null;
  parentId?: string | null;
  userId?: string | null;
}, nowIso = new Date().toISOString()): SendAfpMessageInput {
  const action = input.action;
  const threadId = `decision_triage:${input.userId?.trim() || "home"}`;
  const parentId = action === "undo" ? input.parentId?.trim() || undefined : undefined;
  return {
    thread_id: threadId,
    parent_id: parentId,
    from: input.userId?.trim() ? `user://${input.userId.trim()}` : "user://local",
    to: input.item.kind === "decision" ? ["agent://decision-queue", "agent://wedding-planning"] : ["agent://decision-queue"],
    timestamp: nowIso,
    type: "ledger",
    kind: "decision_triage",
    subtype: "decision_triage",
    supertags: ["decisionos", "decision:triage", `triage:${action}`, `source_surface:${input.item.sourceSurface}`],
    content: {
      kind: "decision_triage", triage_action: action, item_id: input.item.id, item_kind: input.item.kind,
      source_surface: input.item.sourceSurface, deck_position: input.deckPosition, deck_size: input.deckSize,
      input_method: input.inputMethod, deferred_until_at: input.deferredUntilAt ?? null,
    },
    metadata: { store: true, origin: "mobile_focus_home", privacy: "minimised" },
    views: [{ format: "a2ui", priority: 1, content: { kind: "decision_triage", title: "Decision updated", summary: action === "defer" ? "Saved for later" : action === "undo" ? "Decision restored" : "Recommendation accepted" } }],
    attachments: [], references: [], store_in_relational: true,
  };
}
