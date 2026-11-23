import { createMemo, createResource, createSignal, Show } from "solid-js";

export function WeddingVendorInlineMap(props: { address: string; externalMapUrl?: string | null }) {
  const [zoom, setZoom] = createSignal(15);
  const query = createMemo(() => encodeURIComponent(props.address.trim().slice(0, 300)));
  const [location] = createResource(() => props.address.trim(), async (address) => {
    if (!address) return null;
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address.slice(0, 300))}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const rows = await response.json() as Array<{ lat?: string; lon?: string }>;
    const lat = Number(rows[0]?.lat);
    const lon = Number(rows[0]?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  });
  const source = createMemo(() => {
    const point = location();
    if (!point) return null;
    const span = Math.max(0.002, 0.12 / Math.max(1, zoom() - 10));
    const bbox = [point.lon - span, point.lat - span, point.lon + span, point.lat + span].join(",");
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${point.lat}%2C${point.lon}`;
  });
  const external = createMemo(() => props.externalMapUrl?.trim() || `https://www.openstreetmap.org/search?query=${query()}`);
  return (
    <section class="mt-3 overflow-hidden rounded-lg border border-wedding-border bg-white" aria-label={`Map for ${props.address}`}>
      <div class="flex items-center justify-between gap-2 border-b border-wedding-border px-2 py-1.5">
        <p class="min-w-0 break-words text-[11px] font-semibold text-wedding-ink">Map preview</p>
        <div class="flex shrink-0 gap-1" aria-label="Map zoom controls">
          <button type="button" class="min-h-10 min-w-10 rounded-lg border border-wedding-border bg-white text-base font-bold text-wedding-ink" aria-label="Zoom map out" onClick={() => setZoom((value) => Math.max(3, value - 1))}>−</button>
          <button type="button" class="min-h-10 min-w-10 rounded-lg border border-wedding-border bg-white text-base font-bold text-wedding-ink" aria-label="Zoom map in" onClick={() => setZoom((value) => Math.min(20, value + 1))}>+</button>
        </div>
      </div>
      <Show when={source()} fallback={<div class="grid h-32 place-items-center bg-wedding-page px-4 text-center text-xs text-wedding-ink/65">{location.loading ? "Finding this address on OpenStreetMap…" : "Open OpenStreetMap to check this address."}</div>}>
        {(src) => <iframe title={`OpenStreetMap showing ${props.address}`} src={src()} loading="lazy" referrerPolicy="no-referrer" class="h-56 w-full border-0" />}
      </Show>
      <a href={external()} target="_blank" rel="noreferrer" class="block min-h-11 px-3 py-3 text-xs font-semibold text-wedding-secondary underline">Open full map</a>
    </section>
  );
}
