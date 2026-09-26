// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import type { DecisionOsResponseItem } from "@/lib/decisionosContinuity";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";

export type ResponseQueueRelationship = "supplier" | "friend" | "client" | "team" | "other";

export type ResponseQueuePolicy = {
  supplier_due_hours: number;
  friend_due_hours: number;
  general_due_hours: number;
  prioritize_with_local_llm: boolean;
  allow_remote_fallback: boolean;
};

export const RESPONSE_QUEUE_POLICY_KEY = "omnyid.response-queue-policy.v1";

function scopedResponseQueuePolicyKey(userId?: string | null): string {
  return accountScopedStorageKey(RESPONSE_QUEUE_POLICY_KEY, userId ?? null);
}

function finiteNumberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeResponseQueuePolicy(value: unknown): ResponseQueuePolicy {
  const defaults = defaultResponseQueuePolicy();
  if (!isRecord(value)) {
    return defaults;
  }
  const candidate = value as Partial<Record<keyof ResponseQueuePolicy, unknown>>;
  return {
    supplier_due_hours: finiteNumberOrDefault(
      candidate.supplier_due_hours,
      defaults.supplier_due_hours,
    ),
    friend_due_hours: finiteNumberOrDefault(
      candidate.friend_due_hours,
      defaults.friend_due_hours,
    ),
    general_due_hours: finiteNumberOrDefault(
      candidate.general_due_hours,
      defaults.general_due_hours,
    ),
    prioritize_with_local_llm: booleanOrDefault(
      candidate.prioritize_with_local_llm,
      defaults.prioritize_with_local_llm,
    ),
    allow_remote_fallback: booleanOrDefault(
      candidate.allow_remote_fallback,
      defaults.allow_remote_fallback,
    ),
  };
}

function writeResponseQueuePolicyStorageValue(value: ResponseQueuePolicy, userId?: string | null): void {
  const scopedKey = scopedResponseQueuePolicyKey(userId);
  try {
    localStorage.setItem(scopedKey, JSON.stringify(value));
    if (scopedKey !== RESPONSE_QUEUE_POLICY_KEY) localStorage.removeItem(RESPONSE_QUEUE_POLICY_KEY);
  } catch {
    // Queue policy is optional local personalization; keep the in-memory normalized value.
  }
}

function removeResponseQueuePolicyStorageValue(userId?: string | null): void {
  const scopedKey = scopedResponseQueuePolicyKey(userId);
  try {
    localStorage.removeItem(scopedKey);
    if (scopedKey !== RESPONSE_QUEUE_POLICY_KEY) localStorage.removeItem(RESPONSE_QUEUE_POLICY_KEY);
  } catch {
    // ignore storage failures
  }
}

export function defaultResponseQueuePolicy(): ResponseQueuePolicy {
  return {
    supplier_due_hours: 24,
    friend_due_hours: 48,
    general_due_hours: 36,
    prioritize_with_local_llm: true,
    allow_remote_fallback: true,
  };
}

export function loadResponseQueuePolicy(userId?: string | null): ResponseQueuePolicy {
  try {
    const scopedKey = scopedResponseQueuePolicyKey(userId);
    const raw = localStorage.getItem(scopedKey) ?? localStorage.getItem(RESPONSE_QUEUE_POLICY_KEY);
    if (!raw) return defaultResponseQueuePolicy();
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeResponseQueuePolicyStorageValue(userId);
      return defaultResponseQueuePolicy();
    }
    const normalized = normalizeResponseQueuePolicy(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || localStorage.getItem(scopedKey) !== serialized) {
      writeResponseQueuePolicyStorageValue(normalized, userId);
    }
    return normalized;
  } catch {
    removeResponseQueuePolicyStorageValue(userId);
    return defaultResponseQueuePolicy();
  }
}

export function saveResponseQueuePolicy(policy: ResponseQueuePolicy, userId?: string | null) {
  writeResponseQueuePolicyStorageValue(normalizeResponseQueuePolicy(policy), userId);
}

export function inferResponseRelationship(
  item: Pick<DecisionOsResponseItem, "title" | "channel">,
): ResponseQueueRelationship {
  const text = `${item.title} ${item.channel}`.toLowerCase();
  if (
    text.includes("supplier") ||
    text.includes("vendor") ||
    text.includes("invoice") ||
    text.includes("quote") ||
    text.includes("procurement")
  ) {
    return "supplier";
  }
  if (
    text.includes("friend") ||
    text.includes("family") ||
    item.channel === "chat" ||
    item.channel === "whatsapp"
  ) {
    return "friend";
  }
  if (text.includes("client") || text.includes("customer")) {
    return "client";
  }
  if (text.includes("team") || text.includes("internal") || text.includes("coworker")) {
    return "team";
  }
  return "other";
}

function urgencyRank(urgency: string): number {
  if (urgency === "urgent") return 0;
  if (urgency === "today") return 1;
  return 2;
}

function relationshipDeadlineHours(
  relationship: ResponseQueueRelationship,
  policy: ResponseQueuePolicy,
): number {
  switch (relationship) {
    case "supplier":
      return policy.supplier_due_hours;
    case "friend":
      return policy.friend_due_hours;
    case "client":
      return Math.min(policy.general_due_hours, 24);
    case "team":
      return Math.min(policy.general_due_hours, 12);
    default:
      return policy.general_due_hours;
  }
}

export function rankResponseItems(
  items: DecisionOsResponseItem[],
  policy: ResponseQueuePolicy,
): DecisionOsResponseItem[] {
  return [...items].sort((a, b) => {
    const draftRankA = a.prepared_draft_available ? 0 : 1;
    const draftRankB = b.prepared_draft_available ? 0 : 1;
    const relationshipA = inferResponseRelationship(a);
    const relationshipB = inferResponseRelationship(b);
    const deadlineA = relationshipDeadlineHours(relationshipA, policy);
    const deadlineB = relationshipDeadlineHours(relationshipB, policy);
    const urgencyA = urgencyRank(a.urgency);
    const urgencyB = urgencyRank(b.urgency);

    if (urgencyA !== urgencyB) return urgencyA - urgencyB;
    if (draftRankA !== draftRankB) return draftRankA - draftRankB;
    if (deadlineA !== deadlineB) return deadlineA - deadlineB;
    return a.title.localeCompare(b.title);
  });
}
