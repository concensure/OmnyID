// @locs-version: 1.0
export type DailyBriefingFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildDailyBriefingFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): DailyBriefingFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This daily briefing action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the briefing bar.",
      tone: "danger",
    };
  }

  if (/no usable llm backend|no llm config|llm backend not configured|hosted llm requires pro|save byok|ollama settings|enable hosted ai/.test(normalized)) {
    return {
      title: `${actionLabel} could not start`,
      summary: "No AI model is connected to this workspace right now, so the daily briefing could not be generated.",
      nextStep: "Connect BYOK, Ollama, RunPod, or hosted AI in Agent Settings, then retry.",
      tone: "warning",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The daily briefing hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the briefing bar. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The daily briefing action did not complete successfully.",
    nextStep: "Retry from the briefing bar. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
