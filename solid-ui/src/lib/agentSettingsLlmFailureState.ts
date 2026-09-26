// @locs-version: 1.0
export type AgentSettingsLlmFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildAgentSettingsLlmFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): AgentSettingsLlmFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This model settings action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same model settings panel.",
      tone: "danger",
    };
  }

  if (/not configured|missing model|missing provider|api key required|hosted ai requires a pro workspace|no model configured/.test(normalized)) {
    return {
      title: `${actionLabel} needs model setup first`,
      summary: "This model action could not run because the current provider or model configuration is incomplete.",
      nextStep: "Finish the model setup in this panel, save it, then retry the same connection test.",
      tone: "warning",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The model settings action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same model settings panel. If it keeps failing, check workspace connectivity and provider status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The model settings action did not complete successfully.",
    nextStep: "Retry from the same model settings panel. If it keeps failing, check session health and provider configuration.",
    tone: "warning",
  };
}
