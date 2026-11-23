// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import type { LiveRunStreamEvent } from "@/lib/workflowReviewTypes";
import type { WorkflowEdgeDraft } from "@/lib/workflowGraphTypes";
import type { LiveRunNodeOverlay } from "@/lib/workflowReviewTypes";
import { liveEdgeStateForNodeStatus, liveRunEventStatus } from "@/lib/workflowLiveRunState";

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseLiveRunStreamEvent(data: unknown): LiveRunStreamEvent | null {
  const parsed = typeof data === "string" ? parseJsonValue(data) : { ok: true as const, value: data };
  if (!parsed.ok) return null;
  if (!isRecord(parsed.value) || typeof parsed.value.event !== "string" || !parsed.value.event.trim()) return null;
  return {
    decision: optionalString(parsed.value.decision),
    event: parsed.value.event.trim(),
    node_id: optionalString(parsed.value.node_id),
    label: optionalString(parsed.value.label),
    note: optionalString(parsed.value.note),
    option_consequence: optionalString(parsed.value.option_consequence),
    option_id: optionalString(parsed.value.option_id),
    option_label: optionalString(parsed.value.option_label),
    result_summary: optionalString(parsed.value.result_summary),
    status: optionalString(parsed.value.status),
    index: optionalNumber(parsed.value.index),
    ts: optionalString(parsed.value.ts),
    phase: optionalString(parsed.value.phase),
    trace_kind: optionalString(parsed.value.trace_kind),
    outcome_checkpoint: optionalString(parsed.value.outcome_checkpoint),
    reason: optionalString(parsed.value.reason),
    runtime_kind: optionalString(parsed.value.runtime_kind),
    graph_node_kind: optionalString(parsed.value.graph_node_kind),
    complexity_score: optionalNumber(parsed.value.complexity_score),
    risk_score: optionalNumber(parsed.value.risk_score),
  };
}

export function liveRunStreamEventKey(event: LiveRunStreamEvent): string {
  return `${event.event}:${event.node_id ?? "run"}:${String(event.index ?? "")}:${event.ts ?? ""}`;
}

export function liveRunStreamEventIsTerminal(event: LiveRunStreamEvent): boolean {
  return event.event === "run_completed" || event.event === "run_failed";
}

function trimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function liveRunNodeOverlaysFromEvents(
  events: readonly LiveRunStreamEvent[],
): Map<string, LiveRunNodeOverlay> {
  const overlays = new Map<string, LiveRunNodeOverlay>();
  for (const event of events) {
    const nodeId = trimmedString(event.node_id);
    if (!nodeId) continue;
    const status = liveRunEventStatus(event);
    if (!status) continue;
    const eventReason = trimmedString(event.reason);
    const eventDecision = trimmedString(event.decision);
    const eventOptionId = trimmedString(event.option_id);
    const eventOptionLabel = trimmedString(event.option_label);
    const eventOptionConsequence = trimmedString(event.option_consequence);
    const eventResultSummary = trimmedString(event.result_summary);
    const eventNote = trimmedString(event.note);
    const liveReason = [
      eventReason,
      eventDecision
        ? `Decision ${eventDecision}${eventOptionLabel ? ` via ${eventOptionLabel}` : eventOptionId ? ` via ${eventOptionId}` : ""}`
        : null,
      eventOptionConsequence,
      eventResultSummary,
      eventNote ? `Note: ${eventNote}` : null,
    ].filter((value): value is string => Boolean(value)).join(" ");
    const current = overlays.get(nodeId);
    overlays.set(nodeId, {
      status,
      stepOrder: typeof event.index === "number" ? event.index + 1 : current?.stepOrder ?? null,
      phase: typeof event.phase === "string" ? event.phase : current?.phase ?? null,
      checkpoint: typeof event.outcome_checkpoint === "string" ? event.outcome_checkpoint : current?.checkpoint ?? null,
      reason: liveReason || (current?.reason ?? null),
    });
  }
  return overlays;
}

export function mergeLiveRunStatuses(
  persistedStatuses: ReadonlyMap<string, string>,
  liveOverlays: ReadonlyMap<string, Pick<LiveRunNodeOverlay, "status">>,
): Map<string, string> {
  const merged = new Map(persistedStatuses);
  for (const [nodeId, overlay] of liveOverlays) merged.set(nodeId, overlay.status);
  return merged;
}

export function mergeLiveRunStepOrder(
  persistedStepOrder: ReadonlyMap<string, number>,
  liveOverlays: ReadonlyMap<string, Pick<LiveRunNodeOverlay, "stepOrder">>,
): Map<string, number> {
  const merged = new Map(persistedStepOrder);
  for (const [nodeId, overlay] of liveOverlays) {
    if (typeof overlay.stepOrder === "number" && Number.isFinite(overlay.stepOrder)) {
      merged.set(nodeId, overlay.stepOrder);
    }
  }
  return merged;
}

export function mergeLiveRunEdgeStates(
  persistedEdgeStates: ReadonlyMap<string, string>,
  edges: readonly Pick<WorkflowEdgeDraft, "id" | "source" | "target">[],
  liveOverlays: ReadonlyMap<string, Pick<LiveRunNodeOverlay, "status" | "stepOrder">>,
): Map<string, string> {
  const merged = new Map(persistedEdgeStates);
  const orderedNodes = [...liveOverlays.entries()]
    .map(([nodeId, overlay]) => ({
      nodeId,
      status: overlay.status,
      stepOrder: overlay.stepOrder,
    }))
    .filter((entry): entry is { nodeId: string; status: string; stepOrder: number } =>
      typeof entry.stepOrder === "number" && Number.isFinite(entry.stepOrder)
    )
    .sort((left, right) => left.stepOrder - right.stepOrder);
  for (let index = 0; index < orderedNodes.length - 1; index += 1) {
    const current = orderedNodes[index];
    const next = orderedNodes[index + 1];
    const edge = edges.find((candidate) => candidate.source === current.nodeId && candidate.target === next.nodeId);
    if (!edge) continue;
    const state = liveEdgeStateForNodeStatus(next.status);
    if (state) merged.set(edge.id, state);
  }
  return merged;
}
