// @locs-version: 2.0
export type WeddingWeatherProvider = "bom" | "open_meteo" | "other";

export type WeddingWeatherProviderReadinessInput = {
  provider?: WeddingWeatherProvider | null;
  providerConnected?: boolean | null;
  forecastLocationsRequested?: number | null;
  forecastLocationsVerified?: number | null;
  maxForecastAgeMinutes?: number | null;
  hasSourceTimestamp?: boolean | null;
  hasUserFacingCaveat?: boolean | null;
  hasFallbackManualCheck?: boolean | null;
  errorCount?: number | null;
};

export type WeddingWeatherProviderReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

const MAX_FORECAST_AGE_MINUTES = 180;

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

function providerLabel(provider: WeddingWeatherProvider): string {
  if (provider === "bom") return "BOM/weather provider";
  if (provider === "open_meteo") return "Open-Meteo weather provider";
  return "Weather provider";
}

export function buildWeddingWeatherProviderReadinessState(
  input: WeddingWeatherProviderReadinessInput = {},
): WeddingWeatherProviderReadinessState {
  const provider = input.provider ?? "bom";
  const requested = count(input.forecastLocationsRequested);
  const verified = count(input.forecastLocationsVerified);
  const maxAge = count(input.maxForecastAgeMinutes);
  const errorCount = count(input.errorCount);
  const hasForecastWork = requested > 0;
  const evidenceLabels = [
    `${providerLabel(provider)} selected`,
    hasForecastWork ? `${verified}/${requested} forecast locations verified` : "No forecast locations requested",
    input.hasSourceTimestamp ? "forecast source timestamp visible" : null,
    input.hasUserFacingCaveat ? "weather uncertainty caveat visible" : null,
    input.hasFallbackManualCheck ? "manual weather-check fallback available" : null,
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.providerConnected) blockerLabels.push("Live weather provider is not connected.");
  if (hasForecastWork && verified < requested) blockerLabels.push("Not every requested wedding location has verified forecast evidence.");
  if (hasForecastWork && (maxAge < 1 || maxAge > MAX_FORECAST_AGE_MINUTES)) {
    blockerLabels.push(`Forecast evidence must be fresher than ${MAX_FORECAST_AGE_MINUTES} minutes.`);
  }
  if (!input.hasSourceTimestamp) blockerLabels.push("Forecast source timestamp is missing.");
  if (!input.hasUserFacingCaveat) blockerLabels.push("User-facing weather uncertainty caveat is missing.");
  if (!input.hasFallbackManualCheck) blockerLabels.push("Manual weather-check fallback is missing.");
  if (errorCount > 0) blockerLabels.push(`${errorCount} weather provider error${errorCount === 1 ? "" : "s"} occurred.`);

  if (blockerLabels.length === 0 && hasForecastWork) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Live wedding weather evidence is verified for the requested locations.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.hasFallbackManualCheck) && Boolean(input.hasUserFacingCaveat) && !input.providerConnected;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Wedding weather planning is safe as a manual-check handoff, but not as verified live forecast evidence."
      : "Wedding weather provider evidence is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
