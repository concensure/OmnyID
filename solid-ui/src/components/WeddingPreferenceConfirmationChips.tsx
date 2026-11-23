// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";
import type { WeddingPreferenceChipChange } from "@/lib/weddingPreferenceInterpreterState";
import type { WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import { weddingFacetById } from "@/lib/weddingFacetVocabularyState";

export function WeddingPreferenceConfirmationChips(props: {
  profile: WeddingPreferenceProfile | null;
  saving?: boolean;
  onChange: (change: WeddingPreferenceChipChange) => void;
  onConfirm: () => void;
}) {
  const [openFacetId, setOpenFacetId] = createSignal<string | null>(null);
  const unconfirmed = () => (props.profile?.facets ?? []).filter((facet) => facet.authority !== "user");
  return (
    <Show when={unconfirmed().length > 0}>
      <section class="rounded-2xl border border-wedding-muted bg-wedding-surface-blush p-3" aria-label="Confirm wedding preferences">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div><p class="text-sm font-bold text-wedding-text">A quick preference check</p><p class="text-xs leading-5 text-wedding-muted">Adjust any reading before it shapes the next comparison.</p></div>
          <button type="button" disabled={props.saving} class="min-h-11 rounded-xl bg-wedding-cta px-4 text-sm font-bold text-white disabled:opacity-50" onClick={() => props.onConfirm()}>Looks right</button>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <For each={unconfirmed()}>{(facet) => {
            const label = () => weddingFacetById(facet.facetId)?.couple_phrase ?? weddingFacetById(facet.facetId)?.label ?? facet.facetId;
            const open = () => openFacetId() === facet.facetId;
            return <div class="relative max-w-full">
              <button type="button" class="min-h-11 max-w-full rounded-xl border border-wedding-accent bg-white px-3 text-left text-xs font-semibold leading-5 text-wedding-text" aria-expanded={open()} onClick={() => setOpenFacetId(open() ? null : facet.facetId)}>We read '{facet.anchor}' as: {label()}</button>
              <Show when={open()}><div class="absolute z-20 mt-1 flex flex-wrap gap-1 rounded-xl border border-wedding-muted bg-white p-1 shadow-card">
                <button type="button" class="min-h-11 rounded-lg px-3 text-xs font-bold text-wedding-accent hover:bg-wedding-surface-blush" onClick={() => { props.onChange({ facetId: facet.facetId, choice: "must" }); setOpenFacetId(null); }}>Must-have</button>
                <button type="button" class="min-h-11 rounded-lg px-3 text-xs font-bold text-wedding-accent hover:bg-wedding-surface-blush" onClick={() => { props.onChange({ facetId: facet.facetId, choice: "nice" }); setOpenFacetId(null); }}>Nice-to-have</button>
                <button type="button" class="min-h-11 rounded-lg px-3 text-xs font-bold text-wedding-muted hover:bg-wedding-surface-blush" onClick={() => { props.onChange({ facetId: facet.facetId, choice: "remove" }); setOpenFacetId(null); }}>Remove</button>
              </div></Show>
            </div>;
          }}</For>
        </div>
      </section>
    </Show>
  );
}
