// @locs-version: 1.0
export type WorkflowWaitResumeFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

type WorkflowWaitResumeFailureState = {
  errorMessageText: string;
  normalizedMessageText: string;
  receipt: WorkflowWaitResumeFailureReceipt;
};

const WORKFLOW_WAIT_RESUME_FAILURE_SESSION_PATTERN =
  /unauthorized|401|forbidden|403|recent sign-in required/;
const WORKFLOW_WAIT_RESUME_FAILURE_CONNECTIVITY_PATTERN =
  /timeout|timed out|connection reset|connection refused|network error|fetch failed|temporar/;

const WORKFLOW_WAIT_RESUME_FAILURE_SESSION_SUMMARY =
  "The saved wait / resume history could not be loaded because the current session is no longer trusted for that workflow action.";
const WORKFLOW_WAIT_RESUME_FAILURE_SESSION_NEXT_STEP =
  "Sign in again, then retry loading this run's wait chain.";
const WORKFLOW_WAIT_RESUME_FAILURE_CONNECTIVITY_SUMMARY =
  "The saved wait / resume history hit a temporary connectivity or service failure before it could load.";
const WORKFLOW_WAIT_RESUME_FAILURE_CONNECTIVITY_NEXT_STEP =
  "Retry this run's wait chain. If it keeps failing, verify workspace connectivity and server status.";
const WORKFLOW_WAIT_RESUME_FAILURE_DEFAULT_SUMMARY =
  "The saved wait / resume history for this run could not be loaded.";
const WORKFLOW_WAIT_RESUME_FAILURE_DEFAULT_NEXT_STEP =
  "Retry this run's wait chain. If it keeps failing, verify session health and workspace status.";

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

function workflowWaitResumeFailureState(
  errorMessage: string,
): WorkflowWaitResumeFailureState {
  const normalizedMessageText = normalizeFailureMessage(errorMessage);
  const sessionFailure = WORKFLOW_WAIT_RESUME_FAILURE_SESSION_PATTERN.test(
    normalizedMessageText,
  );
  const connectivityFailure = WORKFLOW_WAIT_RESUME_FAILURE_CONNECTIVITY_PATTERN.test(
    normalizedMessageText,
  );

  const receipt: WorkflowWaitResumeFailureReceipt = sessionFailure
    ? {
      title: "Wait chain needs a fresh sign-in",
      summary: WORKFLOW_WAIT_RESUME_FAILURE_SESSION_SUMMARY,
      nextStep: WORKFLOW_WAIT_RESUME_FAILURE_SESSION_NEXT_STEP,
      tone: "danger",
    }
    : connectivityFailure
      ? {
        title: "Wait chain could not load right now",
        summary: WORKFLOW_WAIT_RESUME_FAILURE_CONNECTIVITY_SUMMARY,
        nextStep: WORKFLOW_WAIT_RESUME_FAILURE_CONNECTIVITY_NEXT_STEP,
        tone: "warning",
      }
      : {
        title: "Wait chain failed to load",
        summary: WORKFLOW_WAIT_RESUME_FAILURE_DEFAULT_SUMMARY,
        nextStep: WORKFLOW_WAIT_RESUME_FAILURE_DEFAULT_NEXT_STEP,
        tone: "warning",
      };

  return {
    errorMessageText: errorMessage,
    normalizedMessageText,
    receipt,
  };
}

export function buildWorkflowWaitResumeFailureReceipt(
  errorMessage: string,
): WorkflowWaitResumeFailureReceipt {
  return workflowWaitResumeFailureState(errorMessage).receipt;
}
