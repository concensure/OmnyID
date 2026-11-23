// @locs-version: 1.0
export type AgentPulseFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildAgentPulseFailureReceipt(errorMessage: string): AgentPulseFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: "Agent pulse needs a fresh sign-in",
      summary: "The fleet pulse could not refresh because the current session is no longer trusted for this request.",
      nextStep: "Sign in again, then retry the pulse.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: "Agent pulse is temporarily unavailable",
      summary: "The fleet pulse hit a temporary connectivity or service failure before it could refresh.",
      nextStep: "Retry the pulse. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: "Agent pulse is unavailable",
    summary: "The fleet pulse could not be refreshed right now.",
    nextStep: "Retry the pulse. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
