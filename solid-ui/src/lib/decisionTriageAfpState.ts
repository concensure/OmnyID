// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import type { FocusDeckItem } from "@/lib/mobileFocusHomeState";

export type DecisionTriageAction = "approve" | "defer" | "undo";

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// The authenticated AFP endpoint accepts ULID-shaped message and thread IDs.
// Keep the human-readable triage scope as metadata, but derive a stable
// transport thread ID so each account's triage history stays together.
function decisionTriageTransportThreadId(seed: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 0x01000193) >>> 0;
  }
  let result = "";
  for (let index = 0; index < 26; index += 1) {
    hash = Math.imul(hash ^ (index + 1), 0x27d4eb2d) >>> 0;
    result += CROCKFORD_BASE32[(hash >>> 27) & 31];
  }
  return result;
}

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
  const logicalThreadId = `decision_triage:${input.userId?.trim() || "home"}`;
  const threadId = decisionTriageTransportThreadId(logicalThreadId);
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
    metadata: { store: true, origin: "mobile_focus_home", privacy: "minimised", logical_thread_id: logicalThreadId },
    views: [{ format: "a2ui", priority: 1, content: { kind: "decision_triage", title: "Decision updated", summary: action === "defer" ? "Saved for later" : action === "undo" ? "Decision restored" : "Recommendation accepted" } }],
    attachments: [], references: [], store_in_relational: true,
  };
}
