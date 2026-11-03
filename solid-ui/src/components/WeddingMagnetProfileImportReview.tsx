// @locs-version: 1.0
import { createSignal, For, onMount, Show } from "solid-js";

import {
  readWeddingMagnetImportFacts,
  weddingMagnetImportFactsFromJsonText,
  weddingMagnetFactsToIntakePrefill,
  weddingMagnetImportConflictKeys,
  type WeddingMagnetImportFact,
  type WeddingMagnetIntakePrefill,
} from "@/lib/weddingMagnetProfileImportPreviewState";

const FIELD_LABELS: Record<string, string> = {
  wedding_date: "Wedding date",
  wedding_date_approx: "Approximate date",
  state: "State or territory",
  location_label: "Location",
  guest_count: "Guest count",
  budget_total_aud: "Total budget",
  top_priorities: "Priorities",
  vendor_categories_needed: "Suppliers still needed",
  vendor_preferences: "Supplier preferences",
  style_tags: "Style tags",
  mood_words: "Mood words",
  style_name: "Style direction",
  style_description: "Style description",
  setting_preference: "Setting preference",
  couple_names: "Names",
  cultural_religious: "Cultural or religious details",
  accessibility_requirements: "Accessibility requirements",
};

export function WeddingMagnetProfileImportReview(props: {
  onImport: (prefill: WeddingMagnetIntakePrefill, facts: readonly WeddingMagnetImportFact[]) => void;
  currentPrefill: WeddingMagnetIntakePrefill;
}) {
  const [facts, setFacts] = createSignal<WeddingMagnetImportFact[]>([]);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [notice, setNotice] = createSignal<string | null>(null);
  const conflicts = () => weddingMagnetImportConflictKeys(facts(), props.currentPrefill);

  function defaultSelection(loaded: readonly WeddingMagnetImportFact[]) {
    const conflicting = weddingMagnetImportConflictKeys(loaded, props.currentPrefill);
    return new Set(loaded.filter((fact) => fact.tier !== "S" && !conflicting.has(fact.key)).map((fact) => fact.key));
  }

  onMount(() => {
    const loaded = readWeddingMagnetImportFacts(localStorage);
    setFacts(loaded);
    // Private/sensitive profile facts always require an explicit opt-in here.
    setSelected(defaultSelection(loaded));
  });

  function toggle(key: string, enabled: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (enabled) next.add(key);
      else next.delete(key);
      return next;
    });
    setNotice(null);
  }

  function importSelected() {
    const accepted = facts().filter((fact) => selected().has(fact.key));
    if (accepted.length === 0) return;
    props.onImport(weddingMagnetFactsToIntakePrefill(accepted), accepted);
    setNotice(`${accepted.length} remembered ${accepted.length === 1 ? "detail is" : "details are"} now prefilled below. Review or edit them before creating your plan.`);
  }

  async function chooseImportFile(file: File | null) {
    if (!file) return;
    if (file.size > 512 * 1024) {
      setNotice("That JSON file is larger than the 512 KB profile limit.");
      return;
    }
    const loaded = weddingMagnetImportFactsFromJsonText(await file.text());
    if (loaded.length === 0) {
      setNotice("This is not a supported Wedding profile or Budget Reality Check result file.");
      return;
    }
    setFacts(loaded);
    setSelected(defaultSelection(loaded));
    setNotice(`${loaded.length} ${loaded.length === 1 ? "detail is" : "details are"} ready to review. Nothing has been added to your account.`);
  }

  return <section class="mb-4 rounded-xl border border-wedding-primary/25 bg-wedding-primary/5 p-3" aria-label="Check what you have already told us">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-wedding-primary">Check what you've told us</p>
      <h3 class="mt-1 font-display text-base font-semibold">Bring what you've already told us into your plan</h3>
      <p class="mt-1 text-xs leading-5 text-wedding-ink/70">Review remembered details on this device, or choose a profile JSON downloaded on another device. Nothing reaches your account until you confirm the normal intake.</p>
      <label class="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-wedding-border bg-white px-4 text-xs font-semibold text-wedding-primary">
        Choose Wedding result JSON
        <input
          type="file"
          accept=".json,application/json"
          class="sr-only"
          onChange={(event) => {
            void chooseImportFile(event.currentTarget.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <Show when={facts().length > 0}>
        <p class="mt-3 text-xs leading-5 text-wedding-ink/70">Choose each detail first. We won't ask you these again after you confirm the intake. Sensitive details are off by default.</p>
        <div class="mt-3 grid gap-2">
        <For each={facts()}>{(fact) => <label class="flex min-h-11 items-start gap-3 rounded-lg border border-wedding-border bg-white px-3 py-2">
          <input type="checkbox" class="mt-1 h-4 w-4 accent-wedding-primary" checked={selected().has(fact.key)} onChange={(event) => toggle(fact.key, event.currentTarget.checked)} />
          <span class="min-w-0 flex-1">
            <span class="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {FIELD_LABELS[fact.key] ?? fact.key.replace(/_/g, " ")}
              <span class="rounded-full bg-wedding-slate px-2 py-0.5 text-[10px] font-medium">From {fact.sourceLabel}</span>
              <Show when={fact.tier === "S"}><span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-950">Private · opt in</span></Show>
              <Show when={conflicts().has(fact.key)}><span class="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-950">Different from your current answer</span></Show>
            </span>
            <span class="mt-0.5 block break-words text-xs leading-5 text-wedding-ink/70">{fact.displayValue}</span>
            <span class="block text-[10px] leading-4 text-wedding-ink/55">{fact.why}</span>
            <Show when={conflicts().has(fact.key)}><span class="block text-[10px] font-semibold leading-4 text-rose-900">Kept off by default. Select it only if you want to replace the current answer.</span></Show>
          </span>
        </label>}</For>
        </div>
        <button type="button" disabled={selected().size === 0} class="mt-3 min-h-11 rounded-lg bg-wedding-primary px-4 text-xs font-semibold text-white disabled:opacity-45" onClick={importSelected}>Prefill selected details</button>
      </Show>
      <Show when={notice()}>{(message) => <p role="status" class="mt-2 text-xs font-semibold text-wedding-primary">{message()}</p>}</Show>
    </section>;
}
