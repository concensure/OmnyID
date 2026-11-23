export type WorkspaceLens = "general" | "wedding" | "study";

function key(userId: string): string {
  return `omnyid.workspace-lens:${userId.trim().toLowerCase() || "guest"}`;
}

export function hasSavedWorkspaceLens(userId: string, storage: Storage = localStorage): boolean {
  try {
    const value = storage.getItem(key(userId));
    return value === "general" || value === "wedding" || value === "study";
  } catch { return false; }
}

export function loadWorkspaceLens(userId: string, fallback: WorkspaceLens, storage: Storage = localStorage): WorkspaceLens {
  try {
    const value = storage.getItem(key(userId));
    return value === "general" || value === "wedding" || value === "study" ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveWorkspaceLens(userId: string, lens: WorkspaceLens, storage: Storage = localStorage): WorkspaceLens {
  try { storage.setItem(key(userId), lens); } catch { /* presentation preference only */ }
  return lens;
}

export function nextWorkspaceLens(current: WorkspaceLens): WorkspaceLens {
  return current === "general" ? "wedding" : current === "wedding" ? "study" : "general";
}
