// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";

export type AgentTask = {
  id: string;
  intent?: string;
  content?: string;
  status: string;
  priority: string;
  created_at: string;
  started_at?: string | null;
  thread_id?: string;
};

export type TaskDetail = AgentTask & {
  plan_json?: unknown;
  result_json?: unknown;
  error?: string | null;
};

function scalarString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function optionalString(value: unknown): string | undefined {
  const text = scalarString(value);
  return text || undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return optionalString(value);
}

function jsonValue(value: unknown): unknown {
  return value === undefined ? undefined : value;
}

export function normalizeAgentTask(value: unknown, fallback?: AgentTask): AgentTask | null {
  const record = isRecord(value) ? value : {};
  const id = optionalString(record.id) ?? fallback?.id;
  const startedAt = optionalNullableString(record.started_at);
  if (!id) return null;
  return {
    id,
    intent: optionalString(record.intent) ?? fallback?.intent,
    content: optionalString(record.content) ?? fallback?.content,
    status: scalarString(record.status, fallback?.status ?? "unknown"),
    priority: scalarString(record.priority, fallback?.priority ?? "normal"),
    created_at: scalarString(record.created_at, fallback?.created_at ?? ""),
    started_at: startedAt === undefined ? fallback?.started_at : startedAt,
    thread_id: optionalString(record.thread_id) ?? fallback?.thread_id,
  };
}

export function normalizeTaskDetailResponse(value: unknown, fallback?: AgentTask): TaskDetail | null {
  const base = normalizeAgentTask(value, fallback);
  if (!base) return null;
  const record = isRecord(value) ? value : {};
  return {
    ...base,
    plan_json: jsonValue(record.plan_json),
    result_json: jsonValue(record.result_json),
    error: optionalNullableString(record.error),
  };
}
