// @locs-version: 1.0
import type { GmailConnectionStatus } from "@/lib/gmailConnectionState";

export type EmailActionFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildEmailActionFailureReceipt(
  actionLabel: string,
  errorMessage: string,
  gmailStatus?: GmailConnectionStatus | null,
): EmailActionFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (gmailStatus?.token_expired || /token expired|invalid_grant|reconnect gmail|gmail.*expired/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish`,
      summary: "Gmail needs to be reconnected before the agent can finish this inbox action.",
      nextStep: "Reconnect Gmail, then retry the action from this thread.",
      tone: "danger",
    };
  }

  if (/no usable llm backend|no llm config|llm backend not configured|hosted llm requires pro|save byok|ollama settings|enable hosted ai/.test(normalized)) {
    return {
      title: `${actionLabel} could not start`,
      summary: "No AI model is connected to this workspace right now, so the agent could not run the inbox task.",
      nextStep: "Connect BYOK, Ollama, RunPod, or hosted AI in Agent Settings, then retry.",
      tone: "warning",
    };
  }

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This inbox action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from this thread.",
      tone: "danger",
    };
  }

  return {
    title: `${actionLabel} hit a temporary failure`,
    summary: "The agent accepted the request path but could not complete the inbox action right now.",
    nextStep: "Retry from this thread. If it keeps failing, check Gmail and model connectivity first.",
    tone: "warning",
  };
}
