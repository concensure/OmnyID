// @locs-version: 1.0
export type IntelligenceBriefFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildIntelligenceBriefFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): IntelligenceBriefFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This intelligence-brief action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same briefing panel.",
      tone: "danger",
    };
  }

  if (/no usable llm backend|no llm config|llm backend not configured|hosted llm requires pro|save byok|ollama settings|enable hosted ai/.test(normalized)) {
    return {
      title: `${actionLabel} could not start`,
      summary: "No AI model is connected to this workspace right now, so the intelligence brief could not finish this step.",
      nextStep: "Connect BYOK, Ollama, RunPod, or hosted AI in Agent Settings, then retry.",
      tone: "warning",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The intelligence-brief action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same briefing panel. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The intelligence-brief action did not complete successfully.",
    nextStep: "Retry from the same briefing panel. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
