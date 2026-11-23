// @locs-version: 1.0
export type AgentTriggersFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildAgentTriggersFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): AgentTriggersFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This trigger action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same triggers panel.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The trigger action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same triggers panel. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The trigger action did not complete successfully.",
    nextStep: "Retry from the same triggers panel. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
