// @locs-version: 1.0
export type DecisionOsMagicExecutionContextItem = {
  sourceType?: "thread" | "email" | "note";
};

export type DecisionOsMagicExecutionDecision<
  TContextItem extends DecisionOsMagicExecutionContextItem = DecisionOsMagicExecutionContextItem,
> = {
  id: string;
  goalBreakdown?: {
    status?: string;
  };
  contextItems?: TContextItem[];
};

export type DecisionOsMagicExecutionAction =
  | { kind: "approve"; decisionId: string }
  | { kind: "dismiss"; decisionId: string }
  | { kind: "search"; term: string }
  | { kind: "open-thread"; decisionId: string }
  | { kind: "none" };

export type DecisionOsMagicExecutionPlan<
  TDecision extends DecisionOsMagicExecutionDecision<TContextItem>,
  TContextItem extends DecisionOsMagicExecutionContextItem,
> =
  | { kind: "approve"; decision: TDecision; requiresGoalBreakdown: boolean }
  | { kind: "dismiss"; decisionId: string }
  | { kind: "search"; term: string }
  | { kind: "open-thread"; item: TContextItem }
  | { kind: "none" };

export type DecisionOsMagicDispatchPlan<
  TDecision extends DecisionOsMagicExecutionDecision<TContextItem>,
  TContextItem extends DecisionOsMagicExecutionContextItem,
> =
  | { kind: "open-goal-breakdown"; decision: TDecision }
  | { kind: "handle-action"; decisionId: string; action: "approve" | "dismiss" }
  | { kind: "dispatch-search"; term: string }
  | { kind: "open-thread"; item: TContextItem }
  | { kind: "none" };

export function decisionOsMagicExecutionPlan<
  TDecision extends DecisionOsMagicExecutionDecision<TContextItem>,
  TContextItem extends DecisionOsMagicExecutionContextItem = DecisionOsMagicExecutionContextItem,
>(args: {
  action: DecisionOsMagicExecutionAction;
  decisions: readonly TDecision[];
}): DecisionOsMagicExecutionPlan<TDecision, TContextItem> {
  const action = args.action;
  switch (action.kind) {
    case "approve": {
      const decision = args.decisions.find((item) => item.id === action.decisionId);
      if (!decision) return { kind: "none" };
      return {
        kind: "approve",
        decision,
        requiresGoalBreakdown: decision.goalBreakdown?.status === "needs_breakdown",
      };
    }
    case "dismiss":
      return { kind: "dismiss", decisionId: action.decisionId };
    case "search":
      return { kind: "search", term: action.term };
    case "open-thread": {
      const decision = args.decisions.find((item) => item.id === action.decisionId);
      const threadItem = decision?.contextItems?.find((item) => item.sourceType === "thread");
      return threadItem ? { kind: "open-thread", item: threadItem } : { kind: "none" };
    }
    case "none":
    default:
      return { kind: "none" };
  }
}

export function decisionOsMagicDispatchPlan<
  TDecision extends DecisionOsMagicExecutionDecision<TContextItem>,
  TContextItem extends DecisionOsMagicExecutionContextItem,
>(execution: DecisionOsMagicExecutionPlan<TDecision, TContextItem>): DecisionOsMagicDispatchPlan<TDecision, TContextItem> {
  switch (execution.kind) {
    case "approve":
      return execution.requiresGoalBreakdown
        ? { kind: "open-goal-breakdown", decision: execution.decision }
        : { kind: "handle-action", decisionId: execution.decision.id, action: "approve" };
    case "dismiss":
      return { kind: "handle-action", decisionId: execution.decisionId, action: "dismiss" };
    case "search":
      return { kind: "dispatch-search", term: execution.term };
    case "open-thread":
      return { kind: "open-thread", item: execution.item };
    case "none":
    default:
      return { kind: "none" };
  }
}
