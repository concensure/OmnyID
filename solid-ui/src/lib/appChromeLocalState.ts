// @locs-version: 1.0
export function workflowNewResultStorageKey(userId: string): string {
  return userId ? `omnyid.workflow.new_result.${userId}` : "omnyid.workflow.new_result";
}

export function threadSeenCountStorageKey(userId: string): string {
  return userId ? `omnyid.thread.seen_count.${userId}` : "omnyid.thread.seen_count";
}

export function advancedNavStorageKey(userId: string): string {
  return userId ? `omnyid.nav.advanced.${userId}` : "omnyid.nav.advanced";
}

export function sidebarSeenStorageKey(userId: string): string {
  return userId ? `omnyid.sidebar.seen.${userId}` : "omnyid.sidebar.seen";
}

function writeAppChromeStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function removeAppChromeStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function loadOptionalAppChromeFlag(key: string): boolean {
  const stored = localStorage.getItem(key);
  if (stored === "1") return true;
  if (stored === null) return false;
  removeAppChromeStorageValue(key);
  return false;
}

function loadPersistedAppChromeFlag(key: string): boolean {
  const stored = localStorage.getItem(key);
  if (stored === "1") return true;
  if (stored === "0" || stored === null) return false;
  writeAppChromeStorageValue(key, "0");
  return false;
}

export function loadWorkflowNewResultFlag(userId: string): boolean {
  try {
    return loadOptionalAppChromeFlag(workflowNewResultStorageKey(userId));
  } catch {
    return false;
  }
}

export function saveWorkflowNewResultFlag(userId: string, enabled: boolean): boolean {
  const key = workflowNewResultStorageKey(userId);
  if (enabled) writeAppChromeStorageValue(key, "1");
  else removeAppChromeStorageValue(key);
  return enabled;
}

export function loadThreadSeenCount(userId: string): number {
  const key = threadSeenCountStorageKey(userId);
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    const normalized = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
    if (raw !== null && String(normalized) !== raw) writeAppChromeStorageValue(key, String(normalized));
    return normalized;
  } catch {
    return 0;
  }
}

export function saveThreadSeenCount(userId: string, count: number): number {
  const normalized = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  writeAppChromeStorageValue(threadSeenCountStorageKey(userId), String(normalized));
  return normalized;
}

export function loadAdvancedNavEnabled(userId: string): boolean {
  try {
    return loadPersistedAppChromeFlag(advancedNavStorageKey(userId));
  } catch {
    return false;
  }
}

export function saveAdvancedNavEnabled(userId: string, enabled: boolean): boolean {
  writeAppChromeStorageValue(advancedNavStorageKey(userId), enabled ? "1" : "0");
  return enabled;
}

export function loadSidebarSeen(userId: string): boolean {
  try {
    return loadPersistedAppChromeFlag(sidebarSeenStorageKey(userId));
  } catch {
    return false;
  }
}

export function saveSidebarSeen(userId: string, seen: boolean): boolean {
  writeAppChromeStorageValue(sidebarSeenStorageKey(userId), seen ? "1" : "0");
  return seen;
}
