// @locs-version: 1.0
export type ThreadOrchestrationFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildThreadOrchestrationFailureReceipt(
  errorMessage: string,
): ThreadOrchestrationFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/no usable llm backend|no llm config|llm backend not configured|hosted llm requires pro|save byok|ollama settings|enable hosted ai/.test(normalized)) {
    return {
      title: "I could not reach a configured model",
      summary: "This thread reply did not run because no AI model is connected to the workspace right now.",
      nextStep: "Connect BYOK, Ollama, RunPod, or hosted AI in Agent Settings, then retry this reply.",
      tone: "warning",
    };
  }

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: "I need a fresh sign-in before continuing",
      summary: "This thread action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry the reply from this thread.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: "I could not complete the reply right now",
      summary: "The thread action hit a temporary model or network failure before the reply could be processed.",
      nextStep: "Retry from this thread. If it keeps failing, check model connectivity and workspace status.",
      tone: "warning",
    };
  }

  return {
    title: "I could not complete that thread action",
    summary: "The reply path failed before the agent could finish the requested work.",
    nextStep: "Retry from this thread. If it keeps failing, check model setup and session health first.",
    tone: "warning",
  };
}

export function buildThreadMergeFailureReceipt(
  errorMessage: string,
): ThreadOrchestrationFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: "I need a fresh sign-in before merging threads",
      summary: "This merge action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry the merge from the thread list.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: "I could not merge those threads right now",
      summary: "The merge action hit a temporary model or network failure before it could complete.",
      nextStep: "Retry the merge from the thread list. If it keeps failing, check model connectivity and workspace status.",
      tone: "warning",
    };
  }

  return {
    title: "I could not merge those threads",
    summary: "The thread merge did not complete successfully.",
    nextStep: "Retry the merge from the thread list. If it keeps failing, check model setup and session health first.",
    tone: "warning",
  };
}
