// @locs-version: 1.0
import {
  type DecisionOsActionItem,
  type DecisionOsPriorityCard,
} from "./decisionosContinuity";
import type { DecisionOsQueueBootstrapState } from "./decisionOsQueueBootstrapState";
import {
  CONTINUITY_PRIORITY_DECISION_ID,
  decisionIdFromActionItem,
} from "afp-ts/continuity";
import {
  buildTrustAwareActionDecision,
  buildTrustAwarePriorityDecision,
  type DecisionOsTrustAwareDecision,
} from "./decisionOsContinuityDecisionAssembly";

export type QueueEntry = {
  id: string;
  decision: DecisionOsTrustAwareDecision;
  source: "priority" | "action";
  queuePriorityCard?: DecisionOsPriorityCard | null;
  queueActionItem?: DecisionOsActionItem | null;
};

export const DECISION_QUEUE_URGENCY_STYLE: Record<string, { badge: string; border: string; label: string }> = {
  urgent: { badge: "bg-red-100 text-red-700 border-red-200", border: "border-red-300/50", label: "URGENT" },
  high: { badge: "bg-amber-100 text-amber-700 border-amber-200", border: "border-amber-300/50", label: "HIGH" },
  medium: { badge: "bg-blue-100 text-blue-700 border-blue-200", border: "border-blue-300/50", label: "MEDIUM" },
  low: { badge: "bg-slate-100 text-slate-600 border-slate-200", border: "border-slate-200/50", label: "LOW" },
};

export function decisionQueueUrgencyStyle(urgency: string) {
  return DECISION_QUEUE_URGENCY_STYLE[urgency] ?? DECISION_QUEUE_URGENCY_STYLE.medium;
}

export function buildQueueEntries(
  queueState: DecisionOsQueueBootstrapState,
): QueueEntry[] {
  const entries: QueueEntry[] = [];

  if (queueState.queuePriorityCard) {
    entries.push({
      id: CONTINUITY_PRIORITY_DECISION_ID,
      decision: buildTrustAwarePriorityDecision(
        queueState.queuePriorityCard,
        queueState.queueContextPanelItems,
      ),
      source: "priority",
      queuePriorityCard: queueState.queuePriorityCard,
    });
  }

  for (const item of queueState.queueActionItems) {
    entries.push({
      id: decisionIdFromActionItem(item),
      decision: buildTrustAwareActionDecision(item, queueState.queueContextPanelItems),
      source: "action",
      queueActionItem: item,
    });
  }

  return entries;
}
