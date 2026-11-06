import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type * as Leaflet from "leaflet";

import { OSM_TILE_CONFIG } from "@/lib/mapConfig";
import {
  loadWeddingVendorSpecials,
  type WeddingVendorSpecialMarker,
} from "@/lib/weddingVendorSpecialDiscoveryApi";

const SYDNEY: [number, number] = [-33.8688, 151.2093];
const CATEGORIES = ["Venue", "Photographer", "Florist", "Planner", "Celebrant", "Musician", "Cake"];

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

function monthDays(dateText: string) {
  const [year, month] = dateText.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const count = new Date(year, month, 0).getDate();
  return {
    label: first.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
    blanks: Array.from({ length: (first.getDay() + 6) % 7 }),
    days: Array.from({ length: count }, (_, index) => index + 1),
    selectedDay: Number(dateText.slice(8, 10)),
  };
}

export function WeddingLimitedSpecialsMap(props: {
  weddingDate?: string | null;
  initialCategory?: string | null;
  onPrepareEnquiry: (marker: WeddingVendorSpecialMarker) => void;
}) {
  const [date, setDate] = createSignal(validDate(props.weddingDate));
  const [category, setCategory] = createSignal(props.initialCategory?.replace(/^wedding\s+/i, "").replace(/s$/i, "") || "Venue");
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [hoveredName, setHoveredName] = createSignal<string | null>(null);
  const [locationNote, setLocationNote] = createSignal("Showing Sydney by default.");
  const [query] = createResource(() => ({ date: date(), category: category() }), loadWeddingVendorSpecials);
  let mapElement: HTMLDivElement | undefined;
  let map: Leaflet.Map | undefined;
  let leaflet: typeof Leaflet | undefined;
  let layer: Leaflet.LayerGroup | undefined;

  const markers = () => query()?.markers ?? [];
  const selected = createMemo(() => markers().find((item) => item.vendorId === selectedId()) ?? markers()[0] ?? null);
  const calendar = createMemo(() => monthDays(selected()?.availableOnDate ?? date()));

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
      renderMarkers();
    } catch {
      setLocationNote("The map could not load. The accessible venue list is still available below.");
    }
  });

  createEffect(() => {
    markers();
    renderMarkers();
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

  function renderMarkers() {
    if (!leaflet || !map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];
    for (const item of markers()) {
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
    if (bounds.length === 1) map.setView(bounds[0], 13);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 13 });
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
        setLocationNote("Map centred near your current location. Your coordinates were not saved.");
      },
      () => setLocationNote("Location was not shared, so the map remains available without it."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  return (
    <section class="mt-4 min-w-0" aria-labelledby="limited-specials-heading">
      <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label class="grid gap-1 text-sm font-semibold text-wedding-ink">Wedding date
          <input class="h-11 rounded-lg border border-wedding-border bg-white px-3 font-normal" type="date" value={date()} onInput={(event) => setDate(event.currentTarget.value)} />
        </label>
        <label class="grid gap-1 text-sm font-semibold text-wedding-ink">Vendor category
          <select class="h-11 rounded-lg border border-wedding-border bg-white px-3 font-normal" value={category()} onChange={(event) => setCategory(event.currentTarget.value)}>
            <For each={CATEGORIES}>{(item) => <option value={item}>{item}</option>}</For>
          </select>
        </label>
        <button type="button" class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-sm font-bold text-wedding-secondary" onClick={useMyLocation}>Use my location</button>
      </div>
      <p class="mt-2 text-xs leading-5 text-wedding-ink/65">{locationNote()}</p>
      <Show when={query.loading}><p class="mt-4 rounded-lg bg-wedding-slate p-3 text-sm" role="status">Checking vendor-confirmed dates…</p></Show>
      <Show when={query.error}><p class="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm" role="alert">Limited Specials are not available for this account yet.</p></Show>
      <div class="relative mt-3 overflow-hidden rounded-xl border border-wedding-border bg-wedding-slate">
        <Show when={hoveredName()}>{(name) => <div class="pointer-events-none absolute left-3 right-3 top-3 z-[500] mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-lg bg-wedding-ink px-3 py-2 text-center text-sm font-bold text-white shadow-lg">{name()}</div>}</Show>
        <div ref={mapElement} class="h-[22rem] w-full" aria-label="Map of vendors with a confirmed special on the selected date" />
      </div>
      <p class="mt-2 text-xs text-wedding-ink/65">Availability is indicative and subject to vendor confirmation. The map shows only the date you searched, not a vendor’s private calendar.</p>

      <Show when={!query.loading && !query.error && markers().length === 0}>
        <p class="mt-4 rounded-lg border border-wedding-border bg-white p-4 text-sm text-wedding-ink/70">No vendor-confirmed specials match this date and category yet. Try another date or category.</p>
      </Show>
      <Show when={markers().length > 0}>
        <div class="mt-4 flex snap-x gap-2 overflow-x-auto pb-2" aria-label="Limited-special vendors">
          <For each={markers()}>{(item) => <button type="button" class={`min-h-11 shrink-0 snap-start rounded-full border px-3 text-sm font-semibold ${selected()?.vendorId === item.vendorId ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border bg-white text-wedding-ink"}`} onClick={() => { setSelectedId(item.vendorId); map?.setView([item.latitude, item.longitude], 13); }}>{item.vendorName}</button>}</For>
        </div>
      </Show>

      <Show when={selected()} keyed>{(item) => (
        <article class="mt-4 overflow-hidden rounded-xl border border-wedding-border bg-white shadow-wedding-card" aria-labelledby="limited-special-vendor-name">
          <Show when={item.photoUrl} fallback={<div class="flex h-40 items-center justify-center bg-wedding-slate text-4xl font-bold text-wedding-primary" aria-hidden="true">{item.vendorName.slice(0, 1)}</div>}>
            {(url) => <img class="h-48 w-full object-cover" src={url()} alt={item.photoAlt || `${item.vendorName} venue`} loading="lazy" />}
          </Show>
          <div class="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,.65fr)]">
            <div class="min-w-0">
              <p class="text-xs font-bold uppercase tracking-[.12em] text-wedding-primary">{item.category} · {item.locality}</p>
              <h3 id="limited-special-vendor-name" class="mt-1 break-words font-display text-2xl font-semibold text-wedding-ink">{item.vendorName}</h3>
              <p class="mt-2 text-sm leading-6 text-wedding-ink/75">{item.description || `${item.vendorName} has vendor-confirmed availability for the selected date. Ask for current package details before relying on it.`}</p>
              <Show when={item.address}><p class="mt-2 text-sm text-wedding-ink/65">{item.address}</p></Show>
              <Show when={item.rating !== null}><p class="mt-3 text-sm font-semibold text-wedding-ink">★ {item.rating?.toFixed(1)} <span class="font-normal text-wedding-ink/65">{item.reviewCount ? `from ${item.reviewCount} reviews` : "published rating"}</span></p></Show>
              <div class="mt-3 flex flex-wrap gap-2"><For each={item.styleTags}>{(tag) => <span class="rounded-full bg-wedding-slate px-2.5 py-1 text-xs font-semibold text-wedding-ink/70">{tag}</span>}</For></div>
            </div>
            <section class="rounded-xl border border-wedding-border bg-wedding-page p-3" aria-label={`Availability for ${calendar().label}`}>
              <p class="font-semibold text-wedding-ink">{calendar().label}</p>
              <div class="mt-3 grid grid-cols-7 gap-1 text-center text-[11px]"><For each={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}>{(day) => <span class="font-semibold text-wedding-ink/55">{day}</span>}</For></div>
              <div class="mt-1 grid grid-cols-7 gap-1 text-center text-xs">
                <For each={calendar().blanks}>{() => <span aria-hidden="true" />}</For>
                <For each={calendar().days}>{(day) => <span class={`flex aspect-square items-center justify-center rounded-full ${day === calendar().selectedDay ? "bg-wedding-primary font-bold text-white ring-2 ring-wedding-primary/20 ring-offset-2" : "text-wedding-ink/60"}`} aria-label={day === calendar().selectedDay ? `${item.availableOnDate}, vendor-confirmed special may apply` : undefined}>{day}</span>}</For>
              </div>
              <p class="mt-3 text-xs leading-5 text-wedding-ink/70"><span class="font-bold text-wedding-primary">{new Date(`${item.availableOnDate}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</span> is vendor-confirmed. Package and price remain subject to confirmation.</p>
              <p class="mt-1 text-[11px] leading-4 text-wedding-ink/55">Last reconfirmed {new Date(item.lastConfirmedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}.</p>
              <button type="button" class="mt-3 min-h-11 w-full rounded-lg bg-wedding-primary px-4 text-sm font-bold text-white" onClick={() => props.onPrepareEnquiry(item)}>Enquire</button>
            </section>
          </div>
        </article>
      )}</Show>
    </section>
  );
}
