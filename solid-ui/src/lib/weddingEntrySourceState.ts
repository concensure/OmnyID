// @locs-version: 1.0
// Distinguishes a visitor who deep-linked in from the wedding marketing site
// (omnyid.com/wedding, via ?source=wedding) from everyone else, so the wedding
// intake can show the right variant and never flip once a user has seen one.
export type WeddingEntrySource = "wedding_site" | "generic";

const WEDDING_ENTRY_SOURCE_KEY = "omnyid.wedding.entry-source";

function scopedKey(baseKey: string, userId?: string | null): string {
  const scope = userId?.trim();
  return scope ? `${baseKey}:${scope}` : baseKey;
}

function weddingIntakeVariantShownKey(weddingPlanId: string, userId?: string | null): string {
  return scopedKey(`omnyid.wedding.intake-variant-shown.${weddingPlanId}`, userId);
}

function isWeddingEntrySource(value: unknown): value is WeddingEntrySource {
  return value === "wedding_site" || value === "generic";
}

/** Call once, at the moment a ?source=wedding deep link is confirmed (e.g. after login). */
export function saveWeddingEntrySource(source: WeddingEntrySource, userId?: string | null): void {
  try {
    localStorage.setItem(scopedKey(WEDDING_ENTRY_SOURCE_KEY, userId), source);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

/** Null means "no deep-link source recorded yet" — callers should treat that as generic. */
export function loadWeddingEntrySource(userId?: string | null): WeddingEntrySource | null {
  try {
    const raw = localStorage.getItem(scopedKey(WEDDING_ENTRY_SOURCE_KEY, userId));
    return isWeddingEntrySource(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Locks in which intake variant a given wedding plan has already shown, so it can't flip mid-flow. */
export function saveWeddingIntakeVariantShown(weddingPlanId: string, variant: WeddingEntrySource, userId?: string | null): void {
  try {
    localStorage.setItem(weddingIntakeVariantShownKey(weddingPlanId, userId), variant);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

export function loadWeddingIntakeVariantShown(weddingPlanId: string, userId?: string | null): WeddingEntrySource | null {
  try {
    const raw = localStorage.getItem(weddingIntakeVariantShownKey(weddingPlanId, userId));
    return isWeddingEntrySource(raw) ? raw : null;
  } catch {
    return null;
  }
}
