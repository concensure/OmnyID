// @locs-version: 1.0
export type ParsedDocumentFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildParsedDocumentFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): ParsedDocumentFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This document extraction action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same document panel.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|fetch failed|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The document extraction request hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same document panel. If it keeps failing, verify connectivity and extraction service availability.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The document extraction action did not complete successfully.",
    nextStep: "Retry from the same document panel. If it keeps failing, verify session health and workspace status.",
    tone: "warning",
  };
}
