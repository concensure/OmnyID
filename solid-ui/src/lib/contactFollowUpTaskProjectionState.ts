// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import type { Contact } from "@/lib/contactsLocalState";
import {
  buildContactFollowUpQueueState,
  type ContactFollowUpQueueState,
} from "@/lib/contactFollowUpQueueState";
import { parseJsonValue } from "@/lib/jsonParseState";
import type { ResponseQueuePolicy } from "@/lib/responseQueuePolicy";

export const CONTACT_FOLLOW_UP_TASK_PROJECTIONS_KEY = "omnyid.contact-follow-up-task-projections.v1";

export type ContactFollowUpTaskProjectionState = {
  tasks: SendAfpMessageInput[];
  taskCount: number;
  sentTaskCount: number;
  summaryLabel: string;
  guardrailLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeId(value: unknown): string {
  const text = clean(value).toLowerCase();
  return text.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function uniqueStrings(values: readonly unknown[], limit = 64): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function priorityWeight(priority: string): number {
  if (priority === "urgent") return 90;
  if (priority === "high") return 70;
  return 45;
}

function storageKey(userId: string | null | undefined): string {
  return accountScopedStorageKey(CONTACT_FOLLOW_UP_TASK_PROJECTIONS_KEY, userId);
}

function loadSentProjectionIds(storage: Storage | null | undefined, userId: string | null | undefined): Set<string> {
  if (!storage) return new Set();
  try {
    const parsed = parseJsonValue(storage.getItem(storageKey(userId)) ?? "[]");
    if (!parsed.ok || !Array.isArray(parsed.value)) return new Set();
    return new Set(parsed.value.filter((item): item is string => typeof item === "string" && item.trim().length > 0));
  } catch {
    return new Set();
  }
}

function saveSentProjectionIds(
  ids: Set<string>,
  storage: Storage | null | undefined,
  userId: string | null | undefined,
): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey(userId), JSON.stringify([...ids].sort()));
  } catch {
    // Ignore convenience marker persistence failures.
  }
}

export function contactFollowUpTaskProjectionId(input: {
  contactId: string;
  dueAt?: string | null;
  priority?: string | null;
}): string {
  return `contact_follow_up_task:${safeId(input.contactId)}:${safeId(input.dueAt ?? "no-due")}:${safeId(input.priority ?? "normal")}`;
}

export function hasSentContactFollowUpTaskProjection(
  projectionId: string,
  storage: Storage | null | undefined = typeof localStorage === "undefined" ? null : localStorage,
  userId?: string | null,
): boolean {
  return loadSentProjectionIds(storage, userId).has(projectionId);
}

export function markContactFollowUpTaskProjectionSent(
  projectionId: string,
  storage: Storage | null | undefined = typeof localStorage === "undefined" ? null : localStorage,
  userId?: string | null,
): void {
  const ids = loadSentProjectionIds(storage, userId);
  ids.add(projectionId);
  saveSentProjectionIds(ids, storage, userId);
}

export function buildContactFollowUpTaskProjectionState(input: {
  queue?: ContactFollowUpQueueState | null;
  contacts?: readonly Contact[] | null;
  now?: Date | string | null;
  nowIso?: string | null;
  policy?: ResponseQueuePolicy | null;
  storage?: Storage | null;
  userId?: string | null;
} = {}): ContactFollowUpTaskProjectionState {
  const nowIso = clean(input.nowIso) || new Date().toISOString();
  const sentIds = loadSentProjectionIds(input.storage, input.userId);
  const queue = input.queue ?? buildContactFollowUpQueueState({
    contacts: input.contacts,
    now: input.now,
    policy: input.policy,
  });
  let sentTaskCount = 0;
  const tasks: SendAfpMessageInput[] = queue.items.flatMap((item) => {
    const contactSlug = safeId(item.contactId);
    const projectionId = contactFollowUpTaskProjectionId({
      contactId: item.contactId,
      dueAt: item.dueAt,
      priority: item.priority,
    });
    if (sentIds.has(projectionId)) {
      sentTaskCount += 1;
      return [];
    }
    const searchableTerms = uniqueStrings([
      projectionId,
      item.id,
      item.contactId,
      item.title,
      item.relationshipKind,
      item.priority,
      item.escalationStage,
      item.escalationLabel,
      item.statusLabel,
      item.reasonLabel,
      ...item.evidenceLabels,
      "contact follow-up",
      "no spam",
      "approval required",
      "decisionos",
      "tasks",
    ]);
    return {
      thread_id: `contact_follow_up:${contactSlug}`,
      from: "system://contacts",
      to: ["agent://tasks", "agent://decision-os", "agent://contacts", "agent://search"],
      timestamp: nowIso,
      type: "task",
      kind: "task",
      subtype: "contact_follow_up_task",
      content: {
        kind: "contact_follow_up_task",
        projection_id: projectionId,
        title: item.title,
        description: item.reasonLabel,
        task_type: "contact_follow_up",
        status: "open",
        priority: item.priority,
        priority_weight: priorityWeight(item.priority),
        outreach_escalation_stage: item.escalationStage,
        outreach_escalation_label: item.escalationLabel,
        due_at: item.dueAt,
        due_date: item.dueAt,
        contact_id: item.contactId,
        relationship_kind: item.relationshipKind,
        contacted_by: item.contactedBy,
        evidence_labels: item.evidenceLabels,
        no_spam_policy: true,
        approval_required_before_send: true,
        next_action: "Review the follow-up and ask the user before sending any external message.",
      },
      views: [
        {
          format: "task_card",
          content: {
            title: item.title,
            description: item.reasonLabel,
            task_type: "contact_follow_up",
            status: "pending",
            priority: item.priority,
            outreach_escalation_stage: item.escalationStage,
            due_at: item.dueAt,
            due_date: item.dueAt,
            badges: uniqueStrings([item.priority, item.relationshipKind, item.escalationLabel, "approval required", "no spam"], 8),
          },
        },
      ],
      attachments: [],
      references: [
        {
          kind: "contact",
          id: item.contactId,
          label: item.title,
        },
      ],
      metadata: {
        origin: "contacts",
        projection: "contact_follow_up_queue_to_task",
        projection_id: projectionId,
        source_queue_item_id: item.id,
        contact_id: item.contactId,
        relationship_kind: item.relationshipKind,
        contacted_by: item.contactedBy,
        due_at: item.dueAt,
        priority: item.priority,
        outreach_escalation_stage: item.escalationStage,
        outreach_escalation_label: item.escalationLabel,
        source_evidence_labels: item.evidenceLabels,
        no_spam_policy: true,
        approval_required_before_send: true,
        provider_send_blocked_until_user_approval: true,
        searchable_terms: searchableTerms,
      },
      store_in_relational: true,
    };
  });

  return {
    tasks,
    taskCount: tasks.length,
    sentTaskCount,
    summaryLabel: tasks.length > 0
      ? `${tasks.length} follow-up task${tasks.length === 1 ? "" : "s"} ready for Tasks and DecisionOS`
      : sentTaskCount > 0 ? "All due follow-up tasks have already been saved" : "No follow-up tasks are ready",
    guardrailLabels: [
      "No external message is sent by this projection.",
      "Every vendor or contact follow-up still requires explicit user approval.",
      "The task preserves contact evidence so Search, Tasks, and DecisionOS can rank it without scraping private inboxes.",
    ],
  };
}
