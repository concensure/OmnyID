import { createMemo, createSignal, For, Show } from "solid-js";

import type {
  WeddingVendorRankedSpecialDetail,
  WeddingVendorSpecialMarker,
} from "@/lib/weddingVendorSpecialDiscoveryApi";
import {
  buildWeddingVendorSpecialEvidenceCardState,
  type WeddingVendorSpecialAvailabilityState,
} from "@/lib/weddingVendorSpecialEvidenceCardState";
import type {
  WeddingVendorShortlistPreference,
  WeddingVendorShortlistPreferenceRecord,
} from "@/lib/weddingVendorShortlistPreferenceState";

function monthDays(dateText: string) {
  const [year, month] = dateText.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  return {
    label: first.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
    blanks: Array.from({ length: (first.getDay() + 6) % 7 }),
    days: Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => index + 1),
  };
}

const preferenceLabels: ReadonlyArray<{ value: WeddingVendorShortlistPreference; label: string }> = [
  { value: "interested", label: "Interested" },
  { value: "favourite", label: "Favourite" },
  { value: "concerned", label: "Concerned" },
  { value: "need_more_information", label: "Need more information" },
];

export function WeddingLimitedSpecialVenueCard(props: {
  marker: WeddingVendorSpecialMarker;
  detail: WeddingVendorRankedSpecialDetail | null;
  guestCount: number | null;
  availabilityState?: WeddingVendorSpecialAvailabilityState;
  shortlistPreference?: WeddingVendorShortlistPreferenceRecord | null;
  onPrepareEnquiry: () => void;
  onSavePreference?: (preference: WeddingVendorShortlistPreference, reason: string | null) => Promise<void> | void;
}) {
  const [detailsExpanded, setDetailsExpanded] = createSignal(false);
  const [preferenceOpen, setPreferenceOpen] = createSignal(false);
  const [concernReason, setConcernReason] = createSignal(props.shortlistPreference?.reason ?? "");
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | null>(null);
  const state = createMemo(() => buildWeddingVendorSpecialEvidenceCardState({
    marker: props.marker,
    detail: props.detail,
    guestCount: props.guestCount,
    availabilityState: props.availabilityState,
  }));
  const calendar = createMemo(() => monthDays(props.marker.availableOnDate));
  const availableDays = createMemo(() => new Set(props.marker.availableDates
    .filter((value) => value.slice(0, 7) === props.marker.availableOnDate.slice(0, 7))
    .map((value) => Number(value.slice(8, 10)))));

  async function savePreference(preference: WeddingVendorShortlistPreference) {
    if (!props.onSavePreference || saving()) return;
    if (preference === "concerned" && concernReason().trim().length < 3) {
      setSaveError("Add a short reason so your partner can understand the concern.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await props.onSavePreference(preference, preference === "concerned" ? concernReason().trim() : null);
      setPreferenceOpen(false);
    } catch {
      setSaveError("This shortlist preference could not be saved yet.");
    } finally {
      setSaving(false);
    }
  }

  return <article class="mt-4 overflow-hidden rounded-xl border border-wedding-border bg-white shadow-wedding-card" aria-labelledby={`limited-special-${props.marker.vendorId}`}>
    <Show when={props.marker.photoUrl} fallback={<div class="flex h-44 items-center justify-center bg-wedding-slate text-4xl font-bold text-wedding-primary" aria-hidden="true">{props.marker.vendorName.slice(0, 1)}</div>}>
      {(url) => <img class="h-52 w-full object-cover" src={url()} alt={props.marker.photoAlt || `${props.marker.vendorName} venue`} loading="lazy" decoding="async" />}
    </Show>
    <div class="p-4">
      <p class="text-xs font-bold uppercase tracking-[.12em] text-wedding-primary">{props.marker.category}</p>
      <h3 id={`limited-special-${props.marker.vendorId}`} class="mt-1 break-words font-display text-2xl font-semibold text-wedding-ink">{state().identityLabel}</h3>
      <dl class="mt-4 grid gap-3 sm:grid-cols-2">
        <div><dt class="text-xs font-bold uppercase tracking-wide text-wedding-ink/55">Capacity or coverage</dt><dd class="mt-1 text-sm font-semibold text-wedding-ink">{state().coverageLabel}</dd></div>
        <div><dt class="text-xs font-bold uppercase tracking-wide text-wedding-ink/55">Price</dt><dd class="mt-1 text-sm font-bold text-wedding-ink">{state().priceLabel}</dd><dd class="mt-1 text-xs leading-5 text-wedding-ink/65">{state().priceBasisLabel} · {state().priceCertaintyLabel}</dd></div>
        <div><dt class="text-xs font-bold uppercase tracking-wide text-wedding-ink/55">Availability</dt><dd class="mt-1 text-sm font-bold text-wedding-ink">{state().availabilityLabel}</dd><dd class="mt-1 text-xs text-wedding-ink/65">{state().availabilityEvidenceLabel}</dd></div>
        <div><dt class="text-xs font-bold uppercase tracking-wide text-wedding-ink/55">Why it may suit you</dt><dd class="mt-1 text-sm leading-6 text-wedding-ink">{state().fitReason}</dd></div>
      </dl>
      <Show when={state().unknownLabels.length > 0}>
        <div class="mt-3 flex flex-wrap gap-2"><For each={state().unknownLabels}>{(label) => <span class="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">? {label}</span>}</For></div>
        <p class="mt-2 text-xs text-wedding-ink/60">Unknown means the vendor has not supplied enough evidence; it does not mean the requirement fails.</p>
      </Show>
      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-4 text-sm font-bold text-wedding-secondary" aria-expanded={detailsExpanded()} onClick={() => setDetailsExpanded((value) => !value)}>{detailsExpanded() ? "Hide details" : "View details"}</button>
        <button type="button" class="min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-bold text-white" aria-expanded={preferenceOpen()} onClick={() => setPreferenceOpen((value) => !value)}>{props.shortlistPreference ? preferenceLabels.find((item) => item.value === props.shortlistPreference?.preference)?.label ?? "Saved" : "Save"}</button>
        <button type="button" class="min-h-11 rounded-lg border border-wedding-primary bg-white px-4 text-sm font-bold text-wedding-primary" onClick={props.onPrepareEnquiry}>Prepare enquiry</button>
      </div>
      <Show when={preferenceOpen()}><section class="mt-3 rounded-xl border border-wedding-border bg-wedding-page p-3" aria-label="Shared shortlist preference">
        <p class="text-sm font-bold text-wedding-ink">How do you feel about this option?</p>
        <div class="mt-2 flex flex-wrap gap-2"><For each={preferenceLabels}>{(item) => <button type="button" disabled={saving()} class={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${props.shortlistPreference?.preference === item.value ? "border-wedding-primary bg-wedding-primary/10 text-wedding-primary" : "border-wedding-border bg-white text-wedding-ink"}`} onClick={() => void savePreference(item.value)}>{item.label}</button>}</For></div>
        <label class="mt-3 grid gap-1 text-sm font-semibold text-wedding-ink">Reason for concern
          <input class="min-h-11 rounded-lg border border-wedding-border bg-white px-3 font-normal" value={concernReason()} onInput={(event) => setConcernReason(event.currentTarget.value)} maxlength="500" placeholder="For example: ceremony fee is still unclear" />
        </label>
        <Show when={saveError()}>{(error) => <p class="mt-2 text-sm font-semibold text-red-700" role="alert">{error()}</p>}</Show>
      </section></Show>
      <Show when={detailsExpanded()}><div class="mt-4 grid gap-4 border-t border-wedding-border pt-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(17rem,.8fr)]">
        <div>
          <p class="text-sm leading-6 text-wedding-ink/75">{props.marker.description || "No vendor description has been supplied yet."}</p>
          <Show when={props.marker.address}><p class="mt-2 text-sm text-wedding-ink/65">{props.marker.address}</p></Show>
          <Show when={props.detail?.inclusions.length}><p class="mt-3 text-sm leading-6 text-wedding-ink/75"><strong>Included:</strong> {props.detail?.inclusions.join(", ")}</p></Show>
          <Show when={props.detail?.exclusions.length}><p class="mt-2 text-sm leading-6 text-wedding-ink/75"><strong>Excluded or additional:</strong> {props.detail?.exclusions.join(", ")}</p></Show>
          <Show when={props.marker.rating !== null}><p class="mt-3 text-sm font-semibold text-wedding-ink">★ {props.marker.rating?.toFixed(1)} <span class="font-normal text-wedding-ink/65">{props.marker.reviewCount ? `from ${props.marker.reviewCount} reviews` : "published rating"}</span></p></Show>
          <div class="mt-3 flex flex-wrap gap-2"><For each={props.marker.styleTags}>{(tag) => <span class="rounded-full bg-wedding-slate px-2.5 py-1 text-xs font-semibold text-wedding-ink/70">{tag}</span>}</For></div>
        </div>
        <section class="rounded-xl border border-wedding-border bg-wedding-page p-3" aria-label={`Availability for ${calendar().label}`}>
          <p class="font-semibold text-wedding-ink">{calendar().label}</p>
          <div class="mt-3 grid grid-cols-7 gap-1 text-center text-[11px]"><For each={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}>{(day) => <span class="font-semibold text-wedding-ink/55">{day}</span>}</For></div>
          <div class="mt-1 grid grid-cols-7 gap-1 text-center text-xs">
            <For each={calendar().blanks}>{() => <span aria-hidden="true" />}</For>
            <For each={calendar().days}>{(day) => <span class={`flex aspect-square items-center justify-center rounded-full ${availableDays().has(day) ? "bg-wedding-primary font-bold text-white ring-2 ring-wedding-primary/20 ring-offset-2" : "text-wedding-ink/60"}`}>{day}</span>}</For>
          </div>
          <p class="mt-3 text-xs leading-5 text-wedding-ink/70">An open calendar date is not a couple-specific confirmation, hold or booking. Enquire before relying on it.</p>
          <ul class="mt-3 grid gap-1 text-xs text-wedding-ink/65">
            <li><strong>Calendar open:</strong> vendor calendar evidence only.</li>
            <li><strong>Vendor confirmed:</strong> confirmed for your proposed event.</li>
            <li><strong>Temporary hold:</strong> expires at the stated time.</li>
            <li><strong>Confirmed booking:</strong> supported by booking evidence.</li>
          </ul>
        </section>
      </div></Show>
    </div>
  </article>;
}
