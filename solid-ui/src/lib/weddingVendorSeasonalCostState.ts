// @locs-version: 1.0
export const WEDDING_SEASONAL_MODEL_VERSION = "sydney-1" as const;
export type WeddingMonthIndex = { venue: number; catering: number; demand: number };
export const SYDNEY_WEDDING_MONTHLY_INDICES: Record<number, WeddingMonthIndex> = {
  1: { venue: 105, catering: 103, demand: 78 }, 2: { venue: 100, catering: 100, demand: 72 },
  3: { venue: 115, catering: 108, demand: 100 }, 4: { venue: 120, catering: 112, demand: 92 },
  5: { venue: 108, catering: 105, demand: 76 }, 6: { venue: 82, catering: 88, demand: 42 },
  7: { venue: 78, catering: 85, demand: 35 }, 8: { venue: 84, catering: 90, demand: 48 },
  9: { venue: 108, catering: 105, demand: 88 }, 10: { venue: 125, catering: 115, demand: 100 },
  11: { venue: 122, catering: 113, demand: 96 }, 12: { venue: 112, catering: 108, demand: 86 },
};
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
export function isGreaterSydneyCoordinate(latitude: number | null, longitude: number | null): boolean {
  return latitude !== null && longitude !== null && latitude >= -34.35 && latitude <= -33.35 && longitude >= 150.45 && longitude <= 151.55;
}
export function weddingDayOfWeekFactor(day: number | null): number {
  if (day === 5 || day === 0) return 0.9;
  if (day !== null && day >= 1 && day <= 4) return 0.8;
  return 1;
}
export function weddingVendorEffectiveCost(input: {
  venueHireFee: number;
  cateringPerGuest: number;
  guestCount: number;
  minimumSpend?: number;
  corkage?: number;
  travel?: number;
  mandatoryExtras?: number;
  inclusionCredit?: number;
  month?: number | null;
  referenceVenueIndex?: number;
  referenceCateringIndex?: number;
  dayOfWeek?: number | null;
  publicHolidayWeekend?: boolean;
  greaterSydney?: boolean;
  seasonalPriceKnown?: boolean;
  validForDate?: boolean;
  quoteTotal?: number | null;
}) {
  if (typeof input.quoteTotal === "number" && input.quoteTotal >= 0) {
    return { total: input.quoteTotal, estimated: false, confidence: 1, authority: "vendor_reply", seasonalModelVersion: null, note: "Vendor quote" };
  }
  const indices = input.month ? SYDNEY_WEDDING_MONTHLY_INDICES[input.month] : null;
  const seasonal = Boolean(indices && input.greaterSydney && !input.seasonalPriceKnown && !input.validForDate);
  const venue = input.venueHireFee * (seasonal ? indices!.venue / (input.referenceVenueIndex ?? 100) : 1);
  const catering = input.cateringPerGuest * (seasonal ? indices!.catering / (input.referenceCateringIndex ?? 100) : 1);
  const dayFactor = seasonal ? weddingDayOfWeekFactor(input.dayOfWeek ?? 6) * (input.publicHolidayWeekend ? 1.05 : 1) : 1;
  const base = (venue + input.guestCount * catering) * dayFactor;
  const total = base + Math.max(0, (input.minimumSpend ?? 0) - base) + (input.corkage ?? 0) + (input.travel ?? 0) + (input.mandatoryExtras ?? 0) - (input.inclusionCredit ?? 0);
  const monthName = input.month ? new Date(2026, input.month - 1, 1).toLocaleString("en-AU", { month: "long" }) : null;
  return {
    total: Math.max(0, total),
    estimated: seasonal,
    confidence: seasonal ? 0.4 : 0.6,
    authority: seasonal ? "inferred" : "primary_official",
    seasonalModelVersion: seasonal ? WEDDING_SEASONAL_MODEL_VERSION : null,
    note: seasonal && monthName ? `${monthName} pricing estimate — indicative, not a quote.` : null,
  };
}
export function weddingVendorAvailabilityPrior(input: { month?: number | null; monthsUntilWedding?: number | null }): number {
  if (!input.month || !SYDNEY_WEDDING_MONTHLY_INDICES[input.month]) return 0.5;
  const demand = SYDNEY_WEDDING_MONTHLY_INDICES[input.month].demand;
  const pressure = (input.monthsUntilWedding ?? Number.POSITIVE_INFINITY) < 9 && demand >= 85 ? 0.1 : 0;
  return clamp(0.85 - 0.5 * demand / 100 - pressure, 0.25, 0.8);
}
