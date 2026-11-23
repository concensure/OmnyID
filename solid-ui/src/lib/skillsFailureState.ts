// @locs-version: 1.0
export type SkillsFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildSkillsFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): SkillsFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This skill-capsule action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same skills view.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The skill-capsule action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same skills view. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The skill-capsule action did not complete successfully.",
    nextStep: "Retry from the same skills view. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
