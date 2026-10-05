// @locs-version: 2.0
// Pure policy for the one active, exactly-three wedding vendor comparison.

import type { WeddingVendorRankedCandidate } from "@/lib/weddingVendorRankingState";

export type WeddingVendorShortlistCandidate = Pick<WeddingVendorRankedCandidate,
  "id" | "title" | "vendorId" | "group" | "websiteUrl" | "email" | "phone" | "imageUrl" | "availabilityState"
> & {
  canonicalId?: string | null;
  category?: string | null;
  sourceUrl?: string | null;
};

export type WeddingVendorShortlistMedia = {
  kind: "verified_photo" | "placeholder";
  url: string | null;
  alt: string;
  label: string;
};

export type WeddingVendorShortlistOutcome = {
  status: "complete" | "needs_online_shortfall" | "blocked";
  candidates: WeddingVendorShortlistCandidate[];
  shortfall: number;
  reason: string | null;
  retryAction: "retry_directory_and_online" | "collect_category_or_location" | null;
};

export type WeddingVendorCategorySelection = {
  status: "selected" | "ambiguous" | "missing";
  category: string | null;
  reason: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function key(value: unknown): string {
  return clean(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = key(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function httpUrl(value: string | null | undefined): string | null {
  const candidate = clean(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function candidateIdentity(candidate: WeddingVendorShortlistCandidate): string {
  const stableId = clean(candidate.canonicalId) || clean(candidate.vendorId) || clean(candidate.id);
  if (stableId) return `id:${key(stableId)}`;
  const website = httpUrl(candidate.websiteUrl);
  if (website) return `site:${new URL(website).hostname.toLocaleLowerCase()}`;
  return `name:${key(candidate.title)}`;
}

function hasRequestRoute(candidate: WeddingVendorShortlistCandidate): boolean {
  return Boolean(clean(candidate.email) || clean(candidate.phone) || httpUrl(candidate.websiteUrl));
}

/** Select an explicit intent first, then priority, then the first unbooked checklist category. */
export function selectWeddingVendorCategory(input: {
  explicitCategory?: string | null;
  onboardingPriorities?: readonly string[] | null;
  unbookedCategories?: readonly string[] | null;
}): WeddingVendorCategorySelection {
  const explicit = clean(input.explicitCategory);
  if (explicit) return { status: "selected", category: explicit, reason: null };

  const unbooked = unique((input.unbookedCategories ?? []).map(clean));
  if (unbooked.length === 0) {
    return { status: "missing", category: null, reason: "Choose a vendor category before searching." };
  }
  const priorities = unique((input.onboardingPriorities ?? []).map(clean));
  const matches = priorities.filter((priority) => unbooked.some((category) => key(category) === key(priority)));
  if (matches.length > 1) {
    return { status: "ambiguous", category: null, reason: "Choose which vendor category to compare first." };
  }
  return { status: "selected", category: matches[0] ?? unbooked[0], reason: null };
}

/** A stable fingerprint changes only when an input materially changes. */
export function weddingVendorMaterialFingerprint(input: {
  weddingPlanId?: string | null;
  category?: string | null;
  location?: string | null;
  guestCount?: string | null;
  budgetComfort?: string | null;
  dateOrSeason?: string | null;
  priorities?: readonly string[] | null;
  preferences?: string | null;
  rankingPolicyVersion?: string | null;
}): string {
  const material = [
    clean(input.weddingPlanId), clean(input.category), clean(input.location), clean(input.guestCount),
    clean(input.budgetComfort), clean(input.dateOrSeason), unique((input.priorities ?? []).map(clean)).sort().join(","),
    clean(input.preferences), clean(input.rankingPolicyVersion) || "1",
  ].map(key).join("|");
  let hash = 2166136261;
  for (const character of material) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `wedding_vendor:${(hash >>> 0).toString(36)}`;
}

/** Existing ranker output remains authoritative; this adds only MVP suitability gates. */
export function isWeddingVendorMvpSuitable(
  candidate: WeddingVendorShortlistCandidate,
  targetCategory?: string | null,
): boolean {
  const category = clean(candidate.category);
  const requested = clean(targetCategory);
  return ["bookable", "verify"].includes(candidate.group)
    && Boolean(clean(candidate.id) || clean(candidate.vendorId) || clean(candidate.canonicalId))
    && Boolean(clean(candidate.title))
    && (!requested || !category || key(category) === key(requested))
    && hasRequestRoute(candidate);
}

/** The ranker orders candidates within each group; bookable candidates are preferred to verify. */
export function selectWeddingVendorShortlist(input: {
  targetCategory?: string | null;
  bookable?: readonly WeddingVendorShortlistCandidate[] | null;
  verify?: readonly WeddingVendorShortlistCandidate[] | null;
  canRunOnlineFallback?: boolean;
}): WeddingVendorShortlistOutcome {
  const targetCategory = clean(input.targetCategory);
  if (!targetCategory) {
    return {
      status: "blocked", candidates: [], shortfall: 3,
      reason: "Choose a vendor category before searching.", retryAction: "collect_category_or_location",
    };
  }
  const seen = new Set<string>();
  const candidates = [...(input.bookable ?? []), ...(input.verify ?? [])]
    .filter((candidate) => isWeddingVendorMvpSuitable(candidate, targetCategory))
    .filter((candidate) => {
      const identity = candidateIdentity(candidate);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .slice(0, 3);
  const shortfall = 3 - candidates.length;
  if (shortfall === 0) return { status: "complete", candidates, shortfall, reason: null, retryAction: null };
  if (input.canRunOnlineFallback === false) {
    return {
      status: "blocked", candidates, shortfall,
      reason: `Only ${candidates.length} suitable ${targetCategory} choice${candidates.length === 1 ? "" : "s"} are available.`,
      retryAction: "retry_directory_and_online",
    };
  }
  return {
    status: "needs_online_shortfall", candidates, shortfall,
    reason: `The directory has ${candidates.length} suitable ${targetCategory} choice${candidates.length === 1 ? "" : "s"}; search for ${shortfall} more.`,
    retryAction: "retry_directory_and_online",
  };
}

/** A placeholder is presentation only and must never be treated as vendor evidence. */
export function weddingVendorShortlistMedia(input: {
  vendorName: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
}): WeddingVendorShortlistMedia {
  const photo = httpUrl(input.imageUrl);
  const name = clean(input.vendorName) || "Vendor";
  if (photo) {
    return { kind: "verified_photo", url: photo, alt: clean(input.imageAlt) || `${name} vendor photo`, label: "Vendor photo" };
  }
  return {
    kind: "placeholder", url: null, alt: `${name} photo unavailable`,
    label: "Vendor photo unavailable — placeholder",
  };
}
