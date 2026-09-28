// @locs-version: 1.0

export type WeddingGuestOperationsLocalDraftGuest = {
  name: string;
  group: string;
  rsvp: string;
};

export type WeddingGuestOperationsLocalState = {
  guests: WeddingGuestOperationsLocalDraftGuest[];
  rules: string[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const MAX_LOCAL_GUEST_DRAFTS = 80;
const MAX_LOCAL_GUEST_RULES = 12;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof globalThis !== "undefined" && "localStorage" in globalThis ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

export function weddingGuestOperationsStorageKey(scope: string): string {
  return `omnyid:wedding_guest_operations:${scope}`;
}

export function weddingGuestOperationsScopeFromMetadata(metadata: unknown): string {
  const source = record(metadata);
  return clean(source?.responseWorkspaceId ?? source?.response_workspace_id)
    || clean(source?.weddingPlanId ?? source?.wedding_plan_id)
    || "wedding";
}

export function loadWeddingGuestOperationsLocalState(
  scope: string,
  storage: StorageLike | null | undefined = defaultStorage(),
): WeddingGuestOperationsLocalState {
  if (!storage) return { guests: [], rules: [] };
  try {
    const parsed = JSON.parse(storage.getItem(weddingGuestOperationsStorageKey(scope)) ?? "{}");
    const source = record(parsed);
    const guests = Array.isArray(source?.guests)
      ? source.guests.map((entry) => {
        const item = record(entry);
        return item ? {
          name: clean(item.name),
          group: clean(item.group) || "Ungrouped",
          rsvp: clean(item.rsvp) || "Pending",
        } : null;
      }).filter((entry): entry is WeddingGuestOperationsLocalDraftGuest => Boolean(entry?.name)).slice(0, MAX_LOCAL_GUEST_DRAFTS)
      : [];
    const rules = Array.isArray(source?.rules)
      ? source.rules.map(clean).filter(Boolean).slice(0, MAX_LOCAL_GUEST_RULES)
      : [];
    return { guests, rules };
  } catch {
    return { guests: [], rules: [] };
  }
}

export function saveWeddingGuestOperationsLocalState(
  scope: string,
  state: WeddingGuestOperationsLocalState,
  storage: StorageLike | null | undefined = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(weddingGuestOperationsStorageKey(scope), JSON.stringify({
      guests: state.guests.slice(-MAX_LOCAL_GUEST_DRAFTS),
      rules: state.rules.slice(0, MAX_LOCAL_GUEST_RULES),
    }));
    return true;
  } catch {
    return false;
  }
}
