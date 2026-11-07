import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type * as Leaflet from "leaflet";

import { WeddingLimitedSpecialVenueCard } from "@/components/WeddingLimitedSpecialVenueCard";
import { OSM_TILE_CONFIG } from "@/lib/mapConfig";
import { friendlyErrorText } from "@/lib/visibleErrorText";
import {
  loadWeddingVendorSpecials,
  type WeddingVendorRankedSpecialDetail,
  type WeddingVendorSpecialMarker,
} from "@/lib/weddingVendorSpecialDiscoveryApi";
import type {
  WeddingVendorShortlistPreference,
  WeddingVendorShortlistPreferenceRecord,
} from "@/lib/weddingVendorShortlistPreferenceState";

const SYDNEY: [number, number] = [-33.8688, 151.2093];
const CATEGORIES = [
  "Venue", "Photographer", "Videographer", "Florist", "Caterer", "Planner",
  "Celebrant", "DJ & Band", "Musician", "Hair & Makeup", "Cake Baker",
];

function validDate(value: string | null | undefined): string {
  const match = value?.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (match) return match[0];
  const fallback = new Date();
  fallback.setMonth(fallback.getMonth() + 6);
  return fallback.toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export function WeddingLimitedSpecialsMap(props: {
  weddingDate?: string | null;
  initialCategory?: string | null;
  initialGuestCount?: number | null;
  categoryBudgets?: readonly { categoryId: string; amount: number }[];
  preferenceTerms?: readonly string[];
  shortlistPreferences?: ReadonlyMap<string, WeddingVendorShortlistPreferenceRecord>;
  onPrepareEnquiry: (marker: WeddingVendorSpecialMarker, detail: WeddingVendorRankedSpecialDetail | null) => void;
  onSavePreference?: (marker: WeddingVendorSpecialMarker, preference: WeddingVendorShortlistPreference, reason: string | null) => Promise<void> | void;
}) {
  const [date, setDate] = createSignal(validDate(props.weddingDate));
  const [dateTo, setDateTo] = createSignal("");
  const [category, setCategory] = createSignal(props.initialCategory?.replace(/^wedding\s+/i, "").replace(/s$/i, "") || "Venue");
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [hoveredName, setHoveredName] = createSignal<string | null>(null);
  const [locationNote, setLocationNote] = createSignal("Showing Sydney by default.");
  const [searchCenter, setSearchCenter] = createSignal<{ latitude: number; longitude: number }>({ latitude: SYDNEY[0], longitude: SYDNEY[1] });
  const [radiusKm, setRadiusKm] = createSignal(75);
  const [guestCount, setGuestCount] = createSignal<number | null>(props.initialGuestCount ?? null);
  const categoryBudgetCents = createMemo(() => {
    const id = ({ Venue: "venue_ceremony", Celebrant: "venue_ceremony", Planner: "other_misc", Photographer: "photo_video", Florist: "flowers_decor", Musician: "entertainment_music", Cake: "catering_drinks" } as Record<string, string>)[category()] ?? "other_misc";
    const amount = props.categoryBudgets?.find((item) => item.categoryId === id)?.amount;
    return typeof amount === "number" && amount > 0 ? Math.round(amount * 100) : null;
  });
  const [query] = createResource(() => ({
    date: date(), dateTo: dateTo() || null, category: category(), ...searchCenter(), radiusKm: radiusKm(), guestCount: guestCount(),
    categoryBudgetCents: categoryBudgetCents(), preferenceTerms: props.preferenceTerms,
  }), loadWeddingVendorSpecials);
  let mapElement: HTMLDivElement | undefined;
  let map: Leaflet.Map | undefined;
  let leaflet: typeof Leaflet | undefined;
  let layer: Leaflet.LayerGroup | undefined;

  const markers = () => query()?.markers ?? [];
  const selected = createMemo(() => markers().find((item) => item.vendorId === selectedId())
    ?? markers().find((item) => item.vendorId === query()?.topChoices[0]?.vendorId)
    ?? markers()[0]
    ?? null);
  const selectedDetail = createMemo<WeddingVendorRankedSpecialDetail | null>(() => query()?.topChoices.find((item) => item.vendorId === selected()?.vendorId) ?? null);

  onMount(async () => {
    try {
      const L = await import("leaflet");
      leaflet = L;
      await import("leaflet/dist/leaflet.css" as string);
      if (!mapElement) return;
      map = L.map(mapElement, { center: SYDNEY, zoom: 10, zoomControl: true, scrollWheelZoom: false });
      L.tileLayer(OSM_TILE_CONFIG.tile_url_template, {
        attribution: OSM_TILE_CONFIG.attribution,
        maxZoom: OSM_TILE_CONFIG.max_zoom,
        subdomains: ["a", "b", "c"],
      }).addTo(map);
      layer = L.layerGroup().addTo(map);
      map.on("zoomend", () => renderMarkers(false));
      renderMarkers(true);
    } catch {
      setLocationNote("The map could not load. The accessible venue list is still available below.");
    }
  });

  createEffect(() => {
    markers();
    renderMarkers(true);
    if (selectedId() && !markers().some((item) => item.vendorId === selectedId())) setSelectedId(null);
  });

  onCleanup(() => map?.remove());

  function markerIcon(L: typeof Leaflet, item: WeddingVendorSpecialMarker) {
    const content = item.photoUrl
      ? `<img src="${escapeHtml(item.photoUrl)}" alt="" />`
      : `<span>${escapeHtml(item.vendorName.slice(0, 1).toUpperCase())}</span>`;
    return L.divIcon({
      className: "wedding-special-map-marker",
      html: `<span class="wedding-special-map-marker__inner">${content}</span>`,
      iconSize: [46, 46], iconAnchor: [23, 23],
    });
  }

  function renderMarkers(fitBounds: boolean) {
    if (!leaflet || !map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];
    const zoom = map.getZoom();
    const cellSize = zoom >= 12 ? 0 : zoom >= 10 ? 0.08 : 0.18;
    const groups = new Map<string, WeddingVendorSpecialMarker[]>();
    for (const item of markers()) {
      const key = cellSize === 0 ? item.vendorId : `${Math.floor(item.latitude / cellSize)}:${Math.floor(item.longitude / cellSize)}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const group of groups.values()) {
      if (group.length > 1) {
        const latitude = group.reduce((sum, item) => sum + item.latitude, 0) / group.length;
        const longitude = group.reduce((sum, item) => sum + item.longitude, 0) / group.length;
        const icon = leaflet.divIcon({ className: "wedding-special-map-marker", html: `<span class="wedding-special-map-cluster">${group.length}</span>`, iconSize: [48, 48], iconAnchor: [24, 24] });
        const cluster = leaflet.marker([latitude, longitude], { icon, keyboard: true, title: `${group.length} venues` }).addTo(layer);
        const names = group.map((item) => item.vendorName).join(", ");
        cluster.bindTooltip(escapeHtml(names), { direction: "top", offset: [0, -24], className: "wedding-special-map-tooltip", opacity: 1 });
        cluster.on("mouseover focus", () => setHoveredName(names));
        cluster.on("mouseout blur", () => setHoveredName(null));
        cluster.on("click", () => map?.setView([latitude, longitude], Math.min(14, zoom + 2)));
        for (const item of group) bounds.push([item.latitude, item.longitude]);
        continue;
      }
      const item = group[0];
      const marker = leaflet.marker([item.latitude, item.longitude], {
        icon: markerIcon(leaflet, item), keyboard: true, title: item.vendorName,
      }).addTo(layer);
      marker.bindTooltip(escapeHtml(item.vendorName), {
        direction: "top", offset: [0, -24], className: "wedding-special-map-tooltip", opacity: 1,
      });
      marker.on("mouseover focus", () => setHoveredName(item.vendorName));
      marker.on("mouseout blur", () => setHoveredName(null));
      marker.on("click", () => setSelectedId(item.vendorId));
      bounds.push([item.latitude, item.longitude]);
    }
    if (fitBounds && bounds.length === 1) map.setView(bounds[0], 13);
    else if (fitBounds && bounds.length > 1) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 13 });
  }

  function useMyLocation() {
    if (!navigator.geolocation || !map) {
      setLocationNote("Location is unavailable, so the map remains centred on Sydney.");
      return;
    }
    setLocationNote("Waiting for your browser location permission…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        map?.setView([position.coords.latitude, position.coords.longitude], 11);
        setSearchCenter({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationNote("Map centred near your current location. Your coordinates were not saved.");
      },
      () => setLocationNote("Location was not shared, so the map remains available without it."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  return (
    <section class="mt-4 min-w-0" aria-labelledby="limited-specials-heading">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(8rem,1fr))_auto] xl:items-end">
        <label class="grid gap-1 text-sm font-semibold text-wedding-ink">Wedding date
          <input class="h-11 rounded-lg border border-wedding-border bg-white px-3 font-normal" type="date" value={date()} onInput={(event) => setDate(event.currentTarget.value)} />
        </label>
        <label class="grid gap-1 text-sm font-semibold text-wedding-ink">Flexible through <span class="font-normal text-wedding-ink/55">(optional, up to 31 days)</span>
          <input class="h-11 rounded-lg border border-wedding-border bg-white px-3 font-normal" type="date" min={date()} max={new Date(new Date(`${date()}T12:00:00`).getTime() + 31 * 86400000).toISOString().slice(0, 10)} value={dateTo()} onInput={(event) => setDateTo(event.currentTarget.value)} />
        </label>
        <label class="grid gap-1 text-sm font-semibold text-wedding-ink">Guests
          <input class="h-11 rounded-lg border border-wedding-border bg-white px-3 font-normal" type="number" min="1" max="5000" inputmode="numeric" value={guestCount() ?? ""} placeholder="Optional" onInput={(event) => setGuestCount(event.currentTarget.value ? Number(event.currentTarget.value) : null)} />
        </label>
        <label class="grid gap-1 text-sm font-semibold text-wedding-ink">Distance
          <select class="h-11 rounded-lg border border-wedding-border bg-white px-3 font-normal" value={radiusKm()} onChange={(event) => setRadiusKm(Number(event.currentTarget.value))}>
            <option value="25">25 km</option><option value="50">50 km</option><option value="75">75 km</option><option value="150">150 km</option><option value="300">300 km</option>
          </select>
        </label>
        <label class="grid gap-1 text-sm font-semibold text-wedding-ink">Vendor category
          <select class="h-11 rounded-lg border border-wedding-border bg-white px-3 font-normal" value={category()} onChange={(event) => setCategory(event.currentTarget.value)}>
            <option value="">All categories</option>
            <For each={CATEGORIES}>{(item) => <option value={item}>{item}</option>}</For>
          </select>
        </label>
        <button type="button" class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-sm font-bold text-wedding-secondary" onClick={useMyLocation}>Use my location</button>
      </div>
      <p class="mt-2 text-xs leading-5 text-wedding-ink/65">{locationNote()}</p>
      <Show when={query.loading}><p class="mt-4 rounded-lg bg-wedding-slate p-3 text-sm" role="status">Checking vendor-confirmed dates…</p></Show>
      <Show when={query.error}>{(error) => <p class="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm" role="alert">{friendlyErrorText(error(), "Limited Specials could not be refreshed. Check the date and try again.")}</p>}</Show>
      <Show when={query()?.truncated}><p class="mt-3 rounded-lg bg-wedding-slate p-3 text-xs text-wedding-ink/70">Showing the strongest {markers().length} map results. Narrow the date, distance or category to see a smaller set.</p></Show>
      <div class="relative mt-3 overflow-hidden rounded-xl border border-wedding-border bg-wedding-slate">
        <Show when={hoveredName()}>{(name) => <div class="pointer-events-none absolute left-3 right-3 top-3 z-[500] mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-lg bg-wedding-ink px-3 py-2 text-center text-sm font-bold text-white shadow-lg">{name()}</div>}</Show>
        <div ref={mapElement} class="h-[22rem] w-full" aria-label="Map of vendors with a confirmed special on the selected date" />
      </div>
      <p class="mt-2 text-xs text-wedding-ink/65">Availability is indicative and subject to vendor confirmation. The map shows only the date you searched, not a vendor’s private calendar.</p>

      <Show when={!query.loading && !query.error && markers().length === 0}>
        <div class="mt-4 rounded-lg border border-wedding-border bg-white p-4 text-sm text-wedding-ink/70">
          <p>No vendor-confirmed specials match this date and category yet. Missing availability is unknown, not evidence that vendors are unavailable.</p>
          <button type="button" class="mt-3 min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 font-bold text-wedding-secondary" onClick={() => setCategory("")}>Show all vendor categories</button>
        </div>
      </Show>
      <Show when={markers().length > 0}>
        <div class="mt-4 flex snap-x gap-2 overflow-x-auto pb-2" aria-label="Limited-special vendors">
          <For each={markers()}>{(item) => <button type="button" class={`min-h-11 shrink-0 snap-start rounded-full border px-3 text-sm font-semibold ${selected()?.vendorId === item.vendorId ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border bg-white text-wedding-ink"}`} onClick={() => { setSelectedId(item.vendorId); map?.setView([item.latitude, item.longitude], 13); }}>{item.vendorName}</button>}</For>
        </div>
      </Show>

      <Show when={selected()} keyed>{(item) => <WeddingLimitedSpecialVenueCard
        marker={item}
        detail={selectedDetail()}
        guestCount={guestCount()}
        shortlistPreference={props.shortlistPreferences?.get(item.vendorId) ?? null}
        onPrepareEnquiry={() => props.onPrepareEnquiry(item, selectedDetail())}
        onSavePreference={props.onSavePreference ? (preference, reason) => props.onSavePreference?.(item, preference, reason) : undefined}
      />}</Show>
    </section>
  );
}
