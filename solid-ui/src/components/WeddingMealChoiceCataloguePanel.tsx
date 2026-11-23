import { For, Show, createMemo, createSignal } from "solid-js";

import type { WeddingGuestTrackingRow } from "@/lib/weddingGuestTrackingState";
import {
  buildWeddingMealChoiceReplacementImpact,
  type WeddingMealChoiceSource,
  type WeddingMealChoiceState,
} from "@/lib/weddingMealChoiceState";
import { friendlyErrorText } from "@/lib/visibleErrorText";

type SaveMealChoicesInput = {
  options: string[];
  source: WeddingMealChoiceSource;
  sourceLabel: string;
  sourceMessageId?: string | null;
  confirmedAffectedResponses: boolean;
};

function sourceLabel(source: WeddingMealChoiceSource): string {
  if (source === "venue_package") return "Venue package or quote";
  if (source === "vendor_conversation") return "Vendor conversation";
  if (source === "run_sheet") return "Wedding run sheet";
  return "Entered by the couple";
}

export function WeddingMealChoiceCataloguePanel(props: {
  state: WeddingMealChoiceState;
  guestRows?: readonly WeddingGuestTrackingRow[] | null;
  onSave?: (input: SaveMealChoicesInput) => Promise<string>;
}) {
  const [mealOptions, setMealOptions] = createSignal(props.state.confirmed?.options.join(", ") ?? "");
  const [source, setSource] = createSignal<WeddingMealChoiceSource>(props.state.confirmed?.source ?? "manual");
  const [selectedSourceLabel, setSelectedSourceLabel] = createSignal(props.state.confirmed?.sourceLabel ?? "Entered by the couple");
  const [sourceMessageId, setSourceMessageId] = createSignal<string | null>(props.state.confirmed?.sourceMessageId ?? null);
  const [confirmedCurrentChoices, setConfirmedCurrentChoices] = createSignal(false);
  const [confirmedAffectedResponses, setConfirmedAffectedResponses] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const parsedOptions = createMemo(() => mealOptions().split(",").map((item) => item.trim()).filter(Boolean));
  const impact = createMemo(() => buildWeddingMealChoiceReplacementImpact({
    current: props.state.confirmed,
    nextOptions: parsedOptions(),
    guests: props.guestRows ?? [],
  }));

  const changeDraft = () => {
    setConfirmedCurrentChoices(false);
    setConfirmedAffectedResponses(false);
    setNotice(null);
  };
  const chooseSuggestion = (suggestion: WeddingMealChoiceState["suggestions"][number]) => {
    setMealOptions(suggestion.options.join(", "));
    setSource(suggestion.source);
    setSelectedSourceLabel(suggestion.sourceLabel);
    setSourceMessageId(suggestion.sourceMessageId);
    changeDraft();
  };
  const save = async () => {
    if (!props.onSave || saving()) return;
    if (parsedOptions().length < 2) {
      setNotice("Add at least two current meal choices.");
      return;
    }
    if (!confirmedCurrentChoices()) {
      setNotice("Confirm that these are the choices guests can currently select.");
      return;
    }
    if (impact().requiresConfirmation && !confirmedAffectedResponses()) {
      setNotice("Review and confirm the affected guest responses before replacing these choices.");
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      setNotice(await props.onSave({
        options: parsedOptions(),
        source: source(),
        sourceLabel: selectedSourceLabel(),
        sourceMessageId: sourceMessageId(),
        confirmedAffectedResponses: confirmedAffectedResponses(),
      }));
      setConfirmedCurrentChoices(false);
      setConfirmedAffectedResponses(false);
    } catch (error) {
      setNotice(friendlyErrorText(error, "Meal choices could not be saved. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="mt-4 rounded-2xl border border-indigo-100 bg-white/85 p-4" aria-labelledby="wedding-meal-catalogue-title">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 id="wedding-meal-catalogue-title" class="font-semibold text-indigo-950">Meal choices</h3>
          <p class="mt-1 text-sm leading-6 text-indigo-950/70">Keep the venue menu, RSVP choices and day-of plan aligned in one confirmed list.</p>
        </div>
        <span class="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-950">
          {props.state.confirmed ? `Confirmed v${props.state.confirmed.revision}` : "Not confirmed"}
        </span>
      </div>

      <Show when={props.state.suggestions.length > 0}>
        <div class="mt-3 space-y-2" aria-label="Meal choices found in wedding evidence">
          <p class="text-xs font-semibold text-indigo-950/75">Found in your saved wedding evidence</p>
          <For each={props.state.suggestions}>{(suggestion) => (
            <button type="button" class="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-left text-xs text-indigo-950" onClick={() => chooseSuggestion(suggestion)}>
              <span class="min-w-0"><span class="block font-semibold">{suggestion.sourceLabel}</span><span class="block truncate leading-5 opacity-75">{suggestion.options.join(" · ")}</span></span>
              <span class="shrink-0 font-semibold">Use choices</span>
            </button>
          )}</For>
        </div>
      </Show>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label class="text-xs font-semibold text-indigo-950/75">Source
          <select class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-indigo-950" value={source()} onChange={(event) => {
            const next = event.currentTarget.value as WeddingMealChoiceSource;
            setSource(next);
            setSelectedSourceLabel(sourceLabel(next));
            setSourceMessageId(null);
            changeDraft();
          }}>
            <option value="venue_package">Venue package or quote</option>
            <option value="vendor_conversation">Vendor conversation</option>
            <option value="run_sheet">Wedding run sheet</option>
            <option value="manual">Enter manually</option>
          </select>
        </label>
        <label class="text-xs font-semibold text-indigo-950/75">Choices, separated by commas
          <input class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-indigo-950 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" value={mealOptions()} onInput={(event) => { setMealOptions(event.currentTarget.value); changeDraft(); }} placeholder="For example: beef, fish, vegetarian" />
        </label>
      </div>

      <p class="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs leading-5 text-indigo-950/75">{impact().summaryLabel}</p>
      <Show when={impact().requiresConfirmation}>
        <div class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3" role="group" aria-labelledby="meal-impact-title">
          <p id="meal-impact-title" class="text-xs font-semibold text-amber-950">Review affected RSVPs</p>
          <ul class="mt-1 list-disc pl-5 text-xs leading-5 text-amber-950/80">
            <For each={impact().affectedResponses}>{(response) => <li>{response.displayName}: {response.mealChoice}</li>}</For>
          </ul>
          <label class="mt-2 flex min-h-11 items-start gap-2 text-xs font-semibold text-amber-950">
            <input type="checkbox" class="mt-0.5 h-5 w-5 accent-amber-700" checked={confirmedAffectedResponses()} onChange={(event) => setConfirmedAffectedResponses(event.currentTarget.checked)} />
            <span>I have reviewed these responses. Keep them for follow-up instead of changing a guest's answer.</span>
          </label>
        </div>
      </Show>
      <label class="mt-3 flex min-h-11 items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs font-semibold text-indigo-950">
        <input type="checkbox" class="mt-0.5 h-5 w-5 accent-indigo-700" checked={confirmedCurrentChoices()} onChange={(event) => setConfirmedCurrentChoices(event.currentTarget.checked)} />
        <span>I confirm these are the choices guests can currently select.</span>
      </label>
      <Show when={notice()}>{(message) => <p role="status" class="mt-3 text-xs leading-5 text-indigo-950/75">{message()}</p>}</Show>
      <button type="button" disabled={!props.onSave || saving()} class="mt-3 min-h-11 w-full rounded-lg bg-indigo-800 px-4 text-sm font-semibold text-white hover:bg-indigo-900 disabled:cursor-not-allowed disabled:bg-indigo-300 sm:w-auto" onClick={() => void save()}>
        {saving() ? "Saving…" : props.state.confirmed ? "Update meal choices" : "Confirm meal choices"}
      </button>
      <p class="mt-2 text-xs leading-5 text-indigo-950/60">Dietary and allergy details stay separate and are never inferred from a meal choice.</p>
    </section>
  );
}
