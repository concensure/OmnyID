// @locs-version: 1.0
export function decisionOsTopBlockerPlan<TDecision extends { id: string }>(args: {
  decisions: readonly TDecision[];
  blockerId: string | null | undefined;
}):
  | { kind: "focus-decision"; selectedId: string | null; focusedIndex: number }
  | { kind: "none" } {
  if (!args.blockerId) return { kind: "none" };
  const focusedIndex = args.decisions.findIndex((decision) => decision.id === args.blockerId);
  return {
    kind: "focus-decision",
    selectedId: args.blockerId,
    focusedIndex,
  };
}

export function decisionOsQueuePriorityPlan<
  TPriorityCard,
  TActionItem,
  TContextPanelItem,
>(args: {
  queueState: {
    queuePriorityCard: TPriorityCard | null;
      queueActionItems: readonly TActionItem[];
      queueContextPanelItems: readonly TContextPanelItem[];
    };
}):
  | {
      kind: "open-queue-priority";
      queueState: {
        queuePriorityCard: TPriorityCard | null;
        queueActionItems: readonly TActionItem[];
        queueContextPanelItems: readonly TContextPanelItem[];
      };
    }
  | { kind: "none" } {
  const queuePriorityCard = args.queueState.queuePriorityCard;
  const queueActionItems = args.queueState.queueActionItems;
  const queueContextPanelItems = args.queueState.queueContextPanelItems;
  if (!queuePriorityCard && queueActionItems.length === 0) return { kind: "none" };
  return {
    kind: "open-queue-priority",
    queueState: {
      queuePriorityCard,
      queueActionItems,
      queueContextPanelItems,
    },
  };
}
