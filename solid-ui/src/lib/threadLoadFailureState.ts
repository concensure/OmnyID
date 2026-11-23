// @locs-version: 1.0
import { isAccountDisabledFailure, isReauthenticationFailure, normalizeFailureMessage } from "./authFailureState";

export type ThreadLoadFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

export function buildThreadLoadFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): ThreadLoadFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (isAccountDisabledFailure(normalized)) {
    return {
      title: `${actionLabel} is unavailable for this account`,
      summary: "This thread could not be loaded because account access is currently disabled.",
      nextStep: "Contact support or an operator to restore account access before reopening the same thread.",
      tone: "danger",
    };
  }

  if (isReauthenticationFailure(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This thread could not be loaded because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then reopen the same thread.",
      tone: "danger",
    };
  }

  if (/404|not found|no such thread/.test(normalized)) {
    return {
      title: `${actionLabel} is unavailable`,
      summary: "This thread could not be found in the current workspace view.",
      nextStep: "Go back to the thread list and reopen it. If it still does not appear, refresh the workspace index.",
      tone: "warning",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The thread request hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry the same thread load. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The thread request did not complete successfully.",
    nextStep: "Retry the same thread load. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
