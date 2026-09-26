// @locs-version: 1.0
export type DatabaseViewFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildDatabaseViewFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): DatabaseViewFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This database action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same database view.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The database action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same database view. If it keeps failing, verify workspace connectivity and try again shortly.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The database action did not complete successfully.",
    nextStep: "Retry from the same database view. If it keeps failing, verify session health and workspace status.",
    tone: "warning",
  };
}
