// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type WorkflowJsonRecordParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

export function parseWorkflowJsonRecord(raw: string): WorkflowJsonRecordParseResult {
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    return { ok: false, message: "Invalid JSON." };
  }
  if (!isRecord(parsed.value)) {
    return { ok: false, message: "Expected a JSON object." };
  }
  return { ok: true, value: parsed.value };
}

export function workflowJsonInvalidFeedback(
  target: "config" | "policy",
  message: string,
): string {
  return `Invalid ${target} JSON: ${message}`;
}

export function workflowJsonAppliedFeedback(target: "config" | "policy"): string {
  return target === "config" ? "Applied node config JSON." : "Applied node policy JSON.";
}
