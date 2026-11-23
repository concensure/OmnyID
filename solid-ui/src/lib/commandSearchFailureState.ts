// @locs-version: 1.0
export type CommandSearchFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildCommandSearchFailureReceipt(
  errorMessage: string,
): CommandSearchFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/no usable llm backend|no llm config|llm backend not configured|hosted llm requires pro|save byok|ollama settings|enable hosted ai/.test(normalized)) {
    return {
      title: "I could not run that command yet",
      summary: "No AI model is connected to this workspace right now, so the command bar could not complete the request.",
      nextStep: "Connect BYOK, Ollama, RunPod, or hosted AI in Agent Settings, then retry the command.",
      tone: "warning",
    };
  }

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: "I need a fresh sign-in before continuing",
      summary: "This command was blocked because the current session is no longer trusted for the requested action.",
      nextStep: "Sign in again, then retry the command.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: "I could not complete that command right now",
      summary: "The command bar hit a temporary model or network failure before the request could finish.",
      nextStep: "Retry the command. If it keeps failing, check model connectivity and workspace status.",
      tone: "warning",
    };
  }

  return {
    title: "I could not complete that command",
    summary: "The command bar request failed before the agent could finish the requested work.",
    nextStep: "Retry the command. If it keeps failing, check model setup and session health first.",
    tone: "warning",
  };
}
