// @locs-version: 1.0
export type TaskDetailFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

type TaskDetailFailureState = {
  actionLabelText: string;
  errorMessageText: string;
  normalizedMessageText: string;
  receipt: TaskDetailFailureReceipt;
};

const TASK_DETAIL_FAILURE_SESSION_PATTERN =
  /unauthorized|401|forbidden|403|recent sign-in required/;
const TASK_DETAIL_FAILURE_CONNECTIVITY_PATTERN =
  /timeout|timed out|connection reset|connection refused|network error|temporar/;

const TASK_DETAIL_FAILURE_SESSION_SUMMARY =
  "This task review action was blocked because the current session is no longer trusted for it.";
const TASK_DETAIL_FAILURE_SESSION_NEXT_STEP =
  "Sign in again, then retry from the same task detail view.";
const TASK_DETAIL_FAILURE_CONNECTIVITY_SUMMARY =
  "The task review action hit a temporary connectivity or service failure before it could complete.";
const TASK_DETAIL_FAILURE_CONNECTIVITY_NEXT_STEP =
  "Retry from the same task detail view. If it keeps failing, check workspace connectivity and server status.";
const TASK_DETAIL_FAILURE_DEFAULT_SUMMARY =
  "The task review action did not complete successfully.";
const TASK_DETAIL_FAILURE_DEFAULT_NEXT_STEP =
  "Retry from the same task detail view. If it keeps failing, check session health and workspace status.";

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

function taskDetailFailureState(
  actionLabel: string,
  errorMessage: string,
): TaskDetailFailureState {
  const normalizedMessageText = normalizeFailureMessage(errorMessage);
  const sessionFailure = TASK_DETAIL_FAILURE_SESSION_PATTERN.test(normalizedMessageText);
  const connectivityFailure = TASK_DETAIL_FAILURE_CONNECTIVITY_PATTERN.test(
    normalizedMessageText,
  );

  const receipt: TaskDetailFailureReceipt = sessionFailure
    ? {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: TASK_DETAIL_FAILURE_SESSION_SUMMARY,
      nextStep: TASK_DETAIL_FAILURE_SESSION_NEXT_STEP,
      tone: "danger",
    }
    : connectivityFailure
      ? {
        title: `${actionLabel} could not finish right now`,
        summary: TASK_DETAIL_FAILURE_CONNECTIVITY_SUMMARY,
        nextStep: TASK_DETAIL_FAILURE_CONNECTIVITY_NEXT_STEP,
        tone: "warning",
      }
      : {
        title: `${actionLabel} failed`,
        summary: TASK_DETAIL_FAILURE_DEFAULT_SUMMARY,
        nextStep: TASK_DETAIL_FAILURE_DEFAULT_NEXT_STEP,
        tone: "warning",
      };

  return {
    actionLabelText: actionLabel,
    errorMessageText: errorMessage,
    normalizedMessageText,
    receipt,
  };
}

export function buildTaskDetailFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): TaskDetailFailureReceipt {
  return taskDetailFailureState(actionLabel, errorMessage).receipt;
}
