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

export async function loadWeddingVendorSpecials(input: { date: string; category: string; limit?: number }) {
  const query = new URLSearchParams({ date: input.date, category: input.category });
  if (input.limit) query.set("limit", String(input.limit));
  return normalizeWeddingVendorSpecialDiscovery(await apiFetch<unknown>(`/wedding/vendor-specials/discovery?${query}`));
}
