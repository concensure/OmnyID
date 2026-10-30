// @locs-version: 1.1
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";

import { MobileFocusDeck } from "@/components/MobileFocusDeck";
import { MobileFocusHome } from "@/components/MobileFocusHome";
import { DecisionCard } from "@/components/DecisionCard";
import { QueueClearedZenState } from "@/components/QueueClearedZenState";
import { WeddingHomeOverviewGrid } from "@/components/WeddingHomeOverviewGrid";
import { WeddingVendorDeckCard } from "@/components/WeddingVendorDeckCard";
import type { SendAfpMessageInput } from "@/lib/api";
import { decisionTriageToAfpSendInput } from "@/lib/decisionTriageAfpState";
import { buildDecisionTriageProjectionState } from "@/lib/decisionTriageProjectionState";
import { decisionCardFromFocusDeckItem } from "@/lib/decisionCardState";
import {
  buildWeddingDecisionFocusDisplayState,
  weddingVendorResearchQueryForDecision,
} from "@/lib/weddingDecisionFocusDisplayState";
import { buildWeddingDecisionDeferSidebarAction } from "@/lib/weddingDecisionFocusActionState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import {
  hiddenAttentionCount,
  installMobileFocusViewportListener,
  loadMobileFocusTriageMemory,
  mobileFocusMode,
  mobileFocusSingleCardSectionId,
  publishMobileFocusHomeSections,
  rankFocusDeckItems,
  saveMobileFocusTriageMemory,
  setMobileFocusMode,
  setMobileFocusSingleCardSectionId,
  type FocusDeckItem,
} from "@/lib/mobileFocusHomeState";
import type { WeddingVendorQuoteReplyFlowState } from "@/lib/weddingVendorQuoteReplyFlowState";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";
import type { AfpAttachment } from "@/lib/api";
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import type { WeddingVendorChoiceIntent } from "@/lib/weddingVendorChoiceActionState";
import type { WeddingVendorEnquiryPermissions } from "@/lib/weddingVendorEnquiryPermissionsState";
import { friendlyErrorText } from "@/lib/visibleErrorText";
import { loadWeddingTaskCompletion, WEDDING_TASK_COMPLETION_EVENT } from "@/lib/weddingTaskCompletionLocalState";
import {
  dispatchWeddingVendorSearchLaunch,
  saveWeddingVendorSearchLaunch,
} from "@/lib/weddingVendorSearchLaunchState";

type HomeSection = { id: string; title: string; render: () => JSX.Element };
type InputMethod = "swipe" | "button" | "keyboard";
type PendingApproval = { item: FocusDeckItem; method: InputMethod };
type PendingTriage = { input: SendAfpMessageInput; onSaved: () => void; locallyApplied: boolean };

export function WeddingMobileFocusHome(props: {
  state: WeddingResponseWorkspaceViewState;
  homeSections: HomeSection[];
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
  userId?: string | null;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onApproveQuoteReply?: (flow: WeddingVendorQuoteReplyFlowState) => void;
  onAcknowledgeQuoteReply?: (flow: WeddingVendorQuoteReplyFlowState) => void;
  vendorOutreachFlows?: readonly WeddingVendorOutreachFlowState[];
  gmailConnected?: boolean;
  onContactVendor?: (card: WeddingVendorChoiceCardData, artifactId: string, intent: WeddingVendorChoiceIntent) => void;
  onOutreachBodyChange?: (choiceId: string, bodyMarkdown: string) => void;
  onOutreachRecipientChange?: (choiceId: string, email: string) => void;
  onOutreachAttachmentsChange?: (choiceId: string, attachments: AfpAttachment[]) => void;
  onOutreachPermissionsChange?: (choiceId: string, permissions: WeddingVendorEnquiryPermissions) => void;
  onRetryOutreach?: (choiceId: string) => void;
  onSendOutreach?: (choiceId: string) => void;
  onCancelOutreach?: (choiceId: string) => void;
  onConnectGmailForOutreach?: () => void;
}) {
  const initialTriageMemory = loadMobileFocusTriageMemory(props.state.workspace.metadata.responseWorkspaceId);
  const [position, setPosition] = createSignal(0);
  const [deferredIds, setDeferredIds] = createSignal<Set<string>>(new Set(initialTriageMemory.deferredIds));
  const [resolvedIds, setResolvedIds] = createSignal<Set<string>>(new Set(initialTriageMemory.resolvedIds));
  const [pendingApproval, setPendingApproval] = createSignal<PendingApproval | null>(null);
  const [pendingTriage, setPendingTriage] = createSignal<PendingTriage | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [completionRevision, setCompletionRevision] = createSignal(0);
  const persistedTriage = createMemo(() => buildDecisionTriageProjectionState(props.state.afpMessages));
  const completedFocusIds = createMemo(() => {
    completionRevision();
    return props.state.planningTaskItems
      .filter((task) => loadWeddingTaskCompletion({ taskId: task.id, weddingPlanId: props.state.workspace.metadata.weddingPlanId, responseWorkspaceId: props.state.workspace.metadata.responseWorkspaceId })?.completed)
      .map((task) => `task:${task.id}`);
  });
  const hiddenIds = createMemo(() => new Set([
    ...persistedTriage().deferredIds,
    ...persistedTriage().resolvedIds,
    ...deferredIds(),
    ...resolvedIds(),
    ...completedFocusIds(),
  ]));
  const display = createMemo(() => buildWeddingDecisionFocusDisplayState({
    relief: props.state.personalOsProjection.decisionLoadRelief,
    locallyDeferredIds: hiddenIds(),
  }));
  const decisions = createMemo(() => rankFocusDeckItems(display().queuedItemCards.map((card) => ({
    id: card.id,
    kind: "decision" as const,
    sourceSurface: card.item.sourceSurface,
    title: card.title,
    recommendedActionLabel: card.recommendedActionLabel,
    whyNowLabel: card.whyNowLabel,
    dueAt: card.item.dueAt,
    evidenceLabels: card.item.evidenceLabels,
    deferCount: 0,
    returnedFromLater: false,
    external: false,
  }))));
  const responses = createMemo(() => rankFocusDeckItems(props.state.activeVendorQuoteReplyFlows
    .filter((flow) => !hiddenIds().has(flow.id))
    .map((flow) => ({
      id: flow.id,
      kind: "response" as const,
      sourceSurface: "vendor_quote_reply",
      title: flow.title,
      recommendedActionLabel: flow.recommendationLabel,
      whyNowLabel: flow.summary,
      dueAt: null,
      evidenceLabels: flow.recommendationWhyLabels,
      deferCount: 0,
      returnedFromLater: false,
      external: flow.stage === "ready_to_send",
    }))));
  const items = () => mobileFocusMode() === "responses"
    ? responses()
    : mobileFocusMode() === "decisions"
      ? decisions()
      : [];

  onMount(() => {
    const listener = () => setCompletionRevision((value) => value + 1);
    window.addEventListener(WEDDING_TASK_COMPLETION_EVENT, listener);
    onCleanup(() => window.removeEventListener(WEDDING_TASK_COMPLETION_EVENT, listener));
  });

  createEffect(() => {
    publishMobileFocusHomeSections(props.homeSections.map((section) => ({
      id: section.id,
      title: section.title,
      summary: `Open ${section.title}`,
    })));
  });
  createEffect(() => {
    mobileFocusMode();
    setPosition(0);
    setPendingApproval(null);
  });
  const cleanup = installMobileFocusViewportListener();
  onCleanup(cleanup);

  const save = async (input: SendAfpMessageInput): Promise<{ ok: true } | { ok: false; reason: string }> => {
    if (!props.saveProjection) {
      return { ok: false, reason: "Account sync is unavailable. Your choice isn't recorded yet." };
    }
    try {
      await props.saveProjection(input);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: friendlyErrorText(error, "Your choice isn't recorded yet. Try again.") };
    }
  };
  const triage = async (action: "approve" | "defer", item: FocusDeckItem, method: InputMethod, onSaved: () => void): Promise<boolean> => {
    const input = decisionTriageToAfpSendInput({
      action,
      item,
      deckPosition: position(),
      deckSize: items().length,
      inputMethod: method,
      userId: props.userId,
    });
    const result = await save(input);
    if (result.ok) {
      setPendingTriage(null);
      setNotice(null);
      onSaved();
      return true;
    }
    // A swipe is an intentional, completed local decision. Keep it visible in
    // the deck immediately, persist it on this device, and retry account sync
    // separately. This avoids making a transient connection error undo a
    // gesture the person has already made.
    onSaved();
    setPendingTriage({ input, onSaved, locallyApplied: true });
    setNotice("Saved on this device. We’ll retry the account sync when you’re connected.");
    return false;
  };
  const retryTriage = async () => {
    const pending = pendingTriage();
    if (!pending) return;
    const result = await save(pending.input);
    if (!result.ok) {
      setNotice(result.reason);
      return;
    }
    setPendingTriage(null);
    setNotice(null);
    if (!pending.locallyApplied) pending.onSaved();
  };
  const decisionItemFor = (id: string) => display().itemCards.find((card) => card.id === id)?.item;
  const rememberTriage = (action: "approve" | "defer", itemId: string) => {
    const resolved = new Set(resolvedIds());
    const deferred = new Set(deferredIds());
    if (action === "approve") {
      resolved.add(itemId);
      deferred.delete(itemId);
    } else {
      deferred.add(itemId);
      resolved.delete(itemId);
    }
    setResolvedIds(resolved);
    setDeferredIds(deferred);
    saveMobileFocusTriageMemory(props.state.workspace.metadata.responseWorkspaceId, {
      resolvedIds: [...resolved],
      deferredIds: [...deferred],
    });
  };

  function contactVendor(item: FocusDeckItem, card: WeddingVendorChoiceCardData, artifactId: string, intent: WeddingVendorChoiceIntent) {
    props.onContactVendor?.(card, artifactId, intent);
    void triage("approve", item, "button", () => {
      rememberTriage("approve", item.id);
      setNotice("Availability draft created. Nothing is sent until you review and send it.");
    });
  }

  function requestApproval(item: FocusDeckItem, method: InputMethod) {
    if (item.kind.startsWith("vendor_")) {
      setMobileFocusMode("overview");
      setMobileFocusSingleCardSectionId(item.kind === "vendor_draft" || item.kind === "vendor_receipt" ? "quote_replies" : "vendor_search");
      return;
    }
    if (openVendorResearch(item)) return;
    setPendingApproval({ item, method });
  }

  function confirmApproval() {
    const pending = pendingApproval();
    if (!pending) return;
    const { item, method } = pending;
    setPendingApproval(null);

    if (item.kind === "response") {
      const flow = props.state.activeVendorQuoteReplyFlows.find((candidate) => candidate.id === item.id);
      void triage("approve", item, method, () => {
        if (flow?.stage === "draft_ready") props.onApproveQuoteReply?.(flow);
        else if (flow?.stage === "needs_budget_acknowledgement") props.onAcknowledgeQuoteReply?.(flow);
        else setNotice(flow?.stage === "ready_to_send"
          ? "The reply is ready. Opening its draft never sends it; sending still needs its own confirmation."
          : "This response needs one more safe review step.");
        rememberTriage("approve", item.id);
      });
      return;
    }

    const decision = decisionItemFor(item.id);
    if (!decision) return;
    void triage("approve", item, method, () => {
      rememberTriage("approve", decision.id);
      setNotice("Decision approved. Here is the next one that still needs you.");
    });
  }

  async function defer(item: FocusDeckItem, method: InputMethod): Promise<boolean> {
    await triage("defer", item, method, () => {
      if (item.kind === "decision") {
        const decision = decisionItemFor(item.id);
        if (decision) props.onSidebarAction(buildWeddingDecisionDeferSidebarAction(decision));
      }
      rememberTriage("defer", item.id);
    });
    // Removing the current item shifts the next queued item into the same deck
    // position. Do not advance again or the first remaining item is skipped.
    return false;
  }

  function openAgentDraft() {
    setMobileFocusMode("overview");
    setMobileFocusSingleCardSectionId("quote_replies");
  }

  function openVendorResearch(item: FocusDeckItem) {
    const decision = decisionItemFor(item.id);
    const query = decision ? weddingVendorResearchQueryForDecision(decision) : null;
    if (!query) return false;
    if (!hasVendorShortlist(item)) {
      const launch = saveWeddingVendorSearchLaunch(query, { source: "wedding_home" });
      if (launch) dispatchWeddingVendorSearchLaunch(launch);
    }
    setMobileFocusMode("overview");
    setMobileFocusSingleCardSectionId("vendor_search");
    return true;
  }

  function hasVendorShortlist(item: FocusDeckItem): boolean {
    const decision = decisionItemFor(item.id);
    const query = decision ? weddingVendorResearchQueryForDecision(decision) : null;
    if (!query) return false;
    const categoryWord = query.replace(/^wedding\s+/i, "").replace(/s$/, "").toLowerCase();
    return props.state.artifactPreviews.some((artifact) => {
      if (artifact.vendorComparisonCards.length === 0) return false;
      const evidence = [artifact.title, artifact.category, ...artifact.vendorComparisonCards.flatMap((card) => [
        card.category ?? "", card.title, ...(card.facetLabels ?? []),
      ])].join(" ").toLowerCase();
      return evidence.includes(categoryWord);
    });
  }

  function primaryActionLabel(item: FocusDeckItem): string {
    const decision = decisionItemFor(item.id);
    if (decision && weddingVendorResearchQueryForDecision(decision)) {
      return hasVendorShortlist(item) ? "Open shortlist" : "Search vendors";
    }
    if (item.kind === "response") return "Review response";
    return "Review decision";
  }

  function completeVendorItem(item: FocusDeckItem) {
    if (item.kind === "vendor_receipt") {
      void triage("approve", item, "button", () => {
        rememberTriage("approve", item.id);
        setNotice("Receipt saved. Here is the next item that needs you.");
      });
      return;
    }
    requestApproval(item, "button");
  }

  function bringBackLaterItem() {
    const first = [...deferredIds()][0];
    if (!first) return;
    const next = new Set(deferredIds());
    next.delete(first);
    setDeferredIds(next);
    saveMobileFocusTriageMemory(props.state.workspace.metadata.responseWorkspaceId, {
      resolvedIds: [...resolvedIds()],
      deferredIds: [...next],
    });
    setPosition(0);
    setNotice("That item is back in your active queue.");
  }

  const currentTitle = () => "";
  const selectedSection = createMemo(() => props.homeSections.find((section) => section.id === mobileFocusSingleCardSectionId()) ?? null);
  const clearDecisionView = () => !selectedSection()
    && !pendingApproval()
    && !notice()
    && mobileFocusMode() !== "overview"
    && items().length === 0;

  return (
    <MobileFocusHome
      title={selectedSection()?.title ?? currentTitle()}
      attentionCount={hiddenAttentionCount({
        responseCount: responses().length,
        overdueDecisionCount: decisions().filter((item) => item.dueAt && Date.parse(item.dueAt) <= Date.now()).length,
      })}
      immersive={clearDecisionView() || (!selectedSection() && mobileFocusMode() !== "overview")}
    >
      <Show when={notice()}>
        {(message) => (
          <div class="mb-2 flex items-center justify-between gap-2 rounded-xl border border-wedding-muted bg-white px-3 py-2" role="status">
            <p class="text-xs text-wedding-text">{message()}</p>
            <Show when={pendingTriage()}>
              <button type="button" class="min-h-11 shrink-0 rounded-lg border border-wedding-accent bg-white px-3 text-xs font-bold text-wedding-accent" onClick={() => void retryTriage()}>Retry</button>
            </Show>
          </div>
        )}
      </Show>
      <Show when={pendingApproval()}>
        {(pending) => (
          <section class="mb-3 rounded-2xl border border-wedding-accent bg-white p-4 shadow-card" role="alertdialog" aria-label="Confirm decision approval">
            <p class="text-sm font-semibold text-wedding-text">Approve this {pending().item.kind}?</p>
            <p class="mt-1 text-sm leading-6 text-wedding-muted">{pending().item.title}</p>
            <p class="mt-2 text-xs leading-5 text-wedding-muted">This records your decision. Vendor messages still require their own send confirmation.</p>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <button type="button" class="min-h-12 rounded-xl border border-wedding-muted bg-white px-3 text-sm font-semibold text-wedding-text" onClick={() => setPendingApproval(null)}>Keep reviewing</button>
              <button type="button" class="min-h-12 rounded-xl border-2 border-wedding-cta bg-white px-3 text-sm font-bold text-wedding-text hover:bg-wedding-surface-blush" onClick={confirmApproval}>Approve decision</button>
            </div>
          </section>
        )}
      </Show>
      <Show
        when={selectedSection()}
        fallback={(
          <Show
            when={mobileFocusMode() === "overview"}
            fallback={(
              <MobileFocusDeck
                items={items()}
                position={position()}
                onPositionChange={setPosition}
                onApprove={requestApproval}
                onDefer={defer}
                label={mobileFocusMode() === "responses" ? "Response" : "Decision"}
                sequential
                primaryActionLabel={primaryActionLabel}
                renderCard={(item) => item.kind.startsWith("vendor_")
                  ? <WeddingVendorDeckCard
                    item={item}
                    gmailConnected={props.gmailConnected}
                    onContactVendor={(card, artifactId, intent) => contactVendor(item, card, artifactId, intent)}
                    onOutreachBodyChange={props.onOutreachBodyChange}
                    onOutreachRecipientChange={props.onOutreachRecipientChange}
                    onOutreachAttachmentsChange={props.onOutreachAttachmentsChange}
                    onOutreachPermissionsChange={props.onOutreachPermissionsChange}
                    onRetryOutreach={props.onRetryOutreach}
                    onSendOutreach={props.onSendOutreach}
                    onCancelOutreach={props.onCancelOutreach}
                    onConnectGmail={props.onConnectGmailForOutreach}
                    onDone={() => completeVendorItem(item)}
                  />
                  : <DeckCard item={item} onOpenAgentDraft={openAgentDraft} onOpenVendorResearch={openVendorResearch} />}
                renderEnd={() => (
                  <QueueClearedZenState
                    variant="wedding"
                    laterCount={deferredIds().size}
                    pendingDecisionCount={mobileFocusMode() === "decisions" ? 0 : decisions().length}
                    pendingResponseCount={mobileFocusMode() === "responses" ? 0 : responses().length}
                    onPrimary={() => props.onSelectMenu?.("plan")}
                    onDiary={() => props.onSelectMenu?.("timeline")}
                    onBringBack={bringBackLaterItem}
                    onReviewDecisions={() => { setMobileFocusMode("decisions"); setPosition(0); }}
                    onReviewResponses={() => { setMobileFocusMode("responses"); setPosition(0); }}
                  />
                )}
              />
            )}
          >
            <WeddingHomeOverviewGrid dense state={props.state} onSidebarAction={props.onSidebarAction} onSelectMenu={props.onSelectMenu} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} />
          </Show>
        )}
      >
        {(section) => (
          <div class="flex min-h-0 flex-1 flex-col">
            <button type="button" class="mb-1 hidden min-h-11 items-center gap-1 self-start rounded-lg pr-3 text-sm font-semibold text-wedding-accent active:bg-wedding-surface-blush sm:inline-flex" onClick={() => setMobileFocusSingleCardSectionId(null)}>
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19l-7-7 7-7" /></svg>
              Home
            </button>
            <div class="min-h-0 flex-1 overflow-auto pb-44">{section().render()}</div>
          </div>
        )}
      </Show>
    </MobileFocusHome>
  );
}

function DeckCard(props: {
  item: FocusDeckItem;
  onOpenAgentDraft: () => void;
  onOpenVendorResearch: (item: FocusDeckItem) => boolean;
}) {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <DecisionCard
        card={decisionCardFromFocusDeckItem(props.item)}
        mode="standard"
        showActions
        onAction={() => {
          if (!props.onOpenVendorResearch(props.item)) props.onOpenAgentDraft();
        }}
        class="shadow-none"
      />
    </div>
  );
}
