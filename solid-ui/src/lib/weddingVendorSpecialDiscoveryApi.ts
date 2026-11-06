import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

export type WeddingVendorSpecialMarker = {
  vendorId: string;
  vendorName: string;
  category: string;
  locality: string;
  address: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  photoUrl: string | null;
  photoAlt: string | null;
  styleTags: string[];
  rating: number | null;
  reviewCount: number | null;
  availableOnDate: string;
  lastConfirmedAt: string;
  confirmationExpiresAt: string;
  indicativeOnly: true;
  distanceKm: number | null;
};

export type WeddingVendorSpecialDiscovery = {
  selectedDate: string;
  category: string | null;
  rankingPolicyVersion: "2" | null;
  markers: WeddingVendorSpecialMarker[];
  topChoices: WeddingVendorRankedSpecialDetail[];
  truncated: boolean;
};

export type WeddingVendorRankedSpecialDetail = {
  vendorId: string;
  rank: number;
  title: string;
  summary: string;
  spaceLabel: string | null;
  sessionLabel: string | null;
  maximumCapacity: number | null;
  currency: string;
  minimumSpendCents: number | null;
  indicativePerHeadCents: number | null;
  indicativeTotalCents: number | null;
  budgetFitEligible: boolean;
  unknownCosts: boolean;
  inclusions: string[];
  exclusions: string[];
  publicConditions: string | null;
  reasonLabels: string[];
  indicativeOnly: true;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const optionalText = (value: unknown) => text(value) || null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function normalizeWeddingVendorSpecialMarker(value: unknown): WeddingVendorSpecialMarker | null {
  if (!isRecord(value)) return null;
  const vendorId = text(value.vendor_id);
  const vendorName = text(value.vendor_name);
  const latitude = number(value.latitude);
  const longitude = number(value.longitude);
  const availableOnDate = text(value.available_on_date);
  if (!vendorId || !vendorName || latitude === null || longitude === null || !availableOnDate) return null;
  return {
    vendorId,
    vendorName,
    category: text(value.category),
    locality: text(value.locality),
    address: optionalText(value.address),
    description: optionalText(value.description),
    latitude,
    longitude,
    photoUrl: optionalText(value.photo_url),
    photoAlt: optionalText(value.photo_alt),
    styleTags: Array.isArray(value.style_tags) ? value.style_tags.map(text).filter(Boolean).slice(0, 12) : [],
    rating: number(value.rating),
    reviewCount: number(value.review_count),
    availableOnDate,
    lastConfirmedAt: text(value.last_confirmed_at),
    confirmationExpiresAt: text(value.confirmation_expires_at),
    indicativeOnly: true,
    distanceKm: number(value.distance_km),
  };
}

export function normalizeWeddingVendorSpecialDiscovery(value: unknown): WeddingVendorSpecialDiscovery {
  const record = isRecord(value) ? value : {};
  return {
    selectedDate: text(record.selected_date),
    category: optionalText(record.category),
    rankingPolicyVersion: text(record.ranking_policy_version) === "2" ? "2" : null,
    markers: Array.isArray(record.markers)
      ? record.markers.map(normalizeWeddingVendorSpecialMarker).filter((item): item is WeddingVendorSpecialMarker => Boolean(item))
      : [],
    topChoices: Array.isArray(record.top_choices)
      ? record.top_choices.map(normalizeWeddingVendorRankedSpecialDetail).filter((item): item is WeddingVendorRankedSpecialDetail => Boolean(item))
      : [],
    truncated: record.truncated === true,
  };
}

export function normalizeWeddingVendorRankedSpecialDetail(value: unknown): WeddingVendorRankedSpecialDetail | null {
  if (!isRecord(value)) return null;
  const vendorId = text(value.vendor_id);
  const rank = number(value.rank);
  const title = text(value.title);
  if (!vendorId || rank === null || rank < 1 || rank > 3 || !title) return null;
  const strings = (candidate: unknown) => Array.isArray(candidate) ? candidate.map(text).filter(Boolean).slice(0, 40) : [];
  return {
    vendorId,
    rank,
    title,
    summary: text(value.summary),
    spaceLabel: optionalText(value.space_label),
    sessionLabel: optionalText(value.session_label),
    maximumCapacity: number(value.maximum_capacity),
    currency: text(value.currency) || "AUD",
    minimumSpendCents: number(value.minimum_spend_cents),
    indicativePerHeadCents: number(value.indicative_per_head_cents),
    indicativeTotalCents: number(value.indicative_total_cents),
    budgetFitEligible: value.budget_fit_eligible === true,
    unknownCosts: value.unknown_costs !== false,
    inclusions: strings(value.inclusions),
    exclusions: strings(value.exclusions),
    publicConditions: optionalText(value.public_conditions),
    reasonLabels: strings(value.reason_labels).slice(0, 4),
    indicativeOnly: true,
  };
}

export async function loadWeddingVendorSpecials(input: {
  date: string;
  category: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  guestCount?: number | null;
  categoryBudgetCents?: number | null;
  preferenceTerms?: readonly string[];
  limit?: number;
}) {
  const location = typeof input.latitude === "number" && typeof input.longitude === "number"
    ? { latitude: input.latitude, longitude: input.longitude, radius_km: input.radiusKm ?? 75 }
    : {};
  return normalizeWeddingVendorSpecialDiscovery(await apiFetch<unknown>("/wedding/vendor-specials/discovery", {
    method: "POST",
    body: JSON.stringify({
      date: input.date,
      category: input.category,
      ...location,
      guest_count: typeof input.guestCount === "number" && input.guestCount > 0 ? Math.round(input.guestCount) : null,
      category_budget_cents: typeof input.categoryBudgetCents === "number" && input.categoryBudgetCents >= 0 ? Math.round(input.categoryBudgetCents) : null,
      preference_terms: input.preferenceTerms?.slice(0, 16).join(",") || null,
      limit: input.limit ?? null,
    }),
  }));
}
