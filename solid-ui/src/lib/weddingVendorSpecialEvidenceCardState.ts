import type {
  WeddingVendorRankedSpecialDetail,
  WeddingVendorSpecialMarker,
} from "@/lib/weddingVendorSpecialDiscoveryApi";

export type WeddingVendorSpecialAvailabilityState =
  | "calendar_open"
  | "vendor_confirmed"
  | "temporary_hold"
  | "confirmed_booking";

export type WeddingVendorSpecialEvidenceCardState = {
  identityLabel: string;
  coverageLabel: string;
  priceLabel: string;
  priceBasisLabel: string;
  priceCertaintyLabel: string;
  availabilityState: WeddingVendorSpecialAvailabilityState;
  availabilityLabel: string;
  availabilityEvidenceLabel: string;
  fitReason: string;
  unknownLabels: string[];
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function freshness(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "freshness unknown";
  const days = Math.max(0, Math.floor((now - timestamp) / 86_400_000));
  if (days === 0) return "updated today";
  if (days === 1) return "updated yesterday";
  return `updated ${days} days ago`;
}

export function buildWeddingVendorSpecialEvidenceCardState(input: {
  marker: WeddingVendorSpecialMarker;
  detail: WeddingVendorRankedSpecialDetail | null;
  guestCount: number | null;
  availabilityState?: WeddingVendorSpecialAvailabilityState;
  now?: number;
}): WeddingVendorSpecialEvidenceCardState {
  const { marker, detail } = input;
  const availabilityState = input.availabilityState ?? "calendar_open";
  const capacity = detail?.maximumCapacity ?? null;
  const price = detail?.indicativeTotalCents ?? null;
  const priceBasis = detail?.indicativePerHeadCents !== null && detail?.indicativePerHeadCents !== undefined
    ? `${money(detail.indicativePerHeadCents, detail.currency)} per head${input.guestCount ? ` × ${input.guestCount} guests` : ""}`
    : detail?.minimumSpendCents !== null && detail?.minimumSpendCents !== undefined
      ? `Minimum spend ${money(detail.minimumSpendCents, detail.currency)}`
      : detail?.title || "No comparable price basis supplied";
  const availabilityLabel = availabilityState === "confirmed_booking"
    ? "Confirmed booking"
    : availabilityState === "temporary_hold"
      ? "Temporary hold"
      : availabilityState === "vendor_confirmed"
        ? "Vendor confirmed for your event"
        : "Vendor calendar shows this date open";
  const fitReason = detail?.reasonLabels.find((label) => !/^vendor-confirmed/i.test(label))
    ?? detail?.reasonLabels[0]
    ?? (capacity && input.guestCount && capacity >= input.guestCount
      ? `Fits your ${input.guestCount}-guest plan; package details still need confirmation.`
      : "Matches the selected date and area; suitability details still need confirmation.");
  const unknownLabels = [
    capacity === null ? "Capacity unknown" : null,
    price === null ? "Comparable price unknown" : null,
    detail?.unknownCosts ? "Some mandatory costs unknown" : null,
  ].filter((value): value is string => Boolean(value));
  return {
    identityLabel: [marker.vendorName, marker.locality].filter(Boolean).join(" — "),
    coverageLabel: capacity !== null ? `Up to ${capacity} guests` : marker.category === "Venue" ? "Reception capacity unknown" : "Service coverage not confirmed",
    priceLabel: price !== null ? `Estimated ${money(price, detail?.currency ?? "AUD")}${input.guestCount ? ` for ${input.guestCount} guests` : ""}` : "Price not confirmed",
    priceBasisLabel: priceBasis,
    priceCertaintyLabel: detail?.unknownCosts ? "Indicative; mandatory costs remain unclear" : detail ? "Indicative vendor-supplied terms" : "Commercial terms shown only for a current top-three match",
    availabilityState,
    availabilityLabel,
    availabilityEvidenceLabel: `${availabilityState === "calendar_open" ? "Vendor calendar" : "Wedding record"} · ${freshness(marker.lastConfirmedAt, input.now)}`,
    fitReason,
    unknownLabels,
  };
}
