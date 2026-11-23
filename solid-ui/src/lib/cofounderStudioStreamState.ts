// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type CofounderStudioStreamEvent = {
  nodeId?: string;
  slotName?: string;
  output?: Record<string, unknown>;
  error?: string;
};

function optionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function parseCofounderStudioStreamEvent(data: unknown): CofounderStudioStreamEvent | null {
  const parsed = typeof data === "string" ? parseJsonValue(data) : { ok: true as const, value: data };
  if (!parsed.ok) return null;

  if (!isRecord(parsed.value)) return null;

  const event: CofounderStudioStreamEvent = {};
  const nodeId = optionalTrimmedString(parsed.value.node_id);
  const slotName = optionalTrimmedString(parsed.value.slot_name);
  const error = optionalTrimmedString(parsed.value.error);

  if (nodeId) event.nodeId = nodeId;
  if (slotName) event.slotName = slotName;
  if (isRecord(parsed.value.output)) event.output = parsed.value.output;
  if (error) event.error = error;

  return nodeId || slotName || event.output || error ? event : null;
}
