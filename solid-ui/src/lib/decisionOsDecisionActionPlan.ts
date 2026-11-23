// @locs-version: 1.0
export type DecisionActionTarget = {
  id: string;
  title: string;
  effort?: string | null;
};

export type DecisionActionDiaryEntry = {
  ts: string;
  type: "decision";
  icon: string;
  title: string;
  meta: string;
  detail?: string;
  decisionId: string;
  outcomeCheckAt?: string;
  note?: string;
};

export type DecisionApprovalPlan = {
  toastMessage: string;
  outcomeCheckAt: string;
  diaryEntry: DecisionActionDiaryEntry;
  outcomeCheck:
    | {
        id: string;
        title: string;
        checkAt: string;
      }
    | null;
};

export type DecisionSnoozePlan = {
  toastMessage: string;
  diaryEntry: DecisionActionDiaryEntry;
};

export type DecisionDelegatePlan = {
  toastMessage: string;
  actionChip: {
    id: string;
    label: string;
  };
};

export type DecisionDismissPlan = {
  toastMessage: string;
};

export type DecisionBulkDismissPlan = {
  toastMessage: string;
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function decisionApprovalPlan(args: {
  decision: DecisionActionTarget | null | undefined;
  decisionId: string;
  approvalNote?: string | null;
  now?: Date;
}): DecisionApprovalPlan {
  const now = args.now ?? new Date();
  const note = args.approvalNote?.trim() || undefined;
  const decision = args.decision;
  const outcomeCheckAt = new Date(now.getTime() + THREE_DAYS_MS).toISOString();

  return {
    toastMessage: note
      ? "Decision approved. Note saved with the record."
      : "Decision approved.",
    outcomeCheckAt,
    diaryEntry: {
      ts: now.toISOString(),
      type: "decision",
      icon: "✅",
      title: decision?.title ?? args.decisionId,
      meta: "approved",
      detail: note,
      decisionId: args.decisionId,
      outcomeCheckAt: decision ? outcomeCheckAt : undefined,
      note,
    },
    outcomeCheck: decision
      ? {
          id: args.decisionId,
          title: decision.title,
          checkAt: outcomeCheckAt,
        }
      : null,
  };
}

export function decisionSnoozePlan(args: {
  decision: DecisionActionTarget | null | undefined;
  decisionId: string;
  snoozeLabel: string;
  now?: Date;
}): DecisionSnoozePlan {
  const now = args.now ?? new Date();
  const title = args.decision?.title ?? args.decisionId;
  return {
    toastMessage: `Snoozed until ${args.snoozeLabel}.`,
    diaryEntry: {
      ts: now.toISOString(),
      type: "decision",
      icon: "💤",
      title,
      meta: `snoozed until ${args.snoozeLabel}`,
      decisionId: args.decisionId,
    },
  };
}

export function decisionDelegatePlan(args: {
  decision: DecisionActionTarget | null | undefined;
  decisionId: string;
}): DecisionDelegatePlan {
  const title = args.decision?.title ?? args.decisionId;
  return {
    toastMessage: "Delegated to your agent.",
    actionChip: {
      id: `delegate-${args.decisionId}`,
      label: `Delegate: ${title}`,
    },
  };
}

export function decisionDismissPlan(_args: {
  decision: DecisionActionTarget | null | undefined;
  decisionId: string;
}): DecisionDismissPlan {
  return {
    toastMessage: "Decision dismissed.",
  };
}

export function decisionBulkDismissPlan(args: {
  dismissedCount: number;
}): DecisionBulkDismissPlan {
  return {
    toastMessage: `${args.dismissedCount} low-impact decision${args.dismissedCount === 1 ? "" : "s"} dismissed.`,
  };
}
