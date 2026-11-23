// @locs-version: 1.0
export const REASONING_TRACE_STORAGE_PREFIX = "omnyid.reasoning-trace";

export function reasoningTraceStorageKey(threadId: string, cardId: string, sectionId: string): string {
  return `${REASONING_TRACE_STORAGE_PREFIX}:${threadId}:${cardId}:${sectionId}`;
}

export function loadReasoningTraceExpanded(storageKey: string | null): boolean {
  if (!storageKey) return false;
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored === "1") return true;
    if (stored === "0" || stored === null) return false;
    sessionStorage.setItem(storageKey, "0");
    return false;
  } catch {
    return false;
  }
}

export function saveReasoningTraceExpanded(storageKey: string | null, expanded: boolean): void {
  if (!storageKey) return;
  try {
    sessionStorage.setItem(storageKey, expanded ? "1" : "0");
  } catch {
    // ignore storage failures
  }
}
