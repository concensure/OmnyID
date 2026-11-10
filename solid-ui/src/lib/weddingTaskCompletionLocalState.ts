// @locs-version: 2.1
import { weddingAccountScopedStorageKey } from "@/lib/weddingLocalAccountScope";
export const WEDDING_TASK_COMPLETION_KEY_PREFIX = "omnyid.wedding-task-completion";
export const WEDDING_TASK_COMPLETION_EVENT = "omnyid:wedding-task-completion";

export type WeddingTaskCompletionScope = {
  taskId?: string | null;
  responseWorkspaceId?: string | null;
  weddingPlanId?: string | null;
};

export type WeddingTaskCompletionRecord = Required<WeddingTaskCompletionScope> & {
  completed: boolean;
  savedAt: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function storageOrNull(storage?: Storage | null): Storage | null {
  return storage ?? globalThis.localStorage ?? globalThis.window?.localStorage ?? null;
}

function safeKeyPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9:_-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

export function weddingTaskCompletionKey(scope: WeddingTaskCompletionScope): string | null {
  const taskId = clean(scope.taskId);
  if (!taskId) return null;
  const workspace = clean(scope.responseWorkspaceId) || "no_workspace";
  const plan = clean(scope.weddingPlanId) || "no_plan";
  return weddingAccountScopedStorageKey(`${WEDDING_TASK_COMPLETION_KEY_PREFIX}:${safeKeyPart(plan)}:${safeKeyPart(workspace)}:${safeKeyPart(taskId)}`);
}

function normalizeRecord(value: unknown): WeddingTaskCompletionRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const taskId = clean(record.taskId);
  const savedAt = clean(record.savedAt);
  if (!taskId || !savedAt || Number.isNaN(new Date(savedAt).getTime()) || typeof record.completed !== "boolean") return null;
  return {
    taskId,
    responseWorkspaceId: clean(record.responseWorkspaceId),
    weddingPlanId: clean(record.weddingPlanId),
    completed: record.completed,
    savedAt,
  };
}

function recordMatchesScope(record: WeddingTaskCompletionRecord, scope: WeddingTaskCompletionScope): boolean {
  const taskId = clean(scope.taskId);
  const responseWorkspaceId = clean(scope.responseWorkspaceId);
  const weddingPlanId = clean(scope.weddingPlanId);
  return record.taskId === taskId
    && record.responseWorkspaceId === responseWorkspaceId
    && record.weddingPlanId === weddingPlanId;
}

export function saveWeddingTaskCompletion(
  scope: WeddingTaskCompletionScope & { completed: boolean; nowIso?: string | null },
  storage?: Storage | null,
): WeddingTaskCompletionRecord | null {
  const target = storageOrNull(storage);
  const key = weddingTaskCompletionKey(scope);
  const taskId = clean(scope.taskId);
  if (!target || !key || !taskId) return null;
  const record: WeddingTaskCompletionRecord = {
    taskId,
    responseWorkspaceId: clean(scope.responseWorkspaceId),
    weddingPlanId: clean(scope.weddingPlanId),
    completed: scope.completed,
    savedAt: clean(scope.nowIso) || new Date().toISOString(),
  };
  try {
    target.setItem(key, JSON.stringify(record));
    globalThis.window?.dispatchEvent(new CustomEvent(WEDDING_TASK_COMPLETION_EVENT, { detail: record }));
    return record;
  } catch {
    return null;
  }
}

export function loadWeddingTaskCompletion(
  scope: WeddingTaskCompletionScope,
  storage?: Storage | null,
): WeddingTaskCompletionRecord | null {
  const target = storageOrNull(storage);
  const key = weddingTaskCompletionKey(scope);
  if (!target || !key) return null;
  try {
    const raw = target.getItem(key);
    if (!raw) return null;
    const record = normalizeRecord(JSON.parse(raw));
    if (!record || !recordMatchesScope(record, scope)) {
      target.removeItem(key);
      return null;
    }
    return record;
  } catch {
    try {
      target.removeItem(key);
    } catch {
      // Ignore unavailable storage cleanup.
    }
    return null;
  }
}
