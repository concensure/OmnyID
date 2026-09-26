// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type NavBarLastRun = {
  name: string;
  finishedAt: number;
};

export const SESSION_RUNS_KEY = "omnyid.session.runs_started";
export const SESSION_STARTED_KEY = "omnyid.session.started";
export const LAST_RUN_KEY = "omnyid.fleet.lastrun";
export const AGENT_ACTIVE_SINCE_KEY = "omnyid.fleet.active_since";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function writeNavBarLocalStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function removeNavBarLocalStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function writeNavBarSessionStorageValue(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function removeNavBarSessionStorageValue(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function loadNavBarFlag(key: string): boolean {
  const raw = localStorage.getItem(key);
  if (raw === "1") return true;
  if (raw === "0" || raw === null) return false;
  writeNavBarLocalStorageValue(key, "0");
  return false;
}

export function loadNavBarLastVisited(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeNavBarLocalStorageValue(key);
      return {};
    }
    const normalized = loadNavBarLastVisitedFromValue(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeNavBarLocalStorageValue(key, serialized);
    return normalized;
  } catch {
    removeNavBarLocalStorageValue(key);
    return {};
  }
}

export function saveNavBarLastVisited(key: string, value: Record<string, number>): void {
  writeNavBarLocalStorageValue(key, JSON.stringify(loadNavBarLastVisitedFromValue(value)));
}

export function loadNavBarWorkflowFlag(key: string): boolean {
  try {
    return loadNavBarFlag(key);
  } catch {
    return false;
  }
}

export function saveNavBarWorkflowFlag(key: string, enabled: boolean): void {
  writeNavBarLocalStorageValue(key, enabled ? "1" : "0");
}

export function clearNavBarWorkflowFlag(key: string): void {
  removeNavBarLocalStorageValue(key);
}

export function loadNavBarSeenFlag(key: string): boolean {
  try {
    return loadNavBarFlag(key);
  } catch {
    return false;
  }
}

export function saveNavBarSeenFlag(key: string, seen: boolean): void {
  writeNavBarLocalStorageValue(key, seen ? "1" : "0");
}

export function loadNavBarLlmLastPingFailed(): boolean {
  try {
    const raw = localStorage.getItem("omnyid.llm.last_ping_ok");
    if (raw === "0") return true;
    if (raw === "1" || raw === null) return false;
    writeNavBarLocalStorageValue("omnyid.llm.last_ping_ok", "1");
    return false;
  } catch {
    return false;
  }
}

export function loadNavBarSessionRunsStarted(): number {
  try {
    const raw = sessionStorage.getItem(SESSION_RUNS_KEY);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    const normalized = Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
    if (String(normalized) !== raw) writeNavBarSessionStorageValue(SESSION_RUNS_KEY, String(normalized));
    return normalized;
  } catch {
    return 0;
  }
}

export function saveNavBarSessionRunsStarted(value: number): void {
  const normalized = Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
  writeNavBarSessionStorageValue(SESSION_RUNS_KEY, String(normalized));
}

export function loadNavBarSessionStarted(): number | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STARTED_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    const normalized = Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
    if (normalized !== null && String(normalized) !== raw) {
      writeNavBarSessionStorageValue(SESSION_STARTED_KEY, String(normalized));
    }
    if (normalized === null) removeNavBarSessionStorageValue(SESSION_STARTED_KEY);
    return normalized;
  } catch {
    removeNavBarSessionStorageValue(SESSION_STARTED_KEY);
    return null;
  }
}

export function saveNavBarSessionStarted(value: number): number {
  const normalized = Number.isFinite(value) && value >= 0 ? Math.trunc(value) : Date.now();
  writeNavBarSessionStorageValue(SESSION_STARTED_KEY, String(normalized));
  return normalized;
}

export function loadNavBarLastRun(): NavBarLastRun | null {
  try {
    const raw = localStorage.getItem(LAST_RUN_KEY);
    if (!raw) return null;
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeNavBarLocalStorageValue(LAST_RUN_KEY);
      return null;
    }
    const normalized = normalizeNavBarLastRun(parsed.value);
    if (!normalized) {
      removeNavBarLocalStorageValue(LAST_RUN_KEY);
      return null;
    }
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeNavBarLocalStorageValue(LAST_RUN_KEY, serialized);
    return normalized;
  } catch {
    removeNavBarLocalStorageValue(LAST_RUN_KEY);
    return null;
  }
}

export function saveNavBarLastRun(value: NavBarLastRun | null): void {
  if (!value) {
    removeNavBarLocalStorageValue(LAST_RUN_KEY);
    return;
  }
  const normalized = normalizeNavBarLastRun(value);
  if (!normalized) {
    removeNavBarLocalStorageValue(LAST_RUN_KEY);
    return;
  }
  writeNavBarLocalStorageValue(LAST_RUN_KEY, JSON.stringify(normalized));
}

export function loadNavBarAgentActiveSince(): Record<string, number> {
  try {
    const raw = localStorage.getItem(AGENT_ACTIVE_SINCE_KEY);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeNavBarLocalStorageValue(AGENT_ACTIVE_SINCE_KEY);
      return {};
    }
    const normalized = loadNavBarLastVisitedFromValue(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeNavBarLocalStorageValue(AGENT_ACTIVE_SINCE_KEY, serialized);
    return normalized;
  } catch {
    removeNavBarLocalStorageValue(AGENT_ACTIVE_SINCE_KEY);
    return {};
  }
}

export function saveNavBarAgentActiveSince(value: Record<string, number>): void {
  writeNavBarLocalStorageValue(
    AGENT_ACTIVE_SINCE_KEY,
    JSON.stringify(loadNavBarLastVisitedFromValue(value)),
  );
}

function loadNavBarLastVisitedFromValue(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([entryKey, entryValue]): Array<[string, number]> => {
      const trimmedKey = entryKey.trim();
      return trimmedKey && isFiniteNumber(entryValue) && entryValue >= 0 ? [[trimmedKey, entryValue]] : [];
    }),
  );
}

function normalizeNavBarLastRun(value: unknown): NavBarLastRun | null {
  if (!isRecord(value) || typeof value.name !== "string" || !isFiniteNumber(value.finishedAt)) return null;
  const name = value.name.trim();
  return name ? { name, finishedAt: value.finishedAt } : null;
}
