// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";

export const WEDDING_VENDOR_SEARCH_LAUNCH_KEY = "omnyid.wedding-vendor-search-launch";
export const WEDDING_VENDOR_SEARCH_LAUNCH_EVENT = "omnyid:wedding-vendor-search-launch";

export type WeddingVendorSearchLaunchState = {
  query: string;
  source: "master_search" | "wedding_home";
  savedAt: string;
};

export type WeddingVendorSearchIntakeQueryInput = {
  location?: string | null;
  approximateLocation?: string | null;
  vendorLabels?: readonly string[] | null;
  priorities?: string | null;
  atmosphere?: string | null;
};

export type WeddingVendorSearchEffectiveQuerySource = "manual" | "onboarding" | "empty";

export type WeddingVendorSearchEffectiveQueryState = {
  query: string;
  source: WeddingVendorSearchEffectiveQuerySource;
  sourceLabel: string;
};

const MAX_QUERY_LENGTH = 280;

export function weddingAutomaticShortlistEnabled(value: string | null | undefined): boolean {
  return !["0", "false", "no", "off"].includes(String(value ?? "true").trim().toLowerCase());
}

function storageOrNull(storage?: Storage | null): Storage | null {
  return storage ?? globalThis.localStorage ?? globalThis.window?.localStorage ?? null;
}

function withStorage<T>(storage: Storage | null, fallback: T, fn: (storage: Storage) => T): T {
  if (!storage) return fallback;
  try {
    return fn(storage);
  } catch {
    return fallback;
  }
}

export function normalizeWeddingVendorSearchLaunchQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

export function weddingVendorSearchQueryFromIntake(input: WeddingVendorSearchIntakeQueryInput): string {
  const labels = (input.vendorLabels ?? [])
    .map((label) => normalizeWeddingVendorSearchLaunchQuery(label))
    .filter(Boolean);
  const location = normalizeWeddingVendorSearchLaunchQuery(input.location)
    || normalizeWeddingVendorSearchLaunchQuery(input.approximateLocation);
  const focus = labels.length > 0
    ? labels.length === 1
      ? labels[0]
      : `${labels.slice(0, 3).join(", ")} searches`
    : "wedding vendors";
  const hasVenueFocus = labels.some((label) => /\bvenue|venues|reception|ceremony location\b/i.test(label));
  return normalizeWeddingVendorSearchLaunchQuery([
    focus,
    location ? `${hasVenueFocus ? "near" : "in"} ${location}` : null,
    normalizeWeddingVendorSearchLaunchQuery(input.priorities) ? `for ${normalizeWeddingVendorSearchLaunchQuery(input.priorities)}` : null,
    normalizeWeddingVendorSearchLaunchQuery(input.atmosphere) ? `with ${normalizeWeddingVendorSearchLaunchQuery(input.atmosphere)}` : null,
  ].filter(Boolean).join(" "));
}

export function weddingVendorSearchApproximateLocationFromTimezone(timezone?: string | null): string {
  const value = normalizeWeddingVendorSearchLaunchQuery(timezone);
  if (!value) return "";
  const [region, city] = value.split("/");
  if (!city) return value.replace(/_/g, " ");
  const cityLabel = city.replace(/_/g, " ");
  if (region === "Australia") return `${cityLabel}, Australia`;
  if (region === "America") return cityLabel;
  if (region === "Europe") return cityLabel;
  return cityLabel;
}

export function weddingVendorSearchEffectiveQuery(
  manualQuery?: string | null,
  onboardingQuery?: string | null,
): string {
  return weddingVendorSearchEffectiveQueryState(manualQuery, onboardingQuery).query;
}

export function weddingVendorSearchEffectiveQueryState(
  manualQuery?: string | null,
  onboardingQuery?: string | null,
): WeddingVendorSearchEffectiveQueryState {
  const manual = normalizeWeddingVendorSearchLaunchQuery(manualQuery);
  if (manual) {
    return {
      query: manual,
      source: "manual",
      sourceLabel: "Using your edited query",
    };
  }

  const onboarding = normalizeWeddingVendorSearchLaunchQuery(onboardingQuery);
  if (onboarding) {
    return {
      query: onboarding,
      source: "onboarding",
      sourceLabel: "Using your onboarding answers",
    };
  }

  return {
    query: "",
    source: "empty",
    sourceLabel: "No vendor search query yet",
  };
}

export function isWeddingVendorSearchIntent(value: unknown): boolean {
  const query = normalizeWeddingVendorSearchLaunchQuery(value).toLowerCase();
  if (query.length < 8) return false;
  const hasVendorCategory = /\b(vendor|vendors|venue|venues|florist|florists|flower|flowers|photographer|photographers|videographer|videographers|celebrant|celebrants|officiant|officiants|caterer|caterers|catering|cake|cakes|hair|makeup|make-up|dj|band|music|transport|cars|stationery|invitation|invitations)\b/.test(query);
  if (!hasVendorCategory) return false;
  const hasWeddingContext = /\b(wedding|bridal|bride|groom|ceremony|reception)\b/.test(query);
  const hasSearchAction = /\b(search|find|look|looking|recommend|recommendation|recommendations|research|quote|quotes|shortlist|compare)\b/.test(query);
  const hasLocationCue = /\b(in|near|around|within)\b\s+[\p{L}\p{N}]/u.test(query);
  const startsAsGeneralQuestion = /^(how|what|why|when|where|can|should|could|would)\b/.test(query);
  return hasSearchAction || (hasWeddingContext && (hasLocationCue || !startsAsGeneralQuestion));
}

function normalizeLaunch(value: unknown): WeddingVendorSearchLaunchState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const query = normalizeWeddingVendorSearchLaunchQuery(raw.query);
  if (!query) return null;
  const source = raw.source === "wedding_home" ? "wedding_home" : "master_search";
  const savedAt = typeof raw.savedAt === "string" && raw.savedAt.trim()
    ? raw.savedAt.trim()
    : new Date().toISOString();
  return { query, source, savedAt };
}

export function saveWeddingVendorSearchLaunch(
  query: string,
  input?: {
    storage?: Storage | null;
    nowIso?: string | null;
    source?: WeddingVendorSearchLaunchState["source"];
  },
): WeddingVendorSearchLaunchState | null {
  const normalizedQuery = normalizeWeddingVendorSearchLaunchQuery(query);
  if (!normalizedQuery) return null;
  const launch: WeddingVendorSearchLaunchState = {
    query: normalizedQuery,
    source: input?.source ?? "master_search",
    savedAt: input?.nowIso?.trim() || new Date().toISOString(),
  };
  return withStorage(storageOrNull(input?.storage), null, (target) => {
    target.setItem(WEDDING_VENDOR_SEARCH_LAUNCH_KEY, JSON.stringify(launch));
    return launch;
  });
}

export function loadWeddingVendorSearchLaunch(storage?: Storage | null): WeddingVendorSearchLaunchState | null {
  return withStorage(storageOrNull(storage), null, (target) => {
    const raw = target.getItem(WEDDING_VENDOR_SEARCH_LAUNCH_KEY);
    if (!raw) return null;
    try {
      const launch = normalizeLaunch(JSON.parse(raw));
      if (!launch) target.removeItem(WEDDING_VENDOR_SEARCH_LAUNCH_KEY);
      return launch;
    } catch {
      target.removeItem(WEDDING_VENDOR_SEARCH_LAUNCH_KEY);
      return null;
    }
  });
}

export function clearWeddingVendorSearchLaunch(storage?: Storage | null): void {
  withStorage(storageOrNull(storage), undefined, (target) => {
    target.removeItem(WEDDING_VENDOR_SEARCH_LAUNCH_KEY);
  });
}

export function consumeWeddingVendorSearchLaunch(storage?: Storage | null): WeddingVendorSearchLaunchState | null {
  const target = storageOrNull(storage);
  const launch = loadWeddingVendorSearchLaunch(target);
  if (launch) clearWeddingVendorSearchLaunch(target);
  return launch;
}

export function dispatchWeddingVendorSearchLaunch(
  launch: WeddingVendorSearchLaunchState,
  target: Window = window,
): void {
  try {
    target.dispatchEvent(new CustomEvent(WEDDING_VENDOR_SEARCH_LAUNCH_EVENT, { detail: launch }));
  } catch {
    // Persisted launch state still lets the wedding workspace pick up the query after navigation.
  }
}

export function weddingVendorSearchLaunchFromEvent(event: Event): WeddingVendorSearchLaunchState | null {
  return normalizeLaunch(customEventRecordDetail(event));
}
