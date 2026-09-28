// @locs-version: 1.0
// One-question-at-a-time intake for visitors who arrived via the wedding
// marketing site (omnyid.com/wedding). Same underlying signals and generation
// logic as the generic in-app intake form in ResponseQueueView.tsx — this
// component only changes how those fields are presented, never what they do.
import { createSignal, For, Show } from "solid-js";

import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import type { WeddingTemplateLaunchState } from "@/lib/weddingTemplateLaunchState";
import type { WeddingTemplateFollowUpState } from "@/lib/weddingTemplateFollowUpState";
import { weddingVendorSelectionLabels } from "@/lib/weddingVendorChecklistState";
import { weddingVendorMustDecideFirstCategories } from "@/lib/weddingVendorLeadTimeState";
import type { WeddingVendorSearchResultAction } from "@/lib/weddingVendorSearchResultActionState";
import { WEDDING_VOW_STYLE_OPTIONS } from "@/lib/weddingVowPlanningState";

const STEP_LABELS = ["The basics", "Vendors", "Legal & vows", "Review"] as const;
const LAST_STEP = STEP_LABELS.length - 1;

export function WeddingSiteIntakeWizard(props: {
  launch: WeddingTemplateLaunchState;
  weddingExtractionText: () => string;
  onWeddingExtractionTextInput: (value: string) => void;
  onExtractFromMessage: () => void;
  weddingExtractionNotice: () => string;
  weddingFollowUpDate: () => string;
  onWeddingFollowUpDateInput: (value: string) => void;
  weddingFollowUpLocation: () => string;
  onWeddingFollowUpLocationInput: (value: string) => void;
  weddingFollowUpGuests: () => string;
  onWeddingFollowUpGuestsInput: (value: string) => void;
  weddingFollowUpBudget: () => string;
  onWeddingFollowUpBudgetInput: (value: string) => void;
  weddingFollowUpPriorities: () => string;
  onWeddingFollowUpPrioritiesInput: (value: string) => void;
  weddingFollowUpAtmosphere: () => string;
  onWeddingFollowUpAtmosphereInput: (value: string) => void;
  weddingFollowUpImageLinks: () => string;
  onWeddingFollowUpImageLinksInput: (value: string) => void;
  weddingFollowUpCoupleNames: () => string;
  onWeddingFollowUpCoupleNamesInput: (value: string) => void;
  weddingFollowUpVendorIds: () => string[];
  onClearVendors: () => void;
  onToggleVendor: (vendorId: string, selected: boolean) => void;
  weddingFollowUpVowPreference: () => string;
  onWeddingFollowUpVowPreferenceChange: (value: string) => void;
  weddingFollowUpVowStyle: () => string;
  onWeddingFollowUpVowStyleChange: (value: string) => void;
  weddingFollowUpRelationshipFacts: () => string;
  onWeddingFollowUpRelationshipFactsInput: (value: string) => void;
  weddingFollowUpVowChecklist: () => string;
  onWeddingFollowUpVowChecklistInput: (value: string) => void;
  weddingFollowUpNoim: () => string;
  onWeddingFollowUpNoimChange: (value: string) => void;
  weddingFollowUpCelebrant: () => string;
  onWeddingFollowUpCelebrantChange: (value: string) => void;
  onGenerateFollowUp: () => void;
  onSearchVendors?: () => Promise<void> | void;
  vendorSearchResultAction?: WeddingVendorSearchResultAction | null;
  onOpenVendorSearchResult?: (action: WeddingVendorSearchResultAction) => void;
  vendorSearchRunning?: boolean;
  vendorSearchNotice?: string | null;
  weddingTemplateFollowUp: () => WeddingTemplateFollowUpState | null;
}) {
  const [step, setStep] = createSignal(0);
  const [searchSubmitting, setSearchSubmitting] = createSignal(false);
  let datePickerInput: HTMLInputElement | undefined;
  const atLastStep = () => step() === LAST_STEP;
  const atFirstStep = () => step() === 0;
  const goNext = () => setStep((current) => Math.min(LAST_STEP, current + 1));
  const goBack = () => setStep((current) => Math.max(0, current - 1));
  const firstVendorCategories = weddingVendorMustDecideFirstCategories();

  const inputClass = "w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm font-normal text-on-surface outline-none focus:border-rose-300 sm:py-2";
  const labelClass = "space-y-1 text-xs font-semibold text-on-surface";
  async function searchVendorsFromIntake() {
    if (!props.onSearchVendors || props.vendorSearchRunning || searchSubmitting()) return;
    setSearchSubmitting(true);
    try {
      await props.onSearchVendors();
    } finally {
      setSearchSubmitting(false);
    }
  }

  return (
    <section class="min-w-0 rounded-[24px] border border-rose-100/80 bg-[linear-gradient(135deg,rgba(255,241,242,0.96),rgba(255,251,235,0.94))] p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-rose-700/70">
        Let's set up your wedding
      </p>
      <h2 class="mt-1 break-words text-lg font-semibold text-on-surface">{props.launch.presentation.title}</h2>
      <p class="mt-1 break-words text-sm leading-6 text-on-surface-variant">{props.launch.nextQuestionLabel}</p>
      <div class="mt-3 inline-flex max-w-full items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-950">
        Draft - not saved to your account yet
      </div>

      {/* Step progress */}
      <div class="mt-4 flex items-center gap-2">
        <For each={STEP_LABELS}>
          {(label, index) => (
            <div class="flex flex-1 items-center gap-2">
              <button
                type="button"
                disabled={index() > step() + 1}
                onClick={() => index() <= step() + 1 && setStep(index())}
                class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition ${
                  index() < step()
                    ? "bg-rose-700 text-white"
                    : index() === step()
                      ? "bg-rose-900 text-white"
                      : "border border-rose-200 bg-white text-rose-400"
                }`}
                title={label}
              >
                {index() < step() ? "✓" : index() + 1}
              </button>
              <Show when={index() < STEP_LABELS.length - 1}>
                <div class={`h-0.5 flex-1 rounded-full ${index() < step() ? "bg-rose-700" : "bg-rose-100"}`} />
              </Show>
            </div>
          )}
        </For>
      </div>
      <p class="mt-2 text-xs font-semibold text-rose-950">
        Step {step() + 1} of {STEP_LABELS.length}: {STEP_LABELS[step()]}
      </p>

      {/* Step 0 — the basics, with the fast-path paste box first */}
      <Show when={step() === 0}>
        <div class="mt-4 grid min-w-0 gap-3 rounded-[24px] border border-white/70 bg-white/65 p-3 md:grid-cols-2">
          <label class={`${labelClass} md:col-span-2`}>
            Paste a planning message for the fastest start — or fill in the fields below. Everything here can be changed later.
            <textarea
              class="min-h-28 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm font-normal text-on-surface outline-none focus:border-rose-300"
              value={props.weddingExtractionText()}
              onInput={(event) => props.onWeddingExtractionTextInput(event.currentTarget.value)}
              placeholder="Example: We are planning for October 2027 in Sydney NSW, about 90 guests, mid-range budget, priorities are food and photos, NOIM not downloaded, need celebrant options."
            />
          </label>
          <div class="grid gap-2 sm:flex sm:flex-wrap sm:items-center md:col-span-2">
            <button
              class="rounded-full border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-950 transition hover:border-rose-300 hover:bg-rose-50 sm:py-2"
              type="button"
              onClick={props.onExtractFromMessage}
            >
              Use message details
            </button>
            <Show when={props.weddingExtractionNotice()}>
              {(notice) => <p class="break-words text-xs leading-5 text-rose-950">{notice()}</p>}
            </Show>
          </div>
          <label class={labelClass}>
            Date or season
            <div class="relative">
              <input
                class={`${inputClass} pr-11`}
                value={props.weddingFollowUpDate()}
                onInput={(event) => props.onWeddingFollowUpDateInput(event.currentTarget.value)}
                placeholder="October 2027"
              />
              <button
                type="button"
                class="absolute inset-y-1 right-1 inline-flex w-9 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-800 transition hover:border-rose-200 hover:bg-rose-100"
                title="Pick date"
                aria-label="Pick date"
                onClick={() => {
                  if (typeof datePickerInput?.showPicker === "function") {
                    datePickerInput.showPicker();
                    return;
                  }
                  datePickerInput?.click();
                }}
              >
                <WeddingDashboardIcon id="calendar-days" class="h-4 w-4" />
              </button>
              <input
                ref={datePickerInput}
                type="date"
                class="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
                tabIndex={-1}
                aria-hidden="true"
                onInput={(event) => props.onWeddingFollowUpDateInput(event.currentTarget.value)}
              />
            </div>
          </label>
          <label class={labelClass}>
            Location
            <input
              class={inputClass}
              value={props.weddingFollowUpLocation()}
              onInput={(event) => props.onWeddingFollowUpLocationInput(event.currentTarget.value)}
              placeholder="Sydney NSW"
            />
          </label>
          <label class={labelClass}>
            Guest count
            <input
              class={inputClass}
              value={props.weddingFollowUpGuests()}
              onInput={(event) => props.onWeddingFollowUpGuestsInput(event.currentTarget.value)}
              placeholder="80"
            />
          </label>
          <label class={labelClass}>
            Budget comfort
            <input
              class={inputClass}
              value={props.weddingFollowUpBudget()}
              onInput={(event) => props.onWeddingFollowUpBudgetInput(event.currentTarget.value)}
              placeholder="Keep it lean"
            />
          </label>
          <label class={`${labelClass} md:col-span-2`}>
            Your names
            <input
              class={inputClass}
              value={props.weddingFollowUpCoupleNames()}
              onInput={(event) => props.onWeddingFollowUpCoupleNamesInput(event.currentTarget.value)}
              placeholder="Alex and Sam"
            />
          </label>
          <label class={`${labelClass} md:col-span-2`}>
            Priorities
            <input
              class={inputClass}
              value={props.weddingFollowUpPriorities()}
              onInput={(event) => props.onWeddingFollowUpPrioritiesInput(event.currentTarget.value)}
              placeholder="food, photos, low stress"
            />
          </label>
          <label class={`${labelClass} md:col-span-2`}>
            What should the day feel like?
            <textarea
              class="min-h-24 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm font-normal text-on-surface outline-none focus:border-rose-300"
              value={props.weddingFollowUpAtmosphere()}
              onInput={(event) => props.onWeddingFollowUpAtmosphereInput(event.currentTarget.value)}
              placeholder="Relaxed garden dinner, candlelit, joyful, not too formal."
            />
          </label>
          <label class={`${labelClass} md:col-span-2`}>
            Inspiration picture links
            <textarea
              class="min-h-24 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm font-normal text-on-surface outline-none focus:border-rose-300"
              value={props.weddingFollowUpImageLinks()}
              onInput={(event) => props.onWeddingFollowUpImageLinksInput(event.currentTarget.value)}
              placeholder="Paste direct image or inspiration links, one per line."
            />
          </label>
        </div>
      </Show>

      {/* Step 1 — vendors (optional) */}
      <Show when={step() === 1}>
        <div class="mt-4 space-y-2 rounded-[24px] border border-white/70 bg-white/65 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-semibold text-on-surface">First vendor choices (optional)</p>
              <p class="mt-0.5 break-words text-[11px] leading-5 text-on-surface-variant">
                Start with the longest-lead-time choices. Other vendor categories will surface later when their research window opens.
              </p>
            </div>
            <Show when={props.weddingFollowUpVendorIds().length > 0}>
              <button
                type="button"
                class="w-full rounded-full border border-rose-100 bg-white px-3 py-2 text-[11px] font-semibold text-rose-950 hover:bg-rose-50 sm:w-auto sm:py-1"
                onClick={props.onClearVendors}
              >
                Clear vendors
              </button>
            </Show>
          </div>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <For each={firstVendorCategories}>
              {(vendor) => {
                const checked = () => props.weddingFollowUpVendorIds().includes(vendor.categoryId);
                return (
                  <label class={`flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-semibold transition sm:py-2 ${
                    checked()
                      ? "border-rose-300 bg-rose-50 text-rose-950"
                      : "border-rose-100 bg-white/80 text-on-surface-variant hover:border-rose-200"
                  }`}>
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-rose-700"
                      checked={checked()}
                      onChange={(event) => props.onToggleVendor(vendor.categoryId, event.currentTarget.checked)}
                    />
                    <span class="min-w-0 break-words">{vendor.label}</span>
                    <span class="ml-auto shrink-0 rounded-full bg-white/75 px-2 py-0.5 text-[10px] text-rose-900/70">
                      {vendor.idealLeadMonths[0]}-{vendor.idealLeadMonths[1]} mo
                    </span>
                  </label>
                );
              }}
            </For>
          </div>
          <Show when={props.weddingFollowUpVendorIds().length > 0}>
            <p class="break-words text-[11px] leading-5 text-rose-950">
              Selected: {weddingVendorSelectionLabels(props.weddingFollowUpVendorIds()).join(", ")}
            </p>
          </Show>
        </div>
      </Show>

      {/* Step 2 — legal & vows (optional) */}
      <Show when={step() === 2}>
        <div class="mt-4 min-w-0 space-y-3 rounded-[24px] border border-white/70 bg-white/65 p-3">
          <div>
            <p class="text-xs font-semibold text-on-surface">Vow preparation (optional)</p>
            <p class="mt-0.5 break-words text-[11px] leading-5 text-on-surface-variant">
              Decide early whether to create personal vows or use a standard vow. If you create one, OmnyID will use the selected style and only known relationship facts from saved memory/context.
            </p>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <label class={labelClass}>
              Vow choice
              <select
                class={inputClass}
                value={props.weddingFollowUpVowPreference()}
                onChange={(event) => props.onWeddingFollowUpVowPreferenceChange(event.currentTarget.value)}
              >
                <option value="">Decide later</option>
                <option value="create">Create personal vows</option>
                <option value="standard">Use a standard vow</option>
              </select>
            </label>
            <label class={labelClass}>
              Personal vow style
              <select
                class={`${inputClass} disabled:opacity-60`}
                value={props.weddingFollowUpVowStyle()}
                disabled={props.weddingFollowUpVowPreference() !== "create"}
                onChange={(event) => props.onWeddingFollowUpVowStyleChange(event.currentTarget.value)}
              >
                <option value="">Use warm personal default</option>
                <For each={WEDDING_VOW_STYLE_OPTIONS}>
                  {(style) => <option value={style.id}>{style.label}</option>}
                </For>
              </select>
            </label>
          </div>
          <Show when={props.weddingFollowUpVowPreference() === "create"}>
            <div class="rounded-2xl border border-rose-100 bg-rose-50/70 p-3">
              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700/80">
                Style inspiration
              </p>
              <p class="mt-1 break-words text-sm leading-6 text-rose-950">
                {(WEDDING_VOW_STYLE_OPTIONS.find((style) => style.id === props.weddingFollowUpVowStyle()) ?? WEDDING_VOW_STYLE_OPTIONS[0]).sample}
              </p>
            </div>
          </Show>
          <div class="grid gap-2 lg:grid-cols-2">
            <label class={labelClass}>
              Known relationship facts saved in OmnyID
              <textarea
                class="min-h-28 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm font-normal text-on-surface outline-none focus:border-rose-300"
                value={props.weddingFollowUpRelationshipFacts()}
                onInput={(event) => props.onWeddingFollowUpRelationshipFactsInput(event.currentTarget.value)}
                placeholder="One known fact per line. Leave blank if not already known; OmnyID must not invent relationship history."
              />
            </label>
            <label class={labelClass}>
              Add to vow checklist
              <textarea
                class="min-h-28 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm font-normal text-on-surface outline-none focus:border-rose-300"
                value={props.weddingFollowUpVowChecklist()}
                onInput={(event) => props.onWeddingFollowUpVowChecklistInput(event.currentTarget.value)}
                placeholder="One checklist item per line, e.g. agree target length; decide private vs ceremony-facing; confirm celebrant constraints."
              />
            </label>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <label class={labelClass}>
              NOIM status for Australian couples
              <select
                class={inputClass}
                value={props.weddingFollowUpNoim()}
                onChange={(event) => props.onWeddingFollowUpNoimChange(event.currentTarget.value)}
              >
                <option value="">Not applicable or ask later</option>
                <option value="yes">Downloaded</option>
                <option value="no">Not downloaded</option>
                <option value="unknown">Not sure</option>
              </select>
            </label>
            <label class={labelClass}>
              Celebrant path
              <select
                class={inputClass}
                value={props.weddingFollowUpCelebrant()}
                onChange={(event) => props.onWeddingFollowUpCelebrantChange(event.currentTarget.value)}
              >
                <option value="">Ask later</option>
                <option value="own_celebrant">Own authorised celebrant</option>
                <option value="public_or_registry_celebrant">Public/registry-style options</option>
                <option value="need_options">Compare both</option>
              </select>
            </label>
          </div>
        </div>
      </Show>

      {/* Step 3 — review & generate */}
      <Show when={step() === 3}>
        <div class="mt-4 space-y-3 rounded-[24px] border border-white/70 bg-white/65 p-3">
          <div class="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
            <p class="text-xs font-semibold text-amber-950">Draft - not saved to your account yet</p>
            <p class="mt-0.5 text-[11px] leading-5 text-amber-900">
              Generate the starter files, then approve the planning outputs to save them and the structured intake profile.
            </p>
          </div>
          <p class="text-xs leading-5 text-on-surface-variant">
            A starter brief has been created as the first planning file. Approve planning outputs to keep it in Files before adding private details.
          </p>
          <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            <For each={props.launch.launchLabels.slice(0, 5)}>
              {(label) => (
                <span class="shrink-0 rounded-full border border-rose-100 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-rose-950">
                  {label}
                </span>
              )}
            </For>
          </div>
          <div class="grid gap-2 md:grid-cols-3">
            <For each={props.launch.starterCards.slice(0, 6)}>
              {(starter) => (
                <article class={`min-w-0 rounded-2xl border p-3 ${
                  starter.recommended ? "border-rose-200 bg-white/85" : "border-white/70 bg-white/55"
                }`}>
                  <p class="break-words text-xs font-semibold text-on-surface">{starter.label}</p>
                  <p class="mt-1 break-words text-[11px] leading-5 text-on-surface-variant">{starter.prompt}</p>
                </article>
              )}
            </For>
          </div>
          <div>
            <button
              class="w-full rounded-full bg-rose-900 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-rose-800 sm:w-auto sm:py-2"
              type="button"
              onClick={props.onGenerateFollowUp}
            >
              Make follow-up documents
            </button>
            <Show when={props.onSearchVendors}>
              <button
                class="mt-2 w-full rounded-full border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-950 shadow-card transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-2 sm:mt-0 sm:w-auto sm:py-2"
                type="button"
                disabled={props.vendorSearchRunning || searchSubmitting()}
                onClick={() => void searchVendorsFromIntake()}
              >
                {props.vendorSearchRunning || searchSubmitting() ? "Searching vendors..." : "Search vendors"}
              </button>
            </Show>
            <Show when={props.weddingTemplateFollowUp()}>
              {(followUp) => (
                <p class="mt-2 break-words text-xs leading-5 text-rose-950">
                  Follow-up files are ready from {followUp().answeredLabels.length} captured answer{followUp().answeredLabels.length === 1 ? "" : "s"}.
                  Approve planning outputs to keep them in your wedding documents.
                </p>
              )}
            </Show>
            <Show when={props.vendorSearchNotice}>
              {(notice) => (
                <p class="mt-2 break-words text-xs leading-5 text-rose-950">
                  {notice()}
                </p>
              )}
            </Show>
            <Show when={props.vendorSearchResultAction}>
              {(action) => (
                <button
                  type="button"
                  class="mt-2 w-full rounded-full bg-rose-900 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-rose-800 sm:w-auto sm:py-2"
                  onClick={() => props.onOpenVendorSearchResult?.(action())}
                >
                  {action().label}
                </button>
              )}
            </Show>
          </div>
        </div>
      </Show>

      {/* Step navigation */}
      <div class="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={atFirstStep()}
          onClick={goBack}
          class="rounded-full border border-rose-200 bg-white/80 px-4 py-2 text-sm font-semibold text-rose-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        <Show when={!atLastStep()}>
          <div class="flex flex-wrap items-center gap-2">
            <Show when={step() === 1 || step() === 2}>
              <button
                type="button"
                onClick={goNext}
                class="rounded-full px-3 py-2 text-xs font-semibold text-rose-900/70 underline decoration-rose-300 underline-offset-2"
              >
                Skip — decide later
              </button>
            </Show>
            <button
              type="button"
              onClick={goNext}
              class="rounded-full bg-rose-900 px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-rose-800"
            >
              Next
            </button>
          </div>
        </Show>
      </div>
    </section>
  );
}
