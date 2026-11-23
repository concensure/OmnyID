// @locs-version: 1.0
import type { LlmConfig } from "./api";
import type { GmailConnectionStatus } from "./gmailConnectionState";
import type { GoogleCalendarConnectionStatus } from "./googleCalendarConnectionState";

export function isWorkspaceLlmSetupComplete(config: LlmConfig | null | undefined): boolean {
  return config?.inference_ready === true;
}

export function workspaceLlmSetupPendingReason(config: LlmConfig | null | undefined): string | null {
  if (!config) return "No AI model is connected yet. Connect an AI model or enable hosted AI for this account.";
  if (!config.inference_ready && config.backend === "byok") {
    return "This saved BYOK model has no usable API key. Add the key again in Agent Settings.";
  }
  if (!config.inference_ready && config.backend === "runpod") {
    return "This RunPod model is saved, but its endpoint credentials are unavailable. Reconnect it in Agent Settings.";
  }
  if (!config.inference_ready && config.backend === "ollama") {
    return "This Ollama model is saved, but it is not available to the workspace server. Check its URL in Agent Settings.";
  }
  if (config.backend === "hosted" && config.monthly_budget_cents <= 0) {
    return "Hosted AI is still disabled. Set a hosted budget or switch to BYOK/Ollama.";
  }
  if (!config.inference_ready) {
    return "The saved AI model is not available. Reconnect it in Agent Settings before running the Master Agent.";
  }
  return null;
}

export function workspaceLlmSetupErrorPendingReason(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/\bno LLM config\b/i.test(message) || /\/user\/llm-config/i.test(message) || /POST \/agent\/provision/i.test(message)) {
    return workspaceLlmSetupPendingReason(null);
  }
  return null;
}

export function isWorkspaceGmailSetupComplete(
  status: GmailConnectionStatus | null | undefined,
): boolean {
  return Boolean(
    status?.connected
    && !status.token_expired
    && !status.expires_within_24h,
  );
}

export function workspaceGmailSetupPendingReason(
  status: GmailConnectionStatus | null | undefined,
): string | null {
  if (!status?.connected) {
    return "Connect Gmail for inbox triage, reply drafting, and thread context.";
  }
  if (status.token_expired) {
    return "Gmail is connected, but the token has expired. Reconnect Gmail before inbox actions fail.";
  }
  if (status.expires_within_24h) {
    return "Gmail is connected, but the token expires soon. Reconnect now to avoid reply and triage failures.";
  }
  return null;
}

export function isWorkspaceCalendarSetupComplete(
  status: GoogleCalendarConnectionStatus | null | undefined,
): boolean {
  return Boolean(status?.connected && !status.token_expired);
}

export function workspaceCalendarSetupPendingReason(
  status: GoogleCalendarConnectionStatus | null | undefined,
): string | null {
  if (!status?.connected) {
    return "Connect Google Calendar so the agent can schedule and check events for you.";
  }
  if (status.token_expired) {
    return "Calendar is connected, but the token has expired. Reconnect before scheduling actions fail.";
  }
  if (status.expires_within_24h) {
    return "Calendar is connected, but the token expires soon. Reconnect now to avoid scheduling failures.";
  }
  return null;
}
