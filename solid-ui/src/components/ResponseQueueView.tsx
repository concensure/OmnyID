// @locs-version: 1.0
// @module-id: ui.response-queue-view
// @primary-capability: response-queue-wedding-workspace
// @stability: beta
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { DashboardBootstrap, Session } from "@/lib/api";
import { QueueDensityToggle } from "@/components/QueueDensityToggle";
import { ResponseQueueSurface } from "@/components/ResponseQueueSurface";
import { WeddingNavigationArrivalBanner } from "@/components/WeddingNavigationArrivalBanner";
import { WorkspaceSetupBanner } from "@/components/WorkspaceSetupBanner";
import { WeddingWorkspaceMoreMenu } from "@/components/WeddingWorkspaceMoreMenu";
import {
  LazyWeddingResponseWorkspaceView,
  LazyWeddingRichResponseView,
  LazyWeddingSiteIntakeWizard,
  WeddingResponseFeatureBoundary,
} from "@/components/WeddingResponseQueueFeatureSurfaces";
import { toast } from "@/components/Toast";
import { RailIcon } from "@/components/RailIcons";
import {
  loadWeddingWorkspaceMenu,
  loadWeddingWorkspaceMenuFromUrl,
  isWeddingWorkspaceMenuId,
  canonicalWeddingWorkspaceMenuId,
  dispatchWeddingWorkspaceMenuSelection,
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
import { normalizeWeddingArtifactSummaries } from "@/lib/weddingArtifactState";
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
  subscribeWeddingNavigationIntent,
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
import { shouldShowWeddingFirstRunIntake } from "@/lib/weddingFirstRunIntakeGateState";
import { weddingInitialExperienceMode } from "@/lib/weddingInitialExperienceState";
import {
  WEDDING_VENDOR_CHECKLIST,
  normalizeWeddingVendorSelections,
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
  clearWeddingVendorSearchLaunch,
  consumeWeddingVendorSearchLaunch,
  dispatchWeddingVendorSearchLaunchResult,
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
import { mergeWeddingVendorPreferenceLabels, weddingVendorQueryGooglePlaceTypes, weddingVendorQueryIntent, weddingVendorScopedProviderQuery } from "@/lib/weddingVendorQueryIntentState";
import { useWeddingVendorShortlistLaunch } from "@/lib/useWeddingVendorShortlistLaunch";
import { weddingVendorRankingPolicyV2Enabled } from "@/lib/weddingVendorRankingV2State";
import { parseGuestCount } from "@/lib/weddingVendorRankingState";
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
import {
  readWeddingAnimalQuizHandoff,
  weddingAnimalQuizHandoffToOnboardingSeed,
} from "@/lib/weddingAnimalQuizImportState";
import { requestWeddingLeadMagnetImport } from "@/lib/weddingLeadMagnetImportRunnerState";
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
import {
  loadWeddingWorkspaceRefreshState,
  weddingWorkspaceRefreshScopeMatches,
  type WeddingWorkspaceRefreshState,
} from "@/lib/weddingWorkspaceRefreshState";
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
import { friendlyErrorText } from "@/lib/visibleErrorText";
import type { WeddingPlanningScheduleItem } from "@/lib/weddingCalendarProjectionState";
import {
  buildWeddingVendorSearchQueryEditState,
  buildWeddingVendorSearchResultAction,
  hasWeddingVendorComparisonArtifactSummary,
  hasWeddingVendorSearchArtifactSummary,
  hasWeddingVendorTopFiveComparisonExpansion,
  type WeddingVendorSearchResultAction,
} from "@/lib/weddingVendorSearchResultActionState";
import { completedWeddingVendorSearchSession, editedWeddingVendorSearchSession, loadWeddingVendorSearchSession, saveWeddingVendorSearchSession } from "@/lib/weddingVendorSearchSessionState";
import { weddingMenuKeyDownStep, weddingWorkspaceMenuItemsForEmail, weddingWorkspaceMoreItemsForEmail } from "@/lib/weddingWorkspaceDesktopMenuState";
import { WeddingUploadFilesButton } from "@/components/WeddingUploadFilesButton";
const RESPONSE_QUEUE_VIEW_CLASS =
  "view-enter min-w-0 space-y-4 rounded-[24px] border border-sky-100/80 bg-[linear-gradient(135deg,rgba(240,249,255,0.96),rgba(255,255,255,0.96))] p-3 shadow-[0_22px_70px_-36px_rgba(14,116,144,0.4)] backdrop-blur-sm phone:rounded-none phone:border-0 phone:bg-transparent phone:p-0 phone:shadow-none sm:rounded-[32px] sm:p-5";
const RESPONSE_QUEUE_VIEW_HEADER_CLASS = "flex min-w-0 flex-wrap items-center justify-end gap-3";
const RESPONSE_QUEUE_VIEW_TITLE_TAG = "h1" as const;
function exactWeddingVendorSearchDate(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (iso && Number.isFinite(Date.parse(`${iso}T00:00:00Z`))) return iso;
  if (!/\b\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2}\b/.test(text)) return null;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}
function weddingVendorSearchGuestCount(value: string | null | undefined): number | null { return parseGuestCount(value); }
function initialWeddingWorkspaceMenu(): WeddingWorkspaceMenuId {
  if (typeof window !== "undefined") {
    const urlMenu = loadWeddingWorkspaceMenuFromUrl(window.location.search, window.location.hash);
    if (urlMenu) return urlMenu;
  }
  return loadWeddingWorkspaceMenu();
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

export function ResponseQueueView(props: {
  bootstrap: DashboardBootstrap | null;
  sessionUser?: Session["user"] | null;
  signedIn?: boolean;
  onNavigate?: (view: ViewName, hint?: string) => void;
}) {
  const bootstrap = createMemo(() => props.bootstrap);
  const queueCompanion = createMemo(() => decisionOsQueueCompanionState(bootstrap()));
  const [density, setDensity] = createSignal<QueueDensity>(loadResponseQueueDensity());
  const [weddingWorkspaceMenu, setWeddingWorkspaceMenuSignal] = createSignal<WeddingWorkspaceMenuId>(initialWeddingWorkspaceMenu());
  function setWeddingWorkspaceMenu(id: WeddingWorkspaceMenuId) {
    const menuId = canonicalWeddingWorkspaceMenuId(id);
    const menuChanged = weddingWorkspaceMenu() !== menuId;
    setWeddingWorkspaceMenuSignal(menuId);
    saveWeddingWorkspaceMenu(menuId);
    if (typeof window !== "undefined") replaceWeddingWorkspaceMenuInUrl(menuId);
    if (menuChanged && typeof window !== "undefined") dispatchWeddingWorkspaceMenuSelection(menuId);
    if (menuChanged && typeof document !== "undefined") {
      document.getElementById("wedding-tabpanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  function handleWeddingMenuTabKeyDown(event: KeyboardEvent, currentIndex: number) {
    const items = weddingDesktopMenuItems();
    const nextIndex = weddingMenuKeyDownStep(event.key, currentIndex, items.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextItem = items[nextIndex];
    setWeddingWorkspaceMenu(nextItem.id);
    document.getElementById(`wedding-tab-${nextItem.id}`)?.focus();
  }
  const [showWeddingSharePlan, setShowWeddingSharePlan] = createSignal(false);
  const [weddingNavigationIntent, setWeddingNavigationIntent] = createSignal<ReturnType<typeof consumeWeddingNavigationIntent>>(null);
  const [weddingWorkspaceQuery, setWeddingWorkspaceQuery] = createSignal("");
  const [activeWeddingArtifactId, setActiveWeddingArtifactId] = createSignal<string | null>(null);
  const [weddingAdminDataConsentEnabled, setWeddingAdminDataConsentEnabled] = createSignal(false);
  const [weddingProjectionRefreshKey, setWeddingProjectionRefreshKey] = createSignal(0);
  const [weddingLocalDateRefreshKey, setWeddingLocalDateRefreshKey] = createSignal(0);
  const [weddingLocalBudgetRefreshKey, setWeddingLocalBudgetRefreshKey] = createSignal(0);
  const [weddingImportRefreshKey, setWeddingImportRefreshKey] = createSignal(0);
  const [weddingRefreshRunning, setWeddingRefreshRunning] = createSignal(false);
  const [weddingRefreshQueuedIntent, setWeddingRefreshQueuedIntent] = createSignal<ReturnType<typeof consumeWeddingNavigationIntent>>(null);
  const [weddingRefreshState, setWeddingRefreshState] = createSignal<WeddingWorkspaceRefreshState | null>(null);
  const [weddingVendorSearchRunning, setWeddingVendorSearchRunning] = createSignal(false);
  const [weddingVendorSearchNotice, setWeddingVendorSearchNotice] = createSignal<string | null>(null);
  const [weddingVendorSearchResultAction, setWeddingVendorSearchResultAction] = createSignal<WeddingVendorSearchResultAction | null>(null);
  const [weddingVendorSearchQuery, setWeddingVendorSearchQuery] = createSignal("");
  const [weddingVendorSearchSessionHydratedKey, setWeddingVendorSearchSessionHydratedKey] = createSignal("");
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
  const [weddingQuizSuggestions, setWeddingQuizSuggestions] = createSignal<string[]>([]);

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

  createEffect(() => {
    if (!weddingImportNotice()) return;
    const timer = window.setTimeout(() => setWeddingImportNotice(""), 10_000);
    onCleanup(() => window.clearTimeout(timer));
  });

  function applyWeddingVendorSearchLaunch(launch: WeddingVendorSearchLaunchState | null) {
    const query = launch?.query.trim();
    if (!query) return;
    setWeddingVendorSearchQuery(query);
    setWeddingVendorSearchResultAction(null);
    setWeddingVendorSearchCategoryScope(null);
    const responseWorkspaceId = weddingWorkspace()?.workspace.metadata.responseWorkspaceId ?? weddingNavigationIntent()?.responseWorkspaceId;
    saveWeddingVendorSearchSession(responseWorkspaceId, editedWeddingVendorSearchSession(query), localStorage, weddingStorageUserId());
    // A vendor-search launch is an explicit request to work in the vendor
    // surface.  Sending it home hides the entered query and makes a first
    // search look as though it was lost until the user opens Vendors again.
    if (!launch?.background) setWeddingWorkspaceMenu("response_queue");
    setWeddingVendorSearchNotice(launch?.runImmediately
      ? "Preparing a source-backed shortlist for the next wedding decision…"
      : "Vendor search is ready. Review the query, then run live search when you are ready.");
    if (launch?.runImmediately) {
      queueMicrotask(() => runWeddingVendorSearchLaunch(launch));
    }
  }

  function runWeddingVendorSearchLaunch(launch: WeddingVendorSearchLaunchState, waitCount = 0): void {
    // Current and next decisions can become eligible while an earlier search
    // is still saving. Queue the later launch rather than silently dropping it.
    if (weddingVendorSearchRunning()) {
      if (waitCount >= 120) {
        if (launch.sourceDecisionId) dispatchWeddingVendorSearchLaunchResult({ sourceDecisionId: launch.sourceDecisionId, ok: false });
        return;
      }
      window.setTimeout(() => runWeddingVendorSearchLaunch(launch, waitCount + 1), 500);
      return;
    }
    void runLiveWeddingVendorSearch({
      stayOnHome: true,
      category: launch.category ?? undefined,
      background: launch.background === true,
    }).then((ok) => {
      if (launch.sourceDecisionId) dispatchWeddingVendorSearchLaunchResult({ sourceDecisionId: launch.sourceDecisionId, ok });
    });
  }

  function updateWeddingVendorSearchQueryFromInput(query: string) {
    const editState = buildWeddingVendorSearchQueryEditState(query);
    setWeddingVendorSearchQuery(query);
    setWeddingVendorSearchCategoryScope(null);
    setWeddingVendorSearchResultAction(editState.resultAction);
    setWeddingVendorSearchNotice(editState.notice);
    const responseWorkspaceId = weddingWorkspace()?.workspace.metadata.responseWorkspaceId ?? weddingNavigationIntent()?.responseWorkspaceId;
    saveWeddingVendorSearchSession(responseWorkspaceId, editedWeddingVendorSearchSession(query), localStorage, weddingStorageUserId());
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

  function saveWeddingFollowUpProgress() {
    const workspaceId = weddingNavigationIntent()?.responseWorkspaceId;
    if (workspaceId) saveWeddingTemplateFollowUpDraft(currentWeddingFollowUpDraft(workspaceId), localStorage, weddingStorageUserId());
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

  // Authentication is session-owned. The dashboard bootstrap arrives later and
  // must not make the Wedding projection briefly behave as a guest after login.
  const weddingAccountUser = createMemo(() => props.sessionUser ?? bootstrap()?.user ?? null);
  const weddingStorageUserId = createMemo(() => weddingAccountUser()?.id ?? null);
  const weddingStorageUserEmail = createMemo(() => weddingAccountUser()?.email ?? "");
  const weddingDesktopMenuItems = createMemo(() => weddingWorkspaceMenuItemsForEmail(weddingStorageUserEmail()));
  const weddingMoreMenuItems = createMemo(() => weddingWorkspaceMoreItemsForEmail(weddingStorageUserEmail()));
  const weddingSignedIn = createMemo(() => props.signedIn ?? Boolean(
    weddingAccountUser() && weddingAccountUser()?.auth_provider !== "guest",
  ));
  const weddingVendorSmokeTestAvailable = createMemo(() => weddingSignedIn());
  createEffect(() => {
    if (weddingWorkspaceMenu() === "advanced" && !weddingMoreMenuItems().some((item) => item.id === "advanced")) {
      setWeddingWorkspaceMenu("home");
    }
  });
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
  const weddingScopedRefreshState = createMemo(() => {
    const intent = weddingNavigationIntent();
    const refreshed = weddingRefreshState();
    if (!intent || intent.surface !== "planning_files" || !refreshed) return null;
    return weddingWorkspaceRefreshScopeMatches(refreshed, intent) ? refreshed : null;
  });
  const weddingPersistedWorkspace = createMemo(() => {
    const intent = weddingNavigationIntent();
    if (!intent || intent.surface !== "planning_files") return null;
    weddingProjectionRefreshKey();
    const refreshed = weddingScopedRefreshState();
    if (refreshed) return refreshed.persisted;
    return buildWeddingPersistedWorkspaceState({
      messages: bootstrap()?.messages ?? [],
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
    const intent = weddingNavigationIntent();
    if (!weddingSignedIn()) return;
    const planId = launch?.metadata.weddingPlanId
      ?? (intent?.surface === "planning_files" ? intent.weddingPlanId : "");
    if (!planId) return;
    if (weddingAccountOnboardingRequestedPlanId() === planId) return;
    setWeddingAccountOnboardingRequestedPlanId(planId);
    void fetchWeddingOnboardingState(planId)
      .then((response) => {
        setWeddingAccountOnboardingVariant(response.onboardingState?.intakeVariant ?? null);
        setWeddingAdminDataConsentEnabled(response.onboardingState?.adminDataConsent === true);
      })
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
    const localVariant = loadWeddingIntakeVariantShown(planId, weddingStorageUserId());
    if (localVariant) return localVariant;
    if (weddingSignedIn() && weddingAccountOnboardingResolvedPlanId() !== planId) return null;
    return loadWeddingEntrySource(weddingStorageUserId()) === "wedding_site" ? "wedding_site" : "generic";
  });
  createEffect(() => {
    const launch = weddingTemplateLaunch();
    const variant = weddingIntakeVariant();
    if (!launch || !variant) return;
    saveWeddingIntakeVariantShown(launch.metadata.weddingPlanId, variant, weddingStorageUserId());
    if (weddingSignedIn()) {
      const entrySource = loadWeddingEntrySource(weddingStorageUserId()) ?? "generic";
      void saveWeddingOnboardingState(launch.metadata.weddingPlanId, variant, entrySource, weddingAdminDataConsentEnabled())
        .then((response) => {
          if (response.onboardingState) setWeddingAccountOnboardingVariant(response.onboardingState.intakeVariant);
        })
        .catch(() => {});
    }
  });
  const weddingInitialExperience = createMemo(() => {
    const launch = weddingTemplateLaunch();
    const persisted = weddingPersistedWorkspace();
    const planId = launch?.metadata.weddingPlanId ?? null;
    return weddingInitialExperienceMode({
      signedIn: weddingSignedIn(),
      hasTemplateLaunch: Boolean(launch),
      hasPersistedWorkspaceContent: Boolean(persisted?.hasPersistedData),
      followUpRequested: weddingFollowUpRequested(),
      onboardingResolved: !weddingSignedIn()
        || planId === null
        || weddingAccountOnboardingResolvedPlanId() === planId,
      workspaceRefreshStatus: weddingScopedRefreshState()?.status ?? null,
      intakeVariantResolved: weddingIntakeVariant() !== null,
    });
  });
  const activeWeddingLaunch = createMemo(() => (
    weddingInitialExperience() === "intake" ? weddingTemplateLaunch() : null
  ));
  function updateWeddingAdminDataConsent(enabled: boolean): void {
    const previous = weddingAdminDataConsentEnabled();
    setWeddingAdminDataConsentEnabled(enabled);
    const launch = weddingTemplateLaunch();
    const intent = weddingNavigationIntent();
    const planId = launch?.metadata.weddingPlanId
      ?? (intent?.surface === "planning_files" ? intent.weddingPlanId : "");
    if (!planId || !weddingSignedIn()) return;
    const variant = weddingAccountOnboardingVariant()
      ?? weddingIntakeVariant()
      ?? (loadWeddingEntrySource(weddingStorageUserId()) === "wedding_site" ? "wedding_site" : "generic");
    const entrySource = loadWeddingEntrySource(weddingStorageUserId()) ?? "generic";
    void saveWeddingOnboardingState(planId, variant, entrySource, enabled)
      .then((response) => {
        setWeddingAdminDataConsentEnabled(response.onboardingState?.adminDataConsent === true);
      })
      .catch(() => {
        setWeddingAdminDataConsentEnabled(previous);
        toast.error("That product-statistics choice could not be saved. Please try again.");
      });
  }
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
        afpMessages: weddingScopedRefreshState()?.messages ?? bootstrap()?.messages ?? [],
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

    const metadata = normalizeWeddingPlanningMetadata({
      weddingPlanId: intent.weddingPlanId,
      responseWorkspaceId: intent.responseWorkspaceId,
      sourceResponseId: intent.sourceResponseId,
      supertags: ["wedding", "wedding_plan"],
    });
    const scheduleItemsWithLocalDate = withLocalWeddingDateSchedule(
      [],
      metadata,
      intent.responseWorkspaceId,
    );
    return buildWeddingResponseWorkspaceViewState({
      metadata,
      artifacts: importedArtifactInputs,
      adminDataConsentEnabled: weddingAdminDataConsentEnabled(),
      query: weddingWorkspaceQuery(),
      activeArtifactId: activeWeddingArtifactId() ?? intent.artifactId,
      decisionDeferrals: persisted.decisionDeferrals,
      seatingConstraints: persisted.seatingConstraints,
      seatingOptimizations: persisted.seatingOptimizations,
      seatingDraftArchives: persisted.seatingDraftArchives,
      inspirationItems: persisted.inspirationItems,
      generatedArtifacts: importedArtifacts,
      scheduleItems: scheduleItemsWithLocalDate,
      taskItems: [],
      weddingVendors: weddingVendorDirectory(),
      nowIso: new Date().toISOString(),
      projectionStorage: localStorage,
    });
  });
  const visibleWeddingWorkspace = createMemo(() => (
    weddingInitialExperience() === "workspace" ? weddingWorkspace() : null
  ));
  const standaloneWeddingRichResponse = createMemo(() => (
    weddingInitialExperience() === "workspace" && !weddingWorkspace()
      ? weddingRichResponse()
      : null
  ));
  createEffect(() => {
    const workspace = weddingWorkspace();
    if (!workspace) return;
    const responseWorkspaceId = workspace.workspace.metadata.responseWorkspaceId;
    const hydrationKey = `${weddingStorageUserId() ?? "guest"}:${responseWorkspaceId}`;
    if (weddingVendorSearchSessionHydratedKey() === hydrationKey) return;
    setWeddingVendorSearchSessionHydratedKey(hydrationKey);
    const session = loadWeddingVendorSearchSession(responseWorkspaceId, localStorage, weddingStorageUserId());
    setWeddingVendorSearchQuery(session?.query ?? "");
    setWeddingVendorSearchResultAction(session?.status === "completed" ? session.resultAction : null);
  });

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
      vendorSearchResultOpenTargetAvailable: Boolean(weddingVendorSearchResultAction()),
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
  // Smoke fixtures are disposable developer test data. Never surface their
  // internal cleanup instruction to a planner or let it block a real search.
  // Remove only artifacts that carry the explicit fixture marker, preserving
  // every real imported artifact in the same workspace.
  createEffect(() => {
    const intent = weddingNavigationIntent();
    weddingImportRefreshKey();
    if (!intent || intent.surface !== "planning_files" || !weddingSignedIn()) return;
    const cleanup = removeWeddingVendorSmokeFixtureArtifacts({
      responseWorkspaceId: intent.responseWorkspaceId,
      storage: localStorage,
      userId: weddingStorageUserId(),
    });
    if (cleanup.removedCount > 0) {
      setWeddingImportRefreshKey((value) => value + 1);
    }
  });
  const weddingVendorSearchBlockedReason = createMemo(() =>
    weddingVendorSearchProviderBlockedReason(weddingProviderCapabilities()),
  );
  onMount(() => {
    const menuHandler = (event: Event) => {
      const menu = weddingWorkspaceMenuIdFromEvent(event);
      if (menu) setWeddingWorkspaceMenu(menu);
    };
    window.addEventListener(WEDDING_WORKSPACE_MENU_EVENT, menuHandler);
    onCleanup(() => window.removeEventListener(WEDDING_WORKSPACE_MENU_EVENT, menuHandler));

    const vendorSearchLaunchHandler = (event: Event) => {
      applyWeddingVendorSearchLaunch(weddingVendorSearchLaunchFromEvent(event));
      clearWeddingVendorSearchLaunch();
    };
    window.addEventListener(WEDDING_VENDOR_SEARCH_LAUNCH_EVENT, vendorSearchLaunchHandler);
    onCleanup(() => window.removeEventListener(WEDDING_VENDOR_SEARCH_LAUNCH_EVENT, vendorSearchLaunchHandler));
    applyWeddingVendorSearchLaunch(consumeWeddingVendorSearchLaunch());

    const budgetLocalSaveHandler = () => setWeddingLocalBudgetRefreshKey((value) => value + 1);
    window.addEventListener(WEDDING_BUDGET_ALLOCATION_LOCAL_SAVE_EVENT, budgetLocalSaveHandler);
    onCleanup(() => window.removeEventListener(WEDDING_BUDGET_ALLOCATION_LOCAL_SAVE_EVENT, budgetLocalSaveHandler));

    const unsubscribeWeddingIntent = subscribeWeddingNavigationIntent((nextIntent) => {
      if (nextIntent.view !== "response_queue") return;
      const storedIntent = { ...nextIntent, savedAt: new Date().toISOString() };
      setWeddingNavigationIntent(storedIntent);
      void refreshWeddingWorkspaceMessages(storedIntent);
    });
    onCleanup(unsubscribeWeddingIntent);

    const intent = consumeWeddingNavigationIntent();
    if (intent?.view === "response_queue") {
      setWeddingNavigationIntent(intent);
      const quizHandoff = readWeddingAnimalQuizHandoff(localStorage);
      if (quizHandoff) {
        const quizSeed = weddingAnimalQuizHandoffToOnboardingSeed(quizHandoff);
        setWeddingQuizSuggestions(quizSeed.quizSummary);
        if (!weddingFollowUpBudget()) setWeddingFollowUpBudget(quizSeed.budgetComfort);
        if (!weddingFollowUpPriorities()) setWeddingFollowUpPriorities(quizSeed.prioritiesCsv);
        if (!weddingFollowUpAtmosphere()) setWeddingFollowUpAtmosphere(quizSeed.atmosphereDescription);
      }
      const draft = loadWeddingTemplateFollowUpDraft(intent.responseWorkspaceId, localStorage, weddingStorageUserId());
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
    if (!intent || intent.surface !== "planning_files") return;
    if (weddingRefreshRunning()) {
      // Preserve the newest workspace target. A boolean queue re-ran the first
      // refresh after a rapid plan switch, leaving the newly selected Wedding
      // plan projected with stale/empty data.
      setWeddingRefreshQueuedIntent(intent);
      return;
    }
    setWeddingRefreshRunning(true);
    try {
      const state = await loadWeddingWorkspaceRefreshState({
        signedIn: weddingSignedIn(),
        weddingPlanId: intent.weddingPlanId,
        responseWorkspaceId: intent.responseWorkspaceId,
        sourceResponseId: intent.sourceResponseId,
        fallbackMessages: bootstrap()?.messages ?? [],
      });
      const currentIntent = weddingNavigationIntent();
      if (
        currentIntent
        && currentIntent.surface === "planning_files"
        && weddingWorkspaceRefreshScopeMatches(state, currentIntent)
      ) {
        setWeddingRefreshState(state);
      } else if (currentIntent?.surface === "planning_files") {
        setWeddingRefreshQueuedIntent(currentIntent);
      }
    } finally {
      setWeddingRefreshRunning(false);
      const queuedIntent = weddingRefreshQueuedIntent();
      if (queuedIntent) {
        setWeddingRefreshQueuedIntent(null);
        void refreshWeddingWorkspaceMessages(queuedIntent);
      }
    }
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
        detail: "Your newest wedding documents are ready. More older items are still available.",
        tone: "warning" as const,
      };
    }
    return {
      label: state.status === "loaded" ? "Wedding documents refreshed" : state.status === "error" ? "Refresh failed" : "Starter documents",
      detail: state.status === "loaded"
        ? "Your saved wedding documents are up to date."
        : state.status === "error"
          ? "We couldn't refresh saved documents just now. The documents already shown are still available."
          : "Sign in to refresh saved wedding documents.",
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
      const label = weddingVendorSelectionLabels([scopedVendorCategoryId])[0] ?? scopedVendorCategoryId;
      setWeddingVendorSearchNotice(`Ready to research ${label}. Search will use admin-configured providers and this user's wedding context.`);
    } else if (action.metadata?.vendor_search_scope !== "lead_time_category") {
      setWeddingVendorSearchCategoryScope(null);
    }
    if (action.kind === "continue_chat" && weddingRecommendationRequestedOutput(action) === "first_recommendation_set") {
      // Context cards are already a saved planning source. Do not reject a direct
      // Generate action simply because an older browser intake draft is incomplete.
      void generateWeddingFollowUp();
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
    if (action.kind === "open_tasks") {
      setWeddingWorkspaceMenu("tasks");
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
      }, localStorage, weddingStorageUserId());
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
      ? `Captured ${captured} field${captured === 1 ? "" : "s"} from the message.${review ? ` Please review: ${state.needsReviewLabels.join(", ")}.` : ""} Check the details before creating your plan.`
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
        const processingDetail = synthesis.reviewCount > 0
          ? `${synthesis.reviewCount} need review because no clear structured rows were detected; the original stays available until you review it or run a supported parser.`
          : synthesis.parserNeededCount > 0
            ? `${synthesis.parserNeededCount} need a supported document parser before structured rows can be created.`
            : "Structured content was synthesized during this upload.";
        setWeddingImportNotice(savedCount > 0
          ? `${synthesis.summaryLabel}. ${processingDetail} ${savedCount} import${savedCount === 1 ? "" : "s"} saved to Documents.`
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

  async function runLiveWeddingVendorSearch(options?: { stayOnHome?: boolean; category?: string; materialFingerprint?: string; background?: boolean }): Promise<boolean> {
    const intent = weddingNavigationIntent();
    const workspace = weddingWorkspace();
    if (!intent || intent.surface !== "planning_files" || !workspace || weddingVendorSearchRunning()) return false;
    setWeddingVendorSearchRunning(true);
    if (!options?.background) {
      setWeddingVendorSearchResultAction(null);
      saveWeddingVendorSearchSession(workspace.workspace.metadata.responseWorkspaceId, editedWeddingVendorSearchSession(currentWeddingVendorSearchQuery()), localStorage, weddingStorageUserId());
    }
    setWeddingVendorSearchNotice("Running live vendor search with connected providers...");
    try {
      const metadata = workspace.workspace.metadata;
      const smokeCleanupGate = weddingVendorSmokeCleanupGate();
      if (smokeCleanupGate.status === "blocked") {
        removeWeddingVendorSmokeFixtureArtifacts({
          responseWorkspaceId: metadata.responseWorkspaceId,
          storage: localStorage,
          userId: weddingStorageUserId(),
        });
        setWeddingImportRefreshKey((value) => value + 1);
      }
      const scopedCategoryIds = weddingVendorSearchCategoryScope();
      const categoryLabels = weddingVendorSelectionLabels(
        scopedCategoryIds && scopedCategoryIds.length > 0 ? scopedCategoryIds : weddingFollowUpVendorIds(),
      );
      // Category chips are structured constraints. They must not erase the
      // couple's visible wording or stop that wording from shaping ranking.
      const freeformQuery = currentWeddingVendorSearchQuery();
      const queryIntent = weddingVendorQueryIntent(freeformQuery);
      const directoryLookupOnly = Boolean(freeformQuery && queryIntent.exactNameLookup);
      const effectiveCategoryLabels = options?.category ? [options.category] : queryIntent.categoryLabel ? [queryIntent.categoryLabel] : categoryLabels.length > 0
        ? categoryLabels
        : freeformQuery
          ? ["Custom vendor search"]
          : categoryLabels;
      const liveWorkflowReadiness = buildWeddingLiveWorkflowReadinessState({
        workflow: "vendor_search",
        dateOrSeason: weddingFollowUpDate(),
        location: queryIntent.location ?? weddingVendorSearchServiceArea(),
        guestCount: queryIntent.guestCount ?? weddingFollowUpGuests(),
        budgetComfort: queryIntent.budgetComfort ?? weddingFollowUpBudget(),
        prioritiesCsv: queryIntent.preferences ?? weddingFollowUpPriorities(),
        vendorCategories: effectiveCategoryLabels,
      });
      // Manual source-backed search may keep omitted facts as verification gaps.
      // Intake-driven automation remains blocked until all required context exists.
      if (!directoryLookupOnly && !freeformQuery && liveWorkflowReadiness.status === "blocked") {
        setWeddingVendorSearchNotice(`Live vendor search needs ${liveWorkflowReadiness.missing.join(", ")}.`);
        return false;
      }
      const latestProviderCapabilities = directoryLookupOnly
        ? weddingProviderCapabilities()
        : await refreshWeddingProviderCapabilitiesNow();
      const configuredProviderKinds = weddingConfiguredVendorSearchProviderKinds(latestProviderCapabilities);
      const readiness = buildWeddingVendorSearchReadinessState({
        location: queryIntent.location ?? weddingVendorSearchServiceArea(),
        vendorCategories: effectiveCategoryLabels,
        vendorPreferences: freeformQuery
          ? queryIntent.preferences ?? freeformQuery
          : [weddingFollowUpPriorities(), weddingFollowUpAtmosphere()].filter(Boolean).join("; "),
        photographyScope: freeformQuery
          ? queryIntent.preferences ?? freeformQuery
          : [weddingFollowUpPriorities(), weddingFollowUpAtmosphere()].filter(Boolean).join("; "),
        musicOrBandNeeded: null,
        liveSearchProviderReady: configuredProviderKinds.length > 0,
      });
      if (!directoryLookupOnly && readiness.status === "blocked") {
        setWeddingVendorSearchNotice(`Vendor search needs ${readiness.missing.join(", ")}.`);
        return false;
      }
      const providerCaution = weddingVendorSearchProviderCautionReason(latestProviderCapabilities);
      setWeddingVendorSearchNotice(directoryLookupOnly
        ? "Searching your wedding vendor directory..."
        : [
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
      const selectedSearchCategory = options?.category ?? queryIntent.categoryLabel ?? effectiveCategoryLabels[0] ?? null;
      const scopedProviderQuery = weddingVendorScopedProviderQuery({
        query: freeformQuery,
        selectedCategory: selectedSearchCategory,
        fallbackArea: weddingVendorSearchServiceArea(),
      });
      const freeformQueries = freeformQuery
        ? configuredProviderKinds.map((providerKind) => ({
          providerKind,
          category: scopedProviderQuery.category ?? "custom_vendor_search",
          query: scopedProviderQuery.query,
          googlePlaceTypes: providerKind === "google_places" ? weddingVendorQueryGooglePlaceTypes(scopedProviderQuery.category) : [],
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
      const scopedQuery = Boolean(freeformQuery && !queryIntent.exactNameLookup);
      const broadVendorQuery = Boolean(freeformQuery && !queryIntent.category && !options?.category && !directoryLookupOnly);
      const mergedPreferenceLabels = mergeWeddingVendorPreferenceLabels(
        queryIntent.priorities,
        weddingFollowUpPriorities(),
        weddingFollowUpAtmosphere(),
      );
      const mergedPreferenceText = mergedPreferenceLabels.join("; ");
      const comparisonInput = {
        metadata, preferences: scopedQuery ? mergedPreferenceText || queryIntent.preferences : [weddingFollowUpPriorities(), weddingFollowUpAtmosphere()].filter(Boolean).join("; "),
        location: scopedQuery ? queryIntent.location ?? weddingFollowUpLocation() : weddingFollowUpLocation(), dateOrSeason: weddingFollowUpDate(), guestCount: scopedQuery ? queryIntent.guestCount ?? weddingFollowUpGuests() : weddingFollowUpGuests(),
        budgetComfort: scopedQuery ? queryIntent.budgetComfort ?? weddingFollowUpBudget() : weddingFollowUpBudget(), atmosphereDescription: scopedQuery ? queryIntent.atmosphere ?? weddingFollowUpAtmosphere() : weddingFollowUpAtmosphere(),
        inspirationImageUrls: linesFromText(weddingFollowUpImageLinks()), topPriorities: scopedQuery ? mergedPreferenceLabels : linesFromText(weddingFollowUpPriorities()),
        // A broad "wedding vendors" request is intentionally cross-category.
        // Keep a display/pattern label below, but do not turn the synthetic
        // "Custom vendor search" label into a ranking hard constraint.
        vendorCategories: broadVendorQuery ? [] : effectiveCategoryLabels,
        // A named directory lookup is not a category request. Treating it as
        // `Custom vendor search` filters out a real saved venue such as Mackay.
        targetCategory: broadVendorQuery
          ? "Wedding vendor"
          : directoryLookupOnly || (freeformQuery && !queryIntent.category && !options?.category)
          ? null
          : queryIntent.category ?? options?.category ?? effectiveCategoryLabels[0] ?? null,
        // Show the useful directory matches immediately when a smaller
        // category (for example Sydney musicians) has fewer than three
        // evidenced listings. Missing choices stay explicit instead of being
        // replaced by an unrelated search-notes document.
        requireExactlyThree: false,
        // An exact vendor-name lookup must be predictable and private: search
        // the existing directory only instead of turning a name into a broad
        // online query when the directory has fewer than three matches.
        canRunOnlineFallback: !directoryLookupOnly && configuredProviderKinds.length > 0,
      };
      let responseNotice = "";
      const directoryFirstSearch = await runWeddingVendorDirectoryFirstSearch({
        comparison: comparisonInput,
        run: (sourcePolicy) => runWeddingPlannedVendorSearchExecution({
          providerPlans: weddingVendorDirectorySearchPlans({
            providerPlans: sourcePolicy === "directory_only" && directoryLookupOnly ? [] : providerPlansForExecution,
            category: comparisonInput.targetCategory ?? "wedding vendor",
            location: weddingVendorSearchServiceArea(),
            searchQuery: freeformQuery,
          }), mode: "live",
          providerLabel: weddingConfiguredVendorSearchProviderLabel(latestProviderCapabilities, configuredProviderKinds),
          workspaceId: metadata.responseWorkspaceId, maxQueries: 8,
          batchPort: weddingVendorSearchBatchPortFromApiSearch({
            search: searchWeddingVendors, workspaceId: metadata.responseWorkspaceId, weddingPlanId: metadata.weddingPlanId,
            maxResultsPerQuery: 5, sourcePolicy, materialFingerprint: options?.materialFingerprint, rankingPolicyVersion: weddingVendorRankingPolicyV2Enabled(import.meta.env) ? "2" : "1",
            selectedDate: exactWeddingVendorSearchDate(comparisonInput.dateOrSeason), guestCount: weddingVendorSearchGuestCount(comparisonInput.guestCount),
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
        setWeddingVendorSearchNotice(friendlyErrorText(responseNotice || artifact.reason || execution.message));
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
      // Keep a person-initiated search on the vendor surface so its result is
      // immediately visible.  Background shortlists intentionally remain a
      // home update, where they do not interrupt the person using another tab.
      setWeddingWorkspaceMenu(options?.stayOnHome ? "home" : "response_queue");
      setWeddingVendorSearchCategoryScope(null);
      if (!options?.background) {
        setWeddingVendorSearchResultAction(resultAction);
        saveWeddingVendorSearchSession(metadata.responseWorkspaceId, completedWeddingVendorSearchSession(freeformQuery || currentWeddingVendorSearchQuery(), resultAction), localStorage, weddingStorageUserId());
      }
      setWeddingVendorSearchNotice(comparisonArtifact.status === "created"
        ? `${execution.message} Saved source-backed vendor notes and a top-${comparisonArtifact.topChoiceCount} comparison.`
        : `${execution.message} Saved source-backed vendor notes. ${comparisonArtifact.reason ?? ""}`.trim()
      );
      return comparisonArtifact.status === "created";
    } catch (error) {
      setWeddingVendorSearchNotice(friendlyErrorText(error, "Vendor search failed. Try again in a moment."));
      return false;
    } finally {
      setWeddingVendorSearchRunning(false);
    }
  }

  useWeddingVendorShortlistLaunch({ enabled: () => weddingAutomaticShortlistEnabled(import.meta.env.VITE_WEDDING_AUTOMATIC_SHORTLIST_ENABLED), coordinatorInput: () => ({ weddingPlanId: weddingWorkspace()?.workspace.metadata.weddingPlanId, location: weddingVendorSearchServiceArea(), onboardingPriorities: linesFromText(weddingFollowUpPriorities()), unbookedCategories: weddingVendorSelectionLabels(weddingFollowUpVendorIds()), guestCount: weddingFollowUpGuests(), budgetComfort: weddingFollowUpBudget(), dateOrSeason: weddingFollowUpDate(), preferences: [weddingFollowUpPriorities(), weddingFollowUpAtmosphere()].filter(Boolean).join("; "), rankingPolicyVersion: weddingVendorRankingPolicyV2Enabled(import.meta.env) ? "2" : "1" }), storage: localStorage, searchRunning: weddingVendorSearchRunning, run: (category, materialFingerprint) => runLiveWeddingVendorSearch({ stayOnHome: true, category, materialFingerprint, background: true }) });

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

  return (
    <div class={RESPONSE_QUEUE_VIEW_CLASS}>
      <Show when={visibleWeddingWorkspace()}>
        <div class="relative z-[200] -mx-1 flex flex-wrap items-start gap-2 overflow-visible px-1 pb-1 phone:hidden sm:pb-0">
          <div role="tablist" aria-label="Wedding planner sections" class="flex shrink-0 gap-2">
            <For each={weddingDesktopMenuItems()}>
              {(item, index) => {
                const selected = () => {
                  const active = weddingWorkspaceMenu();
                  if (item.id === "people") return active === "people" || active === "guests" || active === "seating";
                  if (item.id === "plan") return active === "plan" || active === "tasks" || active === "response_queue" || active === "timeline";
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
          <div aria-label="Wedding planner controls" class="ml-auto flex shrink-0 items-center gap-2 overflow-visible">
            <WeddingWorkspaceMoreMenu items={weddingMoreMenuItems()} onSelect={(item) => setWeddingWorkspaceMenu(item.id)} />
            <WeddingUploadFilesButton running={weddingImportRunning()} onChange={importWeddingFilesFromHeader} />
            <QueueDensityToggle
              density={viewState().density}
              onSelect={selectDensityMode}
              tone={viewState().densityTone}
            />
          </div>
        </div>
      </Show>
      <div class={RESPONSE_QUEUE_VIEW_HEADER_CLASS}>
        <Show when={!visibleWeddingWorkspace()}>
          <QueueDensityToggle
            density={viewState().density}
            onSelect={selectDensityMode}
            tone={viewState().densityTone}
          />
        </Show>
      </div>
      <Show when={visibleWeddingWorkspace() && weddingImportNotice()}>
        {(notice) => (
          <div class="ml-auto flex max-w-2xl flex-col gap-2 rounded-2xl border border-teal-100 bg-white/95 px-3 py-2 text-xs leading-5 text-teal-950 shadow-sm sm:flex-row sm:items-center" role="status">
            <p class="min-w-0 flex-1">{notice()}</p>
            <div class="flex shrink-0 gap-2">
              <button type="button" class="min-h-10 rounded-lg border border-teal-300 bg-white px-3 font-semibold" onClick={() => { setWeddingWorkspaceMenu("documents"); setWeddingImportNotice(""); }}>View document</button>
              <button type="button" class="min-h-10 rounded-lg px-3 font-semibold text-teal-900 underline" onClick={() => setWeddingImportNotice("")} aria-label="Dismiss import message">Dismiss</button>
            </div>
          </div>
        )}
      </Show>

      <Show when={visibleWeddingWorkspace() && weddingWorkspaceMenu() === "home"}>
        <div class="phone:hidden"><WorkspaceSetupBanner
            signedIn={weddingSignedIn()}
            onNavigate={(view, hint) => {
              saveWeddingReturnIntent();
              props.onNavigate?.(view as ViewName, hint);
            }}
          /></div>
      </Show>


      {/* Suppressed while an intake form is the active next step — its "Open wedding
          documents" copy assumes a response already exists, which isn't true yet here. */}
      <Show when={!visibleWeddingWorkspace() && weddingInitialExperience() === "workspace" && !weddingIntakeActive()}>
        <WeddingNavigationArrivalBanner
          state={weddingArrivalBanner()}
          onAction={runWeddingArrivalAction}
          onDismiss={() => setWeddingNavigationIntent(null)}
        />
      </Show>
      <Show when={activeWeddingLaunch()}>
        {(launch) => (
          <WeddingResponseFeatureBoundary label="Preparing your wedding questions">
            <LazyWeddingSiteIntakeWizard
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
            quizSuggestions={weddingQuizSuggestions()}
            onImportQuizSuggestions={() => {
              requestWeddingLeadMagnetImport();
              setWeddingQuizSuggestions([]);
              toast.success("Quiz suggestions are being added privately. You can review or edit them before confirming your plan.");
            }}
            onImportMagnetProfile={(prefill) => {
              if (prefill.weddingDate) setWeddingFollowUpDate(prefill.weddingDate);
              if (prefill.location) setWeddingFollowUpLocation(prefill.location);
              if (prefill.guestCount) setWeddingFollowUpGuests(prefill.guestCount);
              if (prefill.budgetTotal) setWeddingFollowUpBudget(prefill.budgetTotal);
              if (prefill.priorities) setWeddingFollowUpPriorities(prefill.priorities);
              if (prefill.atmosphere) setWeddingFollowUpAtmosphere(prefill.atmosphere);
              if (prefill.coupleNames) setWeddingFollowUpCoupleNames(prefill.coupleNames);
              for (const category of normalizeWeddingVendorSelections(prefill.vendorCategories)) toggleWeddingVendorSelection(category, true);
              saveWeddingFollowUpProgress();
            }}
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
            adminDataConsentEnabled={weddingAdminDataConsentEnabled}
            onAdminDataConsentChange={updateWeddingAdminDataConsent}
            onSaveProgress={saveWeddingFollowUpProgress}
            onGenerateFollowUp={(starterIntents) => generateWeddingFollowUp({ starterIntents })}
            vendorSearchResultAction={weddingVendorSearchResultAction()}
            onOpenVendorSearchResult={openWeddingVendorSearchResult}
            vendorSearchNotice={weddingVendorSearchNotice()}
              weddingTemplateFollowUp={weddingTemplateFollowUp}
            />
          </WeddingResponseFeatureBoundary>
        )}
      </Show>

      <Show when={weddingInitialExperience() === "resolving"}>
        <div class="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center px-4" role="status" aria-live="polite">
          <div class="rounded-3xl border border-wedding-border bg-white/95 px-6 py-5 text-center shadow-card">
            <p class="text-base font-semibold text-wedding-ink">Preparing your wedding planner…</p>
            <p class="mt-2 text-sm leading-6 text-wedding-ink/65">Checking this account's saved plan before opening the right starting point.</p>
          </div>
        </div>
      </Show>

      <Show when={weddingInitialExperience() === "retry"}>
        <div class="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center px-4" role="alert">
          <div class="rounded-3xl border border-amber-200 bg-white/95 px-6 py-5 text-center shadow-card">
            <p class="text-base font-semibold text-wedding-ink">Your wedding plan could not be checked just now</p>
            <p class="mt-2 text-sm leading-6 text-wedding-ink/65">We have not shown onboarding because a failed refresh is not proof that this is a new account.</p>
            <button type="button" class="mt-4 min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white" onClick={() => void refreshWeddingWorkspaceMessages()}>
              Try again
            </button>
          </div>
        </div>
      </Show>

      <Show when={standaloneWeddingRichResponse()}>
        {(richResponse) => (
          <WeddingResponseFeatureBoundary label="Preparing this wedding update">
            <LazyWeddingRichResponseView
              state={richResponse()}
              onAction={runWeddingRichResponseAction}
            />
          </WeddingResponseFeatureBoundary>
        )}
      </Show>

      <Show when={visibleWeddingWorkspace()}>
        {(workspace) => (
          <WeddingResponseFeatureBoundary label="Opening your wedding planner">
            <LazyWeddingResponseWorkspaceView
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
            onAdminDataConsentChange={updateWeddingAdminDataConsent}
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
            vendorSearchResultAction={weddingVendorSearchResultAction()}
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
          </WeddingResponseFeatureBoundary>
        )}
      </Show>

      <Show when={!visibleWeddingWorkspace() && weddingInitialExperience() === "workspace"}><ResponseQueueSurface queueCompanionState={viewState().responseSurfaceState} titleTag={RESPONSE_QUEUE_VIEW_TITLE_TAG} compact={viewState().responseSurfaceCompactMode} /></Show>
    </div>
  );
}
