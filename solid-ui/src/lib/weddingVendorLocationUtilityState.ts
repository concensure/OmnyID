// @locs-version: 1.0
const EARTH_RADIUS_KM = 6371;
function radians(value: number): number { return value * Math.PI / 180; }
export function weddingVendorHaversineKm(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }): number {
  const dLat = radians(right.latitude - left.latitude);
  const dLon = radians(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function weddingTravelToleranceScale(value: string | null | undefined): number {
  const text = String(value ?? "").toLowerCase();
  return /happy to travel|within (?:an? |one )?hour|up to (?:an? |one )?hour/.test(text) ? 1.5 : 1;
}
export function weddingVendorDistanceUtility(distanceKm: number, toleranceScale = 1): number {
  const distance = distanceKm / Math.max(1, toleranceScale);
  return distance <= 15 ? 1 : distance <= 30 ? 0.8 : distance <= 50 ? 0.55 : distance <= 80 ? 0.3 : 0.1;
}
export function weddingVendorLocationUtility(input: {
  plan?: { latitude: number; longitude: number } | null;
  vendor?: { latitude: number; longitude: number } | null;
  tolerance?: string | null;
  category?: string | null;
  serviceAreaRadiusKm?: number | null;
  serviceAreaConfidence?: number | null;
  tokenMatch?: number | null;
}) {
  if (input.plan && input.vendor) {
    const distanceKm = weddingVendorHaversineKm(input.plan, input.vendor);
    const nonVenue = String(input.category ?? "").toLowerCase() !== "venue";
    const excluded = nonVenue && typeof input.serviceAreaRadiusKm === "number" && (input.serviceAreaConfidence ?? 0) >= 0.7 && distanceKm > input.serviceAreaRadiusKm;
    return { value: weddingVendorDistanceUtility(distanceKm, weddingTravelToleranceScale(input.tolerance)), confidence: 0.9, distanceKm, excluded };
  }
  return { value: Math.max(0, Math.min(1, input.tokenMatch ?? 0.5)), confidence: 0.3, distanceKm: null, excluded: false };
}
