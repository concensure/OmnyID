// @locs-version: 2.1
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { WeddingProjectionQueuePanel } from "@/components/WeddingProjectionQueuePanel";
import { WeddingWorkspaceContextPanels } from "@/components/WeddingWorkspaceContextPanels";
import { WeddingDecisionFocusCard } from "@/components/WeddingDecisionFocusCard";
import { WeddingHomeOverviewGrid } from "@/components/WeddingHomeOverviewGrid";
import { WeddingHomeStatusStrip } from "@/components/WeddingHomeStatusStrip";
import { WeddingNextStepCard } from "@/components/WeddingNextStepCard";
import { WeddingPlanningThreadsCard } from "@/components/WeddingPlanningThreadsCard";
import { WeddingProjectionApprovalCard } from "@/components/WeddingProjectionApprovalCard";
import { WeddingResilienceCardList } from "@/components/WeddingResilienceCardList";
import { WeddingRichResponseView } from "@/components/WeddingRichResponseView";
import { WeddingVendorQuoteProofDrawer } from "@/components/WeddingVendorQuoteProofDrawer";
import { WeddingVendorQuoteReplyCard } from "@/components/WeddingVendorQuoteReplyCard";
import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import { WeddingWorkspaceDocumentsPanel } from "@/components/WeddingWorkspaceDocumentsPanel";
import { fetchThread, type AfpMessage } from "@/lib/api";
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
import {
  buildWeddingVendorQuoteThreadProofState,
  mergeWeddingVendorQuoteThreadProofMessages,
  weddingVendorQuoteLocalReceiptProofMessage,
  weddingVendorQuoteReceiptParentId,
} from "@/lib/weddingVendorQuoteThreadProofState";
import { weddingVendorQuoteReceiptPersistenceNotice } from "@/lib/weddingVendorQuoteReceiptPersistenceState";
import { buildWeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";

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
  const rootClass = () => compactMode() ? "grid min-w-0 gap-3 xl:grid-cols-2" : "grid min-w-0 gap-4 xl:grid-cols-2";
  const primaryColumnClass = () => {
    const spacing = compactMode() ? "space-y-3" : "space-y-4";
    return activeMenu() === "home" ? `min-w-0 ${spacing} xl:col-span-2` : `min-w-0 ${spacing}`;
  };
  const sidebarClass = () => compactMode()
    ? "min-w-0 space-y-3 xl:sticky xl:top-4 xl:self-start"
    : "min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start";
  const cardClass = () => compactMode()
    ? "rounded-[20px] border border-white/60 bg-white/75 p-3 shadow-card backdrop-blur sm:rounded-[24px]"
    : "rounded-[24px] border border-white/60 bg-white/75 p-3 shadow-card backdrop-blur sm:rounded-[28px] sm:p-4";
  createEffect(() => {
    if (state().workspace.activeArtifact) setShowPlanningFiles(true);
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
          <WeddingNextStepCard
            state={state()}
            onSelectMenu={props.onSelectMenu}
            onSaveWeddingDate={props.onSaveWeddingDate}
          />
          <Show when={props.vendorSearchReadiness?.status === "blocked" || props.liveEvidenceReadiness?.status === "blocked"}>
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
                  </div>
                </Show>
                <Show when={props.liveEvidenceReadiness?.status === "blocked"}>
                  <div class="rounded-xl border border-amber-100 bg-white/75 p-3">
                    <p class="text-xs font-semibold uppercase text-amber-800/70">Map and weather</p>
                    <p class="mt-1 break-words text-sm leading-6 text-amber-950">
                      Needs {props.liveEvidenceReadiness?.missing.join(", ")}.
                    </p>
                  </div>
                </Show>
              </div>
            </div>
          </Show>
          <div class="rounded-2xl border border-rose-100 bg-white/85 p-3 shadow-sm">
            <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-rose-950">Live vendor search</p>
                <p class="mt-1 break-words text-xs leading-5 text-rose-950/65">
                  Uses connected online search providers and saves cited vendor notes into documents.
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-full bg-rose-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-300"
                title={props.vendorSearchBlockedReason ?? undefined}
                disabled={props.vendorSearchRunning || !props.onRunLiveVendorSearch || props.vendorSearchReadiness?.status === "blocked" || Boolean(props.vendorSearchBlockedReason)}
                onClick={() => props.onRunLiveVendorSearch?.()}
                data-magic-action="open"
                data-magic-icon="search"
                data-magic-label={props.vendorSearchRunning ? "Vendor search running" : "Search wedding vendors"}
                data-magic-id="wedding:vendor-search:run"
              >
                {props.vendorSearchRunning ? "Searching..." : "Search vendors"}
              </button>
            </div>
            <Show when={props.vendorSearchNotice}>
              {(notice) => (
                <p class="mt-2 break-words text-xs leading-5 text-rose-950/70">
                  {notice()}
                </p>
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
          <div class="rounded-2xl border border-sky-100 bg-white/85 p-3 shadow-sm">
            <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-sky-950">Live map and weather evidence</p>
                <p class="mt-1 break-words text-xs leading-5 text-sky-950/65">
                  Verifies the planning location with server-side map and weather providers and saves the evidence into documents.
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-full bg-sky-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
                disabled={props.liveEvidenceRunning || !props.onRunLiveEvidenceCheck || props.liveEvidenceReadiness?.status === "blocked"}
                onClick={() => props.onRunLiveEvidenceCheck?.()}
                data-magic-action="open"
                data-magic-icon="map"
                data-magic-label={props.liveEvidenceRunning ? "Location check running" : "Verify wedding location"}
                data-magic-id="wedding:live-evidence:run"
              >
                {props.liveEvidenceRunning ? "Verifying..." : "Verify location"}
              </button>
            </div>
            <Show when={props.liveEvidenceNotice}>
              {(notice) => (
                <p class="mt-2 break-words text-xs leading-5 text-sky-950/70">
                  {notice()}
                </p>
              )}
            </Show>
          </div>
          <Show when={props.vendorSmokeTestAvailable}>
            <div class="rounded-2xl border border-slate-200 bg-white/85 p-3 shadow-sm">
              <div class="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-slate-950">Disposable vendor smoke test</p>
                  <p class="mt-1 break-words text-xs leading-5 text-slate-700">
                    Creates a temporary quote and reply draft for {props.vendorSmokeTestVendorEmail}. Remove it after validation before running real vendor search.
                  </p>
                </div>
                <div class="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                    onClick={() => props.onInstallVendorSmokeFixture?.()}
                    data-magic-action="open"
                    data-magic-icon="test"
                    data-magic-label="Install vendor smoke fixture"
                    data-magic-id="wedding:vendor-smoke:install"
                  >
                    Install fixture
                  </button>
                  <button
                    type="button"
                    class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                    onClick={() => props.onRemoveVendorSmokeFixture?.()}
                    data-magic-action="dismiss"
                    data-magic-icon="clear"
                    data-magic-label="Remove vendor smoke fixture"
                    data-magic-id="wedding:vendor-smoke:remove"
                  >
                    Remove fixture
                  </button>
                </div>
              </div>
            </div>
          </Show>
          <Show when={props.vendorEndToEndValidation}>
            {(validation) => (
              <div class={`rounded-2xl border p-3 shadow-sm ${
                validation().status === "ready_for_usage_validation"
                  ? "border-emerald-200 bg-emerald-50/80"
                  : "border-amber-200 bg-amber-50/80"
              }`}>
                <div class="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div class="min-w-0">
                    <p class={`text-sm font-semibold ${
                      validation().status === "ready_for_usage_validation" ? "text-emerald-950" : "text-amber-950"
                    }`}>
                      Vendor workflow validation
                    </p>
                    <p class={`mt-1 break-words text-xs leading-5 ${
                      validation().status === "ready_for_usage_validation" ? "text-emerald-900/75" : "text-amber-900/75"
                    }`}>
                      {validation().passedCount}/{validation().steps.length} checks passed.
                      {validation().blockedCount > 0
                        ? ` Estimated ${validation().estimatedPassesToUsage} pass${validation().estimatedPassesToUsage === 1 ? "" : "es"} to usage validation.`
                        : " Ready for a usage-validation run with correct user data."}
                    </p>
                  </div>
                  <div class="flex shrink-0 flex-wrap gap-2">
                    <span class="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-800">
                      {validation().passedCount} passed
                    </span>
                    <span class={`rounded-full px-3 py-1 text-xs font-semibold ${
                      validation().blockedCount > 0 ? "bg-amber-100 text-amber-950" : "bg-emerald-100 text-emerald-950"
                    }`}>
                      {validation().blockedCount} blocked
                    </span>
                  </div>
                </div>
                <Show when={validation().nextActionLabels.length > 0}>
                  <div class="mt-3 rounded-xl border border-white/70 bg-white/70 p-3">
                    <p class="text-xs font-semibold text-slate-950">Next actions</p>
                    <ul class="mt-2 space-y-1 text-xs leading-5 text-slate-700">
                      <For each={validation().nextActionLabels.slice(0, 3)}>
                        {(action) => <li class="break-words">{action}</li>}
                      </For>
                    </ul>
                  </div>
                </Show>
                <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={validation().steps}>
                    {(step) => (
                      <div class="min-w-0 rounded-xl border border-white/75 bg-white/75 px-3 py-2">
                        <div class="flex min-w-0 items-center justify-between gap-2">
                          <p class="min-w-0 truncate text-xs font-semibold text-slate-950">{step.label}</p>
                          <span class={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            step.status === "passed"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}>
                            {step.status === "passed" ? "Pass" : "Block"}
                          </span>
                        </div>
                        <p class="mt-1 line-clamp-2 break-words text-[11px] leading-4 text-slate-600">{step.detail}</p>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </Show>
          <Show when={exportNotice()}>
            {(notice) => (
              <p class="rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2 text-sm leading-6 text-sky-950/75">
                {notice()}
              </p>
            )}
          </Show>
          <WeddingHomeOverviewGrid
            state={state()}
            onSelectMenu={props.onSelectMenu}
            onSidebarAction={handleSidebarAction}
            onSaveWeddingDate={props.onSaveWeddingDate}
          />
          <WeddingHomeStatusStrip state={state()} onSelectMenu={props.onSelectMenu} />
          <WeddingPlanningThreadsCard
            state={state()}
            onSelectMenu={props.onSelectMenu}
            onSelectArtifact={props.onSelectArtifact}
          />
          <Show when={state().activeVendorQuoteReplyFlows.length > 0}>
            <div class="space-y-3">
              <For each={state().activeVendorQuoteReplyFlows}>
                {(baseFlow) => {
                  const flow = () => quoteReplyFlow(baseFlow);
                  return (
                    <WeddingVendorQuoteReplyCard
                      flow={flow()}
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
                      onSaveDraft={(payload) => saveQuoteReplyDraft(baseFlow, payload)}
                      onApproveWording={() => approveQuoteReplyWording(baseFlow)}
                      onAcknowledgeBudgetImpact={() => acknowledgeQuoteReplyBudgetImpact(baseFlow)}
                      onSend={() => startQuoteReplySend(baseFlow)}
                      onUndo={() => undoQuoteReplySend(baseFlow)}
                      onViewSentThread={() => void viewQuoteReplyThread(baseFlow)}
                      onProviderSetup={props.onProviderSetup}
                    />
                  );
                }}
              </For>
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
            </div>
          </Show>
          <WeddingDecisionFocusCard state={state()} onSidebarAction={handleSidebarAction} />
          <WeddingResilienceCardList state={state().resilience} onSidebarAction={handleSidebarAction} />
          <WeddingProjectionApprovalCard
            state={state().projectionQueue}
            save={props.saveProjection}
            storage={props.projectionStorage}
            onDispatched={props.onProjectionDispatched}
            onReviewBlocked={props.onReviewBlockedOutputs}
          />
          <Show when={props.richResponse}>
            {(richResponse) => (
              <WeddingRichResponseView
                state={richResponse()}
                onAction={props.onRichResponseAction}
              />
            )}
          </Show>
        </Show>

        <WeddingWorkspaceDocumentsPanel
          state={state()}
          activePreview={activePreview()}
          cardClass={cardClass()}
          hidden={activeMenu() !== "home" && activeMenu() !== "documents"}
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
          onSelectMenu={props.onSelectMenu}
          onOpenArtifact={openArtifactFromContext}
          onOpenSavedOutputs={props.onOpenSavedOutputs}
          onSaveWeddingDate={props.onSaveWeddingDate}
          onSidebarAction={handleSidebarAction}
        />
      </aside>
    </section>
  );
}
