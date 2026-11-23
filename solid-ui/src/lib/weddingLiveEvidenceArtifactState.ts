// @locs-version: 1.0
import {
  normalizeWeddingArtifactSummary,
  type WeddingArtifactInput,
  type WeddingArtifactSummary,
} from "@/lib/weddingArtifactState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import type { WeddingLiveEvidenceResponse } from "@/lib/api";

export type WeddingLiveEvidenceArtifactState = {
  status: "created" | "not_created";
  reason: string | null;
  metadata: WeddingPlanningMetadata;
  artifactInput: WeddingArtifactInput | null;
  summary: WeddingArtifactSummary | null;
  markdown: string | null;
  evidenceCount: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function redactedText(value: unknown): string {
  return clean(value)
    .replace(/\b(key|secret|token|credential|password)\s*[:=]\s*[^,\s)]+/gi, "$1=[redacted]")
    .replace(/\b(api[_-]?key)\s*[:=]\s*[^,\s)]+/gi, "$1=[redacted]");
}

function redactedRecord(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/key|secret|token|credential|password/i.test(key)) continue;
    if (typeof entry === "string") {
      next[key] = redactedText(entry);
    } else if (Array.isArray(entry)) {
      next[key] = entry.map((item) => typeof item === "string" ? redactedText(item) : item);
    } else {
      next[key] = entry;
    }
  }
  return next;
}

function uniqueStrings(values: readonly unknown[], limit = 24): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function artifactId(metadata: WeddingPlanningMetadata, locations: readonly string[]): string {
  return [
    "wedding_artifact",
    "live_location_weather",
    safeWeddingLabel(metadata.responseWorkspaceId),
    safeWeddingLabel(locations[0] ?? "location"),
  ].join(":");
}

function geocodeLabel(geocode: Record<string, unknown>): string {
  return clean(geocode.formatted_address)
    || clean(geocode.name)
    || clean(geocode.query)
    || clean(geocode.place_id)
    || "Location result";
}

function weatherLabel(item: Record<string, unknown>): string {
  const location = record(item.location);
  return clean(location.name) || clean(location.region) || clean(location.country) || "Weather forecast";
}

function forecastLines(item: Record<string, unknown>): string[] {
  const forecast = record(item.forecast);
  const days = Array.isArray(forecast.forecastday) ? forecast.forecastday : [];
  return days.slice(0, 7).flatMap((day): string[] => {
    const dayRecord = record(day);
    const date = clean(dayRecord.date);
    const details = record(dayRecord.day);
    const condition = record(details.condition);
    const bits = uniqueStrings([
      clean(condition.text),
      numeric(details.avgtemp_c) !== null ? `${numeric(details.avgtemp_c)} C avg` : null,
      numeric(details.maxtemp_c) !== null ? `${numeric(details.maxtemp_c)} C high` : null,
      numeric(details.daily_chance_of_rain) !== null ? `${numeric(details.daily_chance_of_rain)}% rain chance` : null,
    ]);
    return [`- ${date || "Forecast day"}: ${bits.join(", ") || "Review forecast details."}`];
  });
}

function markdownFor(response: WeddingLiveEvidenceResponse, locations: readonly string[]): string {
  const geocodes = response.geocodes;
  const weather = response.weather;
  return [
    "# Live location and weather evidence",
    "",
    "This packet records server-side map and weather evidence for planning decisions. It is not a venue booking, travel guarantee, or day-of safety clearance.",
    "",
    "## Requested locations",
    "",
    ...(locations.length > 0 ? locations.map((location) => `- ${location}`) : ["- No location supplied"]),
    "",
    "## Map evidence",
    "",
    ...(geocodes.length > 0
      ? geocodes.map((geocode) => {
        const lat = numeric(geocode.lat);
        const lng = numeric(geocode.lng);
        const provider = clean(geocode.provider) || "Map provider";
        const coordinates = lat !== null && lng !== null ? ` (${lat}, ${lng})` : "";
        return `- ${geocodeLabel(geocode)}${coordinates} via ${provider}`;
      })
      : ["- No geocode results returned."]),
    "",
    "## Weather evidence",
    "",
    ...(weather.length > 0
      ? weather.flatMap((item) => [
        `### ${weatherLabel(item)}`,
        ...forecastLines(item),
      ])
      : ["- No weather forecast returned."]),
    "",
    "## Follow-up actions",
    "",
    "- Confirm venue address, travel times, parking/load-in access, and wet-weather options directly with the venue or vendor.",
    "- Treat forecasts as planning evidence only; re-check weather inside the final week and day-of run sheet.",
    "- Keep contingency actions visible until the user or planner approves the relevant logistics decision.",
    ...response.guardrails.map((guardrail) => `- ${redactedText(guardrail)}`),
    ...(response.failures.length > 0 ? ["", "## Provider notes", "", ...response.failures.map((failure) => `- ${redactedText(failure)}`)] : []),
  ].join("\n");
}

export function buildWeddingLiveEvidenceArtifactState(input: {
  metadata?: unknown;
  locations?: readonly string[] | null;
  response: WeddingLiveEvidenceResponse;
}): WeddingLiveEvidenceArtifactState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const locations = uniqueStrings(input.locations ?? []);
  const response = input.response;
  const evidenceCount = response.geocodes.length + response.weather.length;
  if (!response.ok || evidenceCount === 0) {
    return {
      status: "not_created",
      reason: response.failures[0] ?? "Live location evidence did not return usable map or weather results.",
      metadata,
      artifactInput: null,
      summary: null,
      markdown: null,
      evidenceCount,
    };
  }

  const markdown = markdownFor(response, locations);
  const sourceLabels = uniqueStrings([
    ...response.geocodes.map((geocode) => geocode.provider),
    response.weather.length > 0 ? "WeatherAPI" : null,
    ...response.guardrails,
  ]);
  const locationLabels = uniqueStrings([
    ...locations,
    ...response.geocodes.map(geocodeLabel),
    ...response.weather.map(weatherLabel),
  ]);
  const artifactInput: WeddingArtifactInput = {
    id: artifactId(metadata, locations),
    title: "Live location and weather evidence",
    kind: "map_collection",
    metadata: {
      ...metadata,
      artifactKind: "map_collection",
      source: "live_evidence_executor",
      locationsRequested: response.locationsRequested,
      evidenceStatus: response.status,
      geocodeCount: response.geocodes.length,
      weatherCount: response.weather.length,
      receiptMetadata: redactedRecord(response.receiptMetadata),
      providerFailures: response.failures.map(redactedText),
    },
    sourceLabels,
    locationLabels,
    bodyText: markdown,
    exportTargets: ["html", "browser_pdf", "image_planned"],
  };
  const summary = normalizeWeddingArtifactSummary(artifactInput);
  return {
    status: summary ? "created" : "not_created",
    reason: summary ? null : "Live evidence notes could not be prepared.",
    metadata,
    artifactInput: summary ? artifactInput : null,
    summary,
    markdown: summary ? markdown : null,
    evidenceCount,
  };
}
