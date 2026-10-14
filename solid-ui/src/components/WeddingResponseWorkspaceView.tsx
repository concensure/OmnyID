// @locs-version: 2.1
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";

import { WeddingProjectionQueuePanel } from "@/components/WeddingProjectionQueuePanel";
import { WeddingWorkspaceContextPanels } from "@/components/WeddingWorkspaceContextPanels";
import { WeddingVendorSearchHomeSection } from "@/components/WeddingVendorSearchHomeSections";
import { WeddingVendorQuoteProofDrawer } from "@/components/WeddingVendorQuoteProofDrawer";
import { WeddingMobileFocusHome } from "@/components/WeddingMobileFocusHome";
import { WeddingMobilePage, weddingMobilePageTitle } from "@/components/WeddingMobilePage";
import { weddingVendorFollowUpOutreachCardData } from "@/lib/weddingVendorFollowUpPanelActionState";
import type { WeddingVendorChoiceSelectionSaveInput } from "@/components/WeddingArtifactDetailPanel";
import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import { WeddingWorkspaceDocumentsPanel } from "@/components/WeddingWorkspaceDocumentsPanel";
import { fetchThread, ingestAttachmentBatch, recordWeddingVendorContact, type AfpMessage, type SendAfpMessageInput } from "@/lib/api";
import type { EditorPayload } from "@/lib/editorPayload";
import { subscribeMagicActionEvent } from "@/lib/magicActionEvent";
import { A2UI_CARD_STATS_REQUEST_EVENT, type A2uiCardStatsRequestEventDetail } from "@/lib/a2uiEvents";
import { runWeddingArtifactBrowserExport, runWeddingBundleBrowserExport, selectWeddingBundleExportPayload, weddingProjectionMetadataId, type WeddingBundleExportFormat } from "@/lib/weddingBrowserExportActions";
import { weddingDecisionDeferralActionToAfpSendInput } from "@/lib/weddingDecisionDeferralAfpState";
import { decisionCardFromWeddingVendorComparison } from "@/lib/decisionCardState";
import { approveWeddingApprovalRequestState, type WeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import type { WeddingApprovalExecutionState } from "@/lib/weddingApprovalExecutionState";
import type { WeddingExportManifestEntry } from "@/lib/weddingExportState";
import { normalizeWeddingHomeSectionOrder, shouldShowWeddingHomeSection, WEDDING_HOME_SECTION_IDS, type WeddingHomeSectionId } from "@/lib/weddingHomeSectionPolicyState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import { buildWeddingResearchPromptAction } from "@/lib/weddingRecommendationGenerationActionState";
import { buildWeddingSelectedVendorFollowUpCtaState } from "@/lib/weddingSelectedVendorFollowUpCtaState";
import {
  buildWeddingVendorQuoteReplyFlowState, weddingVendorQuoteReplyConsentChangeState, weddingVendorQuoteReplyDraftEditEffect,
  weddingVendorQuoteReplyDraftPersistenceState, weddingVendorQuoteReplyDraftSaveCompletionState,
  weddingVendorQuoteReplyExecutionSelectionState, weddingVendorQuoteReplyRequestMatchState, weddingVendorQuoteReplyBusyLabelState,
  weddingVendorQuoteReplyPendingSendTokenState, weddingVendorQuoteReplyPendingSendRetryState,
  weddingVendorQuoteReplyScheduledSendResolutionState, weddingVendorQuoteReplyScheduledSendGateFlowState,
  weddingVendorQuoteReplySendGateState, weddingVendorQuoteDraftAfpSendInput,
  type WeddingVendorQuoteReplyDraftPersistenceStatus, type WeddingVendorQuoteReplyFlowState,
} from "@/lib/weddingVendorQuoteReplyFlowState";
import type { WeddingVendorQuoteAttachmentParserState } from "@/lib/weddingVendorQuoteAttachmentParserState";
import { buildWeddingVendorQuoteAttachmentIngestState } from "@/lib/weddingVendorQuoteAttachmentIngestState";
import { buildWeddingVendorQuoteThreadProofState, mergeWeddingVendorQuoteThreadProofMessages, weddingVendorQuoteLocalReceiptProofMessage, weddingVendorQuoteReceiptParentId } from "@/lib/weddingVendorQuoteThreadProofState";
import { weddingVendorQuoteReceiptPersistenceNotice } from "@/lib/weddingVendorQuoteReceiptPersistenceState";
import { buildWeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";
import { weddingVendorContactReferenceToAfpSendInput } from "@/lib/weddingVendorContactReferenceAfpState";
import { useWeddingVendorOutreachOwner } from "@/lib/useWeddingVendorOutreachOwner";
import { useWeddingVendorQuoteDecisionProjection } from "@/lib/useWeddingVendorQuoteDecisionProjection";
import { installMobileFocusViewportListener, isMobileFocusViewport } from "@/lib/mobileFocusHomeState";
import { useWeddingApprovalExecution } from "@/lib/useWeddingApprovalExecution";
import { buildWeddingHomeSections, WeddingHomeSectionRegistry } from "@/lib/weddingHomeSectionRegistry";

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
  onMount(() => installMobileFocusViewportListener());
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
  const [dismissedVendorSearchResultArtifactId, setDismissedVendorSearchResultArtifactId] = createSignal<string | null>(null);
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
  const contextOnlyMenu = () => !["home", "documents", "advanced", "response_queue"].includes(activeMenu());
  const rootClass = () => {
    const spacing = compactMode() ? "gap-3" : "gap-4";
    return contextOnlyMenu() ? `grid min-w-0 ${spacing}` : `grid min-w-0 ${spacing} xl:grid-cols-2`;
  };
  const primaryColumnClass = () => {
    const spacing = compactMode() ? "space-y-3" : "space-y-4";
    if (contextOnlyMenu()) return "hidden";
    return activeMenu() === "home" || activeMenu() === "documents" || activeMenu() === "response_queue"
      ? `min-w-0 ${spacing} xl:col-span-2`
      : `min-w-0 ${spacing}`;
  };
  const sidebarClass = () => {
    const spacing = compactMode() ? "space-y-3" : "space-y-4";
    return contextOnlyMenu() ? `min-w-0 ${spacing}` : `min-w-0 ${spacing} xl:sticky xl:top-4 xl:self-start`;
  };
  const cardClass = () => compactMode()
    ? "rounded-[20px] border border-white/60 bg-white/75 p-0 shadow-card backdrop-blur sm:rounded-[24px] sm:p-3"
    : "rounded-[24px] border border-white/60 bg-white/75 p-0 shadow-card backdrop-blur sm:rounded-[28px] sm:p-4";
  const documentsCardClass = () => `${cardClass()} xl:col-span-2`;
  const inlineVendorSearchPreview = createMemo(() => {
    const action = props.vendorSearchResultAction;
    if (!action || dismissedVendorSearchResultArtifactId() === action.artifactId) return null;
    const preview = state().artifactPreviews.find((artifact) => artifact.artifactId === action.artifactId) ?? (state().activePreview?.artifactId === action.artifactId ? state().activePreview : null);
    const sourcePreview = state().artifactPreviews.find((artifact) => artifact.artifactId === action.sourceArtifactId) ?? (state().activePreview?.artifactId === action.sourceArtifactId ? state().activePreview : null);
    return { action, preview, sourcePreview };
  });
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

    const provideCardStats = (event: Event) => {
      const detail = (event as CustomEvent<A2uiCardStatsRequestEventDetail>).detail;
      if (!detail || typeof detail.respond !== "function") return;
      const guests = state().guestTracking;
      detail.respond({
        invitationCount: guests.guestRowCount,
        rsvpReceivedCount: guests.attendingCount + guests.declinedCount,
      });
    };
    window.addEventListener(A2UI_CARD_STATS_REQUEST_EVENT, provideCardStats);
    onCleanup(() => window.removeEventListener(A2UI_CARD_STATS_REQUEST_EVENT, provideCardStats));
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
    setExportNotice(`${input.selected ? "Saving" : "Removing"} ${input.optionLabel}${input.selected ? "'s contact details" : ""} ${input.selected ? "to" : "from"} the wedding record...`);
    void props.saveProjection(weddingVendorContactReferenceToAfpSendInput({
      metadata: state().workspace.metadata,
      artifactId: input.artifact.artifactId,
      artifactTitle: input.artifact.title,
      optionId: input.optionId,
      optionLabel: input.optionLabel,
      contact: input.contact,
      selected: input.selected,
    }))
      .then(() => {
        setExportNotice(input.selected
          ? `${input.optionLabel} saved for vendor follow-up.`
          : `${input.optionLabel} removed from vendor follow-up.`);
        props.onRefreshWorkspace?.();
      })
      .catch(() => {
        setExportNotice(`${input.optionLabel} could not be updated yet. Your selection is still visible here.`);
      });
  }

  function handleSidebarAction(action: WeddingWorkspaceSidebarAction) {
    if (action.kind === "assign_task") {
      const taskId = typeof action.metadata?.task_id === "string" ? action.metadata.task_id.trim() : "";
      const assignee = typeof action.metadata?.assignee === "string" ? action.metadata.assignee.trim() : "";
      const task = state().planningTaskItems.find((item) => item.id === taskId);
      if (!taskId || !assignee || !task) {
        setExportNotice("Choose a person before assigning this task.");
        return;
      }
      if (!props.saveProjection) {
        setExportNotice(`${task.title} is assigned to ${assignee} for this session. Connect account saving to keep the assignment.`);
        return;
      }
      const input: SendAfpMessageInput = {
        thread_id: `task:${task.id}`,
        parent_id: null,
        from: "system://omnyid-ui",
        to: [],
        type: "task",
        subtype: "update",
        content: {
          task_id: task.id,
          title: task.title,
          status: "pending",
          priority: task.priority ?? "normal",
          assigned_to: assignee,
        },
        metadata: {
          task_update_source: "wedding_decision_focus",
          updated_task_id: task.id,
          assigned_to_changed: true,
          wedding_plan_id: state().workspace.metadata.weddingPlanId,
          response_workspace_id: state().workspace.metadata.responseWorkspaceId,
        },
      };
      setExportNotice(`Assigning ${task.title} to ${assignee}...`);
      void props.saveProjection(input)
        .then(() => {
          setExportNotice(`${task.title} assigned to ${assignee}.`);
          props.onRefreshWorkspace?.();
        })
        .catch(() => setExportNotice(`Could not save the assignment for ${task.title}.`));
      return;
    }
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
      // Deferring from the Wedding Home is a local queue action. It should not
      // route the couple away from the next decision card.
      return;
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

  const vendorOutreach = useWeddingVendorOutreachOwner({
    state,
    weddingVendorDirectory: () => props.weddingVendorDirectory,
    gmailStatus: () => props.gmailStatus,
    saveProjection: () => props.saveProjection,
    onRefreshWorkspace: () => props.onRefreshWorkspace,
    setNotice: setExportNotice,
  });
  useWeddingVendorQuoteDecisionProjection({ state, saveProjection: () => props.saveProjection, onRefreshWorkspace: () => props.onRefreshWorkspace?.() });

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

  const homeSections = createMemo(() => buildWeddingHomeSections({
    state,
    workspace: props,
    exportNotice,
    handleSidebarAction,
    searchResult: inlineVendorSearchPreview(),
    onDismissSearchResult: setDismissedVendorSearchResultArtifactId,
    vendorOutreach,
    quoteCardProps: (baseFlow) => {
      const flow = quoteReplyFlow(baseFlow);
      return {
        flow,
        surface: "home",
        recipient: flow.recipient,
        subject: flow.subject,
        draftBody: flow.draftBody,
        busy: approvalRunning(),
        busyLabel: quoteReplyBusyLabel(flow.approvalRequest.id),
        draftPersistenceStatus: quoteReplyDraftPersistence()[baseFlow.id] ?? null,
        proofSaveNotice: quoteReplyProofSaveNotice(flow.approvalRequest.id),
        providerReadiness: quoteReplyProviderReadiness(flow),
        attachmentParserState: quoteAttachmentParserStateForFlow(flow),
        attachmentParsing: quoteAttachmentParsing()[baseFlow.id] === true,
        onSaveDraft: (payload) => saveQuoteReplyDraft(baseFlow, payload),
        onApproveWording: () => approveQuoteReplyWording(baseFlow),
        onUnapproveWording: () => unapproveQuoteReplyWording(baseFlow),
        onAcknowledgeBudgetImpact: () => acknowledgeQuoteReplyBudgetImpact(baseFlow),
        onUnacknowledgeBudgetImpact: () => unacknowledgeQuoteReplyBudgetImpact(baseFlow),
        onSend: () => startQuoteReplySend(baseFlow),
        onUndo: () => undoQuoteReplySend(baseFlow),
        onViewSentThread: () => void viewQuoteReplyThread(baseFlow),
        onParseAttachment: () => void parseQuoteAttachment(baseFlow),
        onProviderSetup: props.onProviderSetup,
      };
    },
    followUpProps: {
      state: state(),
      onSidebarAction: handleSidebarAction,
      onViewQuoteReplyProof: (flow) => void viewQuoteReplyThread(flow),
      vendorOutreachFlows: vendorOutreach.flows(),
      gmailConnected: Boolean(props.gmailStatus?.connected),
      onOpenOutreachComposer: (card) => void vendorOutreach.onContactVendor(weddingVendorFollowUpOutreachCardData(card), ""),
      onOutreachBodyChange: vendorOutreach.onOutreachBodyChange,
      onOutreachRecipientChange: vendorOutreach.onOutreachRecipientChange,
      onSendOutreach: (choiceId) => void vendorOutreach.onSendOutreach(choiceId),
      onCancelOutreach: vendorOutreach.onCancelOutreach,
      onConnectGmailForOutreach: () => void vendorOutreach.onConnectGmailForOutreach(),
      onSetFollowUpDate: (card, date) => {
        if (!card.vendorId || !date) return;
        void recordWeddingVendorContact(card.vendorId, {
          contact_method: "other",
          follow_up_due_at: new Date(`${date}T12:00:00`).toISOString(),
          notes: card.detailLabel,
        }).then(() => props.onRefreshWorkspace?.()).catch(() => undefined);
      },
    },
  }));

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

  const executeRequest = useWeddingApprovalExecution({
    isRunning: approvalRunning,
    setRunning: setApprovalRunning,
    setRunningRequestId: setApprovalRunningRequestId,
    approvedRequest: approvedApprovalRequest,
    handlers: props.approvalHandlers,
    setReceipt: setApprovalReceipt,
    rememberQuoteExecution: (requestId, result) => setQuoteReplyLocalExecutions((current) => ({ ...current, [requestId]: result })),
    clearQuoteExecutionTombstone: (requestId) => setQuoteReplyClearedExecutionRequests((current) => {
      const next = { ...current };
      delete next[requestId];
      return next;
    }),
    saveProjection: props.saveProjection,
    setSaveNotice: setApprovalSaveNoticeForRequest,
  });

  return (
    <WeddingMobilePage title={(activeMenu() === "response_queue" || activeMenu() === "timeline" || activeMenu() === "inspiration") && isMobileFocusViewport() ? "" : weddingMobilePageTitle(activeMenu())} activeMenu={activeMenu()} onSelectMenu={props.onSelectMenu}>
    <section
      class={rootClass()}
      role="tabpanel"
      id="wedding-tabpanel"
      aria-labelledby={`wedding-tab-${activeMenu()}`}
    >
      <div class={primaryColumnClass()}>
        <Show when={activeMenu() !== "home"}>
          <button
            type="button"
            class="mb-3 inline-flex min-h-11 items-center gap-1 rounded-lg border border-wedding-muted bg-white pl-2 pr-3 text-sm font-semibold text-wedding-accent transition hover:bg-wedding-surface-blush"
            onClick={() => props.onSelectMenu?.("home")}
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19l-7-7 7-7" /></svg>Wedding Home
          </button>
        </Show>
        <Show when={activeMenu() === "home"}>
          <Show when={!isMobileFocusViewport()} fallback={<WeddingMobileFocusHome
            state={state()}
            homeSections={orderedHomeSections()}
            onSidebarAction={handleSidebarAction}
            saveProjection={props.saveProjection}
            userId={props.contactUserId}
            onSelectMenu={props.onSelectMenu}
            onApproveQuoteReply={approveQuoteReplyWording}
            onAcknowledgeQuoteReply={acknowledgeQuoteReplyBudgetImpact}
            vendorOutreachFlows={Object.values(vendorOutreach.flows())} gmailConnected={Boolean(props.gmailStatus?.connected)}
            onContactVendor={(card, artifactId, intent) => void vendorOutreach.onContactVendor(card, artifactId, intent)} onOutreachBodyChange={vendorOutreach.onOutreachBodyChange}
            onSendOutreach={(choiceId) => void vendorOutreach.onSendOutreach(choiceId)} onCancelOutreach={vendorOutreach.onCancelOutreach} onConnectGmailForOutreach={() => void vendorOutreach.onConnectGmailForOutreach()}
          />}>
          <WeddingHomeSectionRegistry
            sections={orderedHomeSections()}
            controlsVisible={homeSectionControlsVisible}
            onDrop={dropHomeSection}
            onPointerMove={updateHomeSectionControlsFromPointer}
            onPointerLeave={scheduleHideHomeSectionControls}
            onShowControls={showHomeSectionControls}
            onDragStart={setDraggingHomeSectionId}
            onDragEnd={() => setDraggingHomeSectionId(null)}
            onMove={moveHomeSectionToIndex}
          />
          </Show>
        </Show>

        <Show when={activeMenu() === "response_queue"}>
          <WeddingVendorSearchHomeSection
            workspace={props}
            result={inlineVendorSearchPreview()}
            outreach={vendorOutreach}
            onDismiss={setDismissedVendorSearchResultArtifactId}
          />
        </Show>

        <WeddingWorkspaceDocumentsPanel
          state={state()}
          activePreview={activePreview()}
          cardClass={documentsCardClass()}
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
          outreachFlows={vendorOutreach.flows()}
          gmailConnected={Boolean(props.gmailStatus?.connected)}
          onContactVendor={(card, artifactId, intent) => void vendorOutreach.onContactVendor(card, artifactId, intent)}
          onOutreachBodyChange={vendorOutreach.onOutreachBodyChange}
          onSendOutreach={(choiceId) => void vendorOutreach.onSendOutreach(choiceId)}
          onCancelOutreach={vendorOutreach.onCancelOutreach}
          onConnectGmailForOutreach={() => void vendorOutreach.onConnectGmailForOutreach()}
          weddingVendorDirectory={props.weddingVendorDirectory}
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
    </WeddingMobilePage>
  );
}
