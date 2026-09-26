// @locs-version: 1.0
export type AgentSettingsSoulFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildAgentSettingsSoulFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): AgentSettingsSoulFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This personality action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same personality settings panel.",
      tone: "danger",
    };
  }

  if (/clipboard|notallowederror|denied|permission/.test(normalized)) {
    return {
      title: `${actionLabel} was blocked by the browser`,
      summary: "The browser did not allow access to the clipboard while trying to copy your personality file.",
      nextStep: "Allow clipboard access for this workspace, then try the same copy action again.",
      tone: "warning",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The personality action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same personality settings panel. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The personality action did not complete successfully.",
    nextStep: "Retry from the same personality settings panel. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
