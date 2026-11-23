// @locs-version: 2.0
import type { WeddingVendorSeedDetail } from "@/lib/weddingVendorSeedState";

export type WeddingVendorFreshnessStatus =
  | "blocked"
  | "needs_live_recheck"
  | "usable_for_research"
  | "ready_for_shortlist_review";

export type WeddingVendorFreshnessRow = {
  vendorName: string;
  category: string;
  serviceArea: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  sourceFreshness: "current" | "stale" | "missing";
  priceFreshness: "verified" | "needs_recheck" | "missing";
  availabilityFreshness: "verified" | "needs_recheck" | "missing";
  relevanceStatus: "matched" | "partial" | "blocked";
  relevanceLabels: string[];
  missingRelevanceLabels: string[];
  recommendationBlockerLabels: string[];
  actionLabel: string;
};

export type WeddingVendorFreshnessState = {
  status: WeddingVendorFreshnessStatus;
  summary: string;
  vendorCount: number;
  staleSourceCount: number;
  priceRecheckCount: number;
  availabilityRecheckCount: number;
  readyForRecommendation: boolean;
  rows: WeddingVendorFreshnessRow[];
  actionLabels: string[];
  caveatLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function usableSourceUrl(value: unknown): boolean {
  const candidate = clean(value);
  if (!/^https?:\/\//i.test(candidate)) return false;
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    return hostname !== "localhost"
      && hostname !== "127.0.0.1"
      && hostname !== "0.0.0.0"
      && hostname !== "::1"
      && hostname !== "[::1]";
  } catch {
    return false;
  }
}

function parsedEvidence(value: WeddingVendorSeedDetail["evidence"]): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
}

function dateFreshness(dateText: string, now: Date, maxAgeDays: number): "current" | "stale" | "missing" {
  if (!dateText) return "missing";
  const parsed = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "missing";
  return daysBetween(parsed, now) > maxAgeDays ? "stale" : "current";
}

function evidenceFreshness(value: unknown, sourceFreshness: "current" | "stale" | "missing"): "verified" | "needs_recheck" | "missing" {
  const text = clean(value).toLowerCase();
  if (!text) return "missing";
  if (/not verified|request|unknown|not confirmed|needs confirmation|to confirm/i.test(text)) return "needs_recheck";
  return sourceFreshness === "current" ? "verified" : "needs_recheck";
}

function normalizedToken(value: unknown): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function textHas(text: string, needle: string): boolean {
  return Boolean(text) && Boolean(needle) && text.includes(needle);
}

function splitPreferenceTerms(value: unknown): string[] {
  const normalized = normalizedToken(value);
  const tokenTerms = normalized
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4 && !/^(wedding|style|needs?|need|want|with|and|the|for)$/.test(term));
  return Array.from(new Set(tokenTerms)).slice(0, 8);
}

function relevanceFor(input: {
  vendor: WeddingVendorSeedDetail;
  evidence: Record<string, unknown>;
  selectedCategories: readonly string[];
  location: string;
  preferenceTerms: readonly string[];
}): Pick<WeddingVendorFreshnessRow, "relevanceStatus" | "relevanceLabels" | "missingRelevanceLabels" | "recommendationBlockerLabels"> {
  const category = normalizedToken(input.vendor.category);
  const serviceArea = normalizedToken(input.vendor.serviceArea);
  const evidenceText = normalizedToken(JSON.stringify(input.evidence));
  const selectedCategories = input.selectedCategories.map(normalizedToken).filter(Boolean);
  const categoryMatched = selectedCategories.length === 0
    || selectedCategories.some((selected) => textHas(category, selected) || textHas(selected, category));
  const location = normalizedToken(input.location);
  const locationMatched = !location || textHas(serviceArea, location) || textHas(location, serviceArea);
  const matchedPreferenceLabels = input.preferenceTerms.filter((term) => (
    textHas(evidenceText, term)
    || textHas(normalizedToken(input.vendor.vendorName), term)
    || textHas(category, term)
    || textHas(serviceArea, term)
  ));
  const missingPreferenceLabels = input.preferenceTerms.filter((term) => !matchedPreferenceLabels.includes(term));
  const missing: string[] = [
    categoryMatched ? null : `category mismatch: ${clean(input.vendor.category) || "unknown category"}`,
    locationMatched ? null : `service area mismatch: ${clean(input.vendor.serviceArea) || "unknown area"}`,
    ...missingPreferenceLabels.map((term) => `preference not evidenced: ${term}`),
  ].filter((label): label is string => Boolean(label));
  const labels = [
    categoryMatched ? "category matches selected vendor need" : null,
    locationMatched ? "service area matches wedding location/search area" : null,
    ...matchedPreferenceLabels.map((term) => `preference evidenced: ${term}`),
  ].filter((label): label is string => Boolean(label));
  const recommendationBlockerLabels = [
    categoryMatched ? null : "Do not recommend this vendor for the selected category without user confirmation.",
    locationMatched ? null : "Do not recommend this vendor until service area/location fit is confirmed.",
    missingPreferenceLabels.length > 0 ? "Preference fit is incomplete; keep as research option, not recommendation." : null,
  ].filter((label): label is string => Boolean(label));
  return {
    relevanceStatus: !categoryMatched || !locationMatched ? "blocked" : missingPreferenceLabels.length > 0 ? "partial" : "matched",
    relevanceLabels: labels,
    missingRelevanceLabels: missing,
    recommendationBlockerLabels,
  };
}

function rowAction(row: WeddingVendorFreshnessRow): string {
  if (row.recommendationBlockerLabels.length > 0) {
    return `${row.vendorName}: ${row.recommendationBlockerLabels[0]}`;
  }
  if (row.sourceFreshness !== "current") return `${row.vendorName}: refresh the source page before using this vendor.`;
  if (row.priceFreshness !== "verified" && row.availabilityFreshness !== "verified") {
    return `${row.vendorName}: request current quote and date-specific availability.`;
  }
  if (row.priceFreshness !== "verified") return `${row.vendorName}: request current quote and package inclusions.`;
  if (row.availabilityFreshness !== "verified") return `${row.vendorName}: request date-specific availability.`;
  return `${row.vendorName}: ready for user shortlist review, still not a booking.`;
}

export function buildWeddingVendorFreshnessState(input: {
  vendors?: readonly WeddingVendorSeedDetail[] | null;
  now?: Date;
  maxSourceAgeDays?: number;
  location?: string | null;
  selectedCategories?: readonly string[] | null;
  preferenceText?: string | null;
} = {}): WeddingVendorFreshnessState {
  const now = input.now ?? new Date();
  const maxSourceAgeDays = Math.max(1, Math.trunc(input.maxSourceAgeDays ?? 45));
  const rows = (input.vendors ?? []).flatMap((vendor): WeddingVendorFreshnessRow[] => {
    const vendorName = clean(vendor.vendorName);
    const category = clean(vendor.category);
    const serviceArea = clean(vendor.serviceArea);
    const sourceUrl = clean(vendor.sourceUrl);
    if (!vendorName || !category || !usableSourceUrl(sourceUrl)) return [];
    const evidence = parsedEvidence(vendor.evidence);
    const sourceCheckedAt = clean(vendor.sourceCheckedAt);
    const sourceFreshness = dateFreshness(sourceCheckedAt, now, maxSourceAgeDays);
    const relevance = relevanceFor({
      vendor,
      evidence,
      selectedCategories: input.selectedCategories ?? [],
      location: clean(input.location),
      preferenceTerms: splitPreferenceTerms(input.preferenceText),
    });
    const row: WeddingVendorFreshnessRow = {
      vendorName,
      category,
      serviceArea,
      sourceUrl,
      sourceCheckedAt,
      sourceFreshness,
      priceFreshness: evidenceFreshness(evidence.price_basis, sourceFreshness),
      availabilityFreshness: evidenceFreshness(evidence.availability_basis, sourceFreshness),
      ...relevance,
      actionLabel: "",
    };
    return [{ ...row, actionLabel: rowAction(row) }];
  });

  const staleSourceCount = rows.filter((row) => row.sourceFreshness !== "current").length;
  const priceRecheckCount = rows.filter((row) => row.priceFreshness !== "verified").length;
  const availabilityRecheckCount = rows.filter((row) => row.availabilityFreshness !== "verified").length;
  const readyCount = rows.filter((row) => (
    row.sourceFreshness === "current"
    && row.priceFreshness === "verified"
    && row.availabilityFreshness === "verified"
    && row.relevanceStatus === "matched"
  )).length;
  const relevanceBlockerCount = rows.filter((row) => row.relevanceStatus !== "matched").length;
  const status: WeddingVendorFreshnessStatus = rows.length === 0
    ? "blocked"
    : readyCount === rows.length ? "ready_for_shortlist_review"
      : staleSourceCount > 0 || priceRecheckCount > 0 || availabilityRecheckCount > 0 || relevanceBlockerCount > 0
        ? "needs_live_recheck"
        : "usable_for_research";

  return {
    status,
    summary: rows.length === 0
      ? "No source-backed vendor rows are available for freshness review."
      : status === "ready_for_shortlist_review"
        ? `${rows.length} vendor${rows.length === 1 ? "" : "s"} have current source, price, and availability evidence for shortlist review.`
        : `${rows.length} vendor${rows.length === 1 ? "" : "s"} need checks before recommendation: ${priceRecheckCount} price, ${availabilityRecheckCount} availability, ${staleSourceCount} source, ${relevanceBlockerCount} relevance.`,
    vendorCount: rows.length,
    staleSourceCount,
    priceRecheckCount,
    availabilityRecheckCount,
    readyForRecommendation: status === "ready_for_shortlist_review",
    rows,
    actionLabels: rows.map((row) => row.actionLabel),
    caveatLabels: [
      "Freshness review is not a booking, endorsement, or guarantee.",
      "Use live source checks before recommending, comparing, or contacting vendors.",
      "Fresh source evidence is not enough if category, location, or stated preference fit is incomplete.",
      "Price and availability should be date-specific before reports collapse alternatives.",
    ],
  };
}
