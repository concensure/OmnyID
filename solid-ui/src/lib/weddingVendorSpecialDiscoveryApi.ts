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
  markers: WeddingVendorSpecialMarker[];
  truncated: boolean;
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
    markers: Array.isArray(record.markers)
      ? record.markers.map(normalizeWeddingVendorSpecialMarker).filter((item): item is WeddingVendorSpecialMarker => Boolean(item))
      : [],
    truncated: record.truncated === true,
  };
}

export async function loadWeddingVendorSpecials(input: {
  date: string;
  category: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  guestCount?: number | null;
  limit?: number;
}) {
  const query = new URLSearchParams({ date: input.date, category: input.category });
  if (typeof input.latitude === "number" && typeof input.longitude === "number") {
    query.set("latitude", String(input.latitude));
    query.set("longitude", String(input.longitude));
    query.set("radius_km", String(input.radiusKm ?? 75));
  }
  if (typeof input.guestCount === "number" && input.guestCount > 0) query.set("guest_count", String(Math.round(input.guestCount)));
  if (input.limit) query.set("limit", String(input.limit));
  return normalizeWeddingVendorSpecialDiscovery(await apiFetch<unknown>(`/wedding/vendor-specials/discovery?${query}`));
}
