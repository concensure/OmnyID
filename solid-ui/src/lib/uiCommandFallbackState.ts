// @locs-version: 1.0
import { afpOptionalRecord } from "@/lib/afpMessageRecord";

export type UiCommandFallbackNotice = {
  label: string;
  detail: string;
  actionLabel?: string;
  actionView?: string;
  tone?: "amber" | "neutral";
};

type UiCommandBoundaryCarrier = {
  boundary?: Record<string, unknown> | null;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readUiCommandFallbackNotice(
  command: UiCommandBoundaryCarrier | null | undefined,
): UiCommandFallbackNotice | null {
  const boundary = afpOptionalRecord(command?.boundary);
  if (!boundary) {
    return null;
  }
  const kind = asNonEmptyString(boundary.kind);
  if (kind !== "command_fallback") {
    return null;
  }
  if (boundary.model_configured === true) {
    return {
      label: asNonEmptyString(boundary.label) ?? "Saved AI model needs attention",
      detail:
        asNonEmptyString(boundary.detail)
        ?? "A model setting is saved, but the Master Agent could not get a usable response and used a deterministic fallback instead.",
      actionLabel: "Test AI model",
      actionView: "agent_settings",
      tone: "amber",
    };
  }
  const llmConnected = boundary.llm_connected;
  if (llmConnected === false) {
    return {
      label: "AI model not connected",
      detail:
        asNonEmptyString(boundary.detail)
        ?? "This result came from a non-LLM fallback path because no AI model is connected to this workspace yet.",
      actionLabel: "Connect AI model",
      actionView: "agent_settings",
      tone: "amber",
    };
  }
  return {
    label:
      asNonEmptyString(boundary.label)
      ?? "Deterministic fallback",
    detail:
      asNonEmptyString(boundary.detail)
      ?? "This result came from a non-LLM fallback path.",
    tone: "neutral",
  };
}
