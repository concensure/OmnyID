import { createEffect, createMemo, createSignal, ErrorBoundary, For, lazy, onCleanup, onMount, Show, Suspense } from "solid-js";
import { GlassPanel } from "@/components/GlassPanel";
import { LoraStatusWidget } from "@/components/LoraStatusWidget";
import { MaskSwitcher } from "@/components/MaskSwitcher";
import { NavBar } from "@/components/NavBar";
import { MobileHomeMenuSheet } from "@/components/MobileHomeMenuSheet";
import { SearchBar } from "@/components/SearchBar";
import { ThreadDiscoveryLens } from "@/components/ThreadDiscoveryLens";
import { ThreadDiscoveryStateSummary } from "@/components/ThreadDiscoveryStateSummary";
import { ViewDispatcher } from "@/components/ViewDispatcher";
import { AgentPersonaFAB } from "@/components/AgentPersonaFAB";
import { WeddingNavigationArrivalBanner } from "@/components/WeddingNavigationArrivalBanner";
import { MasterAgentConversationResponse } from "@/components/MasterAgentConversationResponse";
import { WeddingReturnBanner } from "@/components/WeddingReturnBanner";
import { ActiveTasksDecisionView } from "@/components/ActiveTasksDecisionView";
import { WorkspaceBreadcrumbTrail } from "@/components/WorkspaceBreadcrumbTrail";
import { PrimaryUseCasePrompt } from "@/components/PrimaryUseCasePrompt";
import { collectKindCounts, objectKindLabel } from "@/lib/objectKinds";
import { ToastContainer } from "@/components/Toast";
import { DialogShell } from "@/components/DialogShell";
import { AppleSignInButton } from "@/components/auth/AppleSignInButton";
import { normalizeViewName, VIEW_NAMES, type ViewName } from "@/lib/viewNames";
import {
  appViewFromBrowserHistory,
  browserHistoryStateForAppView,
  browserHistoryUrlForAppView,
} from "@/lib/appViewBrowserHistoryState";
import {
  loadAdvancedNavEnabled,
  loadSidebarSeen,
  loadThreadSeenCount,
  loadWorkflowNewResultFlag,
  saveAdvancedNavEnabled,
  saveSidebarSeen,
  saveThreadSeenCount,
  saveWorkflowNewResultFlag,
} from "@/lib/appChromeLocalState";
import {
  authenticateWithGoogleIdToken,
  authenticateWithPassword,
  apiFetch,
  API_BASE,
  type AttachmentIngestCapabilities,
  type AfpMessage,
  cleanupIngestedAttachments,
  classifyParaItem,
  deployRuntime,
  executeUiCommand,
  fetchAttachmentIngestCapabilities,
  fetchGoogleAuthClientId,
  fetchDashboardBootstrap,
  fetchEncKey,
  getFleet,
  fetchLlmConfig,
  fetchObjectMessages,
  probeApiReachability,
  persistIngestedAttachments,
  fetchRuntimeLogs,
  fetchRuntimeWorkspaceFile,
  resendVerificationEmail as resendVerificationEmailRequest,
  requestPasswordReset,
  resetPassword,
  ingestAttachmentBatch,
  sendAfpMessage,
  listRuntimeWorkspaceFiles,
  fetchThreadSummaries,
  loadPrefs,
  orchestrateAgent,
  readSession,
  runRuntimeAction,
  saveRuntimeWorkspaceFile,
  savePrefs,
  subscribeSessionChangedEvent,
  type Session,
  type SearchSubmitPayload,
  writeSession,
  type DashboardBootstrap,
  type LlmConfig,
  type ObjectMessagesResponse,
  type RuntimeWorkspaceFileEntry,
  type RuntimeWorkspaceFileResponse,
  type ThreadSummary,
  type UiCommandResponse,
  uploadFilePayload,
  verifyEmailToken,
} from "@/lib/api";
import { fleetStatusSummary } from "@/lib/agentFleetResponseState";
import { buildSessionEndedNotice } from "@/lib/sessionRecoveryState";
import {
  dispatchWeddingWorkspaceMenuSelection,
  replaceWeddingWorkspaceMenuInUrl,
  saveWeddingWorkspaceMenu,
} from "@/lib/weddingWorkspaceMenuState";
import {
  type AuthApiResponse,
} from "@/lib/authResponseState";
import { visibleErrorText } from "@/lib/visibleErrorText";
import { checkBrowserAiAvailable, classifyWithBrowserAi, getBrowserAiLabel } from "@/lib/browserAi";
import {
  hasSentStudyDeadlineAfpProjection,
  markStudyDeadlineAfpProjectionSent,
  studyDeadlineToAfpSendInput,
  studyDeadlinesToAfpCalendarMessages,
  unmarkStudyDeadlineAfpProjectionSent,
} from "@/lib/studyDeadlineAfpProjectionState";
import {
  mountGoogleSignInButton,
} from "@/lib/googleIdentity";
import {
  authenticateWithPasskey,
  browserSupportsPasskeyAuth,
} from "@/lib/passkeyAuth";
import { subscribeOpenThreadEvent } from "@/lib/openThreadEvent";
import {
  buildRouteCardPreviewMessage,
  buildRouteComparisonPreviewMessage,
  buildSocialComposerPreviewMessage,
  buildSpaceFeedPreviewMessage,
  travelPreviewPrefersComparison,
} from "@/lib/commandPreviewSurfaces";
import { dispatchDecisionOsUpdateEvent } from "@/lib/decisionosContinuity";
import { subscribeDashboardRefreshEvent } from "@/lib/dashboardRefreshEvent";
import { isStructuredObjectSearchQuery } from "@/lib/objectSearch";
import {
  subscribeOpenObjectSearchEvent,
  type ObjectSearchLaunchContext,
} from "@/lib/objectSearchNavigation";
import {
  createLocalSemanticRouterPreviewController,
  invalidateLocalSemanticRouterState,
  localRouterCapabilityBadges,
  localRouterExecutionState,
  localRouterProjectionState,
  registerLocalRouterOllamaEmbedder,
  type LocalRouterCapabilities,
  runLocalSemanticRouterPreview,
} from "@/lib/localSemanticRouter";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { quickControlActionByShortcut, type QuickControlActionId } from "@/lib/quickControlShortcutState";
import {
  buildAttachmentGroundingEvidence,
  decoratePreviewMessageWithAttachmentGrounding,
  enrichUiCommandResponseWithAttachmentGrounding,
  type AttachmentGroundingEvidence,
  withAttachmentGroundingCleanupStatus,
  withAttachmentGroundingRetentionMode,
} from "@/lib/attachmentGroundingEvidence";
import { attachmentRetentionOutcome } from "@/lib/knowledgeIngestPolicy";
import {
  buildFileLibraryIntentFromAttachmentGrounding,
  saveFileLibraryNavigationIntent,
  type FileLibraryNavigationIntent,
} from "@/lib/fileLibraryNavigationState";
import {
  buildKnowledgeGraphIntentFromAttachmentGrounding,
  saveKnowledgeGraphNavigationIntent,
  type KnowledgeGraphNavigationIntent,
} from "@/lib/knowledgeGraphNavigationState";
import { buildStudyAttachmentActionState } from "@/lib/studyAttachmentActionState";
import { buildParaImportClassificationTags } from "@/lib/paraImportMode";
import { extractInlineKnowledgeText } from "@/lib/knowledgeAttachmentExtract";
import { summarizeKnowledgeAttachmentSupport } from "@/lib/knowledgeAttachmentSupportSummary";
import { decorateSearchPreviewMessageWithStudyStructure } from "@/lib/studySearchResultState";
import { decoratePreviewMessageWithStudyLaunchMetadata } from "@/lib/studyLaunchMetadataState";
import { consumeStudySearchContinuationSeed } from "@/lib/studySearchContinuationState";
import { loadOnboardingDone } from "@/lib/onboardingLocalState";
import { loadShouldShowGuidedTour } from "@/lib/guidedTourLocalState";
import { type OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import { saveReportNavigationIntent, type ReportNavigationIntent } from "@/lib/reportNavigationState";
import { subscribeWeddingNavigationAppBridge } from "@/lib/weddingNavigationAppBridge";
import { weddingNavigationCalendarTarget } from "@/lib/weddingNavigationCalendarTargetState";
import {
  consumeWeddingNavigationIntent,
  loadWeddingNavigationIntent,
} from "@/lib/weddingNavigationLocalState";
import {
  buildWeddingPlannerHomeIntent,
  dispatchWeddingNavigationIntent,
} from "@/lib/weddingNavigationState";
import { buildWeddingTemplateEntryState } from "@/lib/weddingTemplateEntryState";
import { loadWeddingEntrySource, saveWeddingEntrySource } from "@/lib/weddingEntrySourceState";
import {
  dispatchWeddingVendorSearchLaunch,
  isWeddingVendorSearchIntent,
  normalizeWeddingVendorSearchLaunchQuery,
  saveWeddingVendorSearchLaunch,
} from "@/lib/weddingVendorSearchLaunchState";
import {
  buildWeddingNavigationArrivalBannerState,
  weddingArrivalActionDestinationView,
  type WeddingArrivalAction,
} from "@/lib/weddingNavigationArrivalViewState";
import { AVAILABLE_CONNECTED_APPS } from "@/lib/connectedAppsCatalog";
import { loadConnectedAppIds } from "@/lib/connectedAppsStorage";
import type { ReportKind } from "@/lib/reportGeneratorState";
import {
  buildStudyLensDashboardState,
  buildStudyLensReportIntent,
  loadStudyLensEnabled,
  saveStudyLensEnabled,
} from "@/lib/studyLensState";
import {
  loadStudyReportArtifacts,
  STUDY_REPORT_ARTIFACT_SAVED_EVENT,
  type StudyReportArtifact,
} from "@/lib/studyReportArtifactLocalState";
import {
  buildManualStudyAttempt,
  emitStudyAttemptSaved,
  loadStudyAttempts,
  saveStudyAttempt,
  STUDY_ATTEMPT_SAVED_EVENT,
  type StudyAttempt,
  type StudyAttemptMode,
} from "@/lib/studyAttemptLocalState";
import {
  buildInferredStudyCourseFromTag,
  buildManualStudyCourse,
  emitStudyCourseSaved,
  loadStudyCourses,
  saveStudyCourse,
  STUDY_COURSE_SAVED_EVENT,
  type StudyCourse,
} from "@/lib/studyCourseLocalState";
import {
  buildManualStudyDeadline,
  emitStudyDeadlineSaved,
  loadStudyDeadlines,
  saveStudyDeadline,
  STUDY_DEADLINE_SAVED_EVENT,
  type StudyDeadline,
  type StudyDeadlineKind,
  type StudyDeadlineReviewStatus,
  updateStudyDeadlineReviewStatus,
} from "@/lib/studyDeadlineLocalState";
import {
  loadStudySessions,
  STUDY_SESSION_SAVED_EVENT,
  type StudySession,
} from "@/lib/studySessionLocalState";
import {
  buildMedicalMissedQuestionTopic,
  emitMedicalMissedQuestionTopicSaved,
  loadMedicalMissedQuestionTopics,
  MEDICAL_MISSED_QUESTION_TOPIC_SAVED_EVENT,
  saveMedicalMissedQuestionTopic,
  type MedicalMissedQuestionTopic,
} from "@/lib/medicalMissedQuestionLocalState";
import {
  hasSentMedicalMissedQuestionAfpProjection,
  markMedicalMissedQuestionAfpProjectionSent,
  medicalMissedQuestionTopicToAfpSendInput,
  unmarkMedicalMissedQuestionAfpProjectionSent,
} from "@/lib/medicalMissedQuestionAfpProjectionState";
import {
  emitMedicalConceptEdgeAttemptSaved,
  loadMedicalConceptEdgeAttempts,
  MEDICAL_CONCEPT_EDGE_ATTEMPT_SAVED_EVENT,
  saveMedicalConceptEdgeAttempt,
  type MedicalConceptEdgeAttempt,
} from "@/lib/medicalConceptEdgeAttemptLocalState";
import { extractMedicalConceptEdgeAttemptsFromArtifact } from "@/lib/medicalConceptEdgeAttemptExtractionState";
import {
  hasSentMedicalConceptEdgeAttemptAfpProjection,
  markMedicalConceptEdgeAttemptAfpProjectionSent,
  medicalConceptEdgeAttemptToAfpSendInput,
  unmarkMedicalConceptEdgeAttemptAfpProjectionSent,
} from "@/lib/medicalConceptEdgeAttemptAfpProjectionState";
import { buildMedicalConceptRelationshipState } from "@/lib/medicalConceptRelationshipState";
import {
  hasSentMedicalConceptRelationshipAfpProjection,
  markMedicalConceptRelationshipAfpProjectionSent,
  medicalConceptRelationshipToAfpSendInput,
  unmarkMedicalConceptRelationshipAfpProjectionSent,
} from "@/lib/medicalConceptRelationshipAfpProjectionState";
import {
  hasSentMedicalAnkiWorkflowAfpProjection,
  markMedicalAnkiWorkflowAfpProjectionSent,
  medicalAnkiWorkflowArtifactToAfpSendInput,
  unmarkMedicalAnkiWorkflowAfpProjectionSent,
} from "@/lib/medicalAnkiWorkflowAfpProjectionState";
import {
  hasSentMedicalTopologyCoverageAfpProjection,
  markMedicalTopologyCoverageAfpProjectionSent,
  medicalTopologyCoverageArtifactToAfpSendInput,
  unmarkMedicalTopologyCoverageAfpProjectionSent,
} from "@/lib/medicalTopologyCoverageAfpProjectionState";
import {
  loadThreadSessionHistory,
  pushThreadSessionHistory,
  saveThreadSessionHistory,
  stepBackThreadSessionHistory,
  stepForwardThreadSessionHistory,
  type ThreadSessionHistoryEntry,
} from "@/lib/threadSessionHistory";
import {
  buildLocalRouterCompanionState as buildLocalRouterCompanionStateModel,
  buildLocalRouterPreviewPayload as buildLocalRouterPreviewPayloadModel,
} from "@/lib/localRouterCompanionState.js";
import {
  buildNotePreviewMessageState,
  buildOrchestrationPreviewMessageState,
  buildPanelPreviewMessageState,
  buildPresentationPreviewMessageState,
  buildSchedulePreviewMessageState,
  buildSearchPreviewMessageState,
  buildTaskPreviewMessageState,
  createCommandPreviewMessageBase,
  normalizeCommandPreviewSourceLinks,
} from "@/lib/commandPreviewMessageState.js";
import {
  commandPreviewSurfaceKind,
  commandPreviewPendingIntentAfterConsumed,
  commandPreviewSelectableSuggestedView,
  commandPreviewShowsWorkflowHandoff,
  commandPreviewSuggestedWorkflowPendingIntentSeed,
  commandPreviewWorkflowPendingIntentSeed,
  type CommandPreviewWorkflowPendingIntentSeed,
} from "@/lib/commandPreviewRouting.js";
import { isAiModelSetupRequired, readUiCommandFallbackNotice } from "@/lib/uiCommandFallbackState";
import {
  commandPreviewUnlockNotice,
  readableCommandPreview,
} from "@/lib/commandPreviewVisibilityState.js";
import { isRecord } from "@/lib/eventDetail";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import {
  installMobileFocusViewportListener,
  isMobileFocusViewport,
  mobileFocusAskOpen,
  setMobileFocusAskOpen,
} from "@/lib/mobileFocusHomeState";
import { isWorkspaceLlmSetupComplete, workspaceLlmSetupPendingReason } from "@/lib/workspaceSetupState";
import {
  buildCommandSearchFailureReceipt,
  type CommandSearchFailureReceipt,
} from "@/lib/commandSearchFailureState";
import {
  buildRuntimeRunnerFailureReceipt,
  type RuntimeRunnerFailureReceipt,
} from "@/lib/runtimeRunnerFailureState";
import {
  buildThreadOrchestrationFailureReceipt,
  type ThreadOrchestrationFailureReceipt,
} from "@/lib/threadOrchestrationFailureState";
import {
  searchPreviewConfidence,
  searchPreviewEvidenceOrigin,
  searchPreviewIsLikelyWorkspaceLink,
  searchPreviewRefinementSuggestions as buildSearchPreviewRefinementSuggestions,
  searchPreviewSourceDomain,
  searchPreviewSourceSubtitle,
} from "@/lib/searchPreviewState.js";
import { buildSearchResultPanelState } from "@/lib/searchResultPanelState.js";
import {
  buildDashboardFocusPanelState,
  buildGenericCommandPanelState,
  buildRunnerEditPanelState,
} from "@/lib/appCommandPanelState.js";
import { buildOrchestrationCompanionPanelState } from "@/lib/orchestrationPanelState.js";
import { loadAgentResponseStylePayload } from "@/lib/agentResponseStyle";
import {
  subscribeOpenThreadSearchEvent,
  type ThreadSearchLaunchContext,
} from "@/lib/threadSearchNavigation";
import {
  buildThreadSummariesSearchRequest,
  isThreadSummariesSearchActive,
  threadSummariesList,
  threadSummariesRetrievalState,
} from "@/lib/threadSummariesResponseState";
import {
  dashboardBootstrapCalendarRuntimeSummary,
  dashboardBootstrapContinuityStateFields,
  dashboardBootstrapCostSnapshot,
  dashboardBootstrapDeviceSyncPolicyEntries,
  dashboardBootstrapDeviceSyncRuntimeSummary,
  dashboardBootstrapSimulatorRuntimeSummary,
  dashboardBootstrapHasSampleMessages,
  dashboardBootstrapMessages,
  dashboardBootstrapRuntimeBackups,
  dashboardBootstrapRuntimeDeployment,
  dashboardBootstrapRuntimeRestoreDrills,
  dashboardBootstrapRuntimeStatusPanel,
  dashboardBootstrapRuntimeStatusViews,
  dashboardBootstrapRuntimeUpdates,
  dashboardBootstrapRuntimeUpdatesPanel,
  dashboardBootstrapSupportAccess,
  dashboardBootstrapSupportAccessHistory,
  dashboardBootstrapThreadSummaries,
} from "@/lib/dashboardBootstrapState";
import {
  runtimeDeploymentMonitorFeedback,
  runtimeDeploymentMonitorLines,
  runtimeDeploymentMonitorSource,
} from "@/lib/runtimeDeploymentState";
import {
  buildObjectMessagesSearchRequest,
  objectMessagesFocusObjectId,
  objectMessagesFocusThreadId,
} from "@/lib/objectMessagesResponseState";
import {
  getSelfProfile,
  hasConsentBeenAsked,
  initLedgerKey,
  updateSelfProfile,
  type PrimaryUseCaseKind,
  type PrimaryUseCaseProfile,
} from "@/lib/profileLedger";
import {
  applyPrimaryUseCaseTheme,
  completeCurrentPrimaryUseCase,
  PRIMARY_USE_CASE_PROFILE_UPDATED_EVENT,
  profileNeedsPrimaryUseCasePrompt,
  savePrimaryUseCase,
  withAdminPrimaryUseCaseDefault,
} from "@/lib/primaryUseCaseProfileState";
import { loadUserProfile } from "@/lib/profileLocalState";
import { buildThreadSearchInput, parseThreadSearchInput } from "@/lib/threadSearch";
import {
  subscribeDecisionOsNavigateEvent,
} from "@/lib/decisionosNavigation";
import {
  detectWorkspaceAssistTopic,
  selectWorkspaceAssistSuggestion,
} from "afp-ts/workspace-assistance";
import type { RouterResult } from "afp-ts/semantic-router";
import {
  buildDashboardWorkspaceAssistCandidates,
  buildDashboardWorkspaceAssistRecentTitles,
  createWorkspaceAssistRefreshCoordinator,
  workspaceAssistNavigationView,
  type WorkspaceAssistDraftRefreshInput,
  type WorkspaceAssistRefreshOrigin,
} from "@/lib/workspaceAssist";
import {
  idlePreloadViewsForSession,
  shouldIdlePreloadViews,
} from "@/lib/viewPreload";
import {
  subscribeSwUpdateReadyEvent,
} from "@/lib/swUpdateEvent";
import { buildSampleDashboardBootstrap, mergeDashboardBootstrapWithSample } from "@/lib/sampleDashboard";
import {
  loadParaViewPreference,
  normalizeParaViewSelection,
  subscribeParaViewPreference,
} from "@/lib/paraViewPreference";

const LazyAgentSettingsView = lazy(() =>
  import("@/components/AgentSettingsView").then((m) => ({ default: m.AgentSettingsView })),
);
const LazyAgentFleetView = lazy(() =>
  import("@/components/AgentFleetView").then((m) => ({ default: m.AgentFleetView })),
);
const LazyAlternateViewsInspector = lazy(() =>
  import("@/components/AlternateViewsInspector").then((m) => ({ default: m.AlternateViewsInspector })),
);
const LazyDashboardFeed = lazy(() =>
  import("@/components/DashboardFeed").then((m) => ({ default: m.DashboardFeed })),
);
const LazyGuidedTour = lazy(() =>
  import("@/components/GuidedTour").then((m) => ({ default: m.GuidedTour })),
);
const LazyPARAOverviewStrip = lazy(() =>
  import("@/components/PARAOverviewStrip").then((m) => ({ default: m.PARAOverviewStrip })),
);
const LazyBentoGrid = lazy(() =>
  import("@/components/BentoGrid").then((m) => ({ default: m.BentoGrid })),
);
const LazyHomeQueuesSection = lazy(() =>
  import("@/components/HomeQueuesSection").then((m) => ({ default: m.HomeQueuesSection })),
);
const LazyStudyLensDashboard = lazy(() =>
  import("@/components/StudyLensDashboard").then((m) => ({ default: m.StudyLensDashboard })),
);
const LazyOnboardingWizard = lazy(() =>
  import("@/components/OnboardingWizard").then((m) => ({ default: m.OnboardingWizard })),
);
const LazyEditProfileModal = lazy(() =>
  import("@/components/EditProfileModal").then((m) => ({ default: m.EditProfileModal })),
);
const LazyObjectSearchResults = lazy(() =>
  import("@/components/ObjectSearchResults").then((m) => ({ default: m.ObjectSearchResults })),
);
const LazyObjectSearchLens = lazy(() =>
  import("@/components/ObjectSearchLens").then((m) => ({ default: m.ObjectSearchLens })),
);
const LazyThreadSemanticRouterPreview = lazy(() =>
  import("@/components/ThreadSemanticRouterPreview").then((m) => ({ default: m.ThreadSemanticRouterPreview })),
);
const LazyProfilingConsentModal = lazy(() =>
  import("@/components/ProfilingConsentModal").then((m) => ({ default: m.ProfilingConsentModal })),
);
const LazyViewCustomizer = lazy(() =>
  import("@/components/ViewCustomizer").then((m) => ({ default: m.ViewCustomizer })),
);
const LazyFloatingFormatBar = lazy(() =>
  import("@/components/FloatingFormatBar").then((m) => ({ default: m.FloatingFormatBar })),
);
const LazyAfpInspector = lazy(() =>
  import("@/components/AfpInspector").then((m) => ({ default: m.AfpInspector })),
);
const LazyPARAView = lazy(() =>
  import("@/components/PARAView").then((m) => ({ default: m.default })),
);
const LazyFilesView = lazy(() =>
  import("@/components/FilesView").then((m) => ({ default: m.default })),
);
const LazyThreadsListView = lazy(() =>
  import("@/components/ThreadsListView").then((m) => ({ default: m.ThreadsListView })),
);
const LazyThreadView = lazy(() =>
  import("@/components/ThreadView").then((m) => ({ default: m.ThreadView })),
);
const LazyWorkflowsView = lazy(() =>
  import("@/components/WorkflowsView").then((m) => ({ default: m.WorkflowsView })),
);
const LazyEmailView = lazy(() =>
  import("@/components/EmailView").then((m) => ({ default: m.EmailView })),
);
const LazyMonthlyCalendarView = lazy(() =>
  import("@/components/MonthlyCalendarView").then((m) => ({ default: m.MonthlyCalendarView })),
);
const LazyNoteView = lazy(() =>
  import("@/components/NoteView").then((m) => ({ default: m.NoteView })),
);
const LazyDecisionQueueView = lazy(() =>
  import("@/components/DecisionQueueView").then((m) => ({ default: m.DecisionQueueView })),
);
const LazyResponseQueueView = lazy(() =>
  import("@/components/ResponseQueueView").then((m) => ({ default: m.ResponseQueueView })),
);
const LazyPublicFeedView = lazy(() =>
  import("@/components/PublicFeedView").then((m) => ({ default: m.PublicFeedView })),
);
const LazyPythonRunnerView = lazy(() =>
  import("@/components/PythonRunnerView").then((m) => ({ default: m.PythonRunnerView })),
);
const LazyCofounderStudioView = lazy(() =>
  import("@/components/CofounderStudioView").then((m) => ({ default: m.CofounderStudioView })),
);
const LazyTemplatesView = lazy(() =>
  import("@/components/TemplatesView").then((m) => ({ default: m.TemplatesView })),
);
const LazyDatabaseView = lazy(() =>
  import("@/components/DatabaseView").then((m) => ({ default: m.DatabaseView })),
);
const LazyContactsView = lazy(() =>
  import("@/components/ContactsView").then((m) => ({ default: m.ContactsView })),
);
const LazyConnectedAppsView = lazy(() =>
  import("@/components/ConnectedAppsView").then((m) => ({ default: m.ConnectedAppsView })),
);
const LazyCostDashboardView = lazy(() =>
  import("@/components/CostDashboardView").then((m) => ({ default: m.CostDashboardView })),
);
const LazyToolsView = lazy(() =>
  import("@/components/ToolsView").then((m) => ({ default: m.ToolsView })),
);
const LazyKnowledgeGraphView = lazy(() =>
  import("@/components/KnowledgeGraphView").then((m) => ({ default: m.KnowledgeGraphView })),
);
const LazyReportsView = lazy(() =>
  import("@/components/ReportsView").then((m) => ({ default: m.ReportsView })),
);
const LazySpacesView = lazy(() =>
  import("@/components/SpacesView").then((m) => ({ default: m.SpacesView })),
);
const LazyDiaryView = lazy(() =>
  import("@/components/DiaryView").then((m) => ({ default: m.DiaryView })),
);
const LazyDiscoverView = lazy(() =>
  import("@/components/DiscoverView").then((m) => ({ default: m.DiscoverView })),
);
const LazyPulseFeed = lazy(() =>
  import("@/components/PulseFeed").then((m) => ({ default: m.PulseFeed })),
);

let decryptModulePromise: Promise<typeof import("@/lib/decrypt")> | null = null;
const viewPreloadPromises = new Map<ViewName, Promise<void>>();
const VIEW_PRELOADERS: Partial<Record<ViewName, () => Promise<unknown>>> = {
  threads: () => Promise.all([
    import("@/components/ThreadsListView"),
    import("@/components/ThreadView"),
  ]),
  workflows: () => import("@/components/WorkflowsView"),
  email: () => import("@/components/EmailView"),
  study: () => import("@/components/StudyLensDashboard"),
  note: () => import("@/components/NoteView"),
  calendar: () => import("@/components/MonthlyCalendarView"),
  database: () => import("@/components/DatabaseView"),
  templates: () => import("@/components/TemplatesView"),
  runner: () => import("@/components/PythonRunnerView"),
  agent_settings: () => import("@/components/AgentSettingsView"),
  diary: () => import("@/components/DiaryView"),
  discover: () => import("@/components/DiscoverView"),
  cofounder_studio: () => import("@/components/CofounderStudioView"),
  space_feed: () => import("@/components/SpacesView"),
  public_feed: () => import("@/components/PublicFeedView"),
  knowledge_graph: () => import("@/components/KnowledgeGraphView"),
  reports: () => import("@/components/ReportsView"),
  contacts: () => import("@/components/ContactsView"),
  connected_apps: () => import("@/components/ConnectedAppsView"),
  decision_queue: () => import("@/components/DecisionQueueView"),
  response_queue: () => import("@/components/ResponseQueueView"),
  cost_dashboard: () => import("@/components/CostDashboardView"),
  tools: () => import("@/components/ToolsView"),
  pulse: () => import("@/components/PulseFeed"),
  para: () => import("@/components/PARAView"),
  files: () => import("@/components/FilesView"),
};

// Views that must never be auto-navigated to from a search result suggestion
const NAV_BLOCKLIST = new Set(["agent_settings", "connected_apps", "cost_dashboard", "sovereignty_audit"]);

const VIEW_LABELS: Partial<Record<ViewName, string>> = {
  home: "Home", search: "Chat", threads: "Threads", workflows: "Workflows",
  email: "Email", study: "Study", note: "Notes", calendar: "Calendar", database: "Database",
  templates: "Templates", runner: "Runner", agent_settings: "Agent Settings",
  diary: "Diary", discover: "Discover", cofounder_studio: "Co-Founder",
  space_feed: "Spaces", public_feed: "Public Feed",
  knowledge_graph: "Knowledge Graph", reports: "Reports", sovereignty_audit: "Sovereignty",
  contacts: "Contacts", connected_apps: "Connected Apps", decision_queue: "Decision Queue", tasks: "Tasks", response_queue: "Response Queue",
  cost_dashboard: "Cost Dashboard",
  tools: "Tools",
  pulse: "Pulse Feed",
  goals: "Goals",
  files: "Files",
};

const GUEST_SIGN_IN_REQUIRED_VIEWS = new Set<ViewName>([
  "workflows",
  "study",
  "note",
  "database",
  "diary",
  "space_feed",
  "decision_queue",
  "response_queue",
  "contacts",
  "connected_apps",
  "cofounder_studio",
  "cost_dashboard",
  "agent_settings",
  "runner",
  "pulse",
  "goals",
  "sovereignty_audit",
  "reports",
  "files",
]);

function loadDecryptModule() {
  if (!decryptModulePromise) {
    decryptModulePromise = import("@/lib/decrypt");
  }
  return decryptModulePromise;
}

function preloadViewModule(view: ViewName): Promise<void> {
  if (view === "para" && !loadParaViewPreference()) return Promise.resolve();
  const existing = viewPreloadPromises.get(view);
  if (existing) return existing;
  const preloader = VIEW_PRELOADERS[view];
  if (!preloader) return Promise.resolve();
  const promise = preloader().then(
    () => undefined,
    () => {
      viewPreloadPromises.delete(view);
    },
  );
  viewPreloadPromises.set(view, promise);
  return promise;
}

function scheduleIdlePreload(callback: () => void) {
  const idleWindow = window as Window & typeof globalThis & {
    requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(() => callback(), { timeout: 1500 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const timeout = window.setTimeout(callback, 900);
  return () => window.clearTimeout(timeout);
}

function buildRunnerEditPanel(command: UiCommandResponse, query: string): Record<string, unknown> {
  return buildRunnerEditPanelState({
    query,
    summary: command.summary,
    bullets: (command.bullets ?? []).filter(Boolean),
    runnerDraft: command.runner_draft ?? null,
  });
}

function buildDashboardFocusPanel(command: UiCommandResponse, query: string): Record<string, unknown> {
  return buildDashboardFocusPanelState({
    query,
    summary: command.summary,
    bullets: (command.bullets ?? []).filter(Boolean),
  });
}

function buildGenericCommandPanel(
  command: UiCommandResponse,
  query: string,
  sourceLinks: Array<{ title: string; url: string; snippet: string; origin?: string | null }>,
): Record<string, unknown> {
  return buildGenericCommandPanelState({
    intent: command.intent,
    query,
    summary: command.summary,
    bullets: (command.bullets ?? []).filter(Boolean),
    runnerDraft: command.runner_draft ?? null,
    sourceItems: sourceLinks.map((link) => ({
      title: link.title || link.url,
      url: link.url,
      subtitle: link.snippet,
    })),
  });
}

function buildSearchResultPanel(
  command: UiCommandResponse,
  query: string,
  sourceLinks: Array<{ title: string; url: string; snippet: string; origin?: string | null }>,
  routerResult?: RouterResult | null,
  routerCapabilities?: LocalRouterCapabilities | null,
): Record<string, unknown> {
  return buildSearchResultPanelState({
    query,
    summary: command.summary,
    searchConfidence: summarizeSearchPreviewConfidence(command, sourceLinks),
    evidenceOrigin: summarizeSearchEvidenceOrigin(sourceLinks),
    localRouterCompanion: summarizeLocalRouterCompanion(routerResult, routerCapabilities),
    bullets: (command.bullets ?? []).filter(Boolean),
    refinementSuggestions: summarizeSearchPreviewRefinementSuggestions(query, sourceLinks),
    sourceItems: sourceLinks.map((link) => ({
      title: link.title || link.url,
      url: link.url,
      subtitle: sourceLinkSubtitle(link),
    })),
  });
}

function summarizeSearchPreviewConfidence(
  command: UiCommandResponse,
  sourceLinks: Array<{ title: string; url: string; snippet: string; origin?: string | null }>,
): { tone: "success" | "info" | "warning"; title: string; detail: string } {
  return searchPreviewConfidence({
    sourceCount: sourceLinks.length,
    bulletCount: (command.bullets ?? []).filter(Boolean).length,
  });
}

function sourceDomain(url: string): string | null {
  return searchPreviewSourceDomain(url);
}

function isLikelyWorkspaceLink(link: { url: string; snippet: string; origin?: string | null }): boolean {
  return searchPreviewIsLikelyWorkspaceLink(link);
}

function sourceLinkSubtitle(link: { url: string; snippet: string; origin?: string | null }): string {
  return searchPreviewSourceSubtitle(link);
}

function summarizeSearchEvidenceOrigin(
  sourceLinks: Array<{ url: string; snippet: string; origin?: string | null }>,
): { tone: "success" | "info" | "warning"; title: string; detail: string } {
  return searchPreviewEvidenceOrigin(sourceLinks);
}

function summarizeSearchPreviewRefinementSuggestions(
  query: string,
  sourceLinks: Array<{ title: string; url: string; snippet: string; origin?: string | null }>,
): string[] {
  return buildSearchPreviewRefinementSuggestions({
    query,
    links: sourceLinks,
  });
}

function searchPreviewRefinementSuggestions(
  query: string,
  sourceLinks: Array<{ title: string; url: string; snippet: string; origin?: string | null }>,
): string[] {
  return summarizeSearchPreviewRefinementSuggestions(query, sourceLinks);
}

function summarizeAttachmentKnowledgeTags(
  items: Array<{ supertags?: string[] | null }>,
): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const rawTag of item.supertags ?? []) {
      const tag = rawTag.trim();
      if (!tag) continue;
      const lower = tag.toLowerCase();
      if (
        lower.startsWith("pipeline:")
        || lower.startsWith("extraction:")
        || lower.startsWith("retention:")
        || lower.startsWith("source:")
        || lower.startsWith("attachment:")
      ) {
        continue;
      }
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([tag]) => tag);
  return ranked.length > 0 ? ranked.join(", ") : null;
}

async function classifySearchKnowledgeResources(
  items: Array<{
    output_message_id?: string | null;
    source_message_id: string;
    file_name?: string | null;
    mime_type?: string | null;
  }>,
  knowledgeMode: "standard" | "connected_notes" | "zettelkasten",
): Promise<boolean> {
  const retainedTargets = items
    .map((item) => ({
      targetId: item.output_message_id ?? item.source_message_id,
      label: item.file_name || item.mime_type || item.source_message_id || "imported_item",
    }))
    .filter((item) => item.targetId.trim().length > 0);
  if (retainedTargets.length === 0) return true;
  try {
    await Promise.all(
      retainedTargets.map((item) =>
        classifyParaItem(
          item.targetId,
          buildParaImportClassificationTags("resource", item.label, knowledgeMode),
          "Saved from search attachment ingest",
        ),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

function summarizeLocalRouterCompanion(
  routerResult?: RouterResult | null,
  routerCapabilities?: LocalRouterCapabilities | null,
): {
  tone: "success" | "info" | "warning";
  title: string;
  detail: string;
  stats: Array<{ label: string; value: string }>;
  badges: string[];
} | null {
  const companion = buildLocalRouterCompanionStateModel({
    routerResult,
    capabilityBadges: localRouterCapabilityBadges(routerCapabilities),
    executionState: localRouterExecutionState(routerResult, routerCapabilities),
    projectionBadgeLabels: localRouterProjectionState(routerCapabilities).badges.map((badge) => badge.label),
    indexedRowCount: routerCapabilities?.projectionHealth?.sourceMessageCount ?? null,
  });
  if (!companion) return null;
  return {
    tone: companion.tone,
    title: companion.title,
    detail: companion.detail,
    stats: companion.stats,
    badges: companion.badges,
  };
}

function buildLocalRouterPreviewPayload(
  routerResult?: RouterResult | null,
  routerCapabilities?: LocalRouterCapabilities | null,
): Record<string, unknown> | null {
  const companion = buildLocalRouterCompanionStateModel({
    routerResult,
    capabilityBadges: localRouterCapabilityBadges(routerCapabilities),
    executionState: localRouterExecutionState(routerResult, routerCapabilities),
    projectionBadgeLabels: localRouterProjectionState(routerCapabilities).badges.map((badge) => badge.label),
    indexedRowCount: routerCapabilities?.projectionHealth?.sourceMessageCount ?? null,
  });
  return buildLocalRouterPreviewPayloadModel(companion);
}

function isSearchLikePreviewMessage(message: AfpMessage): boolean {
  if (message.type === "research" || message.type === "search_result") return true;
  if (message.views.some((view) => view.format === "search_result")) return true;
  const content = decryptedDisplayContent(message);
  return typeof content === "object" && content !== null && ("sources" in content || "bullets" in content);
}

function decorateSearchPreviewMessageWithLocalRouter(
  message: AfpMessage,
  routerResult?: RouterResult | null,
  routerCapabilities?: LocalRouterCapabilities | null,
): AfpMessage {
  const localRouterPreview = buildLocalRouterPreviewPayload(routerResult, routerCapabilities);
  if (!localRouterPreview || !isSearchLikePreviewMessage(message)) return message;
  if (message.encryption) return message;
  return {
    ...message,
    content: {
      ...message.content,
      local_router_preview: localRouterPreview,
    },
    views: message.views.map((view) => (
      view.format === "search_result"
        ? {
            ...view,
            content: {
              ...view.content,
              local_router_preview: localRouterPreview,
            },
          }
        : view
    )),
  };
}

function searchPreviewEmbedsLocalRouter(message: AfpMessage | null | undefined): boolean {
  if (!message) return false;
  const content = decryptedDisplayContent(message);
  if (typeof content === "object" && content !== null && "local_router_preview" in content) return true;
  return message.views.some((view) => (
    view.format === "search_result"
    && typeof view.content === "object"
    && view.content !== null
    && "local_router_preview" in view.content
  ));
}

function buildOrchestrationCompanionPanel(command: UiCommandResponse, query: string): Record<string, unknown> {
  return buildOrchestrationCompanionPanelState({
    query,
    summary: command.summary,
    cardId: command.card_id ?? null,
  });
}

function commandResponseToPreviewMessage(
  command: UiCommandResponse,
  query: string,
  routerResult?: RouterResult | null,
  routerCapabilities?: LocalRouterCapabilities | null,
): AfpMessage {
  const timestamp = new Date().toISOString();
  const base = createCommandPreviewMessageBase({
    intent: command.intent,
    timestamp,
  }) as AfpMessage;

  const sourceLinks = normalizeCommandPreviewSourceLinks(command.links);
  const previewSurface = commandPreviewSurfaceKind({
    intent: command.intent,
    preferredView: command.preferred_view ?? null,
    travelPrefersComparison: travelPreviewPrefersComparison(
      query,
      command.preferred_view,
      command.bullets ?? [],
    ),
  });

  if (previewSurface === "search") {
    const localRouterPreview = buildLocalRouterPreviewPayload(routerResult, routerCapabilities);
    const a2uiCompanion = buildSearchResultPanel(
      command,
      query,
      sourceLinks,
      routerResult,
      routerCapabilities,
    );
    return buildSearchPreviewMessageState({
      base,
      intent: command.intent,
      query,
      summary: command.summary,
      bullets: command.bullets ?? [],
      sourceLinks,
      localRouterPreview,
      a2uiCompanion,
    }) as AfpMessage;
  }

  if (previewSurface === "task") {
    return buildTaskPreviewMessageState({
      base,
      intent: command.intent,
      query,
      summary: command.summary,
      bullets: command.bullets ?? [],
    }) as AfpMessage;
  }

  if (previewSurface === "note") {
    return buildNotePreviewMessageState({
      base,
      intent: command.intent,
      query,
      summary: command.summary,
    }) as AfpMessage;
  }

  if (previewSurface === "social") {
    return buildSocialComposerPreviewMessage(base, command, query);
  }

  if (previewSurface === "spaces") {
    return buildSpaceFeedPreviewMessage(base, command, query);
  }

  if (previewSurface === "travel_comparison") {
    return buildRouteComparisonPreviewMessage(base, command, query);
  }

  if (previewSurface === "travel_card") {
    return buildRouteCardPreviewMessage(base, command, query);
  }

  if (previewSurface === "schedule") {
    return buildSchedulePreviewMessageState({
      base,
      intent: command.intent,
      query,
      summary: command.summary,
      bullets: command.bullets ?? [],
      timestamp,
    }) as AfpMessage;
  }

  // ── Universal UI Presentation (intent: "trip_planner" or any orchestrate with rich content)
  // Produces a ui_presentation AFP message that PresentationCardRenderer renders as
  // interactive, domain-aware UI cards. Domain + card set are detected client-side
  // from the query, so no server changes are needed for new domains.
  // To add a new domain: update DOMAIN_SIGNALS + DOMAIN_DEFAULT_CARDS in presentationState.ts.
  if (previewSurface === "presentation") {
    return buildPresentationPreviewMessageState({
      base,
      intent: command.intent,
      query,
      summary: command.summary,
      bullets: command.bullets ?? [],
      links: command.links ?? [],
    }) as AfpMessage;
  }

  if (previewSurface === "orchestrate") {
    const a2uiCompanion = buildOrchestrationCompanionPanel(command, query);
    return buildOrchestrationPreviewMessageState({
      base,
      intent: command.intent,
      query,
      summary: command.summary,
      bullets: command.bullets ?? [],
      cardId: command.card_id ?? null,
      a2uiCompanion,
    }) as AfpMessage;
  }

  if (previewSurface === "dashboard_panel") {
    const panel = buildDashboardFocusPanel(command, query);
    return buildPanelPreviewMessageState({
      base,
      intent: command.intent,
      subtype: "dashboard_panel",
      panel,
    }) as AfpMessage;
  }

  const panel = previewSurface === "runner_panel"
    ? buildRunnerEditPanel(command, query)
    : buildGenericCommandPanel(command, query, sourceLinks);

  return buildPanelPreviewMessageState({
    base,
    intent: command.intent,
    subtype: previewSurface === "runner_panel" ? "runner_editor" : "workspace_panel",
    panel,
  }) as AfpMessage;
}

function buildCommandPreviewRenderFailureMessage(
  command: UiCommandResponse,
  query: string,
  error: unknown,
): AfpMessage {
  const timestamp = new Date().toISOString();
  const intent = typeof command.intent === "string" && command.intent.trim()
    ? command.intent
    : "command";
  const summary = typeof command.summary === "string" && command.summary.trim()
    ? command.summary
    : "The agent returned an answer, but this client could not render the interactive preview.";
  const errorMessage = error instanceof Error ? error.message : String(error);
  const content = {
    kind: "workspace_panel",
    title: "Master Agent result could not render",
    summary,
    query,
    sections: [
      {
        title: "What happened",
        body: "The workspace kept the session open and replaced the broken preview with this safe summary.",
      },
      {
        title: "Error",
        body: errorMessage,
      },
    ],
  };

  return {
    id: `preview.${intent}.render_failure.${timestamp}`,
    thread_id: `preview.thread.${intent}`,
    from: "omnyid://workspace/command-bar",
    to: ["omnyid://workspace/user"],
    timestamp,
    type: "agent",
    subtype: "workspace_panel",
    content,
    metadata: {
      origin: "workspace_command_preview",
      intent,
      render_failure: true,
      error_message: errorMessage,
    },
    views: [
      {
        format: "a2ui.v1",
        priority: 100,
        content,
      },
    ],
    attachments: [],
    references: [],
    encryption: null,
  };
}

function App() {
  const [session, setSession] = createSignal(readSession());
  // Declared early: userId/workspaceBootstrap are read synchronously by several
  // createMemo initializers further down (e.g. studyLensDashboard, weddingArrivalBanner),
  // and createMemo runs its computation immediately, so these must exist before those do.
  const [dashboard, setDashboard] = createSignal<DashboardBootstrap | null>(null);
  const workspaceBootstrap = createMemo<DashboardBootstrap | null>(() => {
    const live = dashboard();
    // Sample content is a guest-only walkthrough.  Never merge it into an
    // authenticated workspace: fabricated queue items can otherwise obscure
    // a real user's messages and make operational copy appear user-facing.
    if (session()?.token) return live;
    const sample = buildSampleDashboardBootstrap(session()?.user ?? live?.user);
    return mergeDashboardBootstrapWithSample(live, sample);
  });
  const guestUsesSampleWorkspace = createMemo(() => {
    if (session()?.token) return false;
    const bootstrap = workspaceBootstrap();
    if (!bootstrap) return false;
    if (bootstrap.user.auth_provider === "guest") return true;
    return dashboardBootstrapHasSampleMessages(bootstrap);
  });
  const userId = createMemo(() => workspaceBootstrap()?.user.id ?? session()?.user?.id ?? "");
  const gmailRedirectStatus =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("gmail")
      : null;
  const calendarRedirectStatus =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("calendar")
      : null;

  // Stable user ID at initialization — available before dashboard loads
  const initUserId = readSession()?.user?.id ?? "";
  // User-scoped localStorage key builders — reads use initUserId, writes use userId()
  const _prefs = loadPrefs(initUserId);
  const initialParaViewEnabled = loadParaViewPreference();
  const initialPreferredView = normalizeViewName(_prefs.activeView) ?? "search";
  const initialHistoryView = appViewFromBrowserHistory(window.history.state, window.location.href);
  const initialActiveView =
    gmailRedirectStatus
      ? "email"
      : calendarRedirectStatus
        ? "calendar"
        : initialHistoryView
          ? initialHistoryView
        : initialPreferredView === "para" && !initialParaViewEnabled
          ? "home"
          : initialPreferredView;
  const [paraViewEnabled, setParaViewEnabled] = createSignal(initialParaViewEnabled);
  const [activeView, setActiveView] = createSignal<ViewName>(
    initialActiveView
  );
  const [weddingNavigationIntent, setWeddingNavigationIntent] = createSignal<ReturnType<typeof consumeWeddingNavigationIntent>>(null);
  const [weddingReturnContextActive, setWeddingReturnContextActive] = createSignal(false);
  const weddingArrivalBanner = createMemo(() =>
    buildWeddingNavigationArrivalBannerState(weddingNavigationIntent()),
  );
  const [openThreadId, setOpenThreadId] = createSignal<string | null>(_prefs.openThreadId);
  const [openThreadMessageId, setOpenThreadMessageId] = createSignal<string | null>(null);
  const [threadInitialReplyDraft, setThreadInitialReplyDraft] = createSignal<string | null>(null);
  const [threadSessionHistory, setThreadSessionHistory] = createSignal(loadThreadSessionHistory(initUserId));
  const [navTrail, setNavTrail] = createSignal<ViewName[]>([initialActiveView]);

  const [rightOpen, setRightOpen] = createSignal(false);
  const [fleetOpen, setFleetOpen] = createSignal(false);

  const [loraScore, setLoraScore] = createSignal(0);
  const [loraActive, setLoraActive] = createSignal(false);
  const [fleetActiveCount, setFleetActiveCount] = createSignal(0);
  const [fleetIdleCount, setFleetIdleCount] = createSignal(0);
  const [fleetActiveNames, setFleetActiveNames] = createSignal<string[]>([]);
  const [searchFocusTick, setSearchFocusTick] = createSignal(0);
  const [fleetLoaded, setFleetLoaded] = createSignal(false);
  const [workflowNewResult, setWorkflowNewResult] = createSignal(
    loadWorkflowNewResultFlag(initUserId)
  );
  const [threadBadge, setThreadBadge] = createSignal(0);
  let seenThreadCount = loadThreadSeenCount(initUserId);

  // Browser AI
  const [browserAiLabel, setBrowserAiLabel] = createSignal<string | null>(null);

  // LLM config (for agent status line)
  const [llmConfig, setLlmConfig] = createSignal<LlmConfig | null>(null);

  // Agent settings focus: scroll to AI Model Config when opening from pill link
  const [agentSettingsFocusLlm, setAgentSettingsFocusLlm] = createSignal(false);
  const [agentSettingsFocusTab, setAgentSettingsFocusTab] = createSignal<"llm" | "mcp" | "skills" | "runtime" | null>(null);
  const [emailConnectFocusTick, setEmailConnectFocusTick] = createSignal(0);
  const [connectedAppsInitialFilter, setConnectedAppsInitialFilter] = createSignal<string | undefined>(undefined);

  // UI state
  const [advanced, setAdvanced] = createSignal(loadAdvancedNavEnabled(initUserId));
  const [studyLensEnabled, setStudyLensEnabled] = createSignal(loadStudyLensEnabled());
  const [savedStudyReportArtifacts, setSavedStudyReportArtifacts] = createSignal<StudyReportArtifact[]>([]);
  const [studyCourses, setStudyCourses] = createSignal<StudyCourse[]>([]);
  const [studyDeadlines, setStudyDeadlines] = createSignal<StudyDeadline[]>([]);
  const [studyAttempts, setStudyAttempts] = createSignal<StudyAttempt[]>([]);
  const [studySessions, setStudySessions] = createSignal<StudySession[]>([]);
  const [medicalMissedQuestionTopics, setMedicalMissedQuestionTopics] = createSignal<MedicalMissedQuestionTopic[]>([]);
  const [medicalConceptEdgeAttempts, setMedicalConceptEdgeAttempts] = createSignal<MedicalConceptEdgeAttempt[]>([]);

  // Onboarding / tour state
  const [showTour, setShowTour] = createSignal(Boolean(readSession()?.token) && loadShouldShowGuidedTour(initUserId));
  const [showOnboarding, setShowOnboarding] = createSignal(false);
  const [showProfilingConsent, setShowProfilingConsent] = createSignal(false);
  const [threadSearchLaunchQuery, setThreadSearchLaunchQuery] = createSignal<string | null>(null);
  const [threadSearchLaunchContext, setThreadSearchLaunchContext] =
    createSignal<ThreadSearchLaunchContext | null>(null);
  const [showEditProfile, setShowEditProfile] = createSignal(false);
  // The wedding marketing site's Sign In / Start Planning Free buttons deep-link
  // here with ?auth=signin|register|agent-id&source=wedding so guests land on
  // this same workspace sign-in form instead of a separate static one.
  const deepLinkParams = new URLSearchParams(window.location.search);
  const pendingAuthSource = deepLinkParams.get("source");
  const pendingVendorSlug = (deepLinkParams.get("vendor_slug") ?? deepLinkParams.get("vendor") ?? "").trim().toLowerCase(), vendorPortalUrlFromDeepLink = () => `/workspace/vendor.html${pendingVendorSlug ? `?vendor_slug=${encodeURIComponent(pendingVendorSlug)}` : ""}`;
  const shouldLaunchWeddingTemplateFromDeepLink = () =>
    pendingAuthSource === "wedding" || pendingAuthSource === "marketing" || pendingAuthSource === "wedding_quiz";
  function launchWeddingTemplateFromDeepLink() {
    saveWeddingEntrySource("wedding_site");
    setShowTour(false); setShowOnboarding(false); setShowProfilingConsent(false);
    void savePrimaryUseCase("wedding_planning", "inferred").catch(() => {});
    void import("@/lib/weddingLeadMagnetImportRunnerState").then(({ requestWeddingLeadMagnetImport }) => requestWeddingLeadMagnetImport());
    void import("@/lib/weddingTemplateDeepLinkLaunchState").then(({ buildWeddingTemplateDeepLinkLaunch, dispatchWeddingTemplateDeepLinkLaunch }) => {
      const launch = buildWeddingTemplateDeepLinkLaunch();
      dispatchWeddingTemplateDeepLinkLaunch(launch);
      // The navigation bridge persists the intent before it selects the view. The
      // mounted planner can therefore consume the intended wedding surface.
      void preloadViewModule(launch.viewTarget);
    });
  }

  async function launchPreloadedTemplateView(view: ViewName): Promise<void> {
    await preloadViewModule(view);
    selectView(view);
  }
  const [showAuthModal, setShowAuthModal] = createSignal(
    deepLinkParams.get("open_auth") === "1"
    || Boolean(deepLinkParams.get("auth"))
    || window.location.pathname === "/reset-password"
  );
  const [authNotice, setAuthNotice] = createSignal<AuthModalFeedback | null>(null);
  const [resetToken, setResetToken] = createSignal<string | undefined>(
    window.location.pathname === "/reset-password"
      ? (new URL(window.location.href).searchParams.get("token") ?? undefined)
      : undefined
  );
  const [primaryUseCaseProfile, setPrimaryUseCaseProfile] = createSignal<PrimaryUseCaseProfile | null>(null);
  const [primaryUseCaseNeedsPrompt, setPrimaryUseCaseNeedsPrompt] = createSignal(false);
  const [primaryUseCasePromptVisible, setPrimaryUseCasePromptVisible] = createSignal(false);
  const [primaryUseCaseSaving, setPrimaryUseCaseSaving] = createSignal(false);
  const [primaryUseCaseError, setPrimaryUseCaseError] = createSignal<string | null>(null);
  const [searchBusy, setSearchBusy] = createSignal(false);
  const [searchFeedback, setSearchFeedback] = createSignal("");
  const [isSearchError, setIsSearchError] = createSignal(false);
  const [attachmentIngestCapabilities, setAttachmentIngestCapabilities] =
    createSignal<AttachmentIngestCapabilities | null>(null);
  const [searchFailureReceipt, setSearchFailureReceipt] = createSignal<CommandSearchFailureReceipt | null>(null);
  const [commandResult, setCommandResult] = createSignal<UiCommandResponse | null>(null);
  const [searchComposerSeed, setSearchComposerSeed] =
    createSignal<(OnboardingQuickStartSeed & { id: number }) | null>(null);
  const [lastStudyLaunchMetadata, setLastStudyLaunchMetadata] =
    createSignal<SearchSubmitPayload["studyLaunchMetadata"] | null>(null);
  const [searchAttachmentGrounding, setSearchAttachmentGrounding] =
    createSignal<AttachmentGroundingEvidence | null>(null);
  const [pendingSearchCleanupMessageIds, setPendingSearchCleanupMessageIds] = createSignal<string[]>([]);
  const [retryingSearchCleanup, setRetryingSearchCleanup] = createSignal(false);
  const [persistingSearchAttachments, setPersistingSearchAttachments] = createSignal(false);
  const [workflowPendingIntent, setWorkflowPendingIntent] =
    createSignal<CommandPreviewWorkflowPendingIntentSeed | null>(null);
  const [objectSearchResult, setObjectSearchResult] = createSignal<ObjectMessagesResponse | null>(null);
  const [objectSearchFocusObjectId, setObjectSearchFocusObjectId] = createSignal<string | null>(null);
  const [objectSearchFocusThreadId, setObjectSearchFocusThreadId] = createSignal<string | null>(null);
  const [objectSearchLaunchContext, setObjectSearchLaunchContext] = createSignal<ObjectSearchLaunchContext | null>(null);
  const objectSearchRouterPreview = createLocalSemanticRouterPreviewController({ profile: "object" });
  const workspaceSearchRouterPreview = createLocalSemanticRouterPreviewController({ profile: "workspace" });
  const [lastQuery, setLastQuery] = createSignal("");
  const [lastEngine, setLastEngine] = createSignal("auto");
  const [lastOptMode, setLastOptMode] = createSignal("balanced");
  const [queryChipDismissed, setQueryChipDismissed] = createSignal(false);

  function primaryUseCasePromptDismissedKey() {
    return `omnyid.primary-use-case.prompt.dismissed.${userId() || "guest"}`;
  }

  function primaryUseCasePromptDismissedThisSession() {
    try {
      return sessionStorage.getItem(primaryUseCasePromptDismissedKey()) === "1";
    } catch {
      return false;
    }
  }

  function setPrimaryUseCasePromptDismissedThisSession(dismissed: boolean) {
    try {
      if (dismissed) {
        sessionStorage.setItem(primaryUseCasePromptDismissedKey(), "1");
      } else {
        sessionStorage.removeItem(primaryUseCasePromptDismissedKey());
      }
    } catch {
      // Browser storage can be unavailable in hardened/private contexts.
    }
  }

  async function refreshPrimaryUseCaseProfile(forcePrompt = false) {
    if (!session()?.token) {
      setPrimaryUseCaseProfile(null);
      setPrimaryUseCaseNeedsPrompt(false);
      setPrimaryUseCasePromptVisible(false);
      applyPrimaryUseCaseTheme(null);
      return;
    }

    let profile = await getSelfProfile();
    const adminProfile = withAdminPrimaryUseCaseDefault(profile, session()?.user?.email ?? null);
    if (adminProfile !== profile) {
      const status = await updateSelfProfile({ primary_use_case: adminProfile.primary_use_case });
      if (status === "ok") profile = await getSelfProfile();
    }

    const entrySource = loadWeddingEntrySource();
    setPrimaryUseCaseProfile(profile.primary_use_case ?? null);
    setPrimaryUseCaseNeedsPrompt(profileNeedsPrimaryUseCasePrompt(profile, entrySource));
    applyPrimaryUseCaseTheme(profile);

    const dismissed = primaryUseCasePromptDismissedThisSession();
    setPrimaryUseCasePromptVisible(forcePrompt || (profileNeedsPrimaryUseCasePrompt(profile, entrySource) && !dismissed));
  }

  async function handlePrimaryUseCaseSelect(kind: PrimaryUseCaseKind) {
    if (primaryUseCaseSaving()) return;
    setPrimaryUseCaseSaving(true);
    setPrimaryUseCaseError(null);
    try {
      const status = await savePrimaryUseCase(kind, "onboarding");
      if (status !== "ok") {
        setPrimaryUseCaseError("Could not save primary use case because local profile storage is full.");
        return;
      }
      setPrimaryUseCasePromptDismissedThisSession(false);
      await refreshPrimaryUseCaseProfile(false);
      setPrimaryUseCasePromptVisible(false);
    } catch (error: unknown) {
      setPrimaryUseCaseError(error instanceof Error ? error.message : "Could not save primary use case.");
    } finally {
      setPrimaryUseCaseSaving(false);
    }
  }

  async function handlePrimaryUseCaseComplete() {
    if (primaryUseCaseSaving()) return;
    setPrimaryUseCaseSaving(true);
    setPrimaryUseCaseError(null);
    try {
      const status = await completeCurrentPrimaryUseCase();
      if (status !== "ok") {
        setPrimaryUseCaseError("Could not complete primary use case because local profile storage is full.");
        return;
      }
      await refreshPrimaryUseCaseProfile(false);
      setPrimaryUseCasePromptVisible(false);
    } catch (error: unknown) {
      setPrimaryUseCaseError(error instanceof Error ? error.message : "Could not complete primary use case.");
    } finally {
      setPrimaryUseCaseSaving(false);
    }
  }

  function dismissPrimaryUseCasePrompt() {
    setPrimaryUseCasePromptDismissedThisSession(true);
    setPrimaryUseCasePromptVisible(false);
  }

  createEffect(() => {
    if (session()?.token) {
      setShowTour(loadShouldShowGuidedTour(userId()));
      return;
    }
    setShowTour(false);
  });

  onMount(() => {
    const unsubscribeParaViewPreference = subscribeParaViewPreference((enabled) => {
      setParaViewEnabled(enabled);
    });
    onCleanup(() => unsubscribeParaViewPreference());
  });

  onMount(() => {
    setSavedStudyReportArtifacts(loadStudyReportArtifacts());
    const onStudyReportSaved = (event: Event) => {
      setSavedStudyReportArtifacts(loadStudyReportArtifacts());
      const artifact = event instanceof CustomEvent ? event.detail as StudyReportArtifact | null : null;
      if (artifact) {
        projectMedicalAnkiWorkflowFromArtifact(artifact);
        projectMedicalTopologyCoverageFromArtifact(artifact);
        projectMedicalConceptRelationshipsFromArtifact(artifact);
        persistMedicalConceptEdgeAttemptsFromArtifact(artifact);
      }
    };
    window.addEventListener(STUDY_REPORT_ARTIFACT_SAVED_EVENT, onStudyReportSaved);
    onCleanup(() => window.removeEventListener(STUDY_REPORT_ARTIFACT_SAVED_EVENT, onStudyReportSaved));
  });

  onMount(() => {
    setStudyCourses(loadStudyCourses());
    const onStudyCourseSaved = () => setStudyCourses(loadStudyCourses());
    window.addEventListener(STUDY_COURSE_SAVED_EVENT, onStudyCourseSaved);
    onCleanup(() => window.removeEventListener(STUDY_COURSE_SAVED_EVENT, onStudyCourseSaved));
  });

  // Honour wedding and vendor deep links when a session is already active.
  onMount(() => {
    if (pendingAuthSource === "vendor_claim" && readSession()?.token) return void window.location.replace(vendorPortalUrlFromDeepLink());
    if (!shouldLaunchWeddingTemplateFromDeepLink() || !readSession()?.token) return;
    launchWeddingTemplateFromDeepLink();
  });

  onMount(() => {
    setStudyDeadlines(loadStudyDeadlines());
    const onStudyDeadlineSaved = () => setStudyDeadlines(loadStudyDeadlines());
    window.addEventListener(STUDY_DEADLINE_SAVED_EVENT, onStudyDeadlineSaved);
    onCleanup(() => window.removeEventListener(STUDY_DEADLINE_SAVED_EVENT, onStudyDeadlineSaved));
  });

  onMount(() => {
    setStudyAttempts(loadStudyAttempts());
    const onStudyAttemptSaved = () => setStudyAttempts(loadStudyAttempts());
    window.addEventListener(STUDY_ATTEMPT_SAVED_EVENT, onStudyAttemptSaved);
    onCleanup(() => window.removeEventListener(STUDY_ATTEMPT_SAVED_EVENT, onStudyAttemptSaved));
  });

  onMount(() => {
    setMedicalConceptEdgeAttempts(loadMedicalConceptEdgeAttempts());
    const onMedicalConceptEdgeAttemptSaved = () => setMedicalConceptEdgeAttempts(loadMedicalConceptEdgeAttempts());
    window.addEventListener(MEDICAL_CONCEPT_EDGE_ATTEMPT_SAVED_EVENT, onMedicalConceptEdgeAttemptSaved);
    onCleanup(() => window.removeEventListener(MEDICAL_CONCEPT_EDGE_ATTEMPT_SAVED_EVENT, onMedicalConceptEdgeAttemptSaved));
  });

  onMount(() => {
    setStudySessions(loadStudySessions());
    const onStudySessionSaved = () => setStudySessions(loadStudySessions());
    window.addEventListener(STUDY_SESSION_SAVED_EVENT, onStudySessionSaved);
    onCleanup(() => window.removeEventListener(STUDY_SESSION_SAVED_EVENT, onStudySessionSaved));
  });

  onMount(() => {
    setMedicalMissedQuestionTopics(loadMedicalMissedQuestionTopics());
    const onMedicalMissedQuestionTopicSaved = () => setMedicalMissedQuestionTopics(loadMedicalMissedQuestionTopics());
    window.addEventListener(MEDICAL_MISSED_QUESTION_TOPIC_SAVED_EVENT, onMedicalMissedQuestionTopicSaved);
    onCleanup(() => window.removeEventListener(MEDICAL_MISSED_QUESTION_TOPIC_SAVED_EVENT, onMedicalMissedQuestionTopicSaved));
  });

  createEffect(() => {
    if (paraViewEnabled() || activeView() !== "para") return;
    selectView("home");
  });

  createEffect(() => {
    if (paraViewEnabled()) return;
    const prefs = loadPrefs(userId());
    if (prefs.activeView !== "para") return;
    savePrefs({ activeView: "home", openThreadId: prefs.openThreadId }, userId());
  });

  createEffect(() => {
    if (paraViewEnabled()) return;
    const next = normalizedNavTrailEntries(navTrail());
    if (next.length !== navTrail().length) {
      setNavTrail(next);
    }
  });

  // U-01: update-ready toast — shown when the service worker has a new version waiting.
  const [updateReady, setUpdateReady] = createSignal(false);
  let pendingUpdateSw: ServiceWorker | null = null;

  function applyUpdate() {
    pendingUpdateSw?.postMessage({ type: "SKIP_WAITING" });
    // Reload after a brief delay so the new SW can activate.
    setTimeout(() => window.location.reload(), 250);
  }

  function persistPrefs(view: ViewName, threadId: string | null) {
    savePrefs({ activeView: normalizedView(view), openThreadId: threadId }, userId());
  }

  function normalizedView(view: ViewName): ViewName {
    return normalizeParaViewSelection(view, paraViewEnabled());
  }

  function normalizedNavTrailEntries(entries: readonly ViewName[]): ViewName[] {
    const next = paraViewEnabled()
      ? [...entries]
      : entries.filter((entry) => entry !== "para");
    const withoutAdjacentDuplicates = next.filter((entry, index) => index === 0 || entry !== next[index - 1]);
    if (withoutAdjacentDuplicates.length === 0) return ["home"];
    if (withoutAdjacentDuplicates[0] !== "home") return (["home", ...withoutAdjacentDuplicates] as ViewName[]).slice(-5);
    return withoutAdjacentDuplicates;
  }

  function persistThreadSessionHistory(next: ReturnType<typeof threadSessionHistory>) {
    setThreadSessionHistory(next);
    saveThreadSessionHistory(next, userId());
  }

  // Track when active fleet drops to 0 — set "new result" badge until Workflows is opened
  let prevActiveCount = 0;
  createEffect(() => {
    const current = fleetActiveCount();
    if (prevActiveCount > 0 && current === 0) {
      setWorkflowNewResult(saveWorkflowNewResultFlag(userId(), true));
    }
    prevActiveCount = current;
  });

  function addToNavTrail(view: ViewName) {
    setNavTrail((prev) => {
      const existing = prev.lastIndexOf(view);
      if (existing >= 0) return normalizedNavTrailEntries([...prev.slice(0, existing), view]);
      return normalizedNavTrailEntries([...prev.slice(-4), view]);
    });
  }

  function selectViewWithHistory(view: ViewName, historyMode: "push" | "replace" | "none") {
    const nextView = normalizedView(view);
    const previousView = activeView();
    preloadViewModule(nextView);
    if (nextView === "workflows") {
      setWorkflowNewResult(saveWorkflowNewResultFlag(userId(), false));
    }
    if (nextView === "threads") {
      setThreadBadge(0);
      const total = new Set(dashboardBootstrapMessages(workspaceBootstrap()).map((m) => m.thread_id)).size;
      seenThreadCount = saveThreadSeenCount(userId(), total);
    }
    // Reset only at Home; other views keep a clickable return trail.
    if (nextView === "home") {
      setNavTrail(normalizedNavTrailEntries([nextView]));
    } else {
      addToNavTrail(nextView);
    }
    if (nextView === "response_queue") setWeddingReturnContextActive(false);
    setActiveView(nextView);
    persistPrefs(nextView, openThreadId());
    if (historyMode !== "none" && (previousView !== nextView || historyMode === "replace")) {
      const nextState = browserHistoryStateForAppView(window.history.state, nextView);
      const nextUrl = browserHistoryUrlForAppView(window.location.href, nextView);
      if (historyMode === "replace") window.history.replaceState(nextState, "", nextUrl);
      else window.history.pushState(nextState, "", nextUrl);
    }
  }

  function selectView(view: ViewName) {
    selectViewWithHistory(view, "push");
  }

  onMount(() => {
    selectViewWithHistory(activeView(), "replace");
    const onPopState = (event: PopStateEvent) => {
      const view = appViewFromBrowserHistory(event.state, window.location.href);
      if (view) selectViewWithHistory(view, "none");
    };
    window.addEventListener("popstate", onPopState);
    onCleanup(() => window.removeEventListener("popstate", onPopState));
  });

  function openQuickControl(actionId: QuickControlActionId) {
    recordShortcutUse(actionId);
    if (actionId === "quick_model_switch") {
      setAgentSettingsFocusLlm(true);
      setAgentSettingsFocusTab("llm");
      selectView("agent_settings");
      return;
    }
    if (actionId === "quick_thread_privacy") {
      selectView("threads");
      return;
    }
    if (actionId === "quick_workspace_privacy") {
      selectView("sovereignty_audit");
    }
  }

  function openStudyQuickStart(seed: OnboardingQuickStartSeed) {
    setSearchComposerSeed({ ...seed, id: Date.now() });
    selectView("search");
    setSearchFocusTick((n) => n + 1);
  }

  const studyLensDashboard = createMemo(() =>
    buildStudyLensDashboardState({
      enabled: studyLensEnabled(),
      savedReportArtifacts: savedStudyReportArtifacts(),
      courses: studyCourses(),
      deadlines: studyDeadlines(),
      attempts: studyAttempts(),
      sessions: studySessions(),
      medicalMissedQuestionTopics: medicalMissedQuestionTopics(),
      medicalConceptEdgeAttempts: medicalConceptEdgeAttempts(),
      connectedAppIds: loadConnectedAppIds(userId(), new Set(AVAILABLE_CONNECTED_APPS.map((app) => app.id))),
      localOnlyConnectedApps: true,
      medicalStudentEvidence: {
        profileText: loadUserProfile(userId()).bio,
      },
    }),
  );

  function toggleStudyLens() {
    const next = saveStudyLensEnabled(!studyLensEnabled());
    setStudyLensEnabled(next);
    if (!next && activeView() === "study") {
      selectView("home");
    }
  }

  function openStudyLensReport(kind: ReportKind) {
    saveReportNavigationIntent(buildStudyLensReportIntent(kind));
    selectView("reports");
  }

  function openStudyLensReportIntent(intent: ReportNavigationIntent) {
    saveReportNavigationIntent(intent);
    selectView("reports");
  }

  function projectMedicalConceptRelationshipsFromArtifact(artifact: StudyReportArtifact) {
    const relationships = buildMedicalConceptRelationshipState({ artifacts: [artifact] }).relationships;
    for (const relationship of relationships) {
      if (hasSentMedicalConceptRelationshipAfpProjection(relationship.id)) continue;
      const projection = medicalConceptRelationshipToAfpSendInput(relationship);
      markMedicalConceptRelationshipAfpProjectionSent(relationship.id);
      void sendAfpMessage(projection).catch(() => {
        // Keep the saved report artifact usable; retry projection if the artifact is saved again.
        unmarkMedicalConceptRelationshipAfpProjectionSent(relationship.id);
      });
    }
  }

  function projectMedicalAnkiWorkflowFromArtifact(artifact: StudyReportArtifact) {
    if (hasSentMedicalAnkiWorkflowAfpProjection(artifact.id)) return;
    const projection = medicalAnkiWorkflowArtifactToAfpSendInput(artifact);
    if (!projection) return;
    markMedicalAnkiWorkflowAfpProjectionSent(artifact.id);
    void sendAfpMessage(projection).catch(() => {
      // Keep the saved report artifact usable; retry projection if the artifact is saved again.
      unmarkMedicalAnkiWorkflowAfpProjectionSent(artifact.id);
    });
  }

  function projectMedicalTopologyCoverageFromArtifact(artifact: StudyReportArtifact) {
    if (hasSentMedicalTopologyCoverageAfpProjection(artifact.id)) return;
    const projection = medicalTopologyCoverageArtifactToAfpSendInput(artifact);
    if (!projection) return;
    markMedicalTopologyCoverageAfpProjectionSent(artifact.id);
    void sendAfpMessage(projection).catch(() => {
      // Keep the saved report artifact usable; retry projection if the artifact is saved again.
      unmarkMedicalTopologyCoverageAfpProjectionSent(artifact.id);
    });
  }

  function persistMedicalConceptEdgeAttemptsFromArtifact(artifact: StudyReportArtifact) {
    const attempts = extractMedicalConceptEdgeAttemptsFromArtifact(artifact);
    if (attempts.length === 0) return;
    for (const attempt of attempts) {
      const saved = saveMedicalConceptEdgeAttempt(attempt);
      emitMedicalConceptEdgeAttemptSaved(saved);
      if (hasSentMedicalConceptEdgeAttemptAfpProjection(saved.id)) continue;
      const projection = medicalConceptEdgeAttemptToAfpSendInput(saved);
      markMedicalConceptEdgeAttemptAfpProjectionSent(saved.id);
      void sendAfpMessage(projection).catch(() => {
        // Keep the attempt evidence local; retry projection if the artifact is saved again.
        unmarkMedicalConceptEdgeAttemptAfpProjectionSent(saved.id);
      });
    }
    setMedicalConceptEdgeAttempts(loadMedicalConceptEdgeAttempts());
  }

  function openCalendarEventFromObjectSearch(eventId: string, date?: string | null) {
    setCalendarNavigationEventId(eventId);
    setCalendarNavigationDate(date ?? null);
    selectView("calendar");
  }

  function openStudyLensFileLibraryIntent(intent: FileLibraryNavigationIntent) {
    saveFileLibraryNavigationIntent(intent);
    selectView("files");
  }

  function openStudyLensKnowledgeGraphIntent(intent: KnowledgeGraphNavigationIntent) {
    saveKnowledgeGraphNavigationIntent(intent);
    selectView("knowledge_graph");
  }

  function addStudyLensDeadline(input: { title: string; dueLabel: string; kind: StudyDeadlineKind; courseTag?: string | null }) {
    const deadline = buildManualStudyDeadline(input);
    if (!deadline) return;
    const saved = saveStudyDeadline(deadline);
    setStudyDeadlines(loadStudyDeadlines());
    emitStudyDeadlineSaved(saved);
    const course = buildInferredStudyCourseFromTag({ courseTag: saved.courseTag });
    if (course) {
      const savedCourse = saveStudyCourse(course);
      setStudyCourses(loadStudyCourses());
      emitStudyCourseSaved(savedCourse);
    }
  }

  function updateStudyLensDeadlineReview(deadlineId: string, reviewStatus: StudyDeadlineReviewStatus) {
    const updated = updateStudyDeadlineReviewStatus(deadlineId, reviewStatus);
    if (!updated) return;
    setStudyDeadlines(loadStudyDeadlines());
    emitStudyDeadlineSaved(updated);
    const projection = studyDeadlineToAfpSendInput(updated);
    if (projection && !hasSentStudyDeadlineAfpProjection(updated.id)) {
      markStudyDeadlineAfpProjectionSent(updated.id);
      void sendAfpMessage(projection).catch(() => {
        // Local projection still keeps the accepted date visible in Calendar.
        unmarkStudyDeadlineAfpProjectionSent(updated.id);
      });
    }
  }

  function addStudyLensCourse(input: {
    name: string;
    courseTag?: string | null;
    termLabel?: string | null;
    institutionLabel?: string | null;
  }) {
    const course = buildManualStudyCourse(input);
    if (!course) return;
    const saved = saveStudyCourse(course);
    setStudyCourses(loadStudyCourses());
    emitStudyCourseSaved(saved);
  }

  function addStudyLensAttempt(input: {
    mode: StudyAttemptMode;
    title?: string | null;
    totalItems: number;
    correctItems?: number | null;
    durationSeconds?: number | null;
    courseTag?: string | null;
  }) {
    const attempt = buildManualStudyAttempt(input);
    if (!attempt) return;
    const saved = saveStudyAttempt(attempt);
    setStudyAttempts(loadStudyAttempts());
    emitStudyAttemptSaved(saved);
    const course = buildInferredStudyCourseFromTag({ courseTag: saved.courseTag });
    if (course) {
      const savedCourse = saveStudyCourse(course);
      setStudyCourses(loadStudyCourses());
      emitStudyCourseSaved(savedCourse);
    }
  }

  function addStudyLensMedicalMissedTopic(input: {
    topic: string;
    qbankProvider?: MedicalMissedQuestionTopic["qbankProvider"] | null;
    userQuestionId?: string | null;
    courseTag?: string | null;
    systemTag?: string | null;
    unitTag?: string | null;
    chapterTag?: string | null;
    conceptTags?: readonly string[] | null;
  }) {
    const topic = buildMedicalMissedQuestionTopic({
      ...input,
      source: "study_lens",
    });
    if (!topic) return;
    const saved = saveMedicalMissedQuestionTopic(topic);
    setMedicalMissedQuestionTopics(loadMedicalMissedQuestionTopics());
    emitMedicalMissedQuestionTopicSaved(saved);
    if (!hasSentMedicalMissedQuestionAfpProjection(saved.id)) {
      const projection = medicalMissedQuestionTopicToAfpSendInput(saved);
      markMedicalMissedQuestionAfpProjectionSent(saved.id);
      void sendAfpMessage(projection).catch(() => {
        // The local missed-topic record remains usable; retry projection on a later save.
        unmarkMedicalMissedQuestionAfpProjectionSent(saved.id);
      });
    }
    const course = buildInferredStudyCourseFromTag({ courseTag: saved.courseTag });
    if (course) {
      const savedCourse = saveStudyCourse(course);
      setStudyCourses(loadStudyCourses());
      emitStudyCourseSaved(savedCourse);
    }
  }

  function selectKnownView(view: string | null | undefined): boolean {
    const normalized = normalizeViewName(view);
    if (!normalized) return false;
    selectView(normalized);
    return true;
  }

  function runWeddingArrivalAction(action: WeddingArrivalAction) {
    const draftPrompt = action.draftPrompt?.trim();
    if (!action.disabled && action.kind === "continue_chat" && draftPrompt) {
      openThread(`thread_wedding_research_${Date.now()}`, null, { initialReplyDraft: draftPrompt });
      return;
    }
    const destination = weddingArrivalActionDestinationView(action);
    if (destination) selectView(destination);
  }

  function weddingArrivalBannerFor(view: ViewName) {
    const state = weddingArrivalBanner();
    return state?.source.view === view ? state : null;
  }

  function currentThreadSessionEntry(): ThreadSessionHistoryEntry | null {
    const threadId = openThreadId();
    return threadId ? { threadId, messageId: openThreadMessageId() } : null;
  }

  function openThread(
    threadId: string,
    messageId?: string | null,
    options?: { trackHistory?: boolean; initialReplyDraft?: string | null },
  ) {
    const target = { threadId, messageId: messageId ?? null };
    if (options?.trackHistory !== false) {
      persistThreadSessionHistory(
        pushThreadSessionHistory(threadSessionHistory(), currentThreadSessionEntry(), target),
      );
    }
    setThreadInitialReplyDraft(options?.initialReplyDraft?.trim() || null);
    setOpenThreadId(threadId);
    setOpenThreadMessageId(messageId ?? null);
    selectView("threads"); // selectView calls persistPrefs with the current openThreadId — set ID first
  }

  function navigateThreadSessionHistory(direction: "back" | "forward"): boolean {
    const current = currentThreadSessionEntry();
    const result =
      direction === "back"
        ? stepBackThreadSessionHistory(threadSessionHistory(), current)
        : stepForwardThreadSessionHistory(threadSessionHistory(), current);
    if (!result.target) return false;
    persistThreadSessionHistory(result.state);
    openThread(result.target.threadId, result.target.messageId, { trackHistory: false });
    return true;
  }

  function openAuthModalIfSignedOut(force = false) {
    if (!force && session()?.token) return;
    setShowAuthModal(true);
  }
  const [runnerFiles, setRunnerFiles] = createSignal<RuntimeWorkspaceFileEntry[]>([]);
  const [activeFile, setActiveFile] = createSignal<RuntimeWorkspaceFileResponse | null>(null);
  const [editorValue, setEditorValue] = createSignal("");
  const [runnerFeedback, setRunnerFeedback] = createSignal(
    "Deploy a Python runner and load a file to edit code here."
  );
  const [runnerFeedbackReceipt, setRunnerFeedbackReceipt] = createSignal<RuntimeRunnerFailureReceipt | null>(null);
  const [runtimeLogs, setRuntimeLogs] = createSignal<string[]>([]);
  const [runtimeLogSource, setRuntimeLogSource] = createSignal("bootstrap");
  const [runtimeBusy, setRuntimeBusy] = createSignal(false);
  const [calendarNavigationDate, setCalendarNavigationDate] = createSignal<string | null>(null);
  const [calendarNavigationEventId, setCalendarNavigationEventId] = createSignal<string | null>(null);
  const [serverOffline, setServerOffline] = createSignal(false);
  const [retrying, setRetrying] = createSignal(false);
  const [workspaceAssistRefreshOrigins, setWorkspaceAssistRefreshOrigins] = createSignal<Record<string, WorkspaceAssistRefreshOrigin>>({});
  const visibleSearchResultCount = createMemo(() =>
    activeView() === "search" && objectSearchResult() ? objectSearchResult()!.count : null,
  );
  let dashboardFetchSeq = 0;
  let runnerFilesFetchSeq = 0;
  const searchAttachmentActions = createMemo(() => buildStudyAttachmentActionState(searchAttachmentGrounding()));
  let loraIntervalId: ReturnType<typeof setInterval> | null = null;
  let dashboardDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const workspaceAssistRefreshCoordinator = createWorkspaceAssistRefreshCoordinator();

  function loadDashboard() {
    if (dashboardDebounceTimer !== null) clearTimeout(dashboardDebounceTimer);
    dashboardDebounceTimer = setTimeout(() => { dashboardDebounceTimer = null; void _loadDashboard(); }, 120);
  }

  function markWorkspaceAssistRefreshOrigin(surfaceKey: string, origin: WorkspaceAssistRefreshOrigin) {
    setWorkspaceAssistRefreshOrigins((current) => ({ ...current, [surfaceKey]: origin }));
  }

  function workspaceAssistRefreshOrigin(surfaceKey: string): WorkspaceAssistRefreshOrigin {
    return workspaceAssistRefreshOrigins()[surfaceKey] ?? "cached";
  }

  async function _loadDashboard() {
    if (!session()?.token) { setDashboard(null); return; }
    const seq = ++dashboardFetchSeq;
    try {
      const payload = await fetchDashboardBootstrap();
      if (seq !== dashboardFetchSeq) return;
      // Decrypt AFP messages in-memory before rendering — plaintext never re-stored
      const decrypt = await loadDecryptModule();
      // A dashboard reload can happen immediately after sign-in, before the
      // mount-time key initializer completes.  Initialize here as well so a
      // successfully authenticated device does not remain in a false
      // "decrypting" state until a later navigation happens to reload it.
      if (!decrypt.isDecryptReady() && session()?.token) {
        try {
          const keys = await fetchEncKey();
          await decrypt.initDecrypt(keys.enc_key_hex);
        } catch {
          // Preserve ciphertext-only rendering when this device genuinely
          // cannot obtain its account key.
        }
      }
      const { decryptMessages } = decrypt;
      payload.messages = decryptMessages(payload.messages);
      setDashboard(payload);
      dispatchDecisionOsUpdateEvent(payload);
      const total = new Set(payload.messages.map((m) => m.thread_id)).size;
      if (activeView() === "threads") {
        // User is already reading threads — keep seenCount current so no badge fires on next load
        seenThreadCount = saveThreadSeenCount(userId(), total);
      } else if (total > seenThreadCount) {
        setThreadBadge(total - seenThreadCount);
      }
      const runtimeMonitorFeedback = runtimeDeploymentMonitorFeedback(
        dashboardBootstrapRuntimeDeployment(payload),
        dashboardBootstrapRuntimeUpdates(payload),
      );
      if (runtimeMonitorFeedback) {
        setRuntimeLogs(runtimeDeploymentMonitorLines(dashboardBootstrapRuntimeDeployment(payload)));
        setRuntimeLogSource(runtimeDeploymentMonitorSource(dashboardBootstrapRuntimeDeployment(payload)));
        setRunnerFeedbackReceipt(null);
        setRunnerFeedback(runtimeMonitorFeedback);
      }
    } catch (error) {
      if (seq !== dashboardFetchSeq) return;
      // Background load errors should not overwrite the search feedback slot
      console.warn("Dashboard load failed:", (error as Error).message);
    }
  }

  async function decryptCommandPreviewForDisplay(response: UiCommandResponse): Promise<UiCommandResponse> {
    const preview = response.preview_message;
    if (!preview?.encryption) return response;
    try {
      const decrypt = await loadDecryptModule();
      if (!decrypt.isDecryptReady() && session()?.token) {
        const keys = await fetchEncKey();
        await decrypt.initDecrypt(keys.enc_key_hex);
      }
      // The plaintext lives only in this response signal; it is never persisted by the client.
      return { ...response, preview_message: decrypt.tryDecryptMessage(preview) };
    } catch {
      // ViewDispatcher renders its explicit local-unlock placeholder when the device key is unavailable.
      return response;
    }
  }

  async function loadRunnerFiles() {
    if (!session()?.token) { setRunnerFiles([]); setActiveFile(null); setEditorValue(""); return; }
    const seq = ++runnerFilesFetchSeq;
    try {
      const payload = await listRuntimeWorkspaceFiles();
      if (seq !== runnerFilesFetchSeq) return;
      setRunnerFiles(payload.files);
      const fileId = payload.active_file_id || payload.files[0]?.file_id;
      if (fileId) await selectFile(fileId);
    } catch (error) {
      if (seq !== runnerFilesFetchSeq) return;
      const receipt = buildRuntimeRunnerFailureReceipt(
        "Load runner files",
        error instanceof Error ? error.message : "Could not load runner files.",
      );
      setRunnerFeedbackReceipt(receipt);
      setRunnerFeedback(receipt.summary);
    }
  }

  async function deployPythonRunner() {
    if (!session()?.token) return;
    setRuntimeBusy(true);
    setRunnerFeedbackReceipt(null);
    setRunnerFeedback("Deploying your private Python runner...");
    try {
      await deployRuntime("python-runner-chat");
      loadDashboard();
      await loadRunnerFiles();
      await loadRuntimeLogs();
      setRunnerFeedbackReceipt(null);
      setRunnerFeedback("Python runner deployed. Logs and files are ready.");
      selectView("runner");
    } catch (error) {
      const receipt = buildRuntimeRunnerFailureReceipt(
        "Deploy runner",
        error instanceof Error ? error.message : "Runner deployment failed.",
      );
      setRunnerFeedbackReceipt(receipt);
      setRunnerFeedback(receipt.summary);
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function handleRuntimeAction(action: "start" | "stop" | "restart") {
    if (!session()?.token) return;
    setRuntimeBusy(true);
    setRunnerFeedbackReceipt(null);
    setRunnerFeedback(`Sending ${action} command to the isolated runner...`);
    try {
      await runRuntimeAction(action);
      loadDashboard();
      await loadRuntimeLogs();
      setRunnerFeedbackReceipt(null);
      setRunnerFeedback(`Runtime ${action} completed.`);
    } catch (error) {
      const receipt = buildRuntimeRunnerFailureReceipt(
        `${action[0].toUpperCase()}${action.slice(1)} runner`,
        error instanceof Error ? error.message : `Runtime ${action} failed.`,
      );
      setRunnerFeedbackReceipt(receipt);
      setRunnerFeedback(receipt.summary);
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function refreshRunnerMonitor() {
    setRuntimeBusy(true);
    try {
      loadDashboard();
      await loadRuntimeLogs();
      setRunnerFeedbackReceipt(null);
      setRunnerFeedback("Runtime monitor refreshed.");
    } catch (error) {
      const receipt = buildRuntimeRunnerFailureReceipt(
        "Refresh runtime monitor",
        error instanceof Error ? error.message : "Runtime monitor refresh failed.",
      );
      setRunnerFeedbackReceipt(receipt);
      setRunnerFeedback(receipt.summary);
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function selectFile(fileId: string) {
    try {
      const payload = await fetchRuntimeWorkspaceFile(fileId);
      setActiveFile(payload);
      setEditorValue(payload.content);
      setRunnerFeedbackReceipt(null);
      setRunnerFeedback(`Loaded ${payload.relative_path}.`);
    } catch (error) {
      const receipt = buildRuntimeRunnerFailureReceipt(
        "Load runner file",
        error instanceof Error ? error.message : "Runner file load failed.",
      );
      setRunnerFeedbackReceipt(receipt);
      setRunnerFeedback(receipt.summary);
    }
  }

  async function saveActiveFile() {
    const currentFile = activeFile();
    if (!currentFile) return;
    try {
      const payload = await saveRuntimeWorkspaceFile({
        file_id: currentFile.file_id,
        content: editorValue(),
      });
      setActiveFile(payload);
      setEditorValue(payload.content);
      setRunnerFeedbackReceipt(null);
      setRunnerFeedback(`Saved ${payload.relative_path} at ${payload.updated_at}.`);
    } catch (error) {
      const receipt = buildRuntimeRunnerFailureReceipt(
        "Save runner file",
        error instanceof Error ? error.message : "Runner file save failed.",
      );
      setRunnerFeedbackReceipt(receipt);
      setRunnerFeedback(receipt.summary);
    }
  }

  async function loadRuntimeLogs() {
    if (!session()?.token) { setRuntimeLogs([]); return; }
    try {
      const payload = await fetchRuntimeLogs();
      setRuntimeLogs(payload.lines ?? []);
      setRuntimeLogSource(payload.source || "runtime/logs");
      setRunnerFeedbackReceipt(null);
    } catch (error) {
      const receipt = buildRuntimeRunnerFailureReceipt(
        "Load runtime logs",
        error instanceof Error ? error.message : "Runtime log load failed.",
      );
      setRunnerFeedbackReceipt(receipt);
      setRuntimeLogs([
        `[runner] ${receipt.title}`,
        receipt.summary,
        `Next step: ${receipt.nextStep}`,
      ]);
      setRuntimeLogSource("runtime/logs");
    }
  }

  function startLoraPolling() {
    if (loraIntervalId !== null) return;
    void loadLora();
    loraIntervalId = setInterval(() => { if (session()?.token) void loadLora(); }, 30_000);
  }

  async function bootstrap() {
    if (!session()?.token) {
      setServerOffline(false);
      void loadDashboard();
      void loadRunnerFiles();
      void loadRuntimeLogs();
      return;
    }
    try {
      await probeApiReachability();
      setServerOffline(false);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      const isNetwork = !msg
        || msg.toLowerCase().includes("failed to fetch")
        || msg.toLowerCase().includes("networkerror")
        || msg.toLowerCase().includes("load failed");
      if (isNetwork) {
        setServerOffline(true);
        return;
      }
      // 4xx/5xx from /healthz still means the server is reachable — clear any prior offline state
      setServerOffline(false);
    }
    void loadDashboard();
    void loadRunnerFiles();
    void loadRuntimeLogs();
  }

  async function loadLora() {
    try {
      const fleet = await getFleet();
      const summary = fleetStatusSummary(fleet);
      if (fleet.instance) {
        setLoraScore(fleet.instance.lora_confidence_score ?? 0);
        setLoraActive(fleet.instance.lora_genome_active ?? false);
      }
      setFleetActiveCount(summary.active_count);
      setFleetIdleCount(summary.idle_count);
      setFleetActiveNames(summary.active_agents);
    } catch { /* ignore */ }
    setFleetLoaded(true);
  }

  const runnerWorkspaceAssist = createMemo(() => {
    const file = activeFile();
    const payload = dashboard();
    if (!file && !editorValue().trim()) return null;
    const refreshOrigin = workspaceAssistRefreshOrigin("runner");

    const topic = detectWorkspaceAssistTopic({
      app_label: "Python runner editor",
      document_title: file?.label ?? null,
      file_path: file?.relative_path ?? null,
      editor_text: editorValue(),
      recent_activity_titles: buildDashboardWorkspaceAssistRecentTitles(payload),
    });

    return selectWorkspaceAssistSuggestion({
      topic,
      candidates: buildDashboardWorkspaceAssistCandidates(payload, {
        refreshOrigin,
      }),
    });
  });

  function openRunnerWorkspaceAssist() {
    const suggestion = runnerWorkspaceAssist();
    const destination = workspaceAssistNavigationView(suggestion?.destination_view) ?? "home";
    if (destination === "search" && suggestion?.research_query?.trim()) {
      selectView("search");
      void handleSearch(suggestion.research_query.trim(), lastEngine(), lastOptMode());
      return;
    }
    selectView(destination);
  }

  function openWorkspaceAssistNavigation(
    view: string,
    query?: string | null,
  ) {
    if (view === "search" && query?.trim()) {
      selectView("search");
      void handleSearch(query.trim(), lastEngine(), lastOptMode());
      return;
    }
    selectView(normalizeViewName(view) ?? "home");
  }

  function returnToWeddingPlannerHome() {
    const existing = loadWeddingNavigationIntent();
    const entry = buildWeddingTemplateEntryState();
    dispatchWeddingNavigationIntent(buildWeddingPlannerHomeIntent(
      existing ?? {
        weddingPlanId: entry.metadata.weddingPlanId,
        responseWorkspaceId: entry.metadata.responseWorkspaceId,
        sourceResponseId: entry.metadata.sourceResponseId,
        metadata: entry.metadata,
      },
    ));
    saveWeddingWorkspaceMenu("home");
    dispatchWeddingWorkspaceMenuSelection("home");
    selectView("response_queue");
    if (typeof window !== "undefined") replaceWeddingWorkspaceMenuInUrl("home");
  }

  async function handleSearch(
    queryOrPayload: string | SearchSubmitPayload,
    engine?: string,
    optimizationMode = "balanced",
    overrides?: {
      focusObjectId?: string | null;
      focusThreadId?: string | null;
      launchContext?: ObjectSearchLaunchContext | null;
    },
  ) {
    const submitPayload: SearchSubmitPayload =
      typeof queryOrPayload === "string"
        ? {
            query: queryOrPayload,
            engine: engine ?? lastEngine(),
            optimizationMode,
          }
        : queryOrPayload;
    const query = submitPayload.query;
    const resolvedEngine = submitPayload.engine;
    const resolvedOptimizationMode = submitPayload.optimizationMode ?? optimizationMode;
    const attachedFiles = submitPayload.attachments ?? [];
    const attachmentRetentionMode = submitPayload.attachmentRetentionMode ?? "keep_extracted_only";
    const knowledgeOrganizationMode = submitPayload.knowledgeOrganizationMode ?? "connected_notes";
    const attachmentSupport = summarizeKnowledgeAttachmentSupport(
      attachedFiles,
      attachmentIngestCapabilities(),
    );
    const supportedAttachedFiles = attachmentSupport.supportedFiles;
    const skippedUnsupportedFiles = attachmentSupport.unsupportedFiles;
    const priorQuery = lastQuery();
    const currentLaunchContext = objectSearchLaunchContext();
    if (
      attachedFiles.length === 0
      && !overrides?.focusObjectId
      && !overrides?.focusThreadId
      && !overrides?.launchContext
      && isWeddingVendorSearchIntent(query)
    ) {
      const savedLaunch = saveWeddingVendorSearchLaunch(query, { source: "master_search" }) ?? {
        query: normalizeWeddingVendorSearchLaunchQuery(query),
        source: "master_search" as const,
        savedAt: new Date().toISOString(),
      };
      dispatchWeddingVendorSearchLaunch(savedLaunch);
      saveWeddingEntrySource("generic");
      void savePrimaryUseCase("wedding_planning", "manual").catch(() => {});
      void import("@/lib/weddingTemplateDeepLinkLaunchState").then(({ buildWeddingTemplateDeepLinkLaunch, dispatchWeddingTemplateDeepLinkLaunch }) => {
        const launch = buildWeddingTemplateDeepLinkLaunch();
        dispatchWeddingTemplateDeepLinkLaunch(launch);
        void preloadViewModule(launch.viewTarget);
      });
      setLastQuery(query);
      setLastEngine(resolvedEngine);
      setLastOptMode(resolvedOptimizationMode);
      setSearchFeedback("Opening Wedding Planner with this vendor search ready to review.");
      setIsSearchError(false);
      return;
    }
    setSearchBusy(true);
    setSearchFeedback("");
    setIsSearchError(false);
    setSearchFailureReceipt(null);
    setObjectSearchResult(null);
    setSearchAttachmentGrounding(null);
    setPendingSearchCleanupMessageIds([]);
    setLastQuery(query);
    setLastEngine(resolvedEngine);
    setLastOptMode(resolvedOptimizationMode);
    setLastStudyLaunchMetadata(submitPayload.studyLaunchMetadata ?? null);
    setQueryChipDismissed(false);
    let cleanupMessageIds: string[] = [];
    let attachmentGroundingEvidence: AttachmentGroundingEvidence | null = null;
    try {
      if (attachedFiles.length > 0 && supportedAttachedFiles.length === 0) {
        const unsupportedNames = skippedUnsupportedFiles
          .slice(0, 3)
          .map((file) => file.name)
          .join(", ");
        const overflowLabel =
          skippedUnsupportedFiles.length > 3
            ? ` and ${skippedUnsupportedFiles.length - 3} more`
            : "";
        throw new Error(
          `None of the attached files can be read yet: ${unsupportedNames}${overflowLabel}. Try PDF, DOCX, TXT, Markdown, CSV, or common audio files.`,
        );
      }
      if (supportedAttachedFiles.length > 0 && !session()?.token) {
        throw new Error("Attachments require a signed-in session.");
      }
      if (supportedAttachedFiles.length > 0 && session()?.token) {
        const targetThreadId =
          overrides?.focusThreadId
          ?? objectSearchFocusThreadId()
          ?? openThreadId()
          ?? `thread.search.${Date.now()}`;
        const uploaded = await Promise.all(
          supportedAttachedFiles.map(async (file) => {
            const inlineExtract = await extractInlineKnowledgeText(file).catch(() => null);
            const payload = await uploadFilePayload(file, {
              token: session()?.token,
              filename: file.name,
            });
            if (!payload.message_id || !payload.attachment) {
              throw new Error(`Attachment upload failed for ${file.name}.`);
            }
            return {
              source_message_id: payload.message_id,
              attachment_id: payload.attachment.id,
              file_name: payload.attachment.name,
              mime_type: payload.attachment.mime_type,
              inline_text: inlineExtract?.text ?? null,
              inline_content_type: inlineExtract?.contentType ?? null,
              extraction_mode: inlineExtract?.extractionMode ?? null,
            };
          }),
        );
        const ingestResult = await ingestAttachmentBatch({
          thread_id: targetThreadId,
          query,
          retention_mode: attachmentRetentionMode,
          knowledge_mode: knowledgeOrganizationMode,
          uploads: uploaded,
        });
        const ingestedItems = ingestResult.items.filter((item) => item.ingested !== false);
        const failedItems = ingestResult.items.filter((item) => item.ingested === false);
        attachmentGroundingEvidence = buildAttachmentGroundingEvidence(ingestedItems, {
          selectedFileCount: attachedFiles.length,
          skippedFileCount: skippedUnsupportedFiles.length,
          unreadableFileCount: failedItems.length,
          retentionMode: attachmentRetentionMode,
          knowledgeMode: knowledgeOrganizationMode,
        });
        setSearchAttachmentGrounding(attachmentGroundingEvidence);
        const inlineExtractedCount = ingestedItems.filter((item) => item.inline_extracted).length;
        const serverParsedCount = ingestedItems.length - inlineExtractedCount;
        const totalEstimatedIngestCostUsd = ingestedItems.reduce(
          (sum, item) => sum + (typeof item.cost_usd === "number" ? item.cost_usd : 0),
          0,
        );
        const ingestCostLabel = totalEstimatedIngestCostUsd > 0
          ? ` Estimated ingest cost: $${totalEstimatedIngestCostUsd.toFixed(4)}.`
          : "";
        const resourceShelfLabel =
          attachmentRetentionMode === "keep_nothing"
            ? ""
            : " Saved into PARA Resources for later retrieval.";
        let resourceSyncWarningLabel = "";
        const knowledgeTagSummary = summarizeAttachmentKnowledgeTags(ingestedItems);
        const knowledgeTagLabel = knowledgeTagSummary
          ? ` Linked into notes with supertags: ${knowledgeTagSummary}.`
          : "";
        const supportGapSummary = failedItems
          .map((item) => {
            const label = item.support_label?.trim();
            const name = item.file_name || item.mime_type || "attachment";
            return label ? `${name} (${label})` : name;
          })
          .join(", ");
        const supportGapDetail = failedItems
          .map((item) => item.support_description?.trim())
          .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index)
          .join(" ");
        const retentionLabel =
          attachmentRetentionOutcome(attachmentRetentionMode);
        const organizationLabel =
          knowledgeOrganizationMode === "zettelkasten"
            ? "Organized as Zettelkasten source material."
            : knowledgeOrganizationMode === "standard"
              ? "Organized in standard knowledge mode."
              : "Organized as connected notes.";
        const skippedUnsupportedLabel = skippedUnsupportedFiles.length > 0
          ? ` Skipped ${skippedUnsupportedFiles.length} unsupported file${skippedUnsupportedFiles.length === 1 ? "" : "s"}: ${skippedUnsupportedFiles
            .slice(0, 3)
            .map((file) => file.name)
            .join(", ")}${skippedUnsupportedFiles.length > 3 ? ` and ${skippedUnsupportedFiles.length - 3} more` : ""}.`
          : "";
        if (ingestedItems.length === 0 && failedItems.length > 0) {
          throw new Error(
            `No attachments could be read. ${failedItems.map((item) => item.file_name || "file").join(", ")}`,
          );
        }
        if (attachmentRetentionMode !== "keep_nothing") {
          const resourceSyncOk = await classifySearchKnowledgeResources(
            ingestedItems.map((item) => ({
              output_message_id: item.output_message_id,
              source_message_id: item.source_message_id,
              file_name: item.file_name,
              mime_type: item.mime_type,
            })),
            knowledgeOrganizationMode,
          );
          if (!resourceSyncOk) {
            resourceSyncWarningLabel =
              " Resource shelf update could not be confirmed, but the ingested notes remain available in this thread and knowledge graph.";
          }
        }
        if (failedItems.length > 0) {
          const failedNames = failedItems
            .map((item) => item.file_name || item.mime_type || "attachment")
            .join(", ");
          setSearchFeedback(
            `Used ${ingestedItems.length} attachment${ingestedItems.length === 1 ? "" : "s"} (${inlineExtractedCount} instant text read${inlineExtractedCount === 1 ? "" : "s"}, ${serverParsedCount} server parse${serverParsedCount === 1 ? "" : "s"}).${knowledgeTagLabel} ${organizationLabel}${resourceShelfLabel}${skippedUnsupportedLabel} Could not read ${failedItems.length}: ${supportGapSummary || failedNames}. ${supportGapDetail ? `${supportGapDetail} ` : ""}${retentionLabel}${resourceSyncWarningLabel}${ingestCostLabel}`,
          );
        } else if (ingestedItems.length > 0) {
          setSearchFeedback(
            `Used ${ingestedItems.length} attachment${ingestedItems.length === 1 ? "" : "s"} (${inlineExtractedCount} instant text read${inlineExtractedCount === 1 ? "" : "s"}, ${serverParsedCount} server parse${serverParsedCount === 1 ? "" : "s"}).${knowledgeTagLabel} ${organizationLabel}${resourceShelfLabel}${skippedUnsupportedLabel} ${retentionLabel}${resourceSyncWarningLabel}${ingestCostLabel}`,
          );
        }
        cleanupMessageIds = ingestResult.cleanup_message_ids ?? [];
      }
      if (session()?.token && isStructuredObjectSearchQuery(query)) {
        const nextLaunchContext =
          overrides && "launchContext" in overrides
            ? (overrides.launchContext ?? null)
            : query === priorQuery && currentLaunchContext
              ? currentLaunchContext
              : {
                  sourceLabel: "Structured search",
                  reason: "Direct object query",
                };
        const [payload, localPreview] = await Promise.all([
          fetchObjectMessages(buildObjectMessagesSearchRequest({
            query,
            focusThreadId:
              overrides?.focusThreadId
              ?? objectSearchFocusThreadId()
              ?? openThreadId()
              ?? undefined,
            focusObjectId:
              overrides?.focusObjectId
              ?? objectSearchFocusObjectId()
              ?? undefined,
            limit: 30,
          })),
          runLocalSemanticRouterPreview(query),
        ]);
        setCommandResult(null);
        setObjectSearchResult(payload);
        objectSearchRouterPreview.set(localPreview);
        workspaceSearchRouterPreview.clear();
        setObjectSearchFocusObjectId(
          objectMessagesFocusObjectId(
            payload,
            overrides?.focusObjectId ?? objectSearchFocusObjectId(),
          ),
        );
        setObjectSearchFocusThreadId(
          objectMessagesFocusThreadId(payload)
          ?? overrides?.focusThreadId
          ?? objectSearchFocusThreadId()
          ?? openThreadId(),
        );
        setObjectSearchLaunchContext(nextLaunchContext);
        setSearchFeedback(
          payload.count === 0
            ? "No indexed objects matched the current structured query."
            : `Indexed retrieval matched ${payload.count} object${payload.count === 1 ? "" : "s"}.`
        );
        selectView("search");
        return;
      }
      // Try browser AI classification as a hint for the server (used when no server LLM configured)
      let browserIntent: string | undefined;
      let browserParsed: Record<string, unknown> | undefined;
      if (browserAiLabel()) {
        const result = await classifyWithBrowserAi(query);
        if (result) {
          browserIntent = result.intent;
          browserParsed = result.parsed;
        }
      }
      const responseStylePayload = session()?.token
        ? await loadAgentResponseStylePayload().catch(() => ({}))
        : {};
        const [payload, localPreview] = await Promise.all([
          executeUiCommand({
            query,
            engine: resolvedEngine,
            active_file_id: activeFile()?.file_id,
            browser_intent: browserIntent,
            browser_parsed: browserParsed,
            optimization_mode: resolvedOptimizationMode,
            ...responseStylePayload,
          }),
          runLocalSemanticRouterPreview(query),
      ]);
      const enrichedPayload = enrichUiCommandResponseWithAttachmentGrounding(
        payload,
        attachmentGroundingEvidence,
      );
      const displayReadyPayload = await decryptCommandPreviewForDisplay(enrichedPayload);
      setObjectSearchResult(null);
      objectSearchRouterPreview.clear();
      setObjectSearchFocusObjectId(null);
      setObjectSearchFocusThreadId(null);
      setObjectSearchLaunchContext(null);
      workspaceSearchRouterPreview.set(localPreview);
      setCommandResult(displayReadyPayload);
      // Reload dashboard to pick up any new AFP messages the agent created
      void loadDashboard();
      const suggested = commandPreviewSelectableSuggestedView({
        suggestedView: displayReadyPayload.suggested_view ?? null,
        viewNames: VIEW_NAMES,
        blockedViewNames: [...NAV_BLOCKLIST],
      });
      const suggestedWorkflowSeed = commandPreviewSuggestedWorkflowPendingIntentSeed({
        intent: displayReadyPayload.intent,
        preferredView: displayReadyPayload.preferred_view ?? null,
        query,
        summary: displayReadyPayload.summary ?? null,
        suggestedView: suggested ?? null,
        travelPrefersComparison: travelPreviewPrefersComparison(
          query,
          displayReadyPayload.preferred_view,
          displayReadyPayload.bullets ?? [],
        ),
      });
      if (suggestedWorkflowSeed) {
        setWorkflowPendingIntent(suggestedWorkflowSeed);
      }
      // A model suggestion is a navigation option, not a reason to discard the
      // just-completed answer. Leaving Search clears commandResult, which made
      // successful Master Agent responses look blank before they could render.
      selectView("search");
    } catch (error) {
      objectSearchRouterPreview.clear();
      workspaceSearchRouterPreview.clear();
      setSearchAttachmentGrounding(null);
      const errorMessage = error instanceof Error ? error.message : "Command search failed.";
      const receipt = buildCommandSearchFailureReceipt(errorMessage);
      setSearchFeedback(receipt.summary);
      setIsSearchError(true);
      setSearchFailureReceipt(receipt);
    } finally {
      if (cleanupMessageIds.length > 0) {
        try {
          await cleanupIngestedAttachments({ message_ids: cleanupMessageIds });
          setPendingSearchCleanupMessageIds([]);
          setSearchAttachmentGrounding((current) =>
            withAttachmentGroundingCleanupStatus(current, "complete"),
          );
        } catch {
          setPendingSearchCleanupMessageIds(cleanupMessageIds);
          setSearchAttachmentGrounding((current) =>
            withAttachmentGroundingCleanupStatus(current, "pending"),
          );
          setSearchFeedback((current) => {
            const warning = "Cleanup warning: temporary note copies could not be deleted automatically.";
            if (!current) return warning;
            return current.includes(warning) ? current : `${current} ${warning}`;
          });
        }
      }
      setSearchBusy(false);
    }
  }

  async function retrySearchAttachmentCleanup() {
    const messageIds = pendingSearchCleanupMessageIds();
    if (messageIds.length === 0) return;
    setRetryingSearchCleanup(true);
    try {
      await cleanupIngestedAttachments({ message_ids: messageIds });
      setPendingSearchCleanupMessageIds([]);
      setSearchAttachmentGrounding((current) =>
        withAttachmentGroundingCleanupStatus(current, "complete"),
      );
      setSearchFeedback((current) => {
        const warning = "Cleanup warning: temporary note copies could not be deleted automatically.";
        const success = "Temporary note copies were deleted successfully.";
        const base = (current ?? "").replace(warning, "").trim();
        return base ? `${base} ${success}` : success;
      });
    } catch {
      setSearchAttachmentGrounding((current) =>
        withAttachmentGroundingCleanupStatus(current, "pending"),
      );
      setSearchFeedback((current) => {
        const warning = "Cleanup warning: temporary note copies could not be deleted automatically.";
        if (!current) return warning;
        return current.includes(warning) ? current : `${current} ${warning}`;
      });
    } finally {
      setRetryingSearchCleanup(false);
    }
  }

  async function persistSearchAttachmentOutputs() {
    const messageIds = pendingSearchCleanupMessageIds();
    if (messageIds.length === 0) return;
    setPersistingSearchAttachments(true);
    try {
      await persistIngestedAttachments({ message_ids: messageIds });
      const grounding = searchAttachmentGrounding();
      const resourceSyncOk = grounding
        ? await classifySearchKnowledgeResources(
            messageIds.map((messageId, index) => ({
              source_message_id: messageId,
              output_message_id: messageId,
              file_name: grounding.sourceLabels[index] ?? messageId,
            })),
            grounding.knowledgeMode,
          )
        : true;
      setPendingSearchCleanupMessageIds([]);
      setSearchAttachmentGrounding((current) =>
        withAttachmentGroundingRetentionMode(current, "keep_extracted_only", "not_needed"),
      );
      setSearchFeedback((current) => {
        const warning = "Cleanup warning: temporary note copies could not be deleted automatically.";
        const success = resourceSyncOk
          ? "Extracted notes were kept, saved into Resources, and the temporary cleanup requirement was cleared."
          : "Extracted notes were kept and the temporary cleanup requirement was cleared, but Resource indexing needs retry.";
        const base = (current ?? "").replace(warning, "").trim();
        return base ? `${base} ${success}` : success;
      });
    } catch {
      setSearchAttachmentGrounding((current) =>
        withAttachmentGroundingCleanupStatus(current, "pending"),
      );
      setSearchFeedback((current) => current ?? "Could not keep extracted notes right now.");
    } finally {
      setPersistingSearchAttachments(false);
    }
  }

  function applyCommandDraft() {
    const draft = commandResult()?.runner_draft;
    if (!draft) return;
    if (activeFile()?.file_id !== draft.target_file_id) {
      void selectFile(draft.target_file_id).then(() => {
        setEditorValue((current) => `${current}${draft.content}`);
      });
    } else {
      setEditorValue((current) => `${current}${draft.content}`);
    }
    setRunnerFeedback("Command-bar draft inserted into the editor. Review and save when ready.");
    setCommandResult(null);
    selectView("runner");
  }

  const runtimeDeployment = createMemo(() => dashboardBootstrapRuntimeDeployment(workspaceBootstrap()));

  // Clear search state only when transitioning *away from* "search" — not on initial mount
  let prevView: ViewName | null = null;
  createEffect(() => {
    const view = activeView();
    if (prevView === "search" && view !== "search") {
      setCommandResult(null);
      setObjectSearchResult(null);
      setObjectSearchFocusObjectId(null);
      setObjectSearchFocusThreadId(null);
      setSearchAttachmentGrounding(null);
      setPendingSearchCleanupMessageIds([]);
      setSearchFeedback("");
      setIsSearchError(false);
      setSearchFailureReceipt(null);
    }
    prevView = view;
  });

  createEffect(() => {
    const token = session()?.token;
    const view = activeView();
    if (!token) {
      return;
    }
    if (workspaceAssistRefreshCoordinator.requestSurfaceEntry({
      view,
      openThreadId: view === "threads" ? openThreadId() : null,
    })) {
      const surfaceKey = view === "threads" && openThreadId() ? `thread:${openThreadId()}` : view;
      markWorkspaceAssistRefreshOrigin(surfaceKey, "surface_entry");
      void loadDashboard();
    }
  });

  createEffect(() => {
    if (!session()?.token || activeView() !== "runner") {
      workspaceAssistRefreshCoordinator.resetDraftChannel("runner");
      return;
    }
    const file = activeFile();
    if (workspaceAssistRefreshCoordinator.requestDraftChange({
      channelId: "runner",
      surfaceKey: "runner",
      documentTitle: file?.label ?? null,
      filePath: file?.relative_path ?? null,
      text: editorValue(),
    })) {
      markWorkspaceAssistRefreshOrigin("runner", "draft_change");
      void loadDashboard();
    }
  });

  function requestWorkspaceAssistDraftRefresh(input: WorkspaceAssistDraftRefreshInput) {
    if (!session()?.token) return;
    if (workspaceAssistRefreshCoordinator.requestDraftChange(input)) {
      markWorkspaceAssistRefreshOrigin(input.surfaceKey, "draft_change");
      void loadDashboard();
    }
  }

  const commandPreviewMessage = createMemo(() => {
    const result = commandResult();
    if (!result) return null;
    if (result.intent === "chat" || result.intent === "model_unavailable") return null;
    try {
      const generatedPreview = commandResponseToPreviewMessage(
        result,
        lastQuery(),
        workspaceSearchRouterPreview.result(),
        workspaceSearchRouterPreview.capabilities(),
      );
      const preview = readableCommandPreview(result.preview_message, generatedPreview);
      const attachmentGrounding = searchAttachmentGrounding();
      const groundedPreview = attachmentGrounding
        ? decoratePreviewMessageWithAttachmentGrounding(preview, attachmentGrounding)
        : preview;
      const studyStructuredPreview = decorateSearchPreviewMessageWithStudyStructure(groundedPreview);
      const routedPreview = decorateSearchPreviewMessageWithLocalRouter(
        studyStructuredPreview,
        workspaceSearchRouterPreview.result(),
        workspaceSearchRouterPreview.capabilities(),
      );
      return decoratePreviewMessageWithStudyLaunchMetadata(routedPreview, lastStudyLaunchMetadata());
    } catch (error) {
      console.error("[command-preview] failed to render preview", error);
      return buildCommandPreviewRenderFailureMessage(result, lastQuery(), error);
    }
  });
  const commandFallbackNotice = createMemo(() => readUiCommandFallbackNotice(commandResult()));
  const commandRequiresAiSetup = createMemo(() => isAiModelSetupRequired(commandResult()));
  const commandPreviewUnlockNoticeState = createMemo(() =>
    commandPreviewUnlockNotice(commandResult()?.preview_message),
  );
  const commandWorkflowHandoffVisible = createMemo(() => {
    const result = commandResult();
    if (!result) return false;
    return commandPreviewShowsWorkflowHandoff({
      intent: result.intent,
      preferredView: result.preferred_view ?? null,
      travelPrefersComparison: travelPreviewPrefersComparison(
        lastQuery(),
        result.preferred_view,
        result.bullets ?? [],
      ),
    });
  });
  const commandWorkflowHandoffHandler = () =>
    commandWorkflowHandoffVisible() ? openWorkflowsFromCommand : undefined;
  function openWorkflowsFromCommand() {
    const result = commandResult();
    const seed = commandPreviewWorkflowPendingIntentSeed({
      intent: result?.intent ?? "command",
      preferredView: result?.preferred_view ?? null,
      query: lastQuery(),
      summary: result?.summary ?? null,
    });
    if (seed) {
      setWorkflowPendingIntent(seed);
    }
    selectView("workflows");
  }
  const workspaceLlmSetupComplete = createMemo(() => isWorkspaceLlmSetupComplete(llmConfig()));
  const workspaceLlmPendingSetupReason = createMemo(() => workspaceLlmSetupPendingReason(llmConfig()));

  createEffect(() => {
    const cfg = llmConfig();
    if (cfg?.backend === "ollama" || cfg?.ollama_url) {
      registerLocalRouterOllamaEmbedder({
        ollamaUrl: cfg.ollama_url,
        model: "nomic-embed-text",
      });
      return;
    }
    registerLocalRouterOllamaEmbedder(null);
  });

  onMount(async () => {
    installMobileFocusViewportListener();
    // U-01: listen for service worker update-ready events fired by main.tsx
    const unsubscribeSwUpdateReady = subscribeSwUpdateReadyEvent((detail) => {
      // CGAP-014: suppress toast when the search pipeline or any agent in the fleet
      // is actively running — a reload mid-run would lose orchestration context.
      if (searchBusy() || fleetActiveCount() > 0) return;
      pendingUpdateSw = detail.sw;
      setUpdateReady(true);
    });
    onCleanup(() => unsubscribeSwUpdateReady());

    // Initialize E2EE: fetch encryption key and set up client-side decryption
    if (session()?.token) {
      try {
        const keys = await fetchEncKey();
        const { initDecrypt, hexToBytes } = await loadDecryptModule();
        await initDecrypt(keys.enc_key_hex);
        // Derive the local profile-ledger encryption key from the same stable,
        // per-account key used for E2EE message decryption — otherwise the
        // ledger falls back to a sessionStorage-only key (profileLedger.ts's
        // getSessionFallbackKey) that's discarded every time the browser
        // session ends, silently wiping locally-stored profile state (primary
        // use case, traits, consent) on every new session even for the same,
        // already-signed-in account.
        await initLedgerKey(hexToBytes(keys.enc_key_hex));
        invalidateLocalSemanticRouterState();
      } catch { /* no key configured — messages shown in ciphertext-aware mode */ }

      // Check if onboarding wizard is needed (authenticated only, after tour)
      if (!loadOnboardingDone() && loadWeddingEntrySource() !== "wedding_site" && !shouldLaunchWeddingTemplateFromDeepLink()) {
        setShowOnboarding(true);
      }
    }

    // Load LLM config for agent status line
    if (session()?.token) {
      fetchLlmConfig().then(setLlmConfig).catch(() => {});
    }

    // Auto-expand sidebar on first authenticated session — scoped per user so each user sees it once
    if (session()?.token && !loadSidebarSeen(initUserId)) {
      setRightOpen(true);
      saveSidebarSeen(initUserId, true);
    }

    // Ask for local profiling consent only once the user is authenticated.
    // Showing this in guest mode blocks the rail and makes working controls
    // feel broken before the user can even sign in.
    if (session()?.token && !hasConsentBeenAsked() && loadWeddingEntrySource() !== "wedding_site" && !shouldLaunchWeddingTemplateFromDeepLink()) {
      setShowProfilingConsent(true);
    }
    if (session()?.token) {
      void refreshPrimaryUseCaseProfile(false);
    }

    const currentUrl = new URL(window.location.href);
    if (currentUrl.pathname === "/reset-password") {
      openAuthModalIfSignedOut(true);
      if (!resetToken()) {
        setAuthNotice({
          tone: "error",
          text: "Password reset link is incomplete. Request a fresh reset link and try again.",
        });
      }
      window.history.replaceState({}, "", "/?open_auth=1");
    }
    if (currentUrl.pathname === "/verify-email") {
      const token = currentUrl.searchParams.get("token");
      openAuthModalIfSignedOut(true);
      void (async () => {
        if (!token) {
          setAuthNotice({
            tone: "error",
            text: "Verification link is incomplete. Request a fresh verification email and try again.",
          });
          window.history.replaceState({}, "", "/?open_auth=1");
          return;
        }
        try {
          await verifyEmailToken(token);
          setAuthNotice({
            tone: "success",
            text: "Email verified. You can sign in now.",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Verification failed.";
          setAuthNotice({
            tone: "error",
            text: message || "Verification failed.",
          });
        } finally {
          window.history.replaceState({}, "", "/?open_auth=1");
        }
      })();
    }

    // Detect browser-native AI (Gemini Nano on Chrome, Phi on Edge)
    const label = getBrowserAiLabel();
    if (label) {
      checkBrowserAiAvailable().then((ok) => { if (ok) setBrowserAiLabel(label); });
    }

    // Keyboard shortcuts: Ctrl/Cmd+1–7 for nav items
    const SHORTCUT_VIEWS: ViewName[] = ["search", "threads", "workflows", "email", "note", "calendar", "database", "templates"];
    function onGlobalKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTypingTarget =
        tag === "INPUT"
        || tag === "TEXTAREA"
        || tag === "SELECT"
        || target?.isContentEditable === true;
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !isTypingTarget) {
        if (e.key === "[" && navigateThreadSessionHistory("back")) {
          e.preventDefault();
          recordShortcutUse("thread_history_nav");
          return;
        }
        if (e.key === "]" && navigateThreadSessionHistory("forward")) {
          e.preventDefault();
          recordShortcutUse("thread_history_nav");
          return;
        }
      }
      if (!isTypingTarget) {
        const quickControlAction = quickControlActionByShortcut(e);
        if (quickControlAction) {
          e.preventDefault();
          openQuickControl(quickControlAction.id);
          return;
        }
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "k") {
        e.preventDefault();
        recordShortcutUse("search_focus");
        selectView("search");
        setSearchFocusTick((n) => n + 1);
        return;
      }
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < SHORTCUT_VIEWS.length) {
        e.preventDefault();
        recordShortcutUse(`view:${SHORTCUT_VIEWS[idx]}`);
        selectView(SHORTCUT_VIEWS[idx]);
      }
    }
    document.addEventListener("keydown", onGlobalKeyDown);
    const unsubscribeDecisionOsNavigate = subscribeDecisionOsNavigateEvent((detail) => {
      const view = detail.view;
      switch (view) {
        case "agent_settings":
          if (detail.settingsTab) {
            setAgentSettingsFocusTab(detail.settingsTab);
          }
          break;
        case "threads":
          if (detail.messageId) {
            const threadId = workspaceBootstrap()?.messages.find((message) => message.id === detail.messageId)?.thread_id;
            if (threadId) {
              openThread(threadId, detail.messageId);
              return;
            }
          }
          if (detail.threadId) {
            openThread(detail.threadId, detail.messageId ?? null);
            return;
          }
          break;
        case "calendar":
          setCalendarNavigationEventId(detail.eventId ?? null);
          setCalendarNavigationDate(detail.date ?? null);
          break;
        case "search": {
          const pendingSeed = consumeStudySearchContinuationSeed();
          if (pendingSeed) {
            setSearchComposerSeed({ ...pendingSeed, id: Date.now() });
            setSearchFocusTick((n) => n + 1);
          }
          break;
        }
      }
      selectView(view);
    });

    const unsubscribeOpenObjectSearch = subscribeOpenObjectSearchEvent((detail) => {
      const query = detail.query.trim();
      if (!query) return;
      selectView("search");
      setObjectSearchFocusObjectId(detail.focusObjectId ?? null);
      setObjectSearchFocusThreadId(detail.focusThreadId ?? null);
      setObjectSearchLaunchContext(detail.launchContext ?? null);
      void handleSearch(query, lastEngine(), lastOptMode(), {
        focusObjectId: detail.focusObjectId ?? null,
        focusThreadId: detail.focusThreadId ?? null,
        launchContext: detail.launchContext ?? null,
      });
    });

    const unsubscribeOpenThreadSearch = subscribeOpenThreadSearchEvent((detail) => {
      const query = detail.query.trim();
      if (!query) return;
      setOpenThreadId(null);
      setOpenThreadMessageId(null);
      setThreadSearchLaunchQuery(null);
      setThreadSearchLaunchContext(detail.launchContext ?? null);
      queueMicrotask(() => setThreadSearchLaunchQuery(query));
      selectView("threads");
    });

    const unsubscribeOpenThread = subscribeOpenThreadEvent((detail) => {
      openThread(detail.threadId, detail.messageId ?? null);
    });

    const unsubscribeWeddingNavigation = subscribeWeddingNavigationAppBridge({
      selectView,
      onSaved: (intent) => {
        const calendarTarget = weddingNavigationCalendarTarget(intent);
        if (calendarTarget) {
          setCalendarNavigationDate(calendarTarget.initialDate);
          setCalendarNavigationEventId(calendarTarget.initialEventId);
        } else if (intent.view === "calendar") {
          setCalendarNavigationDate(null);
          setCalendarNavigationEventId(null);
        }
        if (intent.view === "search" || intent.view === "threads") {
          setWeddingNavigationIntent({ ...intent, savedAt: new Date().toISOString() });
        }
        if (intent.view !== "response_queue") setWeddingReturnContextActive(true);
      },
    });

    const unsubscribeSessionChanged = subscribeSessionChangedEvent((detail) => {
      const nextSession = detail.session;
      setSession(nextSession);
      if (!nextSession) {
        applyPrimaryUseCaseTheme(null);
        setPrimaryUseCaseProfile(null);
        setPrimaryUseCaseNeedsPrompt(false);
        setPrimaryUseCasePromptVisible(false);
        void import("@/lib/sync").then(({ resetSyncInitState }) => resetSyncInitState());
        const notice = buildSessionEndedNotice(detail.reason);
        setShowAuthModal(notice.showAuthModal);
        setAuthNotice({
          tone: notice.tone,
          text: notice.text,
        });
      } else {
        void refreshPrimaryUseCaseProfile(false);
      }
    });

    const onPrimaryUseCaseProfileUpdated = () => {
      void refreshPrimaryUseCaseProfile(false);
    };
    window.addEventListener(PRIMARY_USE_CASE_PROFILE_UPDATED_EVENT, onPrimaryUseCaseProfileUpdated);

    const unsubscribeDashboardRefresh = subscribeDashboardRefreshEvent(() => {
      void loadDashboard();
    });

    onCleanup(() => {
      document.removeEventListener("keydown", onGlobalKeyDown);
      unsubscribeDecisionOsNavigate();
      unsubscribeOpenObjectSearch();
      unsubscribeOpenThreadSearch();
      unsubscribeOpenThread();
      unsubscribeWeddingNavigation();
      unsubscribeSessionChanged();
      window.removeEventListener(PRIMARY_USE_CASE_PROFILE_UPDATED_EVENT, onPrimaryUseCaseProfileUpdated);
      unsubscribeDashboardRefresh();
    });

    void bootstrap();
    if (session()?.token) {
      startLoraPolling();
      onCleanup(() => { if (loraIntervalId) { clearInterval(loraIntervalId); loraIntervalId = null; } });
    }
  });

  onMount(() => {
    void fetchAttachmentIngestCapabilities()
      .then((capabilities) => setAttachmentIngestCapabilities(capabilities))
      .catch(() => undefined);
  });

  onMount(() => {
    const nav = navigator as Navigator & {
      connection?: {
        saveData?: boolean;
        effectiveType?: string | null;
      };
    };
    if (!shouldIdlePreloadViews(nav.connection ?? null)) return;
    const cancel = scheduleIdlePreload(() => {
      for (const view of idlePreloadViewsForSession(activeView())) {
        preloadViewModule(view);
      }
    });
    onCleanup(cancel);
  });


  return (
    <main id="main-content" tabindex="-1" class="min-h-screen p-4 md:p-6 text-on-surface">
      <a href="#workspace-shell" class="skip-link">Skip to workspace content</a><h1 class="sr-only">OmnyID workspace</h1>
      <Show when={showAuthModal()}>
        <AuthModal
          onClose={() => { setShowAuthModal(false); setAuthNotice(null); setResetToken(undefined); }}
          notice={authNotice()}
          onClearNotice={() => setAuthNotice(null)}
          resetToken={resetToken()}
          onResetTokenConsumed={() => setResetToken(undefined)}
          onLogin={() => {
            setShowAuthModal(false);
            setAuthNotice(null);
            setServerOffline(false);
            if (pendingAuthSource === "vendor_claim") return void window.location.assign(vendorPortalUrlFromDeepLink());
            const loginUserId = readSession()?.user?.id ?? "";
            if (loginUserId && loadShouldShowGuidedTour(loginUserId)) setShowTour(true);
            void loadDashboard();
            void loadRunnerFiles();
            void loadRuntimeLogs();
            startLoraPolling();
            void import("@/lib/weddingLeadMagnetImportRunnerState").then(({ requestWeddingLeadMagnetImport }) => requestWeddingLeadMagnetImport());
            // Preserve the wedding deep link after authentication.
            if (shouldLaunchWeddingTemplateFromDeepLink()) launchWeddingTemplateFromDeepLink();
          }}
        />
      </Show>
      <Show when={showEditProfile()}>
        <Suspense>
          <LazyEditProfileModal onClose={() => setShowEditProfile(false)} />
        </Suspense>
      </Show>

      {/* U-01: Update-ready toast — hidden while fleet is active (CGAP-014) */}
      <Show when={primaryUseCasePromptVisible() && !showTour() && !showOnboarding()}>
        <PrimaryUseCasePrompt
          current={primaryUseCaseProfile()}
          needsPrompt={primaryUseCaseNeedsPrompt()}
          saving={primaryUseCaseSaving()}
          error={primaryUseCaseError()}
          onSelect={(kind) => void handlePrimaryUseCaseSelect(kind)}
          onComplete={() => void handlePrimaryUseCaseComplete()}
          onDismiss={dismissPrimaryUseCasePrompt}
        />
      </Show>

      <Show when={updateReady() && !searchBusy() && fleetActiveCount() === 0}>
        <div class="fixed bottom-5 right-5 z-[9999] flex items-center gap-3 rounded-2xl border border-primary/20 bg-white/90 shadow-lg backdrop-blur-md px-4 py-3 text-sm animate-fade-in">
          <span class="text-on-surface font-medium">Update available</span>
          <button
            type="button"
            onClick={applyUpdate}
            class="rounded-lg bg-primary px-3 py-1 text-[12px] font-semibold text-white transition hover:bg-primary/80"
          >
            Update Now
          </button>
          <button
            type="button"
            onClick={() => setUpdateReady(false)}
            class="text-on-surface-variant/50 hover:text-on-surface-variant transition text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </Show>

      {/* Guided tour — first-time visitors */}
      <Show when={showTour()}>
        <Suspense>
          <LazyGuidedTour userId={userId()} onComplete={() => {
            setShowTour(false);
            // If authenticated and not onboarded, let onboarding wizard show next
          }} />
        </Suspense>
      </Show>

      {/* Onboarding wizard — authenticated users, after tour */}
      <Show when={!showTour() && showOnboarding() && Boolean(session()?.token)}>
        <Suspense>
          <LazyOnboardingWizard
            onComplete={() => setShowOnboarding(false)}
            onNavigate={(view, options) => {
              setShowOnboarding(false);
              if (options?.quickStart) {
                setSearchComposerSeed({
                  ...options.quickStart,
                  id: Date.now(),
                });
                setSearchFocusTick((n) => n + 1);
              }
              if (view === "agent_settings" && options?.focusLlm) {
                setAgentSettingsFocusLlm(true);
              }
              selectView(view);
            }}
          />
        </Suspense>
      </Show>

      {/* Profiling consent — shown once, after tour and onboarding */}
      <Show when={!showTour() && !showOnboarding() && showProfilingConsent()}>
        <Suspense>
          <LazyProfilingConsentModal onDismiss={() => setShowProfilingConsent(false)} />
        </Suspense>
      </Show>

      {/* Homeserver offline banner */}
      <Show when={serverOffline()}>
        <div class="mx-auto mb-4 max-w-[1700px] flex items-center justify-between gap-4 rounded-2xl border border-red-200/50 bg-red-50/60 px-5 py-3 text-sm text-on-surface-variant backdrop-blur-sm animate-fade-in">
          <span><strong class="text-on-surface">OmnyID is temporarily unavailable.</strong> Check your connection, then try again.</span>
          <button
            type="button"
            disabled={retrying()}
            onClick={async () => { setRetrying(true); try { await bootstrap(); } finally { setRetrying(false); } }}
            class="glass-button btn-shimmer rounded-xl px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {retrying() ? "Checking…" : "Retry →"}
          </button>
        </div>
      </Show>

      {/* Guest mode banner */}
      <Show when={!session()?.token}>
        <div class="mx-auto mb-4 max-w-[1700px] flex items-center justify-between gap-4 rounded-2xl border border-amber-200/50 bg-amber-50/60 px-5 py-3 text-sm text-on-surface-variant backdrop-blur-sm animate-fade-in">
          <span>
            You're in <strong class="text-on-surface">guest mode</strong>
            <Show when={guestUsesSampleWorkspace()}>
              {" "}— this workspace is showing <strong class="text-on-surface">sample data</strong> so you can explore the UI before sign-in.
            </Show>
            <Show when={!guestUsesSampleWorkspace()}>
              {" "}— most actions require a signed-in account.
            </Show>
          </span>
          <button
            type="button"
            onClick={() => openAuthModalIfSignedOut()}
            class="glass-button btn-shimmer rounded-xl px-4 py-2 text-sm font-medium text-white shadow-sm"
          >
            Sign in →
          </button>
        </div>
      </Show>

      {/* NavBar is outside GlassPanel so its fixed children are positioned relative to the viewport,
          not the backdrop-filter stacking context of GlassPanel */}
      <NavBar
        activeView={activeView()}
        onSelect={selectView}
        onViewIntent={preloadViewModule}
        paraViewEnabled={paraViewEnabled()}
        signedIn={Boolean(session()?.token)}
        advanced={advanced()}
        onToggleAdvanced={() => {
          const next = !advanced();
          setAdvanced(saveAdvancedNavEnabled(userId(), next));
        }}
        studyLensEnabled={studyLensEnabled()}
        onToggleStudyLens={toggleStudyLens}
        activeCount={fleetActiveCount()}
        idleCount={fleetIdleCount()}
        activeAgentNames={fleetActiveNames()}
        onFleetClick={() => setFleetOpen((v) => !v)}
        workflowBadge={fleetActiveCount() > 0 ? fleetActiveCount() : undefined}
        workflowNewResult={workflowNewResult()}
        fleetLoaded={fleetLoaded()}
        threadBadge={threadBadge() > 0 ? threadBadge() : undefined}
        ctrlKPulse={searchFocusTick()}
        onSignIn={() => openAuthModalIfSignedOut()}
        onEditProfile={() => setShowEditProfile(true)}
        onQuickControl={openQuickControl}
        userId={userId()}
      />

      <Show when={isMobileFocusViewport()}>
        <MobileHomeMenuSheet
          activeView={activeView()}
          advanced={advanced()}
          paraViewEnabled={paraViewEnabled()}
          studyLensEnabled={studyLensEnabled()}
          hideTrigger={activeView() === "response_queue" && (loadWeddingEntrySource() === "wedding_site" || (primaryUseCaseProfile()?.kind === "wedding_planning" && primaryUseCaseProfile()?.status === "active"))}
          userId={userId()}
          onSelectApp={selectKnownView}
        />
      </Show>

      <GlassPanel id="workspace-shell" tabindex="-1" class="mx-auto max-w-[1700px] p-0 sm:p-5 sm:pl-[76px] lg:p-8 lg:pl-[80px]">

        {/* Fleet pane — slides in below nav when user clicks active/idle badge */}
        <Show when={fleetOpen()}>
          <div class="mt-4 glass-surface animate-slide-down rounded-[20px] border border-white/50 p-5 shadow-panel overflow-auto max-h-[70vh]">
            <Show
              when={Boolean(session()?.token)}
              fallback={<GuestGate label="Agent Fleet" onSignIn={() => openAuthModalIfSignedOut()} />}
            >
              <Suspense>
                <LazyAgentFleetView onClose={() => setFleetOpen(false)} onNavigate={(v) => { setFleetOpen(false); selectKnownView(v); }} />
              </Suspense>
            </Show>
          </div>
        </Show>

        {/* Chat bar — always visible */}
        <div class={`mt-7 ${mobileFocusAskOpen() ? "phone:fixed phone:inset-0 phone:z-50 phone:overflow-auto phone:bg-wedding-surface phone:p-4" : "phone:hidden"}`}>
          <Show when={mobileFocusAskOpen()}>
            <button type="button" class="mb-3 min-h-12 rounded-xl border border-wedding-muted bg-white px-4 text-sm font-semibold text-wedding-text" onClick={() => setMobileFocusAskOpen(false)}>Close</button>
          </Show>
          <Show when={weddingReturnContextActive() && activeView() !== "response_queue"}>
            <button
              type="button"
              onClick={returnToWeddingPlannerHome}
              class="mb-2 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white/85 px-3 py-1.5 text-xs font-semibold text-rose-950 shadow-sm transition hover:border-rose-300 hover:bg-rose-50"
            >
              <span aria-hidden="true">&lt;</span>
              Wedding Planner Home
            </button>
          </Show>
          <WorkspaceBreadcrumbTrail
            trail={navTrail()}
            labels={VIEW_LABELS}
            weddingActive={activeView() === "response_queue" && (
              loadWeddingEntrySource() === "wedding_site"
              || (primaryUseCaseProfile()?.kind === "wedding_planning" && primaryUseCaseProfile()?.status === "active")
            )}
            onSelectView={selectView}
          />
          <div data-search-host>
            <SearchBar
              onSubmit={handleSearch}
              busy={searchBusy()}
              focusTrigger={searchFocusTick()}
              resultCount={visibleSearchResultCount()}
              resultCountVisible={activeView() === "search" && objectSearchResult() !== null}
              userId={userId()}
              attachmentCapabilities={attachmentIngestCapabilities()}
              composerSeed={searchComposerSeed()}
              studyLensEnabled={studyLensEnabled()}
            />
          </div>
          <Show when={searchFailureReceipt()}>
            <div
              class={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                searchFailureReceipt()?.tone === "danger"
                  ? "border-rose-200 bg-rose-50/90 text-rose-900"
                  : "border-amber-200 bg-amber-50/90 text-amber-900"
              }`}
              role="alert"
            >
              <p class="font-semibold">{searchFailureReceipt()?.title}</p>
              <p class="mt-1">{searchFailureReceipt()?.summary}</p>
              <p class="mt-2 text-xs font-medium">Next step: {searchFailureReceipt()?.nextStep}</p>
            </div>
          </Show>
          <div class="mt-2.5 flex flex-wrap items-center justify-center gap-3">
            <Show when={searchFeedback() && !searchFailureReceipt()}>
              <p
                class={`text-center text-sm leading-7 ${isSearchError() ? "text-error" : "text-on-surface-variant"}`}
                role={isSearchError() ? "alert" : undefined}
              >
                {searchFeedback()}
              </p>
            </Show>
            <Show when={Boolean(searchAttachmentGrounding()) && !searchFailureReceipt()}>
              <span class="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {searchAttachmentGrounding()?.footerLabel}
              </span>
            </Show>
            <Show when={Boolean(searchAttachmentGrounding()) && !searchFailureReceipt()}>
              <span class="inline-flex items-center rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-1 text-xs font-medium text-sky-800">
                {searchAttachmentGrounding()?.policyLabel}
              </span>
            </Show>
            <Show when={Boolean(searchAttachmentGrounding()?.policyOutcome) && !searchFailureReceipt()}>
              <span class="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-medium text-emerald-900">
                {searchAttachmentGrounding()?.policyOutcome}
              </span>
            </Show>
            <Show
              when={
                Boolean(searchAttachmentGrounding())
                && searchAttachmentGrounding()?.retentionMode !== "keep_nothing"
                && !searchFailureReceipt()
              }
            >
              <button
                type="button"
                onClick={() => {
                  saveFileLibraryNavigationIntent(
                    buildFileLibraryIntentFromAttachmentGrounding(searchAttachmentGrounding()),
                  );
                  selectView("files");
                }}
                class="inline-flex items-center rounded-full border border-violet-200/80 bg-violet-50/90 px-3 py-1 text-xs font-medium text-violet-900 transition hover:bg-violet-100"
              >
                {searchAttachmentActions().fileActionLabel ?? "Browse retained sources"}
              </button>
            </Show>
            <Show when={Boolean(searchAttachmentGrounding()) && !searchFailureReceipt()}>
              <button
                type="button"
                onClick={() => {
                  const intent = buildKnowledgeGraphIntentFromAttachmentGrounding(searchAttachmentGrounding());
                  if (intent) {
                    saveKnowledgeGraphNavigationIntent(intent);
                  }
                  selectView("knowledge_graph");
                }}
                class="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-medium text-emerald-900 transition hover:bg-emerald-100"
              >
                {searchAttachmentActions().graphActionLabel ?? "Open knowledge graph"}
              </button>
            </Show>
            <Show
              when={
                searchAttachmentGrounding()?.cleanupStatus !== "not_needed"
                && !searchFailureReceipt()
              }
            >
              <span
                class={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
                  searchAttachmentGrounding()?.cleanupStatus === "complete"
                    ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-800"
                    : "border-rose-200/80 bg-rose-50/90 text-rose-800"
                }`}
              >
                {searchAttachmentGrounding()?.cleanupLabel}
              </span>
            </Show>
            <Show
              when={
                searchAttachmentGrounding()?.coverageStatus === "partial"
                && !searchFailureReceipt()
              }
            >
              <span class="inline-flex items-center rounded-full border border-amber-300/60 bg-amber-50/80 px-3 py-1 text-xs font-medium text-amber-800">
                {searchAttachmentGrounding()?.coverageLabel}
              </span>
            </Show>
            <Show when={pendingSearchCleanupMessageIds().length > 0 && !searchFailureReceipt()}>
              <button
                type="button"
                disabled={persistingSearchAttachments() || retryingSearchCleanup() || searchBusy()}
                onClick={() => void persistSearchAttachmentOutputs()}
                class="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {persistingSearchAttachments() ? "Keeping extracted notes..." : "Keep extracted notes instead"}
              </button>
            </Show>
            <Show when={pendingSearchCleanupMessageIds().length > 0 && !searchFailureReceipt()}>
              <button
                type="button"
                disabled={persistingSearchAttachments() || retryingSearchCleanup() || searchBusy()}
                onClick={() => void retrySearchAttachmentCleanup()}
                class="inline-flex items-center rounded-full border border-rose-200/80 bg-rose-50/90 px-3 py-1 text-xs font-medium text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retryingSearchCleanup() ? "Deleting temporary copies..." : "Retry temporary cleanup"}
              </button>
            </Show>
            <AgentStatusPill
              llmConfig={llmConfig()}
              browserAiLabel={browserAiLabel()}
              signedIn={Boolean(session()?.token)}
              onSettingsClick={() => {
                setAgentSettingsFocusLlm(true);
                setAgentSettingsFocusTab("llm");
                selectView("agent_settings");
              }}
              onSignIn={() => openAuthModalIfSignedOut()}
            />
            {/* Approval-gate notice — surfaces when orchestration is waiting for a decision */}
            <Show when={commandResult()?.intent === "orchestrate"}>
              <span class="flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-50/80 px-3 py-1 text-xs font-medium text-amber-700 animate-pulse">
                <span class="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                Approval may be required — review the card below
              </span>
            </Show>
          </div>

          {/* Last-search context chip — re-run or dismiss */}
          <Show when={lastQuery() && !searchBusy() && !queryChipDismissed()}>
            <div class="mt-2.5 flex items-center justify-center animate-fade-in">
              <div class="flex items-center gap-1.5 rounded-full border border-white/40 bg-white/30 py-1 pl-3 pr-1.5 text-xs text-on-surface-variant">
                <span class="text-on-surface-variant/60">Last:</span>
                <span class="max-w-[200px] truncate font-medium text-on-surface">"{lastQuery()}"</span>
                <button
                  type="button"
                  disabled={searchBusy()}
                  onClick={() =>
                    void handleSearch(lastQuery(), lastEngine(), lastOptMode(), {
                      launchContext: objectSearchLaunchContext(),
                    })
                  }
                  class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ↺ Re-run
                </button>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setQueryChipDismissed(true)}
                  class="rounded-full p-0.5 text-on-surface-variant/40 transition hover:text-on-surface-variant"
                >
                  ×
                </button>
              </div>
            </div>
          </Show>

          {/* Setup checklist — visible until LLM is configured */}
          <Show when={Boolean(session()?.token) && !workspaceLlmSetupComplete()}>
            <div class="mt-3 flex items-center gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/70 px-4 py-2.5 animate-fade-in">
              <span class="flex-shrink-0 text-amber-500">⚙</span>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-amber-800">Quick setup</p>
                <Show when={workspaceLlmPendingSetupReason()}>
                  {(reason) => (
                    <p class="mt-0.5 text-[11px] text-amber-800/85">{reason()}</p>
                  )}
                </Show>
                <div class="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
                  <span class="text-[11px] text-green-700 flex items-center gap-1">
                    <span>✓</span> Signed in
                  </span>
                  <button
                    type="button"
                    class="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    onClick={() => { setAgentSettingsFocusLlm(true); setAgentSettingsFocusTab("llm"); selectView("agent_settings"); }}
                  >
                    <span class="text-amber-500">○</span> Connect AI model →
                  </button>
                </div>
              </div>
              <span class="text-[10px] text-amber-600/70 flex-shrink-0">Step 1 of 2</span>
            </div>
          </Show>
        </div>

        {/* Main content area */}
        <div class="mt-5" style="min-height: 620px">
          <div class="min-w-0 overflow-hidden">

            {/* Home — bento workspace grid */}
            <Show when={activeView() === "home"}>
              <div class="space-y-4">
                <Show when={!session()?.token}>
                  <DemoPreviewCallout
                    title="Sample workspace preview"
                    body="You're exploring a sample home workspace in guest mode. Tiles, queues, and cards here are demo content until you sign in."
                  />
                </Show>
                <Suspense fallback={<HomeWorkspaceFallback label="home queues" />}>
                  <LazyHomeQueuesSection bootstrap={workspaceBootstrap()} />
                </Suspense>

                {/* PARA quick-access strip */}
                <Show when={paraViewEnabled()}>
                  <Suspense fallback={<HomeWorkspaceFallback label="PARA overview" compact />}>
                    <LazyPARAOverviewStrip
                      onOpen={() => selectView(paraViewEnabled() ? "para" : "home")}
                      token={session()?.token ?? ""}
                    />
                  </Suspense>
                </Show>

                <div class="view-enter">
                  <Suspense fallback={<HomeWorkspaceFallback label="workspace grid" />}>
                    <LazyBentoGrid
                      bootstrap={workspaceBootstrap()}
                      signedIn={Boolean(session()?.token)}
                      onOpenView={(view) => selectView(view)}
                      onRequestSearchFocus={() => {
                        selectView("search");
                        setSearchFocusTick((n) => n + 1);
                      }}
                      onRequestWorkspaceAssistDraftRefresh={requestWorkspaceAssistDraftRefresh}
                      workspaceAssistRefreshOrigin={workspaceAssistRefreshOrigin}
                    />
                  </Suspense>
                </div>
              </div>
            </Show>

            <Show when={activeView() === "study" && !studyLensEnabled()}>
              <div class="view-enter rounded-2xl border border-outline-variant/50 bg-surface/70 p-5">
                <p class="text-sm font-semibold text-on-surface">Study Lens is off</p>
                <p class="mt-1 text-sm text-on-surface-variant">Turn Study Lens on to open the dedicated study workspace.</p>
                <button
                  type="button"
                  onClick={toggleStudyLens}
                  class="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
                >
                  Turn on Study Lens
                </button>
              </div>
            </Show>
            <Show when={activeView() === "study" && studyLensEnabled()}>
              <Suspense fallback={<HomeWorkspaceFallback label="Study Lens" />}>
                <LazyStudyLensDashboard
                  state={studyLensDashboard()}
                  onOpenReport={openStudyLensReport}
                  onOpenReportIntent={openStudyLensReportIntent}
                  onOpenFileLibraryIntent={openStudyLensFileLibraryIntent}
                  onOpenKnowledgeGraphIntent={openStudyLensKnowledgeGraphIntent}
                  onNavigate={selectView}
                  onAddCourse={addStudyLensCourse}
                  onAddDeadline={addStudyLensDeadline}
                  onUpdateDeadlineReview={updateStudyLensDeadlineReview}
                  onRecordAttempt={addStudyLensAttempt}
                  onRecordMedicalMissedTopic={addStudyLensMedicalMissedTopic}
                />
              </Suspense>
            </Show>

            {/* Chat / search view */}
            <Show when={activeView() === "search"}>
              <ErrorBoundary
                fallback={(err, reset) => (
                  <SearchRouteFallback
                    error={err}
                    onBack={() => selectView("home")}
                    onClear={() => {
                      setCommandResult(null);
                      setObjectSearchResult(null);
                      workspaceSearchRouterPreview.clear();
                      objectSearchRouterPreview.clear();
                      reset();
                    }}
                  />
                )}
              >
              <div class="view-enter space-y-5">
                <WeddingNavigationArrivalBanner
                  state={weddingArrivalBannerFor("search")}
                  onAction={runWeddingArrivalAction}
                  onDismiss={() => setWeddingNavigationIntent(null)}
                />
                <Show when={objectSearchResult()}>
                  {(result) => (
                    <div class="space-y-4">
                      <Suspense>
                        <LazyObjectSearchLens
                          query={lastQuery()}
                          result={result()}
                          launchContext={objectSearchLaunchContext()}
                          onSubmitQuery={(nextQuery) =>
                            void handleSearch(nextQuery, lastEngine(), lastOptMode(), {
                              launchContext: objectSearchLaunchContext(),
                            })
                          }
                        />
                        <LazyObjectSearchResults
                          result={result()}
                          advanced={advanced()}
                          onOpenThread={openThread}
                          focusedObjectId={objectSearchFocusObjectId()}
                          launchContext={objectSearchLaunchContext()}
                          localRouterResult={objectSearchRouterPreview.result()}
                          localRouterCapabilities={objectSearchRouterPreview.capabilities()}
                          onRefreshLocalPreview={() => objectSearchRouterPreview.load(lastQuery())}
                          onOpenCalendarEvent={openCalendarEventFromObjectSearch}
                          onOpenReportIntent={openStudyLensReportIntent}
                          onFocusObject={(objectId) => {
                            setObjectSearchFocusObjectId(objectId);
                            void handleSearch(lastQuery(), lastEngine(), lastOptMode(), {
                              focusObjectId: objectId,
                              focusThreadId: objectSearchFocusThreadId(),
                              launchContext: objectSearchLaunchContext(),
                            });
                          }}
                        />
                      </Suspense>
                    </div>
                  )}
                </Show>
                <Show when={commandResult()}>
                  {(result) => (
                    <MasterAgentConversationResponse query={lastQuery()} response={result()} />
                  )}
                </Show>
                {/* Search result card — shown when a command has been run */}
                <Show when={commandPreviewMessage()}>
                  {(preview) => (
                    <div class="space-y-3">
                      <Show when={commandPreviewUnlockNoticeState()}>
                        {(notice) => (
                          <div class="rounded-2xl border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                            <p class="font-semibold">{notice().label}</p>
                            <p class="mt-1 text-xs leading-5 text-amber-800/90">{notice().detail}</p>
                          </div>
                        )}
                      </Show>
                      <Show when={commandFallbackNotice()}>
                        {(notice) => (
                          <div class={`rounded-2xl px-4 py-3 text-sm ${
                            notice().tone === "amber"
                              ? "border border-amber-300/60 bg-amber-50/80 text-amber-900"
                              : "border border-outline-variant/50 bg-surface/70 text-on-surface"
                          }`}>
                            <p class="font-semibold">{notice().label}</p>
                            <p class={`mt-1 text-xs leading-5 ${
                              notice().tone === "amber" ? "text-amber-800/90" : "text-on-surface-variant"
                            }`}>{notice().detail}</p>
                            <Show when={notice().actionView && notice().actionLabel}>
                              <div class="mt-3">
                                <button
                                  type="button"
                                  class="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90"
                                  onClick={() => {
                                    if (notice().actionView === "agent_settings") {
                                      setAgentSettingsFocusLlm(true);
                                    }
                                    selectKnownView(notice().actionView);
                                  }}
                                >
                                  {notice().actionLabel}
                                </button>
                              </div>
                            </Show>
                          </div>
                        )}
                      </Show>
                      <Show when={!commandRequiresAiSetup() && workspaceSearchRouterPreview.result()}>
                        {(routerPreview) => (
                          <Show when={!searchPreviewEmbedsLocalRouter(commandPreviewMessage())}>
                            <Suspense>
                              <LazyThreadSemanticRouterPreview
                                result={routerPreview()}
                                capabilities={workspaceSearchRouterPreview.capabilities()}
                                onRefreshLocalPreview={() => workspaceSearchRouterPreview.load(lastQuery())}
                              />
                            </Suspense>
                          </Show>
                        )}
                      </Show>
                      <Show when={!commandRequiresAiSetup()}>
                        <ViewDispatcher
                          message={preview()}
                          onViewWorkflow={commandWorkflowHandoffHandler()}
                        />
                      </Show>
                      <Show when={!commandRequiresAiSetup() && advanced()}>
                        <Suspense>
                          <LazyAlternateViewsInspector message={preview()} compact />
                        </Suspense>
                      </Show>
                      {/* Canvas switch pill — shown for orchestrate/workflow intents */}
                      <Show when={!commandRequiresAiSetup() && commandWorkflowHandoffVisible()}>
                        <div class="flex justify-end">
                          <button
                            type="button"
                            class="animate-fade-in rounded-full border border-outline-variant/40 bg-white/50 px-4 py-1.5 text-xs font-medium text-on-surface-variant transition hover:border-primary/40 hover:text-primary"
                            onClick={openWorkflowsFromCommand}
                          >
                            View workflow on canvas →
                          </button>
                        </div>
                      </Show>
                    </div>
                  )}
                </Show>
                <Suspense>
                  <LazyDashboardFeed
                    bootstrap={workspaceBootstrap()}
                    signedIn={Boolean(session()?.token)}
                    commandSummary={commandResult() ? undefined : undefined}
                    advanced={advanced()}
                    onOpenThread={openThread}
                    onNavigate={(view, hint) => {
                      if (view === "agent_settings" && hint === "llm") {
                        setAgentSettingsFocusLlm(true);
                        setAgentSettingsFocusTab("llm");
                      }
                      if (view === "email" && hint === "gmail") {
                        setEmailConnectFocusTick((value) => value + 1);
                      }
                      selectKnownView(view);
                    }}
                  />
                </Suspense>
              </div>
              </ErrorBoundary>
            </Show>

            {/* Threads view */}
              <Show when={activeView() === "threads"}>
                <Suspense fallback={<LazyViewFallback label="Threads" />}>
                  <div class="view-enter">
                    <Show when={!session()?.token}>
                      <div class="mb-4">
                        <DemoPreviewCallout
                          title="Sample thread preview"
                          body="These threads are sample conversations for exploring the UI in guest mode. Sign in to replace them with your own thread history."
                        />
                      </div>
                    </Show>
                    <WeddingNavigationArrivalBanner
                      state={weddingArrivalBannerFor("threads")}
                      onAction={runWeddingArrivalAction}
                      onDismiss={() => setWeddingNavigationIntent(null)}
                    />
                    <Show
                      when={openThreadId()}
                      fallback={
                        <LazyThreadsListView
                          messages={dashboardBootstrapMessages(workspaceBootstrap())}
                          threadSummaries={dashboardBootstrapThreadSummaries(workspaceBootstrap())}
                          initialSearchQuery={threadSearchLaunchQuery()}
                          initialSearchLaunchContext={threadSearchLaunchContext()}
                          onOpenThread={openThread}
                          onRequestSearchFocus={() => {
                            selectView("search");
                            setSearchFocusTick((n) => n + 1);
                          }}
                          onOpenAgentSettings={() => {
                            setAgentSettingsFocusLlm(false);
                            selectView("agent_settings");
                          }}
                        />
                      }
                    >
                      <LazyThreadView
                        threadId={openThreadId()!}
                        initialFocusMessageId={openThreadMessageId()}
                        initialReplyDraft={threadInitialReplyDraft()}
                        bootstrap={workspaceBootstrap()}
                        advanced={advanced()}
                        onOpenWorkspaceAssist={(view: "home" | "search" | "response_queue" | "decision_queue" | "files") =>
                          openWorkspaceAssistNavigation(view)
                        }
                        onRequestWorkspaceAssistDraftRefresh={requestWorkspaceAssistDraftRefresh}
                        workspaceAssistRefreshOrigin={workspaceAssistRefreshOrigin(`thread:${openThreadId()!}`)}
                        onBack={() => {
                          setOpenThreadId(null);
                          setOpenThreadMessageId(null);
                          persistPrefs("threads", null);
                        }}
                      />
                    </Show>
                  </div>
                </Suspense>
              </Show>

              <Show when={activeView() === "workflows" && !session()?.token}>
                <GuestGate label="Workflows" onSignIn={() => openAuthModalIfSignedOut()} />
              </Show>
              <Show when={activeView() === "workflows" && Boolean(session()?.token)}>
                <Suspense fallback={<LazyViewFallback label="Workflows" />}>
                  <div class="view-enter">
                    <LazyWorkflowsView
                      pendingIntent={workflowPendingIntent()}
                      onPendingIntentConsumed={(seedId) => {
                        setWorkflowPendingIntent((current) =>
                          commandPreviewPendingIntentAfterConsumed(current, seedId) ?? null,
                        );
                      }}
                    />
                  </div>
                </Suspense>
              </Show>

              <Show when={activeView() === "cofounder_studio" && !session()?.token}>
                <GuestGate label="Co-Founder Studio" onSignIn={() => openAuthModalIfSignedOut()} />
              </Show>
              <Show when={activeView() === "cofounder_studio" && Boolean(session()?.token)}>
                <Suspense fallback={<LazyViewFallback label="Cofounder Studio" />}>
                  <div class="view-enter">
                    <LazyCofounderStudioView onNavigateBack={() => selectView("templates")} />
                  </div>
                </Suspense>
              </Show>

              {/* Templates view */}
              <Show when={activeView() === "templates"}>
                <Suspense fallback={<LazyViewFallback label="Templates" />}>
                  <div class="view-enter">
                    <LazyTemplatesView onLaunch={(view) => launchPreloadedTemplateView(view)} />
                  </div>
                </Suspense>
              </Show>

              {/* Email view */}
              <Show when={activeView() === "email"}>
                <Suspense fallback={<LazyViewFallback label="Email" />}>
                  <div class="view-enter">
                    <WeddingReturnBanner onReturn={returnToWeddingPlannerHome} />
                    <LazyEmailView
                      bootstrap={workspaceBootstrap()}
                      signedIn={Boolean(session()?.token)}
                      focusConnectTick={emailConnectFocusTick()}
                    />
                  </div>
                </Suspense>
              </Show>

            {/* Note view — editor-first note workspace */}
            <Show when={activeView() === "note" && !session()?.token}>
              <GuestGate label="Notes" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "note" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Notes" />}>
                <div class="view-enter h-full">
                  <LazyNoteView messages={dashboardBootstrapMessages(workspaceBootstrap())} />
                </div>
              </Suspense>
            </Show>

            {/* Calendar view — monthly interactive calendar */}
            <Show when={activeView() === "calendar"}>
              <Suspense fallback={<LazyViewFallback label="Calendar" />}>
                <div class="view-enter">
                  <WeddingReturnBanner onReturn={returnToWeddingPlannerHome} />
                  <LazyMonthlyCalendarView
                    initialDate={calendarNavigationDate()}
                    initialEventId={calendarNavigationEventId()}
                    afpMessages={[
                      ...dashboardBootstrapMessages(workspaceBootstrap()),
                      ...studyDeadlinesToAfpCalendarMessages(studyDeadlines()),
                    ]}
                    reversibleSummary={dashboardBootstrapCalendarRuntimeSummary(workspaceBootstrap())}
                    onOpenThread={openThread}
                  />
                </div>
              </Suspense>
            </Show>

            {/* Database view — structured grid per DATABASE_VIEW_DETAILED_DESIGN.md */}
            <Show when={activeView() === "database" && !session()?.token}>
              <GuestGate label="Database" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "database" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Database" />}>
                <div class="view-enter">
                  <LazyDatabaseView bootstrap={workspaceBootstrap()} />
                </div>
              </Suspense>
            </Show>

            {/* Tasks view — pending AFP task messages not yet due */}
              <Show when={activeView() === "tasks"}>
              <div class="view-enter">
                <TasksView
                  bootstrap={workspaceBootstrap()}
                  onAddTask={() => selectView("calendar")}
                  onOpenThread={openThread}
                  onNavigate={selectView}
                />
              </div>
            </Show>

            {/* PARA Navigator */}
            <Show when={paraViewEnabled() && activeView() === "para"}>
              <Suspense fallback={<LazyViewFallback label="PARA Navigator" />}>
                <div class="view-enter h-full">
                  <LazyPARAView token={session()?.token ?? ""} onNavigate={selectView} />
                </div>
              </Suspense>
            </Show>

            <Show when={activeView() === "files" && !session()?.token}>
              <GuestGate label="Files" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "files" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Files" />}>
                <div class="view-enter h-full">
                  <LazyFilesView
                    onNavigate={selectView}
                    onOpenStudyQuickStart={openStudyQuickStart}
                    onOpenThread={openThread}
                  />
                </div>
              </Suspense>
            </Show>

            {/* Decision Queue view — continuity-backed approvals and actions */}
            <Show when={activeView() === "decision_queue" && !session()?.token}>
              <GuestGate label="Decision Queue" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "decision_queue" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Decision Queue" />}>
                <div class="view-enter">
                  <LazyDecisionQueueView bootstrap={workspaceBootstrap()} onNavigate={selectView} />
                </div>
              </Suspense>
            </Show>

            {/* Response Queue view — dedicated conversational follow-up surface.
                Guests using the sample workspace (e.g. the Wedding Planning
                template's demo) can view this with sample data; ResponseQueueView
                already treats auth_provider === "guest" specially (no persistence). */}
            <Show when={activeView() === "response_queue" && !session()?.token && !guestUsesSampleWorkspace()}>
              <GuestGate label="Response Queue" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "response_queue" && (Boolean(session()?.token) || guestUsesSampleWorkspace())}>
              <ErrorBoundary
                fallback={(err, reset) => (
                  <ResponseQueueRouteFallback
                    error={err}
                    onBack={() => selectView("home")}
                    onRetry={() => {
                      returnToWeddingPlannerHome();
                      reset();
                    }}
                  />
                )}
              >
                <Suspense fallback={<LazyViewFallback label="Response Queue" />}>
                  <div class="view-enter">
                    <LazyResponseQueueView
                      bootstrap={workspaceBootstrap()}
                      onNavigate={(view, hint) => {
                        if (view === "agent_settings" && hint === "llm") {
                          setAgentSettingsFocusLlm(true);
                          setAgentSettingsFocusTab("llm");
                        }
                        if (view === "email" && hint === "gmail") {
                          setEmailConnectFocusTick((value) => value + 1);
                        }
                        selectView(view);
                      }}
                    />
                  </div>
                </Suspense>
              </ErrorBoundary>
            </Show>

            {/* Cost Dashboard — cost oracle budgeting, tracking, and analysis */}
            <Show when={activeView() === "cost_dashboard" && !session()?.token}>
              <GuestGate label="Cost Dashboard" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "cost_dashboard" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Cost Dashboard" />}>
                <div class="view-enter">
                  <LazyCostDashboardView initialSnapshot={dashboardBootstrapCostSnapshot(workspaceBootstrap())} />
                </div>
              </Suspense>
            </Show>

            {/* Tools view — MCP tools and skill capsules */}
            <Show when={activeView() === "tools"}>
              <Suspense fallback={<LazyViewFallback label="Tools" />}>
                <div class="view-enter">
                  <LazyToolsView
                    signedIn={Boolean(session()?.token)}
                    onOpenConnectedApp={(_appId, label) => {
                      setConnectedAppsInitialFilter(label);
                      selectView("connected_apps");
                    }}
                  />
                </div>
              </Suspense>
            </Show>

            {/* Runner view — advanced only, signed-in only */}
            <Show when={activeView() === "runner" && !session()?.token}>
              <GuestGate label="Python Runner" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "runner" && Boolean(session()?.token) && advanced()}>
              <Suspense fallback={<LazyViewFallback label="Python Runner" />}>
                <LazyPythonRunnerView
                  files={runnerFiles()}
                  activeFile={activeFile()}
                  editorValue={editorValue()}
                  logs={runtimeLogs()}
                  logSource={runtimeLogSource()}
                  feedback={runnerFeedback()}
                  feedbackReceipt={runnerFeedbackReceipt()}
                  runtimeStatus={runtimeDeployment()?.status ?? "not_deployed"}
                  runtimeFramework={runtimeDeployment()?.framework ?? null}
                  advanced={advanced()}
                  runtimeStatusPanel={dashboardBootstrapRuntimeStatusPanel(workspaceBootstrap())}
                  runtimeStatusViews={dashboardBootstrapRuntimeStatusViews(workspaceBootstrap())}
                  runtimeUpdatesPanel={dashboardBootstrapRuntimeUpdatesPanel(workspaceBootstrap())}
                  runtimeBusy={runtimeBusy()}
                  hasRuntime={Boolean(runtimeDeployment())}
                  commandDraft={commandResult()}
                  workspaceAssist={runnerWorkspaceAssist()}
                  workspaceAssistRefreshOrigin={workspaceAssistRefreshOrigin("runner")}
                  signedIn={Boolean(session()?.token)}
                  onSelectFile={(fileId) => void selectFile(fileId)}
                  onEditorChange={setEditorValue}
                  onSave={() => void saveActiveFile()}
                  onApplyDraft={applyCommandDraft}
                  onOpenWorkspaceAssist={openRunnerWorkspaceAssist}
                  onDeploy={() => void deployPythonRunner()}
                  onRefreshLogs={() => void refreshRunnerMonitor()}
                  onRuntimeAction={(action) => void handleRuntimeAction(action)}
                />
              </Suspense>
            </Show>
            <Show when={activeView() === "runner" && Boolean(session()?.token) && !advanced()}>
              <div class="view-enter glass-surface rounded-3xl border border-white/50 p-10 text-center shadow-card">
                <p class="text-sm text-on-surface-variant">Enable <strong class="text-on-surface">Advanced ▾</strong> in the top nav to access the Python runner.</p>
              </div>
            </Show>

            {/* Agent Settings view */}
            <Show when={activeView() === "agent_settings" && !session()?.token}>
              <GuestGate label="Agent Settings" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "agent_settings" && Boolean(session()?.token)}>
              <ErrorBoundary
                fallback={(err, reset) => (
                  <AgentSettingsRouteFallback
                    error={err}
                    onBack={() => selectView("home")}
                    onRetry={reset}
                  />
                )}
              >
                <Suspense fallback={<LazyViewFallback label="Agent Settings" />}>
                  <div class="view-enter">
                    <WeddingReturnBanner onReturn={returnToWeddingPlannerHome} />
                    <LazyAgentSettingsView
                      browserAiLabel={browserAiLabel()}
                      focusLlm={agentSettingsFocusLlm()}
                      onFocusDone={() => setAgentSettingsFocusLlm(false)}
                      onViewWorkflows={() => selectView("workflows")}
                      focusSettingsTab={agentSettingsFocusTab() ?? undefined}
                      onSettingsTabFocusDone={() => setAgentSettingsFocusTab(null)}
                      deviceSyncPolicies={dashboardBootstrapDeviceSyncPolicyEntries(workspaceBootstrap())}
                      deviceSyncRuntimeSummary={dashboardBootstrapDeviceSyncRuntimeSummary(workspaceBootstrap())}
                      simulatorRuntimeSummary={dashboardBootstrapSimulatorRuntimeSummary(workspaceBootstrap())}
                      runtimeUpdates={dashboardBootstrapRuntimeUpdates(workspaceBootstrap())}
                      runtimeDeployment={dashboardBootstrapRuntimeDeployment(workspaceBootstrap())}
                      runtimeBackups={dashboardBootstrapRuntimeBackups(workspaceBootstrap())}
                      runtimeRestoreDrills={dashboardBootstrapRuntimeRestoreDrills(workspaceBootstrap())}
                      supportAccess={dashboardBootstrapSupportAccess(workspaceBootstrap())}
                      supportAccessHistory={dashboardBootstrapSupportAccessHistory(workspaceBootstrap())}
                    />
                  </div>
                </Suspense>
              </ErrorBoundary>
            </Show>

            {/* Diary view */}
            <Show when={activeView() === "diary" && !session()?.token}>
              <GuestGate label="Diary" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "diary" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Diary" />}>
                <div class="view-enter"><LazyDiaryView /></div>
              </Suspense>
            </Show>

            {/* Discover view */}
            <Show when={activeView() === "discover"}>
              <Suspense fallback={<LazyViewFallback label="Discover" />}>
                <div class="view-enter"><LazyDiscoverView isDemo={!session()?.token} /></div>
              </Suspense>
            </Show>

            {/* Pulse Feed view */}
            <Show when={activeView() === "pulse" && !session()?.token}>
              <GuestGate label="Pulse Feed" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "pulse" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Pulse Feed" />}>
                <div class="view-enter h-full"><LazyPulseFeed /></div>
              </Suspense>
            </Show>

            {/* Goals view - current mounted goals surface is the pulse planner/feed */}
            <Show when={activeView() === "goals" && !session()?.token}>
              <GuestGate label="Goals" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "goals" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Goals" />}>
                <div class="view-enter h-full"><LazyPulseFeed /></div>
              </Suspense>
            </Show>

            {/* Contacts view */}
            <Show when={activeView() === "contacts" && !session()?.token}>
              <GuestGate label="Contacts" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "contacts" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Contacts" />}>
                <div class="view-enter"><LazyContactsView /></div>
              </Suspense>
            </Show>

            {/* Connected Apps view */}
            <Show when={activeView() === "connected_apps" && !session()?.token}>
              <GuestGate label="Connected Apps" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "connected_apps" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Connected Apps" />}>
                <div class="view-enter">
                  <WeddingReturnBanner onReturn={returnToWeddingPlannerHome} />
                  <LazyConnectedAppsView initialFilter={connectedAppsInitialFilter()} />
                </div>
              </Suspense>
            </Show>

            {/* Space Feed view */}
            <Show when={activeView() === "space_feed" && !session()?.token}>
              <GuestGate label="Spaces" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "space_feed" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Space Feed" />}>
                <div class="view-enter"><LazySpacesView /></div>
              </Suspense>
            </Show>

            {/* Public Feed view */}
            <Show when={activeView() === "public_feed"}>
              <Suspense fallback={<LazyViewFallback label="Public Feed" />}>
                <div class="view-enter"><LazyPublicFeedView isAnon={!session()?.token} /></div>
              </Suspense>
            </Show>

            {/* Knowledge Graph — standalone full view */}
            <Show when={activeView() === "knowledge_graph"}>
              <Suspense fallback={<LazyViewFallback label="Knowledge Graph" />}>
                <div class="view-enter">
                  <div class="rounded-3xl border border-white/50 bg-white/35 p-5 backdrop-blur shadow-card">
                    <LazyKnowledgeGraphView
                      messages={dashboardBootstrapMessages(workspaceBootstrap())}
                      isDemo={!session()?.token}
                      onOpenStudyQuickStart={openStudyQuickStart}
                      onOpenThread={openThread}
                    />
                  </div>
                </div>
              </Suspense>
            </Show>

            {/* Sovereignty Audit — data ownership metrics */}
            {/* Reports - study reports from linked knowledge */}
            <Show when={activeView() === "reports" && !session()?.token}>
              <GuestGate label="Reports" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "reports" && Boolean(session()?.token)}>
              <Suspense fallback={<LazyViewFallback label="Reports" />}>
                <div class="view-enter">
                  <LazyReportsView
                    messages={dashboardBootstrapMessages(workspaceBootstrap())}
                    onNavigate={selectView}
                    onOpenStudyQuickStart={openStudyQuickStart}
                  />
                </div>
              </Suspense>
            </Show>

            {/* Sovereignty Audit - data ownership metrics */}
            <Show when={activeView() === "sovereignty_audit" && !session()?.token}>
              <GuestGate label="Sovereignty Audit" onSignIn={() => openAuthModalIfSignedOut()} />
            </Show>
            <Show when={activeView() === "sovereignty_audit" && Boolean(session()?.token)}>
              <div class="view-enter">
                <SovereigntyAuditView messages={dashboardBootstrapMessages(workspaceBootstrap())} signedIn={Boolean(session()?.token)} />
              </div>
            </Show>
          </div>
        </div>
      </GlassPanel>

      {/* Floating agent persona FAB */}
      <Show when={Boolean(session()?.token) && !(activeView() === "response_queue" && loadWeddingEntrySource() === "wedding_site")}>
        <AgentPersonaFAB
          signedIn={Boolean(session()?.token)}
          activeCount={fleetActiveCount()}
          justCompleted={workflowNewResult()}
          onOpenSettings={() => selectView("agent_settings")}
          loraScore={loraScore()}
          loraActive={loraActive()}
          urgentPending={(() => {
            const msgs = dashboardBootstrapMessages(workspaceBootstrap());
            return msgs.filter((m) => {
              if (m.type === "decision_request") return true;
              if (m.type === "agent" && (m.subtype === "approval_request" || m.subtype === "orchestration_card")) return true;
              if (m.type === "watcher_alert") {
                const c = isRecord(m.content) ? m.content : {};
                return c.severity === "urgent" || c.urgency === "high";
              }
              return false;
            }).length;
          })()}
        />
      </Show>

      {/* View customizer — floating + for image background and custom A2UI cards (non-home views only) */}
      <Show when={activeView() !== "home" && !(activeView() === "response_queue" && loadWeddingEntrySource() === "wedding_site")}>
        <Suspense>
          <LazyViewCustomizer viewId={activeView()} />
        </Suspense>
      </Show>

      {/* Floating format bar — appears when a contenteditable is focused */}
      <Suspense>
        <LazyFloatingFormatBar />
      </Suspense>

      {/* AFP Metadata Inspector — fires on afp:inspect custom event */}
      <Suspense>
        <LazyAfpInspector />
      </Suspense>

      {/* Global toast notifications */}
      <ToastContainer />
    </main>
  );
}

function TasksView(props: {
  bootstrap: DashboardBootstrap | null;
  onAddTask: () => void;
  onOpenThread: (threadId: string, messageId?: string | null) => void;
  onNavigate: (view: ViewName) => void;
}) {
  return <ActiveTasksDecisionView {...props} />;
}

function SovereigntyAuditView(props: { messages: AfpMessage[]; signedIn: boolean }) {
  const encryptedCount = () => props.messages.filter((m) => m.encryption !== null).length;
  const totalCount = () => props.messages.length;
  const e2eePercent = () => totalCount() > 0 ? Math.round((encryptedCount() / totalCount()) * 100) : 0;
  const typeBreakdown = () => {
    const counts: Record<string, number> = {};
    for (const m of props.messages) counts[m.type] = (counts[m.type] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  };

  return (
    <div class="space-y-5 animate-fade-in">
      <div>
        <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-outline">Data Sovereignty</p>
        <h2 class="mt-1 text-xl font-bold text-on-surface">Your data, your control</h2>
        <p class="mt-0.5 text-sm text-on-surface-variant">E2EE status and ownership metrics for your AFP message log.</p>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total messages", value: totalCount(), color: "text-on-surface" },
          { label: "E2EE encrypted", value: encryptedCount(), color: "text-emerald-600" },
          { label: "Plaintext", value: totalCount() - encryptedCount(), color: "text-amber-600" },
          { label: "E2EE coverage", value: `${e2eePercent()}%`, color: e2eePercent() >= 80 ? "text-emerald-600" : "text-amber-600" },
        ].map((stat) => (
          <div class="rounded-2xl border border-white/50 bg-white/40 p-4 backdrop-blur shadow-card">
            <p class="text-xs text-on-surface-variant">{stat.label}</p>
            <p class={`mt-1 text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div class="rounded-2xl border border-white/50 bg-white/40 p-4 backdrop-blur shadow-card">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Message types</p>
        <div class="space-y-2">
          {typeBreakdown().map(([type, count]) => (
            <div class="flex items-center gap-3">
              <span class="w-28 truncate font-mono text-[10px] text-on-surface-variant">{type}</span>
              <div class="flex-1 h-1.5 rounded-full bg-on-surface/8">
                <div
                  class="h-1.5 rounded-full bg-primary/60 transition-all"
                  style={{ width: `${Math.round((count / (totalCount() || 1)) * 100)}%` }}
                />
              </div>
              <span class="w-6 text-right font-mono text-[10px] text-on-surface-variant">{count}</span>
            </div>
          ))}
          {typeBreakdown().length === 0 && (
            <p class="text-sm text-on-surface-variant/50">No messages yet.</p>
          )}
        </div>
      </div>

      <div class="rounded-2xl border border-white/50 bg-white/40 p-4 backdrop-blur shadow-card text-sm space-y-2">
        <p class="font-semibold text-on-surface">Storage guarantees</p>
        <ul class="space-y-1 text-on-surface-variant text-xs list-none">
          <li class="flex items-center gap-2"><span class="text-emerald-500">✓</span> All AFP messages stored on your self-hosted homeserver</li>
          <li class="flex items-center gap-2"><span class="text-emerald-500">✓</span> E2EE messages encrypted before leaving your device</li>
          <li class="flex items-center gap-2"><span class="text-emerald-500">✓</span> No vendor lock-in — export your data at any time</li>
          <li class="flex items-center gap-2">
            <span class={props.signedIn ? "text-emerald-500" : "text-amber-400"}>{props.signedIn ? "✓" : "○"}</span>
            {props.signedIn ? "Signed in to your homeserver" : "Guest mode — sign in for full ownership"}
          </li>
        </ul>
      </div>
    </div>
  );
}

function GuestGate(props: { label: string; onSignIn: () => void }) {
  return (
    <div class="view-enter glass-surface rounded-3xl border border-white/50 p-10 text-center shadow-card animate-fade-in">
      <p class="text-base font-semibold text-on-surface">{props.label} requires a signed-in account</p>
      <p class="mt-2 text-sm text-on-surface-variant">
        Create a free OmnyID account to access this feature. Your data stays on your homeserver.
      </p>
      <button
        type="button"
        onClick={props.onSignIn}
        class="mt-5 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/80"
      >
        Sign in →
      </button>
    </div>
  );
}

function DemoPreviewCallout(props: { title: string; body: string }) {
  return (
    <div class="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-5 py-4 text-sm text-amber-900 shadow-soft animate-fade-in">
      <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-700">{props.title}</p>
      <p class="mt-1 leading-6">{props.body}</p>
    </div>
  );
}

function AgentSettingsRouteFallback(props: {
  error: unknown;
  onBack: () => void;
  onRetry: () => void;
}) {
  const message = () => (props.error instanceof Error ? props.error.message : String(props.error || "Unknown error"));

  return (
    <div class="view-enter rounded-3xl border border-amber-200/70 bg-amber-50/85 p-6 text-amber-950 shadow-card animate-fade-in">
      <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-700">Agent Settings</p>
      <h2 class="mt-2 text-xl font-semibold text-amber-950">AI settings could not open</h2>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-amber-900/85">
        The workspace is still available. This looks like an Agent Settings route error, so you can retry the panel or go back while we keep the rest of the planner stable.
      </p>
      <p class="mt-4 max-w-2xl rounded-2xl border border-amber-200/70 bg-white/70 px-3 py-2 font-mono text-xs leading-5 text-amber-900">
        {message()}
      </p>
      <div class="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
          onClick={props.onRetry}
        >
          Retry Agent Settings
        </button>
        <button
          type="button"
          class="rounded-full border border-amber-700 bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
          onClick={props.onBack}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

function SearchRouteFallback(props: {
  error: unknown;
  onBack: () => void;
  onClear: () => void;
}) {
  const message = () => (props.error instanceof Error ? props.error.message : String(props.error || "Unknown error"));

  return (
    <div class="view-enter rounded-3xl border border-rose-200/70 bg-rose-50/85 p-6 text-rose-950 shadow-card animate-fade-in">
      <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-rose-700">Master Agent</p>
      <h2 class="mt-2 text-xl font-semibold text-rose-950">Search result could not render</h2>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-rose-900/85">
        The workspace is still available. Clear the current result to keep working, or go back home and ask again.
      </p>
      <p class="mt-4 max-w-2xl rounded-2xl border border-rose-200/70 bg-white/70 px-3 py-2 font-mono text-xs leading-5 text-rose-900">
        {message()}
      </p>
      <div class="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-950 transition hover:bg-rose-100"
          onClick={props.onClear}
        >
          Clear result
        </button>
        <button
          type="button"
          class="rounded-full border border-rose-800 bg-rose-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-900"
          onClick={props.onBack}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

function ResponseQueueRouteFallback(props: {
  error: unknown;
  onBack: () => void;
  onRetry: () => void;
}) {
  const message = () => (props.error instanceof Error ? props.error.message : String(props.error || "Unknown error"));

  return (
    <div class="view-enter rounded-3xl border border-fuchsia-200/70 bg-fuchsia-50/85 p-6 text-fuchsia-950 shadow-card animate-fade-in">
      <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-fuchsia-700">Wedding Planner</p>
      <h2 class="mt-2 text-xl font-semibold text-fuchsia-950">Planner view could not open</h2>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-fuchsia-900/85">
        The workspace stayed open, but the wedding planner surface hit a render error. Retry the planner, or return home and use the Master Agent while the saved wedding data remains intact.
      </p>
      <p class="mt-4 max-w-2xl rounded-2xl border border-fuchsia-200/70 bg-white/70 px-3 py-2 font-mono text-xs leading-5 text-fuchsia-900">
        {message()}
      </p>
      <div class="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-full border border-fuchsia-300 bg-white px-4 py-2 text-sm font-semibold text-fuchsia-950 transition hover:bg-fuchsia-100"
          onClick={props.onRetry}
        >
          Retry Wedding Planner
        </button>
        <button
          type="button"
          class="rounded-full border border-fuchsia-800 bg-fuchsia-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-900"
          onClick={props.onBack}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

function LazyViewFallback(props: { label: string }) {
  return (
    <div class="view-enter glass-surface rounded-3xl border border-white/50 p-8 shadow-card animate-fade-in">
      <div class="skeleton-crossfade space-y-3">
        <p class="font-mono text-[10px] uppercase tracking-[0.24em] text-outline">{props.label}</p>
        <div class="h-5 w-40 rounded-full bg-white/20 animate-pulse" />
        <div class="space-y-2">
          <div class="h-4 w-full rounded-full bg-white/15 animate-pulse" />
          <div class="h-4 w-5/6 rounded-full bg-white/15 animate-pulse" />
          <div class="h-4 w-2/3 rounded-full bg-white/15 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function AgentStatusPill(props: {
  llmConfig: LlmConfig | null;
  browserAiLabel: string | null;
  signedIn: boolean;
  onSettingsClick?: () => void;
  onSignIn?: () => void;
}) {
  const label = () => {
    const cfg = props.llmConfig;
    if (cfg) {
      const backendLabel: Record<string, string> = {
        byok: "BYOK",
        ollama: "Ollama",
        runpod: "RunPod",
        hosted: "Hosted",
      };
      const be = backendLabel[cfg.backend] ?? cfg.backend;
      return `Saved model · ${cfg.model} via ${be}`;
    }
    if (props.browserAiLabel) return `Agent · ${props.browserAiLabel}`;
    return null;
  };
  return (
    <Show when={label()} fallback={
      <span class="rounded-full border border-red-300/60 bg-red-50/80 px-3 py-1 font-mono text-[11px] font-semibold text-red-600 shadow-sm">
        ⚠ No AI model —{" "}
        <Show when={props.signedIn} fallback={
          <button
            type="button"
            onClick={props.onSignIn}
            class="underline text-red-700 hover:text-red-900 transition font-bold"
          >
            Sign in to continue
          </button>
        }>
          <button
            type="button"
            onClick={props.onSettingsClick}
            class="underline text-red-700 hover:text-red-900 transition font-bold"
          >
            Set up in Agent Settings
          </button>
        </Show>
      </span>
    }>
      <span class="rounded-full border border-primary/25 bg-primary/10 px-3 py-0.5 font-mono text-[10px] text-primary">
        {label()}
      </span>
    </Show>
  );
}

const MSG_TYPE_COLORS: Record<string, string> = {
  task:             "bg-blue-100/60 text-blue-700",
  note:             "bg-yellow-100/60 text-yellow-700",
  research_result:  "bg-purple-100/60 text-purple-700",
  email:            "bg-green-100/60 text-green-700",
  generative_card:  "bg-indigo-100/60 text-indigo-700",
  search_result:    "bg-teal-100/60 text-teal-700",
};

type AuthModalFeedback = {
  tone: "success" | "error";
  text: string;
};

function ThreadListFallback(props: {
  messages: AfpMessage[];
  threadSummaries?: ThreadSummary[];
  initialSearchLaunchContext?: ThreadSearchLaunchContext | null;
  onOpen: (id: string) => void;
}) {
  type ThreadLinkFeedback = {
    tone: "success" | "danger" | "warning";
    title: string;
    summary: string;
    nextStep?: string | null;
  };

  const [filter, setFilter] = createSignal("");
  const [draggedThreadId, setDraggedThreadId] = createSignal<string | null>(null);
  const [focusedIdx, setFocusedIdx] = createSignal(-1);
  const [threadLinkFeedback, setThreadLinkFeedback] = createSignal<ThreadLinkFeedback | null>(null);
  const [remoteThreadResponse, setRemoteThreadResponse] =
    createSignal<import("@/lib/api").ThreadSummariesResponse | null>(null);
  const messageContentRecord = (message: AfpMessage): Record<string, unknown> =>
    isRecord(decryptedDisplayContent(message)) ? decryptedDisplayContent(message) : {};

  const parsedThreadSearch = createMemo(() => parseThreadSearchInput(filter()));
  const availableThreadKinds = createMemo(() => {
    const fromSummaries = collectKindCounts((props.threadSummaries ?? []).map((summary) => summary.dominant_kind));
    if (fromSummaries.length > 0) return fromSummaries;
    return collectKindCounts(props.messages.map((message) => message.kind));
  });

  function toggleThreadKindLens(kind: string) {
    const parsed = parsedThreadSearch();
    setFilter(
      buildThreadSearchInput({
        query: parsed.query,
        tags: parsed.tags,
        metadataTerms: parsed.metadataTerms,
        kind: parsed.kind === kind ? undefined : kind,
        threadIds: parsed.threadIds,
        fromAgents: parsed.fromAgents,
        timeRange: parsed.timeRange,
      }),
    );
  }

  async function linkThreads(targetThreadId: string, sourceThreadId: string) {
    setThreadLinkFeedback(null);
    try {
      await orchestrateAgent({
        objective: `Create a knowledge backlink between AFP thread "${targetThreadId}" and thread "${sourceThreadId}". Emit a backlink_update message linking them.`,
        thread_id: targetThreadId,
        ...(await loadAgentResponseStylePayload().catch(() => ({}))),
      });
      setThreadLinkFeedback({
        tone: "success",
        title: "Thread link queued",
        summary: `Asked the agent to link ${sourceThreadId} into ${targetThreadId}.`,
        nextStep: null,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Thread linking failed.";
      const receipt = buildThreadOrchestrationFailureReceipt(errorMessage);
      setThreadLinkFeedback({
        tone: receipt.tone,
        title: receipt.title,
        summary: receipt.summary,
        nextStep: receipt.nextStep,
      });
      try {
        await sendAfpMessage({
          thread_id: targetThreadId,
          from: "agent:thread-assist@omnyid.com",
          to: [],
          type: "note",
          subtype: "thread_link_failure",
          content: {
            title: receipt.title,
            body: `${receipt.summary} ${receipt.nextStep}`,
            source_thread_id: sourceThreadId,
            target_thread_id: targetThreadId,
            next_step: receipt.nextStep,
          },
          views: [
            {
              format: "rich_text",
              priority: 1,
              content: {
                markdown: `### ${receipt.title}\n\n${receipt.summary}\n\n**Next step:** ${receipt.nextStep}`,
              },
            },
          ],
          metadata: {
            origin: "thread_link_failure",
            source_thread_id: sourceThreadId,
            target_thread_id: targetThreadId,
            failure_tone: receipt.tone,
            raw_error_message: errorMessage,
          },
          store_in_relational: true,
        });
      } catch {
        // Keep inline recovery context even if thread logging fails.
      }
    }
  }

  onMount(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, visible().length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && focusedIdx() >= 0) { const t = visible()[focusedIdx()]; if (t) props.onOpen(t.id); }
    }
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  createEffect(() => {
    const parsed = parsedThreadSearch();
    if (!isThreadSummariesSearchActive(parsed)) {
      setRemoteThreadResponse(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void fetchThreadSummaries(buildThreadSummariesSearchRequest(parsed, 30))
        .then((response) => {
          setRemoteThreadResponse(response);
        })
        .catch(() => {
          setRemoteThreadResponse(null);
        });
    }, 180);
    onCleanup(() => window.clearTimeout(timer));
  });

  function threadHeat(threadId: string): number[] {
    const now = Date.now();
    const buckets = new Array(7).fill(0);
    for (const m of props.messages) {
      if (m.thread_id !== threadId || !m.timestamp) continue;
      const d = Math.floor((now - new Date(m.timestamp).getTime()) / 86_400_000);
      if (d < 7) buckets[6 - d]++;
    }
    return buckets;
  }

  const threads = createMemo(() => {
    const parsed = parsedThreadSearch();
    const serverSearchActive = isThreadSummariesSearchActive(parsed);
    const summaries = serverSearchActive
      ? threadSummariesList(remoteThreadResponse())
      : (props.threadSummaries ?? []);
    if (serverSearchActive || summaries.length > 0) {
      return summaries.map((summary) => ({
        id: summary.thread_id,
        preview: summary.preview || summary.title,
        msgType: summary.dominant_kind || "thread",
      }));
    }

    const seen = new Set<string>();
    return props.messages
      .filter((m) => {
        if (seen.has(m.thread_id)) return false;
        seen.add(m.thread_id);
        return true;
      })
      .map((m) => {
        const c = messageContentRecord(m);
        const raw = String(c["title"] ?? c["summary"] ?? c["description"] ?? c["query"] ?? m.type);
        const preview = raw.length > 65 ? `${raw.slice(0, 65)}…` : raw;
        return { id: m.thread_id, preview, msgType: m.type };
      });
  });

  const visible = createMemo(() => {
    const q = parsedThreadSearch().query.toLowerCase().trim();
    if (!q) return threads();
    return threads().filter(
      (t) => t.preview.toLowerCase().includes(q) || t.msgType.toLowerCase().includes(q)
    );
  });

  return (
    <GlassPanel class="p-6">
      <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-outline">Thread browser</p>
      <h2 class="mt-2 text-lg font-semibold text-on-surface">Your AFP threads</h2>
      <Show
        when={threads().length > 0}
        fallback={
          <p class="mt-4 text-sm text-on-surface-variant">
            No threads yet. Talk to your agent in the chat bar above.
          </p>
        }
      >
        <div class="mt-4">
          <input
            type="text"
            placeholder="Filter threads, #tags, kind:task, from:agent, after:2026-06-01…"
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
            class="w-full rounded-xl border border-white/35 bg-white/30 px-4 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:border-primary/40 focus:bg-white/50 transition"
          />
        </div>
        <Show when={availableThreadKinds().length > 0}>
          <div class="mt-3 flex flex-wrap items-center gap-1.5">
            <span class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline">
              kind lens
            </span>
            <For each={availableThreadKinds()}>
              {(entry) => (
                <button
                  type="button"
                  onClick={() => toggleThreadKindLens(entry.kind)}
                  class={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] transition ${
                    parsedThreadSearch().kind === entry.kind
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-white/20 bg-white/10 text-on-surface-variant/55 hover:bg-white/20"
                  }`}
                  title={`Filter threads by ${objectKindLabel(entry.kind)}`}
                >
                  {objectKindLabel(entry.kind)}
                  <span class="ml-[0.3em] tabular-nums opacity-60">({entry.count})</span>
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show
          when={
            (parsedThreadSearch().query.length >= 2
              || parsedThreadSearch().tags.length > 0
              || !!parsedThreadSearch().kind
              || parsedThreadSearch().threadIds.length > 0
              || parsedThreadSearch().fromAgents.length > 0
              || !!parsedThreadSearch().timeRange?.from
              || !!parsedThreadSearch().timeRange?.to)
            && threadSummariesRetrievalState(remoteThreadResponse())
          }
        >
          <ThreadDiscoveryStateSummary
            class="mt-3 rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 shadow-card backdrop-blur"
            state={threadSummariesRetrievalState(remoteThreadResponse())}
            launchContext={props.initialSearchLaunchContext}
          />
        </Show>
        <Show
          when={
            (parsedThreadSearch().query.length >= 2
              || parsedThreadSearch().tags.length > 0
              || !!parsedThreadSearch().kind
              || parsedThreadSearch().threadIds.length > 0
              || parsedThreadSearch().fromAgents.length > 0
              || !!parsedThreadSearch().timeRange?.from
              || !!parsedThreadSearch().timeRange?.to)
            && remoteThreadResponse()
          }
        >
          <ThreadDiscoveryLens
            query={filter()}
            result={remoteThreadResponse()}
            onSubmitQuery={(query) => setFilter(query)}
          />
        </Show>
        <Show when={threadLinkFeedback()}>
          <div
            class={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
              threadLinkFeedback()?.tone === "success"
                ? "border-emerald-200 bg-emerald-50/85 text-emerald-900"
                : threadLinkFeedback()?.tone === "danger"
                  ? "border-rose-200 bg-rose-50/90 text-rose-900"
                  : "border-amber-200 bg-amber-50/90 text-amber-900"
            }`}
          >
            <p class="font-semibold">{threadLinkFeedback()?.title}</p>
            <p class="mt-1">{threadLinkFeedback()?.summary}</p>
            <Show when={threadLinkFeedback()?.nextStep}>
              <p class="mt-2 text-xs font-medium">Next step: {threadLinkFeedback()?.nextStep}</p>
            </Show>
          </div>
        </Show>
        <div class="mt-3 space-y-2">
          <Show
            when={visible().length > 0}
            fallback={
              <p class="text-sm text-on-surface-variant">No threads match "{filter()}".</p>
            }
          >
            <For each={visible()}>
              {(thread, idx) => {
                const badgeClass = () =>
                  MSG_TYPE_COLORS[thread.msgType] ?? "bg-white/40 text-on-surface-variant";
                const isDragTarget = () => draggedThreadId() !== null && draggedThreadId() !== thread.id;
                const isFocused = () => focusedIdx() === idx();
                const heat = () => threadHeat(thread.id);
                const heatMax = () => Math.max(...heat(), 1);
                return (
                  <button
                    type="button"
                    draggable={true}
                    onClick={() => { setFocusedIdx(idx()); props.onOpen(thread.id); }}
                    onDragStart={() => setDraggedThreadId(thread.id)}
                    onDragEnd={() => setDraggedThreadId(null)}
                    onDragOver={(e) => { if (isDragTarget()) e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = draggedThreadId();
                      setDraggedThreadId(null);
                      if (!from || from === thread.id) return;
                      void linkThreads(thread.id, from);
                    }}
                    class={`flex w-full items-start justify-between gap-4 rounded-2xl border px-5 py-3.5 text-left transition ${
                      isDragTarget() ? "border-primary/40 bg-primary/8 ring-1 ring-primary/20" :
                      isFocused() ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30" :
                      "border-white/35 bg-white/25 hover:bg-white/45"
                    }`}
                  >
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class={`inline-block rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${badgeClass()}`}>
                          {thread.msgType}
                        </span>
                        {/* 7-day activity heat sparkline */}
                        <svg viewBox="0 14 56 16" class="h-3 w-14 flex-shrink-0">
                          <For each={heat()}>
                            {(n, i) => (
                              <rect
                                x={i() * 8} y={14 + 14 * (1 - n / heatMax())}
                                width={6} height={14 * (n / heatMax())}
                                rx={1}
                                fill={`rgba(49,86,142,${0.15 + 0.6 * (n / heatMax())})`}
                              />
                            )}
                          </For>
                        </svg>
                      </div>
                      <p class="mt-1 truncate text-sm font-medium text-on-surface">{thread.preview}</p>
                    </div>
                    <span class="flex-shrink-0 self-center text-sm text-primary">{isDragTarget() ? "↩ Link" : "Open →"}</span>
                  </button>
                );
              }}
            </For>
          </Show>
        </div>
      </Show>
    </GlassPanel>
  );
}

function AuthModal(props: {
  onClose: () => void;
  onLogin?: () => void;
  notice?: AuthModalFeedback | null;
  onClearNotice?: () => void;
  resetToken?: string;
  onResetTokenConsumed?: () => void;
}) {
  const [tab, setTab] = createSignal<"signin" | "signup">("signin");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = createSignal("");
  const [resendLoading, setResendLoading] = createSignal(false);
  const [resendMessage, setResendMessage] = createSignal("");
  const [googleReady, setGoogleReady] = createSignal(false);
  const [googleLoading, setGoogleLoading] = createSignal(false);
  const [googleError, setGoogleError] = createSignal("");
  const [passkeyLoading, setPasskeyLoading] = createSignal(false);
  const [forgotMode, setForgotMode] = createSignal(false);
  const [forgotLoading, setForgotLoading] = createSignal(false);
  const [forgotMessage, setForgotMessage] = createSignal("");
  const [resetNewPassword, setResetNewPassword] = createSignal("");
  const [resetLoading, setResetLoading] = createSignal(false);
  const [resetError, setResetError] = createSignal("");
  const [resetDone, setResetDone] = createSignal(false);
  let googleButtonHost: HTMLDivElement | undefined;
  const passkeySupported = () => browserSupportsPasskeyAuth();
  async function submitForgotPassword(e: SubmitEvent) {
    e.preventDefault();
    const submittedEmail = email().trim();
    if (!submittedEmail || forgotLoading()) return;
    setForgotLoading(true);
    setForgotMessage("");
    try {
      const data = await requestPasswordReset(submittedEmail);
      setForgotMessage(data.message || "If that email is registered, a reset link has been sent.");
    } catch (err) {
      setForgotMessage(visibleErrorText(err, "Could not request a password reset right now."));
    } finally {
      setForgotLoading(false);
    }
  }

  async function submitResetPassword(e: SubmitEvent) {
    e.preventDefault();
    const token = props.resetToken;
    const newPassword = resetNewPassword();
    if (!token || resetLoading()) return;
    setResetLoading(true);
    setResetError("");
    try {
      await resetPassword(token, newPassword);
      setResetDone(true);
    } catch (err) {
      setResetError(visibleErrorText(err, "Could not reset your password. The link may have expired — request a new one."));
    } finally {
      setResetLoading(false);
    }
  }

  function completeAuth(data: AuthApiResponse) {
    if (typeof data.token !== "string" || !data.user) {
      throw new Error("Authentication response was incomplete.");
    }
    writeSession({ token: data.token, user: data.user });
    if (props.onLogin) {
      props.onLogin();
    } else {
      window.location.reload();
    }
  }

  async function submitGoogleIdToken(idToken: string) {
    setLoading(true);
    setError("");
    setPendingVerificationEmail("");
    setResendMessage("");
    setGoogleError("");
    props.onClearNotice?.();
    try {
      const data = await authenticateWithGoogleIdToken(idToken);
      completeAuth(data);
    } catch (err) {
      setError(visibleErrorText(err, "Google sign-in failed."));
    } finally {
      setLoading(false);
    }
  }

  async function submitPasskey() {
    if (tab() !== "signin" || loading() || passkeyLoading()) return;
    const submittedEmail = email().trim();
    setPasskeyLoading(true);
    setError("");
    setPendingVerificationEmail("");
    setResendMessage("");
    setGoogleError("");
    props.onClearNotice?.();
    try {
      const data = await authenticateWithPasskey(submittedEmail);
      setEmail(submittedEmail);
      setPassword("");
      completeAuth(data);
    } catch (err) {
      setError(visibleErrorText(err, "Passkey sign-in failed."));
    } finally {
      setPasskeyLoading(false);
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResendMessage("");
    props.onClearNotice?.();
    try {
      const form = e.currentTarget as HTMLFormElement | null;
      const formData = form ? new FormData(form) : null;
      const submittedEmail = String(formData?.get("email") ?? email()).trim();
      const submittedPassword = String(formData?.get("password") ?? password());
      const submittedDisplayName = String(formData?.get("display_name") ?? displayName()).trim();
      const data = await authenticateWithPassword({
        mode: tab() === "signin" ? "login" : "register",
        email: submittedEmail,
        password: submittedPassword,
        display_name: tab() === "signup" ? submittedDisplayName : undefined,
      });
      if (data.requires_2fa) {
        setError(
          passkeySupported()
            ? "Two-factor authentication is required for this account. Use passkey sign-in with your account email on this device."
            : "Two-factor authentication is required for this account, but this browser does not support the available passkey flow.",
        );
        return;
      }
      if (false && data.requires_2fa) {
        setError("Two-factor authentication required — not yet supported in the web UI. Please use the CLI or contact support.");
        return;
      }
      if (data.verification_required) {
        setTab("signin");
        setEmail(submittedEmail);
        setPassword("");
        const serverMessage = data.message || "";
        const message = /if this email can be registered|if that email can/i.test(serverMessage)
          ? `Check ${submittedEmail} for a verification link, then sign in.`
          : serverMessage || `Check ${submittedEmail} for a verification link, then sign in.`;
        // Do not tell someone to wait for an email when the server has already
        // reported that its delivery attempt failed.
        const deliveryUnavailable = /could not send a confirmation email/i.test(message);
        setPendingVerificationEmail(deliveryUnavailable ? "" : submittedEmail);
        setError(message);
        return;
      }
      setEmail(submittedEmail);
      setPassword(submittedPassword);
      if (tab() === "signup") setDisplayName(submittedDisplayName);
      completeAuth(data);
    } catch (err) {
      const msg = visibleErrorText(err, "");
      const isNetwork = !msg || msg.toLowerCase().includes("networkerror") || msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("load failed");
      setError(isNetwork
        ? "We couldn't connect to OmnyID. Check your connection and try again."
        : msg || "Authentication failed — check credentials");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerificationEmail() {
    const targetEmail = pendingVerificationEmail().trim() || email().trim();
    if (!targetEmail || resendLoading()) return;
    setResendLoading(true);
    setResendMessage("");
    setError("");
    try {
      const data = await resendVerificationEmailRequest(targetEmail);
      setResendMessage(
        data.message && !/if (?:this|that) email can/i.test(data.message)
          ? data.message
          : `A new verification link has been sent to ${targetEmail}.`,
      );
    } catch (err) {
      setError(visibleErrorText(err, "Could not resend verification email right now."));
    } finally {
      setResendLoading(false);
    }
  }

  onMount(() => {
    let disposed = false;

    async function setupGoogleAuth() {
      setGoogleLoading(true);
      setGoogleError("");
      try {
        const clientId = await fetchGoogleAuthClientId();
        if (disposed || !googleButtonHost) return;
        await mountGoogleSignInButton({
          clientId,
          container: googleButtonHost,
          onCredential: submitGoogleIdToken,
        });
        if (disposed) return;
        setGoogleReady(true);
      } catch (err) {
        if (disposed) return;
        setGoogleError(visibleErrorText(err, "Google sign-in is unavailable right now."));
      } finally {
        if (!disposed) setGoogleLoading(false);
      }
    }

    void setupGoogleAuth();
    onCleanup(() => {
      disposed = true;
    });
  });

  return (
    <DialogShell
      labelledBy="auth-modal-title" focusableSelector="button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      overlayClass="fixed inset-0 z-[200] flex items-center justify-center bg-on-surface/30 backdrop-blur-sm animate-fade-in" dialogClass="relative w-full max-w-sm rounded-3xl border border-white/45 bg-white/96 p-6 shadow-panel backdrop-blur-xl"
      onClose={props.onClose}
    >
        <button
          type="button"
          onClick={props.onClose}
          class="absolute right-2 top-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-black/5 hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="Close"
        >×</button>
        <p id="auth-modal-title" class="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant mb-4">OmnyID account</p>
        <div class="mb-5 flex rounded-xl border border-white/40 bg-white/40 p-0.5">
          <button
            type="button"
            onClick={() => { setTab("signin"); setError(""); setPendingVerificationEmail(""); setResendMessage(""); setForgotMode(false); setForgotMessage(""); props.onClearNotice?.(); }}
            class={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${tab() === "signin" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
          >Sign in</button>
          <button
            type="button"
            onClick={() => { setTab("signup"); setError(""); setPendingVerificationEmail(""); setResendMessage(""); setForgotMode(false); setForgotMessage(""); props.onClearNotice?.(); }}
            class={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${tab() === "signup" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
          >Create account</button>
        </div>
        <Show when={props.resetToken}>
          <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-outline mb-4">Set a new password</p>
          <Show
            when={!resetDone()}
            fallback={
              <div class="space-y-3">
                <p class="rounded-lg border border-emerald-200/70 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-800">
                  Your password has been reset. All existing sessions were signed out for safety — sign in below with your new password.
                </p>
                <button
                  type="button"
                  onClick={() => { setTab("signin"); props.onResetTokenConsumed?.(); }}
                  class="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary/80"
                >Go to sign in</button>
              </div>
            }
          >
            <form onSubmit={submitResetPassword} class="space-y-3">
              <input
                type="password"
                id="reset-new-password"
                name="new_password"
                required
                autocomplete="new-password" aria-label="New password"
                placeholder="New password (8+ chars)"
                value={resetNewPassword()}
                onInput={(e) => setResetNewPassword(e.currentTarget.value)}
                class="w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-sm text-on-surface outline-none focus:border-primary/50 transition"
              />
              <Show when={resetError()}>
                <p class="rounded-lg border border-red-200/60 bg-red-50/80 px-3 py-2 text-xs text-red-700">{resetError()}</p>
              </Show>
              <button
                type="submit"
                disabled={resetLoading()}
                class="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary/80 disabled:opacity-60"
              >
                {resetLoading() ? "Resetting…" : "Reset password"}
              </button>
            </form>
          </Show>
        </Show>
        <Show when={!props.resetToken && forgotMode()}>
          <form onSubmit={submitForgotPassword} class="space-y-3">
            <p class="text-xs text-on-surface-variant/70">
              Enter your account email and we'll send you a link to reset your password.
            </p>
            <input
              type="email"
              id="forgot-email"
              name="email"
              required
              autocomplete="email" aria-label="Account email"
              placeholder="Email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              class="w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-sm text-on-surface outline-none focus:border-primary/50 transition"
            />
            <Show when={forgotMessage()}>
              <p class="rounded-lg border border-emerald-200/70 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-800">
                {forgotMessage()}
              </p>
            </Show>
            <button
              type="submit"
              disabled={forgotLoading()}
              class="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary/80 disabled:opacity-60"
            >
              {forgotLoading() ? "Sending…" : "Send reset link"}
            </button>
            <button
              type="button"
              onClick={() => { setForgotMode(false); setForgotMessage(""); }}
              class="w-full text-center text-xs text-on-surface-variant/70 hover:text-on-surface"
            >← Back to sign in</button>
          </form>
        </Show>
        <Show when={!props.resetToken && !forgotMode()}>
        <div class="mb-4 space-y-2">
          <div
            ref={(el) => { googleButtonHost = el; }}
            class={`min-h-[44px] rounded-2xl transition ${googleReady() ? "" : "border border-white/30 bg-white/45"}`}
          />
          <AppleSignInButton onAuthenticated={completeAuth} />
          <Show when={googleLoading()}>
            <p class="text-center text-xs text-on-surface-variant/70">Loading Google sign-in...</p>
          </Show>
          <Show when={googleError()}>
            <p class="rounded-lg border border-amber-200/70 bg-amber-50/90 px-3 py-2 text-xs text-amber-800">
              {googleError()}
            </p>
          </Show>
          <div class="flex items-center gap-3 pt-1">
            <div class="h-px flex-1 bg-white/40" />
            <span class="font-mono text-[10px] uppercase tracking-[0.16em] text-outline">or continue with email</span>
            <div class="h-px flex-1 bg-white/40" />
          </div>
        </div>
        <form onSubmit={submit} class="space-y-3">
          <Show when={props.notice}>
            {(notice) => (
              <p class={`rounded-lg px-3 py-2 text-xs ${
                notice().tone === "success"
                  ? "border border-emerald-200/70 bg-emerald-50/90 text-emerald-800"
                  : "border border-amber-200/70 bg-amber-50/90 text-amber-800"
              }`}>
                {notice().text}
              </p>
            )}
          </Show>
          <Show when={tab() === "signup"}>
            <input
              type="text"
              id="signup-display-name"
              name="display_name" aria-label="Display name (optional)"
              placeholder="Display name (optional)"
              value={displayName()}
              onInput={(e) => setDisplayName(e.currentTarget.value)}
              class="w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-sm text-on-surface outline-none focus:border-primary/50 transition"
            />
          </Show>
          <input
            type="email"
            id="auth-email"
            name="email"
            required
            autocomplete="email" aria-label="Account email"
            placeholder="Email"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            class="w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-sm text-on-surface outline-none focus:border-primary/50 transition"
          />
          <input
            type="password"
            id="auth-password"
            name="password"
            required
            autocomplete={tab() === "signin" ? "current-password" : "new-password"} aria-label={tab() === "signin" ? "Password" : "Create a password"}
            placeholder="Password (8+ chars)"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            class="w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-sm text-on-surface outline-none focus:border-primary/50 transition"
          />
          <Show when={tab() === "signin"}>
            <button
              type="button"
              onClick={() => { setForgotMode(true); setError(""); setForgotMessage(""); setEmail(email().trim()); }}
              class="-mt-1 block text-left text-xs text-primary/80 hover:text-primary"
            >Forgot password?</button>
          </Show>
          <Show when={error()}>
            <p class="rounded-lg border border-red-200/60 bg-red-50/80 px-3 py-2 text-xs text-red-700">{error()}</p>
          </Show>
          <Show when={pendingVerificationEmail()}>
            <div class="rounded-lg border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
              <p>
                Waiting for a verification email at <span class="font-medium">{pendingVerificationEmail()}</span>.
              </p>
              <div class="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  disabled={resendLoading()}
                  onClick={() => void resendVerificationEmail()}
                  class="rounded-full bg-white px-3 py-1 font-semibold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resendLoading() ? "Sending..." : "Resend verification email"}
                </button>
                <Show when={resendMessage()}>
                  <span class="text-[11px] text-amber-900/80">{resendMessage()}</span>
                </Show>
              </div>
            </div>
          </Show>
          <button
            type="submit"
            disabled={loading()}
            class="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary/80 disabled:opacity-60"
          >
            {loading() ? "Please wait…" : tab() === "signin" ? "Sign in" : "Create account"}
          </button>
          <Show when={tab() === "signin" && passkeySupported()}>
            <button type="button" onClick={() => void submitPasskey()} disabled={loading() || passkeyLoading()} class="w-full rounded-xl border border-primary/20 bg-primary/8 px-4 py-2.5 text-sm font-medium text-primary transition hover:border-primary/35 hover:bg-primary/12 disabled:cursor-not-allowed disabled:opacity-60">
              {passkeyLoading() ? "Waiting for passkey..." : "Sign in with passkey"}
            </button>
          </Show>
        </form>
        </Show>
        <p class="mt-4 text-center text-[11px] text-on-surface-variant/50">
          Your account data stays private.
        </p>
    </DialogShell>
  );
}

function HomeWorkspaceFallback(props: { label: string; compact?: boolean }) {
  return (
    <div
      class={
        props.compact
          ? "rounded-2xl border border-white/30 bg-white/35 px-4 py-3 text-xs text-on-surface-variant"
          : "rounded-3xl border border-white/30 bg-white/35 px-5 py-4 text-sm text-on-surface-variant shadow-card"
      }
    >
      Loading {props.label}...
    </div>
  );
}

export default App;
