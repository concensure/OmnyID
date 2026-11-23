// @locs-version: 1.0
import { isAccountDisabledFailure, isReauthenticationFailure, normalizeFailureMessage } from "./authFailureState";

export type WorkflowEditorFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

export function buildWorkflowEditorFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): WorkflowEditorFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (isAccountDisabledFailure(normalized)) {
    return {
      title: `${actionLabel} is unavailable for this account`,
      summary: "The workflow editor action is blocked because account access is currently disabled.",
      nextStep: "Contact support or an operator to restore account access before retrying from the same workflow workspace.",
      tone: "danger",
    };
  }

  if (isReauthenticationFailure(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "The workflow editor action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same workflow workspace.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|fetch failed|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The workflow editor action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same workflow workspace. If it keeps failing, verify workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The workflow editor action did not complete successfully.",
    nextStep: "Retry from the same workflow workspace. If it keeps failing, verify session health and workspace status.",
    tone: "warning",
  };
}
