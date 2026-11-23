// @locs-version: 1.0
import { isAccountDisabledFailure, isReauthenticationFailure, normalizeFailureMessage } from "./authFailureState";

export type UsageViewFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

export function buildUsageViewFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): UsageViewFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/clipboard|write text|write permission|notallowederror|denied|gesture/.test(normalized)) {
    return {
      title: `${actionLabel} needs browser clipboard access`,
      summary: "The browser blocked this billing helper action before it could place the request details on the clipboard.",
      nextStep: "Retry from the same usage view after granting clipboard access or using a browser context that allows copy actions.",
      tone: "warning",
    };
  }

  if (isAccountDisabledFailure(normalized)) {
    return {
      title: `${actionLabel} is unavailable for this account`,
      summary: "This billing action is blocked because account access is currently disabled.",
      nextStep: "Contact support or an operator to restore account access before retrying from the same usage view.",
      tone: "danger",
    };
  }

  if (isReauthenticationFailure(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This billing action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same usage view.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The billing request hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same usage view. If it keeps failing, check workspace connectivity and billing service status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The billing request did not complete successfully.",
    nextStep: "Retry from the same usage view. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
