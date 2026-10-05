// @locs-version: 1.0
// @module-id: ui.response-queue-view
// @primary-capability: response-queue-wedding-workspace
// @stability: beta
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { DashboardBootstrap } from "@/lib/api";
import { QueueDensityToggle } from "@/components/QueueDensityToggle";
import { ResponseQueueSurface } from "@/components/ResponseQueueSurface";
import { WeddingNavigationArrivalBanner } from "@/components/WeddingNavigationArrivalBanner";
import { WeddingPlannerWalkthrough } from "@/components/WeddingPlannerWalkthrough";
import { WeddingResponseWorkspaceView } from "@/components/WeddingResponseWorkspaceView";
import { WeddingRichResponseView } from "@/components/WeddingRichResponseView";
import { WorkspaceSetupBanner } from "@/components/WorkspaceSetupBanner";
import { WeddingSiteIntakeWizard } from "@/components/WeddingSiteIntakeWizard";
import { toast } from "@/components/Toast";
import { RailIcon, type IconId } from "@/components/RailIcons";
import {
  loadWeddingWorkspaceMenu,
  loadWeddingWorkspaceMenuFromUrl,
  isWeddingWorkspaceMenuId,
  canonicalWeddingWorkspaceMenuId,
  replaceWeddingWorkspaceMenuInUrl,
  saveWeddingWorkspaceMenu,
  weddingWorkspaceMenuIdFromEvent,
  weddingWorkspaceMenuBadge,
  weddingWorkspaceMenuHint,
  WEDDING_WORKSPACE_MENU_EVENT,
  type WeddingWorkspaceMenuId,
} from "@/lib/weddingWorkspaceMenuState";
import {
  weddingTemplateHomeResetKey,
  weddingWorkspaceArrivalMenuApplyKey,
  weddingWorkspaceMenuForArrival,
} from "@/lib/weddingWorkspaceMenuArrivalState";
import { saveWeddingReturnIntent } from "@/lib/weddingReturnIntentState";
import {
  loadWeddingEntrySource,
  loadWeddingIntakeVariantShown,
  saveWeddingIntakeVariantShown,
  type WeddingEntrySource,
} from "@/lib/weddingEntrySourceState";
import {
  fetchWeddingOnboardingState,
  fetchWeddingProviderCapabilities,
  fetchWeddingVendors,
  fetchGmailStatus,
  recordWeddingVendorContact,
  saveWeddingOnboardingState,
  searchWeddingVendors,
  sendGmailApprovedDraft,
  sendAfpMessage,
  uploadFilePayload,
  type WeddingVendor,
  type WeddingProviderCapabilitiesResponse,
} from "@/lib/api";
import { decisionOsQueueCompanionState } from "@/lib/decisionOsQueueBootstrapState";
import { normalizeWeddingArtifactSummaries, normalizeWeddingArtifactSummary } from "@/lib/weddingArtifactState";
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import { buildWeddingKnowledgeGraphState } from "@/lib/weddingKnowledgeGraphState";
import { buildWeddingContinueContextPacket } from "@/lib/weddingContinueContextState";
import { weddingPersistedDecisionRecordsToGraphDecisions } from "@/lib/weddingDecisionGraphState";
import {
  loadLocalWeddingDate,
  parseWeddingDateInput,
  saveLocalWeddingDate,
  weddingDateToAfpSendInputs,
  weddingDateToScheduleItem,
} from "@/lib/weddingDateCaptureState";
import { buildWeddingDefaultApprovalExecutionHandlers } from "@/lib/weddingApprovalDefaultExecutorState";
import {
  buildWeddingGmailApprovalExecutionHandlers,
  weddingGmailDraftSendResultFromApiResponse,
} from "@/lib/weddingGmailApprovalExecutorState";
import { buildWeddingHandoffPacketState } from "@/lib/weddingHandoffPacketState";
import {
  loadResponseQueueDensity,
  queueDensityIsCompact,
  saveResponseQueueDensity,
  type QueueDensity,
} from "@/lib/queueDensityLocalState";
import {
  saveWeddingPlannerWalkthroughSeen,
  shouldAutoShowWeddingPlannerWalkthrough,
} from "@/lib/weddingPlannerWalkthroughLocalState";
import {
  markWeddingArtifactAfpProjectionSent,
  weddingGeneratedArtifactToAfpSendInput,
} from "@/lib/weddingArtifactAfpProjectionState";
import { consumeWeddingNavigationIntent } from "@/lib/weddingNavigationLocalState";
import {
  buildWeddingNavigationArrivalBannerState,
  weddingArrivalActionDestinationView,
  type WeddingArrivalAction,
} from "@/lib/weddingNavigationArrivalViewState";
import {
  buildWeddingNavigationIntentFromPresentationAction,
  buildWeddingNavigationIntentFromSidebarAction,
  dispatchWeddingNavigationIntent,
} from "@/lib/weddingNavigationState";
import { buildWeddingPersistedWorkspaceState } from "@/lib/weddingPersistedWorkspaceState";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import { buildWeddingAdminDataConsentState } from "@/lib/weddingAdminDataConsentState";
import { buildWeddingRecommendationExplanationState } from "@/lib/weddingRecommendationExplanationState";
import {
  buildWeddingResponseWorkspaceViewState,
  type WeddingResponseWorkspaceViewState,
} from "@/lib/weddingResponseWorkspaceViewState";
import {
  weddingRecommendationDraftReady,
  weddingRecommendationRequestedOutput,
} from "@/lib/weddingRecommendationGenerationActionState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import { buildWeddingTemplateDemoState } from "@/lib/weddingTemplateEntryState";
import { shouldShowWeddingFirstRunIntake } from "@/lib/weddingFirstRunIntakeGateState";
import {
  WEDDING_VENDOR_CHECKLIST,
  weddingVendorSelectionLabels,
} from "@/lib/weddingVendorChecklistState";
import { WEDDING_BUDGET_ALLOCATION_LOCAL_SAVE_EVENT } from "@/lib/weddingBudgetAllocationState";
import {
  buildWeddingVendorComparisonArtifactState,
  buildWeddingVendorSearchArtifactState,
} from "@/lib/weddingVendorSearchArtifactState";
import {
  buildWeddingVendorSearchExecutionNoticeState,
  buildWeddingVendorSearchNoticeState,
} from "@/lib/weddingVendorSearchNoticeState";
import {
  consumeWeddingVendorSearchLaunch,
  WEDDING_VENDOR_SEARCH_LAUNCH_EVENT,
  weddingVendorSearchApproximateLocationFromTimezone,
  weddingVendorSearchEffectiveQueryState,
  weddingVendorSearchQueryFromIntake,
  weddingAutomaticShortlistEnabled,
  weddingVendorSearchLaunchFromEvent,
  type WeddingVendorSearchLaunchState,
} from "@/lib/weddingVendorSearchLaunchState";
import { buildWeddingLiveWorkflowReadinessState } from "@/lib/weddingLiveWorkflowReadinessState";
import { buildWeddingVendorEndToEndValidationState } from "@/lib/weddingVendorEndToEndValidationState";
import {
  buildWeddingVendorSearchProviderPlanState,
  type WeddingVendorSearchProviderPlan,
} from "@/lib/weddingVendorSearchProviderPlanState";
import type { WeddingVendorSearchProviderKind } from "@/lib/weddingVendorSearchProviderEnvState";
import {
  runWeddingPlannedVendorSearchExecution,
  weddingVendorSearchBatchPortFromApiSearch,
} from "@/lib/weddingVendorSearchExecutorState";
import { runWeddingVendorDirectoryFirstSearch } from "@/lib/weddingVendorDirectoryFirstSearchState";
import { weddingVendorDirectorySearchPlans } from "@/lib/weddingVendorDirectorySearchPlanState";
import { useWeddingVendorShortlistLaunch } from "@/lib/useWeddingVendorShortlistLaunch";
import { buildWeddingVendorSearchReadinessState } from "@/lib/weddingVendorSearchReadinessState";
import {
  weddingConfiguredVendorSearchProviderKinds,
  weddingConfiguredVendorSearchProviderLabel,
  weddingVendorSearchProviderBlockedReason,
  weddingVendorSearchProviderCautionReason,
} from "@/lib/weddingVendorProviderCapabilityState";
import {
  loadWeddingTemplateFollowUpDraft,
  mergeWeddingTemplateFollowUpDraftWithApprovedContext,
  saveWeddingTemplateFollowUpDraft,
  weddingTemplateFollowUpDraftFromPlanningContext,
  type WeddingTemplateFollowUpDraft,
} from "@/lib/weddingTemplateFollowUpLocalState";
import { buildWeddingNeedToKnowExtractionState } from "@/lib/weddingNeedToKnowExtractionState";
import { buildWeddingTemplateFollowUpState } from "@/lib/weddingTemplateFollowUpState";
import { buildWeddingTemplateLaunchState } from "@/lib/weddingTemplateLaunchState";
import type { WeddingTemplateStarterIntent } from "@/lib/weddingTemplateEntryState";
import type { GmailConnectionStatus } from "@/lib/gmailConnectionState";
import {
  weddingVendorContactProjectionRequests,
  weddingVendorReplyInputsFromAfpMessages,
  weddingVendorReplyProjectionRequests,
  type WeddingVendorReplyKnownContact,
} from "@/lib/weddingVendorContactProjectionState";
import {
  buildWeddingVendorSmokeFixtureCleanupGateState,
  isWeddingVendorSmokeFixtureArtifact,
  removeWeddingVendorSmokeFixtureArtifacts,
  saveWeddingVendorSmokeFixtureArtifacts,
  WEDDING_VENDOR_SMOKE_PLANNER_EMAIL,
  WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL,
} from "@/lib/weddingVendorSmokeFixtureState";
import { loadWeddingWorkspaceRefreshState, type WeddingWorkspaceRefreshState } from "@/lib/weddingWorkspaceRefreshState";
import {
  buildWeddingImportSynthesisState,
  loadWeddingImportedArtifacts,
  saveWeddingImportedArtifacts,
  type WeddingImportFileInput,
  type WeddingImportUploadReceipt,
} from "@/lib/weddingImportSynthesisState";
import { weddingImportFileInputsFromBrowserFile } from "@/lib/weddingXlsxImportParserState";
import type { WeddingRichResponseAction } from "@/lib/weddingRichResponseRendererState";
import type { WeddingProjectionDispatchReceiptState } from "@/lib/weddingProjectionDispatchState";
import type { ViewName } from "@/lib/viewNames";
import type { WeddingPlanningScheduleItem } from "@/lib/weddingCalendarProjectionState";
import {
  buildWeddingVendorSearchQueryEditState,
  buildWeddingVendorSearchResultAction,
  buildWeddingVendorSearchResultActionFromArtifacts,
  hasWeddingVendorComparisonArtifactSummary,
  hasWeddingVendorSearchArtifactSummary,
  hasWeddingVendorTopFiveComparisonExpansion,
  type WeddingVendorSearchResultAction,
} from "@/lib/weddingVendorSearchResultActionState";

const RESPONSE_QUEUE_VIEW_CLASS =
  "view-enter min-w-0 space-y-4 rounded-[24px] border border-sky-100/80 bg-[linear-gradient(135deg,rgba(240,249,255,0.96),rgba(255,255,255,0.96))] p-3 shadow-[0_22px_70px_-36px_rgba(14,116,144,0.4)] backdrop-blur-sm sm:rounded-[32px] sm:p-5";
const RESPONSE_QUEUE_VIEW_HEADER_CLASS = "flex min-w-0 flex-wrap items-center justify-end gap-3";
const RESPONSE_QUEUE_VIEW_TITLE_TAG = "h1" as const;
const WEDDING_WORKSPACE_MENU_ITEMS: Array<{
  id: WeddingWorkspaceMenuId;
  icon: IconId;
  label: string;
  title: string;
  className: string;
  activeClassName: string;
}> = [
  {
    id: "home",
    icon: "home",
    label: "Home",
    title: "Main decision queue, budget remaining, days left, and wedding documents.",
    className: "border-pink-100 bg-pink-50/80 text-pink-950 hover:border-pink-200",
    activeClassName: "border-pink-300 bg-pink-100 text-pink-950",
  },
  {
    id: "people",
    icon: "contacts",
    label: "People",
    title: "Guests, seating, family boundaries, and people-related planning.",
    className: "border-amber-100 bg-amber-50/80 text-amber-950 hover:border-amber-200",
    activeClassName: "border-amber-300 bg-amber-100 text-amber-950",
  },
  {
    id: "plan",
    icon: "timeline",
    label: "Plan",
    title: "Follow-ups, timeline, sharing, and planning coordination.",
    className: "border-indigo-100 bg-indigo-50/80 text-indigo-950 hover:border-indigo-200",
    activeClassName: "border-indigo-300 bg-indigo-100 text-indigo-950",
  },
  {
    id: "documents",
    icon: "files",
    label: "Documents",
    title: "Open planning files, imports, exports, and wedding documents.",
    className: "border-slate-200 bg-slate-50/80 text-slate-800 hover:border-slate-300",
    activeClassName: "border-slate-400 bg-slate-100 text-slate-950",
  },
  {
    id: "budget",
    icon: "cost_dashboard",
    label: "Budget",
    title: "Track remaining budget, quotes, payments, and cost risks.",
    className: "border-emerald-100 bg-emerald-50/80 text-emerald-950 hover:border-emerald-200",
    activeClassName: "border-emerald-300 bg-emerald-100 text-emerald-950",
  },
  {
    id: "inspiration",
    icon: "discover",
    label: "Inspiration",
    title: "Add photos, screenshots, links, and thoughts so OmnyID can learn the wedding style.",
    className: "border-rose-100 bg-rose-50/80 text-rose-950 hover:border-rose-200",
    activeClassName: "border-rose-300 bg-rose-100 text-rose-950",
  },
  {
    id: "advanced",
    icon: "tools",
    label: "Setup checks",
    title: "Connection and safety checks. Most couples can leave this closed.",
    className: "border-stone-200 bg-stone-50/80 text-stone-800 hover:border-stone-300",
    activeClassName: "border-stone-400 bg-stone-100 text-stone-950",
  },
];

function weddingMenuKeyDownStep(key: string, currentIndex: number, itemCount: number): number | null {
  if (key === "ArrowRight") return (currentIndex + 1) % itemCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + itemCount) % itemCount;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  return null;
}

function initialWeddingWorkspaceMenu(): WeddingWorkspaceMenuId {
  if (typeof window !== "undefined") {
    const urlMenu = loadWeddingWorkspaceMenuFromUrl(window.location.search, window.location.hash);
    if (urlMenu) return urlMenu;
  }
  return loadWeddingWorkspaceMenu();
}

function weddingSetupChecklistItems(state: WeddingResponseWorkspaceViewState): Array<{
  id: string;
  label: string;
  detail: string;
  complete: boolean;
  menu: WeddingWorkspaceMenuId;
}> {
  return [
    {
      id: "date",
      label: "Add the wedding date",
      detail: "Starts the countdown and timeline.",
      complete: state.ganttTimeline.rows.length > 0,
      menu: "timeline",
    },
    {
      id: "budget",
      label: "Set a budget",
      detail: "Shows how much is left after quotes.",
      complete: state.budgetTracking.budgetTargetAmount !== null,
      menu: "budget",
    },
    {
      id: "guests",
      label: "Start the guest list",
      detail: "Unlocks RSVPs, meals, and seating.",
      complete: state.guestTracking.guestRowCount > 0,
      menu: "guests",
    },
    {
      id: "helpers",
      label: "Choose who is helping",
      detail: "Keeps tasks and permissions clear.",
      complete: state.delegation.items.length > 0,
      menu: "helpers",
    },
  ];
}

function rescopeWeddingArtifact(
  artifact: WeddingGeneratedArtifact,
  metadata: ReturnType<typeof normalizeWeddingPlanningMetadata>,
): WeddingGeneratedArtifact | null {
  const input = {
    ...artifact.input,
    metadata: {
      ...(artifact.input.metadata && typeof artifact.input.metadata === "object" ? artifact.input.metadata : {}),
      weddingPlanId: metadata.weddingPlanId,
      responseWorkspaceId: metadata.responseWorkspaceId,
      sourceResponseId: metadata.sourceResponseId,
      artifactKind: artifact.summary.kind,
      privacyScope: artifact.summary.metadata.privacyScope,
      approvalState: artifact.summary.approvalState,
      supertags: metadata.supertags,
    },
  };
  const summary = normalizeWeddingArtifactSummary(input);
  return summary ? { ...artifact, input, summary } : null;
}

function withWeddingAdminDataConsent(
  state: WeddingResponseWorkspaceViewState,
  enabled: boolean,
): WeddingResponseWorkspaceViewState {
  return {
    ...state,
    adminDataConsent: buildWeddingAdminDataConsentState({
      enabled,
      workspaceId: state.workspace.metadata.responseWorkspaceId,
      planId: state.workspace.metadata.weddingPlanId,
      submittedResponseCount: state.workspace.totalArtifacts,
    }),
  };
}

function withLocalWeddingDateSchedule(
  items: readonly WeddingPlanningScheduleItem[] | null | undefined,
  metadata: unknown,
  responseWorkspaceId: string,
): WeddingPlanningScheduleItem[] {
  const localDate = loadLocalWeddingDate(responseWorkspaceId, localStorage);
  if (!localDate) return [...(items ?? [])];
  const existing = (items ?? []).some((item) =>
    /\bwedding[\s_-]*(day|date)\b/i.test(`${item.id} ${item.title}`),
  );
  return existing ? [...(items ?? [])] : [
    weddingDateToScheduleItem({ date: localDate, metadata }),
    ...(items ?? []),
  ];
}

function normalizedNoimAnswer(value: string): "yes" | "no" | "unknown" | null {
  return value === "yes" || value === "no" || value === "unknown" ? value : null;
}

function normalizedVowPreferenceAnswer(value: string): "" | "standard" | "create" | "undecided" {
  return value === "standard" || value === "create" || value === "undecided" ? value : "";
}

function linesFromText(value: string): string[] {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

function vendorSearchQueryWithFallbackArea(query: string, area: string): string {
  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  const normalizedArea = area.replace(/\s+/g, " ").trim();
  if (!normalizedQuery || !normalizedArea) return normalizedQuery;
  if (/\b(in|near|around|within)\s+[\p{L}\p{N}]/iu.test(normalizedQuery)) return normalizedQuery;
  return `${normalizedQuery} near ${normalizedArea}`.slice(0, 280);
}

export function ResponseQueueView(props: {
  bootstrap: DashboardBootstrap | null;
  onNavigate?: (view: ViewName, hint?: string) => void;
}) {
  const bootstrap = createMemo(() => props.bootstrap);
  const queueCompanion = createMemo(() => decisionOsQueueCompanionState(bootstrap()));
  const [density, setDensity] = createSignal<QueueDensity>(loadResponseQueueDensity());
  const [weddingWorkspaceMenu, setWeddingWorkspaceMenuSignal] = createSignal<WeddingWorkspaceMenuId>(initialWeddingWorkspaceMenu());
  function setWeddingWorkspaceMenu(id: WeddingWorkspaceMenuId) {
    const menuId = canonicalWeddingWorkspaceMenuId(id);
    setWeddingWorkspaceMenuSignal(menuId);
    saveWeddingWorkspaceMenu(menuId);
    if (typeof window !== "undefined") replaceWeddingWorkspaceMenuInUrl(menuId);
    if (typeof document !== "undefined") {
      document.getElementById("wedding-tabpanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  function handleWeddingMenuTabKeyDown(event: KeyboardEvent, currentIndex: number) {
    const nextIndex = weddingMenuKeyDownStep(event.key, currentIndex, WEDDING_WORKSPACE_MENU_ITEMS.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextItem = WEDDING_WORKSPACE_MENU_ITEMS[nextIndex];
    setWeddingWorkspaceMenu(nextItem.id);
    document.getElementById(`wedding-tab-${nextItem.id}`)?.focus();
  }
  const [showWeddingSharePlan, setShowWeddingSharePlan] = createSignal(false);
  const [showWeddingWalkthrough, setShowWeddingWalkthrough] = createSignal(false);
  let weddingUploadFilesControlRef: HTMLLabelElement | undefined;
  const [weddingWalkthroughChecked, setWeddingWalkthroughChecked] = createSignal(false);
  const [weddingNavigationIntent, setWeddingNavigationIntent] = createSignal<ReturnType<typeof consumeWeddingNavigationIntent>>(null);
  const [weddingWorkspaceQuery, setWeddingWorkspaceQuery] = createSignal("");
  const [activeWeddingArtifactId, setActiveWeddingArtifactId] = createSignal<string | null>(null);
  const [weddingAdminDataConsentEnabled, setWeddingAdminDataConsentEnabled] = createSignal(false);
  const [weddingProjectionRefreshKey, setWeddingProjectionRefreshKey] = createSignal(0);
  const [weddingLocalDateRefreshKey, setWeddingLocalDateRefreshKey] = createSignal(0);
  const [weddingLocalBudgetRefreshKey, setWeddingLocalBudgetRefreshKey] = createSignal(0);
  const [weddingImportRefreshKey, setWeddingImportRefreshKey] = createSignal(0);
  const [weddingRefreshRunning, setWeddingRefreshRunning] = createSignal(false);
  const [weddingRefreshState, setWeddingRefreshState] = createSignal<WeddingWorkspaceRefreshState | null>(null);
  const [weddingVendorSearchRunning, setWeddingVendorSearchRunning] = createSignal(false);
  const [weddingVendorSearchNotice, setWeddingVendorSearchNotice] = createSignal<string | null>(null);
  const [weddingVendorSearchResultAction, setWeddingVendorSearchResultAction] = createSignal<WeddingVendorSearchResultAction | null>(null);
  const [weddingVendorSearchResultActionSuppressed, setWeddingVendorSearchResultActionSuppressed] = createSignal(false);
  const [weddingVendorSearchQuery, setWeddingVendorSearchQuery] = createSignal("");
  const [weddingVendorSearchCategoryScope, setWeddingVendorSearchCategoryScope] = createSignal<string[] | null>(null);
  const [weddingProviderCapabilities, setWeddingProviderCapabilities] = createSignal<WeddingProviderCapabilitiesResponse | null>(null);
  const [weddingProviderCapabilitiesRequestKey, setWeddingProviderCapabilitiesRequestKey] = createSignal("");
  const [weddingVendorDirectory, setWeddingVendorDirectory] = createSignal<WeddingVendor[]>([]);
  const [weddingVendorDirectoryRequestKey, setWeddingVendorDirectoryRequestKey] = createSignal("");
  const [weddingGmailStatus, setWeddingGmailStatus] = createSignal<GmailConnectionStatus | null>(null);
  const [weddingGmailStatusRequestKey, setWeddingGmailStatusRequestKey] = createSignal("");
  const syncedWeddingVendorReplyContactKeys = new Set<string>();
  const [weddingFollowUpDate, setWeddingFollowUpDate] = createSignal("");
  const [weddingFollowUpLocation, setWeddingFollowUpLocation] = createSignal("");
  const [weddingFollowUpGuests, setWeddingFollowUpGuests] = createSignal("");
  const [weddingFollowUpBudget, setWeddingFollowUpBudget] = createSignal("");
  const [weddingFollowUpPriorities, setWeddingFollowUpPriorities] = createSignal("");
  const [weddingFollowUpAtmosphere, setWeddingFollowUpAtmosphere] = createSignal("");
  const [weddingFollowUpImageLinks, setWeddingFollowUpImageLinks] = createSignal("");

  async function refreshWeddingProviderCapabilitiesNow(): Promise<WeddingProviderCapabilitiesResponse | null> {
    try {
      const capabilities = await fetchWeddingProviderCapabilities();
      setWeddingProviderCapabilities(capabilities);
      return capabilities;
    } catch {
      return weddingProviderCapabilities();
    }
  }
  const [weddingFollowUpCoupleNames, setWeddingFollowUpCoupleNames] = createSignal("");
  const [weddingFollowUpVendorIds, setWeddingFollowUpVendorIds] = createSignal<string[]>([]);
  const [weddingFollowUpVowPreference, setWeddingFollowUpVowPreference] = createSignal("");
  const [weddingFollowUpVowStyle, setWeddingFollowUpVowStyle] = createSignal("");
  const [weddingFollowUpRelationshipFacts, setWeddingFollowUpRelationshipFacts] = createSignal("");
  const [weddingFollowUpVowChecklist, setWeddingFollowUpVowChecklist] = createSignal("");
  const [weddingFollowUpNoim, setWeddingFollowUpNoim] = createSignal("");
  const [weddingFollowUpCelebrant, setWeddingFollowUpCelebrant] = createSignal("");
  const [weddingFollowUpRequested, setWeddingFollowUpRequested] = createSignal(false);
  const [weddingFollowUpStarterIntents, setWeddingFollowUpStarterIntents] = createSignal<WeddingTemplateStarterIntent[]>(["venue_search"]);
  const [weddingContextHydratedKey, setWeddingContextHydratedKey] = createSignal("");
  const [weddingExtractionText, setWeddingExtractionText] = createSignal("");
  const [weddingExtractionNotice, setWeddingExtractionNotice] = createSignal("");
  const [weddingImportNotice, setWeddingImportNotice] = createSignal("");
  const [weddingImportRunning, setWeddingImportRunning] = createSignal(false);

  function applyWeddingVendorSearchLaunch(launch: WeddingVendorSearchLaunchState | null) {
    const query = launch?.query.trim();
    if (!query) return;
    setWeddingVendorSearchQuery(query);
    setWeddingVendorSearchResultAction(null);
    setWeddingVendorSearchResultActionSuppressed(true);
    setWeddingVendorSearchCategoryScope(null);
    setWeddingWorkspaceMenu("home");
    setWeddingVendorSearchNotice("Vendor search is ready. Review the query, then run live search when you are ready.");
  }

  function updateWeddingVendorSearchQueryFromInput(query: string) {
    const editState = buildWeddingVendorSearchQueryEditState(query);
    setWeddingVendorSearchQuery(query);
    setWeddingVendorSearchCategoryScope(null);
    setWeddingVendorSearchResultAction(editState.resultAction);
    setWeddingVendorSearchResultActionSuppressed(true);
    setWeddingVendorSearchNotice(editState.notice);
  }

  function currentWeddingFollowUpDraft(responseWorkspaceId: string): WeddingTemplateFollowUpDraft {
    const vowPreference = weddingFollowUpVowPreference();
    const noimDownloaded = weddingFollowUpNoim();
    return {
      responseWorkspaceId,
      dateOrSeason: weddingFollowUpDate(),
      location: weddingFollowUpLocation(),
      guestCount: weddingFollowUpGuests(),
      budgetComfort: weddingFollowUpBudget(),
      prioritiesCsv: weddingFollowUpPriorities(),
      atmosphereDescription: weddingFollowUpAtmosphere(),
      inspirationImageUrlsText: weddingFollowUpImageLinks(),
      coupleNames: weddingFollowUpCoupleNames(),
      vendorCategoryIds: weddingFollowUpVendorIds(),
      vowPreference: (vowPreference === "standard"
        || vowPreference === "create"
        || vowPreference === "undecided")
        ? vowPreference
        : "",
      vowStyle: weddingFollowUpVowStyle(),
      relationshipFactsCsv: weddingFollowUpRelationshipFacts(),
      vowChecklistCsv: weddingFollowUpVowChecklist(),
      noimDownloaded: (noimDownloaded === "yes"
        || noimDownloaded === "no"
        || noimDownloaded === "unknown")
        ? noimDownloaded
        : "",
      celebrantPath: weddingFollowUpCelebrant(),
      requested: weddingFollowUpRequested(),
      savedAt: new Date().toISOString(),
    };
  }

  function hydrateWeddingFollowUpDraftFromApprovedContext(draft: WeddingTemplateFollowUpDraft) {
    const merged = mergeWeddingTemplateFollowUpDraftWithApprovedContext({
      current: currentWeddingFollowUpDraft(draft.responseWorkspaceId),
      approved: draft,
    });
    setWeddingFollowUpDate(merged.dateOrSeason);
    setWeddingFollowUpLocation(merged.location);
    setWeddingFollowUpGuests(merged.guestCount);
    setWeddingFollowUpBudget(merged.budgetComfort);
    setWeddingFollowUpPriorities(merged.prioritiesCsv);
    setWeddingFollowUpAtmosphere(merged.atmosphereDescription);
    setWeddingFollowUpImageLinks(merged.inspirationImageUrlsText);
    setWeddingFollowUpCoupleNames(merged.coupleNames);
    setWeddingFollowUpVendorIds(merged.vendorCategoryIds);
    setWeddingFollowUpVowPreference(merged.vowPreference);
    setWeddingFollowUpVowStyle(merged.vowStyle);
    setWeddingFollowUpRelationshipFacts(merged.relationshipFactsCsv);
    setWeddingFollowUpVowChecklist(merged.vowChecklistCsv);
    setWeddingFollowUpNoim(merged.noimDownloaded);
    setWeddingFollowUpCelebrant(merged.celebrantPath);
    setWeddingFollowUpRequested(merged.requested);
  }

  const weddingStorageUserId = createMemo(() => bootstrap()?.user?.id ?? null);
  const weddingStorageUserEmail = createMemo(() => bootstrap()?.user?.email ?? "");
  const weddingSignedIn = createMemo(() => Boolean(bootstrap()?.user && bootstrap()?.user.auth_provider !== "guest"));
  const weddingVendorSmokeTestAvailable = createMemo(() => weddingSignedIn());
  function closeWeddingWalkthrough() {
    saveWeddingPlannerWalkthroughSeen(weddingStorageUserId());
    setShowWeddingWalkthrough(false);
  }

  function focusWeddingUploadFilesControl() {
    window.setTimeout(() => {
      weddingUploadFilesControlRef?.scrollIntoView({ behavior: "smooth", block: "center" });
      weddingUploadFilesControlRef?.focus({ preventScroll: true });
    }, 0);
  }
  const [weddingArrivalMenuAppliedKey, setWeddingArrivalMenuAppliedKey] = createSignal<string | null>(null);
  createEffect(() => {
    const intent = weddingNavigationIntent();
    const userId = weddingStorageUserId();
    if (!intent || intent.surface !== "planning_files" || !weddingSignedIn()) {
      setWeddingVendorDirectory([]);
      setWeddingVendorDirectoryRequestKey("");
      return;
    }
    const requestKey = `${userId ?? "signed-in"}:${intent.weddingPlanId}:${intent.responseWorkspaceId}`;
    if (weddingVendorDirectoryRequestKey() === requestKey) return;
    setWeddingVendorDirectoryRequestKey(requestKey);
    void refreshWeddingVendorDirectory(requestKey);
  });
  createEffect(() => {
    const intent = weddingNavigationIntent();
    const userId = weddingStorageUserId();
    if (!intent || intent.surface !== "planning_files" || !weddingSignedIn()) {
      setWeddingGmailStatus(null);
      setWeddingGmailStatusRequestKey("");
      return;
    }
    const requestKey = `${userId ?? "signed-in"}:${intent.weddingPlanId}:gmail`;
    if (weddingGmailStatusRequestKey() === requestKey) return;
    setWeddingGmailStatusRequestKey(requestKey);
    void fetchGmailStatus("integration")
      .then((status) => {
        if (weddingGmailStatusRequestKey() === requestKey) setWeddingGmailStatus(status);
      })
      .catch(() => {
        if (weddingGmailStatusRequestKey() === requestKey) {
          setWeddingGmailStatus({ connected: false, gmail_email: "", configured: true });
        }
      });
  });
  createEffect(() => {
    const intent = weddingNavigationIntent();
    const userId = weddingStorageUserId();
    if (!intent || intent.surface !== "planning_files" || !weddingSignedIn()) {
      setWeddingProviderCapabilities(null);
      setWeddingProviderCapabilitiesRequestKey("");
      return;
    }
    const requestKey = `${userId ?? "signed-in"}:${intent.weddingPlanId}:provider-capabilities`;
    if (weddingProviderCapabilitiesRequestKey() === requestKey) return;
    setWeddingProviderCapabilitiesRequestKey(requestKey);
    void fetchWeddingProviderCapabilities()
      .then((capabilities) => {
        if (weddingProviderCapabilitiesRequestKey() === requestKey) setWeddingProviderCapabilities(capabilities);
      })
      .catch(() => {
        if (weddingProviderCapabilitiesRequestKey() === requestKey) setWeddingProviderCapabilities(null);
      });
  });
  createEffect(() => {
    const intent = weddingNavigationIntent();
    const arrivalMenu = weddingWorkspaceMenuForArrival(intent);
    const arrivalKey = weddingWorkspaceArrivalMenuApplyKey(intent, arrivalMenu);
    if (!arrivalKey || !arrivalMenu) return;
    if (weddingArrivalMenuAppliedKey() === arrivalKey) return;
    setWeddingArrivalMenuAppliedKey(arrivalKey);
    if (weddingWorkspaceMenu() !== arrivalMenu) setWeddingWorkspaceMenu(arrivalMenu);
  });
  const [weddingTemplateHomeLaunchKey, setWeddingTemplateHomeLaunchKey] = createSignal<string | null>(null);
  createEffect(() => {
    const launchKey = weddingTemplateHomeResetKey(weddingNavigationIntent());
    if (!launchKey) return;
    if (weddingTemplateHomeLaunchKey() === launchKey) return;
    setWeddingTemplateHomeLaunchKey(launchKey);
    if (weddingWorkspaceMenu() !== "home") setWeddingWorkspaceMenu("home");
  });
  createEffect(() => {
    const refresh = weddingRefreshState();
    if (!refresh || refresh.status === "skipped") return;
    void recordWeddingVendorRepliesFromMessages(refresh.messages, weddingVendorDirectory());
  });
  const weddingApprovalHandlers = createMemo(() => ({
    ...buildWeddingDefaultApprovalExecutionHandlers(),
    ...buildWeddingGmailApprovalExecutionHandlers(async (input) => {
      const response = await sendGmailApprovedDraft({
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        thread_id: input.threadId,
        in_reply_to: input.inReplyTo,
        references: input.references,
      });
      return weddingGmailDraftSendResultFromApiResponse(response);
    }),
  }));
  const weddingTemplateLaunch = createMemo(() => {
    const intent = weddingNavigationIntent();
    if (!intent || intent.surface !== "planning_files" || intent.sourceResponseId) return null;
    return buildWeddingTemplateLaunchState({
      weddingPlanId: intent.weddingPlanId,
      responseWorkspaceId: intent.responseWorkspaceId,
      sourceResponseId: intent.sourceResponseId,
    });
  });
  const weddingPersistedWorkspace = createMemo(() => {
    const intent = weddingNavigationIntent();
    if (!intent || intent.surface !== "planning_files") return null;
    weddingProjectionRefreshKey();
    const refreshed = weddingRefreshState();
    return buildWeddingPersistedWorkspaceState({
      messages: refreshed?.messages ?? bootstrap()?.messages ?? [],
      weddingPlanId: intent.weddingPlanId,
      responseWorkspaceId: intent.responseWorkspaceId,
      sourceResponseId: intent.sourceResponseId,
    });
  });
  // Single arbiter for the wedding intake: once a real, persisted workspace exists for this
  // plan, neither intake variant shows again, no matter how the user re-arrives (wedding-site
  // relaunch or the in-app Templates gallery both dispatch a fresh, sourceResponseId-less
  // intent that would otherwise re-trigger the form on top of an already-populated workspace).
  const weddingIntakeActive = createMemo(() => shouldShowWeddingFirstRunIntake({
    hasTemplateLaunch: Boolean(weddingTemplateLaunch()),
    hasPersistedWorkspaceContent: Boolean(weddingPersistedWorkspace()?.hasPersistedData),
    followUpRequested: weddingFollowUpRequested(),
  }));
  // Which intake variant a signed-in user has already been shown is the account's, not the
  // browser's, so it can't flip on a second device. Checked once per plan; a local lock (or
  // the current entry source) is used optimistically while the account check is in flight, so
  // a repeat visit on the SAME browser never has to wait on the network to show something.
  const [weddingAccountOnboardingRequestedPlanId, setWeddingAccountOnboardingRequestedPlanId] = createSignal<string | null>(null);
  // Set only once the fetch actually completes (success or failure) — distinct from the
  // "requested" signal above, which fires immediately and only guards against re-fetching.
  const [weddingAccountOnboardingResolvedPlanId, setWeddingAccountOnboardingResolvedPlanId] = createSignal<string | null>(null);
  const [weddingAccountOnboardingVariant, setWeddingAccountOnboardingVariant] = createSignal<WeddingEntrySource | null>(null);
  createEffect(() => {
    const launch = weddingTemplateLaunch();
    if (!launch || !weddingIntakeActive() || !weddingSignedIn()) return;
    const planId = launch.metadata.weddingPlanId;
    if (weddingAccountOnboardingRequestedPlanId() === planId) return;
    setWeddingAccountOnboardingRequestedPlanId(planId);
    void fetchWeddingOnboardingState(planId)
      .then((response) => setWeddingAccountOnboardingVariant(response.onboardingState?.intakeVariant ?? null))
      .catch(() => setWeddingAccountOnboardingVariant(null))
      .finally(() => setWeddingAccountOnboardingResolvedPlanId(planId));
  });
  // Which intake variant to show is locked in per wedding plan the first time it's decided,
  // so a mid-flow entry-source change (e.g. the same browser later visiting the Templates
  // gallery) can't flip the form out from under a user partway through answering it. For a
  // signed-in user whose account has no confirmed variant yet AND no local trace on this
  // browser either (a genuinely first-ever visit, on any device), nothing shows until the
  // account check resolves, rather than briefly showing one variant and swapping to the other.
  const weddingIntakeVariant = createMemo<WeddingEntrySource | null>(() => {
    const launch = weddingTemplateLaunch();
    if (!launch || !weddingIntakeActive()) return null;
    const planId = launch.metadata.weddingPlanId;
    const accountVariant = weddingAccountOnboardingVariant();
    if (accountVariant) return accountVariant;
    const localVariant = loadWeddingIntakeVariantShown(planId);
    if (localVariant) return localVariant;
    if (weddingSignedIn() && weddingAccountOnboardingResolvedPlanId() !== planId) return null;
    return loadWeddingEntrySource() === "wedding_site" ? "wedding_site" : "generic";
  });
  createEffect(() => {
    const launch = weddingTemplateLaunch();
    const variant = weddingIntakeVariant();
    if (!launch || !variant) return;
    saveWeddingIntakeVariantShown(launch.metadata.weddingPlanId, variant);
    if (weddingSignedIn()) {
      const entrySource = loadWeddingEntrySource() ?? "generic";
      void saveWeddingOnboardingState(launch.metadata.weddingPlanId, variant, entrySource)
        .then((response) => {
          if (response.onboardingState) setWeddingAccountOnboardingVariant(response.onboardingState.intakeVariant);
        })
        .catch(() => {});
    }
  });
  const activeWeddingLaunch = createMemo(() => (
    weddingIntakeActive() ? weddingTemplateLaunch() : null
  ));
  const weddingTemplateFollowUp = createMemo(() => {
    const intent = weddingNavigationIntent();
    if (!intent || intent.surface !== "planning_files" || intent.sourceResponseId || !weddingFollowUpRequested()) {
      return null;
    }
    return buildWeddingTemplateFollowUpState({
      weddingPlanId: intent.weddingPlanId,
      responseWorkspaceId: intent.responseWorkspaceId,
      sourceResponseId: intent.sourceResponseId,
      dateOrSeason: weddingFollowUpDate(),
      location: weddingFollowUpLocation(),
      guestCount: weddingFollowUpGuests(),
      budgetComfort: weddingFollowUpBudget(),
      topPriorities: weddingFollowUpPriorities().split(",").map((priority) => priority.trim()).filter(Boolean),
      atmosphereDescription: weddingFollowUpAtmosphere(),
      inspirationImageUrls: linesFromText(weddingFollowUpImageLinks()),
      familyOrStakeholderRoles: weddingFollowUpCoupleNames(),
      vendorCategories: weddingFollowUpVendorIds(),
      vendorPreferences: [
        weddingFollowUpBudget() ? `Budget comfort: ${weddingFollowUpBudget()}` : null,
        weddingFollowUpPriorities() ? `Priorities: ${weddingFollowUpPriorities()}` : null,
        weddingFollowUpAtmosphere() ? `Atmosphere: ${weddingFollowUpAtmosphere()}` : null,
      ].filter(Boolean).join("; "),
      vowPreference: weddingFollowUpVowPreference() || "undecided",
      vowStyle: weddingFollowUpVowStyle(),
      relationshipFactLabels: weddingFollowUpRelationshipFacts().split("\n").map((fact) => fact.trim()).filter(Boolean),
      vowChecklistItems: weddingFollowUpVowChecklist().split("\n").map((item) => item.trim()).filter(Boolean),
      countryCode: /\b(australia|nsw|vic|qld|wa|sa|tas|act|nt)\b/i.test(weddingFollowUpLocation()) ? "AU" : null,
      noimDownloaded: normalizedNoimAnswer(weddingFollowUpNoim()),
      celebrantPath: weddingFollowUpCelebrant() || null,
      starterIntents: weddingFollowUpStarterIntents(),
      projectionStorage: localStorage,
    });
  });
  const weddingArrivalBanner = createMemo(() =>
    buildWeddingNavigationArrivalBannerState(weddingNavigationIntent()),
  );
  const weddingRichResponse = createMemo(() =>
    weddingTemplateFollowUp()?.richResponse ?? weddingTemplateLaunch()?.richResponse ?? null,
  );
  const weddingLiveVendorSearchReadiness = createMemo(() => buildWeddingLiveWorkflowReadinessState({
    workflow: "vendor_search",
    dateOrSeason: weddingFollowUpDate(),
    location: weddingFollowUpLocation(),
    guestCount: weddingFollowUpGuests(),
    budgetComfort: weddingFollowUpBudget(),
    prioritiesCsv: weddingFollowUpPriorities() || currentWeddingVendorSearchQuery(),
    vendorCategories: weddingVendorSelectionLabels(weddingFollowUpVendorIds()).length > 0
      ? weddingVendorSelectionLabels(weddingFollowUpVendorIds())
      : currentWeddingVendorSearchQuery()
        ? ["Custom vendor search"]
        : [],
  }));
  const weddingWorkspace = createMemo(() => {
    const intent = weddingNavigationIntent();
    if (!intent || intent.surface !== "planning_files") return null;
    weddingProjectionRefreshKey();
    weddingLocalDateRefreshKey();
    weddingLocalBudgetRefreshKey();
    weddingImportRefreshKey();
    const importedArtifacts = loadWeddingImportedArtifacts(intent.responseWorkspaceId, localStorage, weddingStorageUserId());
    const importedArtifactInputs = importedArtifacts.map((artifact) => artifact.input);

    const persisted = weddingPersistedWorkspace();
    if (!persisted) return null;
    if (persisted.hasPersistedData) {
      const persistedSummaries = normalizeWeddingArtifactSummaries(persisted.artifacts);
      const scheduleItems = withLocalWeddingDateSchedule(
        persisted.scheduleItems,
        persisted.metadata,
        intent.responseWorkspaceId,
      );
      const graph = buildWeddingRecommendationExplanationState(buildWeddingKnowledgeGraphState({
        metadata: persisted.metadata,
        artifacts: persistedSummaries,
        scheduleItems,
        taskItems: persisted.taskItems,
        decisions: weddingPersistedDecisionRecordsToGraphDecisions(persisted.decisionRecords),
        seatingConstraints: persisted.seatingConstraints,
        seatingOptimizations: persisted.seatingOptimizations,
        seatingDraftArchiveFingerprints: persisted.seatingDraftArchives.map((archive) => archive.fingerprint),
        inspirationItems: persisted.inspirationItems,
      }));
      return buildWeddingResponseWorkspaceViewState({
        metadata: persisted.metadata,
        artifacts: [...persisted.artifacts, ...importedArtifactInputs],
        adminDataConsentEnabled: weddingAdminDataConsentEnabled(),
        contextItems: persisted.contextItems,
        approvalReceipts: persisted.approvalReceipts,
        decisionRecords: persisted.decisionRecords,
        decisionDeferrals: persisted.decisionDeferrals,
        boundaryObjects: persisted.boundaryObjects,
        seatingConstraints: persisted.seatingConstraints,
        seatingOptimizations: persisted.seatingOptimizations,
        seatingDraftArchives: persisted.seatingDraftArchives,
        inspirationItems: persisted.inspirationItems,
        query: weddingWorkspaceQuery(),
        activeArtifactId: activeWeddingArtifactId() ?? intent.artifactId,
        recommendations: graph,
        scheduleItems,
        generatedArtifacts: importedArtifacts,
        taskItems: persisted.taskItems,
        weddingVendors: weddingVendorDirectory(),
        afpMessages: weddingRefreshState()?.messages ?? bootstrap()?.messages ?? [],
        nowIso: new Date().toISOString(),
        projectionStorage: localStorage,
      });
    }

    const launch = weddingTemplateLaunch();
    const followUp = weddingTemplateFollowUp();
    if (followUp) {
      const scheduleItems = withLocalWeddingDateSchedule(
        followUp.scheduleItems,
        followUp.metadata,
        intent.responseWorkspaceId,
      );
      return withWeddingAdminDataConsent(buildWeddingResponseWorkspaceViewState({
        metadata: followUp.metadata,
        artifacts: [...followUp.artifacts, ...importedArtifactInputs],
        generatedArtifacts: [...followUp.generatedArtifacts, ...importedArtifacts],
        contextItems: [followUp.contextProjection],
        decisionDeferrals: persisted.decisionDeferrals,
        seatingConstraints: persisted.seatingConstraints,
        seatingOptimizations: persisted.seatingOptimizations,
        seatingDraftArchives: persisted.seatingDraftArchives,
        inspirationItems: persisted.inspirationItems,
        query: weddingWorkspaceQuery(),
        activeArtifactId: activeWeddingArtifactId() ?? intent.artifactId,
        scheduleItems,
        taskItems: followUp.taskItems,
        weddingVendors: weddingVendorDirectory(),
        nowIso: new Date().toISOString(),
        projectionStorage: localStorage,
      }), weddingAdminDataConsentEnabled());
    }
    if (launch) {
      const scheduleItems = withLocalWeddingDateSchedule(
        [],
        launch.metadata,
        intent.responseWorkspaceId,
      );
      return withWeddingAdminDataConsent(buildWeddingResponseWorkspaceViewState({
        metadata: launch.metadata,
        artifacts: [...launch.artifactGeneration.artifactInputs, ...importedArtifactInputs],
        generatedArtifacts: [...launch.artifactGeneration.artifacts, ...importedArtifacts],
        decisionDeferrals: persisted.decisionDeferrals,
        seatingConstraints: persisted.seatingConstraints,
        seatingOptimizations: persisted.seatingOptimizations,
        seatingDraftArchives: persisted.seatingDraftArchives,
        inspirationItems: persisted.inspirationItems,
        query: weddingWorkspaceQuery(),
        activeArtifactId: activeWeddingArtifactId() ?? intent.artifactId,
        scheduleItems,
        weddingVendors: weddingVendorDirectory(),
        nowIso: new Date().toISOString(),
        projectionStorage: localStorage,
      }), weddingAdminDataConsentEnabled());
    }

    const demo = buildWeddingTemplateDemoState();
    const metadata = normalizeWeddingPlanningMetadata({
      ...demo.entry.metadata,
      weddingPlanId: intent.weddingPlanId,
      responseWorkspaceId: intent.responseWorkspaceId,
      sourceResponseId: intent.sourceResponseId,
      supertags: [...demo.entry.metadata.supertags, "demo:wedding_workspace_bridge"],
    });
    const generatedArtifacts = demo.artifactGeneration.artifacts
      .map((artifact) => rescopeWeddingArtifact(artifact, metadata))
      .filter((artifact): artifact is WeddingGeneratedArtifact => artifact !== null);
    const artifacts = [...generatedArtifacts.map((artifact) => artifact.input), ...importedArtifactInputs];
    const scheduleItems = demo.scheduleItems.map((item) => ({
      ...item,
      metadata,
    }));
    const scheduleItemsWithLocalDate = withLocalWeddingDateSchedule(
      scheduleItems,
      metadata,
      intent.responseWorkspaceId,
    );
    const taskItems = demo.taskItems.map((item) => ({
      ...item,
      metadata,
    }));
    const graph = buildWeddingRecommendationExplanationState(buildWeddingKnowledgeGraphState({
      metadata,
      artifacts: generatedArtifacts.map((artifact) => artifact.summary),
      scheduleItems: scheduleItemsWithLocalDate,
      taskItems,
      decisions: [{ title: "Choose venue", status: "open", constrains: ["Budget allocation"], requiresApproval: true }],
      risks: [{ title: "Sample availability is not verified", severity: "medium", evidence: "Demo vendors are synthetic." }],
    }));

    return buildWeddingResponseWorkspaceViewState({
      metadata,
      artifacts,
      adminDataConsentEnabled: weddingAdminDataConsentEnabled(),
      query: weddingWorkspaceQuery(),
      activeArtifactId: activeWeddingArtifactId() ?? intent.artifactId,
      recommendations: graph,
      decisionDeferrals: persisted.decisionDeferrals,
      seatingConstraints: persisted.seatingConstraints,
      seatingOptimizations: persisted.seatingOptimizations,
      seatingDraftArchives: persisted.seatingDraftArchives,
      inspirationItems: persisted.inspirationItems,
      generatedArtifacts: [...generatedArtifacts, ...importedArtifacts],
      scheduleItems: scheduleItemsWithLocalDate,
      taskItems,
      weddingVendors: weddingVendorDirectory(),
      nowIso: new Date().toISOString(),
      projectionStorage: localStorage,
    });
  });
  const standaloneWeddingRichResponse = createMemo(() =>
    weddingWorkspace() ? null : weddingRichResponse(),
  );

  function currentWeddingVendorSearchResultAction(): WeddingVendorSearchResultAction | null {
    const explicit = weddingVendorSearchResultAction();
    if (explicit) return explicit;
    if (weddingVendorSearchResultActionSuppressed()) return null;
    return buildWeddingVendorSearchResultActionFromArtifacts(weddingWorkspace()?.workspace.results ?? []);
  }

  function openWeddingVendorSearchResult(action: WeddingVendorSearchResultAction) {
    setActiveWeddingArtifactId(action.artifactId);
    setWeddingWorkspaceMenu(action.menu);
  }

  const weddingVendorEndToEndValidation = createMemo(() => {
    const intent = weddingNavigationIntent();
    const state = weddingWorkspace();
    if (!intent || intent.surface !== "planning_files" || !state || !weddingVendorSmokeTestAvailable()) return null;
    const importedArtifacts = loadWeddingImportedArtifacts(
      intent.responseWorkspaceId,
      localStorage,
      weddingStorageUserId(),
    );
    const quoteFlows = state.vendorQuoteReplyFlows;
    const smokeQuoteFlow = quoteFlows.find((flow) =>
      flow.recipient.trim().toLowerCase() === WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL
    );
    const smokeFixturePresent = importedArtifacts.some((artifact) => isWeddingVendorSmokeFixtureArtifact(artifact))
      || Boolean(smokeQuoteFlow);
    const quoteFlow = smokeQuoteFlow ?? quoteFlows[0] ?? null;
    const configuredProviderKinds = weddingConfiguredVendorSearchProviderKinds(weddingProviderCapabilities());
    const configuredProviderStatuses = (weddingProviderCapabilities()?.providers ?? [])
      .filter((provider) => configuredProviderKinds.includes(provider.kind as WeddingVendorSearchProviderKind));
    const adminCredentialPolicyReady = configuredProviderStatuses.some((provider) =>
      provider.credentialConfigured === true
        && provider.sharedCreditEnabled === true
        && provider.configured === true,
    );
    const liveVendorArtifactSaved = hasWeddingVendorSearchArtifactSummary(state.workspace.results);
    const liveVendorComparisonSaved = hasWeddingVendorComparisonArtifactSummary(state.workspace.results);
    const topFiveComparisonExpansionAvailable = hasWeddingVendorTopFiveComparisonExpansion(state.workspace.results);
    const vendorApprovalCard = state.projectionQueue?.vendorApprovalCard ?? null;
    const dynamicVendorDecisionSurfaceVisible = Boolean(vendorApprovalCard)
      || (state.projectionQueue?.vendorDecisionPolicyCards.length ?? 0) > 0;
    const selectedVendorDraftTaskMetadata = state.planningTaskItems
      .map((item) => item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
        ? item.metadata as Record<string, unknown>
        : null)
      .filter((metadata): metadata is Record<string, unknown> =>
        metadata?.vendor_outreach_from_selected_decision === true,
      );
    const selectedVendorDraftTasksProjected = (state.projectionQueue?.vendorOutreachDraftCards.length ?? 0) > 0
      || selectedVendorDraftTaskMetadata.length > 0;
    const selectedVendorDraftsApprovalGated = (state.projectionQueue?.vendorOutreachDraftCards.some((card) =>
      card.approvalRequired === true && /no external send/i.test(card.externalSendGuardLabel)
    ) ?? false)
      || selectedVendorDraftTaskMetadata.some((metadata) =>
        (metadata.vendor_outreach_draft_requires_approval === true || metadata.approval_required_before_outreach === true)
          && metadata.no_external_send_without_approval === true
          && (metadata.vendor_outreach_provider_receipt_required === true || metadata.provider_receipt_required === true),
      );
    const selectedComparisonVendorsConfirmed = dynamicVendorDecisionSurfaceVisible
      || state.personalOsProjection.rankedItems.some((item) =>
        /confirm selected wedding option/i.test(item.title)
          && /top vendor comparison|vendor comparison/i.test(`${item.sourceSurface} ${item.evidenceLabels.join(" ")}`),
      );
    const unselectedVendorQueueSuppressed = selectedComparisonVendorsConfirmed
      && !state.planningTaskItems.some((item) =>
        /choose preferred vendors from the top-three comparison/i.test(item.title)
          || (item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
            && (item.metadata as Record<string, unknown>).vendor_comparison_decision_task === true),
      );
    const durableSendReceiptRecorded = quoteFlows.some((flow) =>
      Boolean(flow.sentReceiptId)
        || (flow.execution?.status === "executed"
          && flow.execution.receipt.status === "executed"
          && flow.execution.receipt.actionKind === "send_email")
    ) || state.approvalReceiptCards.some((receipt) =>
      /sent|executed|provider|gmail/i.test(`${receipt.statusLabel} ${receipt.detailLabel} ${receipt.metadataLabels.join(" ")}`)
    );
    const sentQuoteReplyHistoryVisible = state.vendorQuoteReplyLogFlows.some((flow) =>
      flow.stage === "sent" && (Boolean(flow.sentReceiptId) || Boolean(flow.execution))
    );
    const sentQuoteReplyLeavesLiveQueue = durableSendReceiptRecorded
      && sentQuoteReplyHistoryVisible
      && state.activeVendorQuoteReplyFlows.every((flow) => flow.stage !== "sent" && !flow.sentReceiptId);
    const followUpTaskProjected = state.planningTaskItems.some((item) => {
      const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
        ? item.metadata as Record<string, unknown>
        : {};
      return metadata.vendor_search_review_task === true
        || metadata.contact_follow_up_projection === true
        || /vendor|quote|follow-up|follow up|reply/i.test(`${item.title} ${item.notes ?? ""} ${item.kind}`);
    });
    const responseEvidenceRecorded = state.vendorContactCards.some((card) =>
      card.actionMode === "reply_recorded"
        || /reply|response|received|closed/i.test(`${card.statusLabel} ${card.replyLabel ?? ""} ${card.detailLabel}`)
    );
    const draftReplyContextual = quoteFlows.some((flow) =>
      flow.draftBody.trim().length > 0
        && flow.recommendationRationale.trim().length > 0
        && /quote|amount|budget|inclusion|valid|deposit|payment|cancellation|overtime|travel|exclusion/i.test(
          `${flow.draftBody}\n${flow.recommendationRationale}`,
        )
    );
    const quoteAttachmentRequiresExtraction = state.vendorQuoteAttachmentParserStates.some((parser) =>
      parser.status === "request_ready"
    );
    const quoteAttachmentExtractionReady = quoteAttachmentRequiresExtraction
      ? state.vendorQuoteAttachmentParserStates.every((parser) => parser.status !== "request_ready")
      : state.vendorQuoteAttachmentParserStates.some((parser) => parser.status === "already_extracted");
    const gmailOAuthRedirectVerified = weddingGmailStatus()?.connected === true;
    const liveProviderServerProbePassed = configuredProviderStatuses.some((provider) =>
      /verified|ready|ok|connected/i.test(provider.verificationStatus ?? "")
        && !/unverified|needs_attention|blocked|error/i.test(provider.verificationStatus ?? ""),
    ) || (liveVendorArtifactSaved && liveVendorComparisonSaved);
    const deployedWorkspaceSmokeTestPassed = liveProviderServerProbePassed
      && selectedComparisonVendorsConfirmed
      && selectedVendorDraftsApprovalGated
      && gmailOAuthRedirectVerified
      && durableSendReceiptRecorded
      && sentQuoteReplyHistoryVisible
      && responseEvidenceRecorded;

    return buildWeddingVendorEndToEndValidationState({
      expectedPlannerEmail: null,
      actualPlannerEmail: weddingStorageUserEmail(),
      expectedTestVendorEmail: smokeFixturePresent ? WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL : null,
      quoteRecipientEmail: quoteFlow?.recipient ?? null,
      testVendorCleanupRequired: smokeFixturePresent,
      testVendorCleanupConfirmed: importedArtifacts.every((artifact) => !isWeddingVendorSmokeFixtureArtifact(artifact)),
      vendorSearchReadiness: weddingLiveVendorSearchReadiness(),
      vendorSearchLaunchQuery: currentWeddingVendorSearchQuery(),
      vendorProviderConfigured: configuredProviderKinds.length > 0,
      liveVendorArtifactSaved,
      liveVendorComparisonSaved,
      vendorSearchResultOpenTargetAvailable: Boolean(currentWeddingVendorSearchResultAction()),
      topFiveComparisonExpansionAvailable,
      selectedComparisonVendorsConfirmed,
      unselectedVendorQueueSuppressed,
      dynamicVendorDecisionSurfaceVisible,
      vendorApprovalCardModeled: Boolean(vendorApprovalCard),
      vendorApprovalCardCtaCopy: vendorApprovalCard?.ctaCopy ?? null,
      selectedVendorDraftTasksProjected,
      selectedVendorDraftsApprovalGated,
      quoteReplyFlowCount: quoteFlows.length,
      emailProviderReady: weddingGmailStatus()?.connected === true,
      quoteAttachmentRequiresExtraction,
      quoteAttachmentExtractionReady,
      draftReplyContextual,
      durableSendReceiptRecorded,
      sentQuoteReplyLeavesLiveQueue,
      sentQuoteReplyHistoryVisible,
      followUpTaskProjected,
      responseEvidenceRecorded,
      adminCredentialPolicyReady,
      liveProviderServerProbePassed,
      gmailOAuthRedirectVerified,
      deployedWorkspaceSmokeTestPassed,
    });
  });
  createEffect(() => {
    const workspace = weddingWorkspace();
    const contextCard = workspace?.contextCards.find((card) => card.planningContext) ?? null;
    const responseWorkspaceId = workspace?.workspace.metadata.responseWorkspaceId ?? "";
    if (!contextCard || !responseWorkspaceId) return;
    const key = `${responseWorkspaceId}:${contextCard.id}`;
    if (weddingContextHydratedKey() === key) return;
    hydrateWeddingFollowUpDraftFromApprovedContext(weddingTemplateFollowUpDraftFromPlanningContext(
      responseWorkspaceId,
      contextCard.planningContext,
    ));
    setWeddingContextHydratedKey(key);
  });
  const weddingVendorSmokeCleanupGate = createMemo(() => {
    const intent = weddingNavigationIntent();
    weddingImportRefreshKey();
    if (!intent || intent.surface !== "planning_files" || !weddingSignedIn()) {
      return buildWeddingVendorSmokeFixtureCleanupGateState({ artifacts: [] });
    }
    return buildWeddingVendorSmokeFixtureCleanupGateState({
      artifacts: loadWeddingImportedArtifacts(intent.responseWorkspaceId, localStorage, weddingStorageUserId()),
    });
  });
  const weddingVendorSearchBlockedReason = createMemo(() =>
    weddingVendorSmokeCleanupGate().status === "blocked"
      ? weddingVendorSmokeCleanupGate().blockerLabel
      : weddingVendorSearchProviderBlockedReason(weddingProviderCapabilities()),
  );
  const weddingFirstIntakeComplete = createMemo(() => {
    const workspace = weddingWorkspace();
    return weddingFollowUpRequested()
      || Boolean(weddingPersistedWorkspace()?.hasPersistedData)
      || Boolean(workspace?.contextCards.some((card) => card.planningContext));
  });

  createEffect(() => {
    const workspace = weddingWorkspace();
    if (!shouldAutoShowWeddingPlannerWalkthrough({
      alreadyChecked: weddingWalkthroughChecked(),
      hasWeddingWorkspace: Boolean(workspace),
      firstIntakeComplete: weddingFirstIntakeComplete(),
      userId: weddingStorageUserId(),
    })) return;
    setWeddingWalkthroughChecked(true);
    setShowWeddingWalkthrough(true);
  });

  onMount(() => {
    const menuHandler = (event: Event) => {
      const menu = weddingWorkspaceMenuIdFromEvent(event);
      if (menu) setWeddingWorkspaceMenu(menu);
    };
    window.addEventListener(WEDDING_WORKSPACE_MENU_EVENT, menuHandler);
    onCleanup(() => window.removeEventListener(WEDDING_WORKSPACE_MENU_EVENT, menuHandler));

    const vendorSearchLaunchHandler = (event: Event) => {
      applyWeddingVendorSearchLaunch(weddingVendorSearchLaunchFromEvent(event));
    };
    window.addEventListener(WEDDING_VENDOR_SEARCH_LAUNCH_EVENT, vendorSearchLaunchHandler);
    onCleanup(() => window.removeEventListener(WEDDING_VENDOR_SEARCH_LAUNCH_EVENT, vendorSearchLaunchHandler));
    applyWeddingVendorSearchLaunch(consumeWeddingVendorSearchLaunch());

    const budgetLocalSaveHandler = () => setWeddingLocalBudgetRefreshKey((value) => value + 1);
    window.addEventListener(WEDDING_BUDGET_ALLOCATION_LOCAL_SAVE_EVENT, budgetLocalSaveHandler);
    onCleanup(() => window.removeEventListener(WEDDING_BUDGET_ALLOCATION_LOCAL_SAVE_EVENT, budgetLocalSaveHandler));

    const intent = consumeWeddingNavigationIntent();
    if (intent?.view === "response_queue") {
      setWeddingNavigationIntent(intent);
      const draft = loadWeddingTemplateFollowUpDraft(intent.responseWorkspaceId, localStorage);
      if (draft) {
        setWeddingFollowUpDate(draft.dateOrSeason);
        setWeddingFollowUpLocation(draft.location);
        setWeddingFollowUpGuests(draft.guestCount);
        setWeddingFollowUpBudget(draft.budgetComfort);
        setWeddingFollowUpPriorities(draft.prioritiesCsv);
        setWeddingFollowUpAtmosphere(draft.atmosphereDescription);
        setWeddingFollowUpImageLinks(draft.inspirationImageUrlsText);
        setWeddingFollowUpCoupleNames(draft.coupleNames);
        setWeddingFollowUpVendorIds(draft.vendorCategoryIds);
        setWeddingFollowUpVowPreference(draft.vowPreference);
        setWeddingFollowUpVowStyle(draft.vowStyle);
        setWeddingFollowUpRelationshipFacts(draft.relationshipFactsCsv);
        setWeddingFollowUpVowChecklist(draft.vowChecklistCsv);
        setWeddingFollowUpNoim(draft.noimDownloaded);
        setWeddingFollowUpCelebrant(draft.celebrantPath);
        setWeddingFollowUpRequested(draft.requested);
      }
      void refreshWeddingWorkspaceMessages(intent);
    }
  });

  async function refreshWeddingVendorDirectory(expectedRequestKey = weddingVendorDirectoryRequestKey()) {
    if (!weddingSignedIn()) {
      setWeddingVendorDirectory([]);
      setWeddingVendorDirectoryRequestKey("");
      return;
    }
    try {
      const response = await fetchWeddingVendors({ limit: 200 });
      if (expectedRequestKey && expectedRequestKey !== weddingVendorDirectoryRequestKey()) return;
      setWeddingVendorDirectory(response.vendors);
    } catch {
      if (expectedRequestKey && expectedRequestKey !== weddingVendorDirectoryRequestKey()) return;
      setWeddingVendorDirectory([]);
    }
  }

  async function recordWeddingVendorContactsFromProjection(
    receipt: WeddingProjectionDispatchReceiptState,
  ) {
    if (!weddingSignedIn()) return;
    const projectionQueue = weddingWorkspace()?.projectionQueue;
    const requests = weddingVendorContactProjectionRequests({
      receipt,
      sendInputs: projectionQueue?.dispatchPayload?.sendInputs,
      nowIso: new Date().toISOString(),
    });
    if (requests.length === 0) return;
    await Promise.allSettled(requests.map((request) =>
      recordWeddingVendorContact(request.vendorId, request.body),
    ));
    void refreshWeddingVendorDirectory();
  }

  function vendorReplyKnownContactsFromDirectory(vendors: readonly WeddingVendor[]): WeddingVendorReplyKnownContact[] {
    return vendors.map((vendor) => ({
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      threadId: vendor.userContact?.threadId,
      receiptRef: vendor.userContact?.receiptRef,
    }));
  }

  function vendorReplyContactSyncKey(request: ReturnType<typeof weddingVendorReplyProjectionRequests>[number]): string {
    return [
      request.vendorId,
      request.body.thread_id ?? "",
      request.body.receipt_ref ?? "",
      request.body.response_received_at ?? "",
    ].join("|");
  }

  async function recordWeddingVendorRepliesFromMessages(
    messages: WeddingWorkspaceRefreshState["messages"],
    vendors: readonly WeddingVendor[],
  ) {
    if (!weddingSignedIn()) return;
    const knownContacts = vendorReplyKnownContactsFromDirectory(vendors);
    const replies = weddingVendorReplyInputsFromAfpMessages({ messages, knownContacts });
    const requests = weddingVendorReplyProjectionRequests({
      replies,
      knownContacts,
      nowIso: new Date().toISOString(),
    }).filter((request) => {
      const key = vendorReplyContactSyncKey(request);
      if (syncedWeddingVendorReplyContactKeys.has(key)) return false;
      syncedWeddingVendorReplyContactKeys.add(key);
      return true;
    });
    if (requests.length === 0) return;
    await Promise.allSettled(requests.map((request) =>
      recordWeddingVendorContact(request.vendorId, request.body),
    ));
    void refreshWeddingVendorDirectory();
  }

  async function refreshWeddingWorkspaceMessages(
    intent = weddingNavigationIntent(),
  ) {
    if (!intent || intent.surface !== "planning_files" || weddingRefreshRunning()) return;
    setWeddingRefreshRunning(true);
    const state = await loadWeddingWorkspaceRefreshState({
      signedIn: weddingSignedIn(),
      weddingPlanId: intent.weddingPlanId,
      responseWorkspaceId: intent.responseWorkspaceId,
      sourceResponseId: intent.sourceResponseId,
      fallbackMessages: bootstrap()?.messages ?? [],
    });
    setWeddingRefreshState(state);
    setWeddingRefreshRunning(false);
  }

  function weddingWorkspaceRefreshBanner() {
    const state = weddingRefreshState();
    if (weddingRefreshRunning()) {
      return {
        label: "Refreshing wedding documents",
        detail: "Checking saved wedding files, dates, tasks, notes, and approval records.",
        tone: "loading" as const,
        disabled: true,
      };
    }
    if (!state) {
      return {
        label: "Saved wedding documents",
        detail: "Showing starter wedding documents. Refresh to load saved wedding items.",
        tone: "idle" as const,
      };
    }
    if (state.status === "loaded" && state.pagination.hasMore) {
      return {
        label: "Some wedding documents refreshed",
        detail: state.detail,
        tone: "warning" as const,
      };
    }
    return {
      label: state.status === "loaded" ? "Wedding documents refreshed" : state.status === "error" ? "Refresh failed" : "Starter documents",
      detail: state.detail,
      tone: state.status === "loaded" ? "success" as const : state.status === "error" ? "warning" as const : "idle" as const,
    };
  }

  function selectDensityMode(mode: QueueDensity) {
    setDensity(mode);
    saveResponseQueueDensity(mode);
  }

  function runWeddingArrivalAction(action: WeddingArrivalAction) {
    const destination = weddingArrivalActionDestinationView(action);
    if (destination) props.onNavigate?.(destination);
  }

  function runWeddingWorkspaceAction(action: WeddingWorkspaceSidebarAction) {
    const intent = weddingNavigationIntent();
    if (!intent || !action.enabled) return;
    const scopedVendorCategoryId = typeof action.metadata?.vendor_lead_time_category_id === "string"
      ? action.metadata.vendor_lead_time_category_id.trim()
      : "";
    if (action.metadata?.vendor_lead_time_research_task === true && scopedVendorCategoryId) {
      setWeddingVendorSearchCategoryScope([scopedVendorCategoryId]);
      setWeddingVendorSearchResultAction(null);
      setWeddingVendorSearchResultActionSuppressed(true);
      const label = weddingVendorSelectionLabels([scopedVendorCategoryId])[0] ?? scopedVendorCategoryId;
      setWeddingVendorSearchNotice(`Ready to research ${label}. Search will use admin-configured providers and this user's wedding context.`);
    } else if (action.metadata?.vendor_search_scope !== "lead_time_category") {
      setWeddingVendorSearchCategoryScope(null);
    }
    if (
      action.kind === "continue_chat"
      && weddingRecommendationRequestedOutput(action) === "first_recommendation_set"
      && weddingRecommendationDraftReady({
        dateOrSeason: weddingFollowUpDate(),
        location: weddingFollowUpLocation(),
        guestCount: weddingFollowUpGuests(),
        budgetComfort: weddingFollowUpBudget(),
        prioritiesCsv: weddingFollowUpPriorities(),
      })
    ) {
      generateWeddingFollowUp();
      setWeddingWorkspaceMenu("home");
      return;
    }
    if (action.kind === "open_workspace_menu") {
      const menuId = action.metadata?.wedding_workspace_menu;
      if (typeof menuId === "string" && isWeddingWorkspaceMenuId(menuId)) {
        const linkedArtifactId = action.metadata?.linked_artifact_id;
        if (typeof linkedArtifactId === "string" && linkedArtifactId.trim()) {
          setActiveWeddingArtifactId(linkedArtifactId.trim());
        }
        setWeddingWorkspaceMenu(menuId);
      }
      return;
    }
    if (action.kind === "open_budget") setWeddingWorkspaceMenu("budget");
    const workspace = weddingWorkspace();
    const handoffMetadata = workspace
      ? {
        handoff_context: buildWeddingHandoffPacketState(workspace),
        ...(action.kind === "continue_chat"
          ? { continue_context: buildWeddingContinueContextPacket(workspace) }
          : {}),
      }
      : null;
    const nextIntent = buildWeddingNavigationIntentFromSidebarAction({
      action,
      weddingPlanId: intent.weddingPlanId,
      responseWorkspaceId: intent.responseWorkspaceId,
      sourceResponseId: intent.sourceResponseId,
      artifactId: activeWeddingArtifactId() ?? intent.artifactId,
      metadata: {
        ...(handoffMetadata ?? {}),
        ...(action.metadata ?? {}),
      },
    });
    if (nextIntent.view === "response_queue") {
      setWeddingNavigationIntent({ ...nextIntent, savedAt: new Date().toISOString() });
      if (nextIntent.surface === "planning_files") setWeddingWorkspaceMenu("home");
      if (nextIntent.surface === "map") setWeddingWorkspaceMenu("home");
      if (nextIntent.artifactId) {
        setActiveWeddingArtifactId(nextIntent.artifactId);
      }
    }
    dispatchWeddingNavigationIntent(nextIntent);
    if (nextIntent.view !== "response_queue") {
      props.onNavigate?.(nextIntent.view);
    }
  }

  function runWeddingRichResponseAction(action: WeddingRichResponseAction) {
    const nextIntent = buildWeddingNavigationIntentFromPresentationAction(action);
    if (nextIntent.view === "response_queue") {
      setWeddingNavigationIntent({ ...nextIntent, savedAt: new Date().toISOString() });
      if (nextIntent.surface === "planning_files") setWeddingWorkspaceMenu("home");
      if (nextIntent.surface === "map") setWeddingWorkspaceMenu("home");
      if (nextIntent.artifactId) {
        setActiveWeddingArtifactId(nextIntent.artifactId);
      }
    }
    dispatchWeddingNavigationIntent(nextIntent);
  }

  function toggleWeddingVendorSelection(vendorId: string, selected: boolean) {
    setWeddingFollowUpVendorIds((current) => {
      const existing = new Set(current);
      if (selected) existing.add(vendorId);
      else existing.delete(vendorId);
      return WEDDING_VENDOR_CHECKLIST
        .map((vendor) => vendor.id)
        .filter((id) => existing.has(id));
    });
  }

  async function generateWeddingFollowUp(options?: { seedExactDate?: boolean; starterIntents?: WeddingTemplateStarterIntent[] }) {
    const intent = weddingNavigationIntent();
    if (options?.starterIntents) {
      setWeddingFollowUpStarterIntents(options.starterIntents);
    }
    if (intent) {
      saveWeddingTemplateFollowUpDraft({
        responseWorkspaceId: intent.responseWorkspaceId,
        dateOrSeason: weddingFollowUpDate(),
        location: weddingFollowUpLocation(),
        guestCount: weddingFollowUpGuests(),
        budgetComfort: weddingFollowUpBudget(),
        prioritiesCsv: weddingFollowUpPriorities(),
        atmosphereDescription: weddingFollowUpAtmosphere(),
        inspirationImageUrlsText: weddingFollowUpImageLinks(),
        coupleNames: weddingFollowUpCoupleNames(),
        vendorCategoryIds: weddingFollowUpVendorIds(),
        vowPreference: normalizedVowPreferenceAnswer(weddingFollowUpVowPreference()),
        vowStyle: weddingFollowUpVowStyle(),
        relationshipFactsCsv: weddingFollowUpRelationshipFacts(),
        vowChecklistCsv: weddingFollowUpVowChecklist(),
        noimDownloaded: normalizedNoimAnswer(weddingFollowUpNoim()) ?? "",
        celebrantPath: weddingFollowUpCelebrant(),
        requested: true,
      }, localStorage);
    }
    setWeddingFollowUpRequested(true);
    setActiveWeddingArtifactId(null);
    setWeddingWorkspaceQuery("");
    if (options?.seedExactDate !== false) {
      const exactDate = parseWeddingDateInput(weddingFollowUpDate());
      if (exactDate) {
        await saveWeddingDate(exactDate);
      }
    }
  }

  function defaultWeddingVendorSearchQueryFromIntake(): string {
    const stateQuery = weddingTemplateFollowUp()?.vendorSearchLaunchQuery;
    if (stateQuery?.trim()) return stateQuery;
    return weddingVendorSearchQueryFromIntake({
      location: weddingFollowUpLocation(),
      approximateLocation: weddingVendorSearchApproximateLocation(),
      vendorLabels: weddingVendorSelectionLabels(weddingFollowUpVendorIds()),
      priorities: weddingFollowUpPriorities(),
      atmosphere: weddingFollowUpAtmosphere(),
    });
  }

  function weddingVendorSearchApproximateLocation(): string {
    const timezone = typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "";
    return weddingVendorSearchApproximateLocationFromTimezone(timezone);
  }

  function weddingVendorSearchServiceArea(): string {
    return weddingFollowUpLocation().trim() || weddingVendorSearchApproximateLocation();
  }

  function currentWeddingVendorSearchQueryState() {
    return weddingVendorSearchEffectiveQueryState(
      weddingVendorSearchQuery(),
      weddingTemplateFollowUp()?.vendorSearchLaunchQuery || defaultWeddingVendorSearchQueryFromIntake(),
    );
  }

  function currentWeddingVendorSearchQuery(): string {
    return currentWeddingVendorSearchQueryState().query;
  }

  async function saveWeddingDate(date: string) {
    const intent = weddingNavigationIntent();
    const workspace = weddingWorkspace();
    const responseWorkspaceId = workspace?.workspace.metadata.responseWorkspaceId ?? intent?.responseWorkspaceId;
    if (!responseWorkspaceId) return;
    const metadata = workspace?.workspace.metadata ?? normalizeWeddingPlanningMetadata({
      weddingPlanId: intent?.weddingPlanId,
      responseWorkspaceId,
      sourceResponseId: intent?.sourceResponseId,
    });
    saveLocalWeddingDate(responseWorkspaceId, date, localStorage);
    setWeddingLocalDateRefreshKey((value) => value + 1);
    const sendInputs = weddingDateToAfpSendInputs({ date, metadata });
    try {
      await Promise.all(sendInputs.map((input) => sendAfpMessage(input)));
      setWeddingProjectionRefreshKey((value) => value + 1);
      void refreshWeddingWorkspaceMessages();
    } catch {
      // The local date is already saved and immediately reflected in the planner.
    }
  }

  function extractWeddingFollowUpFromMessage() {
    const intent = weddingNavigationIntent();
    if (!intent) return;
    const state = buildWeddingNeedToKnowExtractionState({
      responseWorkspaceId: intent.responseWorkspaceId,
      text: weddingExtractionText(),
      existingDraft: {
        responseWorkspaceId: intent.responseWorkspaceId,
        dateOrSeason: weddingFollowUpDate(),
        location: weddingFollowUpLocation(),
        guestCount: weddingFollowUpGuests(),
        budgetComfort: weddingFollowUpBudget(),
        prioritiesCsv: weddingFollowUpPriorities(),
        atmosphereDescription: weddingFollowUpAtmosphere(),
        inspirationImageUrlsText: weddingFollowUpImageLinks(),
        coupleNames: weddingFollowUpCoupleNames(),
        vowPreference: normalizedVowPreferenceAnswer(weddingFollowUpVowPreference()),
        vowStyle: weddingFollowUpVowStyle(),
        relationshipFactsCsv: weddingFollowUpRelationshipFacts(),
        vowChecklistCsv: weddingFollowUpVowChecklist(),
        noimDownloaded: normalizedNoimAnswer(weddingFollowUpNoim()) ?? "",
        celebrantPath: weddingFollowUpCelebrant(),
        requested: weddingFollowUpRequested(),
      },
    });
    setWeddingFollowUpDate(state.draft.dateOrSeason ?? "");
    setWeddingFollowUpLocation(state.draft.location ?? "");
    setWeddingFollowUpGuests(state.draft.guestCount ?? "");
    setWeddingFollowUpBudget(state.draft.budgetComfort ?? "");
    setWeddingFollowUpPriorities(state.draft.prioritiesCsv ?? "");
    setWeddingFollowUpAtmosphere(state.draft.atmosphereDescription ?? "");
    setWeddingFollowUpImageLinks(state.draft.inspirationImageUrlsText ?? "");
    setWeddingFollowUpCoupleNames(state.draft.coupleNames ?? "");
    setWeddingFollowUpVowPreference(state.draft.vowPreference ?? "");
    setWeddingFollowUpVowStyle(state.draft.vowStyle ?? "");
    setWeddingFollowUpRelationshipFacts(state.draft.relationshipFactsCsv ?? "");
    setWeddingFollowUpVowChecklist(state.draft.vowChecklistCsv ?? "");
    setWeddingFollowUpNoim(state.draft.noimDownloaded ?? "");
    setWeddingFollowUpCelebrant(state.draft.celebrantPath ?? "");
    const captured = state.capturedSlots.length;
    const review = state.needsReviewLabels.length;
    setWeddingExtractionNotice(captured
      ? `Captured ${captured} field${captured === 1 ? "" : "s"} from the message${review ? `; ${review} item${review === 1 ? "" : "s"} need review` : ""}. Review the fields before generating files.`
      : "No explicit planning fields were detected. Add details manually or paste a more specific answer.");
  }

  async function importWeddingFiles(files: readonly File[]) {
    const intent = weddingNavigationIntent();
    if (!intent || intent.surface !== "planning_files" || files.length === 0 || weddingImportRunning()) return;
    setWeddingImportRunning(true);
    try {
      const metadata = weddingWorkspace()?.workspace.metadata ?? normalizeWeddingPlanningMetadata({
        weddingPlanId: intent.weddingPlanId,
        responseWorkspaceId: intent.responseWorkspaceId,
        sourceResponseId: intent.sourceResponseId,
      });
      const canPersistOriginals = Boolean(bootstrap()?.user && bootstrap()?.user.auth_provider !== "guest");
      const fileInputGroups = await Promise.all(files.map(async (file) => {
        let uploadReceipt: WeddingImportUploadReceipt = { status: "not_attempted" };
        if (canPersistOriginals) {
          try {
            const uploaded = await uploadFilePayload(file, { filename: file.name });
            uploadReceipt = {
              status: uploaded.message_id && uploaded.attachment ? "saved" : "failed",
              messageId: uploaded.message_id,
              attachment: uploaded.attachment,
              failureLabel: uploaded.message_id && uploaded.attachment ? null : "The original file could not be saved completely.",
            };
          } catch (error) {
            uploadReceipt = {
              status: "failed",
              failureLabel: error instanceof Error ? error.message : "Original upload storage failed.",
            };
          }
        }
        return weddingImportFileInputsFromBrowserFile(file, uploadReceipt);
      }));
      const fileInputs: WeddingImportFileInput[] = fileInputGroups.flat();
      const synthesis = buildWeddingImportSynthesisState({
        metadata,
        files: fileInputs,
      });
      if (synthesis.generatedArtifacts.length > 0) {
        saveWeddingImportedArtifacts(metadata.responseWorkspaceId, synthesis.generatedArtifacts, localStorage, weddingStorageUserId());
        const saveResults = await Promise.allSettled(synthesis.generatedArtifacts.map(async (artifact) => {
          await sendAfpMessage(weddingGeneratedArtifactToAfpSendInput(artifact));
          markWeddingArtifactAfpProjectionSent(artifact.summary.id, localStorage);
        }));
        const savedCount = saveResults.filter((result) => result.status === "fulfilled").length;
        setWeddingImportRefreshKey((value) => value + 1);
        setActiveWeddingArtifactId(synthesis.generatedArtifacts[0]?.summary.id ?? null);
        setWeddingImportNotice(savedCount > 0
          ? `${synthesis.summaryLabel}. ${savedCount} import${savedCount === 1 ? "" : "s"} saved to Files.`
          : `${synthesis.summaryLabel}. Imports are saved locally and queued for Files.`
        );
        return;
      }
      setWeddingImportNotice(synthesis.summaryLabel);
    } catch {
      setWeddingImportNotice("Import failed. Try a CSV export or a smaller file.");
    } finally {
      setWeddingImportRunning(false);
    }
  }

  function importWeddingFilesFromHeader(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 0) void importWeddingFiles(files);
    input.value = "";
  }

  async function runLiveWeddingVendorSearch(options?: { stayOnHome?: boolean; category?: string }): Promise<boolean> {
    const intent = weddingNavigationIntent();
    const workspace = weddingWorkspace();
    if (!intent || intent.surface !== "planning_files" || !workspace || weddingVendorSearchRunning()) return false;
    setWeddingVendorSearchRunning(true);
    setWeddingVendorSearchResultAction(null);
    setWeddingVendorSearchResultActionSuppressed(true);
    setWeddingVendorSearchNotice("Running live vendor search with connected providers...");
    try {
      const metadata = workspace.workspace.metadata;
      const smokeCleanupGate = weddingVendorSmokeCleanupGate();
      if (smokeCleanupGate.status === "blocked") {
        setWeddingVendorSearchNotice(`${smokeCleanupGate.blockerLabel} Use Remove fixture, then run live search again.`);
        return false;
      }
      const scopedCategoryIds = weddingVendorSearchCategoryScope();
      const categoryLabels = weddingVendorSelectionLabels(
        scopedCategoryIds && scopedCategoryIds.length > 0 ? scopedCategoryIds : weddingFollowUpVendorIds(),
      );
      const freeformQuery = options?.category ? "" : currentWeddingVendorSearchQuery();
      const effectiveCategoryLabels = options?.category ? [options.category] : categoryLabels.length > 0
        ? categoryLabels
        : freeformQuery
          ? ["Custom vendor search"]
          : categoryLabels;
      const liveWorkflowReadiness = buildWeddingLiveWorkflowReadinessState({
        workflow: "vendor_search",
        dateOrSeason: weddingFollowUpDate(),
        location: weddingVendorSearchServiceArea(),
        guestCount: weddingFollowUpGuests(),
        budgetComfort: weddingFollowUpBudget(),
        prioritiesCsv: weddingFollowUpPriorities(),
        vendorCategories: effectiveCategoryLabels,
      });
      if (liveWorkflowReadiness.status === "blocked") {
        setWeddingVendorSearchNotice(`Live vendor search needs ${liveWorkflowReadiness.missing.join(", ")}.`);
        return false;
      }
      const latestProviderCapabilities = await refreshWeddingProviderCapabilitiesNow();
      const configuredProviderKinds = weddingConfiguredVendorSearchProviderKinds(latestProviderCapabilities);
      const readiness = buildWeddingVendorSearchReadinessState({
        location: weddingVendorSearchServiceArea(),
        vendorCategories: effectiveCategoryLabels,
        vendorPreferences: [weddingFollowUpPriorities(), weddingFollowUpAtmosphere()].filter(Boolean).join("; "),
        photographyScope: [weddingFollowUpPriorities(), weddingFollowUpAtmosphere()].filter(Boolean).join("; "),
        musicOrBandNeeded: null,
        liveSearchProviderReady: configuredProviderKinds.length > 0,
      });
      if (readiness.status === "blocked") {
        setWeddingVendorSearchNotice(`Vendor search needs ${readiness.missing.join(", ")}.`);
        return false;
      }
      const providerCaution = weddingVendorSearchProviderCautionReason(latestProviderCapabilities);
      setWeddingVendorSearchNotice([
        `Running live vendor search with ${weddingConfiguredVendorSearchProviderLabel(latestProviderCapabilities, configuredProviderKinds)}...`,
        providerCaution,
      ].filter(Boolean).join(" "));
      const plan = buildWeddingVendorSearchProviderPlanState({
        readiness,
        providerKinds: configuredProviderKinds,
        maxCategories: 6,
        approximateLocation: weddingVendorSearchApproximateLocation(),
      });
      const plannedQueries = plan.providerPlans
        .flatMap((providerPlan) => providerPlan.queries)
        .slice(0, 8);
      const freeformQueries = freeformQuery
        ? configuredProviderKinds.map((providerKind) => ({
          providerKind,
          category: "custom_vendor_search",
          query: vendorSearchQueryWithFallbackArea(freeformQuery, weddingVendorSearchServiceArea()),
          googlePlaceTypes: providerKind === "google_places" ? ["point_of_interest"] : [],
          overpassTags: providerKind === "overpass" ? ["name~wedding"] : [],
          expectedFields: plannedQueries.find((query) => query.providerKind === providerKind)?.expectedFields
            ?? ["name", "website", "phone", "address", "rating", "review count", "source"],
          guardrails: plannedQueries.find((query) => query.providerKind === providerKind)?.guardrails
            ?? ["Use the user's exact vendor-search wording as the search intent.", "Cite source-backed vendor facts before recommending follow-up."],
        }))
        : null;
      const providerPlansForExecution: WeddingVendorSearchProviderPlan[] = freeformQueries
        ? configuredProviderKinds.map((providerKind, index) => ({
          providerKind,
          label: weddingConfiguredVendorSearchProviderLabel(latestProviderCapabilities, [providerKind]),
          priority: index + 1,
          queries: freeformQueries.filter((query) => query.providerKind === providerKind),
          guardrails: freeformQueries.find((query) => query.providerKind === providerKind)?.guardrails ?? [],
        }))
        : plan.providerPlans;
      const executionQueries = (freeformQueries ?? plannedQueries).slice(0, 8);
      if (executionQueries.length === 0 && configuredProviderKinds.length > 0) {
        setWeddingVendorSearchNotice("Vendor search needs at least one vendor category before it can run.");
        return false;
      }
      const comparisonInput = {
        metadata, preferences: [weddingFollowUpPriorities(), weddingFollowUpAtmosphere()].filter(Boolean).join("; "),
        location: weddingFollowUpLocation(), dateOrSeason: weddingFollowUpDate(), guestCount: weddingFollowUpGuests(),
        budgetComfort: weddingFollowUpBudget(), atmosphereDescription: weddingFollowUpAtmosphere(),
        inspirationImageUrls: linesFromText(weddingFollowUpImageLinks()), topPriorities: linesFromText(weddingFollowUpPriorities()),
        vendorCategories: effectiveCategoryLabels, targetCategory: effectiveCategoryLabels[0] ?? null,
        requireExactlyThree: true, canRunOnlineFallback: configuredProviderKinds.length > 0,
      };
      let responseNotice = "";
      const directoryFirstSearch = await runWeddingVendorDirectoryFirstSearch({
        comparison: comparisonInput,
        run: (sourcePolicy) => runWeddingPlannedVendorSearchExecution({
          providerPlans: weddingVendorDirectorySearchPlans({ providerPlans: providerPlansForExecution, category: comparisonInput.targetCategory ?? "wedding vendor", location: weddingVendorSearchServiceArea() }), mode: "live",
          providerLabel: weddingConfiguredVendorSearchProviderLabel(latestProviderCapabilities, configuredProviderKinds),
          workspaceId: metadata.responseWorkspaceId, maxQueries: 8,
          batchPort: weddingVendorSearchBatchPortFromApiSearch({
            search: searchWeddingVendors, workspaceId: metadata.responseWorkspaceId, weddingPlanId: metadata.weddingPlanId,
            maxResultsPerQuery: 5, sourcePolicy,
            onResponse: (response) => { responseNotice = buildWeddingVendorSearchNoticeState({
              ok: response.ok, message: response.message, sourceCount: response.source_count,
              providerLabel: response.provider_label, receiptMetadata: response.receipt_metadata,
            }); },
          }),
        }),
      });
      const execution = directoryFirstSearch.execution;
      if (execution.status === "failed") {
        setWeddingVendorSearchNotice(responseNotice || buildWeddingVendorSearchExecutionNoticeState(execution));
        return false;
      }
      const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
      if (artifact.status !== "created" || !artifact.summary || !artifact.artifactInput || !artifact.markdown) {
        setWeddingVendorSearchNotice(responseNotice || artifact.reason || execution.message);
        return false;
      }
      const generatedArtifact: WeddingGeneratedArtifact = {
        input: artifact.artifactInput,
        summary: artifact.summary,
        markdown: artifact.markdown,
        csv: null,
      };
      const comparisonArtifact = buildWeddingVendorComparisonArtifactState({ ...comparisonInput, execution });
      const generatedArtifacts: WeddingGeneratedArtifact[] = [
        generatedArtifact,
        ...(comparisonArtifact.status === "created" && comparisonArtifact.artifactInput && comparisonArtifact.summary && comparisonArtifact.markdown
          ? [{
            input: comparisonArtifact.artifactInput,
            summary: comparisonArtifact.summary,
            markdown: comparisonArtifact.markdown,
            csv: null,
          }]
          : []),
      ];
      saveWeddingImportedArtifacts(metadata.responseWorkspaceId, generatedArtifacts, localStorage, weddingStorageUserId());
      try {
        await Promise.all(generatedArtifacts.map(async (item) => {
          await sendAfpMessage(weddingGeneratedArtifactToAfpSendInput(item));
          markWeddingArtifactAfpProjectionSent(item.summary.id, localStorage);
        }));
      } catch {
      }
      setWeddingImportRefreshKey((value) => value + 1);
      const resultAction = buildWeddingVendorSearchResultAction({
        sourceArtifactId: generatedArtifact.summary.id,
        comparisonArtifactId: comparisonArtifact.summary?.id ?? null,
        comparisonCreated: comparisonArtifact.status === "created",
        topChoiceCount: comparisonArtifact.topChoiceCount,
      });
      setActiveWeddingArtifactId(resultAction?.artifactId ?? generatedArtifact.summary.id);
      setWeddingWorkspaceMenu(options?.stayOnHome === false ? "documents" : "home");
      setWeddingVendorSearchCategoryScope(null);
      setWeddingVendorSearchResultAction(resultAction);
      setWeddingVendorSearchResultActionSuppressed(false);
      setWeddingVendorSearchNotice(comparisonArtifact.status === "created"
        ? `${execution.message} Saved source-backed vendor notes and a top-${comparisonArtifact.topChoiceCount} comparison.`
        : `${execution.message} Saved source-backed vendor notes. ${comparisonArtifact.reason ?? ""}`.trim()
      );
      return comparisonArtifact.status === "created";
    } catch (error) {
      setWeddingVendorSearchNotice(error instanceof Error ? error.message : "Live vendor search failed.");
      return false;
    } finally {
      setWeddingVendorSearchRunning(false);
    }
  }

  useWeddingVendorShortlistLaunch({ enabled: () => weddingAutomaticShortlistEnabled(import.meta.env.VITE_WEDDING_AUTOMATIC_SHORTLIST_ENABLED), coordinatorInput: () => ({ weddingPlanId: weddingWorkspace()?.workspace.metadata.weddingPlanId, location: weddingVendorSearchServiceArea(), onboardingPriorities: linesFromText(weddingFollowUpPriorities()), unbookedCategories: weddingVendorSelectionLabels(weddingFollowUpVendorIds()), guestCount: weddingFollowUpGuests(), budgetComfort: weddingFollowUpBudget(), dateOrSeason: weddingFollowUpDate(), preferences: [weddingFollowUpPriorities(), weddingFollowUpAtmosphere()].filter(Boolean).join("; ") }), storage: localStorage, searchRunning: weddingVendorSearchRunning, run: (category) => runLiveWeddingVendorSearch({ stayOnHome: true, category }) });

  function installWeddingVendorSmokeFixture() {
    const intent = weddingNavigationIntent();
    const workspace = weddingWorkspace();
    if (!intent || intent.surface !== "planning_files" || !workspace || !weddingVendorSmokeTestAvailable()) return;
    const fixture = saveWeddingVendorSmokeFixtureArtifacts({
      responseWorkspaceId: workspace.workspace.metadata.responseWorkspaceId,
      metadata: workspace.workspace.metadata,
      storage: localStorage,
      userId: weddingStorageUserId(),
    });
    setWeddingImportRefreshKey((value) => value + 1);
    setWeddingWorkspaceMenu("home");
    setWeddingVendorSearchNotice(`Installed disposable quote smoke fixture for ${fixture.vendorEmail}. Remove it after validation.`);
  }

  function removeWeddingVendorSmokeFixture() {
    const intent = weddingNavigationIntent();
    const workspace = weddingWorkspace();
    if (!intent || intent.surface !== "planning_files" || !workspace || !weddingVendorSmokeTestAvailable()) return;
    const cleanup = removeWeddingVendorSmokeFixtureArtifacts({
      responseWorkspaceId: workspace.workspace.metadata.responseWorkspaceId,
      storage: localStorage,
      userId: weddingStorageUserId(),
    });
    setWeddingImportRefreshKey((value) => value + 1);
    setWeddingVendorSearchNotice(cleanup.removedCount > 0
      ? `Removed ${cleanup.removedCount} disposable smoke fixture artifact${cleanup.removedCount === 1 ? "" : "s"}. Real vendor search can use live provider results again.`
      : "No disposable smoke fixture artifacts were found.");
  }

  const viewState = createMemo(() => {
    const currentDensity = density();
    return {
      density: currentDensity,
      densityTone: "sky" as const,
      responseSurfaceState: queueCompanion(),
      responseSurfaceCompactMode: queueDensityIsCompact(currentDensity),
    };
  });
  const weddingSetupChecklist = createMemo(() => {
    const state = weddingWorkspace();
    return state ? weddingSetupChecklistItems(state) : [];
  });
  const incompleteWeddingSetupChecklist = createMemo(() => weddingSetupChecklist().filter((item) => !item.complete));

  return (
    <div class={RESPONSE_QUEUE_VIEW_CLASS}>
      <Show when={weddingWorkspace()}>
        <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 phone:hidden sm:flex-wrap sm:overflow-visible sm:pb-0">
          <div role="tablist" aria-label="Wedding planner sections" class="flex shrink-0 gap-2">
            <For each={WEDDING_WORKSPACE_MENU_ITEMS}>
              {(item, index) => {
                const selected = () => {
                  const active = weddingWorkspaceMenu();
                  if (item.id === "people") return active === "people" || active === "guests" || active === "seating";
                  if (item.id === "plan") return active === "plan" || active === "response_queue" || active === "timeline";
                  if (item.id === "documents") return active === "documents";
                  return active === item.id;
                };
                const badge = () => weddingWorkspaceMenuBadge(item.id, weddingWorkspace());
                const hint = () => badge() ? null : weddingWorkspaceMenuHint(item.id, weddingWorkspace());
                return (
                  <button
                    type="button"
                    id={`wedding-tab-${item.id}`}
                    role="tab"
                    title={item.title}
                    aria-selected={selected()}
                    aria-controls="wedding-tabpanel"
                    tabIndex={selected() ? 0 : -1}
                    onClick={() => setWeddingWorkspaceMenu(item.id)}
                    onKeyDown={(event) => handleWeddingMenuTabKeyDown(event, index())}
                    class={`relative inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                      selected() ? item.activeClassName : item.className
                    }`}
                  >
                    <span class="relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/80">
                      <RailIcon id={item.icon} />
                      <Show when={badge()}>
                        {(activeBadge) => (
                          <span
                            class={`absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-4 text-white ${
                              activeBadge().tone === "urgent" ? "bg-rose-600" : "bg-slate-900"
                            }`}
                          >
                            {activeBadge().label}
                          </span>
                        )}
                      </Show>
                    </span>
                    <span>{item.label}</span>
                    <Show when={hint()}>
                      {(activeHint) => (
                        <span class="rounded-full bg-white/75 px-1.5 py-0.5 text-[10px] font-semibold opacity-80">
                          {activeHint()}
                        </span>
                      )}
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
          <div aria-label="Wedding planner controls" class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              title="Open a short guide to the wedding planner."
              onClick={() => setShowWeddingWalkthrough(true)}
              class="min-h-10 rounded-full border border-rose-100 bg-rose-50/80 px-4 text-xs font-semibold text-rose-950 transition hover:border-rose-200 hover:bg-rose-50"
            >
              Show guide
            </button>
            <label
              ref={weddingUploadFilesControlRef}
              tabIndex={0}
              class={`group relative z-[1000] inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full border px-4 text-xs font-semibold shadow-sm transition ${
              weddingImportRunning()
                ? "cursor-wait border-teal-100 bg-white/50 text-teal-900/50"
                : "border-teal-200 bg-white/85 text-teal-950 hover:border-teal-300 hover:bg-white"
            }`}
            >
              {weddingImportRunning() ? "Importing..." : "Upload files"}
              <input
                type="file"
                class="sr-only"
                multiple
                accept=".csv,.tsv,.txt,.xls,.xlsx,.pdf,.doc,.docx,text/csv,text/tab-separated-values,text/plain,application/pdf,application/msword,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={weddingImportRunning()}
                onChange={importWeddingFilesFromHeader}
              />
              <span class="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-[1001] w-72 rounded-2xl border border-teal-100 bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-teal-950 opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100">
                <span class="block font-semibold">Bring in your existing lists</span>
                <span class="mt-1 block">
                  Upload guest lists, budgets, spreadsheets, vendor quotes, contracts, Google Sheets exports, or The Knot exports. OmnyID will organize what it can and keep the original files for later.
                </span>
              </span>
            </label>
            <QueueDensityToggle
              density={viewState().density}
              onSelect={selectDensityMode}
              tone={viewState().densityTone}
            />
          </div>
        </div>
      </Show>
      <div class={RESPONSE_QUEUE_VIEW_HEADER_CLASS}>
        <Show when={!weddingWorkspace()}>
          <QueueDensityToggle
            density={viewState().density}
            onSelect={selectDensityMode}
            tone={viewState().densityTone}
          />
        </Show>
      </div>
      <Show when={weddingWorkspace() && showWeddingWalkthrough()}>
        <WeddingPlannerWalkthrough
          inline
          onClose={closeWeddingWalkthrough}
          onFocusUploadFiles={focusWeddingUploadFilesControl}
          onOpenSharePlan={() => setShowWeddingSharePlan(true)}
          onSelectMenu={setWeddingWorkspaceMenu}
        />
      </Show>
      <Show when={weddingWorkspace() && weddingImportNotice()}>
        {(notice) => (
          <p class="ml-auto max-w-2xl rounded-2xl border border-teal-100 bg-white/85 px-3 py-2 text-xs leading-5 text-teal-950 shadow-sm">
            {notice()}
          </p>
        )}
      </Show>

      <Show when={weddingWorkspace() && weddingWorkspaceMenu() === "home"}>
        <div class="phone:hidden"><WorkspaceSetupBanner
            signedIn={weddingSignedIn()}
            onNavigate={(view, hint) => {
              saveWeddingReturnIntent();
              props.onNavigate?.(view as ViewName, hint);
            }}
          /></div>
      </Show>

      <Show when={weddingWorkspace() && weddingWorkspaceMenu() === "home" && !weddingFirstIntakeComplete() && incompleteWeddingSetupChecklist().length > 0}>
        <section class="rounded-[24px] border border-rose-100/80 bg-white/80 p-3 shadow-card phone:hidden sm:rounded-[28px] sm:p-4">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-sm font-semibold text-rose-950">Then add your wedding details</p>
              <p class="mt-1 text-sm leading-6 text-rose-900/70">
                Add the basics once, then OmnyID can keep the rest of the planner connected.
              </p>
            </div>
            <span class="w-fit rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-900">
              {incompleteWeddingSetupChecklist().length} to add
            </span>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <For each={weddingSetupChecklist()}>
              {(item) => (
                <button
                  type="button"
                  disabled={item.complete}
                  onClick={() => setWeddingWorkspaceMenu(item.menu)}
                  class={`min-w-0 rounded-2xl border px-3 py-2 text-left transition ${
                    item.complete
                      ? "cursor-default border-emerald-100 bg-emerald-50/75 text-emerald-950"
                      : "border-rose-100 bg-rose-50/70 text-rose-950 hover:border-rose-200 hover:bg-rose-50"
                  }`}
                >
                  <span class="block text-xs font-semibold">{item.complete ? "Done" : "Add"}</span>
                  <span class="mt-1 block break-words text-sm font-semibold">{item.label}</span>
                  <span class="mt-1 block text-xs leading-5 opacity-70">{item.detail}</span>
                </button>
              )}
            </For>
          </div>
        </section>
      </Show>

      {/* Suppressed while an intake form is the active next step — its "Open wedding
          documents" copy assumes a response already exists, which isn't true yet here. */}
      <Show when={!weddingWorkspace() && !weddingIntakeActive()}>
        <WeddingNavigationArrivalBanner
          state={weddingArrivalBanner()}
          onAction={runWeddingArrivalAction}
          onDismiss={() => setWeddingNavigationIntent(null)}
        />
      </Show>
      {/* Retired inline wedding intake removed; all first-run wedding launches use WeddingSiteIntakeWizard. */}

      <Show when={activeWeddingLaunch()}>
        {(launch) => (
          <WeddingSiteIntakeWizard
            launch={launch()}
            weddingExtractionText={weddingExtractionText}
            onWeddingExtractionTextInput={setWeddingExtractionText}
            onExtractFromMessage={extractWeddingFollowUpFromMessage}
            weddingExtractionNotice={weddingExtractionNotice}
            weddingFollowUpDate={weddingFollowUpDate}
            onWeddingFollowUpDateInput={setWeddingFollowUpDate}
            weddingFollowUpLocation={weddingFollowUpLocation}
            onWeddingFollowUpLocationInput={setWeddingFollowUpLocation}
            weddingFollowUpGuests={weddingFollowUpGuests}
            onWeddingFollowUpGuestsInput={setWeddingFollowUpGuests}
            weddingFollowUpBudget={weddingFollowUpBudget}
            onWeddingFollowUpBudgetInput={setWeddingFollowUpBudget}
            weddingFollowUpPriorities={weddingFollowUpPriorities}
            onWeddingFollowUpPrioritiesInput={setWeddingFollowUpPriorities}
            weddingFollowUpAtmosphere={weddingFollowUpAtmosphere}
            onWeddingFollowUpAtmosphereInput={setWeddingFollowUpAtmosphere}
            weddingFollowUpImageLinks={weddingFollowUpImageLinks}
            onWeddingFollowUpImageLinksInput={setWeddingFollowUpImageLinks}
            weddingFollowUpCoupleNames={weddingFollowUpCoupleNames}
            onWeddingFollowUpCoupleNamesInput={setWeddingFollowUpCoupleNames}
            weddingFollowUpVendorIds={weddingFollowUpVendorIds}
            onClearVendors={() => setWeddingFollowUpVendorIds([])}
            onToggleVendor={toggleWeddingVendorSelection}
            weddingFollowUpVowPreference={weddingFollowUpVowPreference}
            onWeddingFollowUpVowPreferenceChange={setWeddingFollowUpVowPreference}
            weddingFollowUpVowStyle={weddingFollowUpVowStyle}
            onWeddingFollowUpVowStyleChange={setWeddingFollowUpVowStyle}
            weddingFollowUpRelationshipFacts={weddingFollowUpRelationshipFacts}
            onWeddingFollowUpRelationshipFactsInput={setWeddingFollowUpRelationshipFacts}
            weddingFollowUpVowChecklist={weddingFollowUpVowChecklist}
            onWeddingFollowUpVowChecklistInput={setWeddingFollowUpVowChecklist}
            weddingFollowUpNoim={weddingFollowUpNoim}
            onWeddingFollowUpNoimChange={setWeddingFollowUpNoim}
            weddingFollowUpCelebrant={weddingFollowUpCelebrant}
            onWeddingFollowUpCelebrantChange={setWeddingFollowUpCelebrant}
            onGenerateFollowUp={(starterIntents) => void generateWeddingFollowUp({ starterIntents })}
            vendorSearchResultAction={currentWeddingVendorSearchResultAction()}
            onOpenVendorSearchResult={openWeddingVendorSearchResult}
            vendorSearchNotice={weddingVendorSearchNotice()}
            weddingTemplateFollowUp={weddingTemplateFollowUp}
          />
        )}
      </Show>

      <Show when={standaloneWeddingRichResponse()}>
        {(richResponse) => (
          <WeddingRichResponseView
            state={richResponse()}
            onAction={runWeddingRichResponseAction}
          />
        )}
      </Show>

      <Show when={weddingWorkspace()}>
        {(workspace) => (
          <WeddingResponseWorkspaceView
            state={workspace()}
            query={weddingWorkspaceQuery()}
            refreshState={weddingWorkspaceRefreshBanner()}
            saveProjection={sendAfpMessage}
            approvalHandlers={weddingApprovalHandlers()}
            gmailStatus={weddingGmailStatus()}
            weddingVendorDirectory={weddingVendorDirectory()}
            projectionStorage={localStorage}
            contactUserId={weddingStorageUserId()}
            importNotice={weddingImportNotice()}
            importRunning={weddingImportRunning()}
            activeMenu={weddingWorkspaceMenu()}
            sharePlanOpen={showWeddingSharePlan()}
            onToggleSharePlan={() => setShowWeddingSharePlan((current) => !current)}
            onImportFiles={(files) => void importWeddingFiles(Array.from(files))}
            onQueryChange={setWeddingWorkspaceQuery}
            onAdminDataConsentChange={setWeddingAdminDataConsentEnabled}
            onRefreshWorkspace={() => void refreshWeddingWorkspaceMessages()}
            onSelectArtifact={setActiveWeddingArtifactId}
            onFilterChip={(chip) => setWeddingWorkspaceQuery(chip.query)}
            onSidebarAction={runWeddingWorkspaceAction}
            onProjectionDispatched={(receipt) => {
              setWeddingProjectionRefreshKey((value) => value + 1);
              void recordWeddingVendorContactsFromProjection(receipt);
              void refreshWeddingWorkspaceMessages();
            }}
            onReviewBlockedOutputs={() => props.onNavigate?.("decision_queue")}
            onOpenSavedOutputs={() => props.onNavigate?.("files")}
            onProviderSetup={(view) => {
              saveWeddingReturnIntent();
              props.onNavigate?.(view);
            }}
            onRunLiveVendorSearch={runLiveWeddingVendorSearch}
            vendorSearchRunning={weddingVendorSearchRunning()}
            vendorSearchNotice={weddingVendorSearchNotice()}
            vendorSearchQuery={weddingVendorSearchQuery() || currentWeddingVendorSearchQuery()}
            vendorSearchQuerySourceLabel={currentWeddingVendorSearchQueryState().sourceLabel}
            vendorSearchResultAction={currentWeddingVendorSearchResultAction()}
            onVendorSearchQueryChange={updateWeddingVendorSearchQueryFromInput}
            vendorSearchReadiness={weddingLiveVendorSearchReadiness()}
            vendorSearchBlockedReason={weddingVendorSearchBlockedReason()}
            vendorEndToEndValidation={weddingVendorEndToEndValidation()}
            onSelectMenu={setWeddingWorkspaceMenu}
            onSaveWeddingDate={saveWeddingDate}
            richResponse={weddingWorkspaceMenu() === "home" ? weddingRichResponse() : null}
            onRichResponseAction={runWeddingRichResponseAction}
            compact={viewState().responseSurfaceCompactMode}
          />
        )}
      </Show>

      <Show when={!weddingWorkspace() || weddingWorkspaceMenu() === "response_queue"}>
        <ResponseQueueSurface
          queueCompanionState={viewState().responseSurfaceState}
          titleTag={RESPONSE_QUEUE_VIEW_TITLE_TAG}
          compact={viewState().responseSurfaceCompactMode}
        />
      </Show>
    </div>
  );
}
