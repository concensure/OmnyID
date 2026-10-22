import { createMemo, createSignal } from "solid-js";

export function WeddingVendorInlineMap(props: { address: string; externalMapUrl?: string | null }) {
  const [zoom, setZoom] = createSignal(15);
  const query = createMemo(() => encodeURIComponent(props.address.trim().slice(0, 300)));
  const source = createMemo(() => `https://www.google.com/maps?q=${query()}&z=${zoom()}&output=embed`);
  const external = createMemo(() => props.externalMapUrl?.trim() || `https://www.google.com/maps/search/?api=1&query=${query()}`);
  return (
    <section class="mt-3 overflow-hidden rounded-lg border border-wedding-border bg-white" aria-label={`Map for ${props.address}`}>
      <div class="flex items-center justify-between gap-2 border-b border-wedding-border px-2 py-1.5">
        <p class="min-w-0 break-words text-[11px] font-semibold text-wedding-ink">Map preview</p>
        <div class="flex shrink-0 gap-1" aria-label="Map zoom controls">
          <button type="button" class="min-h-10 min-w-10 rounded-lg border border-wedding-border bg-white text-base font-bold text-wedding-ink" aria-label="Zoom map out" onClick={() => setZoom((value) => Math.max(3, value - 1))}>−</button>
          <button type="button" class="min-h-10 min-w-10 rounded-lg border border-wedding-border bg-white text-base font-bold text-wedding-ink" aria-label="Zoom map in" onClick={() => setZoom((value) => Math.min(20, value + 1))}>+</button>
        </div>
      </div>
      <iframe title={`Map showing ${props.address}`} src={source()} loading="lazy" referrerPolicy="no-referrer" class="h-56 w-full border-0" />
      <a href={external()} target="_blank" rel="noreferrer" class="block min-h-11 px-3 py-3 text-xs font-semibold text-wedding-secondary underline">Open full map</a>
    </section>
  );
}
