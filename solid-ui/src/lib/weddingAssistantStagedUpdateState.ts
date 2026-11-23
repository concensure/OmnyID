import type { WeddingAssistantAction } from "@/lib/weddingAssistantApi";
import { weddingAccountScopedStorageKey } from "@/lib/weddingLocalAccountScope";

const KEY = "omnyid.wedding-assistant.staged-update";

export type WeddingAssistantStagedUpdate = {
  target: WeddingAssistantAction["target"];
  draftFields: NonNullable<WeddingAssistantAction["draftFields"]>;
  stagedAt: string;
};

export function saveWeddingAssistantStagedUpdate(action: WeddingAssistantAction, storage: Storage = localStorage): void {
  if (action.kind !== "stage_update" || !action.draftFields) return;
  storage.setItem(weddingAccountScopedStorageKey(KEY), JSON.stringify({
    target: action.target,
    draftFields: action.draftFields,
    stagedAt: new Date().toISOString(),
  }));
}

export function consumeWeddingAssistantStagedUpdate(target: WeddingAssistantAction["target"], storage: Storage = localStorage): WeddingAssistantStagedUpdate | null {
  const key = weddingAccountScopedStorageKey(KEY);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WeddingAssistantStagedUpdate>;
    if (parsed.target !== target || !parsed.draftFields || typeof parsed.stagedAt !== "string") return null;
    storage.removeItem(key);
    return parsed as WeddingAssistantStagedUpdate;
  } catch {
    storage.removeItem(key);
    return null;
  }
}
