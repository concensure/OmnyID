// @locs-version: 1.0
// @module-id: ui.response-queue-view
// @primary-capability: response-queue-wedding-workspace
// @stability: beta
import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { DashboardBootstrap } from "@/lib/api";
import { QueueDensityToggle } from "@/components/QueueDensityToggle";
import { ResponseQueueSurface } from "@/components/ResponseQueueSurface";
import { WeddingNavigationArrivalBanner } from "@/components/WeddingNavigationArrivalBanner";
import { WeddingResponseWorkspaceView } from "@/components/WeddingResponseWorkspaceView";
import { WeddingRichResponseView } from "@/components/WeddingRichResponseView";
import { RailIcon, type IconId } from "@/components/RailIcons";
import {
  loadWeddingWorkspaceMenu,
  saveWeddingWorkspaceMenu,
  weddingWorkspaceMenuBadge,
  type WeddingWorkspaceMenuId,
} from "@/lib/weddingWorkspaceMenuState";
import {
  fetchWeddingVendors,
  recordWeddingVendorContact,
  sendAfpMessage,
  uploadFilePayload,
  type WeddingVendor,
} from "@/lib/api";
import { decisionOsQueueCompanionState } from "@/lib/decisionOsQueueBootstrapState";
import { normalizeWeddingArtifactSummaries, normalizeWeddingArtifactSummary } from "@/lib/weddingArtifactState";
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import { buildWeddingKnowledgeGraphState } from "@/lib/weddingKnowledgeGraphState";
import { buildWeddingContinueContextPacket } from "@/lib/weddingContinueContextState";
import { weddingPersistedDecisionRecordsToGraphDecisions } from "@/lib/weddingDecisionGraphState";
import { buildWeddingDefaultApprovalExecutionHandlers } from "@/lib/weddingApprovalDefaultExecutorState";
import { buildWeddingHandoffPacketState } from "@/lib/weddingHandoffPacketState";
import {
  loadResponseQueueDensity,
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
} from "@/lib/weddingNavigationState";
import { buildWeddingPersistedWorkspaceState } from "@/lib/weddingPersistedWorkspaceState";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import { buildWeddingAdminDataConsentState } from "@/lib/weddingAdminDataConsentState";
import { buildWeddingRecommendationExplanationState } from "@/lib/weddingRecommendationExplanationState";
import {
  buildWeddingResponseWorkspaceViewState,
  type WeddingResponseWorkspaceViewState,
} from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import { buildWeddingTemplateDemoState } from "@/lib/weddingTemplateEntryState";
import {
  WEDDING_VENDOR_CHECKLIST,
  weddingVendorSelectionLabels,
} from "@/lib/weddingVendorChecklistState";
import { WEDDING_VOW_STYLE_OPTIONS } from "@/lib/weddingVowPlanningState";
import {
  loadWeddingTemplateFollowUpDraft,
  saveWeddingTemplateFollowUpDraft,
} from "@/lib/weddingTemplateFollowUpLocalState";
import { buildWeddingNeedToKnowExtractionState } from "@/lib/weddingNeedToKnowExtractionState";
import { buildWeddingTemplateFollowUpState } from "@/lib/weddingTemplateFollowUpState";
import { buildWeddingTemplateLaunchState } from "@/lib/weddingTemplateLaunchState";
import { weddingVendorContactProjectionRequests } from "@/lib/weddingVendorContactProjectionState";
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
    id: "budget",
    icon: "cost_dashboard",
    label: "Budget",
    title: "Track remaining budget, quotes, payments, and cost risks.",
    className: "border-emerald-100 bg-emerald-50/80 text-emerald-950 hover:border-emerald-200",
    activeClassName: "border-emerald-300 bg-emerald-100 text-emerald-950",
  },
  {
    id: "guests",
    icon: "contacts",
    label: "Guests",
    title: "Review guest list, RSVPs, meals, access needs, and guest follow-ups.",
    className: "border-amber-100 bg-amber-50/80 text-amber-950 hover:border-amber-200",
    activeClassName: "border-amber-300 bg-amber-100 text-amber-950",
  },
  {
    id: "seating",
    icon: "seating",
    label: "Seating",
    title: "Check assigned seats, table notes, and meal or access notes for vendors.",
    className: "border-sky-100 bg-sky-50/80 text-sky-950 hover:border-sky-200",
    activeClassName: "border-sky-300 bg-sky-100 text-sky-950",
  },
  {
    id: "helpers",
    icon: "tasks",
    label: "Who helps",
    title: "See who is helping with each wedding task and what details are still needed.",
    className: "border-fuchsia-100 bg-fuchsia-50/80 text-fuchsia-950 hover:border-fuchsia-200",
    activeClassName: "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-950",
  },
  {
    id: "response_queue",
    icon: "response_queue",
    label: "Follow-ups",
    title: "Review vendor follow-ups and planning items waiting for your attention.",
    className: "border-slate-200 bg-slate-50/80 text-slate-800 hover:border-slate-300",
    activeClassName: "border-slate-400 bg-slate-100 text-slate-950",
  },
  {
    id: "timeline",
    icon: "timeline",
    label: "Timeline",
    title: "See dated wedding tasks, upcoming timing risks, and the planning timeline.",
    className: "border-indigo-100 bg-indigo-50/80 text-indigo-950 hover:border-indigo-200",
    activeClassName: "border-indigo-300 bg-indigo-100 text-indigo-950",
  },
  {
    id: "advanced",
    icon: "tools",
    label: "Advanced setup",
    title: "Connection, approval, and launch checks. Most couples can leave this closed.",
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

function normalizedNoimAnswer(value: string): "yes" | "no" | "unknown" | null {
  return value === "yes" || value === "no" || value === "unknown" ? value : null;
}

function normalizedVowPreferenceAnswer(value: string): "" | "standard" | "create" | "undecided" {
  return value === "standard" || value === "create" || value === "undecided" ? value : "";
}

export function ResponseQueueView(props: {
  bootstrap: DashboardBootstrap | null;
  onNavigate?: (view: ViewName) => void;
}) {
  const bootstrap = createMemo(() => props.bootstrap);
  const queueCompanion = createMemo(() => decisionOsQueueCompanionState(bootstrap()));
  const [density, setDensity] = createSignal<QueueDensity>(loadResponseQueueDensity());
  const [weddingWorkspaceMenu, setWeddingWorkspaceMenuSignal] = createSignal<WeddingWorkspaceMenuId>(loadWeddingWorkspaceMenu());
  function setWeddingWorkspaceMenu(id: WeddingWorkspaceMenuId) {
    setWeddingWorkspaceMenuSignal(id);
    saveWeddingWorkspaceMenu(id);
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
  const [weddingNavigationIntent, setWeddingNavigationIntent] = createSignal<ReturnType<typeof consumeWeddingNavigationIntent>>(null);
  const [weddingWorkspaceQuery, setWeddingWorkspaceQuery] = createSignal("");
  const [activeWeddingArtifactId, setActiveWeddingArtifactId] = createSignal<string | null>(null);
  const [weddingAdminDataConsentEnabled, setWeddingAdminDataConsentEnabled] = createSignal(false);
  const [weddingProjectionRefreshKey, setWeddingProjectionRefreshKey] = createSignal(0);
  const [weddingImportRefreshKey, setWeddingImportRefreshKey] = createSignal(0);
  const [weddingRefreshRunning, setWeddingRefreshRunning] = createSignal(false);
  const [weddingRefreshState, setWeddingRefreshState] = createSignal<WeddingWorkspaceRefreshState | null>(null);
  const [weddingVendorDirectory, setWeddingVendorDirectory] = createSignal<WeddingVendor[]>([]);
  const [weddingVendorDirectoryRequestKey, setWeddingVendorDirectoryRequestKey] = createSignal("");
  const [weddingFollowUpDate, setWeddingFollowUpDate] = createSignal("");
  const [weddingFollowUpLocation, setWeddingFollowUpLocation] = createSignal("");
  const [weddingFollowUpGuests, setWeddingFollowUpGuests] = createSignal("");
  const [weddingFollowUpBudget, setWeddingFollowUpBudget] = createSignal("");
  const [weddingFollowUpPriorities, setWeddingFollowUpPriorities] = createSignal("");
  const [weddingFollowUpVendorIds, setWeddingFollowUpVendorIds] = createSignal<string[]>([]);
  const [weddingFollowUpVowPreference, setWeddingFollowUpVowPreference] = createSignal("");
  const [weddingFollowUpVowStyle, setWeddingFollowUpVowStyle] = createSignal("");
  const [weddingFollowUpRelationshipFacts, setWeddingFollowUpRelationshipFacts] = createSignal("");
  const [weddingFollowUpVowChecklist, setWeddingFollowUpVowChecklist] = createSignal("");
  const [weddingFollowUpNoim, setWeddingFollowUpNoim] = createSignal("");
  const [weddingFollowUpCelebrant, setWeddingFollowUpCelebrant] = createSignal("");
  const [weddingFollowUpRequested, setWeddingFollowUpRequested] = createSignal(false);
  const [weddingExtractionText, setWeddingExtractionText] = createSignal("");
  const [weddingExtractionNotice, setWeddingExtractionNotice] = createSignal("");
  const [weddingImportNotice, setWeddingImportNotice] = createSignal("");
  const [weddingImportRunning, setWeddingImportRunning] = createSignal(false);
  const weddingStorageUserId = createMemo(() => bootstrap()?.user?.id ?? null);
  const weddingSignedIn = createMemo(() => Boolean(bootstrap()?.user && bootstrap()?.user.auth_provider !== "guest"));
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
  const weddingApprovalHandlers = createMemo(() => buildWeddingDefaultApprovalExecutionHandlers());
  const weddingTemplateLaunch = createMemo(() => {
    const intent = weddingNavigationIntent();
    if (!intent || intent.surface !== "planning_files" || intent.sourceResponseId) return null;
    return buildWeddingTemplateLaunchState({
      weddingPlanId: intent.weddingPlanId,
      responseWorkspaceId: intent.responseWorkspaceId,
      sourceResponseId: intent.sourceResponseId,
    });
  });
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
      vendorCategories: weddingFollowUpVendorIds(),
      vendorPreferences: [
        weddingFollowUpBudget() ? `Budget comfort: ${weddingFollowUpBudget()}` : null,
        weddingFollowUpPriorities() ? `Priorities: ${weddingFollowUpPriorities()}` : null,
      ].filter(Boolean).join("; "),
      vowPreference: weddingFollowUpVowPreference() || "undecided",
      vowStyle: weddingFollowUpVowStyle(),
      relationshipFactLabels: weddingFollowUpRelationshipFacts().split("\n").map((fact) => fact.trim()).filter(Boolean),
      vowChecklistItems: weddingFollowUpVowChecklist().split("\n").map((item) => item.trim()).filter(Boolean),
      countryCode: /\b(australia|nsw|vic|qld|wa|sa|tas|act|nt)\b/i.test(weddingFollowUpLocation()) ? "AU" : null,
      noimDownloaded: normalizedNoimAnswer(weddingFollowUpNoim()),
      celebrantPath: weddingFollowUpCelebrant() || null,
      projectionStorage: localStorage,
    });
  });
  const weddingArrivalBanner = createMemo(() =>
    buildWeddingNavigationArrivalBannerState(weddingNavigationIntent()),
  );
  const weddingRichResponse = createMemo(() =>
    weddingTemplateFollowUp()?.richResponse ?? weddingTemplateLaunch()?.richResponse ?? null,
  );
  const weddingWorkspace = createMemo(() => {
    const intent = weddingNavigationIntent();
    if (!intent || intent.surface !== "planning_files") return null;
    weddingProjectionRefreshKey();
    weddingImportRefreshKey();
    const refreshed = weddingRefreshState();
    const importedArtifacts = loadWeddingImportedArtifacts(intent.responseWorkspaceId, localStorage, weddingStorageUserId());
    const importedArtifactInputs = importedArtifacts.map((artifact) => artifact.input);

    const persisted = buildWeddingPersistedWorkspaceState({
      messages: refreshed?.messages ?? bootstrap()?.messages ?? [],
      weddingPlanId: intent.weddingPlanId,
      responseWorkspaceId: intent.responseWorkspaceId,
      sourceResponseId: intent.sourceResponseId,
    });
    if (persisted.hasPersistedData) {
      const persistedSummaries = normalizeWeddingArtifactSummaries(persisted.artifacts);
      const graph = buildWeddingRecommendationExplanationState(buildWeddingKnowledgeGraphState({
        metadata: persisted.metadata,
        artifacts: persistedSummaries,
        scheduleItems: persisted.scheduleItems,
        taskItems: persisted.taskItems,
        decisions: weddingPersistedDecisionRecordsToGraphDecisions(persisted.decisionRecords),
      }));
      return buildWeddingResponseWorkspaceViewState({
        metadata: persisted.metadata,
        artifacts: [...persisted.artifacts, ...importedArtifactInputs],
        adminDataConsentEnabled: weddingAdminDataConsentEnabled(),
        contextItems: persisted.contextItems,
        approvalReceipts: persisted.approvalReceipts,
        decisionRecords: persisted.decisionRecords,
        query: weddingWorkspaceQuery(),
        activeArtifactId: activeWeddingArtifactId() ?? intent.artifactId,
        recommendations: graph,
        scheduleItems: persisted.scheduleItems,
        generatedArtifacts: importedArtifacts,
        taskItems: persisted.taskItems,
        weddingVendors: weddingVendorDirectory(),
        nowIso: new Date().toISOString(),
        projectionStorage: localStorage,
      });
    }

    const launch = weddingTemplateLaunch();
    const followUp = weddingTemplateFollowUp();
    if (followUp) {
      return withWeddingAdminDataConsent(buildWeddingResponseWorkspaceViewState({
        metadata: followUp.metadata,
        artifacts: [...followUp.artifacts, ...importedArtifactInputs],
        generatedArtifacts: [...followUp.generatedArtifacts, ...importedArtifacts],
        contextItems: [followUp.contextProjection],
        query: weddingWorkspaceQuery(),
        activeArtifactId: activeWeddingArtifactId() ?? intent.artifactId,
        scheduleItems: followUp.scheduleItems,
        taskItems: followUp.taskItems,
        weddingVendors: weddingVendorDirectory(),
        nowIso: new Date().toISOString(),
        projectionStorage: localStorage,
      }), weddingAdminDataConsentEnabled());
    }
    if (launch) {
      return withWeddingAdminDataConsent(buildWeddingResponseWorkspaceViewState({
        metadata: launch.metadata,
        artifacts: [...launch.artifactGeneration.artifactInputs, ...importedArtifactInputs],
        generatedArtifacts: [...launch.artifactGeneration.artifacts, ...importedArtifacts],
        query: weddingWorkspaceQuery(),
        activeArtifactId: activeWeddingArtifactId() ?? intent.artifactId,
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
    const taskItems = demo.taskItems.map((item) => ({
      ...item,
      metadata,
    }));
    const graph = buildWeddingRecommendationExplanationState(buildWeddingKnowledgeGraphState({
      metadata,
      artifacts: generatedArtifacts.map((artifact) => artifact.summary),
      scheduleItems,
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
      generatedArtifacts: [...generatedArtifacts, ...importedArtifacts],
      scheduleItems,
      taskItems,
      weddingVendors: weddingVendorDirectory(),
      nowIso: new Date().toISOString(),
      projectionStorage: localStorage,
    });
  });

  onMount(() => {
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
    dispatchWeddingNavigationIntent(nextIntent);
  }

  function runWeddingRichResponseAction(action: WeddingRichResponseAction) {
    dispatchWeddingNavigationIntent(buildWeddingNavigationIntentFromPresentationAction(action));
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

  function generateWeddingFollowUp() {
    const intent = weddingNavigationIntent();
    if (intent) {
      saveWeddingTemplateFollowUpDraft({
        responseWorkspaceId: intent.responseWorkspaceId,
        dateOrSeason: weddingFollowUpDate(),
        location: weddingFollowUpLocation(),
        guestCount: weddingFollowUpGuests(),
        budgetComfort: weddingFollowUpBudget(),
        prioritiesCsv: weddingFollowUpPriorities(),
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

  const viewState = createMemo(() => {
    const currentDensity = density();
    return {
      density: currentDensity,
      densityTone: "sky" as const,
      responseSurfaceState: queueCompanion(),
      responseSurfaceCompactMode: currentDensity === "compact",
    };
  });

  return (
    <div class={RESPONSE_QUEUE_VIEW_CLASS}>
      <Show when={weddingWorkspace()}>
        <div role="tablist" aria-label="Wedding planner sections" class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          <For each={WEDDING_WORKSPACE_MENU_ITEMS}>
            {(item, index) => {
              const selected = () => weddingWorkspaceMenu() === item.id;
              const badge = () => weddingWorkspaceMenuBadge(item.id, weddingWorkspace());
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
                </button>
              );
            }}
          </For>
        </div>
      </Show>
      <div class={RESPONSE_QUEUE_VIEW_HEADER_CLASS}>
        <Show when={weddingWorkspace()}>
          <label class={`group relative inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full border px-4 text-xs font-semibold shadow-sm transition ${
            weddingImportRunning()
              ? "cursor-wait border-teal-100 bg-white/50 text-teal-900/50"
              : "border-teal-200 bg-white/85 text-teal-950 hover:border-teal-300 hover:bg-white"
          }`}>
            {weddingImportRunning() ? "Importing..." : "Upload lists"}
            <input
              type="file"
              class="sr-only"
              multiple
              accept=".csv,.tsv,.txt,.xls,.xlsx,text/csv,text/tab-separated-values,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={weddingImportRunning()}
              onChange={importWeddingFilesFromHeader}
            />
            <span class="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-30 w-72 rounded-2xl border border-teal-100 bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-teal-950 opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100">
              <span class="block font-semibold">Bring in your existing lists</span>
              <span class="mt-1 block">
                Upload guest lists, budgets, spreadsheets, Google Sheets exports, or The Knot exports. OmnyID will organize what it can and keep the original files for later.
              </span>
            </span>
          </label>
          <button
            type="button"
            title="Open sharing options for partners, planners, contributors, and viewers."
            aria-pressed={showWeddingSharePlan()}
            onClick={() => setShowWeddingSharePlan((current) => !current)}
            class={`min-h-10 rounded-full border px-4 text-xs font-semibold transition ${
              showWeddingSharePlan()
                ? "border-sky-300 bg-sky-100 text-sky-950"
                : "border-sky-100 bg-sky-50/80 text-sky-950 hover:border-sky-200"
            }`}
          >
            Share the Plan
          </button>
        </Show>
        <QueueDensityToggle
          density={viewState().density}
          onSelect={selectDensityMode}
          tone={viewState().densityTone}
        />
      </div>
      <Show when={weddingWorkspace() && weddingImportNotice()}>
        {(notice) => (
          <p class="ml-auto max-w-2xl rounded-2xl border border-teal-100 bg-white/85 px-3 py-2 text-xs leading-5 text-teal-950 shadow-sm">
            {notice()}
          </p>
        )}
      </Show>

      <Show when={!weddingWorkspace()}>
        <WeddingNavigationArrivalBanner
          state={weddingArrivalBanner()}
          onAction={runWeddingArrivalAction}
          onDismiss={() => setWeddingNavigationIntent(null)}
        />
      </Show>

      <Show when={weddingTemplateLaunch()}>
        {(launch) => (
          <section class="min-w-0 rounded-[24px] border border-rose-100/80 bg-[linear-gradient(135deg,rgba(255,241,242,0.96),rgba(255,251,235,0.94))] p-3 shadow-card sm:rounded-[28px] sm:p-4">
            <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-rose-700/70">
              Wedding template launch
            </p>
            <h2 class="mt-1 break-words text-lg font-semibold text-on-surface">{launch().presentation.title}</h2>
            <p class="mt-1 break-words text-sm leading-6 text-on-surface-variant">{launch().nextQuestionLabel}</p>
            <p class="mt-2 text-xs leading-5 text-on-surface-variant">
              A starter brief has been created as the first planning file. Approve planning outputs to keep it in Files before adding private details.
            </p>
            <div class="mt-4 grid min-w-0 gap-3 rounded-[24px] border border-white/70 bg-white/65 p-3 md:grid-cols-3">
              <label class="space-y-1 text-xs font-semibold text-on-surface md:col-span-3">
                Paste a planning message
                <textarea
                  class="min-h-28 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm font-normal text-on-surface outline-none focus:border-rose-300"
                  value={weddingExtractionText()}
                  onInput={(event) => setWeddingExtractionText(event.currentTarget.value)}
                  placeholder="Example: We are planning for October 2027 in Sydney NSW, about 90 guests, mid-range budget, priorities are food and photos, NOIM not downloaded, need celebrant options."
                />
              </label>
              <div class="grid gap-2 sm:flex sm:flex-wrap sm:items-center md:col-span-3">
                <button
                  class="rounded-full border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-950 transition hover:border-rose-300 hover:bg-rose-50 sm:py-2"
                  type="button"
                  onClick={extractWeddingFollowUpFromMessage}
                >
                  Use message details
                </button>
                <Show when={weddingExtractionNotice()}>
                  {(notice) => (
                    <p class="break-words text-xs leading-5 text-rose-950">{notice()}</p>
                  )}
                </Show>
              </div>
              <label class="space-y-1 text-xs font-semibold text-on-surface">
                Date or season
                <input
                  class="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm font-normal text-on-surface outline-none focus:border-rose-300 sm:py-2"
                  value={weddingFollowUpDate()}
                  onInput={(event) => setWeddingFollowUpDate(event.currentTarget.value)}
                  placeholder="October 2027"
                />
              </label>
              <label class="space-y-1 text-xs font-semibold text-on-surface">
                Location
                <input
                  class="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm font-normal text-on-surface outline-none focus:border-rose-300 sm:py-2"
                  value={weddingFollowUpLocation()}
                  onInput={(event) => setWeddingFollowUpLocation(event.currentTarget.value)}
                  placeholder="Sydney NSW"
                />
              </label>
              <label class="space-y-1 text-xs font-semibold text-on-surface">
                Guest count
                <input
                  class="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm font-normal text-on-surface outline-none focus:border-rose-300 sm:py-2"
                  value={weddingFollowUpGuests()}
                  onInput={(event) => setWeddingFollowUpGuests(event.currentTarget.value)}
                  placeholder="80"
                />
              </label>
              <label class="space-y-1 text-xs font-semibold text-on-surface">
                Budget comfort
                <input
                  class="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm font-normal text-on-surface outline-none focus:border-rose-300 sm:py-2"
                  value={weddingFollowUpBudget()}
                  onInput={(event) => setWeddingFollowUpBudget(event.currentTarget.value)}
                  placeholder="Keep it lean"
                />
              </label>
              <label class="space-y-1 text-xs font-semibold text-on-surface">
                Priorities
                <input
                  class="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm font-normal text-on-surface outline-none focus:border-rose-300 sm:py-2"
                  value={weddingFollowUpPriorities()}
                  onInput={(event) => setWeddingFollowUpPriorities(event.currentTarget.value)}
                  placeholder="food, photos, low stress"
                />
              </label>
              <div class="space-y-2 md:col-span-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-xs font-semibold text-on-surface">Vendor checklist</p>
                    <p class="mt-0.5 break-words text-[11px] leading-5 text-on-surface-variant">
                      Select the vendor types you need. The agent uses these selections to decide what to research and you can edit them later.
                    </p>
                  </div>
                  <Show when={weddingFollowUpVendorIds().length > 0}>
                    <button
                      type="button"
                      class="w-full rounded-full border border-rose-100 bg-white px-3 py-2 text-[11px] font-semibold text-rose-950 hover:bg-rose-50 sm:w-auto sm:py-1"
                      onClick={() => setWeddingFollowUpVendorIds([])}
                    >
                      Clear vendors
                    </button>
                  </Show>
                </div>
                <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={WEDDING_VENDOR_CHECKLIST}>
                    {(vendor) => {
                      const checked = () => weddingFollowUpVendorIds().includes(vendor.id);
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
                            onChange={(event) => toggleWeddingVendorSelection(vendor.id, event.currentTarget.checked)}
                          />
                          <span class="min-w-0 break-words">{vendor.label}</span>
                        </label>
                      );
                    }}
                  </For>
                </div>
                <Show when={weddingFollowUpVendorIds().length > 0}>
                  <p class="break-words text-[11px] leading-5 text-rose-950">
                    Selected: {weddingVendorSelectionLabels(weddingFollowUpVendorIds()).join(", ")}
                  </p>
                </Show>
              </div>
              <div class="min-w-0 space-y-3 rounded-[24px] border border-rose-100 bg-white/70 p-3 md:col-span-3">
                <div>
                  <p class="text-xs font-semibold text-on-surface">Vow preparation</p>
                  <p class="mt-0.5 break-words text-[11px] leading-5 text-on-surface-variant">
                    Decide early whether to create personal vows or use a standard vow. If you create one, OmnyID will use the selected style and only known relationship facts from saved memory/context.
                  </p>
                </div>
                <div class="grid gap-2 sm:grid-cols-2">
                  <label class="space-y-1 text-xs font-semibold text-on-surface">
                    Vow choice
                    <select
                      class="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm font-normal text-on-surface outline-none focus:border-rose-300 sm:py-2"
                      value={weddingFollowUpVowPreference()}
                      onChange={(event) => setWeddingFollowUpVowPreference(event.currentTarget.value)}
                    >
                      <option value="">Decide later</option>
                      <option value="create">Create personal vows</option>
                      <option value="standard">Use a standard vow</option>
                    </select>
                  </label>
                  <label class="space-y-1 text-xs font-semibold text-on-surface">
                    Personal vow style
                    <select
                      class="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm font-normal text-on-surface outline-none focus:border-rose-300 disabled:opacity-60 sm:py-2"
                      value={weddingFollowUpVowStyle()}
                      disabled={weddingFollowUpVowPreference() !== "create"}
                      onChange={(event) => setWeddingFollowUpVowStyle(event.currentTarget.value)}
                    >
                      <option value="">Use warm personal default</option>
                      <For each={WEDDING_VOW_STYLE_OPTIONS}>
                        {(style) => <option value={style.id}>{style.label}</option>}
                      </For>
                    </select>
                  </label>
                </div>
                <Show when={weddingFollowUpVowPreference() === "create"}>
                  <div class="rounded-2xl border border-rose-100 bg-rose-50/70 p-3">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700/80">
                      Style inspiration
                    </p>
                    <p class="mt-1 break-words text-sm leading-6 text-rose-950">
                      {(WEDDING_VOW_STYLE_OPTIONS.find((style) => style.id === weddingFollowUpVowStyle()) ?? WEDDING_VOW_STYLE_OPTIONS[0]).sample}
                    </p>
                  </div>
                </Show>
                <div class="grid gap-2 lg:grid-cols-2">
                  <label class="space-y-1 text-xs font-semibold text-on-surface">
                    Known relationship facts from OmnyID memory or graph
                    <textarea
                      class="min-h-28 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm font-normal text-on-surface outline-none focus:border-rose-300"
                      value={weddingFollowUpRelationshipFacts()}
                      onInput={(event) => setWeddingFollowUpRelationshipFacts(event.currentTarget.value)}
                      placeholder="One known fact per line. Leave blank if not already known; the agent must not invent relationship history."
                    />
                  </label>
                  <label class="space-y-1 text-xs font-semibold text-on-surface">
                    Add to vow checklist
                    <textarea
                      class="min-h-28 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm font-normal text-on-surface outline-none focus:border-rose-300"
                      value={weddingFollowUpVowChecklist()}
                      onInput={(event) => setWeddingFollowUpVowChecklist(event.currentTarget.value)}
                      placeholder="One checklist item per line, e.g. agree target length; decide private vs ceremony-facing; confirm celebrant constraints."
                    />
                  </label>
                </div>
              </div>
              <div class="grid gap-2 sm:grid-cols-2 md:col-span-3">
                <label class="space-y-1 text-xs font-semibold text-on-surface">
                  NOIM status for Australian couples
                  <select
                    class="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm font-normal text-on-surface outline-none focus:border-rose-300 sm:py-2"
                    value={weddingFollowUpNoim()}
                    onChange={(event) => setWeddingFollowUpNoim(event.currentTarget.value)}
                  >
                    <option value="">Not applicable or ask later</option>
                    <option value="yes">Downloaded</option>
                    <option value="no">Not downloaded</option>
                    <option value="unknown">Not sure</option>
                  </select>
                </label>
                <label class="space-y-1 text-xs font-semibold text-on-surface">
                  Celebrant path
                  <select
                    class="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm font-normal text-on-surface outline-none focus:border-rose-300 sm:py-2"
                    value={weddingFollowUpCelebrant()}
                    onChange={(event) => setWeddingFollowUpCelebrant(event.currentTarget.value)}
                  >
                    <option value="">Ask later</option>
                    <option value="own_celebrant">Own authorised celebrant</option>
                    <option value="public_or_registry_celebrant">Public/registry-style options</option>
                    <option value="need_options">Compare both</option>
                  </select>
                </label>
              </div>
              <div class="md:col-span-3">
                <button
                  class="w-full rounded-full bg-rose-900 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-rose-800 sm:w-auto sm:py-2"
                  type="button"
                  onClick={generateWeddingFollowUp}
                >
                  Make follow-up documents
                </button>
                <Show when={weddingTemplateFollowUp()}>
                  {(followUp) => (
                    <p class="mt-2 break-words text-xs leading-5 text-rose-950">
                      Follow-up files are ready from {followUp().answeredLabels.length} captured answer{followUp().answeredLabels.length === 1 ? "" : "s"}.
                      Approve planning outputs to keep them in your wedding documents.
                    </p>
                  )}
                </Show>
              </div>
            </div>
            <div class="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
              <For each={launch().launchLabels.slice(0, 5)}>
                {(label) => (
                  <span class="shrink-0 rounded-full border border-rose-100 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-rose-950">
                    {label}
                  </span>
                )}
              </For>
            </div>
            <div class="mt-3 grid gap-2 md:grid-cols-3">
              <For each={launch().starterCards.slice(0, 6)}>
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
          </section>
        )}
      </Show>

      <Show when={weddingRichResponse()}>
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
            projectionStorage={localStorage}
            importNotice={weddingImportNotice()}
            importRunning={weddingImportRunning()}
            activeMenu={weddingWorkspaceMenu()}
            sharePlanOpen={showWeddingSharePlan()}
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
            onProviderSetup={(view) => props.onNavigate?.(view)}
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
