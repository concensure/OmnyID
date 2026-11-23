// @locs-version: 1.0
export type PersonaSwitcherFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildPersonaSwitcherFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): PersonaSwitcherFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This persona action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same persona switcher.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The persona action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same persona switcher. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The persona action did not complete successfully.",
    nextStep: "Retry from the same persona switcher. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
