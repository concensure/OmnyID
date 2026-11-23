// @locs-version: 1.0
export type AgentDashboardActionFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildAgentDashboardActionFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): AgentDashboardActionFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This agent action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same dashboard view.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The agent action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same dashboard view. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  if (/clipboard|write permission denied|notallowederror/.test(normalized)) {
    return {
      title: `${actionLabel} is blocked in this browser`,
      summary: "The browser did not allow the dashboard to write the session handoff summary to your clipboard.",
      nextStep: "Retry from a focused secure tab, or copy the summary manually if clipboard access stays blocked.",
      tone: "warning",
    };
  }

  if (/createobjecturl|object url|securityerror|download blocked/.test(normalized)) {
    return {
      title: `${actionLabel} is blocked in this browser`,
      summary: "The browser did not allow the dashboard to generate or start the audit-log download.",
      nextStep: "Retry from a normal browser tab, or use a different browser if download protections keep blocking the export.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The agent action did not complete successfully.",
    nextStep: "Retry from the same dashboard view. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
