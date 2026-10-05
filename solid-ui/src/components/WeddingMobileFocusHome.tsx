// @locs-version: 1.0
import { createEffect, createMemo, createSignal, onCleanup, Show, type JSX } from "solid-js";
import { MobileFocusDeck } from "@/components/MobileFocusDeck";
import { MobileFocusHome } from "@/components/MobileFocusHome";
import { QueueClearedZenState } from "@/components/QueueClearedZenState";
import { WeddingHomeOverviewGrid } from "@/components/WeddingHomeOverviewGrid";
import type { SendAfpMessageInput } from "@/lib/api";
import { decisionTriageToAfpSendInput } from "@/lib/decisionTriageAfpState";
import { buildWeddingDecisionFocusDisplayState } from "@/lib/weddingDecisionFocusDisplayState";
import { buildWeddingDecisionDeferSidebarAction, buildWeddingDecisionFocusSidebarAction } from "@/lib/weddingDecisionFocusActionState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import {
  hiddenAttentionCount, installMobileFocusViewportListener, mobileFocusMode, mobileFocusSingleCardSectionId,
  publishMobileFocusHomeSections, rankFocusDeckItems, setMobileFocusSingleCardSectionId, type FocusDeckItem,
} from "@/lib/mobileFocusHomeState";
import type { WeddingVendorQuoteReplyFlowState } from "@/lib/weddingVendorQuoteReplyFlowState";

type HomeSection = { id: string; title: string; render: () => JSX.Element };
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
  const [notice, setNotice] = createSignal<string | null>(null);
  const display = createMemo(() => buildWeddingDecisionFocusDisplayState({ relief: props.state.personalOsProjection.decisionLoadRelief, locallyDeferredIds: deferredIds() }));
  const decisions = createMemo(() => rankFocusDeckItems(display().itemCards.map((card) => ({
    id: card.id, kind: "decision" as const, sourceSurface: card.item.sourceSurface, title: card.title,
    recommendedActionLabel: card.recommendedActionLabel, whyNowLabel: card.whyNowLabel, dueAt: card.item.dueAt,
    evidenceLabels: card.item.evidenceLabels, deferCount: 0, returnedFromLater: false, external: false,
  }))));
  const responses = createMemo(() => rankFocusDeckItems(props.state.activeVendorQuoteReplyFlows.filter((flow) => !deferredIds().has(flow.id)).map((flow) => ({
    id: flow.id, kind: "response" as const, sourceSurface: "vendor_quote_reply", title: flow.title,
    recommendedActionLabel: flow.recommendationLabel, whyNowLabel: flow.summary, dueAt: null,
    evidenceLabels: flow.recommendationWhyLabels, deferCount: 0, returnedFromLater: false, external: flow.stage === "ready_to_send",
  }))));
  const items = () => mobileFocusMode() === "responses" ? responses() : decisions();
  createEffect(() => { publishMobileFocusHomeSections(props.homeSections.map((section) => ({ id: section.id, title: section.title, summary: `Open ${section.title}` }))); });
  createEffect(() => { mobileFocusMode(); setPosition(0); });
  const cleanup = installMobileFocusViewportListener(); onCleanup(cleanup);
  const save = async (input: SendAfpMessageInput) => {
    if (!props.saveProjection) { setNotice("Saved on this device. Will sync when you're back online."); return; }
    try { await props.saveProjection(input); } catch { setNotice("Saved on this device. Will sync when you're back online."); }
  };
  const triage = (action: "approve" | "defer", item: FocusDeckItem, method: "swipe" | "button" | "keyboard") => void save(decisionTriageToAfpSendInput({ action, item, deckPosition: position(), deckSize: items().length, inputMethod: method }));
  const decisionItemFor = (id: string) => display().itemCards.find((card) => card.id === id)?.item;
  const approve = (item: FocusDeckItem, method: "swipe" | "button" | "keyboard") => {
    if (item.kind === "response") {
      const flow = props.state.activeVendorQuoteReplyFlows.find((candidate) => candidate.id === item.id);
      if (flow?.stage === "draft_ready") props.onApproveQuoteReply?.(flow);
      else if (flow?.stage === "needs_budget_acknowledgement") props.onAcknowledgeQuoteReply?.(flow);
      else setNotice(flow?.stage === "ready_to_send" ? "Review the reply and confirm Send before anything leaves your workspace." : "Open the response to review its next safe step.");
      triage("approve", item, method); return;
    }
    const decision = decisionItemFor(item.id); if (!decision) return;
    triage("approve", item, method);
    props.onSidebarAction(buildWeddingDecisionFocusSidebarAction({ ...props.state.personalOsProjection.decisionLoadRelief, focusItems: [decision], backlogCount: 0 }, "open_item"));
  };
  const defer = (item: FocusDeckItem, method: "swipe" | "button" | "keyboard") => {
    if (item.kind === "decision") { const decision = decisionItemFor(item.id); if (decision) props.onSidebarAction(buildWeddingDecisionDeferSidebarAction(decision)); }
    setDeferredIds((current) => new Set([...current, item.id]));
    triage("defer", item, method);
  };
  const currentTitle = () => mobileFocusMode() === "overview" ? "Wedding overview" : `${mobileFocusMode() === "responses" ? "Response" : "Decision"} ${Math.min(position() + 1, items().length)} of ${items().length}`;
  const selectedSection = createMemo(() => props.homeSections.find((section) => section.id === mobileFocusSingleCardSectionId()) ?? null);
  return <MobileFocusHome title={selectedSection() ? "‹ Home" : currentTitle()} attentionCount={hiddenAttentionCount({ responseCount: responses().length, overdueDecisionCount: decisions().filter((item) => item.dueAt && Date.parse(item.dueAt) <= Date.now()).length })}>
    <Show when={notice()}>{(message) => <p class="mb-2 rounded-xl border border-wedding-muted bg-white px-3 py-2 text-xs text-wedding-text" role="status">{message()}</p>}</Show>
    <Show when={selectedSection()} fallback={<Show when={mobileFocusMode() === "overview"} fallback={<MobileFocusDeck items={items()} position={position()} onPositionChange={setPosition} onApprove={approve} onDefer={defer} label={mobileFocusMode() === "responses" ? "Response" : "Decision"} renderCard={(item) => <DeckCard item={item}/>} renderEnd={() => <QueueClearedZenState variant="wedding" laterCount={deferredIds().size} onPrimary={() => props.onSelectMenu?.("plan")} onDiary={() => props.onSelectMenu?.("timeline")}/>}/>}><WeddingHomeOverviewGrid dense state={props.state} onSidebarAction={props.onSidebarAction} onSelectMenu={props.onSelectMenu}/></Show>}>{(section) => <div class="flex min-h-0 flex-1 flex-col"><button type="button" class="mb-2 min-h-12 text-left text-sm font-semibold text-wedding-accent" onClick={() => setMobileFocusSingleCardSectionId(null)}>‹ Home</button><div class="min-h-0 flex-1 overflow-auto">{section().render()}</div></div>}</Show>
  </MobileFocusHome>;
}
function DeckCard(props: { item: FocusDeckItem }) { return <article class="flex min-h-0 flex-1 flex-col"><span class="w-fit rounded-full bg-wedding-surface-blush px-2 py-1 text-xs font-semibold text-wedding-accent">{props.item.kind === "decision" ? "Decision" : "Response"}</span><h2 class="mt-4 line-clamp-3 text-xl font-semibold text-wedding-text">{props.item.title}</h2><p class="mt-4 text-sm font-semibold text-wedding-text">Recommended: {props.item.recommendedActionLabel}</p><p class="mt-3 line-clamp-3 text-sm leading-6 text-wedding-muted">{props.item.whyNowLabel}</p><div class="mt-4 flex flex-wrap gap-2">{props.item.evidenceLabels.slice(0, 3).map((label) => <span class="rounded-full border border-wedding-muted bg-wedding-surface-muted px-2 py-1 text-xs text-wedding-text">{label}</span>)}</div><p class="mt-auto pt-4 text-xs text-wedding-muted">Use the action bar or swipe. Sending a vendor message always needs a separate confirmation.</p></article>; }
