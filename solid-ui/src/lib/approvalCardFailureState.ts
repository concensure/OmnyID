// @locs-version: 1.0
export type ApprovalCardFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

type ApprovalCardFailureState = {
  actionLabelText: string;
  errorMessageText: string;
  normalizedMessageText: string;
  receipt: ApprovalCardFailureReceipt;
};

const APPROVAL_FAILURE_SESSION_PATTERN =
  /unauthorized|401|forbidden|403|recent sign-in required/;
const APPROVAL_FAILURE_CONNECTIVITY_PATTERN =
  /timeout|timed out|connection reset|connection refused|network error|fetch failed|temporar/;

const APPROVAL_FAILURE_SESSION_SUMMARY =
  "This approval action was blocked because the current session is no longer trusted for it.";
const APPROVAL_FAILURE_SESSION_NEXT_STEP =
  "Sign in again, then retry the same approval from this card.";
const APPROVAL_FAILURE_CONNECTIVITY_SUMMARY =
  "The approval action hit a temporary connectivity or service failure before it could complete.";
const APPROVAL_FAILURE_CONNECTIVITY_NEXT_STEP =
  "Retry from the same card. If it keeps failing, verify workspace connectivity and server status.";
const APPROVAL_FAILURE_DEFAULT_SUMMARY =
  "The approval action did not complete successfully.";
const APPROVAL_FAILURE_DEFAULT_NEXT_STEP =
  "Retry from the same card. If it keeps failing, verify session health and workspace status.";

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

function approvalCardFailureState(
  actionLabel: string,
  errorMessage: string,
): ApprovalCardFailureState {
  const normalizedMessageText = normalizeFailureMessage(errorMessage);
  const sessionFailure = APPROVAL_FAILURE_SESSION_PATTERN.test(normalizedMessageText);
  const connectivityFailure = APPROVAL_FAILURE_CONNECTIVITY_PATTERN.test(normalizedMessageText);

  const receipt: ApprovalCardFailureReceipt = sessionFailure
    ? {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: APPROVAL_FAILURE_SESSION_SUMMARY,
      nextStep: APPROVAL_FAILURE_SESSION_NEXT_STEP,
      tone: "danger",
    }
    : connectivityFailure
      ? {
        title: `${actionLabel} could not finish right now`,
        summary: APPROVAL_FAILURE_CONNECTIVITY_SUMMARY,
        nextStep: APPROVAL_FAILURE_CONNECTIVITY_NEXT_STEP,
        tone: "warning",
      }
      : {
        title: `${actionLabel} failed`,
        summary: APPROVAL_FAILURE_DEFAULT_SUMMARY,
        nextStep: APPROVAL_FAILURE_DEFAULT_NEXT_STEP,
        tone: "warning",
      };

  return {
    actionLabelText: actionLabel,
    errorMessageText: errorMessage,
    normalizedMessageText,
    receipt,
  };
}

export function buildApprovalCardFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): ApprovalCardFailureReceipt {
  return approvalCardFailureState(actionLabel, errorMessage).receipt;
}
