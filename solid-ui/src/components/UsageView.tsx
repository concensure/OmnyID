import { createEffect, createMemo, createResource, createSignal, ErrorBoundary, Show } from "solid-js";
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  readSession,
  saveAdminThirdPartyToolPolicy,
  type BillingStatus,
  type OperatorRuntimeRemediationReceipt,
} from "@/lib/api";
import { type UsageViewFailureReceipt } from "@/lib/usageViewFailureState";
import {
  readArtifactSourceSummaryLine,
} from "@/lib/usageViewFormattingState";
import {
  loadOperatorRuntimeRemediationOutcomeNotes,
  loadOperatorRuntimeRemediationProofReferences,
  loadOperatorRuntimeRemediationFeaturedReceiptId,
  loadOperatorRuntimeRemediationFilter,
  saveOperatorRuntimeRemediationOutcomeNotes,
  saveOperatorRuntimeRemediationProofReferences,
  saveOperatorRuntimeRemediationFeaturedReceiptId,
  saveOperatorRuntimeRemediationFilter,
  type OperatorRuntimeRemediationFilter,
} from "@/lib/operatorRuntimeRemediationLocalState";
import {
  moneyLabel,
  readMountedDateTimeLabel,
} from "@/lib/usageViewSharedState";
import {
  readOperatorDerivedState,
  readOperatorRuntimeRemediationDerivedState,
} from "@/lib/operatorUsageSectionState";
import { readExternalToolDerivedState, readExternalToolSectionModel } from "@/lib/externalToolUsageSectionState";
import {
  handleUsageViewOperatorQueryShortcut,
  applyUsageViewOperatorQuery,
  clearAllUsageViewRuntimeRemediationDrafts,
  clearUsageViewOperatorQuery,
  clearUsageViewRuntimeRemediationDraft,
  updateUsageViewRuntimeRemediationDraft,
} from "@/lib/usageViewOperatorUiHandlers";
import { readUsageViewOperatorRemediationSyncState } from "@/lib/usageViewOperatorRemediationSyncState";
import {
  copyUsageViewOperationalCommand,
  copyUsageViewUpgradeRequest,
  openUsageViewBillingPortal,
  startUsageViewCheckout,
  toggleUsageViewArchiveOnlyMode,
} from "@/lib/usageViewBillingActionHandlers";
import {
  completeUsageViewRuntimeRemediationReceipt,
  triggerUsageViewOperatorAction,
  type UsageViewOperatorAction,
  issueUsageViewRuntimeRemediationReceipt,
} from "@/lib/usageViewOperatorActionHandlers";
import {
  persistUsageViewRuntimeRemediationFeaturedReceiptId,
  persistUsageViewRuntimeRemediationFilter,
  persistUsageViewRuntimeRemediationOutcomeNotes,
  persistUsageViewRuntimeRemediationProofReferences,
} from "@/lib/usageViewOperatorLocalPersistence";
import {
  readUsageViewOperatorRemediationPersistenceAdapters,
  syncUsageViewOperatorRemediationPersistence,
} from "@/lib/usageViewOperatorRemediationPersistenceState";
import {
  focusUsageViewRuntimeRemediationQueueForReceipt,
  handleUsageViewOperatorRuntimeRemediationKeyDown,
} from "@/lib/usageViewOperatorRuntimeRemediationHandlers";
import {
  readUsageViewClearUserFilterHandler,
  readUsageViewCloseUserDetailHandler,
  readUsageViewCopyOperatorCommand,
  readUsageViewCopyWorkspaceOperationalCommand,
  readUsageViewFeaturedDraftActionHandler,
  readUsageViewFeaturedReceiptActionHandler,
  readUsageViewFocusFeaturedQueueHandler,
  readUsageViewFocusLatestQueueHandler,
} from "@/lib/usageViewBindingsState";
import {
  loadUsageViewBillingState,
  loadUsageViewOperatorResourceBundleState,
  loadUsageViewOperatorUserDetailState,
} from "@/lib/usageViewResourceState";
import {
  readUsageOperatorSectionProps,
  readUsageViewOperatorMountedSectionProps,
} from "@/lib/usageViewSectionPropsState";
import { readUsageViewBillingMountedSectionProps } from "@/lib/usageViewBillingMountedState";
import { readUsageViewOperatorMountedSectionModel } from "@/lib/usageViewOperatorMountedState";
import UsageExternalToolBillingSection from "@/components/UsageExternalToolBillingSection";
import UsageOperatorSection from "@/components/UsageOperatorSection";
import UsageBillingSection from "@/components/UsageBillingSection";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { AVAILABLE_CONNECTED_APPS } from "@/lib/connectedAppsCatalog";
import { loadConnectedAppIds } from "@/lib/connectedAppsStorage";
import {
  loadAdminThirdPartyToolPolicies,
  nextAdminThirdPartyToolPolicy,
  saveAdminThirdPartyToolPolicies,
  type AdminThirdPartyToolPolicyRecord,
  type AdminThirdPartyToolScope,
} from "@/lib/adminThirdPartyToolPolicyState";
import { buildWeddingApiStackState } from "@/lib/weddingApiStackState";

export function UsageView() {
  const session = readSession();
  const operatorRuntimeRemediationUserId = () => session?.user.id ?? null;
  const validConnectedAppIds = new Set(AVAILABLE_CONNECTED_APPS.map((app) => app.id));
  const copyUpgradeRequestCounter = { current: 0 };
  const archiveOnlyModeRequestCounter = { current: 0 };
  const billingActionRequestCounter = { current: 0 };
  const operationalCommandRequestCounter = { current: 0 };
  const [modeSaving, setModeSaving] = createSignal(false);
  const [billingActionBusy, setBillingActionBusy] = createSignal<"checkout" | "portal" | "copy" | null>(null);
  const [modeError, setModeError] = createSignal<UsageViewFailureReceipt | null>(null);
  const [upgradeActionNotice, setUpgradeActionNotice] = createSignal<string | null>(null);
  const [billingActionError, setBillingActionError] = createSignal<UsageViewFailureReceipt | null>(null);
  const [operatorQueryDraft, setOperatorQueryDraft] = createSignal("");
  const [operatorQuery, setOperatorQuery] = createSignal("");
  const [operatorReloadNonce, setOperatorReloadNonce] = createSignal(0);
  const [selectedOperatorUserId, setSelectedOperatorUserId] = createSignal<string | null>(null);
  const [operatorActionBusyUserId, setOperatorActionBusyUserId] = createSignal<string | null>(null);
  const [operatorActionError, setOperatorActionError] = createSignal<string | null>(null);
  const [operatorActionNotice, setOperatorActionNotice] = createSignal<string | null>(null);
  const [routeWeddingAiThroughAdmin, setRouteWeddingAiThroughAdmin] = createSignal(false);
  const initialAdminThirdPartyToolPolicies = loadAdminThirdPartyToolPolicies(session?.user.id ?? null);
  const [adminThirdPartyToolPolicies, setAdminThirdPartyToolPolicies] = createSignal<AdminThirdPartyToolPolicyRecord[]>(
    initialAdminThirdPartyToolPolicies,
  );
  const [adminThirdPartyToolPolicySourceLabel, setAdminThirdPartyToolPolicySourceLabel] = createSignal<string | null>(
    initialAdminThirdPartyToolPolicies.length > 0 ? "admin-third-party-tool-policy-local" : null,
  );
  const [adminThirdPartyToolPolicyBusyKey, setAdminThirdPartyToolPolicyBusyKey] = createSignal<string | null>(null);
  const [adminThirdPartyToolPolicyNotice, setAdminThirdPartyToolPolicyNotice] = createSignal<string | null>(null);
  const [adminThirdPartyToolPolicyError, setAdminThirdPartyToolPolicyError] = createSignal<string | null>(null);
  const [operationalCommandNotice, setOperationalCommandNotice] = createSignal<string | null>(null);
  const [runtimeRemediationReceipt, setRuntimeRemediationReceipt] = createSignal<OperatorRuntimeRemediationReceipt | null>(null);
  const [runtimeRemediationBusy, setRuntimeRemediationBusy] = createSignal(false);
  const [runtimeRemediationCompleteBusyId, setRuntimeRemediationCompleteBusyId] = createSignal<string | null>(null);
  const [runtimeRemediationOutcomeNotes, setRuntimeRemediationOutcomeNotes] = createSignal<Record<string, string>>(
    loadOperatorRuntimeRemediationOutcomeNotes(operatorRuntimeRemediationUserId()),
  );
  const [runtimeRemediationProofReferences, setRuntimeRemediationProofReferences] = createSignal<Record<string, string>>(
    loadOperatorRuntimeRemediationProofReferences(operatorRuntimeRemediationUserId()),
  );
  const [runtimeRemediationFeaturedReceiptId, setRuntimeRemediationFeaturedReceiptId] = createSignal<string | null>(
    loadOperatorRuntimeRemediationFeaturedReceiptId(operatorRuntimeRemediationUserId()),
  );
  const [runtimeRemediationFilter, setRuntimeRemediationFilter] = createSignal<OperatorRuntimeRemediationFilter>(
    loadOperatorRuntimeRemediationFilter(operatorRuntimeRemediationUserId()),
  );
  const [billing, { mutate: setBilling }] = createResource<BillingStatus | null>(
    async () => loadUsageViewBillingState(!!session?.token),
  );
  const readBilling = () => billing.error ? null : billing();
  const [operatorResourceBundle, { refetch: refetchOperatorResourceBundle }] = createResource(
    () => (session?.token ? {
      nonce: operatorReloadNonce(),
      query: operatorQuery(),
    } : null),
    loadUsageViewOperatorResourceBundleState,
  );
  const [operatorUserDetail, { refetch: refetchOperatorUserDetail }] = createResource(
    selectedOperatorUserId,
    async (userId) => loadUsageViewOperatorUserDetailState(userId),
  );
  const {
    persistRuntimeRemediationFilter,
    persistRuntimeRemediationFeaturedReceiptId,
    persistRuntimeRemediationOutcomeNotes,
    persistRuntimeRemediationProofReferences,
  } = readUsageViewOperatorRemediationPersistenceAdapters({
    operatorRuntimeRemediationUserId,
    setRuntimeRemediationFilter,
    setRuntimeRemediationFeaturedReceiptId,
    setRuntimeRemediationOutcomeNotes,
    setRuntimeRemediationProofReferences,
  });
  createEffect(() => {
    syncUsageViewOperatorRemediationPersistence({
      entries: operatorRuntimeRemediationDerivedState().entries,
      drafts: {
        outcomeNotes: runtimeRemediationOutcomeNotes(),
        proofReferences: runtimeRemediationProofReferences(),
      },
      currentFilter: runtimeRemediationFilter(),
      featuredReceiptId: runtimeRemediationFeaturedReceiptId(),
      activeReceipt: runtimeRemediationReceipt(),
      persistRuntimeRemediationOutcomeNotes,
      persistRuntimeRemediationProofReferences,
      persistRuntimeRemediationFilter,
      persistRuntimeRemediationFeaturedReceiptId,
      setRuntimeRemediationReceipt,
    });
  });
  const connectedAppIds = () => loadConnectedAppIds(session?.user.id ?? null, validConnectedAppIds);
  const weddingApiStackConnectedAppIds = () => operatorResourceBundle()?.adminWeddingApiStack?.connectedAppIds ?? connectedAppIds();
  const weddingApiStack = createMemo(() => buildWeddingApiStackState({ connectedAppIds: weddingApiStackConnectedAppIds() }));
  const effectiveAdminThirdPartyToolPolicies = () =>
    adminThirdPartyToolPolicies().length > 0
      ? adminThirdPartyToolPolicies()
      : operatorResourceBundle()?.adminThirdPartyToolPolicy?.policies ?? [];
  const effectiveAdminThirdPartyToolPolicySourceLabel = () =>
    adminThirdPartyToolPolicySourceLabel() ?? operatorResourceBundle()?.adminThirdPartyToolPolicy?.sourceLabel ?? null;
  const externalToolDerivedState = createMemo(() => readExternalToolDerivedState({
    billing: readBilling()?.external_tool_billing,
    quotaState: readBilling()?.quota_state,
    weddingApiStack: weddingApiStack(),
    adminThirdPartyToolPolicies: effectiveAdminThirdPartyToolPolicies(),
    adminThirdPartyToolPolicySourceLabel: effectiveAdminThirdPartyToolPolicySourceLabel(),
    formatCostLabel: moneyLabel,
  }));
  const operatorUsersList = () => operatorResourceBundle()?.users?.users ?? [];
  const operatorDerivedState = createMemo(() => readOperatorDerivedState({
    hasSessionToken: !!session?.token,
    usersLoading: operatorResourceBundle.loading,
    profitLoading: operatorResourceBundle.loading,
    remediationHistoryLoading: operatorResourceBundle.loading,
    usersValue: operatorResourceBundle()?.users,
    profitValue: operatorResourceBundle()?.profit,
    remediationHistoryValue: operatorResourceBundle()?.remediationHistory,
    usersError: operatorResourceBundle()?.usersError,
    profitError: operatorResourceBundle()?.profitError,
    remediationHistoryError: operatorResourceBundle()?.remediationHistoryError,
    formatMoneyLabel: moneyLabel,
    formatArtifactSummary: ({ generatedAt, source }) => readArtifactSourceSummaryLine({
      artifactUpdatedLabel: readMountedDateTimeLabel(generatedAt) ?? generatedAt,
      source,
    }),
    runtimeRemediationBusy: runtimeRemediationBusy(),
  }));
  const operatorRuntimeRemediationDerivedState = createMemo(() => readOperatorRuntimeRemediationDerivedState({
    history: operatorResourceBundle()?.remediationHistory,
    activeReceipt: runtimeRemediationReceipt(),
    pinnedReceiptId: runtimeRemediationFeaturedReceiptId(),
    currentFilter: runtimeRemediationFilter(),
    outcomeNotes: runtimeRemediationOutcomeNotes(),
    proofReferences: runtimeRemediationProofReferences(),
    completionBusyReceiptId: runtimeRemediationCompleteBusyId(),
  }));
  const focusRuntimeRemediationQueueForReceipt = (receipt: OperatorRuntimeRemediationReceipt | null | undefined) => {
    focusUsageViewRuntimeRemediationQueueForReceipt({
      receipt,
      nextFilterForReceipt: operatorRuntimeRemediationDerivedState().nextFilterForReceipt,
      persistRuntimeRemediationFilter,
    });
  };
  const focusFeaturedRuntimeRemediationQueue = readUsageViewFocusFeaturedQueueHandler({
    focusQueueForReceipt: focusRuntimeRemediationQueueForReceipt,
    featuredReceipt: () => operatorRuntimeRemediationDerivedState().featuredReceipt,
  });
  const focusLatestRuntimeRemediationQueue = readUsageViewFocusLatestQueueHandler({
    focusQueueForReceipt: focusRuntimeRemediationQueueForReceipt,
    latestReceipt: runtimeRemediationReceipt,
  });
  const externalToolSectionModel = createMemo(() => readExternalToolSectionModel({
    estimatedToolSpendLabel: externalToolDerivedState().estimatedToolSpendLabel,
    estimateDetail: externalToolDerivedState().estimateDetail,
    overviewCards: externalToolDerivedState().overviewCards,
    categoryCards: externalToolDerivedState().categoryCards,
    connectionCards: externalToolDerivedState().connectionCards,
    connectedLineItems: externalToolDerivedState().connectedLineItems,
    connectedUsageEvents: externalToolDerivedState().connectedUsageEvents,
    builtInLineItems: externalToolDerivedState().builtInLineItems,
    builtInUsageEvents: externalToolDerivedState().builtInUsageEvents,
    costTrustPanel: externalToolDerivedState().costTrustPanel,
    adminThirdPartyToolPolicy: externalToolDerivedState().adminThirdPartyToolPolicy,
    onToggleAdminThirdPartyTool: (toolId: string, scope: AdminThirdPartyToolScope, enabled: boolean) =>
      void toggleAdminThirdPartyTool(toolId, scope, enabled),
    adminThirdPartyToolPolicyNotice: adminThirdPartyToolPolicyNotice(),
    adminThirdPartyToolPolicyError: adminThirdPartyToolPolicyError(),
    adminThirdPartyToolPolicyBusyKey: adminThirdPartyToolPolicyBusyKey(),
  }));
  const operatorSectionModel = createMemo(() => readUsageViewOperatorMountedSectionModel({
    operatorDerivedState: operatorDerivedState(),
    operatorRuntimeRemediationDerivedState: operatorRuntimeRemediationDerivedState(),
    operatorUserDetail: operatorUserDetail(),
    operatorUsersQuery: operatorResourceBundle()?.users?.query,
    operatorQueryDraft: operatorQueryDraft(),
    operatorQueryApplied: operatorQuery(),
    operatorUsersLoading: operatorResourceBundle.loading,
    operatorProfitLoading: operatorResourceBundle.loading,
    selectedOperatorUserId: selectedOperatorUserId(),
    operatorActionBusyUserId: operatorActionBusyUserId(),
    operatorActionError: operatorActionError(),
    operatorActionNotice: operatorActionNotice(),
    runtimeRemediationReceipt: runtimeRemediationReceipt(),
    runtimeRemediationBusy: runtimeRemediationBusy(),
    runtimeRemediationFilter: runtimeRemediationFilter(),
    runtimeRemediationFeaturedReceiptId: runtimeRemediationFeaturedReceiptId(),
    runtimeRemediationOutcomeNotes: runtimeRemediationOutcomeNotes(),
    runtimeRemediationProofReferences: runtimeRemediationProofReferences(),
    runtimeRemediationCompleteBusyId: runtimeRemediationCompleteBusyId(),
    routeWeddingAiThroughAdmin: routeWeddingAiThroughAdmin(),
    connectedAppIds: connectedAppIds(),
    adminWeddingOpsOracleMetricsPayload: operatorResourceBundle()?.adminWeddingOpsMetrics,
    adminWeddingAiRoutingPolicyPayload: operatorResourceBundle()?.adminWeddingAiRoutingPolicy,
    adminWeddingApiStackPayload: operatorResourceBundle()?.adminWeddingApiStack,
    formatDateTimeLabel: readMountedDateTimeLabel,
    formatMoneyLabel: moneyLabel,
  }));

  async function copyOperationalCommand(
    command: string | null | undefined,
    label: "workspace" | "operator",
  ) {
    await copyUsageViewOperationalCommand({
      command,
      label,
      guardState: {
        modeSaving: modeSaving(),
        billingActionBusy: billingActionBusy(),
      },
      requestCounter: operationalCommandRequestCounter,
      writeText: navigator.clipboard?.writeText?.bind(navigator.clipboard),
      setOperationalCommandNotice,
      setBillingActionError,
    });
  }

  async function copyUpgradeRequest() {
    await copyUsageViewUpgradeRequest({
      billing: readBilling(),
      sessionEmail: session?.user.email,
      guardState: {
        modeSaving: modeSaving(),
        billingActionBusy: billingActionBusy(),
      },
      requestCounter: copyUpgradeRequestCounter,
      writeText: navigator.clipboard?.writeText?.bind(navigator.clipboard),
      setModeError,
      setUpgradeActionNotice,
      setBillingActionError,
      setBillingActionBusy,
    });
  }

  async function toggleArchiveOnlyMode(enabled: boolean) {
    await toggleUsageViewArchiveOnlyMode({
      enabled,
      guardState: {
        modeSaving: modeSaving(),
        billingActionBusy: billingActionBusy(),
        hasBilling: !!readBilling(),
      },
      requestCounter: archiveOnlyModeRequestCounter,
      setBilling,
      setModeSaving,
      setModeError,
      setUpgradeActionNotice,
      setBillingActionError,
    });
  }

  async function startCheckout() {
    await startUsageViewCheckout({
      guardState: {
        modeSaving: modeSaving(),
        billingActionBusy: billingActionBusy(),
      },
      requestCounter: billingActionRequestCounter,
      createSession: () => createBillingCheckoutSession("pro"),
      redirectTo: (url) => {
        window.location.href = url;
      },
      setModeError,
      setUpgradeActionNotice,
      setBillingActionError,
      setBillingActionBusy,
    });
  }

  async function openBillingPortal() {
    await openUsageViewBillingPortal({
      guardState: {
        modeSaving: modeSaving(),
        billingActionBusy: billingActionBusy(),
      },
      requestCounter: billingActionRequestCounter,
      createSession: () => createBillingPortalSession(),
      redirectTo: (url) => {
        window.location.href = url;
      },
      setModeError,
      setUpgradeActionNotice,
      setBillingActionError,
      setBillingActionBusy,
    });
  }

  function refreshOperatorPanel() {
    setOperatorReloadNonce((value) => value + 1);
  }

  async function toggleAdminThirdPartyTool(
    toolId: string,
    scope: AdminThirdPartyToolScope,
    enabled: boolean,
  ) {
    const busyKey = `${toolId}:${scope}`;
    if (adminThirdPartyToolPolicyBusyKey()) return;
    const nextPolicies = saveAdminThirdPartyToolPolicies(
      session?.user.id ?? null,
      nextAdminThirdPartyToolPolicy(effectiveAdminThirdPartyToolPolicies(), toolId, scope, enabled),
    );
    setAdminThirdPartyToolPolicies(nextPolicies);
    setAdminThirdPartyToolPolicySourceLabel("admin-third-party-tool-policy-local");
    setAdminThirdPartyToolPolicyBusyKey(busyKey);
    setAdminThirdPartyToolPolicyNotice("Saving shared tool policy...");
    setAdminThirdPartyToolPolicyError(null);
    try {
      const saved = await saveAdminThirdPartyToolPolicy({
        policies: nextPolicies.map((policy) => ({
          toolId: policy.toolId,
          enabledForAllUsers: policy.enabledForAllUsers === true,
          enabledForWeddingTemplate: policy.enabledForWeddingTemplate === true,
          monthlyFreeQuotaLabel: policy.monthlyFreeQuotaLabel ?? null,
          quotaUsedLabel: policy.quotaUsedLabel ?? null,
        })),
        updatedAt: new Date().toISOString(),
        sourceLabel: "usage-admin-shared-tool-policy",
      });
      const savedPolicies = saveAdminThirdPartyToolPolicies(session?.user.id ?? null, saved.policies);
      setAdminThirdPartyToolPolicies(savedPolicies);
      setAdminThirdPartyToolPolicySourceLabel(saved.sourceLabel ?? "admin-third-party-tool-policy-file");
      setAdminThirdPartyToolPolicyNotice("Shared tool policy saved.");
      void refetchOperatorResourceBundle();
    } catch {
      setAdminThirdPartyToolPolicyNotice(null);
      setAdminThirdPartyToolPolicyError(
        "Saved in this browser only. Ask an operator to set OMNYID_ADMIN_THIRD_PARTY_TOOL_POLICY_FILE for server persistence.",
      );
    } finally {
      setAdminThirdPartyToolPolicyBusyKey(null);
    }
  }

  function applyOperatorQuery(event: Event) {
    event.preventDefault();
    applyUsageViewOperatorQuery({
      queryDraft: operatorQueryDraft(),
      setOperatorQuery,
      refreshOperatorPanel,
    });
  }

  function clearOperatorQuery() {
    clearUsageViewOperatorQuery({
      setOperatorQueryDraft,
      setOperatorQuery,
      refreshOperatorPanel,
    });
  }

  function handleOperatorQueryShortcut(event: KeyboardEvent) {
    handleUsageViewOperatorQueryShortcut({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      loading: operatorResourceBundle.loading,
      queryDraft: operatorQueryDraft(),
      preventDefault: () => event.preventDefault(),
      recordShortcutUse,
      clearOperatorQuery,
      setOperatorQuery,
      refreshOperatorPanel,
    });
  }

  function handleOperatorRuntimeRemediationShortcut(event: KeyboardEvent) {
    handleUsageViewOperatorRuntimeRemediationKeyDown({
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      key: event.key,
      target: event.target,
      preventDefault: () => event.preventDefault(),
      featuredReceiptId: operatorRuntimeRemediationDerivedState().featuredReceiptId,
      featuredCommand: operatorRuntimeRemediationDerivedState().featuredReceipt?.command,
      featuredDraftReceiptId: operatorRuntimeRemediationDerivedState().featuredCardModel.receiptId,
      canCompleteFeaturedDraft: operatorRuntimeRemediationDerivedState().featuredCardModel.canCompleteFromDraft,
      recordShortcutUse,
      issueReceipt: () => void issueRuntimeRemediationReceipt(),
      completeReceipt: (nextReceiptId) => void completeRuntimeRemediationReceipt(nextReceiptId),
      focusFeaturedQueue: focusFeaturedRuntimeRemediationQueue,
      copyOperationalCommand,
      setFilter: persistRuntimeRemediationFilter,
      clearFeaturedReceipt: () => persistRuntimeRemediationFeaturedReceiptId(null),
      clearAllDrafts: clearAllRuntimeRemediationDrafts,
    });
  }

  async function triggerOperatorAction(
    userId: string,
    action: UsageViewOperatorAction,
  ) {
    await triggerUsageViewOperatorAction({
      userId,
      action,
      busyUserId: operatorActionBusyUserId(),
      setOperatorActionBusyUserId,
      setOperatorActionError,
      setOperatorActionNotice,
      setSelectedOperatorUserId,
      refreshOperatorPanel: () => void refetchOperatorResourceBundle(),
      refetchOperatorUserDetail: () => void refetchOperatorUserDetail(),
    });
  }

  async function issueRuntimeRemediationReceipt() {
    await issueUsageViewRuntimeRemediationReceipt({
      busy: runtimeRemediationBusy(),
      setRuntimeRemediationBusy,
      setOperatorActionError,
      setOperatorActionNotice,
      setRuntimeRemediationReceipt,
      persistRuntimeRemediationFeaturedReceiptId,
      persistRuntimeRemediationFilter,
      refetchOperatorRuntimeRemediationHistory: () => void refetchOperatorResourceBundle(),
    });
  }

  async function completeRuntimeRemediationReceipt(receiptId: string) {
    await completeUsageViewRuntimeRemediationReceipt({
      receiptId,
      busyReceiptId: runtimeRemediationCompleteBusyId(),
      drafts: {
        outcomeNotes: runtimeRemediationOutcomeNotes(),
        proofReferences: runtimeRemediationProofReferences(),
      },
      currentFilter: runtimeRemediationFilter(),
      entries: operatorRuntimeRemediationDerivedState().entries,
      setRuntimeRemediationCompleteBusyId,
      setOperatorActionError,
      setOperatorActionNotice,
      setRuntimeRemediationReceipt,
      persistRuntimeRemediationFeaturedReceiptId,
      persistRuntimeRemediationFilter,
      persistRuntimeRemediationOutcomeNotes,
      persistRuntimeRemediationProofReferences,
      refetchOperatorRuntimeRemediationHistory: () => void refetchOperatorResourceBundle(),
    });
  }

  function updateRuntimeRemediationOutcomeNote(receiptId: string, value: string) {
    updateUsageViewRuntimeRemediationDraft({
      drafts: {
        outcomeNotes: runtimeRemediationOutcomeNotes(),
        proofReferences: runtimeRemediationProofReferences(),
      },
      currentFilter: runtimeRemediationFilter(),
      receiptId,
      value,
      field: "outcome",
      persistRuntimeRemediationOutcomeNotes,
      persistRuntimeRemediationProofReferences,
      persistRuntimeRemediationFilter,
    });
  }

  function updateRuntimeRemediationProofReference(receiptId: string, value: string) {
    updateUsageViewRuntimeRemediationDraft({
      drafts: {
        outcomeNotes: runtimeRemediationOutcomeNotes(),
        proofReferences: runtimeRemediationProofReferences(),
      },
      currentFilter: runtimeRemediationFilter(),
      receiptId,
      value,
      field: "proof",
      persistRuntimeRemediationOutcomeNotes,
      persistRuntimeRemediationProofReferences,
      persistRuntimeRemediationFilter,
    });
  }

  function clearRuntimeRemediationDraft(receiptId: string) {
    clearUsageViewRuntimeRemediationDraft({
      drafts: {
        outcomeNotes: runtimeRemediationOutcomeNotes(),
        proofReferences: runtimeRemediationProofReferences(),
      },
      currentFilter: runtimeRemediationFilter(),
      receiptId,
      persistRuntimeRemediationOutcomeNotes,
      persistRuntimeRemediationProofReferences,
      persistRuntimeRemediationFilter,
    });
  }

  function clearAllRuntimeRemediationDrafts() {
    clearAllUsageViewRuntimeRemediationDrafts({
      currentFilter: runtimeRemediationFilter(),
      persistRuntimeRemediationOutcomeNotes,
      persistRuntimeRemediationProofReferences,
      persistRuntimeRemediationFilter,
    });
  }

  const copyWorkspaceOperationalCommand = readUsageViewCopyWorkspaceOperationalCommand({
    billing: readBilling(),
    copyOperationalCommand,
  });
  const copyOperatorCommand = readUsageViewCopyOperatorCommand({
    copyOperationalCommand,
  });
  const handleFeaturedReceiptAction = readUsageViewFeaturedReceiptActionHandler({
    featuredCommand: () => operatorRuntimeRemediationDerivedState().featuredReceipt?.command,
    focusFeaturedQueue: focusFeaturedRuntimeRemediationQueue,
    copyOperatorCommand,
    clearFeaturedReceipt: () => persistRuntimeRemediationFeaturedReceiptId(null),
  });
  const handleFeaturedDraftAction = readUsageViewFeaturedDraftActionHandler({
    completeReceipt: (nextReceiptId) => void completeRuntimeRemediationReceipt(nextReceiptId),
    showDrafts: () => persistRuntimeRemediationFilter("drafts"),
    clearDraft: clearRuntimeRemediationDraft,
  });
  const handleClearUserFilter = readUsageViewClearUserFilterHandler({
    recordClearShortcut: () => recordShortcutUse("form_cancel"),
    clearOperatorQuery,
  });
  const handleCloseUserDetail = readUsageViewCloseUserDetailHandler({
    clearSelectedUser: () => setSelectedOperatorUserId(null),
    clearOperatorActionError: () => setOperatorActionError(null),
  });
  const usageBillingSectionProps = createMemo(() => readUsageViewBillingMountedSectionProps({
    billing: readBilling(),
    billingLoading: billing.loading,
    billingError: billing.error,
    sessionEmail: session?.user.email,
    modeSaving: modeSaving(),
    billingActionBusy: billingActionBusy(),
    modeError: modeError(),
    billingActionError: billingActionError(),
    upgradeActionNotice: upgradeActionNotice(),
    operationalCommandNotice: operationalCommandNotice(),
    onCopyOperationalCommand: copyWorkspaceOperationalCommand,
    onToggleArchiveOnlyMode: (enabled) => void toggleArchiveOnlyMode(enabled),
    onStartCheckout: () => void startCheckout(),
    onCopyUpgradeRequest: () => void copyUpgradeRequest(),
    onOpenBillingPortal: () => void openBillingPortal(),
    formatArtifactSummary: ({ artifactUpdatedLabel, source }) => readArtifactSourceSummaryLine({
      artifactUpdatedLabel: readMountedDateTimeLabel(artifactUpdatedLabel) ?? artifactUpdatedLabel,
      source,
    }),
  }));
  const usageOperatorSectionProps = createMemo(() => readUsageOperatorSectionProps(readUsageViewOperatorMountedSectionProps({
    operatorSectionModel: operatorSectionModel(),
    onKeyDown: handleOperatorRuntimeRemediationShortcut,
    onRefresh: refreshOperatorPanel,
    onCopyOverviewCommand: copyOperatorCommand,
    onIssueReceipt: () => void issueRuntimeRemediationReceipt(),
    onFeaturedAction: (actionKind, _receiptId) => handleFeaturedReceiptAction(actionKind),
    onFeaturedDraftAction: handleFeaturedDraftAction,
    onSelectHistoryFilter: persistRuntimeRemediationFilter,
    onClearAllDrafts: clearAllRuntimeRemediationDrafts,
    onFocusLatest: focusLatestRuntimeRemediationQueue,
    onFocusFeatured: focusFeaturedRuntimeRemediationQueue,
    onPinSummary: persistRuntimeRemediationFeaturedReceiptId,
    onCopyFeedCommand: copyOperatorCommand,
    onToggleWeddingAiRouting: setRouteWeddingAiThroughAdmin,
    onOutcomeDraftChange: updateRuntimeRemediationOutcomeNote,
    onProofDraftChange: updateRuntimeRemediationProofReference,
    onCompleteReceipt: (receiptId) => void completeRuntimeRemediationReceipt(receiptId),
    onClearDraft: clearRuntimeRemediationDraft,
    onUserFilterDraftChange: setOperatorQueryDraft,
    onUserFilterSubmit: applyOperatorQuery,
    onUserFilterKeyDown: handleOperatorQueryShortcut,
    onClearUserFilter: handleClearUserFilter,
    onInspectUser: setSelectedOperatorUserId,
    onRunUserAction: (userId, action) => void triggerOperatorAction(userId, action),
    onCloseUserDetail: handleCloseUserDetail,
  })));

  return (
    <div class="space-y-5">
      <div class="glass-surface rounded-[24px] border border-white/40 p-6 shadow-panel">
        <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Usage</p>
        <h3 class="mt-2 text-lg font-semibold text-on-surface">Plan, billing, and usage</h3>
        <p class="mt-1 text-sm leading-6 text-on-surface-variant">
          Billing status, archive-only storage controls, and Stripe subscription sync are mounted. Exact usage-cost charging still needs broader verification.
        </p>

        <Show
          when={session?.token}
          fallback={
            <div class="mt-4 rounded-2xl border border-amber-300/40 bg-amber-50/60 p-4 text-sm text-on-surface-variant">
              Sign in to view your plan and payment details.
            </div>
          }
        >
          <UsageBillingSection {...usageBillingSectionProps()} />

          <Show when={operatorDerivedState().operatorSectionVisible}>
            <ErrorBoundary fallback={(_, reset) => <div role="alert">
              <p>Admin tools could not be loaded. Your workspace is still available.</p>
              <button type="button" onClick={reset}>Retry admin tools</button>
            </div>}>
              <UsageOperatorSection {...usageOperatorSectionProps()} />
            </ErrorBoundary>
          </Show>

          <UsageExternalToolBillingSection {...externalToolSectionModel()} />
        </Show>
      </div>
    </div>
  );
}
