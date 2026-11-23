// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";

export type DecisionTriageProjectionState = {
  resolvedIds: Set<string>;
  deferredIds: Set<string>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildDecisionTriageProjectionState(
  messages: readonly AfpMessage[] | null | undefined,
): DecisionTriageProjectionState {
  const resolvedIds = new Set<string>();
  const deferredIds = new Set<string>();
  const ordered = (messages ?? [])
    .map((message, index) => ({ message, index, at: Date.parse(message.timestamp) }))
    .filter(({ message }) => message.kind === "decision_triage" || message.subtype === "decision_triage" || message.content.kind === "decision_triage")
    .sort((left, right) => (Number.isFinite(left.at) ? left.at : 0) - (Number.isFinite(right.at) ? right.at : 0) || left.index - right.index);

  for (const { message } of ordered) {
    const itemId = clean(message.content.item_id);
    const action = clean(message.content.triage_action);
    if (!itemId) continue;
    resolvedIds.delete(itemId);
    deferredIds.delete(itemId);
    if (action === "approve") resolvedIds.add(itemId);
    if (action === "defer") deferredIds.add(itemId);
  }
  return { resolvedIds, deferredIds };
}
