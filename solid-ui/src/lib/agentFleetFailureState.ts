// @locs-version: 1.0
import { visibleErrorText } from "./visibleErrorText";

export type AgentFleetFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

export type AgentFleetRunNotice = {
  message: string;
  tone: "info" | "success" | "danger";
};

function normalizeFailureMessage(message: string): string {
  return visibleErrorText(message).toLowerCase();
}

export function buildAgentFleetFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): AgentFleetFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This fleet action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same fleet view.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The fleet action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same view. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The fleet action did not complete successfully.",
    nextStep: "Retry from the same view. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}

export function buildAgentFleetRunFailureNotice(errorMessage: string): AgentFleetRunNotice {
  const receipt = buildAgentFleetFailureReceipt("Delegation start", errorMessage);
  return {
    message: `${receipt.title}. ${receipt.summary}`,
    tone: receipt.tone === "danger" ? "danger" : "danger",
  };
}
