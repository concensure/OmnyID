// @locs-version: 1.0
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import { DecisionCard } from "@/components/DecisionCard";
import { PlanningConstraintCaptureCard } from "@/components/PlanningConstraintCaptureCard";
import { WeddingDashboardIcon, type WeddingDashboardIconId } from "@/components/WeddingDashboardIcons";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { WeddingVendorChoiceCard } from "@/components/WeddingVendorChoiceCard";
import { WeddingPreferenceConfirmationChips } from "@/components/WeddingPreferenceConfirmationChips";
import { WeddingDealBreakerEditor } from "@/components/WeddingDealBreakerEditor";
import { WeddingConfirmDialog } from "@/components/WeddingConfirmDialog";
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import { decisionCardFromWeddingVendorComparison } from "@/lib/decisionCardState";
import type { useWeddingVendorOutreachOwner } from "@/lib/useWeddingVendorOutreachOwner";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingVendorChoiceSelectionSaveInput } from "@/components/WeddingArtifactDetailPanel";
import type { WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import type { WeddingPreferenceChipChange } from "@/lib/weddingPreferenceInterpreterState";
import type { WeddingPreferenceSignalReason } from "@/lib/weddingPreferenceSignalState";
import { weddingVendorCardWithCurrentPhoto } from "@/lib/weddingVendorCardMediaState";
import {
  loadWeddingDecisionSelections,
  toggleWeddingDecisionSelectionValue,
} from "@/lib/weddingDecisionSelectionState";
import {
  weddingPlanningNeedLabel,
  weddingVendorSearchBlockedCopy,
  weddingVendorSearchNoticeCopy,
} from "@/lib/weddingHomeUiCopyState";
import {
  findWeddingVendorLifecycle,
  projectWeddingVendorLifecycle,
  weddingVendorBookingToAfpSendInput,
  weddingVendorLifecycleMatches,
  type WeddingVendorLifecycleFilter,
  type WeddingVendorLifecycleRecord,
} from "@/lib/weddingVendorLifecycleState";

type VendorSearchAction = NonNullable<WeddingResponseWorkspaceViewProps["vendorSearchResultAction"]>;
type VendorOutreachOwner = ReturnType<typeof useWeddingVendorOutreachOwner>;

const SEARCH_PROGRESS_LABELS = [
  "Checking what matters most to you…",
  "Looking for nearby vendors…",
  "Finding your strongest matches…",
] as const;

const VENDOR_CATEGORY_CHIPS: ReadonlyArray<{ label: string; query: string; icon: WeddingDashboardIconId }> = [
  { label: "Venues", query: "wedding venues", icon: "calendar-days" },
  { label: "Photographers", query: "wedding photographers", icon: "search" },
  { label: "Bands & DJs", query: "wedding bands and DJs", icon: "users" },
  { label: "Florists", query: "wedding florists", icon: "shield-check" },
  { label: "Planners", query: "wedding planners", icon: "check-circle" },
  { label: "Celebrants", query: "authorised wedding celebrants", icon: "user-plus" },
  { label: "Cake", query: "wedding cakes", icon: "clock" },
];

// Keep typing local to the field. Updating the persisted wedding query on each
// keystroke rebuilds the home surface and can move the viewport under the user.
function VendorSearchDraftInput(props: {
  workspace: WeddingResponseWorkspaceViewProps;
  placeholder: string;
  class: string;
  name?: string;
}) {
  const workspace = () => props.workspace;
  const [draft, setDraft] = createSignal(workspace().vendorSearchQuery ?? "");
  let lastExternalValue = workspace().vendorSearchQuery ?? "";

  createEffect(() => {
    const externalValue = workspace().vendorSearchQuery ?? "";
    if (externalValue === lastExternalValue) return;
    lastExternalValue = externalValue;
    setDraft(externalValue);
  });

  function commit() {
    const value = draft();
    if (value === lastExternalValue) return;
    lastExternalValue = value;
    workspace().onVendorSearchQueryChange?.(value);
  }

  function selectQuery(event: { currentTarget: HTMLInputElement }) {
    // A named vendor lookup is commonly an edit of the last search. Selecting
    // it on focus makes that edit reliable on both touch and pointer devices.
    event.currentTarget.select();
  }

  return (
    <input
      type="text"
      name={props.name}
      value={draft()}
      onInput={(event) => setDraft(event.currentTarget.value)}
      onFocus={selectQuery}
      onPointerUp={(event) => {
        // Some mobile browsers place the caret after focus. Re-select on the
        // completing pointer event so a tap consistently selects the query.
        event.preventDefault();
        selectQuery(event);
      }}
      onKeyDown={(event) => {
        // Keep Enter inside this form. The mobile magic-pointer layer treats
        // its own action controls as navigation targets, so letting an Enter
        // bubble there could replace the vendor search with the home surface.
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.form?.requestSubmit();
      }}
      onBlur={commit}
      placeholder={props.placeholder}
      class={props.class}
    />
  );
}

export function WeddingPlanningBasicsSection(props: { workspace: WeddingResponseWorkspaceViewProps }) {
  const workspace = () => props.workspace;
  return (
    <div class="rounded-xl border border-wedding-border bg-wedding-card p-3 shadow-wedding-card">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-wedding-ink">Add a few wedding details</p>
          <p class="mt-1 break-words text-xs leading-5 text-wedding-ink/70">
            This helps us find vendors that fit your plans.
          </p>
        </div>
        <span class="rounded-lg bg-wedding-status-progress-bg px-2 py-1 text-xs font-semibold text-wedding-status-progress-ink">
          A few details
        </span>
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-2">
        <Show when={workspace().vendorSearchReadiness?.status === "blocked"}>
          <div class="rounded-lg border border-wedding-border bg-wedding-page p-3">
            <p class="text-xs font-semibold uppercase text-wedding-primary">Better matches</p>
            <p class="mt-1 break-words text-sm leading-6 text-wedding-ink">
              Add {workspace().vendorSearchReadiness?.missing.map(weddingPlanningNeedLabel).join(" and ")}.
            </p>
            <Show when={workspace().vendorSearchReadiness?.missing.some((item) => /priorities|fit preferences/i.test(item))}>
              <label class="mt-3 block text-xs font-semibold text-wedding-ink">
                Vendor fit preferences
                <VendorSearchDraftInput
                  workspace={workspace()}
                  placeholder="beachfront venue in Sydney with Gothic style for 60 guests"
                  class="mt-1 w-full rounded-lg border border-wedding-border bg-white px-3 py-2 text-sm font-normal text-wedding-ink outline-none transition placeholder:text-wedding-ink/40 focus:border-wedding-primary focus:ring-2 focus:ring-wedding-primary/15"
                />
              </label>
              <p class="mt-2 break-words text-[11px] leading-5 text-wedding-ink/70">
                A specific request here can unblock vendor fit preferences for live search.
              </p>
            </Show>
          </div>
        </Show>
      </div>
      <PlanningConstraintCaptureCard workspace={workspace()} />
    </div>
  );
}

export function WeddingVendorSearchHomeSection(props: {
  workspace: WeddingResponseWorkspaceViewProps;
  result: {
    action: VendorSearchAction;
    preview: WeddingWorkspaceArtifactPreview | null;
    sourcePreview: WeddingWorkspaceArtifactPreview | null;
  } | null;
  outreach: VendorOutreachOwner;
  onDismiss: (artifactId: string) => void;
  onVendorChoiceSelected?: (input: WeddingVendorChoiceSelectionSaveInput) => void;
  preferenceProfile?: WeddingPreferenceProfile | null;
  preferenceSaving?: boolean;
  onPreferenceChange?: (change: WeddingPreferenceChipChange) => void;
  onPreferenceConfirm?: () => void;
  hiddenVendorIds?: readonly string[];
  onNotForUs?: (card: WeddingVendorChoiceCardData, artifactId: string, reason: WeddingPreferenceSignalReason) => Promise<boolean>;
  onRestoreVendor?: (card: WeddingVendorChoiceCardData, artifactId: string) => Promise<boolean>;
  feedbackConfirmationPrompt?: string | null;
  feedbackConfirmationActionLabel?: string;
  feedbackNotice?: string | null;
  onConfirmFeedbackSuggestion?: () => void;
  onDismissFeedbackSuggestion?: () => void;
  stayOnHome?: boolean;
}) {
  const workspace = () => props.workspace;
  const [fullResultExpanded, setFullResultExpanded] = createSignal(false);
  const [searchProgressIndex, setSearchProgressIndex] = createSignal(0);
  const [selectedChoiceIds, setSelectedChoiceIds] = createSignal<string[]>([]);
  const [lifecycleFilter, setLifecycleFilter] = createSignal<WeddingVendorLifecycleFilter>("all");
  const [bookingVendor, setBookingVendor] = createSignal<WeddingVendorLifecycleRecord | null>(null);
  const [bookingBusy, setBookingBusy] = createSignal(false);
  const lifecycleRecords = createMemo(() => projectWeddingVendorLifecycle(workspace().state.afpMessages));
  const lifecycleFilters: ReadonlyArray<{ id: WeddingVendorLifecycleFilter; label: string }> = [
    { id: "enquired", label: "Enquired" }, { id: "favourited", label: "Favourited" },
    { id: "quote_received", label: "Quote received" }, { id: "booked", label: "Booked" },
  ];
  let previousResultArtifactId: string | null = null;
  createEffect(() => {
    const artifactId = props.result?.action.artifactId ?? null;
    if (artifactId !== previousResultArtifactId) setFullResultExpanded(false);
    if (artifactId) setSelectedChoiceIds(loadWeddingDecisionSelections(artifactId));
    else setSelectedChoiceIds([]);
    previousResultArtifactId = artifactId;
  });
  function selectedForFollowUp(artifact: WeddingWorkspaceArtifactPreview, choiceId: string): boolean {
    return artifact.persistedSelectedVendorChoices.some((choice) => choice.optionId === choiceId)
      || selectedChoiceIds().includes(choiceId);
  }
  function toggleFollowUp(artifact: WeddingWorkspaceArtifactPreview, card: WeddingVendorChoiceCardData): void {
    const selected = !selectedForFollowUp(artifact, card.choiceId);
    setSelectedChoiceIds(toggleWeddingDecisionSelectionValue(artifact.artifactId, card.choiceId));
    props.onVendorChoiceSelected?.({
      artifact,
      optionId: card.choiceId,
      optionLabel: card.title,
      contact: card,
      selected,
    });
  }
  const cardVendorKey = (card: WeddingVendorChoiceCardData) => card.vendorId?.trim() || card.choiceId;
  const visibleCards = (artifact: WeddingWorkspaceArtifactPreview) => artifact.vendorComparisonCards
    .filter((card) => !props.hiddenVendorIds?.includes(cardVendorKey(card)))
    .filter((card) => lifecycleFilter() === "all" || weddingVendorLifecycleMatches(findWeddingVendorLifecycle({ records: lifecycleRecords(), vendorId: card.vendorId, vendorName: card.title }) ?? { key: "", vendorId: card.vendorId ?? null, vendorName: card.title, enquired: false, favourited: selectedForFollowUp(artifact, card.choiceId), quoteReceived: false, booked: false, reminderAt: null, followUpDismissed: false, followUpDismissedAt: null, sourceMessageIds: [] }, lifecycleFilter()))
    .map((card) => weddingVendorCardWithCurrentPhoto(card, workspace().weddingVendorDirectory));
  const hiddenCards = (artifact: WeddingWorkspaceArtifactPreview) => artifact.vendorComparisonCards
    .filter((card) => props.hiddenVendorIds?.includes(cardVendorKey(card)));
  const searchDisabled = () => workspace().vendorSearchRunning
    || !workspace().onRunLiveVendorSearch;
  const visibleVendorSearchNotice = () => {
    return weddingVendorSearchNoticeCopy(workspace().vendorSearchNotice);
  };
  const visibleBlockedReason = () => weddingVendorSearchBlockedCopy(workspace().vendorSearchBlockedReason);
  function runSearch(): void {
    if (props.stayOnHome) workspace().onRunLiveVendorSearch?.({ stayOnHome: true });
    else workspace().onRunLiveVendorSearch?.();
  }
  function runCategorySearch(query: string): void {
    if (searchDisabled()) return;
    workspace().onVendorSearchQueryChange?.(query);
    queueMicrotask(runSearch);
  }
  const isSelectedCategory = (query: string) => workspace().vendorSearchQuery?.trim().toLowerCase() === query.toLowerCase();
  const lifecycleCount = (filter: WeddingVendorLifecycleFilter) => lifecycleRecords().filter((record) => weddingVendorLifecycleMatches(record, filter)).length;
  const filteredLifecycleRecords = () => lifecycleRecords().filter((record) => weddingVendorLifecycleMatches(record, lifecycleFilter()));
  async function confirmBooking(): Promise<void> {
    const vendor = bookingVendor();
    const saveProjection = workspace().saveProjection;
    if (!vendor || !saveProjection) return;
    setBookingBusy(true);
    try {
      await saveProjection(weddingVendorBookingToAfpSendInput({ metadata: workspace().state.workspace.metadata, vendorId: vendor.vendorId, vendorName: vendor.vendorName }));
      setBookingVendor(null);
      workspace().onRefreshWorkspace?.();
    } finally { setBookingBusy(false); }
  }
  createEffect(() => {
    if (!workspace().vendorSearchRunning) {
      setSearchProgressIndex(0);
      return;
    }
    setSearchProgressIndex(0);
    const timer = window.setInterval(() => {
      setSearchProgressIndex((index) => (index + 1) % SEARCH_PROGRESS_LABELS.length);
    }, 1600);
    onCleanup(() => window.clearInterval(timer));
  });
  return (
    <div data-wedding-surface="vendor-search" class="min-w-0 rounded-xl border border-wedding-border bg-wedding-card px-4 py-5 shadow-wedding-card sm:px-5 sm:py-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const input = event.currentTarget.elements.namedItem("wedding-vendor-search-query");
          if (input instanceof HTMLInputElement) {
            workspace().onVendorSearchQueryChange?.(input.value);
          }
          if (!searchDisabled()) {
            // The draft input commits to workspace state first. Defer the run
            // so the search always sees the text visible in the field.
            queueMicrotask(runSearch);
          }
        }}
      >
      <div class="min-w-0">
        <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <p class="font-display text-[22px] font-semibold leading-7 tracking-[-.01em] text-wedding-ink">Find vendors</p>
          <div class="flex max-w-full gap-1 overflow-x-auto pb-1 text-xs" aria-label="Show vendors by wedding status">
            <For each={lifecycleFilters}>{(filter) => <button type="button" class={`min-h-9 shrink-0 rounded-full border px-2.5 font-semibold ${lifecycleFilter() === filter.id ? "border-wedding-primary bg-wedding-page text-wedding-primary" : "border-wedding-border bg-white text-wedding-ink/65"}`} aria-pressed={lifecycleFilter() === filter.id} onClick={() => setLifecycleFilter(lifecycleFilter() === filter.id ? "all" : filter.id)}>{filter.label}{lifecycleCount(filter.id) ? ` ${lifecycleCount(filter.id)}` : ""}</button>}</For>
          </div>
      </div>
      <label class="relative mt-4 block">
        <span class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-wedding-ink/65" aria-hidden="true"><WeddingDashboardIcon id="search" class="h-5 w-5" /></span>
        <VendorSearchDraftInput
          workspace={workspace()}
          name="wedding-vendor-search-query"
          placeholder="Search photographers, venues, bands…"
          class="h-14 w-full rounded-lg border border-wedding-border bg-wedding-page py-2 pl-12 pr-24 text-base text-wedding-ink outline-none transition duration-150 placeholder:text-wedding-ink/55 focus:border-wedding-primary focus:ring-4 focus:ring-wedding-primary/15"
        />
        <button
          type="submit"
          class="absolute right-1.5 top-1.5 flex h-11 min-w-11 items-center justify-center rounded-lg bg-wedding-primary px-3 text-wedding-page transition hover:bg-wedding-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={workspace().vendorSearchRunning ? "Searching for vendors" : "Search vendors"}
          disabled={searchDisabled()}
        >
          <WeddingDashboardIcon id={workspace().vendorSearchRunning ? "clock" : "arrow-right"} class="h-5 w-5" />
        </button>
      </label>
      </div>
      </form>
      <div class="-mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Popular vendor types">
        <For each={VENDOR_CATEGORY_CHIPS}>{(chip) => (
          <button
            type="button"
            class={`inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition duration-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary focus-visible:ring-offset-2 disabled:opacity-45 ${isSelectedCategory(chip.query) ? "border-wedding-primary bg-wedding-primary text-wedding-page" : "border-wedding-border bg-white text-wedding-ink hover:border-wedding-primary hover:text-wedding-primary"}`}
            disabled={searchDisabled()}
            aria-pressed={isSelectedCategory(chip.query)}
            onClick={() => runCategorySearch(chip.query)}
          >
            <WeddingDashboardIcon id={chip.icon} class="h-4 w-4" />{chip.label}
          </button>
        )}</For>
      </div>
      <Show when={!props.result && !workspace().vendorSearchRunning}>
        <p class="mt-2 text-[13px] leading-[18px] text-wedding-ink/70">Real vendors near you. We show where each result came from.</p>
      </Show>
      <Show when={lifecycleFilter() !== "all"}>
        <div class="mt-3 grid gap-2" aria-live="polite">
          <Show when={filteredLifecycleRecords().length > 0} fallback={<p class="rounded-lg border border-wedding-border bg-white p-3 text-sm text-wedding-ink/70">No vendors have this status yet.</p>}>
            <For each={filteredLifecycleRecords()}>{(vendor) => <article class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-wedding-border bg-white p-3">
              <div><p class="font-semibold text-wedding-ink">{vendor.vendorName}</p><p class="text-xs text-wedding-ink/65">{[vendor.enquired && "Enquired", vendor.favourited && "Favourited", vendor.quoteReceived && "Quote received", vendor.booked && "Booked"].filter(Boolean).join(" · ")}</p></div>
              <Show when={vendor.quoteReceived && !vendor.booked}><button type="button" class="min-h-11 rounded-lg bg-wedding-primary px-3 text-sm font-bold text-white" onClick={() => setBookingVendor(vendor)}>Book</button></Show>
            </article>}</For>
          </Show>
        </div>
      </Show>
      <Show
        when={workspace().vendorSearchRunning}
        fallback={<Show when={visibleVendorSearchNotice()}>{(notice) => <p class="mt-4 break-words text-xs leading-5 text-wedding-ink/70">{notice()}</p>}</Show>}
      >
        <p class="mt-4 break-words text-xs font-medium leading-5 text-wedding-ink/70" role="status" aria-live="polite">
          {SEARCH_PROGRESS_LABELS[searchProgressIndex()]}
        </p>
      </Show>
      <Show when={props.feedbackNotice}>
        <p class="mt-3 rounded-lg border border-wedding-border bg-wedding-slate px-3 py-2 text-xs text-wedding-ink" role="status">{props.feedbackNotice}</p>
      </Show>
      <Show when={props.feedbackConfirmationPrompt}>
        <section class="mt-3 rounded-lg border border-wedding-border bg-white px-3 py-3" aria-label="Confirm a preference suggestion">
          <p class="text-sm font-semibold text-wedding-ink">{props.feedbackConfirmationPrompt}</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button type="button" class="min-h-11 rounded-lg bg-wedding-primary px-3 text-xs font-bold text-wedding-page" onClick={() => props.onConfirmFeedbackSuggestion?.()}>{props.feedbackConfirmationActionLabel ?? "Make it a must-have"}</button>
            <button type="button" class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-xs font-semibold text-wedding-secondary" onClick={() => props.onDismissFeedbackSuggestion?.()}>Keep it as is</button>
          </div>
        </section>
      </Show>
      <Show when={!props.result && workspace().vendorSearchResultAction}>
        <button type="button" class="mt-3 min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-xs font-bold text-wedding-secondary" onClick={() => props.onDismiss("")}>
          Show comparison
        </button>
      </Show>
      <Show when={props.result}>
        {(result) => (
          <div class="mt-5 border-t border-wedding-border pt-4">
            <div class="mb-3">
              <WeddingDealBreakerEditor
                messages={workspace().state.afpMessages}
                metadata={workspace().state.workspace.metadata}
                saveProjection={workspace().saveProjection}
                onRefreshWorkspace={workspace().onRefreshWorkspace}
                surface="enquiry"
                promptWhenEmpty
                compact
                hideWhenPopulated
              />
            </div>
            <Show when={props.preferenceProfile && props.onPreferenceChange && props.onPreferenceConfirm}>
              <div class="mb-3"><WeddingPreferenceConfirmationChips profile={props.preferenceProfile ?? null} saving={props.preferenceSaving} onChange={(change) => props.onPreferenceChange?.(change)} onConfirm={() => props.onPreferenceConfirm?.()} /></div>
            </Show>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="break-words text-base font-semibold text-wedding-ink">Top picks from your search</p>
                <p class="mt-1 break-words text-sm leading-5 text-wedding-ink/70">Compare the strongest matches, then save any you want to contact.</p>
              </div>
            </div>
            <Show when={result().preview}>
              {(preview) => (
                <>
                  {(() => {
                    // A search source packet is valid without a comparison
                    // shortlist. Older locally cached packets may omit this
                    // optional display list entirely, so normalise it before
                    // rendering rather than allowing it to take down Planner.
                    const comparisonPreview = () => Array.isArray(preview().vendorComparisonCards)
                      ? preview()
                      : { ...preview(), vendorComparisonCards: [] };
                    return <>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <For each={[comparisonPreview().category, comparisonPreview().evidenceSummary.sourceCountLabel].filter(Boolean)}>
                      {(label) => <span class="rounded-lg border border-wedding-border bg-white px-3 py-1.5 text-xs font-medium text-wedding-ink/70">{label}</span>}
                    </For>
                  </div>
                  <Show when={comparisonPreview().vendorComparisonCards.length > 0}>
                    <DecisionCard
                      card={decisionCardFromWeddingVendorComparison(comparisonPreview())}
                      mode="standard"
                      showActions={false}
                      class="mt-3 shadow-none"
                      hero={(
                        <div class="grid gap-2 lg:grid-cols-3">
                          <For each={visibleCards(comparisonPreview()).slice(0, 3)}>
                            {(vendor) => (
                              <WeddingVendorChoiceCard
                                card={vendor}
                                selectedForFollowUp={selectedForFollowUp(preview(), vendor.choiceId)}
                                onToggleFollowUp={(card) => toggleFollowUp(preview(), card)}
                                outreachFlow={props.outreach.flows()[vendor.choiceId] ?? null}
                                gmailConnected={Boolean(workspace().gmailStatus?.connected)}
                                onContactVendor={(card, intent) => void props.outreach.onContactVendor(card, result().action.artifactId, intent)}
                                onOutreachBodyChange={props.outreach.onOutreachBodyChange}
                                onOutreachRecipientChange={props.outreach.onOutreachRecipientChange}
                                onOutreachAttachmentsChange={props.outreach.onOutreachAttachmentsChange}
                                onOutreachPermissionsChange={props.outreach.onOutreachPermissionsChange}
                                onSendOutreach={(choiceId) => void props.outreach.onSendOutreach(choiceId)}
                                onCancelOutreach={props.outreach.onCancelOutreach}
                                onRetryOutreach={props.outreach.onRetryOutreach}
                                onConnectGmailForOutreach={() => void props.outreach.onConnectGmailForOutreach()}
                                onNotForUs={(card, reason) => props.onNotForUs?.(card, preview().artifactId, reason) ?? false}
                              />
                            )}
                          </For>
                        </div>
                      )}
                    />
                  </Show>
                  <Show when={hiddenCards(comparisonPreview()).length > 0}>
                    <section class="mt-3 rounded-xl border border-wedding-border bg-white p-3" aria-label="Hidden vendors">
                      <p class="text-sm font-semibold text-wedding-primary">Hidden vendors</p>
                      <For each={hiddenCards(comparisonPreview())}>{(card) => (
                        <div class="mt-2 flex items-center justify-between gap-2">
                          <span class="min-w-0 break-words text-xs text-wedding-ink">{card.title}</span>
                          <button type="button" class="min-h-11 shrink-0 rounded-lg border border-wedding-secondary bg-white px-3 text-xs font-semibold text-wedding-secondary" onClick={() => void props.onRestoreVendor?.(card, preview().artifactId)}>Restore</button>
                        </div>
                      )}</For>
                    </section>
                  </Show>
                    </>;
                  })()}
                </>
              )}
            </Show>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-wedding-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary focus-visible:ring-offset-2"
                aria-expanded={fullResultExpanded()}
                aria-controls="wedding-vendor-search-full-result"
                onClick={() => setFullResultExpanded((expanded) => !expanded)}
                data-magic-action="open"
                data-magic-icon="file"
                data-magic-label={result().action.label}
                data-magic-id="wedding:vendor-search:open-result"
              >
                {fullResultExpanded() ? "Hide all results" : "See all results"}<WeddingDashboardIcon id="arrow-right" class={`h-4 w-4 transition-transform ${fullResultExpanded() ? "rotate-90" : ""}`} />
              </button>
            </div>
            <Show when={fullResultExpanded()}>
              <section
                id="wedding-vendor-search-full-result"
                class="mt-3 rounded-xl border border-wedding-border bg-white p-3"
                aria-label="Full vendor search result"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-semibold text-wedding-primary">
                    {result().sourcePreview?.title ?? "Vendor search notes"}
                  </p>
                  <button
                    type="button"
                    class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-xs font-semibold text-wedding-secondary"
                    onClick={() => setFullResultExpanded(false)}
                  >
                    Close
                  </button>
                </div>
                <Show
                  when={result().sourcePreview?.bodyText}
                  fallback={<p class="mt-3 text-xs leading-5 text-wedding-ink/70">The saved search text is not available yet.</p>}
                >
                  {(body) => (
                    <div
                      class="md-prose mt-3 max-h-[22rem] overflow-auto rounded-lg bg-wedding-slate p-3 text-xs leading-5 text-wedding-ink"
                      innerHTML={renderMarkdown(body())}
                    />
                  )}
                </Show>
              </section>
            </Show>
          </div>
        )}
      </Show>
      <Show when={visibleBlockedReason()}>
        {(reason) => <p class="mt-2 break-words text-xs leading-5 text-wedding-ink/70">{reason()}</p>}
      </Show>
      <WeddingConfirmDialog open={Boolean(bookingVendor())} title={`Book ${bookingVendor()?.vendorName ?? "this vendor"}?`} detail="This records your booking decision in the wedding ledger. It does not sign a contract, pay a deposit, or send a message." confirmLabel="Confirm booking" busy={bookingBusy()} onCancel={() => setBookingVendor(null)} onConfirm={() => void confirmBooking()} />
    </div>
  );
}
