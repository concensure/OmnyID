// @locs-version: 1.1
import { createEffect, createMemo, createSignal, onCleanup, Show, type JSX } from "solid-js";

import { MobileFocusDeck } from "@/components/MobileFocusDeck";
import { MobileFocusHome } from "@/components/MobileFocusHome";
import { DecisionCard } from "@/components/DecisionCard";
import { QueueClearedZenState } from "@/components/QueueClearedZenState";
import { WeddingHomeOverviewGrid } from "@/components/WeddingHomeOverviewGrid";
import type { SendAfpMessageInput } from "@/lib/api";
import { decisionTriageToAfpSendInput } from "@/lib/decisionTriageAfpState";
import { decisionCardFromFocusDeckItem } from "@/lib/decisionCardState";
import { buildWeddingDecisionFocusDisplayState } from "@/lib/weddingDecisionFocusDisplayState";
import { buildWeddingDecisionDeferSidebarAction } from "@/lib/weddingDecisionFocusActionState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import {
  hiddenAttentionCount,
  installMobileFocusViewportListener,
  mobileFocusMode,
  mobileFocusSingleCardSectionId,
  publishMobileFocusHomeSections,
  rankFocusDeckItems,
  setMobileFocusMode,
  setMobileFocusSingleCardSectionId,
  type FocusDeckItem,
} from "@/lib/mobileFocusHomeState";
import type { WeddingVendorQuoteReplyFlowState } from "@/lib/weddingVendorQuoteReplyFlowState";

type HomeSection = { id: string; title: string; render: () => JSX.Element };
type InputMethod = "swipe" | "button" | "keyboard";
type PendingApproval = { item: FocusDeckItem; method: InputMethod };

export function WeddingMobileFocusHome(props: {
  state: WeddingResponseWorkspaceViewState;
  homeSections: HomeSection[];
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onApproveQuoteReply?: (flow: WeddingVendorQuoteReplyFlowState) => void;
  onAcknowledgeQuoteReply?: (flow: WeddingVendorQuoteReplyFlowState) => void;
}) {
  const [position, setPosition] = createSignal(0);
  const [deferredIds, setDeferredIds] = createSignal<Set<string>>(new Set());
  const [resolvedIds, setResolvedIds] = createSignal<Set<string>>(new Set());
  const [pendingApproval, setPendingApproval] = createSignal<PendingApproval | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const display = createMemo(() => buildWeddingDecisionFocusDisplayState({
    relief: props.state.personalOsProjection.decisionLoadRelief,
    locallyDeferredIds: new Set([...deferredIds(), ...resolvedIds()]),
  }));
  const decisions = createMemo(() => rankFocusDeckItems(display().itemCards.map((card) => ({
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
    .filter((flow) => !deferredIds().has(flow.id))
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
  const items = () => mobileFocusMode() === "responses" ? responses() : decisions();

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

  const save = async (input: SendAfpMessageInput) => {
    if (!props.saveProjection) {
      setNotice("Saved on this device. Will sync when you're back online.");
      return;
    }
    try {
      await props.saveProjection(input);
    } catch {
      setNotice("Saved on this device. Will sync when you're back online.");
    }
  };
  const triage = (action: "approve" | "defer", item: FocusDeckItem, method: InputMethod) => {
    void save(decisionTriageToAfpSendInput({
      action,
      item,
      deckPosition: position(),
      deckSize: items().length,
      inputMethod: method,
    }));
  };
  const decisionItemFor = (id: string) => display().itemCards.find((card) => card.id === id)?.item;

  function requestApproval(item: FocusDeckItem, method: InputMethod) {
    setPendingApproval({ item, method });
  }

  function confirmApproval() {
    const pending = pendingApproval();
    if (!pending) return;
    const { item, method } = pending;
    setPendingApproval(null);

    if (item.kind === "response") {
      const flow = props.state.activeVendorQuoteReplyFlows.find((candidate) => candidate.id === item.id);
      if (flow?.stage === "draft_ready") props.onApproveQuoteReply?.(flow);
      else if (flow?.stage === "needs_budget_acknowledgement") props.onAcknowledgeQuoteReply?.(flow);
      else setNotice(flow?.stage === "ready_to_send"
        ? "The reply is ready. Opening its draft never sends it; sending still needs its own confirmation."
        : "This response needs one more safe review step.");
      triage("approve", item, method);
      setPosition((current) => current + 1);
      return;
    }

    const decision = decisionItemFor(item.id);
    if (!decision) return;
    triage("approve", item, method);
    setResolvedIds((current) => new Set([...current, decision.id]));
    setNotice("Decision approved. Here is the next one that still needs you.");
  }

  function defer(item: FocusDeckItem, method: InputMethod) {
    if (item.kind === "decision") {
      const decision = decisionItemFor(item.id);
      if (decision) props.onSidebarAction(buildWeddingDecisionDeferSidebarAction(decision));
    }
    setDeferredIds((current) => new Set([...current, item.id]));
    triage("defer", item, method);
  }

  function openAgentDraft() {
    setMobileFocusMode("overview");
    setMobileFocusSingleCardSectionId("quote_replies");
  }

  const currentTitle = () => mobileFocusMode() === "overview"
    ? "Wedding overview"
    : `${mobileFocusMode() === "responses" ? "Response" : "Decision"} ${Math.min(position() + 1, items().length)} of ${items().length}`;
  const selectedSection = createMemo(() => props.homeSections.find((section) => section.id === mobileFocusSingleCardSectionId()) ?? null);

  return (
    <MobileFocusHome
      title={selectedSection() ? "‹ Home" : currentTitle()}
      attentionCount={hiddenAttentionCount({
        responseCount: responses().length,
        overdueDecisionCount: decisions().filter((item) => item.dueAt && Date.parse(item.dueAt) <= Date.now()).length,
      })}
    >
      <Show when={notice()}>
        {(message) => <p class="mb-2 rounded-xl border border-wedding-muted bg-white px-3 py-2 text-xs text-wedding-text" role="status">{message()}</p>}
      </Show>
      <Show when={pendingApproval()}>
        {(pending) => (
          <section class="mb-3 rounded-2xl border border-wedding-accent bg-white p-4 shadow-card" role="alertdialog" aria-label="Confirm decision approval">
            <p class="text-sm font-semibold text-wedding-text">Approve this {pending().item.kind}?</p>
            <p class="mt-1 text-sm leading-6 text-wedding-muted">{pending().item.title}</p>
            <p class="mt-2 text-xs leading-5 text-wedding-muted">This records your decision. Vendor messages still require their own send confirmation.</p>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <button type="button" class="min-h-12 rounded-xl border border-wedding-muted bg-white px-3 text-sm font-semibold text-wedding-text" onClick={() => setPendingApproval(null)}>Keep reviewing</button>
              <button type="button" class="min-h-12 rounded-xl bg-wedding-cta px-3 text-sm font-semibold text-white" onClick={confirmApproval}>Approve decision</button>
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
                renderCard={(item) => <DeckCard item={item} onOpenAgentDraft={openAgentDraft} />}
                renderEnd={() => (
                  <QueueClearedZenState
                    variant="wedding"
                    laterCount={deferredIds().size}
                    onPrimary={() => props.onSelectMenu?.("plan")}
                    onDiary={() => props.onSelectMenu?.("timeline")}
                  />
                )}
              />
            )}
          >
            <WeddingHomeOverviewGrid dense state={props.state} onSidebarAction={props.onSidebarAction} onSelectMenu={props.onSelectMenu} />
          </Show>
        )}
      >
        {(section) => (
          <div class="flex min-h-0 flex-1 flex-col">
            <button type="button" class="mb-2 min-h-12 text-left text-sm font-semibold text-wedding-accent" onClick={() => setMobileFocusSingleCardSectionId(null)}>‹ Home</button>
            <div class="min-h-0 flex-1 overflow-auto">{section().render()}</div>
          </div>
        )}
      </Show>
    </MobileFocusHome>
  );
}

function DeckCard(props: { item: FocusDeckItem; onOpenAgentDraft: () => void }) {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <DecisionCard
        card={decisionCardFromFocusDeckItem(props.item)}
        mode="standard"
        showActions={props.item.kind === "response"}
        onAction={() => props.onOpenAgentDraft()}
        class="shadow-none"
      />
      <p class="mt-auto pt-4 text-xs text-wedding-muted">Use the action bar or swipe. Sending a vendor message always needs a separate confirmation.</p>
    </div>
  );
}
