// @locs-version: 1.0
import { buildContactEngagementState } from "@/lib/contactEngagementState";
import type { Contact } from "@/lib/contactsLocalState";
import {
  buildContactFollowUpQueueState,
  type ContactFollowUpQueueState,
} from "@/lib/contactFollowUpQueueState";
import {
  buildContactFollowUpTaskProjectionState,
  type ContactFollowUpTaskProjectionState,
} from "@/lib/contactFollowUpTaskProjectionState";
import {
  buildContactResponseEvidenceProjectionState,
  type ContactResponseEvidenceProjectionState,
} from "@/lib/contactResponseEvidenceProjectionState";
import {
  buildContactFollowUpOutcomeProjectionState,
  type ContactFollowUpOutcomeProjectionState,
} from "@/lib/contactFollowUpOutcomeProjectionState";
import type { ResponseQueuePolicy } from "@/lib/responseQueuePolicy";

export type ContactOutreachHealthStatus =
  | "needs_contacts"
  | "needs_outreach"
  | "follow_up_due"
  | "task_ready"
  | "evidence_ready"
  | "waiting"
  | "healthy";

export type ContactOutreachHealthState = {
  status: ContactOutreachHealthStatus;
  summaryLabel: string;
  nextActionLabel: string;
  contactCount: number;
  notContactedCount: number;
  awaitingCount: number;
  dueCount: number;
  responseRecordedCount: number;
  taskReadyCount: number;
  evidenceReadyCount: number;
  outcomeReadyCount: number;
  savedTaskCount: number;
  savedEvidenceCount: number;
  savedOutcomeCount: number;
  metricLabels: string[];
};

export function buildContactOutreachHealthState(input: {
  contacts?: readonly Contact[] | null;
  now?: Date | string | null;
  policy?: ResponseQueuePolicy | null;
  queue?: ContactFollowUpQueueState | null;
  taskProjection?: ContactFollowUpTaskProjectionState | null;
  evidenceProjection?: ContactResponseEvidenceProjectionState | null;
  outcomeProjection?: ContactFollowUpOutcomeProjectionState | null;
  storage?: Storage | null;
  userId?: string | null;
} = {}): ContactOutreachHealthState {
  const contacts = [...(input.contacts ?? [])];
  const queue = input.queue ?? buildContactFollowUpQueueState({
    contacts,
    now: input.now,
    policy: input.policy,
  });
  const taskProjection = input.taskProjection ?? buildContactFollowUpTaskProjectionState({
    queue,
    storage: input.storage,
    userId: input.userId,
  });
  const evidenceProjection = input.evidenceProjection ?? buildContactResponseEvidenceProjectionState({
    contacts,
    storage: input.storage,
    userId: input.userId,
  });
  const outcomeProjection = input.outcomeProjection ?? buildContactFollowUpOutcomeProjectionState({
    contacts,
    storage: input.storage,
    userId: input.userId,
  });
  const notContactedCount = contacts.filter((contact) => (
    buildContactEngagementState({ contact, now: input.now, policy: input.policy }).status === "not_contacted"
  )).length;
  const contactCount = contacts.length;
  const taskReadyCount = taskProjection.taskCount;
  const outcomeReadyCount = outcomeProjection.outcomeCount;
  const evidenceReadyCount = evidenceProjection.evidenceCount + outcomeReadyCount;
  const status: ContactOutreachHealthStatus = contactCount === 0
    ? "needs_contacts"
    : notContactedCount === contactCount ? "needs_outreach"
      : queue.dueCount > 0 && taskReadyCount === 0 ? "follow_up_due"
        : taskReadyCount > 0 ? "task_ready"
          : evidenceReadyCount > 0 ? "evidence_ready"
            : queue.awaitingCount > 0 ? "waiting" : "healthy";

  const summaryLabel = status === "needs_contacts"
    ? "No contacts imported yet"
    : status === "needs_outreach" ? `${notContactedCount} contact${notContactedCount === 1 ? "" : "s"} need first outreach`
      : status === "follow_up_due" ? `${queue.dueCount} follow-up${queue.dueCount === 1 ? "" : "s"} due; tasks already saved or blocked`
        : status === "task_ready" ? `${taskReadyCount} follow-up task${taskReadyCount === 1 ? "" : "s"} ready to save`
          : status === "evidence_ready" ? `${evidenceReadyCount} outreach evidence note${evidenceReadyCount === 1 ? "" : "s"} ready to save`
            : status === "waiting" ? `${queue.awaitingCount} contact${queue.awaitingCount === 1 ? "" : "s"} awaiting response`
              : "Outreach loop is current";
  const nextActionLabel = status === "needs_contacts"
    ? "Import contacts or add the first vendor, helper, celebrant, or family contact."
    : status === "needs_outreach" ? "Mark first outreach after the user or agent contacts these people."
      : status === "follow_up_due" ? "Review saved follow-up tasks before escalating or sending another message."
        : status === "task_ready" ? "Save follow-up tasks into Tasks and DecisionOS before any external send."
          : status === "evidence_ready" ? "Save response or outcome evidence so Search and Knowledge Graph can reuse the closed loop."
            : status === "waiting" ? "Wait for replies or shorten the SLA only if the contact is urgent."
              : "Keep recording replies and contact attempts as they happen.";

  return {
    status,
    summaryLabel,
    nextActionLabel,
    contactCount,
    notContactedCount,
    awaitingCount: queue.awaitingCount,
    dueCount: queue.dueCount,
    responseRecordedCount: queue.responseRecordedCount,
    taskReadyCount,
    evidenceReadyCount,
    outcomeReadyCount,
    savedTaskCount: taskProjection.sentTaskCount,
    savedEvidenceCount: evidenceProjection.sentEvidenceCount + outcomeProjection.sentOutcomeCount,
    savedOutcomeCount: outcomeProjection.sentOutcomeCount,
    metricLabels: [
      `${contactCount} contacts`,
      `${notContactedCount} untouched`,
      `${queue.awaitingCount} waiting`,
      `${queue.dueCount} due`,
      `${queue.responseRecordedCount} replied`,
      `${taskReadyCount} task-ready`,
      `${evidenceReadyCount} evidence-ready`,
      `${outcomeReadyCount} outcome-ready`,
    ],
  };
}
