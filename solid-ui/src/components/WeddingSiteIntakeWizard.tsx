// @locs-version: 1.0
// One-question-at-a-time intake for visitors who arrived via the wedding
// marketing site (omnyid.com/wedding). Same underlying signals and generation
// logic as the generic in-app intake form in ResponseQueueView.tsx — this
// component only changes how those fields are presented, never what they do.
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingConfirmDialog } from "@/components/WeddingConfirmDialog";
import { WeddingInlineHelpNote } from "@/components/WeddingInlineHelpNote";
import { WeddingMagnetProfileImportReview } from "@/components/WeddingMagnetProfileImportReview";
import type { WeddingMagnetImportFact, WeddingMagnetIntakePrefill } from "@/lib/weddingMagnetProfileImportPreviewState";
import type { WeddingTemplateLaunchState } from "@/lib/weddingTemplateLaunchState";
import type { WeddingTemplateStarterIntent } from "@/lib/weddingTemplateEntryState";
import type { WeddingTemplateFollowUpState } from "@/lib/weddingTemplateFollowUpState";
import { weddingVendorSelectionLabels } from "@/lib/weddingVendorChecklistState";
import { weddingVendorMustDecideFirstCategories } from "@/lib/weddingVendorLeadTimeState";
import type { WeddingVendorSearchResultAction } from "@/lib/weddingVendorSearchResultActionState";
import { WEDDING_VOW_STYLE_OPTIONS } from "@/lib/weddingVowPlanningState";
import { australianWeddingLocationSuggestions } from "@/lib/australianWeddingLocationSuggestionState";

const STEP_LABELS = ["The basics", "Vendors", "Legal & vows", "Review"] as const;
const LAST_STEP = STEP_LABELS.length - 1;
const ATMOSPHERE_PHOTO_CHOICES = [
  { id: "intimate-dinner", label: "Intimate dinner", detail: "Warm, abundant and conversational", image: "/wedding/assets/images/quiz/restaurant.webp" },
  { id: "coastal", label: "Coastal ease", detail: "Natural, bright and close to the water", image: "/wedding/assets/images/quiz/beach.webp" },
  { id: "long-table", label: "Long-table feast", detail: "Social, generous and relaxed", image: "/wedding/assets/images/quiz/longtable.webp" },
  { id: "night", label: "After-dark energy", detail: "Lively, dramatic and celebratory", image: "/wedding/assets/images/quiz/night.webp" },
  { id: "ballroom", label: "Modern formal", detail: "Polished, elegant and spacious", image: "/wedding/assets/images/quiz/ballroom.webp" },
  { id: "cliff", label: "Open landscape", detail: "Airy, scenic and adventurous", image: "/wedding/assets/images/quiz/cliff.webp" },
  { id: "family", label: "Family-centred", detail: "Welcoming, connected and joyful", image: "/wedding/assets/images/quiz/family.webp" },
  { id: "pastel", label: "Soft colour", detail: "Playful, romantic and light", image: "/wedding/assets/images/quiz/pastel.webp" },
] as const;
const MONTH_INDEX_BY_NAME: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};
const BUDGET_COMFORT_OPTIONS = [
  "Keep it lean (under AUD $20,000)",
  "Comfortable (AUD $20,000–$40,000)",
  "More flexibility (AUD $40,000–$70,000)",
  "Premium (over AUD $70,000)",
] as const;

function twelveMonthsFromToday(today = new Date()): Date {
  return new Date(today.getFullYear() + 1, today.getMonth(), 1);
}

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
  quizSuggestions?: string[];
  onImportQuizSuggestions?: () => void;
  onImportMagnetProfile?: (prefill: WeddingMagnetIntakePrefill, facts: readonly WeddingMagnetImportFact[]) => void;
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
  adminDataConsentEnabled: () => boolean;
  onAdminDataConsentChange: (enabled: boolean) => void;
  onSaveProgress: () => void;
  onGenerateFollowUp: (starterIntents?: WeddingTemplateStarterIntent[]) => void | Promise<void>;
  vendorSearchResultAction?: WeddingVendorSearchResultAction | null;
  onOpenVendorSearchResult?: (action: WeddingVendorSearchResultAction) => void;
  vendorSearchNotice?: string | null;
  weddingTemplateFollowUp: () => WeddingTemplateFollowUpState | null;
}) {
  const [step, setStep] = createSignal(0);
  const [progressSaved, setProgressSaved] = createSignal(false);
  const [finishing, setFinishing] = createSignal(false);
  const [dateCalendarOpen, setDateCalendarOpen] = createSignal(false);
  const [clearVendorsOpen, setClearVendorsOpen] = createSignal(false);
  const defaultCalendarDate = twelveMonthsFromToday();
  const [calendarMonth, setCalendarMonth] = createSignal(defaultCalendarDate.getMonth());
  const [calendarYear, setCalendarYear] = createSignal(defaultCalendarDate.getFullYear());
  const [locationSuggestionsOpen, setLocationSuggestionsOpen] = createSignal(false);
  const [guestDefaultApplied, setGuestDefaultApplied] = createSignal(false);
  const [selectedStarterIntents, setSelectedStarterIntents] = createSignal<WeddingTemplateStarterIntent[]>(
    props.launch.starterCards
      .filter((card) => card.recommended)
      .map((card) => card.intent),
  );
  const atLastStep = () => step() === LAST_STEP;
  const atFirstStep = () => step() === 0;
  const goNext = () => { props.onSaveProgress(); setProgressSaved(true); setStep((current) => Math.min(LAST_STEP, current + 1)); };
  const goBack = () => setStep((current) => Math.max(0, current - 1));
  const firstVendorCategories = weddingVendorMustDecideFirstCategories();

  const inputClass = "w-full rounded-lg border border-wedding-border bg-white px-3 py-2.5 text-sm font-normal text-wedding-ink outline-none focus:border-wedding-primary focus:ring-2 focus:ring-wedding-primary/15 sm:py-2";
  const labelClass = "space-y-1 text-xs font-semibold text-wedding-ink";
  const headerHint = () => [props.launch.nextQuestionLabel, "Choose the first vendors you want help finding.", "Add optional ceremony details, or skip them for now.", "Review your choices, then create your plan."][step()] ?? props.launch.nextQuestionLabel;
  const monthFormatter = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const calendarCells = createMemo(() => {
    const year = calendarYear();
    const month = calendarMonth();
    const first = new Date(year, month, 1);
    const total = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ key: string; day: number | null; iso: string | null }> = [];
    for (let i = 0; i < first.getDay(); i += 1) cells.push({ key: `blank-${i}`, day: null, iso: null });
    for (let day = 1; day <= total; day += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ key: iso, day, iso });
    }
    return cells;
  });
  const locationSuggestions = createMemo(() => australianWeddingLocationSuggestions(
    props.weddingFollowUpLocation(),
    [],
  ).slice(0, 8));
  createEffect(() => {
    if (guestDefaultApplied()) return;
    if (!props.weddingFollowUpGuests().trim()) props.onWeddingFollowUpGuestsInput("20");
    setGuestDefaultApplied(true);
  });
  function shiftCalendarMonth(offset: number) {
    const next = new Date(calendarYear(), calendarMonth() + offset, 1);
    setCalendarYear(next.getFullYear());
    setCalendarMonth(next.getMonth());
  }
  function selectCalendarDate(iso: string) {
    props.onWeddingFollowUpDateInput(iso);
    setDateCalendarOpen(false);
  }
  function syncCalendarToDateField() {
    const value = props.weddingFollowUpDate().trim();
    const iso = value.match(/^(\d{4})-(\d{2})-\d{2}$/);
    if (iso?.[1] && iso[2]) {
      setCalendarYear(Number(iso[1]));
      setCalendarMonth(Math.max(0, Math.min(11, Number(iso[2]) - 1)));
      return;
    }
    const monthYear = value.match(/\b([A-Za-z]+)\s+(20\d{2})\b/);
    const month = monthYear?.[1] ? MONTH_INDEX_BY_NAME[monthYear[1].toLowerCase()] : undefined;
    if (typeof month === "number" && monthYear?.[2]) {
      setCalendarYear(Number(monthYear[2]));
      setCalendarMonth(month);
      return;
    }
    const future = twelveMonthsFromToday();
    setCalendarYear(future.getFullYear());
    setCalendarMonth(future.getMonth());
  }
  function adjustGuestCount(delta: number) {
    const current = Number.parseInt(props.weddingFollowUpGuests(), 10);
    props.onWeddingFollowUpGuestsInput(String(Math.max(0, (Number.isFinite(current) ? current : 20) + delta)));
  }
  function toggleStarterIntent(intent: WeddingTemplateStarterIntent, selected: boolean) {
    setSelectedStarterIntents((current) => {
      const set = new Set(current);
      if (selected) set.add(intent);
      else set.delete(intent);
      return props.launch.starterCards
        .map((card) => card.intent)
        .filter((id) => set.has(id));
    });
  }
  function chooseAtmosphere(detail: string) {
    const current = props.weddingFollowUpAtmosphere().trim();
    const parts = current
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    const selectedIndex = parts.findIndex((part) => part.toLowerCase() === detail.toLowerCase());
    const next = selectedIndex >= 0
      ? parts.filter((_, index) => index !== selectedIndex)
      : [...parts, detail];
    props.onWeddingFollowUpAtmosphereInput(next.join("; "));
  }
  async function finishSetup() {
    if (finishing()) return;
    props.onSaveProgress(); setProgressSaved(true); setFinishing(true);
    try { await props.onGenerateFollowUp(selectedStarterIntents()); }
    finally { setFinishing(false); }
  }
  return (
    <section class="min-w-0 rounded-xl border border-wedding-border bg-wedding-card p-3 text-wedding-ink shadow-wedding-card sm:p-4">
      <p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-wedding-primary">
        Let's set up your wedding
      </p>
      <h2 class="mt-1 break-words font-display text-lg font-semibold text-wedding-ink">{STEP_LABELS[step()]}</h2>
      <p class="mt-1 break-words text-sm leading-6 text-wedding-ink/70">{headerHint()}</p>
      <Show when={!atLastStep()}>
        <div class="mt-3 inline-flex max-w-full items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-950">
          {progressSaved() ? "Progress saved on this device" : "Draft — continue to save your progress on this device"}
        </div>
      </Show>

      {/* Step progress */}
      <div class="mt-4 flex items-center gap-2">
        <For each={STEP_LABELS}>
          {(label, index) => (
            <div class="flex flex-1 items-center gap-2">
              <button
                type="button"
                disabled={index() > step() + 1}
                onClick={() => { if (index() <= step() + 1) { props.onSaveProgress(); setProgressSaved(true); setStep(index()); } }}
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
      <p class="mt-2 text-xs font-semibold text-wedding-ink">
        Step {step() + 1} of {STEP_LABELS.length}: {STEP_LABELS[step()]}
      </p>

      {/* Step 0 — the basics, with the fast-path paste box first */}
      <Show when={step() === 0}>
        <Show when={props.onImportMagnetProfile}>{(onImport) => <WeddingMagnetProfileImportReview
          onImport={onImport()}
          currentPrefill={{
            weddingDate: props.weddingFollowUpDate(),
            location: props.weddingFollowUpLocation(),
            guestCount: props.weddingFollowUpGuests(),
            budgetTotal: props.weddingFollowUpBudget(),
            priorities: props.weddingFollowUpPriorities(),
            atmosphere: props.weddingFollowUpAtmosphere(),
            coupleNames: props.weddingFollowUpCoupleNames(),
            vendorCategories: props.weddingFollowUpVendorIds(),
          }}
        />}</Show>
        <div class="mb-3 rounded-xl border border-wedding-border bg-white px-3 py-2 text-xs leading-5 text-wedding-ink">
          Not sure where to start? Try the <a class="font-semibold text-wedding-secondary underline underline-offset-2" href="/wedding/blog/couples-barely-know-each-other.html">wedding animal quiz</a> to gather your style.
          <Show when={(props.quizSuggestions?.length ?? 0) > 0}>
            <div class="mt-2 rounded-lg border border-wedding-border bg-wedding-page p-3">
              <p class="text-[11px] font-semibold text-wedding-ink">Bring your quiz results into your plan?</p>
              <p class="mt-1 text-[11px] leading-5 text-wedding-ink/70">
                This adds these private, editable suggestions: {props.quizSuggestions?.join(" · ")}.
                It will not infer a budget amount, guest count, wedding date, vendor booking, or permission to contact anyone.
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-full bg-wedding-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-wedding-primary/90"
                  onClick={props.onImportQuizSuggestions}
                >
                  Bring these into my plan
                </button>
                <a
                  class="rounded-full border border-wedding-border bg-white px-4 py-2 text-xs font-semibold text-wedding-ink"
                  href="/wedding/animal-quiz.html"
                >
                  Review quiz answers
                </a>
              </div>
            </div>
          </Show>
        </div>
        <div class="mt-4 grid min-w-0 gap-3 rounded-xl border border-wedding-border bg-wedding-page p-3 md:grid-cols-2">
          <label class={`${labelClass} md:col-span-2`}>
            Paste a planning message for the fastest start — or fill in the fields below. Everything here can be changed later.
            <textarea
              class="min-h-28 w-full rounded-lg border border-wedding-border bg-white px-3 py-2 text-sm font-normal text-wedding-ink outline-none focus:border-wedding-primary focus:ring-2 focus:ring-wedding-primary/15"
              value={props.weddingExtractionText()}
              onInput={(event) => props.onWeddingExtractionTextInput(event.currentTarget.value)}
              placeholder="Example: We are planning for October 2027 in Sydney for about 90 guests. Our budget is around $40,000 and food and photos matter most."
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
                  syncCalendarToDateField();
                  setDateCalendarOpen((open) => !open);
                }}
              >
                <WeddingDashboardIcon id="calendar-days" class="h-4 w-4" />
              </button>
              <Show when={dateCalendarOpen()}>
                <div class="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-rose-100 bg-white p-3 shadow-card">
                  <div class="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      class="rounded-full border border-rose-100 px-2 py-1 text-xs font-semibold text-rose-950"
                      onClick={() => shiftCalendarMonth(-1)}
                      aria-label="Previous month"
                    >
                      &lt;
                    </button>
                    <p class="text-xs font-semibold text-rose-950">
                      {monthFormatter.format(new Date(calendarYear(), calendarMonth(), 1))}
                    </p>
                    <button
                      type="button"
                      class="rounded-full border border-rose-100 px-2 py-1 text-xs font-semibold text-rose-950"
                      onClick={() => shiftCalendarMonth(1)}
                      aria-label="Next month"
                    >
                      &gt;
                    </button>
                  </div>
                  <div class="mt-3 grid grid-cols-7 gap-1 text-center">
                    <For each={weekDays}>
                      {(day) => <span class="text-[10px] font-semibold text-rose-900/60">{day}</span>}
                    </For>
                    <For each={calendarCells()}>
                      {(cell) => (
                        <Show
                          when={cell.iso}
                          fallback={<span class="h-8 rounded-lg" />}
                        >
                          {(iso) => (
                            <button
                              type="button"
                              class={`h-8 rounded-lg text-xs font-semibold transition ${
                                props.weddingFollowUpDate() === iso()
                                  ? "bg-rose-900 text-white"
                                  : "bg-rose-50 text-rose-950 hover:bg-rose-100"
                              }`}
                              onClick={() => selectCalendarDate(iso())}
                            >
                              {cell.day}
                            </button>
                          )}
                        </Show>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          </label>
          <label class={labelClass}>
            Location
            <div class="relative">
              <input
                class={inputClass}
                value={props.weddingFollowUpLocation()}
                onFocus={() => setLocationSuggestionsOpen(true)}
                onInput={(event) => { props.onWeddingFollowUpLocationInput(event.currentTarget.value); setLocationSuggestionsOpen(true); }}
                onKeyDown={(event) => { if (event.key === "Escape") setLocationSuggestionsOpen(false); }}
                autocomplete="off"
                aria-autocomplete="list"
                aria-controls="wedding-onboarding-location-suggestions"
                placeholder="Sydney NSW"
              />
              <Show when={locationSuggestionsOpen() && locationSuggestions().length > 0}>
                <div id="wedding-onboarding-location-suggestions" role="listbox" class="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-wedding-border bg-white p-1 shadow-card">
                  <For each={locationSuggestions()}>{(suggestion) => (
                    <button type="button" role="option" class="flex min-h-11 w-full items-center gap-1 rounded-lg px-3 py-2 text-left text-sm hover:bg-wedding-page" onClick={() => { props.onWeddingFollowUpLocationInput(suggestion.label); setLocationSuggestionsOpen(false); }}>
                      <span class="font-semibold">{suggestion.locality}</span><span class="font-bold text-wedding-secondary">{suggestion.state}</span>
                    </button>
                  )}</For>
                </div>
              </Show>
            </div>
          </label>
          <label class={labelClass}>
            Guest count
            <div class="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] gap-1">
              <button type="button" class="min-h-11 rounded-lg border border-wedding-border bg-white text-lg font-bold" aria-label="Reduce guest count by 10" onClick={() => adjustGuestCount(-10)}>−</button>
              <input class={`${inputClass} text-center`} type="number" min="0" step="10" inputmode="numeric" value={props.weddingFollowUpGuests()} onInput={(event) => props.onWeddingFollowUpGuestsInput(event.currentTarget.value)} placeholder="20" />
              <button type="button" class="min-h-11 rounded-lg border border-wedding-border bg-white text-lg font-bold" aria-label="Increase guest count by 10" onClick={() => adjustGuestCount(10)}>+</button>
            </div>
          </label>
          <label class={labelClass}>
            Budget comfort
            <input
              class={inputClass}
              list="wedding-budget-comfort-options"
              value={props.weddingFollowUpBudget()}
              onInput={(event) => props.onWeddingFollowUpBudgetInput(event.currentTarget.value)}
              placeholder="Keep it lean"
            />
            <datalist id="wedding-budget-comfort-options"><For each={BUDGET_COMFORT_OPTIONS}>{(option) => <option value={option} />}</For></datalist>
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
            <div class="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Photographic atmosphere choices">
              <For each={ATMOSPHERE_PHOTO_CHOICES}>
                {(choice, index) => {
                  const selected = () => props.weddingFollowUpAtmosphere()
                    .split(";")
                    .some((part) => part.trim().toLowerCase() === choice.detail.toLowerCase());
                  return (
                    <button
                      type="button"
                      aria-pressed={selected()}
                      class={`group overflow-hidden rounded-xl border bg-white text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary ${selected() ? "border-wedding-primary ring-2 ring-wedding-primary/20" : "border-wedding-border hover:border-wedding-primary/50"}`}
                      onClick={() => chooseAtmosphere(choice.detail)}
                    >
                      <img
                        src={choice.image}
                        alt=""
                        width="480"
                        height="320"
                        loading={index() < 2 ? "eager" : "lazy"}
                        decoding="async"
                        class="aspect-[3/2] w-full bg-wedding-page object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                      <span class="block px-2 pt-2 text-xs font-bold text-wedding-ink">{choice.label}</span>
                      <span class="block px-2 pb-2 text-[10px] leading-4 text-wedding-ink/65">{choice.detail}</span>
                    </button>
                  );
                }}
              </For>
            </div>
            <WeddingInlineHelpNote class="mt-2 font-normal">Choose any photographs that feel close, then add your own words below. Select a photograph again to remove it.</WeddingInlineHelpNote>
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
            <span class="block text-[11px] font-medium leading-5 text-on-surface-variant">
              Links are saved as references. Visual style is only used after an approved agent fetches or inspects them.
            </span>
          </label>
        </div>
      </Show>

      {/* Step 1 — vendors (optional) */}
      <Show when={step() === 1}>
        <div class="mt-4 space-y-2 rounded-xl border border-wedding-border bg-wedding-page p-3">
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
                onClick={() => setClearVendorsOpen(true)}
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

      <WeddingConfirmDialog
        open={clearVendorsOpen()}
        title="Clear your first vendor choices?"
        detail="This removes every vendor category selected in this onboarding step. You can add them again before creating your plan."
        confirmLabel="Clear choices"
        destructive
        onCancel={() => setClearVendorsOpen(false)}
        onConfirm={() => { props.onClearVendors(); setClearVendorsOpen(false); }}
      />

      {/* Step 2 — legal & vows (optional) */}
      <Show when={step() === 2}>
        <div class="mt-4 min-w-0 space-y-3 rounded-xl border border-wedding-border bg-wedding-page p-3">
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
              Notice of Intended Marriage status (Australia)
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
        <div class="mt-4 space-y-3 rounded-xl border border-wedding-border bg-wedding-page p-3">
          <div class="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
            <p class="text-xs font-semibold text-amber-950">Ready to create your plan</p>
            <p class="mt-0.5 text-[11px] leading-5 text-amber-900">
              Generate the starter files, then approve the planning outputs to save them and the structured intake profile.
            </p>
          </div>
          <p class="text-xs leading-5 text-on-surface-variant">
            A starter brief has been created as the first planning file. Approve planning outputs to keep it in Files before adding private details.
          </p>
          <p class="text-xs font-semibold text-on-surface">Choose what OmnyID should prepare first.</p>
          <div class="grid gap-2 md:grid-cols-3">
            <For each={props.launch.starterCards.slice(0, 6)}>
              {(starter) => (
                <label class={`min-w-0 rounded-2xl border p-3 transition ${
                  selectedStarterIntents().includes(starter.intent) ? "border-rose-300 bg-white" : "border-white/70 bg-white/55"
                }`}>
                  <input
                    type="checkbox"
                    class="mb-2 h-4 w-4 accent-rose-700"
                    checked={selectedStarterIntents().includes(starter.intent)}
                    onChange={(event) => toggleStarterIntent(starter.intent, event.currentTarget.checked)}
                  />
                  <p class="break-words text-xs font-semibold text-on-surface">{starter.label}</p>
                  <p class="mt-1 break-words text-[11px] leading-5 text-on-surface-variant">{starter.prompt}</p>
                </label>
              )}
            </For>
          </div>
          <label class="flex min-h-11 items-start gap-3 rounded-xl border border-wedding-border bg-white px-3 py-3 text-sm leading-5 text-wedding-ink">
            <input
              type="checkbox"
              class="mt-0.5 h-5 w-5 shrink-0 accent-wedding-primary"
              checked={props.adminDataConsentEnabled()}
              onChange={(event) => props.onAdminDataConsentChange(event.currentTarget.checked)}
            />
            <span>
              <span class="block font-semibold">Share content-free progress statistics with OmnyID</span>
              <span class="mt-1 block text-xs leading-5 text-wedding-ink/70">
                Optional and unticked by default. Authorised administrators can count whether this wedding completes onboarding, saves a vendor or resolves a decision. Names, contact details, messages, drafts, budget, guest count, quiz answers, files and vendor choices are excluded. Declining does not change your planner. You can change this later in Documents.
                {" "}<a class="font-semibold underline underline-offset-2" href="/wedding/privacy.html#product-statistics" target="_blank" rel="noopener">Read the separate product statistics notice</a>.
              </span>
            </span>
          </label>
          <div>
            <button
              class="w-full rounded-lg bg-wedding-primary px-4 py-2.5 text-sm font-semibold text-wedding-page shadow-sm transition hover:bg-wedding-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2"
              type="button"
              onClick={() => void finishSetup()}
              disabled={finishing()}
            >
              {finishing() ? "Creating your wedding plan…" : "Create my wedding plan"}
            </button>
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
                  class="mt-2 w-full rounded-lg border border-wedding-secondary bg-white px-4 py-2.5 text-sm font-semibold text-wedding-secondary transition hover:bg-wedding-slate sm:w-auto sm:py-2"
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
          class="rounded-lg border border-wedding-secondary bg-white px-4 py-2 text-sm font-semibold text-wedding-secondary transition hover:bg-wedding-slate disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        <Show when={!atLastStep()}>
          <div class="flex flex-wrap items-center gap-2">
            <Show when={step() === 1 || step() === 2}>
              <button
                type="button"
                onClick={goNext}
                class="rounded-lg px-3 py-2 text-xs font-semibold text-wedding-secondary underline decoration-wedding-border underline-offset-2"
              >
                Skip — decide later
              </button>
            </Show>
            <button
              type="button"
              onClick={goNext}
              class="rounded-lg bg-wedding-primary px-4 py-2 text-sm font-semibold text-wedding-page shadow-sm transition hover:bg-wedding-primary/90"
            >
              Next
            </button>
          </div>
        </Show>
      </div>
    </section>
  );
}
