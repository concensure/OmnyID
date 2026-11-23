// @locs-version: 1.0
export type DecisionOsActionStateDecision = {
  id: string;
  title: string;
  effort?: string | null;
};

export function decisionOsActionTarget<
  TDecision extends DecisionOsActionStateDecision,
>(
  decisions: readonly TDecision[],
  decisionId: string,
): TDecision | null {
  return decisions.find((decision) => decision.id === decisionId) ?? null;
}

export function decisionOsApproveUiState(args: {
  decisionId: string;
  selectedId: string | null;
  dismissed: ReadonlySet<string>;
  completedToday: number;
  timeSavedMinutes: number;
  effortMinutes?: number;
}): {
  snapshot: {
    dismissed: Set<string>;
    completedToday: number;
    timeSavedMinutes: number;
  };
  next: {
    dismissed: Set<string>;
    completedToday: number;
    timeSavedMinutes: number;
    selectedId: string | null;
  };
} {
  return {
    snapshot: {
      dismissed: new Set(args.dismissed),
      completedToday: args.completedToday,
      timeSavedMinutes: args.timeSavedMinutes,
    },
    next: {
      dismissed: new Set([...args.dismissed, args.decisionId]),
      completedToday: args.completedToday + 1,
      timeSavedMinutes: args.timeSavedMinutes + (args.effortMinutes ?? 0),
      selectedId: args.selectedId === args.decisionId ? null : args.selectedId,
    },
  };
}

export function decisionOsDismissUiState(args: {
  decisionId: string;
  selectedId: string | null;
  dismissed: ReadonlySet<string>;
  completedToday: number;
}): {
  snapshot: {
    dismissed: Set<string>;
    completedToday: number;
  };
  next: {
    dismissed: Set<string>;
    selectedId: string | null;
  };
} {
  return {
    snapshot: {
      dismissed: new Set(args.dismissed),
      completedToday: args.completedToday,
    },
    next: {
      dismissed: new Set([...args.dismissed, args.decisionId]),
      selectedId: args.selectedId === args.decisionId ? null : args.selectedId,
    },
  };
}

export function decisionOsSnoozeUiState(args: {
  decisionId: string;
  selectedId: string | null;
}): {
  selectedId: string | null;
  focusedIndex: -1;
} {
  return {
    selectedId: args.selectedId === args.decisionId ? null : args.selectedId,
    focusedIndex: -1,
  };
}
