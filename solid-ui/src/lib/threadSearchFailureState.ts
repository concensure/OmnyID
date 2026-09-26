// @locs-version: 1.0
export type ThreadSearchFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildThreadSearchFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): ThreadSearchFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "Remote thread search was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then rerun the same thread search.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "Remote thread search hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry the same search. If it keeps failing, check workspace connectivity and retrieval service status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "Remote thread search did not complete successfully.",
    nextStep: "Retry the same search. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
