// @locs-version: 1.0
import { createEffect, createMemo, createResource, createSignal, ErrorBoundary, For, onCleanup, Show } from "solid-js";

import { DecisionCard } from "@/components/DecisionCard";
import { WeddingDashboardIcon, type WeddingDashboardIconId } from "@/components/WeddingDashboardIcons";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { WeddingVendorChoiceCard } from "@/components/WeddingVendorChoiceCard";
import { WeddingVendorLifecycleDetailPanel } from "@/components/WeddingVendorLifecycleDetailPanel";
import { WeddingPreferenceConfirmationChips } from "@/components/WeddingPreferenceConfirmationChips";
import { WeddingDealBreakerEditor } from "@/components/WeddingDealBreakerEditor";
import { WeddingInviteProposalsPanel } from "@/components/WeddingInviteProposalsPanel";
import { WeddingLimitedSpecialsMap } from "@/components/WeddingLimitedSpecialsMap";
import type { WeddingVendor } from "@/lib/api";
import { loadWeddingProposalOpportunities } from "@/lib/weddingInviteProposalOpportunityApi";
import type { WeddingVendorRankedSpecialDetail, WeddingVendorSpecialMarker } from "@/lib/weddingVendorSpecialDiscoveryApi";
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import { decisionCardFromWeddingVendorComparison } from "@/lib/decisionCardState";
import type { useWeddingVendorOutreachOwner } from "@/lib/useWeddingVendorOutreachOwner";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingVendorChoiceSelectionSaveInput } from "@/components/WeddingArtifactDetailPanel";
import type { WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import type { WeddingPreferenceChipChange } from "@/lib/weddingPreferenceInterpreterState";
import type { WeddingPreferenceSignalReason } from "@/lib/weddingPreferenceSignalState";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { weddingVendorCardWithCurrentPhoto } from "@/lib/weddingVendorCardMediaState";
import {
  loadWeddingDecisionSelections,
  toggleWeddingDecisionSelectionValue,
} from "@/lib/weddingDecisionSelectionState";
import { weddingVendorSearchBlockedCopy, weddingVendorSearchNoticeCopy } from "@/lib/weddingHomeUiCopyState";
import {
  findWeddingVendorLifecycle,
  mergeWeddingVendorLifecycleCandidates,
  projectWeddingVendorLifecycle,
  weddingVendorLifecycleMatches,
  type WeddingVendorLifecycleFilter,
  type WeddingVendorLifecycleRecord,
} from "@/lib/weddingVendorLifecycleState";
import {
  projectWeddingVendorShortlistPreferences,
  weddingVendorShortlistPreferenceToAfpSendInput,
  type WeddingVendorShortlistPreference,
} from "@/lib/weddingVendorShortlistPreferenceState";
import { weddingVendorRankingCardFieldsFromRecord } from "@/lib/weddingVendorRankingState";

type VendorSearchAction = NonNullable<WeddingResponseWorkspaceViewProps["vendorSearchResultAction"]>;
type VendorOutreachOwner = ReturnType<typeof useWeddingVendorOutreachOwner>;

const SEARCH_PROGRESS_LABELS = [
  "Checking what matters most to you…",
  "Looking for nearby vendors…",
  "Finding your strongest matches…",
] as const;

const CORE_VENDOR_CATEGORY_CHIPS: ReadonlyArray<{ label: string; query: string; icon: WeddingDashboardIconId }> = [
  { label: "Venues", query: "venue", icon: "venue" },
  { label: "Planners", query: "planner", icon: "planner" },
  { label: "Photographers", query: "photographer", icon: "camera" },
  { label: "Celebrants", query: "celebrant", icon: "celebrant" },
];
const MORE_VENDOR_CATEGORY_CHIPS: ReadonlyArray<{ label: string; query: string; icon: WeddingDashboardIconId }> = [
  { label: "Bands & DJs", query: "band", icon: "music" },
  { label: "Florists", query: "floral_designer", icon: "flower" },
  { label: "Cake", query: "cake_baker", icon: "cake" },
  { label: "Videographers", query: "videographer", icon: "video" },
  { label: "Caterers", query: "caterer", icon: "catering" },
  { label: "Musicians", query: "musician", icon: "music" },
  { label: "Hair & Makeup", query: "hair_stylist", icon: "beauty" },
  { label: "Styling & Decor", query: "stylist", icon: "decor" },
  { label: "Transport", query: "transport", icon: "transport" },
  { label: "Stationery", query: "stationery", icon: "stationery" },
  { label: "Jewellers", query: "jeweller", icon: "jewellery" },
];
const VENDOR_CATEGORY_CHIPS = [...CORE_VENDOR_CATEGORY_CHIPS, ...MORE_VENDOR_CATEGORY_CHIPS] as const;

function limitedSpecialOutreachCard(input: {
  vendorId: string;
  vendorName: string;
  category: string;
  date: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
}, vendor: WeddingVendor | null): WeddingVendorChoiceCardData {
  return {
    choiceId: `limited-specials:${input.vendorId}:${input.date}`,
    rank: 0,
    comparisonCount: 1,
    title: input.vendorName,
    category: input.category,
    imageUrl: vendor?.photos[0]?.photoUrl ?? input.imageUrl ?? null,
    imageAlt: vendor?.photos[0]?.altText ?? input.imageAlt ?? null,
    scoreLabel: "",
    provider: vendor?.sourceLabel ?? "Wedding vendor directory",
    sourceUrl: vendor?.sourceUrl ?? null,
    websiteUrl: vendor?.websiteUrl ?? null,
    mapUrl: null,
    instagramUrl: null,
    email: vendor?.contactEmail ?? null,
    phone: vendor?.contactPhone ?? null,
    address: vendor?.address ?? null,
    rationaleLabels: [`Date enquiry for ${input.date}`],
    preferenceMatch: "",
    situationFit: "Date availability still needs vendor confirmation.",
    verificationLabel: "Availability not yet confirmed",
    checkedFactsCount: 0,
    anchorRows: [],
    verifyQuestions: ["Could you confirm availability and the current terms for this date?"],
    ...weddingVendorRankingCardFieldsFromRecord({ vendor_id: input.vendorId }),
  };
}

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

  return (
    <input
      type="text"
      name={props.name}
      value={draft()}
      onInput={(event) => setDraft(event.currentTarget.value)}
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
  onAcceptQuote?: (quote: WeddingArtifactQuotePreview, sourceId: string) => void;
}) {
  const workspace = () => props.workspace;
  const [fullResultExpanded, setFullResultExpanded] = createSignal(false);
  const [searchProgressIndex, setSearchProgressIndex] = createSignal(0);
  const [selectedChoiceIds, setSelectedChoiceIds] = createSignal<string[]>([]);
  type VendorHomeFilter = WeddingVendorLifecycleFilter | "proposals";
  const [lifecycleFilter, setLifecycleFilter] = createSignal<VendorHomeFilter>("all");
  const [proposalOpportunities] = createResource(loadWeddingProposalOpportunities);
  const [expandedLifecycleVendorKey, setExpandedLifecycleVendorKey] = createSignal<string | null>(null);
  const [selectedVendorCategory, setSelectedVendorCategory] = createSignal<string | null>(null);
  const [vendorMode, setVendorMode] = createSignal<"find" | "invite" | "specials">("find");
  const [allMobileCategories, setAllMobileCategories] = createSignal(false);
  const [allDesktopCategories, setAllDesktopCategories] = createSignal(false);
  const [directSpecialEnquiryCard, setDirectSpecialEnquiryCard] = createSignal<WeddingVendorChoiceCardData | null>(null);
  let comparisonResultElement: HTMLDivElement | undefined;
  let directSpecialEnquiryElement: HTMLDivElement | undefined;
  const lifecycleRecords = createMemo(() => {
    const comparison = props.result?.preview ?? props.result?.sourcePreview;
    const candidates = comparison?.vendorComparisonCards.map((card) => ({
      vendorId: card.vendorId,
      vendorName: card.title,
      favourited: selectedForFollowUp(comparison, card.choiceId),
    })) ?? [];
    return mergeWeddingVendorLifecycleCandidates(projectWeddingVendorLifecycle(workspace().state.afpMessages), candidates);
  });
  const shortlistPreferences = createMemo(() => projectWeddingVendorShortlistPreferences(workspace().state.afpMessages));
  const lifecycleFilters: ReadonlyArray<{ id: VendorHomeFilter; label: string; dotClass: string }> = [
    { id: "enquired", label: "Enquired", dotClass: "bg-sky-500" },
    { id: "proposals", label: "Proposals", dotClass: "bg-violet-500" },
    { id: "favourited", label: "Favourited", dotClass: "bg-rose-500" },
    { id: "quote_received", label: "Quote received", dotClass: "bg-amber-500" },
    { id: "booked", label: "Booked", dotClass: "bg-emerald-600" },
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
    .filter((card) => lifecycleFilter() === "all" || lifecycleFilter() === "proposals" || weddingVendorLifecycleMatches(findWeddingVendorLifecycle({ records: lifecycleRecords(), vendorId: card.vendorId, vendorName: card.title }) ?? { key: "", vendorId: card.vendorId ?? null, vendorName: card.title, enquired: false, favourited: selectedForFollowUp(artifact, card.choiceId), quoteReceived: false, quoteAccepted: false, booked: false, reminderAt: null, followUpDismissed: false, followUpDismissedAt: null, sourceMessageIds: [] }, lifecycleFilter() as WeddingVendorLifecycleFilter))
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
    const category = selectedVendorCategory() ?? undefined;
    if (props.stayOnHome) workspace().onRunLiveVendorSearch?.({ stayOnHome: true, category });
    else workspace().onRunLiveVendorSearch?.({ category });
  }
  function runCategorySearch(event: MouseEvent, query: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (searchDisabled()) return;
    setSelectedVendorCategory(query);
    const options = { stayOnHome: props.stayOnHome || undefined, category: query };
    workspace().onRunLiveVendorSearch?.(options);
  }
  const isSelectedCategory = (query: string) => selectedVendorCategory()?.toLowerCase() === query.toLowerCase();
  const lifecycleCount = (filter: VendorHomeFilter) => filter === "proposals"
    ? (proposalOpportunities()?.reduce((sum, item) => sum + item.responseCount, 0) ?? 0)
    : lifecycleRecords().filter((record) => weddingVendorLifecycleMatches(record, filter)).length;
  const visibleLifecycleFilters = createMemo(() => lifecycleFilters.filter((filter) => lifecycleCount(filter.id) > 0));
  const filteredLifecycleRecords = () => lifecycleFilter() === "proposals"
    ? []
    : lifecycleRecords().filter((record) => weddingVendorLifecycleMatches(record, lifecycleFilter() as WeddingVendorLifecycleFilter));
  const vendorKey = (value: unknown) => typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : "";
  const lifecycleArtifact = (vendor: WeddingVendorLifecycleRecord) => {
    const key = vendorKey(vendor.vendorName);
    return [...workspace().state.artifactPreviews]
      .map((artifact) => {
        const cardMatch = artifact.vendorComparisonCards.some((card) => (
          (vendor.vendorId && card.vendorId === vendor.vendorId) || vendorKey(card.title) === key
        ));
        const quoteMatch = artifact.preview?.kind === "quote" && vendorKey(artifact.preview.vendorName) === key;
        const sourceMatch = vendor.sourceMessageIds.includes(artifact.artifactId);
        const textMatch = key.length >= 4 && vendorKey(`${artifact.title} ${artifact.bodyText ?? ""}`).includes(key);
        return { artifact, score: quoteMatch && vendor.quoteReceived ? 5 : cardMatch ? 4 : quoteMatch ? 3 : sourceMatch ? 2 : textMatch ? 1 : 0 };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.artifact.createdAt - left.artifact.createdAt)[0]?.artifact ?? null;
  };
  const lifecycleArtifacts = (vendor: WeddingVendorLifecycleRecord) => {
    const key = vendorKey(vendor.vendorName);
    return [...workspace().state.artifactPreviews]
      .filter((artifact) => artifact.vendorComparisonCards.some((card) => (
        (vendor.vendorId && card.vendorId === vendor.vendorId) || vendorKey(card.title) === key
      )) || (artifact.preview?.kind === "quote" && vendorKey(artifact.preview.vendorName) === key)
        || (key.length >= 4 && vendorKey(`${artifact.title} ${artifact.bodyText ?? ""}`).includes(key)))
      .sort((left, right) => right.createdAt - left.createdAt);
  };
  const directoryVendor = (vendor: WeddingVendorLifecycleRecord) => workspace().weddingVendorDirectory?.find((item) => (
    (vendor.vendorId && item.vendorId === vendor.vendorId) || vendorKey(item.vendorName) === vendorKey(vendor.vendorName)
  )) ?? null;
  const lifecycleMessages = (vendor: WeddingVendorLifecycleRecord) => workspace().state.afpMessages
    .filter((message) => vendor.sourceMessageIds.includes(message.id))
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
  const lifecycleMessageLabel = (message: (typeof workspace extends never ? never : ReturnType<typeof workspace>["state"]["afpMessages"][number])) => {
    const label = [message.subtype, message.kind, message.type].find((value) => typeof value === "string" && value.trim());
    return (label ?? "Vendor update").replace(/^wedding_vendor_/, "").replace(/_/g, " ");
  };
  const toggleLifecycleVendor = (vendor: WeddingVendorLifecycleRecord) => {
    const opening = expandedLifecycleVendorKey() !== vendor.key;
    setExpandedLifecycleVendorKey(opening ? vendor.key : null);
  };
  const lifecycleImage = (vendor: WeddingVendorLifecycleRecord) => {
    const directoryPhoto = directoryVendor(vendor)?.photos[0];
    if (directoryPhoto?.photoUrl) return { url: directoryPhoto.photoUrl, alt: directoryPhoto.altText };
    const key = vendorKey(vendor.vendorName);
    for (const artifact of lifecycleArtifacts(vendor)) {
      const card = artifact.vendorComparisonCards.find((item) => (
        (vendor.vendorId && item.vendorId === vendor.vendorId) || vendorKey(item.title) === key
      ));
      if (card?.imageUrl) return { url: card.imageUrl, alt: card.imageAlt };
    }
    return { url: null, alt: null };
  };
  const weddingDateOrSeason = () => workspace().state.contextCards
    .map((card) => card.planningContext.dateOrSeason?.trim())
    .find(Boolean) ?? null;
  const weddingGuestCount = () => workspace().state.contextCards
    .map((card) => Number(card.planningContext.guestCount))
    .find((value) => Number.isFinite(value) && value > 0) ?? null;
  const prepareDateEnquiry = (input: { vendorId: string; vendorName: string; category: string; date: string; imageUrl?: string | null; imageAlt?: string | null }, detail: WeddingVendorRankedSpecialDetail | null = null) => {
    const preview = props.result?.preview ?? props.result?.sourcePreview;
    const previewCard = preview?.vendorComparisonCards.find((item) => item.vendorId === input.vendorId || vendorKey(item.title) === vendorKey(input.vendorName));
    const directoryMatch = workspace().weddingVendorDirectory?.find((item) => item.vendorId === input.vendorId || vendorKey(item.vendorName) === vendorKey(input.vendorName)) ?? null;
    const card = previewCard ?? limitedSpecialOutreachCard(input, directoryMatch);
    setDirectSpecialEnquiryCard(card);
    void props.outreach.onContactVendor(
      card,
      props.result?.action.artifactId ?? `limited-specials:${input.date}`,
      "CHECK_AVAILABILITY_AND_REQUEST_QUOTE",
      true,
      {
        offerId: detail?.offerId ?? null,
        slotId: detail?.slotId ?? null,
        slotRevision: detail?.slotRevision ?? null,
        specialDate: detail?.specialDate || input.date,
        offerTitle: detail?.title ?? null,
      },
    );
    queueMicrotask(() => directSpecialEnquiryElement?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const prepareSpecialEnquiry = (marker: WeddingVendorSpecialMarker, detail: WeddingVendorRankedSpecialDetail | null) => prepareDateEnquiry({ vendorId: marker.vendorId, vendorName: marker.vendorName, category: marker.category, date: detail?.specialDate || marker.availableOnDate, imageUrl: marker.photoUrl, imageAlt: marker.photoAlt }, detail);
  const prepareDirectoryDateEnquiry = (vendor: WeddingVendor, date: string) => prepareDateEnquiry({ vendorId: vendor.vendorId, vendorName: vendor.vendorName, category: vendor.category, date });
  async function saveSpecialPreference(marker: WeddingVendorSpecialMarker, preference: WeddingVendorShortlistPreference, reason: string | null) {
    if (!workspace().saveProjection) throw new Error("Account saving is unavailable");
    await workspace().saveProjection!(weddingVendorShortlistPreferenceToAfpSendInput({
      metadata: workspace().state.workspace.metadata,
      vendorId: marker.vendorId,
      vendorName: marker.vendorName,
      preference,
      reason,
      source: "limited_specials",
    }));
    workspace().onRefreshWorkspace?.();
  }
  const openLifecycleArtifact = (artifactId: string) => {
    workspace().onSelectArtifact?.(artifactId);
    workspace().onSelectMenu?.("documents");
  };
  const openLifecycleDocument = (vendor: WeddingVendorLifecycleRecord) => {
    const artifact = lifecycleArtifact(vendor);
    if (artifact) workspace().onSelectArtifact?.(artifact.artifactId);
    workspace().onSelectMenu?.("documents");
  };
  const quoteFlowForVendor = (vendor: WeddingVendorLifecycleRecord) => workspace().state.activeVendorQuoteReplyFlows.find((flow) =>
    flow.quote.vendorName.trim().toLowerCase() === vendor.vendorName.trim().toLowerCase()
  ) ?? null;
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
  createEffect(() => {
    const artifactId = props.result?.action.artifactId;
    if (!artifactId || !comparisonResultElement) return;
    window.requestAnimationFrame(() => comparisonResultElement?.scrollIntoView({ behavior: "smooth", block: "start" }));
  });
  return (
    <div data-wedding-surface="vendor-search" class="min-w-0 overflow-hidden rounded-xl border border-wedding-border bg-wedding-card px-3 py-4 shadow-wedding-card sm:px-5 sm:py-6">
      <div class="grid grid-cols-3 gap-1 rounded-xl bg-wedding-slate p-1" role="tablist" aria-label="Vendor options">
        <button
          id="wedding-vendor-tab-find"
          type="button"
          role="tab"
          aria-selected={vendorMode() === "find"}
          aria-controls="wedding-vendor-panel-find"
          class={`min-h-11 rounded-lg px-3 text-sm font-bold transition ${vendorMode() === "find" ? "bg-white text-wedding-primary shadow-sm" : "text-wedding-ink/70"}`}
          onClick={() => setVendorMode("find")}
        >Find vendors</button>
        <button
          id="wedding-vendor-tab-invite"
          type="button"
          role="tab"
          aria-selected={vendorMode() === "invite"}
          aria-controls="wedding-vendor-panel-invite"
          class={`min-h-11 rounded-lg px-3 text-sm font-bold transition ${vendorMode() === "invite" ? "bg-white text-wedding-primary shadow-sm" : "text-wedding-ink/70"}`}
          onClick={() => setVendorMode("invite")}
        >Invite Proposals</button>
        <button
          id="wedding-vendor-tab-specials"
          type="button"
          role="tab"
          aria-selected={vendorMode() === "specials"}
          aria-controls="wedding-vendor-panel-specials"
          class={`min-h-11 rounded-lg px-2 text-xs font-bold transition sm:px-3 sm:text-sm ${vendorMode() === "specials" ? "bg-white text-wedding-primary shadow-sm" : "text-wedding-ink/70"}`}
          onClick={() => setVendorMode("specials")}
        >Limited Specials</button>
      </div>
      <div id="wedding-vendor-panel-find" role="tabpanel" aria-labelledby="wedding-vendor-tab-find" hidden={vendorMode() !== "find"}>
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
          <p class="mt-4 font-display text-[22px] font-semibold leading-7 tracking-[-.01em] text-wedding-ink">Search and compare</p>
          <Show when={visibleLifecycleFilters().length > 0}>
            <div class="min-w-0">
              <p class="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-wedding-ink/60">My activity</p>
              <div class="-mx-1 flex max-w-full snap-x gap-1.5 overflow-x-auto px-1 pb-1 text-xs [scrollbar-width:none]" aria-label="My vendor activity">
                <For each={visibleLifecycleFilters()}>{(filter) => (
                  <button
                    type="button"
                    class={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-semibold shadow-sm transition ${lifecycleFilter() === filter.id ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-primary/20 bg-wedding-primary/10 text-wedding-primary hover:bg-wedding-primary/15"}`}
                    aria-pressed={lifecycleFilter() === filter.id}
                    onClick={() => setLifecycleFilter(lifecycleFilter() === filter.id ? "all" : filter.id)}
                  >
                    <Show when={filter.id === "favourited"} fallback={<span class={`h-2 w-2 rounded-full ${filter.dotClass}`} aria-hidden="true" />}>
                      <span aria-hidden="true" class="text-rose-600">♥</span>
                    </Show>
                    <span>{filter.label}</span>
                    <span class={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${lifecycleFilter() === filter.id ? "bg-white/20 text-white" : "bg-white text-wedding-primary"}`}>({lifecycleCount(filter.id)})</span>
                  </button>
                )}</For>
              </div>
            </div>
          </Show>
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
      <div class="mt-3 hidden sm:block" aria-label="Vendor categories">
        <div class="flex snap-x flex-wrap gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
        <For each={CORE_VENDOR_CATEGORY_CHIPS}>{(chip) => (
          <button
            type="button"
            class={`inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition duration-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary focus-visible:ring-offset-2 disabled:opacity-45 ${isSelectedCategory(chip.query) ? "border-wedding-primary bg-wedding-primary text-wedding-page" : "border-wedding-border bg-white text-wedding-ink hover:border-wedding-primary hover:text-wedding-primary"}`}
            disabled={searchDisabled()}
            aria-pressed={isSelectedCategory(chip.query)}
            onClick={(event) => runCategorySearch(event, chip.query)}
          >
            <WeddingDashboardIcon id={chip.icon} class="h-4 w-4" />{chip.label}
          </button>
        )}</For>
        <button type="button" class="inline-flex min-h-11 shrink-0 items-center rounded-full border border-wedding-border bg-white px-3 text-sm font-semibold text-wedding-primary hover:border-wedding-primary" aria-expanded={allDesktopCategories()} onClick={() => setAllDesktopCategories((value) => !value)}>{allDesktopCategories() ? "Less" : "More"}</button>
        </div>
        <Show when={allDesktopCategories()}><div class="mt-1 flex flex-wrap gap-2 rounded-xl border border-wedding-border bg-wedding-page p-2"><For each={MORE_VENDOR_CATEGORY_CHIPS}>{(chip) => <button type="button" class={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold ${isSelectedCategory(chip.query) ? "border-wedding-primary bg-wedding-primary text-wedding-page" : "border-wedding-border bg-white text-wedding-ink hover:border-wedding-primary"}`} disabled={searchDisabled()} aria-pressed={isSelectedCategory(chip.query)} onClick={(event) => runCategorySearch(event, chip.query)}><WeddingDashboardIcon id={chip.icon} class="h-4 w-4" />{chip.label}</button>}</For></div></Show>
      </div>
      <div class="mt-3 sm:hidden" aria-label="Vendor categories">
        <div class="grid grid-cols-3 gap-2"><For each={VENDOR_CATEGORY_CHIPS.slice(0, 2)}>{(chip) => <button type="button" class={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold ${isSelectedCategory(chip.query) ? "border-wedding-primary bg-wedding-primary text-wedding-page" : "border-wedding-border bg-white text-wedding-ink"}`} disabled={searchDisabled()} aria-pressed={isSelectedCategory(chip.query)} onClick={(event) => runCategorySearch(event, chip.query)}><WeddingDashboardIcon id={chip.icon} class="h-4 w-4 shrink-0" /><span class="truncate">{chip.label}</span></button>}</For><button type="button" class="min-h-11 rounded-lg border border-wedding-border bg-white px-2 text-xs font-semibold text-wedding-primary" aria-expanded={allMobileCategories()} onClick={() => setAllMobileCategories((value) => !value)}>{allMobileCategories() ? "Show less" : "See all"}</button></div>
        <Show when={allMobileCategories()}><div class="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-wedding-border bg-wedding-page p-2"><For each={VENDOR_CATEGORY_CHIPS.slice(2)}>{(chip) => <button type="button" class={`flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-3 text-left text-sm font-semibold ${isSelectedCategory(chip.query) ? "border-wedding-primary bg-wedding-primary text-wedding-page" : "border-wedding-border bg-white text-wedding-ink"}`} disabled={searchDisabled()} aria-pressed={isSelectedCategory(chip.query)} onClick={(event) => runCategorySearch(event, chip.query)}><WeddingDashboardIcon id={chip.icon} class="h-4 w-4 shrink-0" /><span class="min-w-0 break-words">{chip.label}</span></button>}</For></div></Show>
      </div>
      <Show when={!props.result && !workspace().vendorSearchRunning}>
        <p class="mt-2 text-[13px] leading-[18px] text-wedding-ink/70">Real vendors near you. We show where each result came from.</p>
      </Show>
      <Show when={lifecycleFilter() !== "all"}>
        <div class="mt-3 grid gap-2" aria-live="polite">
          <Show when={lifecycleFilter() === "proposals"}>
            <Show when={(proposalOpportunities()?.length ?? 0) > 0} fallback={<p class="rounded-lg border border-wedding-border bg-white p-3 text-sm text-wedding-ink/70">No vendor proposals have arrived yet.</p>}>
              <For each={proposalOpportunities()}>{(opportunity) => <button type="button" class="rounded-lg border border-wedding-border bg-white p-3 text-left" onClick={() => { setSelectedVendorCategory(opportunity.category); setVendorMode("invite"); }}>
                <span class="block font-semibold text-wedding-ink">{opportunity.category}</span>
                <span class="mt-1 block text-xs text-wedding-ink/65">{opportunity.responseCount} proposal{opportunity.responseCount === 1 ? "" : "s"} · {opportunity.claimedVendorViewCount} claimed-vendor views</span>
                <span class="mt-1 block text-xs font-semibold text-wedding-secondary">Open proposal opportunity</span>
              </button>}</For>
            </Show>
          </Show>
          <Show when={lifecycleFilter() !== "proposals"}>
          <Show when={filteredLifecycleRecords().length > 0} fallback={<p class="rounded-lg border border-wedding-border bg-white p-3 text-sm text-wedding-ink/70">No vendors have this status yet.</p>}>
            <For each={filteredLifecycleRecords()}>{(vendor) => <article class="rounded-lg border border-wedding-border bg-white p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
              <button type="button" class="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary" aria-expanded={expandedLifecycleVendorKey() === vendor.key} onClick={() => toggleLifecycleVendor(vendor)}>
                <span class="block break-words font-semibold text-wedding-ink">{vendor.vendorName}</span>
                <span class="mt-0.5 block text-xs text-wedding-ink/65">{[vendor.enquired && "Enquired", vendor.favourited && "Favourited", vendor.quoteReceived && "Quote received", vendor.booked && "Booked"].filter(Boolean).join(" · ")}</span>
                <span class="mt-1 block text-xs font-semibold text-wedding-secondary">{expandedLifecycleVendorKey() === vendor.key ? "Hide details" : "View vendor, conversation and files"}</span>
              </button>
              <div class="flex flex-wrap gap-2">
                <Show when={quoteFlowForVendor(vendor)}>{(flow) => <button type="button" class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-sm font-bold text-wedding-secondary disabled:opacity-60" disabled={vendor.quoteAccepted || !props.onAcceptQuote} onClick={() => props.onAcceptQuote?.(flow().quote, flow().quoteMessageId ?? flow().id)}>{vendor.quoteAccepted ? "Quote accepted" : "Accept quote"}</button>}</Show>
                <Show when={vendor.quoteAccepted && !vendor.booked}><button type="button" class="min-h-11 rounded-lg bg-wedding-primary px-3 text-sm font-bold text-white" onClick={() => openLifecycleDocument(vendor)}>Review booking terms</button></Show>
              </div>
              </div>
              <Show when={expandedLifecycleVendorKey() === vendor.key}>
                <div class="mt-3 grid gap-3 border-t border-wedding-border pt-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                  <section class="rounded-lg bg-wedding-page p-3">
                    <p class="text-xs font-semibold uppercase tracking-wide text-wedding-ink/60">About this vendor</p>
                    <p class="mt-2 text-sm leading-6 text-wedding-ink">{directoryVendor(vendor)?.notes || `${vendor.vendorName} is saved in this wedding's vendor activity.`}</p>
                    <Show when={directoryVendor(vendor)}>{(entry) => <div class="mt-2 space-y-1 text-xs leading-5 text-wedding-ink/70">
                      <p>{[entry().category, entry().serviceArea].filter(Boolean).join(" · ")}</p>
                      <Show when={entry().websiteUrl}>{(url) => <a class="font-semibold text-wedding-secondary underline" href={url()} target="_blank" rel="noreferrer">Vendor website</a>}</Show>
                    </div>}</Show>
                    <Show when={lifecycleMessages(vendor).length > 0}>
                      <p class="mt-4 text-xs font-semibold uppercase tracking-wide text-wedding-ink/60">Conversation history</p>
                      <ul class="mt-2 space-y-2"><For each={lifecycleMessages(vendor)}>{(message) => <li class="rounded-lg border border-wedding-border bg-white px-3 py-2 text-xs text-wedding-ink"><span class="font-semibold capitalize">{lifecycleMessageLabel(message)}</span><span class="ml-2 text-wedding-ink/55">{new Date(message.timestamp).toLocaleDateString()}</span></li>}</For></ul>
                    </Show>
                  </section>
                  <WeddingVendorLifecycleDetailPanel
                    vendor={vendor}
                    messages={lifecycleMessages(vendor)}
                    artifacts={lifecycleArtifacts(vendor)}
                    allArtifacts={workspace().state.artifactPreviews}
                    imageUrl={lifecycleImage(vendor).url}
                    imageAlt={lifecycleImage(vendor).alt}
                    weddingDate={weddingDateOrSeason()}
                    onOpenArtifact={openLifecycleArtifact}
                  />
                </div>
              </Show>
            </article>}</For>
          </Show>
          </Show>
        </div>
      </Show>
      <Show
        when={!props.result}
      >
      <Show
        when={workspace().vendorSearchRunning}
        fallback={<Show when={visibleVendorSearchNotice()}>{(notice) => <p class="mt-4 break-words text-xs leading-5 text-wedding-ink/70">{notice()}</p>}</Show>}
      >
        <p class="mt-4 flex items-center gap-1.5 break-words text-xs font-medium leading-5 text-wedding-ink/70" role="status" aria-live="polite">
          <span class="inline-flex h-[1em] w-[1em] items-center justify-center overflow-hidden text-[0.9em] leading-none motion-safe:animate-pulse" aria-hidden="true">🤖</span>
          <span>{SEARCH_PROGRESS_LABELS[searchProgressIndex()]}</span>
        </p>
      </Show>
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
          <div ref={comparisonResultElement} class="mt-5 scroll-mt-24 border-t border-wedding-border pt-4">
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
      </div>
      <Show when={vendorMode() === "invite"}>
        <WeddingInviteProposalsPanel
          workspace={workspace()}
          preview={props.result?.preview ?? props.result?.sourcePreview ?? null}
          selectedCategory={selectedVendorCategory()}
          onSelectedCategoryChange={setSelectedVendorCategory}
        />
      </Show>
      <Show when={vendorMode() === "specials"}>
        <div id="wedding-vendor-panel-specials" role="tabpanel" aria-labelledby="wedding-vendor-tab-specials">
          <ErrorBoundary fallback={(_error, reset) => <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert"><p class="font-semibold">Limited Specials could not open.</p><p class="mt-1 leading-6">The rest of your planner is still available. Retry this map without reloading the workspace.</p><button type="button" class="mt-3 min-h-11 rounded-lg border border-amber-400 bg-white px-4 font-semibold" onClick={reset}>Retry Limited Specials</button></div>}>
            <WeddingLimitedSpecialsMap
              weddingDate={weddingDateOrSeason()}
              initialCategory={selectedVendorCategory()}
              initialGuestCount={weddingGuestCount()}
              categoryBudgets={workspace().state.budgetTracking.budgetAllocation}
              preferenceTerms={props.preferenceProfile?.facets.map((facet) => facet.facetId) ?? []}
              shortlistPreferences={shortlistPreferences()}
              vendors={workspace().weddingVendorDirectory}
              onPrepareEnquiry={prepareSpecialEnquiry}
              onPrepareDateEnquiry={prepareDirectoryDateEnquiry}
              onSavePreference={saveSpecialPreference}
            />
            <Show when={directSpecialEnquiryCard()} keyed>{(card) => (
              <div ref={directSpecialEnquiryElement} class="mt-4 scroll-mt-4 rounded-xl border border-wedding-primary/30 bg-wedding-page p-3" aria-live="polite">
                <h3 class="font-display text-xl font-semibold text-wedding-ink">Review this date enquiry</h3>
                <p class="mt-1 text-sm leading-6 text-wedding-ink/70">Check the generated message, recipient and information-sharing choices below. Nothing is sent until you select Send enquiry.</p>
                <div class="mt-3">
                  <WeddingVendorChoiceCard
                    card={card}
                    outreachFlow={props.outreach.flows()[card.choiceId] ?? null}
                    gmailConnected={Boolean(workspace().gmailStatus?.connected)}
                    onContactVendor={(choice, intent) => void props.outreach.onContactVendor(choice, `limited-specials:${card.choiceId}`, intent, true)}
                    onOutreachBodyChange={props.outreach.onOutreachBodyChange}
                    onOutreachRecipientChange={props.outreach.onOutreachRecipientChange}
                    onOutreachAttachmentsChange={props.outreach.onOutreachAttachmentsChange}
                    onOutreachPermissionsChange={props.outreach.onOutreachPermissionsChange}
                    onSendOutreach={(choiceId) => void props.outreach.onSendOutreach(choiceId)}
                    onCancelOutreach={props.outreach.onCancelOutreach}
                    onRetryOutreach={props.outreach.onRetryOutreach}
                    onConnectGmailForOutreach={() => void props.outreach.onConnectGmailForOutreach()}
                    hidePrimaryAction
                  />
                </div>
              </div>
            )}</Show>
          </ErrorBoundary>
        </div>
      </Show>
    </div>
  );
}
