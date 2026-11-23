// @locs-version: 1.0
import { isAccountDisabledFailure, isReauthenticationFailure, normalizeFailureMessage } from "./authFailureState";

export type AgentDashboardLoadFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

export function buildAgentDashboardLoadFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): AgentDashboardLoadFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (isAccountDisabledFailure(normalized)) {
    return {
      title: `${actionLabel} is unavailable for this account`,
      summary: "This agent dashboard request is blocked because account access is currently disabled.",
      nextStep: "Contact support or an operator to restore account access before reopening the same dashboard view.",
      tone: "danger",
    };
  }

  if (isReauthenticationFailure(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This agent dashboard request was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same dashboard view.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The agent dashboard request hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same dashboard view. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The agent dashboard request did not complete successfully.",
    nextStep: "Retry from the same dashboard view. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
