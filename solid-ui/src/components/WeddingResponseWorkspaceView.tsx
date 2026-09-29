// @locs-version: 2.1
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";

import { WeddingProjectionQueuePanel } from "@/components/WeddingProjectionQueuePanel";
import { WeddingWorkspaceContextPanels } from "@/components/WeddingWorkspaceContextPanels";
import { WeddingDecisionFocusCard } from "@/components/WeddingDecisionFocusCard";
import { WeddingHomeOverviewGrid } from "@/components/WeddingHomeOverviewGrid";
import { WeddingHomeStatusStrip } from "@/components/WeddingHomeStatusStrip";
import { WeddingNextStepCard } from "@/components/WeddingNextStepCard";
import { WeddingPlanningThreadsCard } from "@/components/WeddingPlanningThreadsCard";
import { WeddingProjectionApprovalCard } from "@/components/WeddingProjectionApprovalCard";
import { WeddingResilienceCardList } from "@/components/WeddingResilienceCardList";
import { WeddingVendorQuoteProofDrawer } from "@/components/WeddingVendorQuoteProofDrawer";
import { WeddingVendorQuoteReplyCard } from "@/components/WeddingVendorQuoteReplyCard";
import type { WeddingVendorChoiceSelectionSaveInput } from "@/components/WeddingArtifactDetailPanel";
import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import { WeddingWorkspaceDocumentsPanel } from "@/components/WeddingWorkspaceDocumentsPanel";
import { fetchThread, ingestAttachmentBatch, type AfpMessage } from "@/lib/api";
import type { EditorPayload } from "@/lib/editorPayload";
import { subscribeMagicActionEvent } from "@/lib/magicActionEvent";
import {
  runWeddingArtifactBrowserExport,
  runWeddingBundleBrowserExport,
  selectWeddingBundleExportPayload,
  weddingProjectionMetadataId,
  type WeddingBundleExportFormat,
} from "@/lib/weddingBrowserExportActions";
import { weddingDecisionDeferralActionToAfpSendInput } from "@/lib/weddingDecisionDeferralAfpState";
import {
  approveWeddingApprovalRequestState,
  type WeddingApprovalRequestState,
} from "@/lib/weddingApprovalState";
import {
  runWeddingApprovalExecution,
  type WeddingApprovalExecutionState,
} from "@/lib/weddingApprovalExecutionState";
import {
  weddingApprovalReceiptToAfpSendInput,
  weddingApprovalReceiptToVendorThreadAfpSendInput,
} from "@/lib/weddingApprovalReceiptAfpProjectionState";
import type { WeddingExportManifestEntry } from "@/lib/weddingExportState";
import {
  normalizeWeddingHomeSectionOrder,
  shouldShowWeddingHomeSection,
  WEDDING_HOME_SECTION_IDS,
  type WeddingHomeSectionId,
} from "@/lib/weddingHomeSectionPolicyState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import { buildWeddingResearchPromptAction } from "@/lib/weddingRecommendationGenerationActionState";
import { buildWeddingSelectedVendorFollowUpCtaState } from "@/lib/weddingSelectedVendorFollowUpCtaState";
import {
  buildWeddingVendorQuoteReplyFlowState,
  weddingVendorQuoteReplyConsentChangeState,
  weddingVendorQuoteReplyDraftEditEffect,
  weddingVendorQuoteReplyDraftPersistenceState,
  weddingVendorQuoteReplyDraftSaveCompletionState,
  weddingVendorQuoteReplyExecutionSelectionState,
  weddingVendorQuoteReplyRequestMatchState,
  weddingVendorQuoteReplyBusyLabelState,
  weddingVendorQuoteReplyPendingSendTokenState,
  weddingVendorQuoteReplyPendingSendRetryState,
  weddingVendorQuoteReplyScheduledSendResolutionState,
  weddingVendorQuoteReplyScheduledSendGateFlowState,
  weddingVendorQuoteReplySendGateState,
  weddingVendorQuoteDraftAfpSendInput,
  type WeddingVendorQuoteReplyDraftPersistenceStatus,
  type WeddingVendorQuoteReplyFlowState,
} from "@/lib/weddingVendorQuoteReplyFlowState";
import type { WeddingVendorQuoteAttachmentParserState } from "@/lib/weddingVendorQuoteAttachmentParserState";
import { buildWeddingVendorQuoteAttachmentIngestState } from "@/lib/weddingVendorQuoteAttachmentIngestState";
import {
  buildWeddingVendorQuoteThreadProofState,
  mergeWeddingVendorQuoteThreadProofMessages,
  weddingVendorQuoteLocalReceiptProofMessage,
  weddingVendorQuoteReceiptParentId,
} from "@/lib/weddingVendorQuoteThreadProofState";
import { weddingVendorQuoteReceiptPersistenceNotice } from "@/lib/weddingVendorQuoteReceiptPersistenceState";
import { buildWeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";
import { weddingVendorContactReferenceToAfpSendInput } from "@/lib/weddingVendorContactReferenceAfpState";

type WeddingHomeSection = {
  id: WeddingHomeSectionId;
  title: string;
  visible: boolean;
  render: () => JSX.Element;
};

function weddingHomeLayoutStorageKey(scope: string): string {
  return `omnyid:wedding_home_card_order:${scope}`;
}

function loadWeddingHomeSectionOrder(scope: string): WeddingHomeSectionId[] {
  if (typeof localStorage === "undefined") return [...WEDDING_HOME_SECTION_IDS];
  try {
    return normalizeWeddingHomeSectionOrder(JSON.parse(localStorage.getItem(weddingHomeLayoutStorageKey(scope)) ?? "[]"));
  } catch {
    return [...WEDDING_HOME_SECTION_IDS];
  }
}

function saveWeddingHomeSectionOrder(scope: string, order: readonly WeddingHomeSectionId[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(weddingHomeLayoutStorageKey(scope), JSON.stringify(normalizeWeddingHomeSectionOrder(order)));
  } catch {
    // Layout remains usable for the current page even when storage is unavailable.
  }
}

export function WeddingResponseWorkspaceView(props: WeddingResponseWorkspaceViewProps) {
  const state = () => props.state;
  const activePreview = () => state().activePreview;
  const [exportNotice, setExportNotice] = createSignal<string | null>(null);
  const [includeSensitiveBundle, setIncludeSensitiveBundle] = createSignal(false);
  const [bundleExportFormat, setBundleExportFormat] = createSignal<WeddingBundleExportFormat>("markdown");
  const [approvedRequests, setApprovedRequests] = createSignal<Record<string, true>>({});
  const [approvalRunning, setApprovalRunning] = createSignal(false);
  const [approvalRunningRequestId, setApprovalRunningRequestId] = createSignal<string | null>(null);
  const [approvalReceipt, setApprovalReceipt] = createSignal<WeddingApprovalExecutionState | null>(null);
  const [approvalReceiptSaveNotice, setApprovalReceiptSaveNotice] = createSignal<string | null>(null);
  const [quoteReplyProofSaveNotices, setQuoteReplyProofSaveNotices] = createSignal<Record<string, string>>({});
  const [showPlanningFiles, setShowPlanningFiles] = createSignal(false);
  const [quoteReplyDrafts, setQuoteReplyDrafts] = createSignal<Record<string, string>>({});
  const [quoteReplyDraftMessageIds, setQuoteReplyDraftMessageIds] = createSignal<Record<string, string>>({});
  const [quoteReplyDraftSaveAttempts, setQuoteReplyDraftSaveAttempts] = createSignal<Record<string, number>>({});
  const [quoteReplyDraftPersistence, setQuoteReplyDraftPersistence] = createSignal<
    Record<string, WeddingVendorQuoteReplyDraftPersistenceStatus>
  >({});
  const [quoteReplyApprovedWording, setQuoteReplyApprovedWording] = createSignal<Record<string, boolean>>({});
  const [quoteReplyBudgetAck, setQuoteReplyBudgetAck] = createSignal<Record<string, true>>({});
  const [quoteReplyUndoUntil, setQuoteReplyUndoUntil] = createSignal<Record<string, string>>({});
  const [quoteReplyLocalExecutions, setQuoteReplyLocalExecutions] = createSignal<Record<string, WeddingApprovalExecutionState>>({});
  const [quoteReplyClearedExecutionRequests, setQuoteReplyClearedExecutionRequests] = createSignal<Record<string, true>>({});
  const [quoteReplyNowIso, setQuoteReplyNowIso] = createSignal(new Date().toISOString());
  const [quoteReplyProofThread, setQuoteReplyProofThread] = createSignal<{
    threadId: string;
    vendorName: string;
    approvalRequestId: string;
    draftMessageId: string | null;
    execution: WeddingApprovalExecutionState | null;
  } | null>(null);
  const [quoteReplyProofMessages, setQuoteReplyProofMessages] = createSignal<AfpMessage[]>([]);
  const [quoteReplyProofLoading, setQuoteReplyProofLoading] = createSignal(false);
  const [quoteReplyProofError, setQuoteReplyProofError] = createSignal<string | null>(null);
  const [quoteAttachmentParsing, setQuoteAttachmentParsing] = createSignal<Record<string, true>>({});
  const [homeLayoutScope, setHomeLayoutScope] = createSignal("");
  const [homeSectionOrder, setHomeSectionOrder] = createSignal<WeddingHomeSectionId[]>([...WEDDING_HOME_SECTION_IDS]);
  const [draggingHomeSectionId, setDraggingHomeSectionId] = createSignal<WeddingHomeSectionId | null>(null);
  const [homeControlsSectionId, setHomeControlsSectionId] = createSignal<WeddingHomeSectionId | null>(null);
  let homeControlsHideTimer: number | undefined;
  const localQuoteReplyReceiptProofMessage = (): AfpMessage | null => {
    const thread = quoteReplyProofThread();
    const execution = thread
      ? weddingVendorQuoteReplyExecutionSelectionState({
        localExecution: quoteReplyExecutionForRequest(thread.approvalRequestId),
        persistedExecution: thread.execution,
        cleared: quoteReplyClearedExecutionRequests()[thread.approvalRequestId] === true,
      }).execution
      : approvalReceipt();
    return weddingVendorQuoteLocalReceiptProofMessage({
      receipt: execution?.receipt,
      threadId: thread?.threadId,
      parentId: weddingVendorQuoteReceiptParentId(
        quoteReplyProofMessages(),
        thread?.approvalRequestId ?? execution?.requestId,
      ) ?? thread?.draftMessageId ?? null,
    });
  };
  const quoteReplyProofRows = () => buildWeddingVendorQuoteThreadProofState(
    mergeWeddingVendorQuoteThreadProofMessages(
      quoteReplyProofMessages(),
      [localQuoteReplyReceiptProofMessage()].filter((message): message is AfpMessage => Boolean(message)),
    ),
  );
  const activeMenu = () => props.activeMenu ?? "home";
  const showTechnicalDetails = () => activeMenu() === "advanced";
  const compactMode = () => Boolean(props.compact);
  const contextOnlyMenu = () => !["home", "documents", "advanced"].includes(activeMenu());
  const rootClass = () => {
    const spacing = compactMode() ? "gap-3" : "gap-4";
    return contextOnlyMenu() ? `grid min-w-0 ${spacing}` : `grid min-w-0 ${spacing} xl:grid-cols-2`;
  };
  const primaryColumnClass = () => {
    const spacing = compactMode() ? "space-y-3" : "space-y-4";
    if (contextOnlyMenu()) return "hidden";
    return activeMenu() === "home" ? `min-w-0 ${spacing} xl:col-span-2` : `min-w-0 ${spacing}`;
  };
  const sidebarClass = () => {
    const spacing = compactMode() ? "space-y-3" : "space-y-4";
    return contextOnlyMenu() ? `min-w-0 ${spacing}` : `min-w-0 ${spacing} xl:sticky xl:top-4 xl:self-start`;
  };
  const cardClass = () => compactMode()
    ? "rounded-[20px] border border-white/60 bg-white/75 p-3 shadow-card backdrop-blur sm:rounded-[24px]"
    : "rounded-[24px] border border-white/60 bg-white/75 p-3 shadow-card backdrop-blur sm:rounded-[28px] sm:p-4";
  const homeLayoutStorageScope = () =>
    state().workspace.metadata.weddingPlanId
    || state().workspace.metadata.responseWorkspaceId
    || "default";
  createEffect(() => {
    if (state().workspace.activeArtifact) setShowPlanningFiles(true);
  });

  createEffect(() => {
    const scope = homeLayoutStorageScope();
    if (homeLayoutScope() === scope) return;
    setHomeLayoutScope(scope);
    setHomeSectionOrder(loadWeddingHomeSectionOrder(scope));
  });

  createEffect(() => {
    const scope = homeLayoutScope();
    if (!scope) return;
    saveWeddingHomeSectionOrder(scope, homeSectionOrder());
  });

  onMount(() => {
    const unsubscribe = subscribeMagicActionEvent((detail) => {
      if (!detail.msgId?.startsWith("wedding:")) return;
      const element = detail.el;
      if (!(element instanceof HTMLElement)) return;
      const primaryAction = element.getAttribute("data-magic-action");
      if (primaryAction && detail.action !== primaryAction) return;
      element.click();
    });
    onCleanup(unsubscribe);
  });

  onCleanup(() => {
    if (homeControlsHideTimer !== undefined) window.clearTimeout(homeControlsHideTimer);
  });

  createEffect(() => {
    const hasActiveUndo = Object.keys(quoteReplyUndoUntil()).length > 0;
    if (!hasActiveUndo) return;
    setQuoteReplyNowIso(new Date().toISOString());
    const timer = window.setInterval(() => {
      // This clock only updates the visible countdown; the delayed send consumes the undo token.
      setQuoteReplyNowIso(new Date().toISOString());
    }, 500);
    onCleanup(() => window.clearInterval(timer));
  });

  function approvedApprovalRequest(request: WeddingApprovalRequestState): WeddingApprovalRequestState {
    return approvedRequests()[request.id] ? approveWeddingApprovalRequestState(request) : request;
  }

  async function copyActiveArtifact() {
    const preview = activePreview();
    if (!preview?.bodyText) return;
    try {
      await navigator.clipboard.writeText(preview.bodyText);
      setExportNotice("Copied planning text.");
    } catch {
      setExportNotice("Clipboard copy is unavailable in this browser.");
    }
  }

  function runExport(entry: WeddingExportManifestEntry) {
    const preview = activePreview();
    const bodyText = preview?.bodyText;
    if (!bodyText) return;
    setExportNotice(runWeddingArtifactBrowserExport({
      title: preview.title || "Wedding export",
      bodyText,
      entry,
    }));
  }

  function runBundleExport() {
    const payload = selectWeddingBundleExportPayload({
      state: state(),
      format: bundleExportFormat(),
      includeSensitive: includeSensitiveBundle(),
    });
    setExportNotice(runWeddingBundleBrowserExport(payload));
  }

  function saveVendorChoiceSelection(input: WeddingVendorChoiceSelectionSaveInput) {
    if (!props.saveProjection) {
      setExportNotice("Vendor selected. Account saving is not connected yet, so contact details are only local for now.");
      return;
    }
    setExportNotice(`Saving ${input.optionLabel}'s contact details to the wedding record...`);
    void props.saveProjection(weddingVendorContactReferenceToAfpSendInput({
      metadata: state().workspace.metadata,
      artifactId: input.artifact.artifactId,
      artifactTitle: input.artifact.title,
      optionId: input.optionId,
      optionLabel: input.optionLabel,
      contact: input.contact,
    }))
      .then(() => {
        setExportNotice(`${input.optionLabel} saved for vendor follow-up.`);
        props.onRefreshWorkspace?.();
      })
      .catch(() => {
        setExportNotice(`${input.optionLabel} was selected, but the contact details could not be saved yet.`);
      });
  }

  function handleSidebarAction(action: WeddingWorkspaceSidebarAction) {
    if (action.kind === "defer_decision") {
      const sendInput = weddingDecisionDeferralActionToAfpSendInput(action, state().workspace.metadata);
      if (!sendInput) {
        setExportNotice("Moved out of the top three for now, but this could not be saved to your wedding record.");
      } else if (!props.saveProjection) {
        setExportNotice("Moved out of the top three for now. Account saving is not connected yet.");
      } else {
        setExportNotice("Saving this for later...");
        void props.saveProjection(sendInput)
          .then(() => {
            setExportNotice("Saved for later. OmnyID will bring it back before it becomes urgent or if details change.");
            props.onRefreshWorkspace?.();
          })
          .catch(() => {
            setExportNotice("Moved out of the top three for now, but the save record could not be stored.");
          });
      }
    }
    if (action.kind === "export_bundle") runBundleExport();
    props.onSidebarAction?.(action);
  }

  function moveHomeSectionToIndex(id: WeddingHomeSectionId, targetVisibleIndex: number) {
    const visibleSections = orderedHomeSections();
    const currentVisibleIndex = visibleSections.findIndex((section) => section.id === id);
    if (currentVisibleIndex < 0 || targetVisibleIndex < 0 || targetVisibleIndex >= visibleSections.length || currentVisibleIndex === targetVisibleIndex) return;
    setHomeSectionOrder((currentOrder) => {
      const current = normalizeWeddingHomeSectionOrder(currentOrder);
      const visibleIds = visibleSections.map((section) => section.id);
      const reorderedVisibleIds = [...visibleIds];
      const [moving] = reorderedVisibleIds.splice(currentVisibleIndex, 1);
      reorderedVisibleIds.splice(targetVisibleIndex, 0, moving!);
      const visibleOrder = new Map(reorderedVisibleIds.map((sectionId, order) => [sectionId, order]));
      return current.slice().sort((left, right) => {
        const leftVisibleOrder = visibleOrder.get(left);
        const rightVisibleOrder = visibleOrder.get(right);
        if (leftVisibleOrder !== undefined && rightVisibleOrder !== undefined) return leftVisibleOrder - rightVisibleOrder;
        if (leftVisibleOrder !== undefined) return -1;
        if (rightVisibleOrder !== undefined) return 1;
        return current.indexOf(left) - current.indexOf(right);
      });
    });
  }

  function dropHomeSection(targetId: WeddingHomeSectionId) {
    const sourceId = draggingHomeSectionId();
    setDraggingHomeSectionId(null);
    if (!sourceId || sourceId === targetId) return;
    const targetIndex = orderedHomeSections().findIndex((section) => section.id === targetId);
    moveHomeSectionToIndex(sourceId, targetIndex);
  }

  function showHomeSectionControls(sectionId: WeddingHomeSectionId) {
    if (homeControlsHideTimer !== undefined) {
      window.clearTimeout(homeControlsHideTimer);
      homeControlsHideTimer = undefined;
    }
    setHomeControlsSectionId(sectionId);
  }

  function scheduleHideHomeSectionControls(sectionId: WeddingHomeSectionId) {
    if (draggingHomeSectionId() === sectionId) return;
    if (homeControlsHideTimer !== undefined) window.clearTimeout(homeControlsHideTimer);
    homeControlsHideTimer = window.setTimeout(() => {
      if (homeControlsSectionId() === sectionId && draggingHomeSectionId() !== sectionId) {
        setHomeControlsSectionId(null);
      }
      homeControlsHideTimer = undefined;
    }, 500);
  }

  function updateHomeSectionControlsFromPointer(sectionId: WeddingHomeSectionId, event: MouseEvent & { currentTarget: HTMLDivElement }) {
    const rect = event.currentTarget.getBoundingClientRect();
    const nearVerticalEdge = event.clientY - rect.top < 56 || rect.bottom - event.clientY < 24;
    const nearHorizontalEdge = event.clientX - rect.left < 24 || rect.right - event.clientX < 24;
    if (nearVerticalEdge || nearHorizontalEdge) {
      showHomeSectionControls(sectionId);
      return;
    }
    scheduleHideHomeSectionControls(sectionId);
  }

  function homeSectionControlsVisible(sectionId: WeddingHomeSectionId): boolean {
    return homeControlsSectionId() === sectionId || draggingHomeSectionId() === sectionId;
  }

  function researchPromptAction(): WeddingWorkspaceSidebarAction {
    return buildWeddingResearchPromptAction({
      source: "documents",
      title: "Wedding research",
      query: props.query ?? state().workspace.query,
      state: state(),
    });
  }

  function activeResearchPromptAction(): WeddingWorkspaceSidebarAction | null {
    const preview = activePreview();
    if (!preview || preview.kind !== "research") return null;
    return buildWeddingResearchPromptAction({
      source: "artifact_detail",
      title: preview.title,
      artifactId: preview.artifactId,
      artifactKind: preview.kind,
      query: props.query ?? state().workspace.query,
      state: state(),
    });
  }

  function openArtifactFromContext(artifactId: string) {
    props.onSelectArtifact?.(artifactId);
    props.onSelectMenu?.("home");
    setShowPlanningFiles(true);
  }

  function openSelectedVendorFollowUpQueue() {
    const cta = buildWeddingSelectedVendorFollowUpCtaState(state().projectionQueue);
    props.onSelectMenu?.("home");
    setShowPlanningFiles(false);
    setExportNotice(cta.noticeLabel);
    if (!cta.shouldScrollToTarget || !cta.targetSectionId || typeof window === "undefined") return;
    window.setTimeout(() => {
      document.querySelector(`[data-wedding-home-section='${cta.targetSectionId}']`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  function openVendorQuoteReplySurface() {
    props.onSelectMenu?.(state().activeVendorQuoteReplyFlows.length > 0 ? "home" : "response_queue");
    setShowPlanningFiles(false);
    setExportNotice(
      state().activeVendorQuoteReplyFlows.length > 0
        ? "Continue this quote from the live vendor reply card. The document detail stays read-only so the decision cannot drift across two surfaces."
        : "This quote reply is no longer live. Check the vendor response log for the saved thread and delivery proof.",
    );
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      document.querySelector("[data-wedding-home-section='quote_replies']")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  function approveRequest(request: WeddingApprovalRequestState) {
    setApprovedRequests((current) => ({ ...current, [request.id]: true }));
    setApprovalReceipt(null);
    setApprovalReceiptSaveNotice(null);
  }

  function setApprovalSaveNoticeForRequest(request: WeddingApprovalRequestState, notice: string) {
    setApprovalReceiptSaveNotice(notice);
    if (request.delivery?.threadId) {
      setQuoteReplyProofSaveNotices((current) => ({ ...current, [request.id]: notice }));
    }
  }

  function quoteReplyExecutionForRequest(requestId: string): WeddingApprovalExecutionState | null {
    return quoteReplyLocalExecutions()[requestId]
      ?? (approvalReceipt()?.requestId === requestId ? approvalReceipt() : null);
  }

  function quoteReplyProofSaveNotice(requestId: string): string | null {
    return quoteReplyProofSaveNotices()[requestId]
      ?? (approvalReceipt()?.requestId === requestId ? approvalReceiptSaveNotice() : null);
  }

  function quoteReplyBusyLabel(requestId: string): string | null {
    return weddingVendorQuoteReplyBusyLabelState({
      requestId,
      runningRequestId: approvalRunning() ? approvalRunningRequestId() : null,
    }).label;
  }

  function clearLatestApprovalReceiptForRequest(requestId: string) {
    if (!weddingVendorQuoteReplyRequestMatchState({
      requestId,
      currentRequestId: approvalReceipt()?.requestId,
    }).matches) return;
    setApprovalReceipt(null);
    setApprovalReceiptSaveNotice(null);
  }

  function quoteReplyFlow(base: WeddingVendorQuoteReplyFlowState): WeddingVendorQuoteReplyFlowState {
    const latestDraft = quoteReplyDrafts()[base.id] ?? base.draftBody;
    const execution = weddingVendorQuoteReplyExecutionSelectionState({
      localExecution: quoteReplyExecutionForRequest(base.approvalRequest.id),
      persistedExecution: base.execution,
      cleared: quoteReplyClearedExecutionRequests()[base.approvalRequest.id] === true,
    }).execution;
    const approvedWording = quoteReplyApprovedWording()[base.id];
    return buildWeddingVendorQuoteReplyFlowState({
      quote: base.quote,
      metadata: base.metadata,
      recipient: base.recipient,
      subject: base.subject,
      draftBody: latestDraft,
      quoteMessageId: base.quoteMessageId,
      draftMessageId: quoteReplyDraftMessageIds()[base.id] ?? base.draftMessageId,
      approvedWording: typeof approvedWording === "boolean" ? approvedWording : base.approvedWording,
      budgetImpactAcknowledged: base.budgetImpactAcknowledged || quoteReplyBudgetAck()[base.id] === true,
      undoUntilIso: quoteReplyUndoUntil()[base.id] ?? null,
      nowIso: quoteReplyNowIso(),
      execution,
    });
  }

  function quoteReplyDraftPersistenceView(base: WeddingVendorQuoteReplyFlowState) {
    return weddingVendorQuoteReplyDraftPersistenceState({
      status: quoteReplyDraftPersistence()[base.id] ?? null,
    });
  }

  async function saveQuoteReplyDraft(base: WeddingVendorQuoteReplyFlowState, payload: EditorPayload) {
    const body = payload.markdown || payload.text;
    const previousBody = quoteReplyDrafts()[base.id] ?? base.draftBody;
    const editEffect = weddingVendorQuoteReplyDraftEditEffect({
      previousDraft: previousBody,
      nextDraft: body,
      approvedWording: quoteReplyApprovedWording()[base.id] ?? base.approvedWording,
      hadExecution: Boolean(
        quoteReplyExecutionForRequest(base.approvalRequest.id)
        ?? base.execution
      ),
    });
    setQuoteReplyDrafts((current) => ({ ...current, [base.id]: body }));
    const saveAttemptId = (quoteReplyDraftSaveAttempts()[base.id] ?? 0) + 1;
    setQuoteReplyDraftSaveAttempts((current) => ({ ...current, [base.id]: saveAttemptId }));
    setQuoteReplyDraftPersistence((current) => ({ ...current, [base.id]: "saving" }));
    if (editEffect.changed) {
      setQuoteReplyApprovedWording((current) => ({ ...current, [base.id]: editEffect.approvedWording }));
      setQuoteReplyUndoUntil((current) => {
        const next = { ...current };
        delete next[base.id];
        return next;
      });
      setQuoteReplyDraftMessageIds((current) => {
        const next = { ...current };
        delete next[base.id];
        return next;
      });
      if (editEffect.clearExecution) {
        clearLatestApprovalReceiptForRequest(base.approvalRequest.id);
        setQuoteReplyClearedExecutionRequests((current) => ({ ...current, [base.approvalRequest.id]: true }));
        setQuoteReplyLocalExecutions((current) => {
          const next = { ...current };
          delete next[base.approvalRequest.id];
          return next;
        });
        setQuoteReplyProofSaveNotices((current) => {
          const next = { ...current };
          delete next[base.approvalRequest.id];
          return next;
        });
      }
    }
    const flow = quoteReplyFlow({ ...base, draftBody: body });
    if (!props.saveProjection) {
      if (weddingVendorQuoteReplyDraftSaveCompletionState({
        attemptId: saveAttemptId,
        currentAttemptId: quoteReplyDraftSaveAttempts()[base.id],
      }).shouldApply) {
        setQuoteReplyDraftPersistence((current) => ({ ...current, [base.id]: "local_only" }));
        setExportNotice("The reply stayed here, but account saving is not connected yet.");
      }
      return;
    }
    setExportNotice("Saving the reply draft...");
    try {
      const projection = weddingVendorQuoteDraftAfpSendInput({
        flow,
        recipient: flow.recipient,
        subject: flow.subject,
        body,
        editorAfpMessage: payload.afpMessage,
        parentId: flow.quoteMessageId,
      });
      await props.saveProjection(projection);
      if (!weddingVendorQuoteReplyDraftSaveCompletionState({
        attemptId: saveAttemptId,
        currentAttemptId: quoteReplyDraftSaveAttempts()[base.id],
      }).shouldApply) return;
      const draftMessageId = weddingProjectionMetadataId(projection);
      if (draftMessageId) {
        setQuoteReplyDraftMessageIds((current) => ({ ...current, [base.id]: draftMessageId }));
      }
      setQuoteReplyDraftPersistence((current) => ({ ...current, [base.id]: "saved" }));
      setExportNotice("Saved the reply draft with this wedding.");
      props.onRefreshWorkspace?.();
    } catch {
      if (!weddingVendorQuoteReplyDraftSaveCompletionState({
        attemptId: saveAttemptId,
        currentAttemptId: quoteReplyDraftSaveAttempts()[base.id],
      }).shouldApply) return;
      setQuoteReplyDraftPersistence((current) => ({ ...current, [base.id]: "local_only" }));
      setExportNotice("The reply stayed here, but the draft could not be saved to your wedding record yet.");
    }
  }

  function approveQuoteReplyWording(base: WeddingVendorQuoteReplyFlowState) {
    const persistence = quoteReplyDraftPersistenceView(base);
    const flow = quoteReplyFlow(base);
    const consent = weddingVendorQuoteReplyConsentChangeState({
      checked: true,
      blocked: persistence.blocksApproval || !flow.canApproveWording || approvalRunning(),
      alreadyRecorded: flow.approvedWording,
    });
    if (!consent.shouldRecord) {
      if (persistence.blocksApproval) setExportNotice(persistence.detail);
      return;
    }
    setQuoteReplyApprovedWording((current) => ({ ...current, [base.id]: true }));
  }

  function unapproveQuoteReplyWording(base: WeddingVendorQuoteReplyFlowState) {
    if (approvalRunning()) return;
    setQuoteReplyApprovedWording((current) => ({ ...current, [base.id]: false }));
  }

  function acknowledgeQuoteReplyBudgetImpact(base: WeddingVendorQuoteReplyFlowState) {
    const flow = quoteReplyFlow(base);
    const consent = weddingVendorQuoteReplyConsentChangeState({
      checked: true,
      blocked: !flow.quote.budgetDeltaLabel || approvalRunning(),
      alreadyRecorded: flow.budgetImpactAcknowledged,
    });
    if (!consent.shouldRecord) return;
    setQuoteReplyBudgetAck((current) => ({ ...current, [base.id]: true }));
  }

  function unacknowledgeQuoteReplyBudgetImpact(base: WeddingVendorQuoteReplyFlowState) {
    if (approvalRunning()) return;
    setQuoteReplyBudgetAck((current) => {
      const next = { ...current };
      delete next[base.id];
      return next;
    });
  }

  function startQuoteReplySend(base: WeddingVendorQuoteReplyFlowState) {
    const persistence = quoteReplyDraftPersistenceView(base);
    const flow = quoteReplyFlow(base);
    const readiness = quoteReplyProviderReadiness(flow);
    const gate = weddingVendorQuoteReplySendGateState({
      flowCanSend: flow.canSend,
      draftPersistence: persistence,
      providerReadiness: readiness,
      busy: approvalRunning(),
    });
    if (!gate.canStartSend) {
      if (gate.blockedReason) setExportNotice(gate.blockedReason);
      return;
    }
    const undoUntil = new Date(Date.now() + 6000).toISOString();
    setQuoteReplyUndoUntil((current) => ({ ...current, [base.id]: undoUntil }));
    setExportNotice("Sending in a few seconds. Use Undo if you want to stop it.");
    scheduleQuoteReplySendExecution(base.id, undoUntil, 6000);
  }

  function scheduleQuoteReplySendExecution(
    flowId: string,
    expectedUndoUntilIso: string,
    delayMs: number,
  ) {
    window.setTimeout(() => {
      const pendingSend = weddingVendorQuoteReplyPendingSendTokenState({
        expectedUndoUntilIso,
        currentUndoUntilIso: quoteReplyUndoUntil()[flowId],
      });
      if (!pendingSend.stillCurrent) return;
      const retry = weddingVendorQuoteReplyPendingSendRetryState({
        approvalRunning: approvalRunning(),
      });
      if (retry.shouldRetry && retry.nextUndoUntilIso) {
        setQuoteReplyUndoUntil((current) => current[flowId] === expectedUndoUntilIso
          ? { ...current, [flowId]: retry.nextUndoUntilIso! }
          : current);
        if (retry.notice) setExportNotice(retry.notice);
        scheduleQuoteReplySendExecution(flowId, retry.nextUndoUntilIso, retry.delayMs);
        return;
      }
      const base = state().vendorQuoteReplyFlows.find((candidate) => candidate.id === flowId);
      const flow = base ? quoteReplyFlow(base) : null;
      const gate = flow
        ? weddingVendorQuoteReplySendGateState({
          flowCanSend: weddingVendorQuoteReplyScheduledSendGateFlowState({ flow }).flowCanSend,
          draftPersistence: quoteReplyDraftPersistenceView(base!),
          providerReadiness: quoteReplyProviderReadiness(flow),
          busy: false,
        })
        : null;
      const resolution = weddingVendorQuoteReplyScheduledSendResolutionState({
        flow,
        sendGate: gate,
      });
      setQuoteReplyUndoUntil((current) => {
        const next = { ...current };
        delete next[flowId];
        return next;
      });
      if (!resolution.canExecute || !resolution.request) {
        setExportNotice(resolution.blockedReason ?? "The reply could not be sent yet.");
        return;
      }
      void executeRequest(resolution.request);
    }, delayMs);
  }

  function undoQuoteReplySend(base: WeddingVendorQuoteReplyFlowState) {
    setQuoteReplyUndoUntil((current) => {
      const next = { ...current };
      delete next[base.id];
      return next;
    });
    setExportNotice("Send cancelled. The reply is still here for review.");
  }

  async function viewQuoteReplyThread(base: WeddingVendorQuoteReplyFlowState) {
    const proofThread = {
      threadId: base.threadId,
      vendorName: base.quote.vendorName,
      approvalRequestId: base.approvalRequest.id,
      draftMessageId: quoteReplyDraftMessageIds()[base.id] ?? base.draftMessageId,
      execution: weddingVendorQuoteReplyExecutionSelectionState({
        localExecution: quoteReplyExecutionForRequest(base.approvalRequest.id),
        persistedExecution: base.execution,
        cleared: quoteReplyClearedExecutionRequests()[base.approvalRequest.id] === true,
      }).execution,
    };
    setQuoteReplyProofThread(proofThread);
    setQuoteReplyProofLoading(true);
    setQuoteReplyProofError(null);
    setExportNotice(`Opening the saved thread for ${base.quote.vendorName}.`);
    try {
      const messages = await fetchThread(base.threadId);
      if (quoteReplyProofThread()?.threadId !== base.threadId) return;
      setQuoteReplyProofMessages(messages);
      setExportNotice(`Showing the saved thread for ${base.quote.vendorName}.`);
    } catch (error: unknown) {
      if (quoteReplyProofThread()?.threadId !== base.threadId) return;
      setQuoteReplyProofMessages([]);
      setQuoteReplyProofError(error instanceof Error ? error.message : "Could not load the saved thread yet.");
      setExportNotice("The send proof stayed available, but the full thread could not be loaded yet.");
    } finally {
      if (quoteReplyProofThread()?.threadId === base.threadId) setQuoteReplyProofLoading(false);
    }
  }

  function quoteReplyProviderReadiness(flow: WeddingVendorQuoteReplyFlowState) {
    return buildWeddingProviderExecutorReadinessState({
      request: flow.approvalRequest,
      gmailStatus: props.gmailStatus ?? null,
      availableExecutors: { send_email: Boolean(props.approvalHandlers?.send_email) },
    });
  }

  function quoteAttachmentParserStateForFlow(
    flow: WeddingVendorQuoteReplyFlowState,
  ): WeddingVendorQuoteAttachmentParserState | null {
    const attachmentUrl = flow.quote.attachmentUrl?.trim();
    return state().vendorQuoteAttachmentParserStates.find((parser) => {
      if (parser.parserInput?.["thread_id"] !== flow.threadId) return false;
      const rawParserUrl = parser.parserInput["source_url"];
      const parserUrl = typeof rawParserUrl === "string" ? rawParserUrl.trim() : "";
      return !attachmentUrl || !parserUrl || parserUrl === attachmentUrl;
    }) ?? null;
  }

  async function parseQuoteAttachment(base: WeddingVendorQuoteReplyFlowState) {
    const flow = quoteReplyFlow(base);
    const parser = quoteAttachmentParserStateForFlow(flow);
    const ingest = buildWeddingVendorQuoteAttachmentIngestState(parser);
    if (!ingest.ready || !ingest.request) {
      setExportNotice(ingest.blockerLabels[0] ?? "This quote attachment cannot be extracted yet.");
      return;
    }
    setQuoteAttachmentParsing((current) => ({ ...current, [base.id]: true }));
    setExportNotice(`Extracting the quote attachment for ${flow.quote.vendorName}.`);
    try {
      const result = await ingestAttachmentBatch(ingest.request);
      const failed = result.items.filter((item) => item.ingested === false);
      if (failed.length > 0) {
        setExportNotice(failed[0]?.error ?? "The quote attachment could not be extracted yet.");
      } else {
        setExportNotice("Quote attachment extracted. Refreshing the vendor thread evidence.");
        props.onRefreshWorkspace?.();
      }
    } catch (error: unknown) {
      setExportNotice(error instanceof Error ? error.message : "The quote attachment could not be extracted yet.");
    } finally {
      setQuoteAttachmentParsing((current) => {
        const next = { ...current };
        delete next[base.id];
        return next;
      });
    }
  }

  const homeSections = createMemo<WeddingHomeSection[]>(() => [
    {
      id: "next_step",
      title: "Next step",
      visible: true,
      render: () => (
        <WeddingNextStepCard
          state={state()}
          onSelectMenu={props.onSelectMenu}
          onSaveWeddingDate={props.onSaveWeddingDate}
        />
      ),
    },
    {
      id: "planning_basics",
      title: "Planning basics needed",
      visible: props.vendorSearchReadiness?.status === "blocked",
      render: () => (
        <div class="rounded-2xl border border-amber-200 bg-amber-50/90 p-3 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-amber-950">Planning basics needed</p>
              <p class="mt-1 break-words text-xs leading-5 text-amber-900/75">
                Live wedding workflows stay blocked until the required planning context is captured.
              </p>
            </div>
            <span class="rounded-full border border-amber-200 bg-white/75 px-2 py-1 text-xs font-semibold text-amber-950">
              Intake checkpoint
            </span>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <Show when={props.vendorSearchReadiness?.status === "blocked"}>
              <div class="rounded-xl border border-amber-100 bg-white/75 p-3">
                <p class="text-xs font-semibold uppercase text-amber-800/70">Vendor search</p>
                <p class="mt-1 break-words text-sm leading-6 text-amber-950">
                  Needs {props.vendorSearchReadiness?.missing.join(", ")}.
                </p>
                <Show when={props.vendorSearchReadiness?.missing.some((item) => /priorities|fit preferences/i.test(item))}>
                  <label class="mt-3 block text-xs font-semibold text-amber-950">
                    Vendor fit preferences
                    <input
                      type="text"
                      value={props.vendorSearchQuery ?? ""}
                      onInput={(event) => props.onVendorSearchQueryChange?.(event.currentTarget.value)}
                      placeholder="beachfront venue in Sydney with Gothic style for 60 guests"
                      class="mt-1 w-full rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm font-normal text-amber-950 outline-none transition placeholder:text-amber-950/35 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                    />
                  </label>
                  <p class="mt-2 break-words text-[11px] leading-5 text-amber-900/75">
                    A specific search query here can unblock vendor fit preferences for live search.
                  </p>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      ),
    },
    {
      id: "vendor_search",
      title: "Live vendor search",
      visible: true,
      render: () => (
        <div class="rounded-2xl border border-rose-100 bg-white/85 px-4 py-5 shadow-sm sm:px-5 sm:py-6">
          <div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <p class="text-lg font-bold leading-6 text-rose-950">Live vendor search</p>
              <p class="mt-1 break-words text-xs leading-5 text-rose-950/65">
                Compare and enquire.
              </p>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-full bg-rose-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-300"
              title={props.vendorSearchBlockedReason ?? undefined}
              disabled={props.vendorSearchRunning || !props.onRunLiveVendorSearch || Boolean(props.vendorSearchBlockedReason)}
              onClick={() => props.onRunLiveVendorSearch?.()}
              data-magic-action="open"
              data-magic-icon="search"
              data-magic-label={props.vendorSearchRunning ? "Vendor search running" : "Search wedding vendors"}
              data-magic-id="wedding:vendor-search:run"
            >
              {props.vendorSearchRunning ? "Searching..." : "Search vendors"}
            </button>
          </div>
          <label class="mt-5 block">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs font-semibold text-rose-950/75">Search query</span>
              <Show when={props.vendorSearchQuerySourceLabel}>
                {(label) => (
                  <span class="rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-900">
                    {label()}
                  </span>
                )}
              </Show>
            </div>
            <input
              type="text"
              value={props.vendorSearchQuery ?? ""}
              onInput={(event) => props.onVendorSearchQueryChange?.(event.currentTarget.value)}
              placeholder="florist in Sydney specialising in wedding"
              class="mt-1 w-full rounded-2xl border-2 border-rose-300 bg-white px-3 py-2 text-sm text-rose-950 shadow-sm outline-none transition placeholder:text-rose-950/35 hover:border-rose-400 focus:border-rose-600 focus:ring-4 focus:ring-rose-100"
            />
          </label>
          <Show when={props.vendorSearchNotice}>
            {(notice) => (
              <p class="mt-4 break-words text-xs leading-5 text-rose-950/70">
                {notice()}
              </p>
            )}
          </Show>
          <Show when={props.vendorSearchResultAction}>
            {(action) => (
              <button
                type="button"
                class="mt-3 inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-950 transition hover:border-rose-300 hover:bg-rose-100"
                title={action().detail ?? undefined}
                onClick={() => {
                  props.onSelectMenu?.(action().menu ?? "documents");
                  props.onSelectArtifact?.(action().artifactId);
                }}
                data-magic-action="open"
                data-magic-icon="file"
                data-magic-label={action().label}
                data-magic-id="wedding:vendor-search:open-result"
              >
                {action().label}
              </button>
            )}
          </Show>
          <Show when={props.vendorSearchBlockedReason}>
            {(reason) => (
              <p class="mt-2 break-words text-xs leading-5 text-rose-950/70">
                {reason()}
              </p>
            )}
          </Show>
        </div>
      ),
    },
    {
      id: "notice",
      title: "Planner notice",
      visible: Boolean(exportNotice()),
      render: () => (
        <p class="rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2 text-sm leading-6 text-sky-950/75">
          {exportNotice()}
        </p>
      ),
    },
    {
      id: "overview",
      title: "Wedding overview",
      visible: true,
      render: () => (
        <WeddingHomeOverviewGrid
          state={state()}
          onSelectMenu={props.onSelectMenu}
          onSidebarAction={handleSidebarAction}
          onSaveWeddingDate={props.onSaveWeddingDate}
        />
      ),
    },
    {
      id: "status",
      title: "Wedding status",
      visible: true,
      render: () => <WeddingHomeStatusStrip state={state()} onSelectMenu={props.onSelectMenu} />,
    },
    {
      id: "threads",
      title: "Planning threads",
      visible: true,
      render: () => (
        <WeddingPlanningThreadsCard
          state={state()}
          onSelectMenu={props.onSelectMenu}
          onSelectArtifact={props.onSelectArtifact}
        />
      ),
    },
    {
      id: "quote_replies",
      title: "Vendor quote replies",
      visible: state().activeVendorQuoteReplyFlows.length > 0,
      render: () => (
        <div class="space-y-3">
          <For each={state().activeVendorQuoteReplyFlows}>
            {(baseFlow) => {
              const flow = () => quoteReplyFlow(baseFlow);
              return (
                <WeddingVendorQuoteReplyCard
                  flow={flow()}
                  surface="home"
                  recipient={flow().recipient}
                  subject={flow().subject}
                  draftBody={flow().draftBody}
                  busy={approvalRunning()}
                  busyLabel={quoteReplyBusyLabel(flow().approvalRequest.id)}
                  draftPersistenceStatus={quoteReplyDraftPersistence()[baseFlow.id] ?? null}
                  proofSaveNotice={
                    quoteReplyProofSaveNotice(flow().approvalRequest.id)
                  }
                  providerReadiness={quoteReplyProviderReadiness(flow())}
                  attachmentParserState={quoteAttachmentParserStateForFlow(flow())}
                  attachmentParsing={quoteAttachmentParsing()[baseFlow.id] === true}
                  onSaveDraft={(payload) => saveQuoteReplyDraft(baseFlow, payload)}
                  onApproveWording={() => approveQuoteReplyWording(baseFlow)}
                  onUnapproveWording={() => unapproveQuoteReplyWording(baseFlow)}
                  onAcknowledgeBudgetImpact={() => acknowledgeQuoteReplyBudgetImpact(baseFlow)}
                  onUnacknowledgeBudgetImpact={() => unacknowledgeQuoteReplyBudgetImpact(baseFlow)}
                  onSend={() => startQuoteReplySend(baseFlow)}
                  onUndo={() => undoQuoteReplySend(baseFlow)}
                  onViewSentThread={() => void viewQuoteReplyThread(baseFlow)}
                  onParseAttachment={() => void parseQuoteAttachment(baseFlow)}
                  onProviderSetup={props.onProviderSetup}
                />
              );
            }}
          </For>
        </div>
      ),
    },
    {
      id: "decision_focus",
      title: "Decision focus",
      visible: true,
      render: () => <WeddingDecisionFocusCard state={state()} onSidebarAction={handleSidebarAction} />,
    },
    {
      id: "resilience",
      title: "Plan resilience",
      visible: true,
      render: () => <WeddingResilienceCardList state={state().resilience} onSidebarAction={handleSidebarAction} />,
    },
    {
      id: "approval",
      title: "Approval queue",
      visible: Boolean(state().projectionQueue),
      render: () => (
        <WeddingProjectionApprovalCard
          state={state().projectionQueue}
          save={props.saveProjection}
          storage={props.projectionStorage}
          onDispatched={props.onProjectionDispatched}
          onReviewBlocked={props.onReviewBlockedOutputs}
        />
      ),
    },
  ]);

  const orderedHomeSections = createMemo(() => {
    const sections = homeSections().filter((section) =>
      section.visible && shouldShowWeddingHomeSection(section.id)
    );
    const order = normalizeWeddingHomeSectionOrder(homeSectionOrder());
    const orderById = new Map(order.map((id, index) => [id, index]));
    return sections.slice().sort((left, right) =>
      (orderById.get(left.id) ?? WEDDING_HOME_SECTION_IDS.length)
      - (orderById.get(right.id) ?? WEDDING_HOME_SECTION_IDS.length)
    );
  });

  async function executeRequest(request: WeddingApprovalRequestState) {
    if (approvalRunning()) return;
    setApprovalRunning(true);
    setApprovalRunningRequestId(request.id);
    try {
      const result = await runWeddingApprovalExecution({
        request: approvedApprovalRequest(request),
        handlers: props.approvalHandlers,
      });
      setApprovalReceipt(result);
      if (request.delivery?.threadId) {
        setQuoteReplyLocalExecutions((current) => ({ ...current, [request.id]: result }));
        setQuoteReplyClearedExecutionRequests((current) => {
          const next = { ...current };
          delete next[request.id];
          return next;
        });
      }
      if (!props.saveProjection) {
        setApprovalSaveNoticeForRequest(request, weddingVendorQuoteReceiptPersistenceNotice("account_save_unavailable"));
        return;
      }
      try {
        await props.saveProjection(weddingApprovalReceiptToAfpSendInput(result.receipt));
        const vendorThreadId = request.delivery?.threadId ?? null;
        let vendorThreadParentId: string | null = null;
        if (vendorThreadId && result.status === "executed") {
          try {
            vendorThreadParentId = weddingVendorQuoteReceiptParentId(
              await fetchThread(vendorThreadId),
              request.id,
            );
          } catch {
            vendorThreadParentId = null;
          }
        }
        const vendorThreadReceipt = vendorThreadId && result.status === "executed"
          ? weddingApprovalReceiptToVendorThreadAfpSendInput(result.receipt, {
            threadId: vendorThreadId,
            parentId: vendorThreadParentId,
          })
          : null;
        if (vendorThreadReceipt) {
          try {
            await props.saveProjection(vendorThreadReceipt);
            setApprovalSaveNoticeForRequest(request, weddingVendorQuoteReceiptPersistenceNotice("approval_saved_vendor_thread_saved"));
          } catch {
            setApprovalSaveNoticeForRequest(request, weddingVendorQuoteReceiptPersistenceNotice("approval_saved_vendor_thread_failed"));
          }
        } else if (vendorThreadId && result.status === "executed") {
          setApprovalSaveNoticeForRequest(request, weddingVendorQuoteReceiptPersistenceNotice("approval_saved_vendor_thread_skipped"));
        } else {
          setApprovalSaveNoticeForRequest(request, weddingVendorQuoteReceiptPersistenceNotice("approval_saved"));
        }
      } catch {
        setApprovalSaveNoticeForRequest(request, weddingVendorQuoteReceiptPersistenceNotice("approval_save_failed"));
      }
    } finally {
      setApprovalRunning(false);
      setApprovalRunningRequestId(null);
    }
  }

  return (
    <section
      class={rootClass()}
      role="tabpanel"
      id="wedding-tabpanel"
      aria-labelledby={`wedding-tab-${activeMenu()}`}
    >
      <div class={primaryColumnClass()}>
        <Show when={activeMenu() === "home"}>
          <For each={orderedHomeSections()}>
            {(section, index) => (
              <div
                class="rounded-[24px] border border-white/55 bg-white/45 p-2 shadow-sm backdrop-blur"
                data-wedding-home-section={section.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropHomeSection(section.id)}
                onMouseMove={(event) => updateHomeSectionControlsFromPointer(section.id, event)}
                onMouseLeave={() => scheduleHideHomeSectionControls(section.id)}
              >
                <div
                  class={`mb-2 flex flex-wrap items-center justify-between gap-2 transition duration-200 ${
                    homeSectionControlsVisible(section.id)
                      ? "opacity-100"
                      : "pointer-events-none h-0 overflow-hidden opacity-0"
                  }`}
                  onMouseEnter={() => showHomeSectionControls(section.id)}
                  onMouseLeave={() => scheduleHideHomeSectionControls(section.id)}
                >
                  <button
                    type="button"
                    class="inline-flex cursor-grab items-center gap-2 rounded-full border border-stone-200 bg-white/85 px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm active:cursor-grabbing"
                    title={`Drag to move ${section.title}`}
                    aria-label={`Move ${section.title}`}
                    draggable={orderedHomeSections().length > 1}
                    onDragStart={(event) => {
                      setDraggingHomeSectionId(section.id);
                      event.dataTransfer?.setData("text/plain", section.id);
                    }}
                    onDragEnd={() => setDraggingHomeSectionId(null)}
                  >
                    ::
                    <span>{section.title}</span>
                  </button>
                  <div class="flex flex-wrap gap-1">
                    <button
                      type="button"
                      class="rounded-full border border-stone-200 bg-white/85 px-2.5 py-1 text-xs font-semibold text-stone-700 disabled:opacity-40"
                      disabled={index() === 0}
                      title="Move this card up"
                      onClick={() => moveHomeSectionToIndex(section.id, index() - 1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      class="rounded-full border border-stone-200 bg-white/85 px-2.5 py-1 text-xs font-semibold text-stone-700 disabled:opacity-40"
                      disabled={index() === orderedHomeSections().length - 1}
                      title="Move this card down"
                      onClick={() => moveHomeSectionToIndex(section.id, index() + 1)}
                    >
                      Down
                    </button>
                  </div>
                </div>
                {section.render()}
              </div>
            )}
          </For>
        </Show>

        <WeddingWorkspaceDocumentsPanel
          state={state()}
          activePreview={activePreview()}
          cardClass={cardClass()}
          hidden={activeMenu() !== "documents"}
          query={props.query}
          importRunning={props.importRunning}
          showPlanningFiles={showPlanningFiles()}
          exportNotice={exportNotice()}
          bundleExportFormat={bundleExportFormat()}
          includeSensitiveBundle={includeSensitiveBundle()}
          approvalRunning={approvalRunning()}
          approvalReceipt={approvalReceipt()}
          approvalReceiptSaveNotice={approvalReceiptSaveNotice()}
          refreshState={props.refreshState}
          approvedRequest={approvedApprovalRequest}
          researchAction={activeResearchPromptAction()}
          researchPromptAction={researchPromptAction()}
          setShowPlanningFiles={setShowPlanningFiles}
          setBundleExportFormat={setBundleExportFormat}
          setIncludeSensitiveBundle={setIncludeSensitiveBundle}
          onQueryChange={props.onQueryChange}
          onAdminDataConsentChange={props.onAdminDataConsentChange}
          onImportFiles={props.onImportFiles}
          onRefreshWorkspace={props.onRefreshWorkspace}
          onSelectArtifact={props.onSelectArtifact}
          onFilterChip={props.onFilterChip}
          onProviderSetup={props.onProviderSetup}
          onCopy={() => void copyActiveArtifact()}
          onExport={runExport}
          onBundleExport={runBundleExport}
          onApprove={approveRequest}
          onExecute={(request) => void executeRequest(request)}
          onResearch={handleSidebarAction}
          onOpenFollowUpQueue={openSelectedVendorFollowUpQueue}
          onOpenVendorQuoteReplySurface={openVendorQuoteReplySurface}
          onVendorChoiceSelected={saveVendorChoiceSelection}
        />

        <Show when={showTechnicalDetails() && state().projectionQueue}>
          {(queue) => (
            <WeddingProjectionQueuePanel
              state={queue()}
              save={props.saveProjection}
              storage={props.projectionStorage}
              onDispatched={props.onProjectionDispatched}
              onReviewBlocked={props.onReviewBlockedOutputs}
              onOpenSaved={props.onOpenSavedOutputs}
            />
          )}
        </Show>

      </div>

      <aside class={sidebarClass()}>
        <WeddingWorkspaceContextPanels
          state={state()}
          showTechnicalDetails={showTechnicalDetails()}
          showHomeOverview={false}
          activeMenu={activeMenu()}
          sharePlanOpen={Boolean(props.sharePlanOpen)}
          onToggleSharePlan={props.onToggleSharePlan}
          saveProjection={props.saveProjection}
          onRefreshWorkspace={props.onRefreshWorkspace}
          contactUserId={props.contactUserId}
          onSelectMenu={props.onSelectMenu}
          onOpenArtifact={openArtifactFromContext}
          onOpenSavedOutputs={props.onOpenSavedOutputs}
          onSaveWeddingDate={props.onSaveWeddingDate}
          onViewQuoteReplyProof={(flow) => void viewQuoteReplyThread(flow)}
          onSidebarAction={handleSidebarAction}
        />
      </aside>
      <Show when={quoteReplyProofThread()}>
        {(thread) => (
          <WeddingVendorQuoteProofDrawer
            vendorName={thread().vendorName}
            messages={quoteReplyProofRows()}
            loading={quoteReplyProofLoading()}
            error={quoteReplyProofError()}
            onClose={() => {
              setQuoteReplyProofThread(null);
              setQuoteReplyProofMessages([]);
              setQuoteReplyProofError(null);
            }}
          />
        )}
      </Show>
    </section>
  );
}
