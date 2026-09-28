import { For, Show, Suspense, createEffect, createMemo, createSignal, lazy, onCleanup, onMount } from "solid-js";
import { VoiceInput } from "../lib/voiceInput";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { applySearchBooleanMode, type SearchBooleanMode } from "@/lib/searchBooleanMode";
import {
  clearRecentSearchQueries,
  clearSessionSearchHistory,
  loadRecentSearchQueries,
  loadSearchBooleanModePreference,
  loadSearchEnginePreference,
  loadSearchOptimizationMode,
  loadSearchSelectHintSeen,
  loadSessionSearchHistory,
  saveRecentSearchQuery,
  saveSearchBooleanModePreference,
  saveSearchEnginePreference,
  saveSearchOptimizationMode,
  saveSearchSelectHintSeen,
  saveSessionSearchHistory,
} from "@/lib/searchBarLocalState";
import {
  defaultSavedSearchName,
  filterSavedSearches,
  loadSavedSearches,
  parseSavedSearchSlashQuery,
  saveSavedSearches,
  type SavedSearchEntry,
  upsertSavedSearch,
} from "@/lib/savedSearches";
import {
  DEFAULT_STUDENT_ONBOARDING_QUICK_START,
  selectStudentAttachmentQuickStartForFiles,
  studentQuickStartForIntent,
  type OnboardingQuickStartSeed,
} from "@/lib/onboardingQuickStart";
import { buildStudyImmediateValuePlan } from "@/lib/studyImmediateValue";
import { buildStudyComposerGuidance } from "@/lib/studyComposerGuidance";
import { buildStudyFirstRunState } from "@/lib/studyFirstRunState";
import { buildStudyFirstRunValuePathState } from "@/lib/studyFirstRunValuePathState";
import { buildStudyFirstSessionFastLaneState } from "@/lib/studyFirstSessionFastLaneState";
import { buildStudyPromptPathState } from "@/lib/studyPromptPathState";
import { buildStudyAttachmentPlanState } from "@/lib/studyAttachmentPlanState";
import { selectAdaptiveStudyAttachmentQuickStart } from "@/lib/studyAttachmentAdaptiveQuickStart";
import { buildStudyBatchNextActionState } from "@/lib/studyBatchNextActionState";
import { buildStudySessionKickoffState } from "@/lib/studySessionKickoffState";
import { buildStudySourceMixState } from "@/lib/studySourceMixState";
import { buildStudyUploadReadinessState } from "@/lib/studyUploadReadinessState";
import { buildStudyWorkspaceLaunchState } from "@/lib/studyWorkspaceLaunchState";
import { buildStudyZeroStateStarterState } from "@/lib/studyZeroStateStarterState";
import { buildStudyQuickStartChoiceState } from "@/lib/studyQuickStartChoiceState";
import { buildStudyAttachmentPolicyPresetState } from "@/lib/studyAttachmentPolicyPresetState";
import { studyLaunchMetadataFromQuickStartSeed } from "@/lib/studyLaunchMetadataState";
import { buildAttachmentRetentionDecisionState } from "@/lib/attachmentRetentionDecisionState";
import { buildAttachmentCapabilityState } from "@/lib/attachmentCapabilityState";
import { buildStudentStudyOutcomeState } from "@/lib/studentStudyOutcomeState";
import { buildAttachmentPolicyMomentState } from "@/lib/attachmentPolicyMomentState";
import { buildStudyAttachmentSetupSnapshotState } from "@/lib/studyAttachmentSetupSnapshotState";
import {
  ATTACHMENT_RETENTION_OPTIONS,
  KNOWLEDGE_MODE_OPTIONS,
  attachmentRetentionOutcome,
  attachmentRetentionSummary,
  combinedKnowledgePolicySummary,
  knowledgeModeSummary,
} from "@/lib/knowledgeIngestPolicy";
import type {
  AttachmentIngestCapabilities,
  AttachmentRetentionMode,
  KnowledgeOrganizationMode,
  SearchSubmitPayload,
} from "@/lib/api";
import { summarizeKnowledgeAttachmentSupport } from "@/lib/knowledgeAttachmentSupportSummary";
import { TiptapEditor } from "./editor/TiptapEditor";
import type { TiptapEditorHandle, TiptapEditorKeyContext } from "./editor/tiptapEditorTypes";

const PLACEHOLDERS = [
  "Hi! I'm your master agent. What would you like me to do today?",
  "Try: 'Summarise my emails from today'",
  "Try: 'What did I learn this week?'",
  "Try: 'Remind me to follow up with Alex tomorrow'",
  "Try: 'Find everything I saved about machine learning'",
  "Try: 'Help me start planning my wedding'",
];

const RECENT_KEY = "omnyid.search.recent";
const SELECT_HINT_KEY = "omnyid.search.select_hint_seen";
const OPT_MODE_KEY = "omnyid.search.optmode";
const ENGINE_KEY = "omnyid.search.engine";
const SESSION_HIST_KEY = "omnyid.search.session_hist";
const SAVED_SEARCH_KEY = "omnyid.search.saved";
const BOOLEAN_MODE_KEY = "omnyid.search.boolean_mode";
const LazyFileAttachmentStrip = lazy(() =>
  import("./FileAttachmentStrip").then((m) => ({ default: m.FileAttachmentStrip })),
);

const SLASH_COMMANDS = [
  { cmd: "/sync",        icon: "↻",  label: "Sync",        desc: "Reload all data from relay" },
  { cmd: "/backup",      icon: "💾", label: "Backup",       desc: "Export search history to JSON" },
  { cmd: "/purge-cache", icon: "🗑",  label: "Purge cache", desc: "Clear all local history" },
  { cmd: "/theme-dark",  icon: "🌙", label: "Dark theme",   desc: "Add dark class to document" },
  { cmd: "/theme-light", icon: "☀️", label: "Light theme",  desc: "Remove dark class" },
] as const;

const EXTRA_SLASH_COMMANDS = [
  { cmd: "/search saved", icon: "*", label: "Saved searches", desc: "Recall a named saved search" },
] as const;

const SMART_TEMPLATES: Array<(q: string) => string> = [
  (q) => `Summarise ${q}`,
  (q) => `Find everything I know about ${q}`,
  (q) => `Research and report on ${q}`,
  (q) => `Write a note about ${q}`,
  (q) => `Remind me about ${q}`,
];

const SEARCH_OPERATORS = [
  { label: "from:", example: "from:alex", desc: "Messages or notes tied to a sender or contact." },
  { label: "tag:", example: "tag:#launch", desc: "Items linked to a supertag or hashtag." },
  { label: "after:", example: "after:2026-06-01", desc: "Results created after a date." },
  { label: "before:", example: "before:2026-07-01", desc: "Results created before a date." },
  { label: "type:", example: "type:email", desc: "Restrict to email, task, note, or calendar items." },
  { label: "is:unread", example: "is:unread", desc: "Show unread or unresolved items first." },
] as const;

function quickStartTimeToValue(seed: OnboardingQuickStartSeed): string {
  return seed.timeToValueLabel ?? "Useful study output in the first run";
}

function quickStartPanelLabel(seed: OnboardingQuickStartSeed): string {
  if (seed.flowKind === "adjacent_source_planning") return "Next Source Plan";
  if (seed.flowKind === "grounded_followup") return "Grounded Follow-Up";
  return "First Study Result";
}

function quickStartBannerLabel(seed: OnboardingQuickStartSeed): string {
  if (seed.flowKind === "adjacent_source_planning") return "Student next-source plan";
  if (seed.flowKind === "grounded_followup") return "Student follow-up";
  return "Student quick start";
}

function quickStartAttachmentButtonLabel(seed: OnboardingQuickStartSeed): string {
  if (seed.flowKind === "adjacent_source_planning") return "Attach next source";
  if (seed.flowKind === "grounded_followup") return "Add related source";
  return "Add study files";
}

function quickStartOutputs(seed: OnboardingQuickStartSeed): string[] {
  if ((seed.firstOutputs?.length ?? 0) > 0) return seed.firstOutputs!;
  return [
    "A grounded answer based on the attached study material",
    "Clearer next steps so the student knows what to do next",
    "Retained study memory that stays searchable after the run",
  ];
}

export function SearchBar(props: {
  busy?: boolean;
  focusTrigger?: number;
  resultCount?: number | null;
  resultCountVisible?: boolean;
  userId?: string;
  attachmentCapabilities?: AttachmentIngestCapabilities | null;
  composerSeed?: (OnboardingQuickStartSeed & { id: number }) | null;
  studyLensEnabled?: boolean;
  onSubmit: (payload: SearchSubmitPayload) => void | Promise<void>;
}) {
  const rKey = () => props.userId ? `${RECENT_KEY}.${props.userId}` : RECENT_KEY;
  const oKey = () => props.userId ? `${OPT_MODE_KEY}.${props.userId}` : OPT_MODE_KEY;
  const eKey = () => props.userId ? `${ENGINE_KEY}.${props.userId}` : ENGINE_KEY;
  const shKey = () => props.userId ? `${SESSION_HIST_KEY}.${props.userId}` : SESSION_HIST_KEY;
  const ssKey = () => accountScopedStorageKey(SAVED_SEARCH_KEY, props.userId);
  const legacySavedSearchKeys = () =>
    props.userId
      ? [`${SAVED_SEARCH_KEY}.${props.userId}`, SAVED_SEARCH_KEY]
      : [];
  const bmKey = () => props.userId ? `${BOOLEAN_MODE_KEY}.${props.userId}` : BOOLEAN_MODE_KEY;
  const [query, setQuery] = createSignal("");
  const [engine, setEngine] = createSignal(loadSearchEnginePreference(eKey()));
  const [optMode, setOptMode] = createSignal(loadSearchOptimizationMode(oKey()));
  const [placeholderIdx, setPlaceholderIdx] = createSignal(0);
  const [focused, setFocused] = createSignal(false);
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [recentQueries, setRecentQueries] = createSignal<string[]>(loadRecentSearchQueries(rKey()));
  const [submitted, setSubmitted] = createSignal(false);
  const [submitFailed, setSubmitFailed] = createSignal(false);
  const [submitErrorMsg, setSubmitErrorMsg] = createSignal("");
  const [sessionHistory, setSessionHistory] = createSignal<string[]>(
    loadSessionSearchHistory(shKey())
  );
  const [historyRecallIdx, setHistoryRecallIdx] = createSignal(-1);
  const [historyRecallDraft, setHistoryRecallDraft] = createSignal("");
  const [showSelectHint, setShowSelectHint] = createSignal(false);
  const [recentClearPending, setRecentClearPending] = createSignal(false);
  const [selectFocused, setSelectFocused] = createSignal(false);
  const [arrowNavIdx, setArrowNavIdx] = createSignal(-1);
  const [rerunMode, setRerunMode] = createSignal<string>(loadSearchOptimizationMode(oKey()));
  const MODES = ["balanced", "speed", "cost"] as const;
  const MODE_LABELS: Record<string, string> = { balanced: "B", speed: "P", cost: "C" };
  const MODE_TITLES: Record<string, string> = { balanced: "Balanced", speed: "Power", cost: "Cheap" };
  function cycleRerunMode() { setRerunMode((m) => MODES[(MODES.indexOf(m as typeof MODES[number]) + 1) % MODES.length]); }
  const [showOperators, setShowOperators] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [showSaveSearch, setShowSaveSearch] = createSignal(false);
  const [saveSearchName, setSaveSearchName] = createSignal("");
  const [savedSearches, setSavedSearches] = createSignal<SavedSearchEntry[]>(
    loadSavedSearches(ssKey(), legacySavedSearchKeys()),
  );
  const [booleanMode, setBooleanMode] = createSignal<SearchBooleanMode>(
    (() => {
      return loadSearchBooleanModePreference(bmKey());
    })(),
  );
  const [attachToast, setAttachToast] = createSignal<string | null>(null);
  const [attachedFiles, setAttachedFiles] = createSignal<File[]>([]);
  const [attachmentRetentionMode, setAttachmentRetentionMode] =
    createSignal<AttachmentRetentionMode>("keep_extracted_only");
  const [knowledgeOrganizationMode, setKnowledgeOrganizationMode] =
    createSignal<KnowledgeOrganizationMode>("connected_notes");
  const [composerNotice, setComposerNotice] = createSignal<string | null>(null);
  const [composerHelper, setComposerHelper] = createSignal<string | null>(null);
  const [activeQuickStart, setActiveQuickStart] = createSignal<OnboardingQuickStartSeed | null>(null);
  const [lastAutoQuickStartQuery, setLastAutoQuickStartQuery] = createSignal<string | null>(null);
  const [appliedComposerSeedId, setAppliedComposerSeedId] = createSignal<number | null>(null);
  const [dragActive, setDragActive] = createSignal(false);
  const [isListening, setIsListening] = createSignal(false);
  const [voiceHealth, setVoiceHealth] = createSignal<"ready" | "degraded">("ready");
  const [pendingEditorText, setPendingEditorText] = createSignal("");
  const attachmentSupportSummary = createMemo(() =>
    summarizeKnowledgeAttachmentSupport(attachedFiles(), props.attachmentCapabilities),
  );
  const studyPlanSeed = createMemo(() => activeQuickStart() ?? DEFAULT_STUDENT_ONBOARDING_QUICK_START);
  const studyImmediateValuePlan = createMemo(() =>
    buildStudyImmediateValuePlan({
      attachedCount: attachedFiles().length,
      supportedCount: attachmentSupportSummary().supportedFiles.length,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
      valuePromise: studyPlanSeed().valuePromise,
      flowKind: studyPlanSeed().flowKind,
    }),
  );
  const studyComposerGuidance = createMemo(() =>
    buildStudyComposerGuidance({
      attachedCount: attachedFiles().length,
      supportedCount: attachmentSupportSummary().supportedFiles.length,
      unsupportedCount: attachmentSupportSummary().unsupportedCount,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
      quickStartSeed: activeQuickStart(),
    }),
  );
  const studyFirstRunState = createMemo(() =>
    buildStudyFirstRunState({
      attachedCount: attachedFiles().length,
      supportedCount: attachmentSupportSummary().supportedFiles.length,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
      query: query(),
      suggestedPrompt: studyComposerGuidance().suggestedPrompts[0] ?? null,
      flowKind: studyPlanSeed().flowKind,
      preferredKnowledgeMode: studyPlanSeed().knowledgeMode,
    }),
  );
  const studyFirstRunValuePath = createMemo(() =>
    buildStudyFirstRunValuePathState({
      supportedCount: attachmentSupportSummary().supportedFiles.length,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
    }),
  );
  const studyFirstSessionFastLane = createMemo(() =>
    buildStudyFirstSessionFastLaneState({
      quickStartSeed: studyPlanSeed(),
      attachedCount: attachedFiles().length,
      supportedCount: attachmentSupportSummary().supportedFiles.length,
      queryReady: Boolean(query().trim()),
      recommendedSetupReady: studyFirstRunState().recommendedSetupReady,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
    }),
  );
  const studyPromptPaths = createMemo(() =>
    buildStudyPromptPathState({
      quickStartSeed: activeQuickStart(),
      knowledgeMode: knowledgeOrganizationMode(),
      supportedCount: attachmentSupportSummary().supportedFiles.length,
    }),
  );
  const studyAttachmentPlan = createMemo(() =>
    buildStudyAttachmentPlanState({
      files: attachedFiles(),
      capabilities: props.attachmentCapabilities,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
    }),
  );
  const recommendedStudyPath = createMemo(() =>
    studyPromptPaths().options.find((option) => option.recommended) ?? studyPromptPaths().options[0] ?? null,
  );
  const studyBatchNextAction = createMemo(() =>
    buildStudyBatchNextActionState({
      attachedCount: attachedFiles().length,
      supportedCount: attachmentSupportSummary().supportedFiles.length,
      unsupportedCount: attachmentSupportSummary().unsupportedCount,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
      recommendedSetupReady: studyFirstRunState().recommendedSetupReady,
    }),
  );
  const studySessionKickoff = createMemo(() =>
    buildStudySessionKickoffState({
      quickStartSeed: studyPlanSeed(),
      attachedCount: attachedFiles().length,
      supportedCount: attachmentSupportSummary().supportedFiles.length,
      queryReady: Boolean(query().trim()),
      recommendedSetupReady: studyFirstRunState().recommendedSetupReady,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
    }),
  );
  const studySourceMix = createMemo(() =>
    buildStudySourceMixState({
      files: attachedFiles(),
      supportedCount: attachmentSupportSummary().supportedFiles.length,
    }),
  );
  const studyWorkspaceLaunch = createMemo(() =>
    buildStudyWorkspaceLaunchState({
      quickStartSeed: activeQuickStart(),
      attachedCount: attachedFiles().length,
      supportedCount: attachmentSupportSummary().supportedFiles.length,
      recommendedSetupReady: studyFirstRunState().recommendedSetupReady,
      queryReady: Boolean(query().trim()),
    }),
  );
  const studyUploadReadiness = createMemo(() =>
    buildStudyUploadReadinessState({
      quickStartSeed: activeQuickStart(),
      attachedCount: attachedFiles().length,
      capabilities: props.attachmentCapabilities,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
    }),
  );
  const studyZeroState = createMemo(() => buildStudyZeroStateStarterState({ surface: "files" }));
  const studyQuickStartChoices = createMemo(() =>
    buildStudyQuickStartChoiceState({
      activeQuickStart: activeQuickStart(),
    }),
  );

  function starterToneClass(tone: "violet" | "sky" | "emerald" | "amber"): string {
    if (tone === "sky") return "border-sky-200/80 bg-sky-50/90 hover:bg-sky-100";
    if (tone === "emerald") return "border-emerald-200/80 bg-emerald-50/90 hover:bg-emerald-100";
    if (tone === "amber") return "border-amber-200/80 bg-amber-50/90 hover:bg-amber-100";
    return "border-violet-200/80 bg-violet-50/90 hover:bg-violet-100";
  }
  const attachmentPolicyPresetState = createMemo(() =>
    buildStudyAttachmentPolicyPresetState({
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
    }),
  );
  const attachmentRetentionDecision = createMemo(() =>
    buildAttachmentRetentionDecisionState(attachmentRetentionMode()),
  );
  const attachmentPolicyMoment = createMemo(() =>
    buildAttachmentPolicyMomentState({
      attachedCount: attachedFiles().length,
      readableCount: attachmentSupportSummary().supportedFiles.length,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
    }),
  );
  const attachmentCapability = createMemo(() =>
    buildAttachmentCapabilityState({
      files: attachedFiles(),
      capabilities: props.attachmentCapabilities,
      retentionMode: attachmentRetentionMode(),
      knowledgeMode: knowledgeOrganizationMode(),
    }),
  );
  const studyAttachmentSetupSnapshot = createMemo(() =>
    buildStudyAttachmentSetupSnapshotState({
      attachedCount: attachedFiles().length,
      readableCount: attachmentSupportSummary().supportedFiles.length,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
      queryReady: Boolean(query().trim()),
    }),
  );
  const studentStudyOutcome = createMemo(() =>
    buildStudentStudyOutcomeState({
      attachedCount: attachedFiles().length,
      supportedCount: attachmentSupportSummary().supportedFiles.length,
      knowledgeMode: knowledgeOrganizationMode(),
      retentionMode: attachmentRetentionMode(),
      query: query(),
      suggestedPrompt: studyFirstRunState().suggestedPrompt,
      quickStartSeed: studyPlanSeed(),
    }),
  );
  // Web Speech API requires HTTPS (localhost is exempt)
  const micUnavailable = () =>
    typeof window !== "undefined" &&
    window.location.protocol !== "https:" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";
  let recentClearTimer: ReturnType<typeof setTimeout> | undefined;
  let editorHandle: TiptapEditorHandle | undefined;
  let formRef: HTMLFormElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;
  let operatorsRef: HTMLDivElement | undefined;
  let settingsRef: HTMLDivElement | undefined;
  let saveSearchRef: HTMLDivElement | undefined;
  let voiceInstance: VoiceInput | null = null;

  function targetIsInteractive(node: EventTarget | null): boolean {
    return node instanceof HTMLElement
      && Boolean(node.closest("button, input, textarea, select, a, [role='button'], [role='radio'], [role='switch'], [contenteditable='true']"));
  }

  function focusSearchInput() {
    editorHandle?.focus();
  }

  function setEditorQuery(text: string) {
    setQuery(text);
    setPendingEditorText(text);
    editorHandle?.setPlainText(text);
  }

  function clearAttachmentDrivenComposerState(clearQuery: boolean) {
    if (clearQuery) setEditorQuery("");
    setComposerNotice(null);
    setComposerHelper(null);
    setActiveQuickStart(null);
    setLastAutoQuickStartQuery(null);
  }

  function applyQuickStartSeed(seed: OnboardingQuickStartSeed, automatic: boolean) {
    setEditorQuery(seed.query);
    setComposerNotice(seed.notice);
    setComposerHelper(seed.helper);
    setActiveQuickStart(seed);
    setKnowledgeOrganizationMode(seed.knowledgeMode);
    setAttachmentRetentionMode(seed.retentionMode);
    setLastAutoQuickStartQuery(automatic ? seed.query : null);
  }

  function maybeApplyAttachmentQuickStart(nextFiles: File[]) {
    if (nextFiles.length === 0) {
      const currentQuery = query().trim();
      const previousAutoQuery = lastAutoQuickStartQuery()?.trim() ?? null;
      if (previousAutoQuery !== null && currentQuery === previousAutoQuery) {
        clearAttachmentDrivenComposerState(true);
      } else {
        clearAttachmentDrivenComposerState(false);
      }
      return;
    }
    const currentQuery = query().trim();
    const previousAutoQuery = lastAutoQuickStartQuery()?.trim() ?? null;
    const canAutoUpdate = !currentQuery || (previousAutoQuery !== null && currentQuery === previousAutoQuery);
    if (!canAutoUpdate) return;
    const starter = selectAdaptiveStudyAttachmentQuickStart({
      files: nextFiles,
      supportedCount: summarizeKnowledgeAttachmentSupport(nextFiles, props.attachmentCapabilities).supportedFiles.length,
      preferredKnowledgeMode: knowledgeOrganizationMode(),
    });
    if (!starter) return;
    applyQuickStartSeed(starter, true);
  }

  function loadRecommendedStudyPrompt() {
    const prompt =
      recommendedStudyPath()?.prompt
      ?? studyFirstRunState().suggestedPrompt
      ?? activeQuickStart()?.query
      ?? query()
      ?? "";
    if (!prompt.trim()) return;
    setHistoryRecallIdx(-1);
    setHistoryRecallDraft("");
    setArrowNavIdx(-1);
    setEditorQuery(prompt);
    requestAnimationFrame(() => editorHandle?.focus());
  }

  function applyRecommendedStudentSetup() {
    setKnowledgeOrganizationMode(studyPlanSeed().knowledgeMode);
    setAttachmentRetentionMode("keep_extracted_only");
  }

  function runStudyComposerAction(
    actionId: "pick_files" | "use_recommended_setup" | "load_prompt" | "run_now" | null | undefined,
  ) {
    if (!actionId) return;
    if (actionId === "pick_files") {
      fileInputRef?.click();
      return;
    }
    if (actionId === "use_recommended_setup") {
      applyRecommendedStudentSetup();
      return;
    }
    if (actionId === "load_prompt") {
      loadRecommendedStudyPrompt();
      return;
    }
    void handleSubmit();
  }

  function normalizeStudyComposerActionId(
    actionId:
      | "pick_files"
      | "use_recommended_setup"
      | "load_prompt"
      | "run_now"
      | "add_supported_file"
      | "load_suggested_prompt"
      | null
      | undefined,
  ): "pick_files" | "use_recommended_setup" | "load_prompt" | "run_now" | null {
    if (actionId === "add_supported_file") return "pick_files";
    if (actionId === "load_suggested_prompt") return "load_prompt";
    return actionId ?? null;
  }

  function applyAttachmentPolicyPreset(input: {
    knowledgeMode: KnowledgeOrganizationMode;
    retentionMode: AttachmentRetentionMode;
    starterIntent?: "first_upload" | "week_summary" | "compare_sources" | "assignment_plan" | "lecture_audio" | "zettelkasten_chain";
  }) {
    setKnowledgeOrganizationMode(input.knowledgeMode);
    setAttachmentRetentionMode(input.retentionMode);
    const currentQuery = query().trim();
    const activeSeedQuery = activeQuickStart()?.query.trim() ?? "";
    const previousAutoQuery = lastAutoQuickStartQuery()?.trim() ?? "";
    const canSyncStarter = !currentQuery || currentQuery === activeSeedQuery || currentQuery === previousAutoQuery;
    if (input.starterIntent && canSyncStarter) {
      applyQuickStartSeed(studentQuickStartForIntent(input.starterIntent), false);
    }
  }

  function clearSearchState() {
    setQuery("");
    setHistoryRecallIdx(-1);
    setHistoryRecallDraft("");
    setArrowNavIdx(-1);
    setShowDropdown(false);
    setShowOperators(false);
    setShowSettings(false);
    setShowSaveSearch(false);
    clearAttachmentDrivenComposerState(false);
    editorHandle?.clear();
  }

  function persistSavedSearches(next: SavedSearchEntry[]) {
    setSavedSearches(saveSavedSearches(ssKey(), next, legacySavedSearchKeys()));
  }

  function selectBooleanMode(mode: SearchBooleanMode) {
    setBooleanMode(saveSearchBooleanModePreference(bmKey(), mode));
  }

  function openSaveSearchPopover() {
    const trimmed = query().trim();
    if (!trimmed) return;
    setShowDropdown(false);
    setShowOperators(false);
    setShowSettings(false);
    setSaveSearchName(defaultSavedSearchName(trimmed));
    setShowSaveSearch(true);
  }

  function saveCurrentSearch() {
    const trimmed = query().trim();
    if (!trimmed) return;
    persistSavedSearches(
      upsertSavedSearch(savedSearches(), saveSearchName(), trimmed, new Date().toISOString()),
    );
    setShowSaveSearch(false);
  }

  function runSavedSearch(entry: SavedSearchEntry) {
    setHistoryRecallIdx(-1);
    setHistoryRecallDraft("");
    setEditorQuery(entry.query);
    setShowDropdown(false);
    setShowSaveSearch(false);
    setShowOperators(false);
    void submitQuery(entry.query);
  }

  function insertOperator(operator: string) {
    const current = query();
    const insertion = current && !current.endsWith(" ") ? ` ${operator}` : operator;
    setHistoryRecallIdx(-1);
    setHistoryRecallDraft("");
    setEditorQuery(`${current}${insertion}`);
    setShowOperators(false);
    requestAnimationFrame(() => focusSearchInput());
  }

  const searchStatusLine = () => {
    const mode =
      optMode() === "speed"
        ? "Power mode prioritizes maximum compute."
        : optMode() === "cost"
          ? "Cheap mode keeps token spend lower."
          : "Balanced mode weighs cost and speed.";
    return `Searching across all vectors. ${mode}`;
  };

  const resultCountLabel = () => {
    const count = props.resultCount;
    if (typeof count !== "number" || Number.isNaN(count)) return null;
    return `${count.toLocaleString()} result${count === 1 ? "" : "s"}`;
  };

  const isSlashMode = () => query().startsWith("/");
  const savedSearchSlashTerm = createMemo(() => parseSavedSearchSlashQuery(query()));
  const savedSearchMatches = createMemo(() => {
    const term = savedSearchSlashTerm();
    return term === null ? [] : filterSavedSearches(savedSearches(), term);
  });
  const slashMatches = () => {
    const q = query().toLowerCase();
    return [...SLASH_COMMANDS, ...EXTRA_SLASH_COMMANDS]
      .filter((c) => c.cmd.startsWith(q) || c.label.toLowerCase().includes(q.slice(1)));
  };
  function executeSlashCommand(cmd: string) {
    if (cmd === "/search saved") {
      setEditorQuery("/search saved ");
      setShowDropdown(true);
      setShowOperators(false);
      setShowSettings(false);
      requestAnimationFrame(() => focusSearchInput());
      return;
    }
    setEditorQuery(""); setShowDropdown(false); setShowOperators(false);
    if (cmd === "/sync") { window.location.reload(); return; }
    if (cmd === "/purge-cache") {
      setRecentQueries(clearRecentSearchQueries(rKey()));
      setSessionHistory(clearSessionSearchHistory(shKey()));
      return;
    }
    if (cmd === "/backup") {
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(new Blob([JSON.stringify({ recent: loadRecentSearchQueries(rKey()), exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" })),
        download: `omnyid-backup-${Date.now()}.json`,
      });
      a.click(); return;
    }
    if (cmd === "/theme-dark") { document.documentElement.classList.add("dark"); return; }
    if (cmd === "/theme-light") { document.documentElement.classList.remove("dark"); }
  }

  function armClear() { setRecentClearPending(true); recentClearTimer = setTimeout(() => setRecentClearPending(false), 3000); }
  function confirmClear() {
    clearTimeout(recentClearTimer);
    setRecentClearPending(false);
    setRecentQueries(clearRecentSearchQueries(rKey()));
  }

  createEffect(() => {
    const t = props.focusTrigger;
    if (t && t > 0) editorHandle?.focus();
  });

  createEffect(() => {
    const seed = props.composerSeed;
    if (!seed || appliedComposerSeedId() === seed.id) return;
    setAppliedComposerSeedId(seed.id);
    applyQuickStartSeed(seed, false);
    setShowDropdown(false);
    requestAnimationFrame(() => editorHandle?.focus());
  });

  createEffect(() => {
    setSavedSearches(loadSavedSearches(ssKey(), legacySavedSearchKeys()));
  });

  createEffect(() => {
    const files = attachedFiles();
    maybeApplyAttachmentQuickStart(files);
  });

  // Debounce query so suggestions don't recompute on every single keystroke.
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  createEffect(() => {
    const q = query();
    const id = setTimeout(() => setDebouncedQuery(q), 300);
    onCleanup(() => clearTimeout(id));
  });

  const smartSuggestions = createMemo(() => {
    const q = debouncedQuery().trim();
    if (q.length < 2) return [];
    const contextual: string[] = [];
    const nounMatch = q.match(/(?:^|\s)([A-Z][a-z]{2,})/);
    if (nounMatch) contextual.push(`What do I know about ${nounMatch[1]}?`);
    if (/\b(today|yesterday|last\s+week|this\s+(?:week|month)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(q)) {
      contextual.push(`Summarise ${q} from my notes and emails`);
    }
    return [...contextual, ...SMART_TEMPLATES.map((fn) => fn(q))].slice(0, 5);
  });

  const timeOfDaySuggestions = createMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return ["Summarise my overnight emails", "What's on my schedule today?", "What did I save yesterday?"];
    if (h >= 12 && h < 17) return ["What's on my calendar this afternoon?", "Any important emails since this morning?", "What am I working on today?"];
    return ["What did I accomplish today?", "Summarise today's activity", "Anything I should follow up on tomorrow?"];
  });

  // Combined ordered list for unified arrow-key navigation and Tab-accept
  const allDropdownSuggestions = createMemo(() => {
    const tod = !debouncedQuery().trim() ? timeOfDaySuggestions() : [];
    return [...tod, ...smartSuggestions(), ...recentQueries()];
  });

  onMount(() => {
    const id = setInterval(() => {
      if (!focused() && !query()) setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 4000);

    function onDocClick(e: MouseEvent) {
      if (formRef && !formRef.contains(e.target as Node)) setShowDropdown(false);
      if (operatorsRef && !operatorsRef.contains(e.target as Node)) setShowOperators(false);
      if (settingsRef && !settingsRef.contains(e.target as Node)) setShowSettings(false);
      if (saveSearchRef && !saveSearchRef.contains(e.target as Node)) setShowSaveSearch(false);
    }
    document.addEventListener("mousedown", onDocClick);

    // Ctrl+Shift+M → toggle mic (respects the same HTTPS guard as the button)
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "M") {
        e.preventDefault();
        if (!micUnavailable()) toggleMic();
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
        if (!query().trim()) return;
        e.preventDefault();
        recordShortcutUse("filter_reset");
        clearSearchState();
        focusSearchInput();
      }
    }
    window.addEventListener("keydown", onKeyDown);

    // Init VoiceInput (dictation-only — no LLM keys configured, so polishing is inactive).
    // The full voice-input-ts library is used for its custom VAD, watchdog restart, and hot
    // word fuzzy correction. All SEC-V-01/02/03 vulnerabilities require LLM config to trigger.
    voiceInstance = new VoiceInput({
      lang: navigator.language || "en-AU",
      vadThreshold: 14,
      silenceThresholdMs: 420,
      contextHint: "productivity workspace command input",
      hotWords: ["AFP", "daemon", "backlink", "curator", "workspace", "blueprint", "orchestrate"],
      onUpdate: (text) => {
        setEditorQuery(text);
      },
      onError: () => {
        setVoiceHealth("degraded");
        setIsListening(false);
      },
    });

    onCleanup(() => {
      clearInterval(id);
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(recentClearTimer);
      clearTimeout(attachToastTimer);
      if (voiceInstance) { voiceInstance.destroy(); voiceInstance = null; }
    });
  });

  function toggleMic() {
    if (!voiceInstance) return;
    if (isListening()) {
      voiceInstance.stop();
      setIsListening(false);
    } else {
      // Set true before start() so that a synchronous onError callback (e.g. when
      // SpeechRecognition is unavailable) can reset it to false via the error handler.
      setIsListening(true);
      voiceInstance.start();
      editorHandle?.focus();
    }
  }

  let attachToastTimer: ReturnType<typeof setTimeout> | undefined;
  function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    const nextFiles = [...attachedFiles(), ...newFiles];
    setAttachedFiles(nextFiles);
    const names = newFiles.map((f) => f.name).join(", ");
    maybeApplyAttachmentQuickStart(nextFiles);
    requestAnimationFrame(() => editorHandle?.focus());
    clearTimeout(attachToastTimer);
    setAttachToast(names);
    attachToastTimer = setTimeout(() => setAttachToast(null), 4000);
    // Reset the input so the same file can be re-selected
    if (fileInputRef) fileInputRef.value = "";
  }

  function hasDraggedFiles(event: DragEvent): boolean {
    return Boolean(event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files"));
  }

  function handleDragEnter(event: DragEvent) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragOver(event: DragEvent) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent) {
    const nextTarget = event.relatedTarget;
    if (formRef && nextTarget instanceof Node && formRef.contains(nextTarget)) return;
    setDragActive(false);
  }

  function handleDrop(event: DragEvent) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDragActive(false);
    handleFileSelect(event.dataTransfer?.files ?? null);
  }

  function pickSuggestion(text: string) {
    setHistoryRecallIdx(-1);
    setHistoryRecallDraft("");
    setEditorQuery(text);
    setShowDropdown(false);
    setShowOperators(false);
  }

  function applyStudentQuickStart(seed: OnboardingQuickStartSeed) {
    setHistoryRecallIdx(-1);
    setHistoryRecallDraft("");
    setArrowNavIdx(-1);
    setEditorQuery(seed.query);
    setComposerNotice(seed.notice);
    setComposerHelper(seed.helper);
    setActiveQuickStart(seed);
    setKnowledgeOrganizationMode(seed.knowledgeMode);
    setAttachmentRetentionMode(seed.retentionMode);
    setShowDropdown(false);
    requestAnimationFrame(() => editorHandle?.focus());
  }

  function recallSessionHistory(direction: "older" | "newer") {
    const history = sessionHistory();
    if (history.length === 0) return false;
    if (direction === "older") {
      if (historyRecallIdx() < 0) setHistoryRecallDraft(query());
      const nextIdx = Math.min(historyRecallIdx() + 1, history.length - 1);
      setHistoryRecallIdx(nextIdx);
      setEditorQuery(history[nextIdx]);
    } else {
      if (historyRecallIdx() < 0) return false;
      const nextIdx = historyRecallIdx() - 1;
      if (nextIdx < 0) {
        setHistoryRecallIdx(-1);
        setEditorQuery(historyRecallDraft());
        setHistoryRecallDraft("");
      } else {
        setHistoryRecallIdx(nextIdx);
        setEditorQuery(history[nextIdx]);
      }
    }
    setShowDropdown(false);
    setArrowNavIdx(-1);
    return true;
  }

  async function submitQuery(q: string, modeOverride?: string) {
    const effectiveQuery = applySearchBooleanMode(q, booleanMode());
    setRecentQueries(saveRecentSearchQuery(q, rKey()));
    setSessionHistory((prev) => {
      return saveSessionSearchHistory([q, ...prev.filter((r) => r !== q)], shKey());
    });
    setHistoryRecallIdx(-1);
    setHistoryRecallDraft("");
    setShowDropdown(false);
    setShowOperators(false);
    try {
      await props.onSubmit({
        query: effectiveQuery,
        engine: engine(),
        optimizationMode: modeOverride ?? optMode(),
        attachments: attachedFiles(),
        attachmentRetentionMode: attachmentRetentionMode(),
        knowledgeOrganizationMode: knowledgeOrganizationMode(),
        studyLaunchMetadata: studyLaunchMetadataFromQuickStartSeed(activeQuickStart()),
      });
      clearAttachmentDrivenComposerState(true);
      setAttachedFiles([]);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 1500);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "Could not submit this request.";
      const msg = rawMessage.toLowerCase();
      const targeted = msg.includes("rate_limit") || msg.includes("rate limit")
        ? "Rate limited — retry in a moment"
        : msg.includes("context_length") || msg.includes("too long") || msg.includes("max_tokens")
          ? "Query too long — try a shorter version"
          : rawMessage;
      setSubmitErrorMsg(targeted);
      setSubmitFailed(true);
      setTimeout(() => { setSubmitFailed(false); setSubmitErrorMsg(""); }, 2000);
    }
  }

  async function handleSubmit() {
    const q = query().trim();
    if (!q) return;
    await submitQuery(q);
  }

  function handleEditorKeyDown(event: KeyboardEvent, context: TiptapEditorKeyContext) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
      return true;
    }
    if (event.key === "Escape") {
      setShowDropdown(false);
      setArrowNavIdx(-1);
      return false;
    }
    const caretAtStart =
      context.editor.state.selection.from === 1 &&
      context.editor.state.selection.to === 1;
    if (
      event.key === "ArrowUp" &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      caretAtStart &&
      !dropdownVisible() &&
      recallSessionHistory("older")
    ) {
      event.preventDefault();
      return true;
    }
    if (
      event.key === "ArrowDown" &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      caretAtStart &&
      historyRecallIdx() >= 0 &&
      !dropdownVisible() &&
      recallSessionHistory("newer")
    ) {
      event.preventDefault();
      return true;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && dropdownVisible()) {
      const all = allDropdownSuggestions();
      if (all.length > 0) {
        event.preventDefault();
        const len = all.length;
        const next = event.key === "ArrowDown"
          ? (arrowNavIdx() + 1) % len
          : ((arrowNavIdx() - 1) + len) % len;
        setArrowNavIdx(next);
        setEditorQuery(all[next]);
        return true;
      }
    }
    if (event.key === "Tab") {
      const highlighted = allDropdownSuggestions()[arrowNavIdx()];
      if (highlighted) {
        event.preventDefault();
        pickSuggestion(highlighted);
        setArrowNavIdx(-1);
        return true;
      }
    }
    return false;
  }

  const dropdownVisible = () =>
    showDropdown() && (
      isSlashMode() ||
      savedSearchSlashTerm() !== null ||
      smartSuggestions().length > 0 ||
      recentQueries().length > 0 ||
      (!query() && timeOfDaySuggestions().length > 0) ||
      (!query() && sessionHistory().length > 0)
    );
  const shouldShowStudentQuickStarts = createMemo(() =>
    Boolean(props.studyLensEnabled) && !query().trim() && attachedFiles().length === 0,
  );

  return (
    <div class="relative w-full">
    <Show when={attachToast()}>
      <div class="animate-fade-in absolute -top-10 left-0 z-50 flex items-center gap-2 rounded-full border border-primary/20 bg-white px-4 py-1.5 text-xs text-on-surface-variant shadow-panel">
        <span class="text-primary">📎</span>
        <span class="max-w-[260px] truncate">{attachToast()}</span>
        <span class="text-on-surface-variant/50">— queued for agent</span>
        <button type="button" onClick={() => setAttachToast(null)} class="ml-1 text-on-surface-variant/40 hover:text-on-surface-variant">✕</button>
      </div>
    </Show>
    <form
      ref={formRef}
      class="relative w-full"
      data-search-host
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div
        class={`flex flex-col rounded-[28px] border relative overflow-hidden transition-colors duration-500 bg-white ${
          dragActive()
            ? "border-primary/60 bg-primary/[0.03]"
            : submitFailed()
              ? "border-red-400/60"
              : submitted()
                ? "border-green-400/60"
                : "border-[#e1e1df]"
        }`}
        style="box-shadow: 0 8px 32px rgba(0,0,0,0.04)"
        onPointerDown={(event) => {
          if (targetIsInteractive(event.target)) return;
          event.preventDefault();
          focusSearchInput();
        }}
      >
        {/* File attachment strip — shown when files are attached */}
        <Show when={dragActive()}>
          <div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/[0.06]">
            <div class="rounded-full border border-primary/25 bg-white/95 px-4 py-2 text-sm font-medium text-primary shadow-panel">
              Drop files to add them to this question
            </div>
          </div>
        </Show>
        <Show when={composerNotice()}>
          <div class="border-b border-[#ecece8] bg-sky-50/75 px-4 py-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                  <p class="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800/85">
                  {quickStartBannerLabel(studyPlanSeed())}
                </p>
                <p class="mt-1 text-sm font-medium text-sky-950">
                  {composerNotice()}
                </p>
                <p class="mt-1 text-xs leading-5 text-sky-900/80">
                  {composerHelper()}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef?.click()}
                  class="rounded-full border border-sky-200/80 bg-white/90 px-3 py-1 text-xs font-medium text-sky-900 transition hover:bg-white"
                >
                  {quickStartAttachmentButtonLabel(studyPlanSeed())}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposerNotice(null);
                    setComposerHelper(null);
                  }}
                  class="rounded-full border border-sky-200/80 bg-white/90 px-3 py-1 text-xs font-medium text-sky-900 transition hover:bg-white"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <div class="mt-3 rounded-2xl border border-sky-200/80 bg-white/85 p-3 shadow-sm">
              <Show when={studyWorkspaceLaunch()}>
                {(launch) => (
                  <div class={`mb-3 rounded-2xl border p-3 shadow-sm ${
                    launch().tone === "emerald"
                      ? "border-emerald-200 bg-emerald-50/80"
                      : launch().tone === "amber"
                        ? "border-amber-200 bg-amber-50/85"
                        : "border-sky-200 bg-sky-50/80"
                  }`}>
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="max-w-3xl">
                        <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          launch().tone === "emerald"
                            ? "text-emerald-800/80"
                            : launch().tone === "amber"
                              ? "text-amber-800/80"
                              : "text-sky-800/80"
                        }`}>
                          First session launch
                        </p>
                        <p class="mt-1 text-sm font-medium text-on-surface">{launch().headline}</p>
                        <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/85">{launch().detail}</p>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => runStudyComposerAction(launch().primaryActionId)}
                          class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white"
                        >
                          {launch().primaryActionLabel}
                        </button>
                        <Show when={launch().secondaryActionLabel}>
                          <button
                            type="button"
                            onClick={() => runStudyComposerAction(launch().secondaryActionId)}
                            class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition hover:bg-white"
                          >
                            {launch().secondaryActionLabel}
                          </button>
                        </Show>
                      </div>
                    </div>
                    <div class="mt-3 space-y-2">
                      <For each={launch().checklist}>
                        {(item, index) => (
                          <div class="flex gap-2 text-xs leading-5 text-on-surface-variant">
                            <span class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/90 text-[11px] font-semibold text-on-surface">
                              {index() + 1}
                            </span>
                            <span>{item}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </Show>
              <Show when={studyFirstSessionFastLane()}>
                {(lane) => (
                  <div class="mt-4 rounded-3xl border border-emerald-200/80 bg-emerald-50/75 p-4 shadow-sm">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="max-w-3xl">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/80">
                          First-session fast lane
                        </p>
                        <p class="mt-1 text-sm font-medium text-emerald-950">
                          {lane().headline}
                        </p>
                        <p class="mt-1 text-[11px] leading-5 text-emerald-900/80">
                          {lane().detail}
                        </p>
                      </div>
                      <span class="rounded-full border border-emerald-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-emerald-900">
                        {lane().badge}
                      </span>
                    </div>
                    <div class="mt-3 grid gap-2 md:grid-cols-3">
                      <For each={lane().cards}>
                        {(card) => (
                          <div class={`rounded-2xl border bg-white/90 p-3 shadow-sm ${
                            card.tone === "emerald"
                              ? "border-emerald-200/80"
                              : card.tone === "violet"
                                ? "border-violet-200/80"
                                : card.tone === "amber"
                                  ? "border-amber-200/80"
                                  : "border-sky-200/80"
                          }`}>
                            <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                              card.tone === "emerald"
                                ? "text-emerald-800/80"
                                : card.tone === "violet"
                                  ? "text-violet-800/80"
                                  : card.tone === "amber"
                                    ? "text-amber-800/80"
                                    : "text-sky-800/80"
                            }`}>
                              {card.label}
                            </p>
                            <p class="mt-1 text-xs leading-5 text-on-surface/85">
                              {card.detail}
                            </p>
                          </div>
                        )}
                      </For>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => runStudyComposerAction(lane().primaryActionId)}
                        class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-emerald-950 transition hover:bg-white"
                      >
                        {lane().primaryActionLabel}
                      </button>
                      <Show when={lane().secondaryActionLabel}>
                        <button
                          type="button"
                          onClick={() => runStudyComposerAction(lane().secondaryActionId)}
                          class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-emerald-900 transition hover:bg-white"
                        >
                          {lane().secondaryActionLabel}
                        </button>
                      </Show>
                    </div>
                  </div>
                )}
              </Show>
              <Show when={studyUploadReadiness()}>
                {(readiness) => (
                  <div class={`mb-3 rounded-2xl border p-3 shadow-sm ${
                    readiness().tone === "emerald"
                      ? "border-emerald-200 bg-emerald-50/80"
                      : readiness().tone === "amber"
                        ? "border-amber-200 bg-amber-50/85"
                        : "border-sky-200 bg-sky-50/80"
                  }`}>
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="max-w-3xl">
                        <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          readiness().tone === "emerald"
                            ? "text-emerald-800/80"
                            : readiness().tone === "amber"
                              ? "text-amber-800/80"
                              : "text-sky-800/80"
                        }`}>
                          Upload readiness
                        </p>
                        <p class="mt-1 text-sm font-medium text-on-surface">{readiness().headline}</p>
                        <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/85">{readiness().detail}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef?.click()}
                        class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white"
                      >
                        Choose files
                      </button>
                    </div>
                    <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <div class="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/75">
                          {readiness().recommendedSourceLabel}
                        </p>
                        <p class="mt-1 text-xs leading-5 text-on-surface-variant/85">
                          {readiness().recommendedSourceDetail}
                        </p>
                      </div>
                      <div class="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/75">
                          {readiness().instantFormatsLabel}
                        </p>
                        <p class="mt-1 text-xs leading-5 text-on-surface-variant/85">
                          {readiness().instantFormatsDetail}
                        </p>
                      </div>
                      <div class="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/75">
                          {readiness().serverFormatsLabel}
                        </p>
                        <p class="mt-1 text-xs leading-5 text-on-surface-variant/85">
                          {readiness().serverFormatsDetail}
                        </p>
                      </div>
                      <div class="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/75">
                          {readiness().gapsLabel}
                        </p>
                        <p class="mt-1 text-xs leading-5 text-on-surface-variant/85">
                          {readiness().gapsDetail}
                        </p>
                      </div>
                    </div>
                    <div class="mt-3 rounded-2xl border border-violet-200/80 bg-violet-50/70 p-3 shadow-sm">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/80">
                        Recommended retention
                      </p>
                      <p class="mt-1 text-xs leading-5 text-violet-950/90">
                        {readiness().retentionLabel}
                      </p>
                    </div>
                  </div>
                )}
              </Show>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="max-w-3xl">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800/75">
                    {quickStartPanelLabel(studyPlanSeed())}
                  </p>
                  <p class="mt-1 text-sm font-medium text-sky-950">
                    {studyPlanSeed().label}
                  </p>
                  <p class="mt-1 text-xs leading-5 text-sky-900/80">
                    {studyPlanSeed().description}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2 text-[11px]">
                  <Show when={studyPlanSeed().originLabel}>
                    {(origin) => (
                      <span class="rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 font-medium text-amber-900">
                        {origin()}
                      </span>
                    )}
                  </Show>
                  <span class="rounded-full border border-sky-200/80 bg-sky-50 px-2.5 py-1 font-medium text-sky-900">
                    {studyPlanSeed().knowledgeMode === "zettelkasten" ? "Zettelkasten" : "Connected notes"}
                  </span>
                  <span class="rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-900">
                    {studyPlanSeed().retentionMode === "keep_file"
                      ? "Keep file"
                      : studyPlanSeed().retentionMode === "keep_nothing"
                        ? "Keep nothing"
                        : "Keep extracted notes"}
                  </span>
                </div>
              </div>
              <Show when={(studyPlanSeed().focusBadges?.length ?? 0) > 0}>
                <div class="mt-3 flex flex-wrap gap-2">
                  <For each={studyPlanSeed().focusBadges ?? []}>
                    {(badge) => (
                      <span class="rounded-full border border-violet-200/80 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-900">
                        {badge}
                      </span>
                    )}
                  </For>
                </div>
              </Show>
              <div class="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Do this now</p>
                  <div class="mt-2 space-y-2">
                    <For each={studyPlanSeed().checklist}>
                      {(item, index) => (
                        <div class="flex gap-2 text-xs leading-5 text-slate-700">
                          <span class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-semibold text-sky-800">
                            {index() + 1}
                          </span>
                          <span>{item}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
                <div>
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">After the first run</p>
                  <div class="mt-2 space-y-2">
                    <For each={studyPlanSeed().nextSteps}>
                      {(item) => (
                        <div class="flex gap-2 text-xs leading-5 text-slate-700">
                          <span class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-800">
                            →
                          </span>
                          <span>{item}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
              <div class="mt-3 rounded-2xl border border-violet-200/80 bg-violet-50/70 p-3 shadow-sm">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/80">
                      What you should get back
                    </p>
                    <p class="mt-1 text-sm font-medium text-violet-950">
                      {quickStartTimeToValue(studyPlanSeed())}
                    </p>
                  </div>
                  <span class="rounded-full border border-violet-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-violet-900">
                    {studyPlanSeed().recommendedUpload}
                  </span>
                </div>
                <div class="mt-3 grid gap-2 md:grid-cols-3">
                  <For each={quickStartOutputs(studyPlanSeed()).slice(0, 3)}>
                    {(output) => (
                      <div class="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                        <p class="text-xs leading-5 text-violet-950/90">{output}</p>
                      </div>
                    )}
                  </For>
                </div>
              </div>
              <div class="mt-3 rounded-2xl border border-teal-200/80 bg-teal-50/75 p-3 shadow-sm">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-800/80">
                      What this run does for the student
                    </p>
                    <p class="mt-1 text-sm font-medium text-teal-950">
                      {studentStudyOutcome().headline}
                    </p>
                    <p class="mt-1 text-[11px] leading-5 text-teal-900/80">
                      {studentStudyOutcome().detail}
                    </p>
                  </div>
                  <span class="rounded-full border border-teal-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-teal-900">
                    {studentStudyOutcome().badge}
                  </span>
                </div>
                <div class="mt-3 grid gap-2 md:grid-cols-3">
                  <For each={studentStudyOutcome().cards}>
                    {(card) => (
                      <div class={`rounded-2xl border bg-white/90 p-3 shadow-sm ${
                        card.tone === "emerald"
                          ? "border-emerald-200/80"
                          : card.tone === "violet"
                            ? "border-violet-200/80"
                            : card.tone === "amber"
                              ? "border-amber-200/80"
                              : "border-sky-200/80"
                      }`}>
                        <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          card.tone === "emerald"
                            ? "text-emerald-800/80"
                            : card.tone === "violet"
                              ? "text-violet-800/80"
                              : card.tone === "amber"
                                ? "text-amber-800/80"
                                : "text-sky-800/80"
                        }`}>
                          {card.label}
                        </p>
                        <p class="mt-1 text-xs leading-5 text-on-surface/90">
                          {card.detail}
                        </p>
                      </div>
                    )}
                  </For>
                </div>
                <div class="mt-3 grid gap-2 md:grid-cols-2">
                  <div class="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-800/80">
                      Pressure relief
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface/90">
                      {studentStudyOutcome().pressureReliefLabel}
                    </p>
                  </div>
                  <div class="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-800/80">
                      Best continuation
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface/90">
                      {studentStudyOutcome().continuationLabel}
                    </p>
                  </div>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => runStudyComposerAction(
                      normalizeStudyComposerActionId(studentStudyOutcome().primaryActionId),
                    )}
                    class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white"
                  >
                    {studentStudyOutcome().primaryActionLabel}
                  </button>
                  <Show when={studentStudyOutcome().secondaryActionLabel}>
                    <button
                      type="button"
                      onClick={() => runStudyComposerAction(
                        normalizeStudyComposerActionId(studentStudyOutcome().secondaryActionId),
                      )}
                      class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition hover:bg-white"
                    >
                      {studentStudyOutcome().secondaryActionLabel}
                    </button>
                  </Show>
                </div>
              </div>
              <Show when={studySessionKickoff()}>
                {(state) => (
                  <div class={`mt-3 rounded-2xl border p-3 shadow-sm ${
                    state().tone === "emerald"
                      ? "border-emerald-200 bg-emerald-50/80"
                      : state().tone === "amber"
                        ? "border-amber-200 bg-amber-50/85"
                        : "border-sky-200 bg-sky-50/80"
                  }`}>
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="max-w-3xl">
                        <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          state().tone === "emerald"
                            ? "text-emerald-800/80"
                            : state().tone === "amber"
                              ? "text-amber-800/80"
                              : "text-sky-800/80"
                        }`}>
                          Next 60 seconds
                        </p>
                        <p class="mt-1 text-sm font-medium text-on-surface">{state().headline}</p>
                        <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/85">{state().detail}</p>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => runStudyComposerAction(state().primaryActionId)}
                          class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white"
                        >
                          {state().primaryActionLabel}
                        </button>
                        <Show when={state().secondaryActionLabel}>
                          <button
                            type="button"
                            onClick={() => runStudyComposerAction(state().secondaryActionId)}
                            class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition hover:bg-white"
                          >
                            {state().secondaryActionLabel}
                          </button>
                        </Show>
                      </div>
                    </div>
                    <div class="mt-3 grid gap-2 md:grid-cols-3">
                      <For each={state().steps}>
                        {(step, index) => (
                          <div
                            class={`rounded-2xl border p-3 shadow-sm ${
                              step.status === "complete"
                                ? "border-emerald-200 bg-white/90"
                                : step.status === "current"
                                  ? "border-sky-200 bg-white/90"
                                  : "border-slate-200 bg-slate-50/80"
                            }`}
                          >
                            <div class="flex items-start gap-2">
                              <span
                                class={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                                  step.status === "complete"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : step.status === "current"
                                      ? "bg-sky-100 text-sky-800"
                                      : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {index() + 1}
                              </span>
                              <div>
                                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/75">
                                  {step.label}
                                </p>
                                <p class="mt-1 text-xs leading-5 text-on-surface-variant/80">
                                  {step.detail}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </Show>
              <Show when={studySourceMix()}>
                {(mix) => (
                  <div class={`mt-3 rounded-2xl border p-3 shadow-sm ${
                    mix().tone === "emerald"
                      ? "border-emerald-200 bg-emerald-50/80"
                      : mix().tone === "amber"
                        ? "border-amber-200 bg-amber-50/85"
                        : "border-violet-200 bg-violet-50/80"
                  }`}>
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="max-w-3xl">
                        <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          mix().tone === "emerald"
                            ? "text-emerald-800/80"
                            : mix().tone === "amber"
                              ? "text-amber-800/80"
                              : "text-violet-800/80"
                        }`}>
                          Source mix strength
                        </p>
                        <p class="mt-1 text-sm font-medium text-on-surface">{mix().headline}</p>
                        <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/85">{mix().detail}</p>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (mix().primaryActionId === "pick_files") {
                              fileInputRef?.click();
                              return;
                            }
                            if (mix().primaryActionId === "compare_path") {
                              applyStudentQuickStart(studentQuickStartForIntent("compare_sources"));
                              return;
                            }
                            void handleSubmit();
                          }}
                          class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white"
                        >
                          {mix().primaryActionLabel}
                        </button>
                        <Show when={mix().secondaryActionLabel}>
                          <button
                            type="button"
                            onClick={() => {
                              if (mix().secondaryActionId === "pick_files") {
                                fileInputRef?.click();
                                return;
                              }
                              if (mix().secondaryActionId === "week_path") {
                                applyStudentQuickStart(studentQuickStartForIntent("week_summary"));
                              }
                            }}
                            class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition hover:bg-white"
                          >
                            {mix().secondaryActionLabel}
                          </button>
                        </Show>
                      </div>
                    </div>
                    <div class="mt-3 grid gap-2 md:grid-cols-2">
                      <div class="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/70">
                          Graph outcome
                        </p>
                        <p class="mt-1 text-xs leading-5 text-on-surface-variant/85">
                          {mix().graphOutcome}
                        </p>
                      </div>
                      <div class="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/70">
                          Supertag outcome
                        </p>
                        <p class="mt-1 text-xs leading-5 text-on-surface-variant/85">
                          {mix().supertagOutcome}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Show>
              <div class="mt-3 grid gap-2 md:grid-cols-3">
                <div class="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800/75">
                    First result
                  </p>
                  <p class="mt-1 text-xs leading-5 text-sky-950/90">
                    {studyImmediateValuePlan().firstResultLabel}
                  </p>
                </div>
                <div class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/75">
                    What stays
                  </p>
                  <p class="mt-1 text-xs leading-5 text-emerald-950/90">
                    {studyImmediateValuePlan().retentionLabel}
                  </p>
                </div>
                <div class="rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/75">
                    Why it stays useful
                  </p>
                  <p class="mt-1 text-xs leading-5 text-violet-950/90">
                    {studyImmediateValuePlan().retrievalLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Show>
        <Show when={attachedFiles().length > 0}>
          <Suspense fallback={<div class="px-4 pb-1 pt-0.5 text-[11px] text-on-surface-variant/60">Loading attachments...</div>}>
            <LazyFileAttachmentStrip
              files={attachedFiles()}
              capabilities={props.attachmentCapabilities}
              onRemove={(i) => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))}
            />
          </Suspense>
          <div class="border-t border-[#ecece8] bg-[#fbfbf8] px-4 pb-3 pt-3">
            <div class="rounded-2xl border border-white/80 bg-white/85 p-3 shadow-sm">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="max-w-3xl">
                  <p class="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant/60">
                    Attachment policy
                  </p>
                  <p class="mt-1 text-sm font-medium text-on-surface">
                    What should OmnyID keep from these uploads?
                  </p>
                  <p class="mt-1 text-xs leading-5 text-on-surface-variant/75">
                    Choose how the files should be organized and what stays in account storage after the answer is generated.
                  </p>
                </div>
                <div class="rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary">
                  {combinedKnowledgePolicySummary(
                    knowledgeOrganizationMode(),
                    attachmentRetentionMode(),
                  )}
                </div>
              </div>

              <div class={`mt-3 rounded-2xl border p-3 shadow-sm ${
                studyAttachmentSetupSnapshot().tone === "emerald"
                  ? "border-emerald-200/80 bg-emerald-50/75"
                  : studyAttachmentSetupSnapshot().tone === "violet"
                    ? "border-violet-200/80 bg-violet-50/75"
                    : studyAttachmentSetupSnapshot().tone === "amber"
                      ? "border-amber-200/80 bg-amber-50/80"
                      : "border-sky-200/80 bg-sky-50/75"
              }`}>
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      studyAttachmentSetupSnapshot().tone === "emerald"
                        ? "text-emerald-800/80"
                        : studyAttachmentSetupSnapshot().tone === "violet"
                          ? "text-violet-800/80"
                          : studyAttachmentSetupSnapshot().tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      Setup snapshot before send
                    </p>
                    <p class="mt-1 text-sm font-medium text-on-surface">
                      {studyAttachmentSetupSnapshot().headline}
                    </p>
                    <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/85">
                      {studyAttachmentSetupSnapshot().detail}
                    </p>
                  </div>
                  <span class="rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-on-surface">
                    {studyAttachmentSetupSnapshot().badge}
                  </span>
                </div>
                <div class="mt-3 grid gap-2 md:grid-cols-3">
                  <For each={studyAttachmentSetupSnapshot().cards}>
                    {(card) => (
                      <div class={`rounded-2xl border bg-white/90 p-3 shadow-sm ${
                        card.tone === "emerald"
                          ? "border-emerald-200/80"
                          : card.tone === "violet"
                            ? "border-violet-200/80"
                            : card.tone === "amber"
                              ? "border-amber-200/80"
                              : "border-sky-200/80"
                      }`}>
                        <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          card.tone === "emerald"
                            ? "text-emerald-800/80"
                            : card.tone === "violet"
                              ? "text-violet-800/80"
                              : card.tone === "amber"
                                ? "text-amber-800/80"
                                : "text-sky-800/80"
                        }`}>
                          {card.label}
                        </p>
                        <p class="mt-1 text-xs leading-5 text-on-surface/90">
                          {card.detail}
                        </p>
                      </div>
                    )}
                  </For>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => runStudyComposerAction(studyAttachmentSetupSnapshot().primaryActionId)}
                    class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white"
                  >
                    {studyAttachmentSetupSnapshot().primaryActionLabel}
                  </button>
                  <Show when={studyAttachmentSetupSnapshot().secondaryActionLabel}>
                    <button
                      type="button"
                      onClick={() => runStudyComposerAction(studyAttachmentSetupSnapshot().secondaryActionId)}
                      class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition hover:bg-white"
                    >
                      {studyAttachmentSetupSnapshot().secondaryActionLabel}
                    </button>
                  </Show>
                </div>
              </div>

              <Show when={attachmentPolicyMoment()}>
                {(state) => (
                  <div class="mt-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3 shadow-sm">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="max-w-3xl">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/80">
                          Right after upload
                        </p>
                        <p class="mt-1 text-sm font-medium text-emerald-950">
                          {state().headline}
                        </p>
                        <p class="mt-1 text-[11px] leading-5 text-emerald-900/80">
                          {state().detail}
                        </p>
                      </div>
                    </div>
                    <div class="mt-3 grid gap-2 md:grid-cols-3">
                      <For each={state().options}>
                        {(option) => (
                          <button
                            type="button"
                            onClick={() => setAttachmentRetentionMode(option.mode)}
                            class={`rounded-2xl border p-3 text-left shadow-sm transition ${
                              option.selected
                                ? option.tone === "emerald"
                                  ? "border-emerald-300 bg-white/95"
                                  : option.tone === "sky"
                                    ? "border-sky-300 bg-white/95"
                                    : "border-amber-300 bg-white/95"
                                : "border-white/80 bg-white/85 hover:bg-white"
                            }`}
                          >
                            <div class="flex flex-wrap items-start justify-between gap-2">
                              <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/75">
                                {option.shortLabel}
                              </p>
                              <div class="flex flex-wrap gap-1">
                                <Show when={option.recommended}>
                                  <span class="rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                                    Recommended
                                  </span>
                                </Show>
                                <Show when={option.selected}>
                                  <span class="rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                    Selected
                                  </span>
                                </Show>
                              </div>
                            </div>
                            <p class="mt-2 text-xs font-medium text-on-surface/90">
                              {option.label}
                            </p>
                            <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/80">
                              {option.detail}
                            </p>
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </Show>

              <div class="mt-3">
                <div class="rounded-2xl border border-sky-200/80 bg-sky-50/75 p-3">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="max-w-3xl">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800/80">
                        First-run launchpad
                      </p>
                      <p class="mt-1 text-sm font-medium text-sky-950">
                        {studyFirstRunState().headline}
                      </p>
                      <p class="mt-1 text-[11px] leading-5 text-sky-900/80">
                        {studyFirstRunState().supportingText}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-2 text-[11px]">
                      <span class="rounded-full border border-sky-200/80 bg-white/90 px-2.5 py-1 font-medium text-sky-900">
                        {attachmentSupportSummary().supportedFiles.length} readable
                      </span>
                      <span class="rounded-full border border-emerald-200/80 bg-white/90 px-2.5 py-1 font-medium text-emerald-900">
                        {studyFirstRunState().recommendedSetupReady ? "Recommended setup active" : "Setup needs review"}
                      </span>
                    </div>
                  </div>
                  <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <For each={studyFirstRunState().steps}>
                      {(step, index) => (
                        <div
                          class={`rounded-2xl border p-3 shadow-sm ${
                            step.status === "complete"
                              ? "border-emerald-200 bg-emerald-50/80"
                              : step.status === "attention"
                                ? "border-amber-200 bg-amber-50/85"
                                : step.status === "in_progress"
                                  ? "border-sky-200 bg-white/90"
                                  : "border-slate-200 bg-slate-50/80"
                          }`}
                        >
                          <div class="flex items-start gap-2">
                            <span
                              class={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                                step.status === "complete"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : step.status === "attention"
                                    ? "bg-amber-100 text-amber-800"
                                    : step.status === "in_progress"
                                      ? "bg-sky-100 text-sky-800"
                                      : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {index() + 1}
                            </span>
                            <div>
                              <p
                                class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                                  step.status === "complete"
                                    ? "text-emerald-800/80"
                                    : step.status === "attention"
                                      ? "text-amber-800/80"
                                      : step.status === "in_progress"
                                        ? "text-sky-800/80"
                                        : "text-slate-600/80"
                                }`}
                              >
                                {step.label}
                              </p>
                              <p class="mt-1 text-xs leading-5 text-on-surface/85">
                                {step.detail}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <Show when={!studyFirstRunState().recommendedSetupReady}>
                      <button
                        type="button"
                        onClick={() => {
                          setKnowledgeOrganizationMode("connected_notes");
                          setAttachmentRetentionMode("keep_extracted_only");
                        }}
                        class="rounded-full border border-sky-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-sky-900 transition hover:bg-white"
                      >
                        Use recommended setup
                      </button>
                    </Show>
                    <Show when={studyFirstRunState().suggestedPrompt && !studyFirstRunState().suggestedPromptReady}>
                      <button
                        type="button"
                        onClick={() => {
                          const prompt = studyFirstRunState().suggestedPrompt;
                          if (!prompt) return;
                          setHistoryRecallIdx(-1);
                          setHistoryRecallDraft("");
                          setArrowNavIdx(-1);
                          setEditorQuery(prompt);
                          requestAnimationFrame(() => editorHandle?.focus());
                        }}
                        class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-emerald-900 transition hover:bg-white"
                      >
                        Load suggested prompt
                      </button>
                    </Show>
                    <Show when={attachedFiles().length === 1}>
                      <button
                        type="button"
                        onClick={() => fileInputRef?.click()}
                        class="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-violet-900 transition hover:bg-white"
                      >
                        Add one more source
                      </button>
                    </Show>
                  </div>
                </div>
                <div class="mt-4 rounded-2xl border border-violet-200/80 bg-violet-50/75 p-3 shadow-sm">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="max-w-3xl">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/80">
                        Value path after you press send
                      </p>
                      <p class="mt-1 text-sm font-medium text-violet-950">
                        {studyFirstRunValuePath().headline}
                      </p>
                      <p class="mt-1 text-[11px] leading-5 text-violet-900/80">
                        {studyFirstRunValuePath().detail}
                      </p>
                    </div>
                    <span class="rounded-full border border-violet-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-violet-900">
                      {studyFirstRunValuePath().badge}
                    </span>
                  </div>
                  <div class="mt-3 grid gap-2 md:grid-cols-3">
                    <For each={studyFirstRunValuePath().steps}>
                      {(step, index) => (
                        <div
                          class={`rounded-2xl border p-3 shadow-sm ${
                            step.tone === "emerald"
                              ? "border-emerald-200 bg-white/90"
                              : step.tone === "violet"
                                ? "border-violet-200 bg-white/90"
                                : step.tone === "amber"
                                  ? "border-amber-200 bg-white/90"
                                  : "border-sky-200 bg-white/90"
                          }`}
                        >
                          <div class="flex items-start gap-2">
                            <span
                              class={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                                step.tone === "emerald"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : step.tone === "violet"
                                    ? "bg-violet-100 text-violet-800"
                                    : step.tone === "amber"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-sky-100 text-sky-800"
                              }`}
                            >
                              {index() + 1}
                            </span>
                            <div>
                              <p
                                class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                                  step.tone === "emerald"
                                    ? "text-emerald-800/80"
                                    : step.tone === "violet"
                                      ? "text-violet-800/80"
                                      : step.tone === "amber"
                                        ? "text-amber-800/80"
                                        : "text-sky-800/80"
                                }`}
                              >
                                {step.label}
                              </p>
                              <p class="mt-1 text-xs leading-5 text-on-surface/85">
                                {step.detail}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <Show when={attachmentRetentionMode() === "keep_nothing"}>
                      <button
                        type="button"
                        onClick={() => setAttachmentRetentionMode("keep_extracted_only")}
                        class="rounded-full border border-amber-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-amber-900 transition hover:bg-white"
                      >
                        {studyFirstRunValuePath().primaryActionLabel}
                      </button>
                    </Show>
                    <Show when={attachmentRetentionMode() !== "keep_nothing" && knowledgeOrganizationMode() !== "connected_notes"}>
                      <button
                        type="button"
                        onClick={() => setKnowledgeOrganizationMode("connected_notes")}
                        class="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-violet-900 transition hover:bg-white"
                      >
                        Aim for retained connected notes
                      </button>
                    </Show>
                  </div>
                </div>

                <Show when={studyBatchNextAction()}>
                  {(action) => (
                    <div class={`mt-4 rounded-2xl border p-3 shadow-sm ${
                      action().tone === "amber"
                        ? "border-amber-200 bg-amber-50/80"
                        : action().tone === "emerald"
                          ? "border-emerald-200 bg-emerald-50/80"
                          : "border-sky-200 bg-sky-50/80"
                    }`}>
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="max-w-3xl">
                          <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                            action().tone === "amber"
                              ? "text-amber-800/80"
                              : action().tone === "emerald"
                                ? "text-emerald-800/80"
                                : "text-sky-800/80"
                          }`}>
                            Best next action
                          </p>
                          <p class="mt-1 text-sm font-medium text-on-surface">
                            {action().headline}
                          </p>
                          <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/85">
                            {action().detail}
                          </p>
                        </div>
                        <div class="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (action().primaryActionId === "use_recommended_setup") {
                                applyRecommendedStudentSetup();
                                return;
                              }
                              if (action().primaryActionId === "add_supported_file") {
                                fileInputRef?.click();
                                return;
                              }
                              loadRecommendedStudyPrompt();
                            }}
                            class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white"
                          >
                            {action().primaryActionLabel}
                          </button>
                          <Show when={action().secondaryActionLabel}>
                            <button
                              type="button"
                              onClick={() => {
                                if (action().secondaryActionId === "use_recommended_setup") {
                                  applyRecommendedStudentSetup();
                                  return;
                                }
                                if (action().secondaryActionId === "add_supported_file") {
                                  fileInputRef?.click();
                                  return;
                                }
                                loadRecommendedStudyPrompt();
                              }}
                              class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition hover:bg-white"
                            >
                              {action().secondaryActionLabel}
                            </button>
                          </Show>
                        </div>
                      </div>
                    </div>
                  )}
                </Show>

                <div class="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="max-w-3xl">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700/80">
                        Study ingest readiness
                      </p>
                      <p class="mt-1 text-sm font-medium text-slate-950">
                        {attachmentCapability().headline}
                      </p>
                      <p class="mt-1 text-[11px] leading-5 text-slate-700/85">
                        {attachmentCapability().detail}
                      </p>
                    </div>
                    <span class="rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-900">
                      {attachmentCapability().badge}
                    </span>
                  </div>
                  <div class="mt-3 grid gap-2 md:grid-cols-3">
                    <For each={attachmentCapability().cards}>
                      {(card) => (
                        <div
                          class={`rounded-2xl border bg-white/90 p-3 shadow-sm ${
                            card.tone === "emerald"
                              ? "border-emerald-200/80"
                              : card.tone === "sky"
                                ? "border-sky-200/80"
                                : "border-amber-200/80"
                          }`}
                        >
                          <div class="flex items-start justify-between gap-2">
                            <p class="text-xs font-semibold text-on-surface">{card.label}</p>
                            <span
                              class={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                card.tone === "emerald"
                                  ? "bg-emerald-50 text-emerald-800"
                                  : card.tone === "sky"
                                    ? "bg-sky-50 text-sky-800"
                                    : "bg-amber-50 text-amber-800"
                              }`}
                            >
                              {card.count}
                            </span>
                          </div>
                          <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/80">
                            {card.detail}
                          </p>
                        </div>
                      )}
                    </For>
                  </div>
                  <div class="mt-3 grid gap-2 lg:grid-cols-2">
                    <div class="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700/80">
                        {attachmentCapability().supportedFormatsLabel}
                      </p>
                      <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/80">
                        {attachmentCapability().supportedFormatsDetail}
                      </p>
                    </div>
                    <div class="rounded-2xl border border-amber-200/80 bg-white/90 p-3 shadow-sm">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800/85">
                        {attachmentCapability().unsupportedFormatsLabel}
                      </p>
                      <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/80">
                        {attachmentCapability().unsupportedFormatsDetail}
                      </p>
                    </div>
                  </div>
                  <p class="mt-3 text-[11px] leading-5 text-slate-700/80">
                    {attachmentCapability().valueAfterRun}
                  </p>
                </div>

                <div class="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="max-w-3xl">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700/80">
                        Per-file upload plan
                      </p>
                      <p class="mt-1 text-xs font-medium text-slate-950">
                        {studyAttachmentPlan().headline}
                      </p>
                      <p class="mt-1 text-[11px] leading-5 text-slate-700/85">
                        {studyAttachmentPlan().supportingText}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-2 text-[11px]">
                      <span class="rounded-full border border-emerald-200/80 bg-white/90 px-2.5 py-1 font-medium text-emerald-900">
                        {studyAttachmentPlan().readableCount} readable
                      </span>
                      <Show when={studyAttachmentPlan().deferredCount > 0}>
                        <span class="rounded-full border border-sky-200/80 bg-white/90 px-2.5 py-1 font-medium text-sky-900">
                          {studyAttachmentPlan().deferredCount} server read
                        </span>
                      </Show>
                      <Show when={studyAttachmentPlan().skippedCount > 0}>
                        <span class="rounded-full border border-amber-200/80 bg-white/90 px-2.5 py-1 font-medium text-amber-900">
                          {studyAttachmentPlan().skippedCount} skipped
                        </span>
                      </Show>
                    </div>
                  </div>
                  <div class="mt-3 grid gap-2 lg:grid-cols-2">
                    <For each={studyAttachmentPlan().items}>
                      {(item) => (
                        <div
                          class={`rounded-2xl border bg-white/90 p-3 shadow-sm ${
                            item.tone === "emerald"
                              ? "border-emerald-200/80"
                              : item.tone === "sky"
                                ? "border-sky-200/80"
                                : "border-amber-200/80"
                          }`}
                        >
                          <div class="flex flex-wrap items-start justify-between gap-2">
                            <p class="min-w-0 flex-1 truncate text-xs font-semibold text-on-surface">
                              {item.fileName}
                            </p>
                            <span
                              class={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                item.tone === "emerald"
                                  ? "bg-emerald-50 text-emerald-800"
                                  : item.tone === "sky"
                                    ? "bg-sky-50 text-sky-800"
                                    : "bg-amber-50 text-amber-800"
                              }`}
                            >
                              {item.readinessLabel}
                            </span>
                          </div>
                          <div class="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em]">
                            <span class="rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-slate-700">
                              {item.supportLabel}
                            </span>
                            <span class="rounded-full border border-violet-200/80 bg-violet-50 px-2 py-0.5 text-violet-800">
                              {knowledgeOrganizationMode() === "zettelkasten" ? "Zettelkasten" : knowledgeOrganizationMode() === "connected_notes" ? "Connected notes" : "Standard"}
                            </span>
                          </div>
                          <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/85">
                            {item.ingestionLabel}
                          </p>
                          <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/75">
                            {item.retentionLabel}
                          </p>
                          <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/75">
                            {item.organizationLabel}
                          </p>
                          <p class="mt-2 text-[11px] leading-5 text-on-surface/85">
                            {item.nextStepLabel}
                          </p>
                        </div>
                      )}
                    </For>
                  </div>
                </div>

                <div class="mt-4">
                <div class="rounded-2xl border border-emerald-200/80 bg-emerald-50/75 p-3 shadow-sm">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="max-w-3xl">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/80">
                        Pick a storage and organization preset
                      </p>
                      <p class="mt-1 text-sm font-medium text-emerald-950">
                        {attachmentPolicyPresetState().headline}
                      </p>
                      <p class="mt-1 text-[11px] leading-5 text-emerald-900/80">
                        {attachmentPolicyPresetState().detail}
                      </p>
                    </div>
                    <span class="rounded-full border border-emerald-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-emerald-900">
                      {combinedKnowledgePolicySummary(
                        knowledgeOrganizationMode(),
                        attachmentRetentionMode(),
                      )}
                    </span>
                  </div>
                  <div class="mt-3 grid gap-2 xl:grid-cols-4 md:grid-cols-2">
                    <For each={attachmentPolicyPresetState().presets}>
                      {(preset) => (
                        <button
                          type="button"
                          onClick={() => applyAttachmentPolicyPreset({
                            knowledgeMode: preset.knowledgeMode,
                            retentionMode: preset.retentionMode,
                            starterIntent: preset.starterIntent,
                          })}
                          class={`rounded-2xl border p-3 text-left shadow-sm transition ${
                            preset.selected
                              ? preset.tone === "emerald"
                                ? "border-emerald-300 bg-white/95"
                                : preset.tone === "sky"
                                  ? "border-sky-300 bg-white/95"
                                  : preset.tone === "violet"
                                    ? "border-violet-300 bg-white/95"
                                    : "border-amber-300 bg-white/95"
                              : "border-white/80 bg-white/85 hover:bg-white"
                          }`}
                        >
                          <div class="flex items-start justify-between gap-2">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/75">
                              {preset.label}
                            </p>
                            <div class="flex flex-wrap gap-1">
                              <Show when={preset.recommended}>
                                <span class="rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                                  Recommended
                                </span>
                              </Show>
                              <Show when={preset.selected}>
                                <span class="rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                  Selected
                                </span>
                              </Show>
                            </div>
                          </div>
                          <p class="mt-1 text-[11px] font-medium text-on-surface/85">
                            {preset.detail}
                          </p>
                          <p class="mt-2 text-[11px] leading-5 text-on-surface/85">
                            {preset.valueLabel}
                          </p>
                          <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/75">
                            {preset.storageLabel}
                          </p>
                        </button>
                      )}
                    </For>
                  </div>
                  <Show when={attachmentPolicyPresetState().presets.find((preset) => preset.selected)}>
                    {(preset) => (
                      <div class="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => applyStudentQuickStart(studentQuickStartForIntent(preset().starterIntent))}
                          class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white"
                        >
                          Load matching study starter
                        </button>
                        <Show when={preset().starterIntent === "zettelkasten_chain"}>
                          <span class="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-violet-900">
                            Best with one strong reading, lecture, or rough note
                          </span>
                        </Show>
                      </div>
                    )}
                  </Show>
                </div>
                <p class="mt-4 text-[11px] font-medium text-on-surface-variant/70">
                  Organize these uploads as
                </p>
                <div class="mt-2 grid gap-2 md:grid-cols-3">
                  <For each={KNOWLEDGE_MODE_OPTIONS}>
                    {(option) => (
                      <button
                        type="button"
                        onClick={() => setKnowledgeOrganizationMode(option.value)}
                        class={`rounded-2xl border p-3 text-left transition ${
                          knowledgeOrganizationMode() === option.value
                            ? option.value === "zettelkasten"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm"
                              : option.value === "connected_notes"
                                ? "border-sky-300 bg-sky-50 text-sky-950 shadow-sm"
                                : "border-slate-300 bg-slate-50 text-slate-950 shadow-sm"
                            : "border-outline/12 bg-white/70 text-on-surface-variant/85 hover:border-primary/20 hover:bg-white"
                        }`}
                        title={option.description}
                        aria-pressed={knowledgeOrganizationMode() === option.value}
                      >
                        <div class="text-xs font-semibold">{option.label}</div>
                        <div class="mt-1 text-[11px] font-medium opacity-80">{option.title}</div>
                        <div class="mt-1 text-[11px] leading-4 opacity-75">{option.description}</div>
                      </button>
                    )}
                  </For>
                </div>
                <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/70">
                  {knowledgeModeSummary(knowledgeOrganizationMode())}
                </p>
              </div>

              <div class="mt-4">
                <p class="text-[11px] font-medium text-on-surface-variant/70">
                  After I use these files
                </p>
                <div class="mt-2 grid gap-2 md:grid-cols-3">
                  <For each={ATTACHMENT_RETENTION_OPTIONS}>
                    {(option) => (
                      <button
                        type="button"
                        onClick={() => setAttachmentRetentionMode(option.value)}
                        class={`rounded-2xl border p-3 text-left transition ${
                          attachmentRetentionMode() === option.value
                            ? option.value === "keep_nothing"
                              ? "border-rose-300 bg-rose-50 text-rose-950 shadow-sm"
                              : option.value === "keep_file"
                                ? "border-sky-300 bg-sky-50 text-sky-950 shadow-sm"
                                : "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm"
                            : "border-outline/12 bg-white/70 text-on-surface-variant/85 hover:border-primary/20 hover:bg-white"
                        }`}
                        title={option.description}
                        aria-pressed={attachmentRetentionMode() === option.value}
                      >
                        <div class="text-xs font-semibold">{option.label}</div>
                        <div class="mt-1 text-[11px] font-medium opacity-80">{option.title}</div>
                        <div class="mt-1 text-[11px] leading-4 opacity-75">{option.description}</div>
                      </button>
                    )}
                  </For>
                </div>
                <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/70">
                  {attachmentRetentionSummary(attachmentRetentionMode())}
                </p>
                <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/70">
                  {attachmentRetentionOutcome(attachmentRetentionMode())}
                </p>
              </div>

              <div class="mt-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3 shadow-sm">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/80">
                      Retention choice guide
                    </p>
                    <p class="mt-1 text-sm font-medium text-emerald-950">
                      {attachmentRetentionDecision().headline}
                    </p>
                    <p class="mt-1 text-[11px] leading-5 text-emerald-900/80">
                      {attachmentRetentionDecision().detail}
                    </p>
                  </div>
                </div>
                <div class="mt-3 grid gap-2 md:grid-cols-3">
                  <For each={attachmentRetentionDecision().cards}>
                    {(card) => (
                      <button
                        type="button"
                        onClick={() => setAttachmentRetentionMode(card.mode)}
                        class={`rounded-2xl border p-3 text-left shadow-sm transition ${
                          card.selected
                            ? card.tone === "emerald"
                              ? "border-emerald-300 bg-white/95"
                              : card.tone === "sky"
                                ? "border-sky-300 bg-white/95"
                                : "border-amber-300 bg-white/95"
                            : "border-white/80 bg-white/85 hover:bg-white"
                        }`}
                      >
                        <div class="flex flex-wrap items-start justify-between gap-2">
                          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/75">
                            {card.label}
                          </p>
                          <div class="flex flex-wrap gap-1">
                            <Show when={card.recommended}>
                              <span class="rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                                Recommended
                              </span>
                            </Show>
                            <Show when={card.selected}>
                              <span class="rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                Selected
                              </span>
                            </Show>
                          </div>
                        </div>
                        <p class="mt-2 text-[11px] leading-5 text-on-surface/85">
                          {card.valueAfterRun}
                        </p>
                        <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/80">
                          {card.searchability}
                        </p>
                        <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/75">
                          {card.storageImpact}
                        </p>
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class="mt-4 grid gap-2 md:grid-cols-3">
                <div class="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800/75">
                    Immediate value
                  </p>
                  <p class="mt-1 text-xs leading-5 text-sky-950/90">
                    {studyImmediateValuePlan().firstResultLabel}
                  </p>
                </div>
                <div class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/75">
                    Retained for later
                  </p>
                  <p class="mt-1 text-xs leading-5 text-emerald-950/90">
                    {studyImmediateValuePlan().retentionLabel}
                  </p>
                </div>
                <div class="rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/75">
                    Find it again
                  </p>
                  <p class="mt-1 text-xs leading-5 text-violet-950/90">
                    {studyImmediateValuePlan().retrievalLabel}
                  </p>
                </div>
              </div>

              <div class="mt-3 rounded-2xl border border-teal-200/80 bg-teal-50/75 p-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-800/80">
                      Study-ready after this run
                    </p>
                    <p class="mt-1 text-xs leading-5 text-teal-950/90">
                      {studyImmediateValuePlan().readinessLabel}
                    </p>
                    <p class="mt-1 text-[11px] leading-5 text-teal-900/80">
                      {studyImmediateValuePlan().readinessDetail}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2 text-[11px]">
                    <span class="rounded-full border border-teal-200/80 bg-white/90 px-2.5 py-1 font-medium text-teal-900">
                      {attachmentSupportSummary().supportedFiles.length} readable
                    </span>
                    <span class="rounded-full border border-sky-200/80 bg-white/90 px-2.5 py-1 font-medium text-sky-900">
                      {attachedFiles().length} attached
                    </span>
                  </div>
                </div>
              </div>
              <Show when={studySourceMix()}>
                {(mix) => (
                  <div class={`mt-4 rounded-2xl border p-3 ${
                    mix().tone === "emerald"
                      ? "border-emerald-200 bg-emerald-50/75"
                      : mix().tone === "amber"
                        ? "border-amber-200 bg-amber-50/80"
                        : "border-violet-200 bg-violet-50/70"
                  }`}>
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="max-w-3xl">
                        <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          mix().tone === "emerald"
                            ? "text-emerald-800/80"
                            : mix().tone === "amber"
                              ? "text-amber-800/80"
                              : "text-violet-800/80"
                        }`}>
                          Pack strength before you run
                        </p>
                        <p class="mt-1 text-sm font-medium text-on-surface">{mix().headline}</p>
                        <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/85">{mix().detail}</p>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (mix().primaryActionId === "pick_files") {
                              fileInputRef?.click();
                              return;
                            }
                            if (mix().primaryActionId === "compare_path") {
                              applyStudentQuickStart(studentQuickStartForIntent("compare_sources"));
                              return;
                            }
                            void handleSubmit();
                          }}
                          class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white"
                        >
                          {mix().primaryActionLabel}
                        </button>
                        <Show when={mix().secondaryActionLabel}>
                          <button
                            type="button"
                            onClick={() => {
                              if (mix().secondaryActionId === "pick_files") {
                                fileInputRef?.click();
                                return;
                              }
                              if (mix().secondaryActionId === "week_path") {
                                applyStudentQuickStart(studentQuickStartForIntent("week_summary"));
                              }
                            }}
                            class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition hover:bg-white"
                          >
                            {mix().secondaryActionLabel}
                          </button>
                        </Show>
                      </div>
                    </div>
                    <div class="mt-3 grid gap-2 md:grid-cols-2">
                      <div class="rounded-2xl border border-white/80 bg-white/90 p-3">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/70">
                          Graph robustness
                        </p>
                        <p class="mt-1 text-xs leading-5 text-on-surface-variant/85">
                          {mix().graphOutcome}
                        </p>
                      </div>
                      <div class="rounded-2xl border border-white/80 bg-white/90 p-3">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/70">
                          Supertag leverage
                        </p>
                        <p class="mt-1 text-xs leading-5 text-on-surface-variant/85">
                          {mix().supertagOutcome}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Show>

              <div
                class={`mt-4 rounded-2xl border p-3 ${
                  studyComposerGuidance().recommendationMatchesCurrent
                    ? "border-emerald-200 bg-emerald-50/70"
                    : "border-amber-200 bg-amber-50/75"
                }`}
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p
                      class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        studyComposerGuidance().recommendationMatchesCurrent
                          ? "text-emerald-800/80"
                          : "text-amber-800/80"
                      }`}
                    >
                      {studyComposerGuidance().recommendationTitle}
                    </p>
                    <p
                      class={`mt-1 text-xs leading-5 ${
                        studyComposerGuidance().recommendationMatchesCurrent
                          ? "text-emerald-950/90"
                          : "text-amber-950/90"
                      }`}
                    >
                      {studyComposerGuidance().recommendationBody}
                    </p>
                  </div>
                  <Show when={!studyComposerGuidance().recommendationMatchesCurrent}>
                    <button
                      type="button"
                      onClick={() => {
                        setKnowledgeOrganizationMode(studyComposerGuidance().recommendedKnowledgeMode);
                        setAttachmentRetentionMode(studyComposerGuidance().recommendedRetentionMode);
                      }}
                      class="rounded-full border border-amber-300/80 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-amber-900 transition hover:bg-white"
                    >
                      Use recommended setup
                    </button>
                  </Show>
                </div>
              </div>

              <div class="mt-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant/70">
                    {studyComposerGuidance().suggestionHeading}
                  </p>
                  <p class="text-[10px] leading-4 text-on-surface-variant/60">
                    {studyComposerGuidance().suggestionDetail}
                  </p>
                </div>
                <div class="mt-2 flex flex-wrap gap-2">
                  <For each={studyComposerGuidance().suggestedPrompts}>
                    {(prompt) => (
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryRecallIdx(-1);
                          setHistoryRecallDraft("");
                          setArrowNavIdx(-1);
                          setEditorQuery(prompt);
                          requestAnimationFrame(() => editorHandle?.focus());
                        }}
                        class="rounded-full border border-primary/15 bg-white px-3 py-1.5 text-left text-[11px] font-medium text-on-surface transition hover:border-primary/30 hover:bg-primary/[0.05]"
                        title={prompt}
                      >
                        {prompt}
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class="mt-4 rounded-2xl border border-violet-200/80 bg-violet-50/55 p-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/80">
                      {studyPromptPaths().headline}
                    </p>
                    <p class="mt-1 text-[11px] leading-5 text-violet-900/80">
                      {studyPromptPaths().supportingText}
                    </p>
                  </div>
                </div>
                <Show when={studyPromptPaths().recommendationReason}>
                  {(reason) => (
                    <div class="mt-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="max-w-3xl">
                          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/80">
                            Recommended next path
                          </p>
                          <p class="mt-1 text-xs font-medium text-emerald-950/90">
                            {recommendedStudyPath()?.label ?? "Continue studying"}
                          </p>
                          <p class="mt-1 text-[11px] leading-5 text-emerald-900/80">
                            {reason()}
                          </p>
                        </div>
                        <Show when={recommendedStudyPath()}>
                          {(option) => (
                            <button
                              type="button"
                              onClick={() => {
                                setHistoryRecallIdx(-1);
                                setHistoryRecallDraft("");
                                setArrowNavIdx(-1);
                                setEditorQuery(option().prompt);
                                requestAnimationFrame(() => editorHandle?.focus());
                              }}
                              class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-emerald-900 transition hover:bg-white"
                            >
                              Use {option().label.toLowerCase()} path
                            </button>
                          )}
                        </Show>
                      </div>
                    </div>
                  )}
                </Show>
                <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <For each={studyPromptPaths().options}>
                    {(option) => (
                      <div
                        class={`rounded-2xl border bg-white/90 p-3 ${
                          option.tone === "emerald"
                            ? "border-emerald-200/80"
                            : option.tone === "amber"
                              ? "border-amber-200/80"
                              : option.tone === "violet"
                                ? "border-violet-200/80"
                                : "border-sky-200/80"
                        }`}
                      >
                        <div class="flex items-start justify-between gap-2">
                          <div>
                            <p class="text-xs font-semibold text-on-surface">{option.label}</p>
                            <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/80">{option.detail}</p>
                          </div>
                          <Show when={option.recommended}>
                            <span class="rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                              Best fit
                            </span>
                          </Show>
                        </div>
                        <div class="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryRecallIdx(-1);
                              setHistoryRecallDraft("");
                              setArrowNavIdx(-1);
                              setEditorQuery(option.prompt);
                              requestAnimationFrame(() => editorHandle?.focus());
                            }}
                            class="rounded-full border border-primary/15 bg-white px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:border-primary/30 hover:bg-primary/[0.05]"
                            title={option.prompt}
                          >
                            Use path
                          </button>
                          <For each={option.prompts.slice(0, 2)}>
                            {(prompt) => (
                              <button
                                type="button"
                                onClick={() => {
                                  setHistoryRecallIdx(-1);
                                  setHistoryRecallDraft("");
                                  setArrowNavIdx(-1);
                                  setEditorQuery(prompt);
                                  requestAnimationFrame(() => editorHandle?.focus());
                                }}
                                class="rounded-full border border-primary/10 bg-slate-50 px-3 py-1.5 text-left text-[11px] font-medium text-on-surface transition hover:border-primary/25 hover:bg-white"
                                title={prompt}
                              >
                                {prompt}
                              </button>
                            )}
                          </For>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap items-center gap-2 text-[10px] leading-4 text-on-surface-variant/65">
              <span>
                {attachmentSupportSummary().inlineCount} ready now
              </span>
              <span class="px-1.5 text-on-surface-variant/35">•</span>
              <span>
                {attachmentSupportSummary().serverCount} server read
              </span>
              <span class="px-1.5 text-on-surface-variant/35">•</span>
              <span class={attachmentSupportSummary().unsupportedCount > 0 ? "text-amber-700" : ""}>
                {attachmentSupportSummary().unsupportedCount} not readable yet
              </span>
              </div>
              <Show when={attachmentSupportSummary().unsupportedCount > 0}>
                <p class="mt-2 text-[10px] leading-4 text-amber-700">
                {attachmentSupportSummary().supportedFiles.length > 0
                  ? "These files will be skipped for this run until they are converted into a supported format."
                  : "These files cannot be used in this run yet because none of them are readable as connected notes."}{" "}
                {attachmentSupportSummary().unsupportedFiles
                  .slice(0, 3)
                  .map((file) => file.name)
                  .join(", ")}
                {attachmentSupportSummary().unsupportedFiles.length > 3
                  ? ` and ${attachmentSupportSummary().unsupportedFiles.length - 3} more`
                  : ""}. Try PDF, DOCX, TXT, Markdown, CSV, or common audio files.
                </p>
              </Show>
              <p class="mt-2 text-[10px] leading-4 text-on-surface-variant/65">
                {studyImmediateValuePlan().nextSurfaceLabel}
              </p>
              </div>
            </div>
          </div>
        </Show>
        <Show when={shouldShowStudentQuickStarts()}>
          <div class="border-t border-[#ecece8] bg-[#f7f8f4] px-4 py-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/70">
                  Study workspace
                </p>
                <p class="mt-1 text-sm font-medium text-on-surface">
                  Start with lecture slides, readings, notes, or voice memos and let OmnyID connect them for you.
                </p>
                <p class="mt-1 text-xs leading-5 text-on-surface-variant/75">
                  Best first run for uni students: attach one or two study files, keep extracted notes, and ask for the concepts, overlaps, and revision priorities.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef?.click()}
                class="rounded-full border border-emerald-200/80 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 transition hover:bg-emerald-50"
              >
                Add study files
              </button>
            </div>
            <Show when={studySourceMix()}>
              {(mix) => (
                <div class={`mt-3 rounded-2xl border p-3 ${
                  mix().tone === "emerald"
                    ? "border-emerald-200 bg-emerald-50/75"
                    : mix().tone === "amber"
                      ? "border-amber-200 bg-amber-50/80"
                      : "border-violet-200 bg-violet-50/65"
                }`}>
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="max-w-3xl">
                      <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        mix().tone === "emerald"
                          ? "text-emerald-800/80"
                          : mix().tone === "amber"
                            ? "text-amber-800/80"
                            : "text-violet-800/80"
                      }`}>
                        Best file mix
                      </p>
                      <p class="mt-1 text-sm font-medium text-on-surface">{mix().headline}</p>
                      <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/85">{mix().detail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (mix().primaryActionId === "pick_files") {
                          fileInputRef?.click();
                          return;
                        }
                        if (mix().primaryActionId === "compare_path") {
                          applyStudentQuickStart(studentQuickStartForIntent("compare_sources"));
                          return;
                        }
                        void handleSubmit();
                      }}
                      class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white"
                    >
                      {mix().primaryActionLabel}
                    </button>
                  </div>
                  <div class="mt-3 grid gap-2 md:grid-cols-2">
                    <div class="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/70">Graph outcome</p>
                      <p class="mt-1 text-xs leading-5 text-on-surface-variant/85">{mix().graphOutcome}</p>
                    </div>
                    <div class="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/70">Supertag outcome</p>
                      <p class="mt-1 text-xs leading-5 text-on-surface-variant/85">{mix().supertagOutcome}</p>
                    </div>
                  </div>
                </div>
              )}
            </Show>
              <div class="mt-3 rounded-2xl border border-violet-200/80 bg-violet-50/75 p-3 shadow-sm">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/80">
                    Choose the fastest first run
                  </p>
                  <p class="mt-1 text-sm font-medium text-violet-950">
                    {studyZeroState().headline}
                  </p>
                  <p class="mt-1 text-[11px] leading-5 text-violet-900/80">
                    {studyZeroState().recommendedRetentionDetail}
                  </p>
                </div>
                <div class="rounded-2xl border border-white/80 bg-white/90 px-3 py-2 text-right shadow-sm">
                  <p class="text-[10px] uppercase tracking-[0.14em] text-violet-700/75">Recommended retention</p>
                  <p class="mt-1 text-[11px] font-semibold text-violet-950">{studyZeroState().recommendedRetentionLabel}</p>
                  </div>
                </div>
                <div class="mt-3 grid gap-3 xl:grid-cols-4 md:grid-cols-2">
                  <For each={studyQuickStartChoices().cards}>
                    {(card) => (
                      <button
                        type="button"
                        onClick={() => applyStudentQuickStart(studentQuickStartForIntent(card.intent))}
                        class={`rounded-2xl border p-3 text-left shadow-sm transition ${
                          card.selected
                            ? card.tone === "violet"
                              ? "border-violet-300 bg-white/95 ring-2 ring-violet-200/70"
                              : card.tone === "sky"
                                ? "border-sky-300 bg-white/95 ring-2 ring-sky-200/70"
                                : card.tone === "emerald"
                                  ? "border-emerald-300 bg-white/95 ring-2 ring-emerald-200/70"
                                  : "border-amber-300 bg-white/95 ring-2 ring-amber-200/70"
                            : starterToneClass(card.tone)
                        }`}
                        title={card.detail}
                      >
                        <div class="flex items-start justify-between gap-2">
                          <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/75">
                            {card.badge}
                          </span>
                          <div class="flex flex-wrap justify-end gap-1">
                            <Show when={card.recommended}>
                              <span class="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-900">
                                Recommended
                              </span>
                            </Show>
                            <Show when={card.selected}>
                              <span class="rounded-full border border-slate-200/80 bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                Selected
                              </span>
                            </Show>
                          </div>
                        </div>
                        <p class="mt-2 text-sm font-semibold text-on-surface">{card.title}</p>
                        <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/85">
                          {card.detail}
                        </p>
                        <p class="mt-2 text-[11px] font-medium text-on-surface/90">
                          {card.emphasis}
                        </p>
                        <div class="mt-3 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.12em]">
                          <span class="rounded-full border border-sky-200/80 bg-white/90 px-2 py-1 text-sky-900">
                            {card.timeToValueLabel}
                          </span>
                          <span class="rounded-full border border-emerald-200/80 bg-white/90 px-2 py-1 text-emerald-900">
                            {card.retentionLabel}
                          </span>
                          <span class="rounded-full border border-violet-200/80 bg-white/90 px-2 py-1 text-violet-900">
                            {card.knowledgeModeLabel}
                          </span>
                        </div>
                        <p class="mt-3 text-[11px] leading-5 text-on-surface-variant/85">
                          {card.recommendedUpload}
                        </p>
                      </button>
                    )}
                  </For>
                </div>
                <div class="mt-3 grid gap-2 xl:grid-cols-4 md:grid-cols-2">
                  <For each={studyZeroState().starterActions}>
                    {(action) => (
                    <button
                      type="button"
                      onClick={() => applyStudentQuickStart(studentQuickStartForIntent(action.intent))}
                      class={`rounded-2xl border p-3 text-left shadow-sm transition ${starterToneClass(action.tone)}`}
                      title={action.detail}
                    >
                      <div class="flex items-start justify-between gap-2">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/75">
                          {action.label}
                        </p>
                        <Show when={action.recommended}>
                          <span class="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-900">
                            Recommended
                          </span>
                        </Show>
                      </div>
                      <p class="mt-1 text-xs font-semibold text-on-surface">{action.title}</p>
                      <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/80">
                        {action.detail}
                      </p>
                    </button>
                  )}
                </For>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <For each={studyZeroState().firstOutputs}>
                  {(output) => (
                    <span class="rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[11px] text-violet-900">
                      {output}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>
      <div class="flex items-start gap-4 px-6 py-5 relative">
        <Show when={props.busy}>
          <div class="absolute bottom-0 left-0 h-[2px] w-full animate-pulse bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
        </Show>
        <Show when={!props.busy && query().length > 0}>
          <div
            class={`absolute bottom-0 left-0 h-[2px] transition-all duration-500 ${
              query().length >= 16384 ? "bg-red-400/70" : query().length >= 13107 ? "bg-amber-400/70" : "bg-emerald-400/50"
            }`}
            style={`width: ${Math.min(100, (query().length / 16384) * 100)}%`}
          />
        </Show>
        <div class="flex flex-1 items-start gap-3 pt-0.5">
          <span class="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-[#cef264] shadow-[0_0_12px_rgba(206,242,100,0.8)]" />
          <TiptapEditor
            mode="compact"
            disabled={props.busy}
            appearance="minimal"
            showToolbar={false}
            showFooter={false}
            enableSlashCommands={false}
            submitShortcut="none"
            class="min-w-0 flex-1"
            contentClass="w-full overflow-visible bg-transparent text-lg leading-7 text-on-surface"
            placeholder={PLACEHOLDERS[placeholderIdx()]}
            onReady={(handle) => {
              editorHandle = handle;
              if (pendingEditorText() !== handle.getText()) {
                handle.setPlainText(pendingEditorText());
              }
            }}
            onChange={(text) => {
              setQuery(text);
              setHistoryRecallIdx(-1);
              setHistoryRecallDraft("");
              setArrowNavIdx(-1);
              setShowDropdown(true);
              setShowOperators(false);
            }}
            onFocus={() => {
              setFocused(true);
              setShowDropdown(true);
              document.body.setAttribute("data-search-open", "1");
            }}
            onBlur={() => {
              setFocused(false);
              document.body.removeAttribute("data-search-open");
            }}
            onKeyDown={handleEditorKeyDown}
            onSend={async () => {}}
            clearOnSend={false}
          />
          <Show when={query().length > 0}>
            <button
              type="button"
              disabled={props.busy}
              aria-label="Clear input"
              onPointerDown={(event) => {
                event.preventDefault();
                setEditorQuery("");
                setShowDropdown(false);
                focusSearchInput();
              }}
              class="mt-1 flex-shrink-0 rounded-full p-0.5 text-on-surface-variant/40 transition hover:text-on-surface-variant"
            >
              ×
            </button>
          </Show>
          <Show when={!props.busy && props.resultCountVisible && resultCountLabel()}>
            {(label) => (
              <span
                class="mt-1 flex-shrink-0 self-start rounded-full border border-primary/20 bg-primary/[0.08] px-2.5 py-0.5 font-mono text-[10px] text-primary/85"
                title={`${label()} visible in search`}
              >
                {label()}
              </span>
            )}
          </Show>
          <Show when={!props.busy && props.resultCountVisible && (props.resultCount ?? 0) > 0 && query().trim().length > 0}>
            <div ref={saveSearchRef} class="relative mt-1 flex-shrink-0 self-start">
              <button
                type="button"
                disabled={props.busy}
                title="Save this search"
                onPointerDown={(event) => {
                  event.preventDefault();
                  openSaveSearchPopover();
                }}
                class={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition ${
                  showSaveSearch()
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-outline/12 bg-white/75 text-on-surface-variant/70 hover:border-primary/20 hover:bg-primary/[0.04] hover:text-on-surface"
                }`}
              >
                Save search
              </button>
              <Show when={showSaveSearch()}>
                <div class="absolute right-0 top-full z-50 mt-2 w-72 animate-fade-in rounded-2xl border border-white/45 bg-white/97 p-4 shadow-panel backdrop-blur-xl">
                  <div class="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline">Save search</p>
                      <p class="mt-1 text-[11px] leading-4 text-on-surface-variant/70">
                        Store this query locally for quick reuse.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={props.busy}
                      aria-label="Close saved search popover"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        setShowSaveSearch(false);
                      }}
                      class="rounded-full p-1 text-on-surface-variant/45 transition hover:bg-black/5 hover:text-on-surface-variant"
                    >
                      x
                    </button>
                  </div>
                  <label class="mb-1 block text-[11px] font-medium text-on-surface-variant">
                    Name
                  </label>
                  <input
                    value={saveSearchName()}
                    disabled={props.busy}
                    onInput={(event) => setSaveSearchName(event.currentTarget.value)}
                    class="w-full rounded-xl border border-outline/12 bg-white px-3 py-2 text-sm text-on-surface outline-none transition focus:border-primary/25"
                    placeholder="Saved search"
                  />
                  <p class="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-outline">Query</p>
                  <p class="mt-1 rounded-xl border border-outline/10 bg-surface-container px-3 py-2 font-mono text-[11px] leading-4 text-on-surface-variant">
                    {query().trim()}
                  </p>
                  <div class="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={props.busy}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        setShowSaveSearch(false);
                      }}
                      class="rounded-full border border-outline/12 px-3 py-1.5 text-xs text-on-surface-variant transition hover:bg-black/5 hover:text-on-surface"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={props.busy}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        saveCurrentSearch();
                      }}
                      class="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
          <Show when={!focused() && !query()}>
            <kbd class="mt-1 flex-shrink-0 self-start rounded border border-white/40 bg-white/40 px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant/50 select-none">
              Ctrl+K
            </kbd>
          </Show>
          <Show when={!focused() && !query() && recentQueries().length > 0}>
            <button
              type="button"
              title={`${recentQueries().length} recent queries — click to repeat last`}
              onPointerDown={(e) => {
                e.preventDefault();
                setEditorQuery(recentQueries()[0]);
                requestAnimationFrame(() => focusSearchInput());
              }}
              class="mt-1 flex-shrink-0 self-start rounded-full border border-white/40 bg-white/30 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant/50 transition hover:bg-white/50 hover:text-on-surface-variant"
            >
              ↺ {recentQueries().length}
            </button>
          </Show>
        </div>
        {/* Word count — shows faintly when query is long enough to risk context limits */}
        <Show when={query().length > 200}>
          <span class="self-end pb-1 font-mono text-[9px] text-on-surface-variant/30 flex-shrink-0">
            ~{query().trim().split(/\s+/).filter(Boolean).length}w
          </span>
        </Show>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.md,.markdown,.html,.htm,.csv,.tsv,.json,.xml,.rtf,.srt,.vtt,.jpg,.jpeg,.png,.gif,.webp,.svg,.xlsx,.xlsm,.xltx,.xltm,.pptx,.ppsx,.potx,.mp3,.wav,.m4a,.aac,.ogg,.webm,.mp4,.mov"
          style="display:none"
          onChange={(e) => handleFileSelect(e.currentTarget.files)}
        />
        {/* Attach file button */}
        <button
          type="button"
          title="Attach files for the agent to analyse (PDF, slides, spreadsheets, notes, audio)"
          disabled={props.busy}
          onPointerDown={(event) => {
            event.preventDefault();
            fileInputRef?.click();
          }}
          class="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-on-surface-variant/60 transition hover:bg-gray-200 hover:text-on-surface"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M13.5 8.5l-5.5 5.5a4 4 0 0 1-5.657-5.657L8.5 2.186a2.5 2.5 0 0 1 3.535 3.535L5.379 12.38a1 1 0 0 1-1.414-1.414L10.621 4.31" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        {/* Mic button — Ctrl+Shift+M */}
        <button
          type="button"
          disabled={props.busy || micUnavailable()}
          title={
            micUnavailable()
              ? "Voice input requires HTTPS — not available on this connection"
              : `${isListening() ? "Stop recording" : "Start voice input"} (Ctrl+Shift+M)${voiceHealth() === "degraded" ? " · Degraded — check mic permissions" : ""}`
          }
          onPointerDown={(event) => {
            event.preventDefault();
            toggleMic();
          }}
          class={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full transition ${
            micUnavailable()
              ? "cursor-not-allowed opacity-35 bg-gray-100 text-on-surface-variant/40"
              : isListening()
                ? "bg-red-500/15 text-red-500 animate-pulse"
                : voiceHealth() === "degraded"
                  ? "bg-amber-50 text-amber-500 hover:bg-amber-100"
                  : "bg-gray-100 text-on-surface-variant/60 hover:bg-gray-200 hover:text-on-surface"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
            <rect x="5" y="1" width="5" height="8" rx="2.5" stroke="currentColor" stroke-width="1.4"/>
            <path d="M2 7.5a5.5 5.5 0 0 0 11 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <line x1="7.5" y1="13" x2="7.5" y2="14.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </button>
        <div ref={operatorsRef} class="relative flex-shrink-0">
          <button
            type="button"
            disabled={props.busy}
            aria-label="Search operators"
            title="Search operators"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setShowDropdown(false);
              setShowSettings(false);
              setShowOperators((value) => !value);
            }}
            class={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
              showOperators()
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-white/45 bg-white/70 text-on-surface-variant/60 hover:border-white/60 hover:bg-white hover:text-on-surface"
            }`}
          >
            <span class="font-mono text-xs font-semibold">?</span>
          </button>
          <Show when={showOperators()}>
            <div class="absolute right-0 top-full z-50 mt-2 w-80 animate-fade-in rounded-2xl border border-white/45 bg-white/97 p-4 shadow-panel backdrop-blur-xl">
              <div class="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline">Search operators</p>
                  <p class="mt-1 text-[11px] leading-4 text-on-surface-variant/70">
                    Click an operator to insert it into the active query.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={props.busy}
                  aria-label="Close operator reference"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setShowOperators(false);
                  }}
                  class="rounded-full p-1 text-on-surface-variant/45 transition hover:bg-black/5 hover:text-on-surface-variant"
                >
                  x
                </button>
              </div>
              <div class="flex flex-col gap-2.5">
                <For each={SEARCH_OPERATORS}>
                  {(operator) => (
                    <button
                      type="button"
                      disabled={props.busy}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        insertOperator(`${operator.example} `);
                      }}
                      class="rounded-xl border border-outline/10 bg-white/70 px-3 py-2 text-left transition hover:border-primary/20 hover:bg-primary/[0.04]"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <span class="font-mono text-[11px] font-semibold text-on-surface">{operator.label}</span>
                        <span class="font-mono text-[10px] text-primary/80">{operator.example}</span>
                      </div>
                      <p class="mt-1 text-[11px] leading-4 text-on-surface-variant/70">{operator.desc}</p>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
        {/* Settings gear — engine + optimization mode */}
        <div ref={settingsRef} class="relative flex-shrink-0">
          <button
            type="button"
            disabled={props.busy}
            title="Search settings: engine and optimization mode"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setShowOperators(false);
              setShowSettings((v) => !v);
            }}
            class={`flex h-9 w-9 items-center justify-center rounded-full transition ${
              showSettings() ? "bg-primary/10 text-primary" : "bg-gray-100 text-on-surface-variant/60 hover:bg-gray-200 hover:text-on-surface"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
              <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" stroke-width="1.4"/>
              <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.93 2.93l1.06 1.06M11.01 11.01l1.06 1.06M2.93 12.07l1.06-1.06M11.01 3.99l1.06-1.06" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </button>
          <Show when={showSettings()}>
            <div class="absolute right-0 top-full z-50 mt-2 w-64 animate-fade-in rounded-2xl border border-white/45 bg-white/97 p-4 shadow-panel backdrop-blur-xl">
              <p class="mb-3 font-mono text-[9px] uppercase tracking-[0.18em] text-outline">Search settings</p>
              <div class="flex flex-col gap-3">
                <div>
                  <label class="mb-1 block text-[11px] font-medium text-on-surface-variant">
                    Optimization mode
                  </label>
                  <select
                    value={optMode()}
                    disabled={props.busy}
                    onChange={(e) => {
                      setOptMode(saveSearchOptimizationMode(oKey(), e.currentTarget.value));
                    }}
                    onFocus={() => {
                      setSelectFocused(true);
                      if (!loadSearchSelectHintSeen(SELECT_HINT_KEY)) {
                        setShowSelectHint(true);
                        setTimeout(() => {
                          setShowSelectHint(false);
                          saveSearchSelectHintSeen(SELECT_HINT_KEY, true);
                        }, 5000);
                      }
                    }}
                    onBlur={() => setSelectFocused(false)}
                    class="w-full rounded-lg border border-outline/15 bg-white px-3 py-1.5 text-xs text-on-surface outline-none focus:border-primary transition cursor-pointer"
                    title="Optimization mode: Balanced = cost vs speed tradeoff | Power = maximum compute, best quality | Cheap = lowest token cost"
                  >
                    <option value="balanced">Balanced - weighs cost &amp; speed</option>
                    <option value="speed">Power - maximum compute, best quality</option>
                    <option value="cost">Cheap - minimise token spend</option>
                  </select>
                  <Show when={showSelectHint()}>
                    <p class="mt-1 text-[10px] text-on-surface-variant/70 leading-4">
                      <span class="font-medium text-on-surface">Balanced</span> - cost/speed tradeoff |{" "}
                      <span class="font-medium text-on-surface">Power</span> - max quality |{" "}
                      <span class="font-medium text-on-surface">Cheap</span> - min spend
                    </p>
                  </Show>
                </div>
                <div>
                  <label class="mb-1 block text-[11px] font-medium text-on-surface-variant">
                    Web search engine
                  </label>
                  <select
                    value={engine()}
                    disabled={props.busy}
                    onChange={(e) => {
                      setEngine(saveSearchEnginePreference(eKey(), e.currentTarget.value));
                    }}
                    class="w-full rounded-lg border border-outline/15 bg-white px-3 py-1.5 text-xs text-on-surface outline-none focus:border-primary transition cursor-pointer"
                    title="Web search provider used when the agent needs external information"
                  >
                    <option value="duckduckgo">DuckDuckGo</option>
                    <option value="google">Google</option>
                  </select>
                  <p class="mt-1 text-[10px] text-on-surface-variant/60">
                    Used when the agent searches the web.
                  </p>
                </div>
              </div>
            </div>
          </Show>
        </div>
        <div class="flex flex-col items-end gap-0.5">
          <button
            type="submit"
            disabled={props.busy}
            class={`glass-button rounded-full px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 transition-colors ${
              query().length >= 16384 ? "animate-pulse bg-red-500" :
              query().length >= 15360 ? "animate-pulse bg-amber-500" :
              submitFailed() ? "bg-red-500" : "btn-shimmer"
            }`}
          >
            {submitFailed() ? "✗ Failed" : submitted() ? "✓ Sent" : props.busy ? "Routing..." : "Run"}
          </button>
          <Show when={props.busy}>
            <span class="font-mono text-[9px] text-on-surface-variant/40 animate-fade-in pr-1">
              {optMode() === "speed" ? "power" : optMode() === "cost" ? "cheap" : "balanced"}
            </span>
          </Show>
        </div>
      </div>{/* end inner flex items-start */}
      </div>{/* end outer flex-col card */}

      <Show when={query().length > 50}>
        <p class="mt-1 px-6 font-mono text-[0.65em] tabular-nums text-on-surface-variant/40">
          {query().length} chars · ~{Math.round(query().length / 4)} tokens
        </p>
      </Show>
      <Show when={props.busy}>
        <p class="mt-1 px-6 font-mono text-[0.65em] text-on-surface-variant/55 animate-fade-in">
          {searchStatusLine()}
        </p>
      </Show>
      <Show when={submitErrorMsg()}>
        <p class="mt-1 px-6 font-mono text-[0.65em] text-red-500/80 animate-fade-in">
          {submitErrorMsg()}
        </p>
      </Show>

      {/* Filter chips — always visible below search */}
      <div class="mt-2 flex flex-wrap items-center gap-1.5 px-2">
        <span class="font-mono text-[9px] text-on-surface-variant/30 select-none">filter</span>
        {([
          { label: "type:email", insert: "type:email " },
          { label: "type:task", insert: "type:task " },
          { label: "type:note", insert: "type:note " },
          { label: "from:", insert: "from:" },
          { label: "tag:#", insert: "tag:#" },
          { label: "date:today", insert: "date:today " },
        ] as const).map((chip) => (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              const current = query();
              const already = current.includes(chip.insert.trim());
              if (!already) {
                const updated = current ? `${current} ${chip.insert}` : chip.insert;
                setEditorQuery(updated);
                requestAnimationFrame(() => focusSearchInput());
              } else {
                focusSearchInput();
              }
            }}
            class={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition ${
              query().includes(chip.insert.trim())
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-white/25 bg-white/15 text-on-surface-variant/50 hover:bg-white/30 hover:text-on-surface-variant"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div class="mt-1.5 flex flex-wrap items-center gap-1.5 px-2">
        <span class="font-mono text-[9px] text-on-surface-variant/30 select-none">logic</span>
        {([
          { id: "all", label: "Match all", title: "Join plain terms with AND before search" },
          { id: "any", label: "Match any", title: "Join plain terms with OR before search" },
          { id: "exclude", label: "Exclude", title: "Prefix plain terms with - before search" },
        ] as const).map((mode) => (
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              selectBooleanMode(mode.id);
              focusSearchInput();
            }}
            class={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition ${
              booleanMode() === mode.id
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-white/25 bg-white/15 text-on-surface-variant/50 hover:bg-white/30 hover:text-on-surface-variant"
            }`}
            title={mode.title}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Quick-access chips: last 3 queries, always visible when search is empty */}
      <Show when={!query() && recentQueries().length > 0 && !submitted()}>
        <div class="mt-1.5 flex flex-wrap items-center gap-1.5 px-2 animate-fade-in">
          <span class="font-mono text-[9px] text-on-surface-variant/35 select-none">recent</span>
          <For each={recentQueries().slice(0, 3)}>
            {(recent) => (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setEditorQuery(recent);
                  requestAnimationFrame(() => focusSearchInput());
                }}
                class="max-w-[22ch] truncate rounded-full border border-white/30 bg-white/20 px-3 py-0.5 font-mono text-[10px] text-on-surface-variant/60 transition hover:bg-white/40 hover:text-on-surface-variant"
                title={recent}
              >
                {recent}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Ghost preview pill — visible when a suggestion is highlighted via arrow keys */}
      <Show when={arrowNavIdx() >= 0 && allDropdownSuggestions()[arrowNavIdx()]}>
        <div class="mt-1.5 px-2 animate-fade-in">
          <div class="flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.04] px-4 py-1 text-xs">
            <span class="flex-1 truncate italic text-on-surface-variant/45">
              {allDropdownSuggestions()[arrowNavIdx()]}
            </span>
            <kbd class="flex-shrink-0 rounded border border-white/30 bg-white/40 px-1.5 py-0.5 font-mono text-[9px] text-on-surface-variant/35 select-none">
              Tab
            </kbd>
          </div>
        </div>
      </Show>

      {/* Suggestions dropdown */}
      <Show when={dropdownVisible()}>
        <div class="absolute left-0 right-0 top-full z-50 mt-2 animate-fade-in rounded-[20px] border border-white/45 bg-white/95 shadow-panel backdrop-blur-xl">
          <Show when={savedSearchSlashTerm() !== null}>
            <div class="px-4 pt-3 pb-2">
              <div class="mb-1.5 flex items-center justify-between gap-3">
                <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Saved searches</p>
                <span class="font-mono text-[10px] text-on-surface-variant/45">/search saved</span>
              </div>
              <Show
                when={savedSearchMatches().length > 0}
                fallback={
                  <p class="rounded-xl border border-outline/10 bg-white/70 px-3 py-2 text-sm text-on-surface-variant/65">
                    No saved searches match yet.
                  </p>
                }
              >
                <For each={savedSearchMatches()}>
                  {(entry) => (
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        runSavedSearch(entry);
                      }}
                      class="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-primary/8"
                    >
                      <span class="mt-0.5 font-mono text-[10px] text-primary/70">*</span>
                      <div class="min-w-0">
                        <div class="truncate font-medium text-on-surface">{entry.name}</div>
                        <div class="mt-0.5 truncate font-mono text-[10px] text-on-surface-variant/55">
                          {entry.query}
                        </div>
                      </div>
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </Show>
          <Show when={savedSearchSlashTerm() === null && isSlashMode() && slashMatches().length > 0}>
          <div class="px-4 pt-3 pb-2">
            <p class="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Commands</p>
            <For each={slashMatches()}>
              {(sc) => (
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); executeSlashCommand(sc.cmd); }}
                  class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-primary/8"
                >
                  <span class="w-5 flex-shrink-0 text-center text-base">{sc.icon}</span>
                  <div>
                    <span class="font-medium">{sc.label}</span>
                    <span class="ml-2 font-mono text-[10px] text-on-surface-variant/40">{sc.cmd}</span>
                    <p class="mt-0.5 text-[11px] text-on-surface-variant/60">{sc.desc}</p>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={!isSlashMode() && !debouncedQuery().trim() && timeOfDaySuggestions().length > 0}>
            <div class="px-4 pt-3 pb-2">
              <p class="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Suggested</p>
              <For each={timeOfDaySuggestions()}>
                {(suggestion) => (
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); pickSuggestion(suggestion); }}
                    class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-primary/8"
                  >
                    <span class="text-on-surface-variant/30">✦</span>
                    {suggestion}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={smartSuggestions().length > 0}>
            <div class="px-4 pt-3 pb-2">
              <p class="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Suggestions</p>
              <For each={smartSuggestions()}>
                {(suggestion) => (
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); pickSuggestion(suggestion); }}
                    class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-primary/8"
                  >
                    <span class="text-primary opacity-60">→</span>
                    {suggestion}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={!debouncedQuery().trim() && sessionHistory().length > 0}>
            <div class={`px-4 pb-2 ${smartSuggestions().length > 0 || recentQueries().length > 0 ? "border-t border-white/40 pt-2" : "pt-3"}`}>
              <p class="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">This session</p>
              <For each={sessionHistory().slice(0, 5)}>
                {(item) => (
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); pickSuggestion(item); }}
                    class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-on-surface-variant transition hover:bg-on-surface/5"
                  >
                    <span class="opacity-30 text-[0.8em]">↑</span>
                    {item}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={!isSlashMode() && recentQueries().length > 0}>
            <div class={`px-4 pb-3 ${smartSuggestions().length > 0 ? "border-t border-white/40 pt-2" : "pt-3"}`}>
              <div class="mb-1.5 flex items-center justify-between">
                <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Recent</p>
                <Show when={recentClearPending()} fallback={
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); armClear(); }}
                    class="text-[10px] text-on-surface-variant/40 transition hover:text-on-surface-variant"
                  >
                    Clear
                  </button>
                }>
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); confirmClear(); }}
                    class="animate-fade-in text-[10px] font-medium text-red-500 transition hover:text-red-700"
                  >
                    Clear all?
                  </button>
                </Show>
              </div>
              <For each={recentQueries()}>
                {(recent, index) => (
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      onPointerDown={(e) => { e.preventDefault(); pickSuggestion(recent); }}
                      class={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-on-surface-variant transition ${arrowNavIdx() === index() ? "bg-primary/8" : "hover:bg-on-surface/5"}`}
                    >
                      <span class="opacity-40">↺</span>
                      {recent}
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => { e.preventDefault(); cycleRerunMode(); }}
                      title={`Re-run mode: ${MODE_TITLES[rerunMode()]} — click to cycle`}
                      class="flex-shrink-0 rounded-md border border-white/30 bg-white/20 px-[0.45em] py-[0.2em] font-mono text-[0.65em] text-on-surface-variant/40 transition hover:bg-white/35 hover:text-on-surface-variant"
                    >
                      {MODE_LABELS[rerunMode()]}
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => { e.preventDefault(); void submitQuery(recent, rerunMode()); }}
                      title={`Run with ${MODE_TITLES[rerunMode()]} mode`}
                      class="flex-shrink-0 rounded-lg px-[0.5em] py-[0.3em] font-mono text-[0.7em] text-primary/50 transition hover:bg-primary/8 hover:text-primary"
                    >
                      → run
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </form>
    </div>
  );
}
