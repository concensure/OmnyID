// @locs-version: 1.0
export type WorkspaceSetupBannerFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildWorkspaceSetupBannerFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): WorkspaceSetupBannerFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "The workspace setup check was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry the failed setup checks from the same banner.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The workspace setup check hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry the failed setup checks. If they keep failing, verify the relevant integration or model setup first.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "One or more workspace setup checks could not be verified successfully.",
    nextStep: "Retry the failed setup checks. If they keep failing, open the relevant setup area and confirm its configuration.",
    tone: "warning",
  };
}

export function buildWorkspaceSetupBannerSummaryReceipt(
  failedItemLabels: string[],
  itemReceipts: WorkspaceSetupBannerFailureReceipt[],
): WorkspaceSetupBannerFailureReceipt | null {
  if (failedItemLabels.length === 0) {
    return null;
  }

  const tone = itemReceipts.some((receipt) => receipt.tone === "danger")
    ? "danger"
    : "warning";

  return {
    title: "Some setup checks need attention",
    summary: `The banner could not verify: ${failedItemLabels.join(", ")}.`,
    nextStep: "Retry the failed checks. If they keep failing, open the relevant setup area and confirm connectivity or sign in again.",
    tone,
  };
}
