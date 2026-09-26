// @locs-version: 1.0
import type { LlmConfig } from "./api";
import type { GmailConnectionStatus } from "./gmailConnectionState";
import type { GoogleCalendarConnectionStatus } from "./googleCalendarConnectionState";

export function isWorkspaceLlmSetupComplete(config: LlmConfig | null | undefined): boolean {
  if (!config) return false;
  if (config.backend === "hosted") {
    return config.monthly_budget_cents > 0;
  }
  return true;
}

export function workspaceLlmSetupPendingReason(config: LlmConfig | null | undefined): string | null {
  if (!config) return null;
  if (config.backend === "hosted" && config.monthly_budget_cents <= 0) {
    return "Hosted AI is still disabled. Set a hosted budget or switch to BYOK/Ollama.";
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
