// @locs-version: 1.0
import { isAccountDisabledFailure, isReauthenticationFailure, normalizeFailureMessage } from "./authFailureState";

export type SpacesFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

export function buildSpacesFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): SpacesFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/name is required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a name`,
      summary: "This space action cannot continue until the space has a clear name.",
      nextStep: "Add a name, then retry from the same panel.",
      tone: "warning",
    };
  }

  if (isAccountDisabledFailure(normalized)) {
    return {
      title: `${actionLabel} is unavailable for this account`,
      summary: "This space action is blocked because account access is currently disabled.",
      nextStep: "Contact support or an operator to restore account access before retrying from the same space view.",
      tone: "danger",
    };
  }

  if (isReauthenticationFailure(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This space action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same space view.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The space action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same space view. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  if (/upload failed|attachment metadata/.test(normalized)) {
    return {
      title: `${actionLabel} did not complete`,
      summary: "The file upload or attachment handoff did not finish successfully.",
      nextStep: "Retry the attachment. If it keeps failing, check file size limits and server storage health.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The space action did not complete successfully.",
    nextStep: "Retry from the same space view. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
