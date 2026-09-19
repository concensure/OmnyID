// @locs-version: 2.0
export type WeddingMapGeocodingProvider = "google_maps" | "mapbox" | "other";

export type WeddingMapGeocodingReadinessInput = {
  provider?: WeddingMapGeocodingProvider | null;
  geocodingConnected?: boolean | null;
  routingConnected?: boolean | null;
  locationsRequested?: number | null;
  locationsVerified?: number | null;
  routesRequested?: number | null;
  routesVerified?: number | null;
  maxRouteAgeMinutes?: number | null;
  hasTravelTimeCaveat?: boolean | null;
  hasFallbackMapUrl?: boolean | null;
  errorCount?: number | null;
};

export type WeddingMapGeocodingReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

const MAX_ROUTE_AGE_MINUTES = 60;

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingMapGeocodingReadinessState(
  input: WeddingMapGeocodingReadinessInput = {},
): WeddingMapGeocodingReadinessState {
  const provider = input.provider ?? "google_maps";
  const locationsRequested = count(input.locationsRequested);
  const locationsVerified = count(input.locationsVerified);
  const routesRequested = count(input.routesRequested);
  const routesVerified = count(input.routesVerified);
  const maxRouteAgeMinutes = count(input.maxRouteAgeMinutes);
  const errorCount = count(input.errorCount);
  const hasGeocodeWork = locationsRequested > 0;
  const hasRouteWork = routesRequested > 0;
  const evidenceLabels = [
    `${provider.replace(/_/g, " ")} provider selected`,
    hasGeocodeWork ? `${locationsVerified}/${locationsRequested} locations geocoded` : "No geocoding requested",
    hasRouteWork ? `${routesVerified}/${routesRequested} routes verified` : "No route verification requested",
    input.hasFallbackMapUrl ? "fallback map handoff URL available" : null,
    input.hasTravelTimeCaveat ? "travel-time caveat visible" : null,
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.geocodingConnected) blockerLabels.push("Live geocoding provider is not connected.");
  if (hasRouteWork && !input.routingConnected) blockerLabels.push("Live routing provider is not connected.");
  if (hasGeocodeWork && locationsVerified < locationsRequested) {
    blockerLabels.push("Not every requested wedding location has a verified geocode result.");
  }
  if (hasRouteWork && routesVerified < routesRequested) {
    blockerLabels.push("Not every requested wedding route has verified route data.");
  }
  if (hasRouteWork && (maxRouteAgeMinutes < 1 || maxRouteAgeMinutes > MAX_ROUTE_AGE_MINUTES)) {
    blockerLabels.push(`Route/travel-time data must be fresher than ${MAX_ROUTE_AGE_MINUTES} minutes.`);
  }
  if (!input.hasTravelTimeCaveat) {
    blockerLabels.push("User-facing travel-time caveat is missing.");
  }
  if (!input.hasFallbackMapUrl) {
    blockerLabels.push("Fallback external map URL is missing.");
  }
  if (errorCount > 0) {
    blockerLabels.push(`${errorCount} map/geocoding error${errorCount === 1 ? "" : "s"} occurred.`);
  }

  if (blockerLabels.length === 0 && (hasGeocodeWork || hasRouteWork)) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Live wedding map/geocoding evidence is verified for the requested locations and routes.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.hasFallbackMapUrl) && Boolean(input.hasTravelTimeCaveat) && !input.geocodingConnected;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Wedding map output is safe as an external map handoff, but not as verified live travel data."
      : "Wedding map/geocoding verification is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
