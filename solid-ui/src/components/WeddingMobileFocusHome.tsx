// @locs-version: 1.1
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";

import { MobileFocusDeck } from "@/components/MobileFocusDeck";
import { MobileFocusHome } from "@/components/MobileFocusHome";
import { DecisionCard } from "@/components/DecisionCard";
import { QueueClearedZenState } from "@/components/QueueClearedZenState";
import { WeddingHomeOverviewGrid } from "@/components/WeddingHomeOverviewGrid";
import { WeddingVendorDeckCard } from "@/components/WeddingVendorDeckCard";
import type { WeddingVendorChoiceSelectionSaveInput } from "@/components/WeddingArtifactDetailPanel";
import type { SendAfpMessageInput } from "@/lib/api";
import { decisionTriageToAfpSendInput } from "@/lib/decisionTriageAfpState";
import { buildDecisionTriageProjectionState } from "@/lib/decisionTriageProjectionState";
import { decisionCardFromFocusDeckItem } from "@/lib/decisionCardState";
import {
  buildWeddingDecisionFocusDisplayState,
  weddingVendorResearchQueryForDecision,
} from "@/lib/weddingDecisionFocusDisplayState";
import { buildWeddingDecisionDeferSidebarAction } from "@/lib/weddingDecisionFocusActionState";
import { defaultWeddingDecisionReminderAt } from "@/lib/weddingDecisionDeferralAfpState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingPersonalOsRankedItem } from "@/lib/weddingPersonalOsProjectionState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import {
  hiddenAttentionCount,
  installMobileFocusViewportListener,
  loadMobileFocusTriageMemory,
  mobileDecisionResearchEligibleIds,
  mobileFocusMode,
  mobileFocusSingleCardSectionId,
  publishMobileFocusHomeSections,
  rankFocusDeckItems,
  saveMobileFocusTriageMemory,
  setMobileFocusMode,
  setMobileFocusSingleCardSectionId,
  setMobileWeddingDecisionOpenIntent,
  type FocusDeckItem,
} from "@/lib/mobileFocusHomeState";
import type { WeddingVendorQuoteReplyFlowState } from "@/lib/weddingVendorQuoteReplyFlowState";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";
import type { AfpAttachment } from "@/lib/api";
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import type { WeddingVendorChoiceIntent } from "@/lib/weddingVendorChoiceActionState";
import type { WeddingVendorEnquiryPermissions } from "@/lib/weddingVendorEnquiryPermissionsState";
import type { WeddingCelebrantConsultationDraftContext } from "@/lib/weddingCelebrantConsultationDraftState";
import { friendlyErrorText } from "@/lib/visibleErrorText";
import { requestFundedWeddingDecisionResearch } from "@/lib/weddingDecisionResearchApi";
import { buildWeddingDecisionResearchState, weddingDecisionResearchQueueWindow, type WeddingDecisionResearchState } from "@/lib/weddingDecisionResearchState";
import { loadWeddingTaskCompletion, WEDDING_TASK_COMPLETION_EVENT } from "@/lib/weddingTaskCompletionLocalState";
import {
  dispatchWeddingVendorSearchLaunch,
  saveWeddingVendorSearchLaunch,
  weddingVendorSearchLaunchResultFromEvent,
  WEDDING_VENDOR_SEARCH_LAUNCH_RESULT_EVENT,
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
  onContactVendor?: (card: WeddingVendorChoiceCardData, artifactId: string, intent: WeddingVendorChoiceIntent, consultationContext?: WeddingCelebrantConsultationDraftContext | null) => void;
  onVendorChoiceSelected?: (input: WeddingVendorChoiceSelectionSaveInput) => void;
  onOutreachBodyChange?: (choiceId: string, bodyMarkdown: string) => void;
  onOutreachRecipientChange?: (choiceId: string, email: string) => void;
  onOutreachAttachmentsChange?: (choiceId: string, attachments: AfpAttachment[]) => void;
  onOutreachPermissionsChange?: (choiceId: string, permissions: WeddingVendorEnquiryPermissions) => void;
  onRetryOutreach?: (choiceId: string) => void;
  onSendOutreach?: (choiceId: string) => void;
  onCancelOutreach?: (choiceId: string) => void;
  onConnectGmailForOutreach?: () => void;
}) {
  const initialTriageMemory = loadMobileFocusTriageMemory(
    props.userId,
    props.state.workspace.metadata.responseWorkspaceId,
  );
  const [position, setPosition] = createSignal(0);
  const [deferredIds, setDeferredIds] = createSignal<Set<string>>(new Set(initialTriageMemory.deferredIds));
  const [resolvedIds, setResolvedIds] = createSignal<Set<string>>(new Set(initialTriageMemory.resolvedIds));
  const [pendingApproval, setPendingApproval] = createSignal<PendingApproval | null>(null);
  const [pendingTriage, setPendingTriage] = createSignal<PendingTriage | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [completionRevision, setCompletionRevision] = createSignal(0);
  const [fundedResearch, setFundedResearch] = createSignal<Record<string, WeddingDecisionResearchState>>({});
  const [fundedResearchStatus, setFundedResearchStatus] = createSignal<Record<string, "loading" | "failed">>({});
  const [researchRetryRevision, setResearchRetryRevision] = createSignal(0);
  const fundedResearchAttempts = new Set<string>();
  const vendorPrefetchAttempts = new Set<string>();
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
  const taskForDecision = (itemId: string) => props.state.planningTaskItems.find(
    (task) => task.id === itemId.replace(/^task:/, ""),
  ) ?? null;
  const savedResearchContext = () => props.state.contextCards.flatMap((card) => [
    card.planningContext.location,
    card.planningContext.atmosphereDescription,
    card.planningContext.vendorPreferences,
    ...(card.planningContext.topPriorities ?? []),
  ]).filter((value): value is string => Boolean(value?.trim())).slice(0, 12);
  const builtResearchForDecision = (itemId: string) => buildWeddingDecisionResearchState({
    task: taskForDecision(itemId), state: props.state,
  });
  const researchForDecision = (itemId: string) => fundedResearch()[itemId] ?? builtResearchForDecision(itemId);
  const vendorShortlistForDecision = (item: Pick<WeddingPersonalOsRankedItem, "title" | "evidenceLabels">) => {
    const query = weddingVendorResearchQueryForDecision(item);
    if (!query) return null;
    const terms = query.toLowerCase().replace(/\bwedding\b|\bvendors?\b/g, " ").split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 4)
      .map((term) => term.replace(/s$/, ""));
    return props.state.artifactPreviews.find((artifact) => {
      if (artifact.vendorComparisonCards.length < 3) return false;
      const evidence = [artifact.title, artifact.category, ...artifact.vendorComparisonCards.flatMap((card) => [
        card.category ?? "", card.title, ...(card.facetLabels ?? []),
      ])].join(" ").toLowerCase();
      return terms.some((term) => evidence.includes(term));
    }) ?? null;
  };
  const vendorRecommendation = (item: Pick<WeddingPersonalOsRankedItem, "title" | "evidenceLabels">) => {
    const artifact = vendorShortlistForDecision(item);
    const cards = artifact?.vendorComparisonCards.slice().sort((left, right) => left.rank - right.rank).slice(0, 3) ?? [];
    const top = cards[0];
    if (!artifact || !top) return null;
    const otherNames = cards.slice(1).map((card) => card.title);
    const comparison = otherNames.length > 0 ? ` ahead of ${otherNames.join(" and ")}` : "";
    const why = [top.situationFit, top.preferenceMatch, artifact.vendorComparisonHandoff?.recommendationLabel]
      .find((value): value is string => Boolean(value?.trim()));
    return {
      artifact,
      cards,
      summary: `${top.title} is the current top match${comparison}.${why ? ` ${why}` : ""}`,
    };
  };
  const decisions = createMemo(() => {
    const ranked = rankFocusDeckItems(display().queuedItemCards.map((card) => ({
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
      decisionContract: card.item.decisionContract,
    })));
    // Prepare a bounded look-ahead: the visible decision and the next two.
    const researchEligibleIds = mobileDecisionResearchEligibleIds(ranked);
    return ranked.map((item) => {
      if (!researchEligibleIds.has(item.id)) return item;
      const decision = display().queuedItemCards.find((card) => card.id === item.id)?.item;
      const vendor = decision ? vendorRecommendation(decision) : null;
      if (vendor) return {
        ...item,
        recommendedActionLabel: vendor.summary,
        evidenceLabels: Array.from(new Set([...item.evidenceLabels, "Source-backed top-three vendor comparison", "Saved wedding preferences"])),
        decisionContract: item.decisionContract ? (() => {
          const prerequisites = item.decisionContract!.prerequisites.map((prerequisite) => prerequisite.key === "source_evidence"
            ? { ...prerequisite, satisfied: vendor.artifact.sourceLinks.length > 0 }
            : prerequisite);
          const missingPrerequisite = prerequisites.find((prerequisite) => !prerequisite.satisfied) ?? null;
          return {
            ...item.decisionContract!,
            prerequisites,
            missingPrerequisite,
            evidence: [
              ...vendor.artifact.sourceLinks.slice(0, 4).map((source) => ({
                label: source.label,
                ref: source.url,
                sourceKind: "vendor_source" as const,
                status: "confirmed" as const,
              })),
              ...item.decisionContract!.evidence,
            ].slice(0, 8),
            recommendationSupported: vendor.artifact.sourceLinks.length > 0 && !missingPrerequisite,
          };
        })() : item.decisionContract,
        vendorComparison: { artifactId: vendor.artifact.artifactId, cards: vendor.cards },
      };
      const research = researchForDecision(item.id);
      if (!research) {
        const vendorQuery = decision ? weddingVendorResearchQueryForDecision(decision) : null;
        const status = fundedResearchStatus()[item.id];
        if (vendorQuery && status === "loading") return { ...item, recommendedActionLabel: "Checking live vendor evidence and ranking three matches for your wedding…" };
        if (vendorQuery && status === "failed") return { ...item, recommendedActionLabel: "The live shortlist could not be refreshed yet; no vendor recommendation has been approved." };
        if (status === "loading") return { ...item, recommendedActionLabel: "Checking the saved wedding details and preparing the recommendation…" };
        if (status === "failed") return { ...item, recommendedActionLabel: "Research could not be completed yet; no recommendation has been approved." };
        return item;
      }
      return {
        ...item,
        recommendedActionLabel: research.recommendation,
        evidenceLabels: Array.from(new Set([
          ...item.evidenceLabels,
          research.existingArtifactId ? "Saved wedding research" : "Prepared wedding research brief",
        ])),
      };
    });
  });
  const needsFundedResearch = (item: WeddingPersonalOsRankedItem) => {
    const task = taskForDecision(item.id);
    return Boolean(task
      && !/pending RSVP/i.test(task.title)
      && !weddingVendorResearchQueryForDecision(item)
      && !builtResearchForDecision(item.id));
  };
  const decisionPreparation = createMemo(() => {
    const labels = ["Current step", "Next step", "Following step"];
    const steps = weddingDecisionResearchQueueWindow(display().queuedFocusItems).map(({ item, queueRank }) => {
      const task = taskForDecision(item.id);
      const status = fundedResearchStatus()[item.id];
      const vendorQuery = weddingVendorResearchQueryForDecision(item);
      const ready = !task
        || /pending RSVP/i.test(task.title)
        || (vendorQuery ? Boolean(vendorShortlistForDecision(item)) : Boolean(researchForDecision(item.id)) || !needsFundedResearch(item));
      return {
        id: item.id,
        label: labels[queueRank] ?? `Step ${queueRank + 1}`,
        title: item.title,
        state: ready ? "ready" as const : status === "failed" ? "failed" as const : "preparing" as const,
      };
    });
    return { steps, ready: steps.every((step) => step.state === "ready") };
  });
  createEffect(() => {
    researchRetryRevision();
    const context = savedResearchContext();
    weddingDecisionResearchQueueWindow(display().queuedFocusItems).forEach(({ item, queueRank }) => {
      const task = taskForDecision(item.id);
      if (!task || !needsFundedResearch(item)) return;
      const attemptKey = `${props.state.workspace.metadata.weddingPlanId}:${task.id}:${task.title}:${task.notes ?? ""}:${context.join("|")}`;
      if (fundedResearchAttempts.has(attemptKey)) return;
      fundedResearchAttempts.add(attemptKey);
      setFundedResearchStatus((current) => ({ ...current, [item.id]: "loading" }));
      void requestFundedWeddingDecisionResearch({
        weddingPlanId: props.state.workspace.metadata.weddingPlanId,
        responseWorkspaceId: props.state.workspace.metadata.responseWorkspaceId,
        taskId: task.id,
        title: task.title,
        notes: task.notes,
        context,
        queueRank,
      }).then((result) => {
        if (!result.recommendation || !result.reportMarkdown) return;
        setFundedResearch((current) => ({ ...current, [item.id]: {
          kind: "funded_research",
          recommendation: result.recommendation,
          detailMarkdown: result.reportMarkdown,
          existingArtifactId: null,
          generatedArtifact: null,
        } }));
        setFundedResearchStatus((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      }).catch(() => setFundedResearchStatus((current) => ({ ...current, [item.id]: "failed" })));
    });
  });
  createEffect(() => {
    researchRetryRevision();
    for (const { item } of weddingDecisionResearchQueueWindow(display().queuedFocusItems)) {
      const query = weddingVendorResearchQueryForDecision(item);
      if (!query || vendorShortlistForDecision(item)) continue;
      const attemptKey = `${props.state.workspace.metadata.weddingPlanId}:${item.id}:${query}`;
      if (vendorPrefetchAttempts.has(attemptKey)) continue;
      vendorPrefetchAttempts.add(attemptKey);
      setFundedResearchStatus((current) => ({ ...current, [item.id]: "loading" }));
      const launch = saveWeddingVendorSearchLaunch(query, {
        source: "wedding_home",
        runImmediately: true,
        background: true,
        sourceDecisionId: item.id,
      });
      if (launch) dispatchWeddingVendorSearchLaunch(launch);
    }
  });
  function retryDecisionPreparation() {
    fundedResearchAttempts.clear();
    vendorPrefetchAttempts.clear();
    setFundedResearchStatus((current) => Object.fromEntries(Object.entries(current).filter(([, status]) => status !== "failed")));
    setResearchRetryRevision((value) => value + 1);
  }
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
    const vendorResultListener = (event: Event) => {
      const result = weddingVendorSearchLaunchResultFromEvent(event);
      if (!result) return;
      setFundedResearchStatus((current) => {
        const next = { ...current };
        if (!result.ok) next[result.sourceDecisionId] = "failed";
        return next;
      });
      if (result.ok) props.onRefreshWorkspace?.();
    };
    window.addEventListener(WEDDING_TASK_COMPLETION_EVENT, listener);
    window.addEventListener(WEDDING_VENDOR_SEARCH_LAUNCH_RESULT_EVENT, vendorResultListener);
    onCleanup(() => {
      window.removeEventListener(WEDDING_TASK_COMPLETION_EVENT, listener);
      window.removeEventListener(WEDDING_VENDOR_SEARCH_LAUNCH_RESULT_EVENT, vendorResultListener);
    });
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
  createEffect(() => {
    const mode = mobileFocusMode();
    const sectionId = mobileFocusSingleCardSectionId();
    if (sectionId || (mode !== "decisions" && mode !== "responses")) return;
    queueMicrotask(() => document.querySelector<HTMLElement>("[data-wedding-mobile-scroll-root]")?.scrollTo({ top: 0 }));
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
  // The focused deck can advance beyond the initially visible item. Resolve
  // actions from the complete queue so later vendor-research decisions retain
  // their category-specific Search/Open-shortlist consequence.
  const decisionItemFor = (id: string) => display().queuedItemCards.find((card) => card.id === id)?.item;
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
    saveMobileFocusTriageMemory(props.userId, props.state.workspace.metadata.responseWorkspaceId, {
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
    if (item.kind === "decision") {
      if (method === "swipe") {
        approveDecisionImmediately(item, method);
        return;
      }
      openDecisionSurface(item);
      return;
    }
    setPendingApproval({ item, method });
  }

  function approveDecisionImmediately(item: FocusDeckItem, method: InputMethod) {
    const decision = decisionItemFor(item.id);
    if (!decision) return;
    const comparison = item.vendorComparison;
    const recommended = comparison?.cards.slice().sort((left, right) => left.rank - right.rank)[0];
    const artifact = comparison
      ? props.state.artifactPreviews.find((candidate) => candidate.artifactId === comparison.artifactId)
      : null;
    // A supplier decision is safe to approve by gesture only after the
    // evidence-backed shortlist exists. Never turn a fast swipe during a
    // provider delay into approval of a generic task fallback.
    if (weddingVendorResearchQueryForDecision(decision) && (!artifact || !recommended)) {
      openVendorResearch(item);
      setNotice("The source-backed shortlist is still being prepared. It will appear here before you choose a vendor.");
      return;
    }
    if (artifact && recommended) {
      props.onVendorChoiceSelected?.({
        artifact,
        optionId: recommended.choiceId,
        optionLabel: recommended.title,
        contact: recommended,
        selected: true,
      });
    }
    void triage("approve", item, method, () => {
      rememberTriage("approve", decision.id);
      setNotice(recommended
        ? `${recommended.title} is saved as your preferred option. No enquiry was sent.`
        : "Recommendation approved. Here is the next decision that still needs you.");
    });
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

  async function defer(item: FocusDeckItem, method: InputMethod, deferredUntilAt?: string | null): Promise<boolean> {
    await triage("defer", item, method, () => {
      if (item.kind === "decision") {
        const decision = decisionItemFor(item.id);
        if (decision) props.onSidebarAction(buildWeddingDecisionDeferSidebarAction(decision, deferredUntilAt));
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

  function openDecisionSurface(item: FocusDeckItem) {
    if (openVendorResearch(item)) return;
    const research = researchForDecision(item.id);
    const title = taskForDecision(item.id)?.title ?? item.title;
    setMobileWeddingDecisionOpenIntent({
      itemId: item.id,
      surface: research ? "research" : /pending RSVP/i.test(title) ? "rsvp" : "task",
    });
    setMobileFocusMode("overview");
    setMobileFocusSingleCardSectionId("decision_focus");
  }

  function hasVendorShortlist(item: FocusDeckItem): boolean {
    const decision = decisionItemFor(item.id);
    return Boolean(decision && vendorShortlistForDecision(decision));
  }

  function primaryActionLabel(item: FocusDeckItem): string {
    const decision = decisionItemFor(item.id);
    if (decision && weddingVendorResearchQueryForDecision(decision)) {
      if (item.decisionContract?.missingPrerequisite && item.decisionContract.missingPrerequisite.key !== "source_evidence") {
        return item.decisionContract.primaryActionLabel;
      }
      return hasVendorShortlist(item) ? "Open shortlist" : "Search vendors";
    }
    if (item.kind === "response") return "Review response";
    if (item.decisionContract) return item.decisionContract.primaryActionLabel;
    if (researchForDecision(item.id)) return "View report";
    if (/pending RSVP/i.test(taskForDecision(item.id)?.title ?? item.title)) return "Message guest";
    return "Open task";
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
    saveMobileFocusTriageMemory(props.userId, props.state.workspace.metadata.responseWorkspaceId, {
      resolvedIds: [...resolvedIds()],
      deferredIds: [...next],
    });
    setPosition(0);
    setNotice("That item is back in your active queue.");
  }

  const currentTitle = () => "";
  const selectedSection = createMemo(() => props.homeSections.find((section) => section.id === mobileFocusSingleCardSectionId()) ?? null);
  const decisionSurfaceOpen = () => selectedSection()?.id === "decision_focus";
  const clearDecisionView = () => !selectedSection()
    && !pendingApproval()
    && !notice()
    && mobileFocusMode() !== "overview"
    && items().length === 0;

  return (
    <MobileFocusHome
      title={decisionSurfaceOpen() ? "" : selectedSection()?.title ?? currentTitle()}
      attentionCount={hiddenAttentionCount({
        responseCount: responses().length,
        overdueDecisionCount: decisions().filter((item) => item.dueAt && Date.parse(item.dueAt) <= Date.now()).length,
      })}
      immersive={clearDecisionView() || decisionSurfaceOpen() || (!selectedSection() && mobileFocusMode() !== "overview")}
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
              <Show when={mobileFocusMode() !== "decisions" || decisionPreparation().ready} fallback={(
                <section class="mx-auto w-full max-w-lg rounded-2xl border border-wedding-border bg-white p-4 shadow-card" role="status" aria-live="polite">
                  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-wedding-accent">Preparing your decisions</p>
                  <h2 class="mt-2 text-lg font-semibold text-wedding-text">Checking the current step and the two after it</h2>
                  <p class="mt-1 text-sm leading-6 text-wedding-muted">Your first decision card will appear only after these steps have enough context for a specific recommendation.</p>
                  <ol class="mt-4 grid gap-2">
                    {decisionPreparation().steps.map((step) => (
                      <li class="rounded-xl border border-wedding-border px-3 py-2">
                        <div class="flex items-start justify-between gap-3">
                          <div><p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-wedding-muted">{step.label}</p><p class="mt-1 text-sm font-semibold text-wedding-text">{step.title}</p></div>
                          <span class="shrink-0 text-xs font-semibold text-wedding-accent">{step.state === "ready" ? "Ready" : step.state === "failed" ? "Needs retry" : "Researching…"}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <Show when={decisionPreparation().steps.some((step) => step.state === "failed")}>
                    <button type="button" class="mt-4 min-h-12 w-full rounded-xl border-2 border-wedding-cta bg-white px-4 text-sm font-bold text-wedding-text" onClick={retryDecisionPreparation}>Retry research</button>
                  </Show>
                </section>
              )}>
              <MobileFocusDeck
                items={items()}
                position={position()}
                onPositionChange={setPosition}
                onApprove={requestApproval}
                onDefer={defer}
                defaultReminderAt={(item) => {
                  const decision = decisionItemFor(item.id);
                  return defaultWeddingDecisionReminderAt({ dueAt: decision?.dueAt ?? item.dueAt });
                }}
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
                  : <DeckCard item={item} onOpen={() => item.kind === "response" ? openAgentDraft() : openDecisionSurface(item)} />}
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
              </Show>
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
            <div class="min-h-0 min-w-0 flex-1 overflow-auto pb-3">{section().render()}</div>
          </div>
        )}
      </Show>
    </MobileFocusHome>
  );
}

function DeckCard(props: {
  item: FocusDeckItem;
  onOpen: () => void;
}) {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <DecisionCard
        card={decisionCardFromFocusDeckItem(props.item)}
        mode="standard"
        showActions={false}
        onAction={props.onOpen}
        class="h-full w-full overflow-y-auto rounded-none border-x-0 pb-6 shadow-none"
      />
    </div>
  );
}
