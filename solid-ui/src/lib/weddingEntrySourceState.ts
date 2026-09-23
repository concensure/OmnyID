// @locs-version: 1.0
// Distinguishes a visitor who deep-linked in from the wedding marketing site
// (omnyid.com/wedding, via ?source=wedding) from everyone else, so the wedding
// intake can show the right variant and never flip once a user has seen one.
export type WeddingEntrySource = "wedding_site" | "generic";

const WEDDING_ENTRY_SOURCE_KEY = "omnyid.wedding.entry-source";

function weddingIntakeVariantShownKey(weddingPlanId: string): string {
  return `omnyid.wedding.intake-variant-shown.${weddingPlanId}`;
}

function isWeddingEntrySource(value: unknown): value is WeddingEntrySource {
  return value === "wedding_site" || value === "generic";
}

/** Call once, at the moment a ?source=wedding deep link is confirmed (e.g. after login). */
export function saveWeddingEntrySource(source: WeddingEntrySource): void {
  try {
    localStorage.setItem(WEDDING_ENTRY_SOURCE_KEY, source);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

/** Null means "no deep-link source recorded yet" — callers should treat that as generic. */
export function loadWeddingEntrySource(): WeddingEntrySource | null {
  try {
    const raw = localStorage.getItem(WEDDING_ENTRY_SOURCE_KEY);
    return isWeddingEntrySource(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Locks in which intake variant a given wedding plan has already shown, so it can't flip mid-flow. */
export function saveWeddingIntakeVariantShown(weddingPlanId: string, variant: WeddingEntrySource): void {
  try {
    localStorage.setItem(weddingIntakeVariantShownKey(weddingPlanId), variant);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

export function loadWeddingIntakeVariantShown(weddingPlanId: string): WeddingEntrySource | null {
  try {
    const raw = localStorage.getItem(weddingIntakeVariantShownKey(weddingPlanId));
    return isWeddingEntrySource(raw) ? raw : null;
  } catch {
    return null;
  }
}
