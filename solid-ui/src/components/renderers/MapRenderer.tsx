// @locs-version: 1.0
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import type {
  GeocodeResult,
  GeofenceZone,
  PlaceResult,
  RouteResult,
  TileConfig,
} from "@/lib/mapConfig";
import {
  OSM_TILE_CONFIG,
  createGeofenceZone,
  deleteGeofenceZone,
  listGeofenceZones,
} from "@/lib/mapConfig";
import {
  buildMapRendererFailureReceipt,
  type MapRendererFailureReceipt,
} from "@/lib/mapRendererFailureState";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import type * as L from "leaflet";

type LeafletLib = typeof L;

type MapContent = {
  result_type: "geocode" | "route" | "places";
  provider: string;
  query?: string;
  results?: GeocodeResult[];
  geocode_results?: GeocodeResult[];
  route?: RouteResult;
  places?: PlaceResult[];
  center?: { lat: number; lng: number };
  radius_m?: number;
  place_type?: string;
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
  tile_config?: TileConfig;
};

type RouteStepItem = {
  instruction: string;
  distanceText: string;
};

type GeocodeResultItem = {
  title: string;
  detail: string;
};

type PlaceItem = {
  place: PlaceResult;
  title: string;
  vicinityText: string | null;
  distanceText: string | null;
  selected: boolean;
};

type GeofenceZoneItem = {
  zone: GeofenceZone;
  iconText: string;
  radiusText: string;
};

type MapPoint = { lat: number; lng: number };

const MAP_HEADER_LABEL = "Map";
const MAP_LOADING_LABEL = "Loading map...";
const MAP_EDIT_HINT = "Hold Alt and drag to draw a geofence zone.";
const MAP_ZONE_TITLE = "Geofence Zones";
const MAP_ZONE_SAVING = "saving...";
const MAP_REMOVE_LABEL = "Remove";
const MAP_PRIMARY_RESULT_LABEL = "Primary result";
const MAP_START_LABEL = "Start";
const MAP_DESTINATION_LABEL = "Destination";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? "")) : [];
}

function mapPoint(value: unknown): MapPoint | undefined {
  if (!isRecord(value)) return undefined;
  const lat = finiteNumber(value.lat);
  const lng = finiteNumber(value.lng);
  return lat == null || lng == null ? undefined : { lat, lng };
}

function mapResultType(value: unknown): MapContent["result_type"] {
  return value === "route" || value === "places" || value === "geocode" ? value : "geocode";
}

function tileConfigValue(value: unknown): TileConfig | undefined {
  if (!isRecord(value)) return undefined;
  const provider = value.provider;
  if (provider !== "google_maps" && provider !== "mapbox" && provider !== "osm") return undefined;
  return {
    provider,
    tile_url_template: stringValue(value.tile_url_template),
    attribution: stringValue(value.attribution),
    max_zoom: finiteNumber(value.max_zoom) ?? OSM_TILE_CONFIG.max_zoom,
  };
}

function geocodeResult(value: unknown): GeocodeResult | null {
  if (!isRecord(value)) return null;
  const lat = finiteNumber(value.lat);
  const lng = finiteNumber(value.lng);
  if (lat == null || lng == null) return null;
  return {
    display_name: stringValue(value.display_name),
    lat,
    lng,
    place_id: typeof value.place_id === "string" ? value.place_id : undefined,
    country: typeof value.country === "string" ? value.country : undefined,
  };
}

function routeStep(value: unknown): RouteResult["steps"][number] | null {
  if (!isRecord(value)) return null;
  const start = mapPoint(value.start);
  const end = mapPoint(value.end);
  if (!start || !end) return null;
  return {
    instruction: stringValue(value.instruction),
    distance_m: finiteNumber(value.distance_m) ?? 0,
    duration_s: finiteNumber(value.duration_s) ?? 0,
    start,
    end,
  };
}

function routeResult(value: unknown): RouteResult | undefined {
  if (!isRecord(value)) return undefined;
  const steps = Array.isArray(value.steps) ? value.steps.map(routeStep).filter((step): step is RouteResult["steps"][number] => Boolean(step)) : [];
  return {
    distance_m: finiteNumber(value.distance_m) ?? 0,
    duration_s: finiteNumber(value.duration_s) ?? 0,
    steps,
    polyline: typeof value.polyline === "string" ? value.polyline : undefined,
    distance_text: stringValue(value.distance_text),
    duration_text: stringValue(value.duration_text),
  };
}

function placeResult(value: unknown): PlaceResult | null {
  if (!isRecord(value)) return null;
  const lat = finiteNumber(value.lat);
  const lng = finiteNumber(value.lng);
  if (lat == null || lng == null) return null;
  return {
    name: stringValue(value.name),
    lat,
    lng,
    place_id: typeof value.place_id === "string" ? value.place_id : undefined,
    types: stringArray(value.types),
    distance_m: finiteNumber(value.distance_m) ?? undefined,
    vicinity: typeof value.vicinity === "string" ? value.vicinity : undefined,
  };
}

function mapContentValue(value: unknown): MapContent {
  const content = isRecord(value) ? value : {};
  const geocodeResults = Array.isArray(content.geocode_results)
    ? content.geocode_results.map(geocodeResult).filter((result): result is GeocodeResult => Boolean(result))
    : undefined;
  const results = Array.isArray(content.results)
    ? content.results.map(geocodeResult).filter((result): result is GeocodeResult => Boolean(result))
    : undefined;
  const places = Array.isArray(content.places)
    ? content.places.map(placeResult).filter((place): place is PlaceResult => Boolean(place))
    : undefined;
  return {
    result_type: mapResultType(content.result_type),
    provider: stringValue(content.provider, OSM_TILE_CONFIG.provider),
    query: typeof content.query === "string" ? content.query : undefined,
    results,
    geocode_results: geocodeResults,
    route: routeResult(content.route),
    places,
    center: mapPoint(content.center),
    radius_m: finiteNumber(content.radius_m) ?? undefined,
    place_type: typeof content.place_type === "string" ? content.place_type : undefined,
    origin: mapPoint(content.origin),
    destination: mapPoint(content.destination),
    tile_config: tileConfigValue(content.tile_config),
  };
}

export function MapRenderer(props: { message: AfpMessage; view?: AfpView; allowEdit?: boolean }) {
  let mapContainer: HTMLDivElement | undefined;
  let mapInstance: L.Map | undefined;
  let leafletLib: LeafletLib | undefined;

  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<MapRendererFailureReceipt | null>(null);
  const [selectedPlace, setSelectedPlace] = createSignal<PlaceResult | null>(null);
  const [geofenceZones, setGeofenceZones] = createSignal<GeofenceZone[]>([]);
  const [savingZone, setSavingZone] = createSignal(false);
  const zoneCircles = new Map<string, L.Circle>();

  const mapContent = createMemo<MapContent>(() => {
    const viewContent = props.view?.content;
    const safeMessageContent = decryptedDisplayContent(props.message);
    return mapContentValue(
      !props.message.encryption && isRecord(viewContent) ? viewContent : safeMessageContent,
    );
  });

  const tileConfig = createMemo<TileConfig>(() => mapContent().tile_config ?? OSM_TILE_CONFIG);
  const resultType = createMemo(() => mapContent().result_type ?? "geocode");
  const geocodeResults = createMemo(() => mapContent().geocode_results ?? mapContent().results ?? []);
  const places = createMemo(() => mapContent().places ?? []);
  const route = createMemo(() => mapContent().route as RouteResult | undefined);

  const initialCenter = createMemo<[number, number]>(() => {
    const center = mapContent().center;
    if (center) return [center.lat, center.lng];
    if (resultType() === "geocode" && geocodeResults().length > 0) {
      return [geocodeResults()[0].lat, geocodeResults()[0].lng];
    }
    if (resultType() === "route") {
      const origin = mapContent().origin;
      if (origin) return [origin.lat, origin.lng];
    }
    return [-33.8688, 151.2093];
  });

  const initialZoom = createMemo(() => {
    if (resultType() === "geocode") return 13;
    if (resultType() === "route") return 11;
    if (resultType() === "places") return 15;
    return 13;
  });

  const rendererState = createMemo(() => {
    const currentRoute = route();
    const currentType = resultType();
    const query = mapContent().query ?? "";
    const currentPlaces = places();
    const currentGeocodes = geocodeResults();
    const placeType = mapContent().place_type ?? "place";
    const provider = mapContent().provider ?? tileConfig().provider;
    const providerLabels: Record<string, string> = {
      google_maps: "Google Maps",
      mapbox: "Mapbox",
      osm: "OpenStreetMap",
    };
    const summaryText =
      currentType === "route" && currentRoute
        ? `${currentRoute.distance_text} - ${currentRoute.duration_text}`
        : currentType === "places"
          ? `${currentPlaces.length} ${placeType}${currentPlaces.length !== 1 ? "s" : ""} found`
          : currentType === "geocode"
            ? currentGeocodes.length > 0
              ? `${currentGeocodes.length} result${currentGeocodes.length !== 1 ? "s" : ""} for "${query}"`
              : `No results for "${query}"`
            : query;

    const routeStepItems: RouteStepItem[] =
      currentType === "route" && currentRoute
        ? currentRoute.steps.slice(0, 10).map((step) => ({
            instruction: (step.instruction ?? "").replace(/<[^>]*>/g, ""),
            distanceText:
              step.distance_m < 1000
                ? `${Math.round(step.distance_m)}m`
                : `${(step.distance_m / 1000).toFixed(1)}km`,
          }))
        : [];

    const geocodeItems: GeocodeResultItem[] =
      currentType === "geocode"
        ? currentGeocodes.slice(0, 5).map((result) => ({
            title: result.display_name,
            detail: `${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}${
              result.country ? ` - ${result.country}` : ""
            }`,
          }))
        : [];

    const selectedPlaceId = selectedPlace()?.place_id ?? null;
    const placeItems: PlaceItem[] =
      currentType === "places"
        ? currentPlaces.map((place) => ({
            place,
            title: place.name,
            vicinityText: place.vicinity ?? null,
            distanceText:
              place.distance_m != null
                ? place.distance_m < 1000
                  ? `${Math.round(place.distance_m)}m away`
                  : `${(place.distance_m / 1000).toFixed(1)}km away`
                : null,
            selected: selectedPlaceId === place.place_id,
          }))
        : [];

    const geofenceZoneItems: GeofenceZoneItem[] = geofenceZones().map((zone) => ({
      zone,
      iconText: zone.enabled ? "on" : "off",
      radiusText: `${Math.round(zone.radius_m)}m`,
    }));

    return {
      summaryText,
      providerText: providerLabels[provider] ?? provider,
      loading: loading(),
      errorValue: error(),
      showError: Boolean(error()),
      showEditHint: Boolean(props.allowEdit),
      showRouteSteps: routeStepItems.length > 0,
      routeStepItems,
      showGeocodeList: geocodeItems.length > 0,
      geocodeItems,
      showPlacesList: placeItems.length > 0,
      placeItems,
      showZoneList: Boolean(props.allowEdit) && geofenceZoneItems.length > 0,
      geofenceZoneItems,
      savingZone: savingZone(),
    };
  });

  onMount(async () => {
    try {
      const L = await import("leaflet");
      leafletLib = L;
      await import("leaflet/dist/leaflet.css" as string);
      if (!mapContainer) return;

      mapInstance = L.map(mapContainer, {
        center: initialCenter(),
        zoom: initialZoom(),
        zoomControl: true,
        scrollWheelZoom: true,
      });

      const config = tileConfig();
      const subdomains =
        config.provider === "google_maps" ? ["mt0", "mt1", "mt2", "mt3"] : ["a", "b", "c"];

      L.tileLayer(config.tile_url_template, {
        attribution: config.attribution,
        maxZoom: config.max_zoom,
        subdomains,
      }).addTo(mapInstance);

      renderMapContent(L, mapInstance);
      setLoading(false);

      if (props.allowEdit) {
        setupGeofenceDrawing(L, mapInstance);
        await loadAndRenderZones(L, mapInstance);
      }
    } catch (loadError) {
      setError(
        buildMapRendererFailureReceipt(
          "Load map",
          loadError instanceof Error ? loadError.message : "Map failed to load - check your connection.",
        ),
      );
      setLoading(false);
    }
  });

  onCleanup(() => {
    mapInstance?.remove();
    mapInstance = undefined;
  });

  function renderMapContent(L: LeafletLib, map: L.Map) {
    if (resultType() === "geocode") renderGeocodeMarkers(L, map);
    else if (resultType() === "route") renderRoute(L, map);
    else if (resultType() === "places") renderPlaces(L, map);
  }

  function renderGeocodeMarkers(L: LeafletLib, map: L.Map) {
    const results = geocodeResults();
    if (results.length === 0) return;

    const bounds: [number, number][] = [];
    results.slice(0, 5).forEach((result, index) => {
      const marker = L.marker([result.lat, result.lng]).addTo(map);
      marker.bindPopup(
        `<strong>${index === 0 ? `${MAP_PRIMARY_RESULT_LABEL}: ` : ""}${result.display_name}</strong>${
          result.country ? `<br><small>${result.country}</small>` : ""
        }`,
      );
      if (index === 0) marker.openPopup();
      bounds.push([result.lat, result.lng]);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [30, 30] });
    }
  }

  function renderRoute(L: LeafletLib, map: L.Map) {
    const content = mapContent();
    const origin = content.origin;
    const destination = content.destination;
    const routeValue = route();

    if (!origin || !destination) return;

    L.marker([origin.lat, origin.lng], { icon: coloredIcon(L, "#22c55e") })
      .addTo(map)
      .bindPopup(`<strong>${MAP_START_LABEL}</strong>`);

    L.marker([destination.lat, destination.lng], { icon: coloredIcon(L, "#ef4444") })
      .addTo(map)
      .bindPopup(
        routeValue
          ? `<strong>${MAP_DESTINATION_LABEL}</strong><br>${routeValue.distance_text} - ${routeValue.duration_text}`
          : `<strong>${MAP_DESTINATION_LABEL}</strong>`,
      );

    if (routeValue && routeValue.steps.length > 0) {
      const latlngs: L.LatLngExpression[] = [[origin.lat, origin.lng]];
      routeValue.steps.forEach((step) => {
        latlngs.push([step.start.lat, step.start.lng], [step.end.lat, step.end.lng]);
      });
      latlngs.push([destination.lat, destination.lng]);

      L.polyline(latlngs, {
        color: "#6366f1",
        weight: 4,
        opacity: 0.8,
      }).addTo(map);
    }

    map.fitBounds(
      [
        [origin.lat, origin.lng],
        [destination.lat, destination.lng],
      ],
      { padding: [40, 40] },
    );
  }

  function renderPlaces(L: LeafletLib, map: L.Map) {
    const points = places();
    const center = mapContent().center;
    const radius = mapContent().radius_m ?? 500;

    if (center) {
      L.circle([center.lat, center.lng], {
        radius,
        color: "#6366f1",
        fillColor: "#6366f1",
        fillOpacity: 0.07,
        weight: 1.5,
      }).addTo(map);
    }

    points.forEach((place) => {
      const marker = L.marker([place.lat, place.lng]).addTo(map);
      marker.bindPopup(
        `<strong>${place.name}</strong>${
          place.vicinity ? `<br><small>${place.vicinity}</small>` : ""
        }${
          place.distance_m ? `<br><small>${(place.distance_m / 1000).toFixed(1)} km away</small>` : ""
        }`,
      );
      marker.on("click", () => setSelectedPlace(place));
    });

    if (points.length > 0 && center) {
      map.setView([center.lat, center.lng], 15);
    }
  }

  async function loadAndRenderZones(L: LeafletLib, map: L.Map) {
    try {
      const zones = await listGeofenceZones();
      for (const zone of zones) renderZoneCircle(L, map, zone);
      setGeofenceZones(zones);
    } catch {
      // ignore zone loading failure
    }
  }

  function renderZoneCircle(L: LeafletLib, map: L.Map, zone: GeofenceZone) {
    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.radius_m,
      color: zone.enabled ? "#f59e0b" : "#9ca3af",
      dashArray: zone.enabled ? undefined : "4",
      fillOpacity: 0.1,
    })
      .addTo(map)
      .bindPopup(`<strong>${zone.name}</strong><br>${Math.round(zone.radius_m)}m radius`);
    zoneCircles.set(zone.id, circle);
  }

  function setupGeofenceDrawing(L: LeafletLib, map: L.Map) {
    let drawingCircle: L.Circle | null = null;
    let drawStart: L.LatLng | null = null;

    map.on("mousedown", (event: L.LeafletMouseEvent) => {
      if (!event.originalEvent.altKey) return;
      drawStart = event.latlng;
      drawingCircle = L.circle(event.latlng, {
        radius: 1,
        color: "#f59e0b",
        dashArray: "4",
      }).addTo(map);
    });

    map.on("mousemove", (event: L.LeafletMouseEvent) => {
      if (!drawingCircle || !drawStart) return;
      drawingCircle.setRadius(drawStart.distanceTo(event.latlng));
    });

    map.on("mouseup", async (event: L.LeafletMouseEvent) => {
      if (!drawingCircle || !drawStart) return;
      const radius = Math.max(50, drawStart.distanceTo(event.latlng));
      drawingCircle.remove();
      drawingCircle = null;
      const startPoint = drawStart;
      drawStart = null;

      setSavingZone(true);
      try {
        const saved = await createGeofenceZone({
          name: `Zone ${geofenceZones().length + 1}`,
          lat: startPoint.lat,
          lng: startPoint.lng,
          radius_m: radius,
          zone_type: "custom",
        });
        renderZoneCircle(L, map, saved);
        setGeofenceZones((previous) => [...previous, saved]);
      } catch {
        setError(buildMapRendererFailureReceipt("Save zone", "Failed to save zone. Try again."));
        setTimeout(() => setError(null), 3000);
      } finally {
        setSavingZone(false);
      }
    });
  }

  function coloredIcon(L: LeafletLib, color: string): L.DivIcon {
    return L.divIcon({
      html: `<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      className: "",
    });
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <span class="text-base">{MAP_HEADER_LABEL}</span>
        <p class="min-w-0 flex-1 break-words text-sm font-medium text-on-surface">{rendererState().summaryText}</p>
        <span class="max-w-full break-words rounded-full bg-surface-variant px-2 py-1 text-xs text-on-surface-variant">
          {rendererState().providerText}
        </span>
      </div>

      <div class="relative overflow-hidden rounded-lg border border-outline-variant">
        <Show when={rendererState().loading}>
          <div class="absolute inset-0 z-10 flex items-center justify-center bg-surface">
            <span class="animate-pulse text-xs text-on-surface-variant">{MAP_LOADING_LABEL}</span>
          </div>
        </Show>
        <Show when={rendererState().showError}>
          <div class="space-y-1 p-4">
            <p class="text-sm font-semibold text-error">{rendererState().errorValue?.title}</p>
            <p class="text-xs text-on-surface-variant">{rendererState().errorValue?.summary}</p>
            <p class="text-[11px] text-on-surface-variant/80">{rendererState().errorValue?.nextStep}</p>
          </div>
        </Show>
        <div ref={mapContainer} class="h-64 w-full" />
      </div>

      <Show when={rendererState().showEditHint}>
        <p class="text-xs text-on-surface-variant">{MAP_EDIT_HINT}</p>
      </Show>

      <Show when={rendererState().showRouteSteps}>
        <div class="max-h-48 overflow-y-auto rounded-lg border border-outline-variant divide-y divide-outline-variant">
          <For each={rendererState().routeStepItems}>
            {(step) => (
              <div class="flex min-w-0 flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:justify-between sm:gap-3">
                <span class="min-w-0 flex-1 break-words text-on-surface">{step.instruction}</span>
                <span class="shrink-0 text-on-surface-variant">{step.distanceText}</span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={rendererState().showGeocodeList}>
        <div class="rounded-lg border border-outline-variant divide-y divide-outline-variant">
          <For each={rendererState().geocodeItems}>
            {(result) => (
              <div class="px-3 py-2 text-xs">
                <p class="break-words font-medium text-on-surface">{result.title}</p>
                <p class="break-words text-on-surface-variant">{result.detail}</p>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={rendererState().showPlacesList}>
        <div class="max-h-48 overflow-y-auto rounded-lg border border-outline-variant divide-y divide-outline-variant">
          <For each={rendererState().placeItems}>
            {(item) => (
              <button
                class="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-surface-variant"
                classList={{ "bg-surface-variant": item.selected }}
                onClick={() => setSelectedPlace(item.place)}
              >
                <p class="break-words font-medium text-on-surface">{item.title}</p>
                <Show when={item.vicinityText}>
                  <p class="break-words text-on-surface-variant">{item.vicinityText}</p>
                </Show>
                <Show when={item.distanceText}>
                  <p class="text-on-surface-variant">{item.distanceText}</p>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={rendererState().showZoneList}>
        <div class="space-y-2 rounded-lg border border-outline-variant p-3">
          <p class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
            {MAP_ZONE_TITLE}
            <Show when={rendererState().savingZone}>
              <span class="ml-2 animate-pulse text-[10px] text-primary">{MAP_ZONE_SAVING}</span>
            </Show>
          </p>
          <For each={rendererState().geofenceZoneItems}>
            {(item) => (
              <div class="flex min-w-0 items-center gap-2 text-xs text-on-surface">
                <span>{item.iconText}</span>
                <span class="min-w-0 flex-1 break-words">{item.zone.name}</span>
                <span class="shrink-0 text-on-surface-variant">{item.radiusText}</span>
                <button
                  class="shrink-0 text-error hover:underline disabled:opacity-40"
                  disabled={rendererState().savingZone}
                  onClick={async () => {
                    setSavingZone(true);
                    try {
                      await deleteGeofenceZone(item.zone.id);
                      zoneCircles.get(item.zone.id)?.remove();
                      zoneCircles.delete(item.zone.id);
                      setGeofenceZones((previous) =>
                        previous.filter((zone) => zone.id !== item.zone.id),
                      );
                    } catch {
                      setError(buildMapRendererFailureReceipt("Delete zone", "Failed to delete zone."));
                      setTimeout(() => setError(null), 3000);
                    } finally {
                      setSavingZone(false);
                    }
                  }}
                >
                  {MAP_REMOVE_LABEL}
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
