// @locs-version: 1.0
import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

export type MapProviderName = "google_maps" | "mapbox" | "osm";

export interface TileConfig {
  provider: MapProviderName;
  tile_url_template: string;
  attribution: string;
  max_zoom: number;
}

export interface MapProviderConfig {
  provider: MapProviderName;
  tile_config: TileConfig;
  available_providers: MapProviderName[];
}

export interface GeocodeResult {
  display_name: string;
  lat: number;
  lng: number;
  place_id?: string;
  country?: string;
}

export interface RouteStep {
  instruction: string;
  distance_m: number;
  duration_s: number;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
}

export interface RouteResult {
  distance_m: number;
  duration_s: number;
  steps: RouteStep[];
  polyline?: string;
  distance_text: string;
  duration_text: string;
}

export interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
  place_id?: string;
  types: string[];
  distance_m?: number;
  vicinity?: string;
}

// ── Provider display metadata ─────────────────────────────────────────────────

export const PROVIDER_META: Record<
  MapProviderName,
  {
    label: string;
    description: string;
    requiresKey: boolean;
    keyEnvVar?: string;
    keyUrl?: string;
    keyInstructions?: string;
  }
> = {
  google_maps: {
    label: "Google Maps",
    description: "Full routing, places search, and live traffic. Requires Google Maps API key.",
    requiresKey: true,
    keyEnvVar: "OMNYID_GOOGLE_MAPS_KEY",
    keyUrl: "https://developers.google.com/maps/documentation/javascript/get-api-key",
    keyInstructions:
      "1. Open Google Cloud Console and create (or select) a project.\n" +
      "2. Enable the Maps JavaScript API, Directions API, Places API, and Geocoding API.\n" +
      "3. Go to Credentials → Create Credentials → API key.\n" +
      "4. Restrict the key to those four APIs and your server IP.\n" +
      "5. Set the key on your server as the environment variable OMNYID_GOOGLE_MAPS_KEY.",
  },
  mapbox: {
    label: "Mapbox",
    description: "High-quality maps and routing. Requires Mapbox access token.",
    requiresKey: true,
    keyEnvVar: "OMNYID_MAPBOX_TOKEN",
    keyUrl: "https://account.mapbox.com/access-tokens/",
    keyInstructions:
      "1. Sign in to your Mapbox account (create one free at mapbox.com).\n" +
      "2. Go to Account → Access Tokens → Create a token.\n" +
      "3. Select scopes: styles:read, tiles:read, directions:read, geocoding:read.\n" +
      "4. Set the token on your server as the environment variable OMNYID_MAPBOX_TOKEN.",
  },
  osm: {
    label: "OpenStreetMap (Free)",
    description: "Free community maps via Nominatim + OSRM. No API key required. Rate-limited.",
    requiresKey: false,
  },
};

// ── Geofence zone types ───────────────────────────────────────────────────────

export interface GeofenceZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  zone_type: string;
  trigger_heuristic_id?: string;
  trigger_on: "enter" | "exit" | "both";
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeofenceZoneCreate {
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  zone_type?: string;
  trigger_heuristic_id?: string;
  trigger_on?: "enter" | "exit" | "both";
}

export interface GeofenceZoneUpdate {
  name?: string;
  radius_m?: number;
  zone_type?: string;
  trigger_on?: "enter" | "exit" | "both";
  enabled?: boolean;
}

// ── API helpers ───────────────────────────────────────────────────────────────

export async function getMapProvider(): Promise<MapProviderConfig> {
  return normalizeMapProviderConfig(await apiFetch<unknown>("/map/provider"));
}

export async function setMapProvider(provider: MapProviderName): Promise<void> {
  await apiFetch<unknown>("/map/provider", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
}

export async function geocodeQuery(
  threadId: string,
  query: string
): Promise<{ results: GeocodeResult[]; message_id: string; provider: MapProviderName }> {
  return normalizeGeocodeResponse(await apiFetch<unknown>(
    "/map/geocode",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: threadId, query }),
    },
  ));
}

export async function getRoute(
  threadId: string,
  params: {
    origin_query?: string;
    origin_lat?: number;
    origin_lng?: number;
    destination_query?: string;
    destination_lat?: number;
    destination_lng?: number;
    mode?: string;
  },
): Promise<{ route?: RouteResult; message_id: string; provider: MapProviderName }> {
  return normalizeRouteResponse(await apiFetch<unknown>(
    "/map/route",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: threadId, ...params }),
    },
  ));
}

export async function getNearbyPlaces(
  threadId: string,
  lat: number,
  lng: number,
  placeType: string,
  radiusM = 500,
): Promise<{ places: PlaceResult[]; message_id: string; provider: MapProviderName }> {
  return normalizePlacesResponse(await apiFetch<unknown>(
    "/map/places",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: threadId, lat, lng, place_type: placeType, radius_m: radiusM }),
    },
  ));
}

export async function ingestLocation(
  threadId: string,
  lat: number,
  lng: number,
  opts?: { accuracy_m?: number; source?: string; resolve_label?: boolean },
): Promise<{ event_id: string; message_id: string; label?: string }> {
  return normalizeLocationIngestResponse(await apiFetch<unknown>("/ingest/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: threadId, lat, lng, ...opts }),
  }));
}

// ── Geofence zone API helpers ─────────────────────────────────────────────────

export async function listGeofenceZones(): Promise<GeofenceZone[]> {
  return normalizeGeofenceZonesResponse(await apiFetch<unknown>("/geofence/zones"));
}

export async function createGeofenceZone(zone: GeofenceZoneCreate): Promise<GeofenceZone> {
  const saved = normalizeGeofenceZoneResponse(await apiFetch<unknown>("/geofence/zones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(zone),
  }));
  if (!saved) throw new Error("Map service returned an invalid geofence zone.");
  return saved;
}

export async function updateGeofenceZone(id: string, updates: GeofenceZoneUpdate): Promise<GeofenceZone> {
  const saved = normalizeGeofenceZoneResponse(await apiFetch<unknown>(`/geofence/zones/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  }));
  if (!saved) throw new Error("Map service returned an invalid geofence zone.");
  return saved;
}

export async function deleteGeofenceZone(id: string): Promise<void> {
  await apiFetch<unknown>(`/geofence/zones/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ── Tile URL helpers ──────────────────────────────────────────────────────────

/** OSM fallback tile config — used when no server config is available. */
export const OSM_TILE_CONFIG: TileConfig = {
  provider: "osm",
  tile_url_template: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "© OpenStreetMap contributors",
  max_zoom: 19,
};

const MAP_PROVIDERS = new Set<MapProviderName>(["google_maps", "mapbox", "osm"]);
const GEOFENCE_TRIGGERS = new Set<GeofenceZone["trigger_on"]>(["enter", "exit", "both"]);

function scalarString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function optionalString(value: unknown): string | undefined {
  const text = scalarString(value).trim();
  return text || undefined;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeMapProviderName(value: unknown, fallback: MapProviderName | null = "osm"): MapProviderName {
  return typeof value === "string" && MAP_PROVIDERS.has(value as MapProviderName)
    ? value as MapProviderName
    : fallback ?? "osm";
}

function normalizeMapProviderOption(value: unknown): MapProviderName | null {
  return typeof value === "string" && MAP_PROVIDERS.has(value as MapProviderName) ? value as MapProviderName : null;
}

function normalizeGeofenceTrigger(value: unknown): GeofenceZone["trigger_on"] {
  return typeof value === "string" && GEOFENCE_TRIGGERS.has(value as GeofenceZone["trigger_on"])
    ? value as GeofenceZone["trigger_on"]
    : "both";
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(optionalString).filter((item): item is string => Boolean(item)) : [];
}

function normalizeCoordinate(value: unknown): { lat: number; lng: number } | null {
  if (!isRecord(value)) return null;
  const lat = finiteNumber(value.lat);
  const lng = finiteNumber(value.lng);
  return lat === null || lng === null ? null : { lat, lng };
}

export function normalizeTileConfig(value: unknown): TileConfig {
  if (!isRecord(value)) return OSM_TILE_CONFIG;
  const tileUrl = optionalString(value.tile_url_template);
  const attribution = optionalString(value.attribution);
  const maxZoom = finiteNumber(value.max_zoom);
  if (!tileUrl || !attribution || maxZoom === null) return OSM_TILE_CONFIG;
  return {
    provider: normalizeMapProviderName(value.provider),
    tile_url_template: tileUrl,
    attribution,
    max_zoom: maxZoom,
  };
}

export function normalizeMapProviderConfig(value: unknown): MapProviderConfig {
  if (!isRecord(value)) {
    return { provider: "osm", tile_config: OSM_TILE_CONFIG, available_providers: ["osm"] };
  }
  const availableProviders = Array.isArray(value.available_providers)
    ? value.available_providers
      .map(normalizeMapProviderOption)
      .filter((item): item is MapProviderName => Boolean(item))
    : [];
  return {
    provider: normalizeMapProviderName(value.provider),
    tile_config: normalizeTileConfig(value.tile_config),
    available_providers: availableProviders.length > 0 ? availableProviders : ["osm"],
  };
}

export function normalizeGeocodeResult(value: unknown): GeocodeResult | null {
  if (!isRecord(value)) return null;
  const displayName = optionalString(value.display_name);
  const lat = finiteNumber(value.lat);
  const lng = finiteNumber(value.lng);
  if (!displayName || lat === null || lng === null) return null;
  return {
    display_name: displayName,
    lat,
    lng,
    place_id: optionalString(value.place_id),
    country: optionalString(value.country),
  };
}

export function normalizeRouteStep(value: unknown): RouteStep | null {
  if (!isRecord(value)) return null;
  const start = normalizeCoordinate(value.start);
  const end = normalizeCoordinate(value.end);
  if (!start || !end) return null;
  return {
    instruction: scalarString(value.instruction, "Continue"),
    distance_m: finiteNumber(value.distance_m) ?? 0,
    duration_s: finiteNumber(value.duration_s) ?? 0,
    start,
    end,
  };
}

export function normalizeRouteResult(value: unknown): RouteResult | null {
  if (!isRecord(value)) return null;
  const distanceM = finiteNumber(value.distance_m);
  const durationS = finiteNumber(value.duration_s);
  if (distanceM === null || durationS === null) return null;
  return {
    distance_m: distanceM,
    duration_s: durationS,
    steps: Array.isArray(value.steps)
      ? value.steps.map(normalizeRouteStep).filter((step): step is RouteStep => Boolean(step))
      : [],
    polyline: optionalString(value.polyline),
    distance_text: scalarString(value.distance_text, `${Math.round(distanceM)} m`),
    duration_text: scalarString(value.duration_text, `${Math.round(durationS)} s`),
  };
}

export function normalizePlaceResult(value: unknown): PlaceResult | null {
  if (!isRecord(value)) return null;
  const name = optionalString(value.name);
  const lat = finiteNumber(value.lat);
  const lng = finiteNumber(value.lng);
  if (!name || lat === null || lng === null) return null;
  return {
    name,
    lat,
    lng,
    place_id: optionalString(value.place_id),
    types: normalizeStringList(value.types),
    distance_m: finiteNumber(value.distance_m) ?? undefined,
    vicinity: optionalString(value.vicinity),
  };
}

export function normalizeGeofenceZone(value: unknown): GeofenceZone | null {
  if (!isRecord(value)) return null;
  const id = optionalString(value.id);
  const name = optionalString(value.name);
  const lat = finiteNumber(value.lat);
  const lng = finiteNumber(value.lng);
  const radiusM = finiteNumber(value.radius_m);
  if (!id || !name || lat === null || lng === null || radiusM === null) return null;
  return {
    id,
    name,
    lat,
    lng,
    radius_m: radiusM,
    zone_type: scalarString(value.zone_type, "custom"),
    trigger_heuristic_id: optionalString(value.trigger_heuristic_id),
    trigger_on: normalizeGeofenceTrigger(value.trigger_on),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    created_at: scalarString(value.created_at),
    updated_at: scalarString(value.updated_at),
  };
}

export function normalizeGeocodeResponse(value: unknown): { results: GeocodeResult[]; message_id: string; provider: MapProviderName } {
  const record = isRecord(value) ? value : {};
  return {
    results: Array.isArray(record.results)
      ? record.results.map(normalizeGeocodeResult).filter((item): item is GeocodeResult => Boolean(item))
      : [],
    message_id: scalarString(record.message_id),
    provider: normalizeMapProviderName(record.provider),
  };
}

export function normalizeRouteResponse(value: unknown): { route?: RouteResult; message_id: string; provider: MapProviderName } {
  const record = isRecord(value) ? value : {};
  const route = normalizeRouteResult(record.route);
  return {
    ...(route ? { route } : {}),
    message_id: scalarString(record.message_id),
    provider: normalizeMapProviderName(record.provider),
  };
}

export function normalizePlacesResponse(value: unknown): { places: PlaceResult[]; message_id: string; provider: MapProviderName } {
  const record = isRecord(value) ? value : {};
  return {
    places: Array.isArray(record.places)
      ? record.places.map(normalizePlaceResult).filter((item): item is PlaceResult => Boolean(item))
      : [],
    message_id: scalarString(record.message_id),
    provider: normalizeMapProviderName(record.provider),
  };
}

export function normalizeLocationIngestResponse(value: unknown): { event_id: string; message_id: string; label?: string } {
  const record = isRecord(value) ? value : {};
  return {
    event_id: scalarString(record.event_id),
    message_id: scalarString(record.message_id),
    label: optionalString(record.label),
  };
}

export function normalizeGeofenceZonesResponse(value: unknown): GeofenceZone[] {
  const record = isRecord(value) ? value : {};
  return Array.isArray(record.zones)
    ? record.zones.map(normalizeGeofenceZone).filter((zone): zone is GeofenceZone => Boolean(zone))
    : [];
}

export function normalizeGeofenceZoneResponse(value: unknown): GeofenceZone | null {
  const record = isRecord(value) ? value : {};
  return normalizeGeofenceZone(record.zone);
}
