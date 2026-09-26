// @locs-version: 1.0
import type { LlmConfig } from "./api";
import type { GmailConnectionStatus } from "./gmailConnectionState";
import {
  isWorkspaceGmailSetupComplete,
  isWorkspaceLlmSetupComplete,
  workspaceGmailSetupPendingReason,
  workspaceLlmSetupPendingReason,
} from "./workspaceSetupState.js";

export type OnboardingActivationItem = {
  id: "llm" | "gmail";
  title: string;
  ready: boolean;
  statusLabel: string;
  detail: string;
  actionLabel: string;
  targetView: "agent_settings" | "email";
};

export function buildOnboardingActivationItems(
  config: LlmConfig | null | undefined,
  gmailStatus: GmailConnectionStatus | null | undefined,
): OnboardingActivationItem[] {
  const llmReady = isWorkspaceLlmSetupComplete(config);
  const llmPendingReason = workspaceLlmSetupPendingReason(config);
  const gmailReady = isWorkspaceGmailSetupComplete(gmailStatus);
  const gmailPendingReason = workspaceGmailSetupPendingReason(gmailStatus);

  return [
    {
      id: "llm",
      title: "AI model",
      ready: llmReady,
      statusLabel: llmReady ? "Connected" : "Required",
      detail: llmReady
        ? "Replies, summaries, and research are now live in this workspace."
        : llmPendingReason || "Connect an AI model before the command bar can do real agent work.",
      actionLabel: llmReady ? "Review AI setup" : "Connect AI model",
      targetView: "agent_settings",
    },
    {
      id: "gmail",
      title: "Inbox connection",
      ready: gmailReady,
      statusLabel: gmailReady
        ? "Connected"
        : gmailStatus?.token_expired
          ? "Reconnect required"
          : gmailStatus?.expires_within_24h
            ? "Reconnect soon"
            : "Recommended",
      detail: gmailReady
        ? "Your inbox is connected for thread context, triage, and reply assistance."
        : gmailPendingReason || "Optional, but recommended if you want email triage, reply drafts, and thread context.",
      actionLabel: gmailReady ? "Open inbox" : "Connect Gmail",
      targetView: "email",
    },
  ];
}

export function onboardingActivationSummary(
  config: LlmConfig | null | undefined,
  gmailStatus: GmailConnectionStatus | null | undefined,
): string {
  if (!isWorkspaceLlmSetupComplete(config)) {
    return "Your preferences are saved, but the agent still needs an AI model before it can respond properly.";
  }
  if (gmailStatus?.token_expired) {
    return "Your agent can respond now, but Gmail needs to be reconnected before inbox triage and reply actions will work reliably.";
  }
  if (gmailStatus?.expires_within_24h) {
    return "Your agent can respond now. Reconnect Gmail soon so inbox triage and reply actions do not fail.";
  }
  if (!isWorkspaceGmailSetupComplete(gmailStatus)) {
    return "Your agent can respond now. Connect Gmail next if you want inbox triage and email context.";
  }
  return "Your core setup is ready. You can move into the workspace and start using the agent.";
}
