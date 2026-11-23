// @locs-version: 1.0
import type { QueueEntry } from "./decisionQueueModel";
import { buildQueueEntries } from "./decisionQueueModel";
import type { DecisionOsQueueBootstrapState } from "./decisionOsQueueBootstrapState";
import {
  decisionOsContinuityDecisionThreadLabel,
  openContinuityDecisionThreadTarget,
} from "./decisionosNavigation";

export function decisionQueueEntryDestinationLabel(entry: QueueEntry | null): string {
  if (!entry) return "context";
  return decisionOsContinuityDecisionThreadLabel(
    entry.queuePriorityCard,
    entry.queueActionItem ? [entry.queueActionItem] : [],
  );
}

export function openDecisionQueueEntryTarget(entry: QueueEntry | null) {
  if (!entry) return;
  openContinuityDecisionThreadTarget(
    entry.queuePriorityCard,
    entry.queueActionItem ? [entry.queueActionItem] : [],
  );
}

export function decisionQueuePriorityEntry(args: {
  queueState: DecisionOsQueueBootstrapState;
}): QueueEntry | null {
  return buildQueueEntries(args.queueState)[0] ?? null;
}

export function openDecisionQueuePriorityTarget(args: {
  queueState: DecisionOsQueueBootstrapState;
}) {
  openDecisionQueueEntryTarget(decisionQueuePriorityEntry(args));
}
