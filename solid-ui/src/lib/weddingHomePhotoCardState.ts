// @locs-version: 1.0
// Account-scoped local mirror for optional visual decoration. Planning truth
// remains in AFP; a signed-in account never reads another account's cards.
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import { parseJsonValue } from "@/lib/jsonParseState";

export type WeddingHomePhotoCard = {
  id: string;
  imageDataUrl: string;
  alt: string;
  width: number;
  height: number;
};

const BASE_KEY = "omnyid.wedding.home.photo-cards.v1";
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function key(userId: string | null | undefined): string | null {
  return userId?.trim() ? accountScopedStorageKey(BASE_KEY, userId) : null;
}

export function normalizeWeddingHomePhotoCards(value: unknown): WeddingHomePhotoCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): WeddingHomePhotoCard[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.imageDataUrl !== "string" || !item.imageDataUrl.startsWith("data:image/")) return [];
    return [{
      id: item.id.slice(0, 100), imageDataUrl: item.imageDataUrl,
      alt: typeof item.alt === "string" && item.alt.trim() ? item.alt.trim().slice(0, 160) : "Wedding photo",
      width: clamp(typeof item.width === "number" ? item.width : 520, 240, 960),
      height: clamp(typeof item.height === "number" ? item.height : 320, 180, 720),
    }];
  }).slice(0, 12);
}

export function loadWeddingHomePhotoCards(userId: string | null | undefined, storage: Storage = localStorage): WeddingHomePhotoCard[] {
  const storageKey = key(userId);
  if (!storageKey) return [];
  const raw = storage.getItem(storageKey);
  if (!raw) return [];
  const parsed = parseJsonValue(raw);
  return parsed.ok ? normalizeWeddingHomePhotoCards(parsed.value) : [];
}

export function saveWeddingHomePhotoCards(userId: string | null | undefined, cards: readonly WeddingHomePhotoCard[], storage: Storage = localStorage): boolean {
  const storageKey = key(userId);
  if (!storageKey) return false;
  try { storage.setItem(storageKey, JSON.stringify(normalizeWeddingHomePhotoCards(cards))); return true; }
  catch { return false; }
}
