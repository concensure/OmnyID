export function decisionOsActionEffectPlan(execution) {
  if (execution.kind === "approve") {
    return {
      kind: "approve",
      toastMessage: execution.approval.toastMessage,
      toastOptions: {
        actionLabel: "Undo •",
        durationMs: 3000,
      },
      timeoutDiaryEntry: execution.approval.diaryEntry,
      timeoutOutcomeCheck: execution.approval.outcomeCheck,
    };
  }

  if (execution.kind === "dismiss") {
    return {
      kind: "dismiss",
      toastMessage: execution.dismiss.toastMessage,
      toastOptions: null,
    };
  }

  if (execution.kind === "snooze") {
    return {
      kind: "snooze",
      toastMessage: execution.snooze.toastMessage,
      toastOptions: null,
      immediateDiaryEntry: execution.snooze.diaryEntry,
    };
  }

  return {
    kind: "delegate",
    toastMessage: execution.delegate.toastMessage,
    toastOptions: null,
    actionChip: execution.delegate.actionChip,
  };
}
