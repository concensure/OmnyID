// @locs-version: 1.0
import { isAccountDisabledFailure, isReauthenticationFailure, normalizeFailureMessage } from "./authFailureState";

export type ToolsFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

export function buildToolsFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): ToolsFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (isAccountDisabledFailure(normalized)) {
    return {
      title: `${actionLabel} is unavailable for this account`,
      summary: "This tools action is blocked because account access is currently disabled.",
      nextStep: "Contact support or an operator to restore account access before retrying from the same tools view.",
      tone: "danger",
    };
  }

  if (isReauthenticationFailure(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This tools action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same tools view.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar|failed to fetch|load failed/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The tools request hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same tools view. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The tools action did not complete successfully.",
    nextStep: "Retry from the same tools view. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
