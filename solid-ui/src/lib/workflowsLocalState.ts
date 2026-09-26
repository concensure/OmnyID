// @locs-version: 1.0
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export const NODE_COMMENTS_KEY = "omnyid.node-comments";
export const WORKFLOW_HAS_RUN_KEY = "omnyid.workflow.has-run";
export const WORKFLOW_RUN_STATS_KEY = "omnyid.workflow.run-stats";
export const WORKFLOW_VERSIONS_KEY = "omnyid.workflow-versions";
export const WORKFLOW_TAGS_STORAGE_KEY = "omnyid.workflow-tags";
export const WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY =
  "omnyid.workflow.branchFamilies.collapsed.v1";

export type WorkflowRunStatsRecord = Record<string, { ok: number; fail: number }>;
export type WorkflowVersionEntry = { nodes: unknown[]; ts: string };
export type WorkflowVersionsRecord = Record<string, WorkflowVersionEntry[]>;

export type WorkflowRunStatusLike = {
  status?: string | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function workflowLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

function scopedWorkflowStorageKey(baseKey: string, userId?: string | null): string {
  return accountScopedStorageKey(baseKey, userId ?? null);
}

function loadWorkflowStorageValue(baseKey: string, userId?: string | null): string | null {
  const storage = workflowLocalStorage();
  if (!storage) return null;
  const scopedKey = scopedWorkflowStorageKey(baseKey, userId);
  try {
    return storage.getItem(scopedKey) ?? storage.getItem(baseKey);
  } catch {
    return null;
  }
}

function readStoredJson(key: string, userId?: string | null): unknown {
  const storage = workflowLocalStorage();
  if (!storage) return null;
  try {
    const scopedKey = scopedWorkflowStorageKey(key, userId);
    const raw = loadWorkflowStorageValue(key, userId);
    if (!raw) return null;
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeStoredJson(key, userId);
      return null;
    }
    if (storage.getItem(scopedKey) !== raw) storage.setItem(scopedKey, raw);
    if (scopedKey !== key) storage.removeItem(key);
    return parsed.value;
  } catch {
    removeStoredJson(key, userId);
    return null;
  }
}

function writeStoredJson(key: string, value: unknown, userId?: string | null): void {
  const storage = workflowLocalStorage();
  if (!storage) return;
  try {
    const scopedKey = scopedWorkflowStorageKey(key, userId);
    storage.setItem(scopedKey, JSON.stringify(value));
    if (scopedKey !== key) storage.removeItem(key);
  } catch {
    // Persistence is optional; callers should keep the in-memory state usable.
  }
}

function removeStoredJson(key: string, userId?: string | null): void {
  const storage = workflowLocalStorage();
  if (!storage) return;
  try {
    const scopedKey = scopedWorkflowStorageKey(key, userId);
    storage.removeItem(scopedKey);
    if (scopedKey !== key) storage.removeItem(key);
  } catch {
    // Persistence is optional; callers should keep the in-memory state usable.
  }
}

function readNormalizedStoredJson<T>(
  key: string,
  normalize: (value: unknown) => T,
  userId?: string | null,
): T {
  const normalized = normalize(readStoredJson(key, userId));
  const storage = workflowLocalStorage();
  if (!storage) return normalized;
  try {
    const raw = loadWorkflowStorageValue(key, userId);
    if (!raw) return normalized;
    const serialized = JSON.stringify(normalized);
    const scopedKey = scopedWorkflowStorageKey(key, userId);
    if (serialized !== raw || storage.getItem(scopedKey) !== serialized) {
      storage.setItem(scopedKey, serialized);
    }
    if (scopedKey !== key) storage.removeItem(key);
  } catch {
    // Keep the normalized in-memory value even if persistence fails.
  }
  return normalized;
}

function normalizeWorkflowTags(parsed: unknown): Record<string, string[]> {
  if (!isRecord(parsed)) return {};
  const result: Record<string, string[]> = {};
  for (const [workflowId, tags] of Object.entries(parsed)) {
    const normalizedId = readTrimmedString(workflowId);
    if (!normalizedId || !Array.isArray(tags)) continue;
    const seenTags = new Set<string>();
    const normalizedTags = tags.flatMap((tag) => {
      const normalizedTag = readTrimmedString(tag);
      if (!normalizedTag) return [];
      const tagKey = normalizedTag.toLowerCase();
      if (seenTags.has(tagKey)) return [];
      seenTags.add(tagKey);
      return [normalizedTag];
    });
    if (normalizedTags.length > 0) result[normalizedId] = normalizedTags;
  }
  return result;
}

export function loadWorkflowTags(userId?: string | null): Record<string, string[]> {
  return readNormalizedStoredJson(WORKFLOW_TAGS_STORAGE_KEY, normalizeWorkflowTags, userId);
}

export function saveWorkflowTags(values: Record<string, string[]>, userId?: string | null): void {
  writeStoredJson(WORKFLOW_TAGS_STORAGE_KEY, normalizeWorkflowTags(values), userId);
}

function normalizeWorkflowNodeComments(parsed: unknown): Record<string, string> {
  if (!isRecord(parsed)) return {};
  const result: Record<string, string> = {};
  for (const [nodeId, comment] of Object.entries(parsed)) {
    const normalizedId = readTrimmedString(nodeId);
    const normalizedComment = readTrimmedString(comment);
    if (!normalizedId || !normalizedComment) continue;
    result[normalizedId] = normalizedComment;
  }
  return result;
}

export function loadWorkflowNodeComments(userId?: string | null): Record<string, string> {
  return readNormalizedStoredJson(NODE_COMMENTS_KEY, normalizeWorkflowNodeComments, userId);
}

export function saveWorkflowNodeComments(
  values: Record<string, string>,
  userId?: string | null,
): void {
  writeStoredJson(NODE_COMMENTS_KEY, normalizeWorkflowNodeComments(values), userId);
}

function normalizeWorkflowHasRun(parsed: unknown): Set<string> {
  if (!Array.isArray(parsed)) return new Set<string>();
  return new Set(
    parsed
      .map((workflowId) => readTrimmedString(workflowId))
      .filter((workflowId): workflowId is string => workflowId !== null),
  );
}

export function loadWorkflowHasRun(userId?: string | null): Set<string> {
  return normalizeWorkflowHasRun(readNormalizedStoredJson(WORKFLOW_HAS_RUN_KEY, (value) => [
    ...normalizeWorkflowHasRun(value),
  ], userId));
}

export function saveWorkflowHasRun(values: ReadonlySet<string>, userId?: string | null): void {
  writeStoredJson(WORKFLOW_HAS_RUN_KEY, [...normalizeWorkflowHasRun([...values])], userId);
}

function normalizeWorkflowRunStats(parsed: unknown): WorkflowRunStatsRecord {
  if (!isRecord(parsed)) return {};
  const result: WorkflowRunStatsRecord = {};
  for (const [workflowId, stats] of Object.entries(parsed)) {
    const normalizedId = readTrimmedString(workflowId);
    if (!normalizedId || !isRecord(stats)) continue;
    const { ok, fail } = stats;
    if (!isFiniteNumber(ok) || ok < 0 || !isFiniteNumber(fail) || fail < 0) continue;
    result[normalizedId] = { ok, fail };
  }
  return result;
}

export function loadWorkflowRunStats(userId?: string | null): WorkflowRunStatsRecord {
  return readNormalizedStoredJson(WORKFLOW_RUN_STATS_KEY, normalizeWorkflowRunStats, userId);
}

export function saveWorkflowRunStats(
  values: WorkflowRunStatsRecord,
  userId?: string | null,
): void {
  writeStoredJson(WORKFLOW_RUN_STATS_KEY, normalizeWorkflowRunStats(values), userId);
}

function normalizeWorkflowVersions(parsed: unknown): WorkflowVersionsRecord {
  if (!isRecord(parsed)) return {};
  const result: WorkflowVersionsRecord = {};
  for (const [workflowId, versions] of Object.entries(parsed)) {
    const normalizedId = readTrimmedString(workflowId);
    if (!normalizedId || !Array.isArray(versions)) continue;
    const normalizedVersions = versions.flatMap((version) => {
      if (!isRecord(version) || !Array.isArray(version.nodes)) return [];
      const ts = readTrimmedString(version.ts);
      return ts && !Number.isNaN(Date.parse(ts)) ? [{ nodes: version.nodes, ts }] : [];
    });
    if (normalizedVersions.length > 0) result[normalizedId] = normalizedVersions;
  }
  return result;
}

export function loadWorkflowVersions(userId?: string | null): WorkflowVersionsRecord {
  return readNormalizedStoredJson(WORKFLOW_VERSIONS_KEY, normalizeWorkflowVersions, userId);
}

export function saveWorkflowVersions(
  values: WorkflowVersionsRecord,
  userId?: string | null,
): void {
  writeStoredJson(WORKFLOW_VERSIONS_KEY, normalizeWorkflowVersions(values), userId);
}

export function workflowHasRunAfterMark(
  current: ReadonlySet<string>,
  workflowId: string | null | undefined,
): Set<string> {
  const next = new Set(current);
  if (workflowId) next.add(workflowId);
  return next;
}

export function workflowRunStatsFromRuns(
  runs: readonly WorkflowRunStatusLike[],
): { ok: number; fail: number } | null {
  let ok = 0;
  let fail = 0;
  for (const run of runs) {
    const status = run.status;
    if (status === "completed" || status === "success" || status === "done") ok += 1;
    else if (status === "failed" || status === "error" || status === "cancelled") fail += 1;
  }
  return ok + fail > 0 ? { ok, fail } : null;
}

export function workflowRunStatsAfterUpdate(
  current: WorkflowRunStatsRecord,
  workflowId: string | null | undefined,
  runs: readonly WorkflowRunStatusLike[],
): WorkflowRunStatsRecord {
  if (!workflowId) return current;
  const stats = workflowRunStatsFromRuns(runs);
  if (!stats) return current;
  return { ...current, [workflowId]: stats };
}

export function workflowVersionsAfterSnapshot(
  current: WorkflowVersionsRecord,
  workflowId: string | null | undefined,
  snapshot: WorkflowVersionEntry,
  limit = 10,
): WorkflowVersionsRecord {
  if (!workflowId) return current;
  const existing = current[workflowId] ?? [];
  return {
    ...current,
    [workflowId]: [snapshot, ...existing].slice(0, limit),
  };
}

function normalizeCollapsedWorkflowBranchFamilies(parsed: unknown): Set<string> {
  if (!Array.isArray(parsed)) return new Set<string>();
  return new Set(
    parsed
      .map((familyId) => readTrimmedString(familyId))
      .filter((familyId): familyId is string => familyId !== null),
  );
}

export function loadCollapsedWorkflowBranchFamilies(userId?: string | null): Set<string> {
  return normalizeCollapsedWorkflowBranchFamilies(
    readNormalizedStoredJson(WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY, (value) => [
      ...normalizeCollapsedWorkflowBranchFamilies(value),
    ], userId),
  );
}

export function saveCollapsedWorkflowBranchFamilies(
  values: ReadonlySet<string>,
  userId?: string | null,
): void {
  writeStoredJson(
    WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY,
    [...normalizeCollapsedWorkflowBranchFamilies([...values])],
    userId,
  );
}
