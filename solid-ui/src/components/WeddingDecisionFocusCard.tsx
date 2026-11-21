// @locs-version: 1.0
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { DecisionCard } from "@/components/DecisionCard";
import { WeddingDecisionResearchDetail } from "@/components/WeddingDecisionResearchDetail";
import { WeddingDecisionRsvpFollowUp } from "@/components/WeddingDecisionRsvpFollowUp";
import { WeddingBudgetTrackerCard } from "@/components/WeddingBudgetTrackerCard";
import { WeddingSeatingPanel } from "@/components/WeddingSeatingPanel";
import { WeddingVendorOutreachComposer } from "@/components/WeddingVendorOutreachComposer";
import type { WeddingVendorChoiceSelectionSaveInput } from "@/components/WeddingArtifactDetailPanel";
import { loadContacts, saveContacts, subscribeContactsChangedEvent, type Contact } from "@/lib/contactsLocalState";
import { postAgentMessage, readSession, type SendAfpMessageInput } from "@/lib/api";
import { buildWeddingDecisionResearchState, weddingDecisionResearchQueueWindow } from "@/lib/weddingDecisionResearchState";
import type { WeddingDecisionResearchState } from "@/lib/weddingDecisionResearchState";
import { requestFundedWeddingDecisionResearch } from "@/lib/weddingDecisionResearchApi";
import { loadWeddingReviewDecisionObservation, type WeddingReviewDecisionObservation } from "@/lib/weddingReviewApi";
import {
  WEDDING_ASSIGNMENT_ROLE_OPTIONS,
  weddingAssignmentContactKey,
} from "@/lib/weddingTaskAssignmentEmailState";

import {
  buildWeddingDecisionDeferSidebarAction,
  buildWeddingDecisionFocusSidebarAction,
} from "@/lib/weddingDecisionFocusActionState";
import {
  buildWeddingDecisionFocusDisplayState,
  weddingVendorResearchQueryForDecision,
} from "@/lib/weddingDecisionFocusDisplayState";
import { decisionCardFromWeddingFocus, type DecisionCardModel } from "@/lib/decisionCardState";
import { formatWeddingDecisionDate } from "@/lib/weddingDecisionCardContentState";
import { defaultWeddingDecisionReminderAt } from "@/lib/weddingDecisionDeferralAfpState";
import {
  weddingGuestFinalCountApprovalToAfpSendInput,
  weddingGuestFinalCountChoices,
} from "@/lib/weddingGuestFinalCountApprovalState";
import type { useWeddingVendorOutreachOwner } from "@/lib/useWeddingVendorOutreachOwner";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingPersonalOsRankedItem } from "@/lib/weddingPersonalOsProjectionState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import { loadWeddingTaskCompletion, saveWeddingTaskCompletion, WEDDING_TASK_COMPLETION_EVENT } from "@/lib/weddingTaskCompletionLocalState";
import { weddingTaskCompletionToAfpSendInput } from "@/lib/weddingTaskCompletionProjectionState";
import {
  dispatchWeddingVendorSearchLaunch,
  saveWeddingVendorSearchLaunch,
  weddingVendorSearchLaunchResultFromEvent,
  weddingVendorSearchQueryFromIntake,
  WEDDING_VENDOR_SEARCH_LAUNCH_RESULT_EVENT,
} from "@/lib/weddingVendorSearchLaunchState";
import { weddingRsvpSetupFromAfpMessages } from "@/lib/weddingRsvpSetupState";
import {
  mobileWeddingDecisionOpenIntent,
  setMobileWeddingDecisionOpenIntent,
} from "@/lib/mobileFocusHomeState";
import { weddingAccountScopedStorageKey } from "@/lib/weddingLocalAccountScope";

export function WeddingDecisionFocusCard(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
  vendorOutreach?: ReturnType<typeof useWeddingVendorOutreachOwner>;
  onVendorChoiceSelected?: (input: WeddingVendorChoiceSelectionSaveInput) => void;
  gmailConnected?: boolean;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
}) {
  const LOCAL_DEFER_TTL_MS = 10 * 60 * 1000;
  const deferredStorageKey = () => {
    const workspaceId = props.state.workspace.metadata.responseWorkspaceId?.trim() || "default";
    return weddingAccountScopedStorageKey(`omnyid.wedding.deferred-focus.${workspaceId}`);
  };
  const readDeferredIds = (): Set<string> => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = JSON.parse(window.localStorage.getItem(deferredStorageKey()) ?? "null");
      if (!stored || typeof stored !== "object" || !Array.isArray(stored.ids) || Number(stored.expiresAt) <= Date.now()) {
        window.localStorage.removeItem(deferredStorageKey());
        return new Set();
      }
      return new Set(stored.ids.filter((value: unknown): value is string => typeof value === "string"));
    } catch {
      return new Set();
    }
  };
  const [locallyDeferredIds, setLocallyDeferredIds] = createSignal<Set<string>>(readDeferredIds());
  const [completionRevision, setCompletionRevision] = createSignal(0);
  const [expandedTaskId, setExpandedTaskId] = createSignal<string | null>(null);
  const [expandedSeatingItemId, setExpandedSeatingItemId] = createSignal<string | null>(null);
  const [expandedWhyItemId, setExpandedWhyItemId] = createSignal<string | null>(null);
  const [showDecisionHistory, setShowDecisionHistory] = createSignal(false);
  const [assignmentDrafts, setAssignmentDrafts] = createSignal<Record<string, string>>({});
  const [assignmentContacts, setAssignmentContacts] = createSignal<Record<string, Contact>>({});
  const [contacts, setContacts] = createSignal<Contact[]>([]);
  const [assigneePickerTaskId, setAssigneePickerTaskId] = createSignal<string | null>(null);
  const [newContactTaskId, setNewContactTaskId] = createSignal<string | null>(null);
  const [newContactName, setNewContactName] = createSignal("");
  const [newContactRole, setNewContactRole] = createSignal<string>(WEDDING_ASSIGNMENT_ROLE_OPTIONS[0]);
  const [newContactEmail, setNewContactEmail] = createSignal("");
  const [newContactError, setNewContactError] = createSignal<string | null>(null);
  const [vendorSelectionNotice, setVendorSelectionNotice] = createSignal<Record<string, string>>({});
  const [rsvpFollowUpOpenId, setRsvpFollowUpOpenId] = createSignal<string | null>(null);
  const [expandedResearchItemId, setExpandedResearchItemId] = createSignal<string | null>(null);
  const [expandedSetupItemId, setExpandedSetupItemId] = createSignal<string | null>(null);
  const [fundedResearch, setFundedResearch] = createSignal<Record<string, WeddingDecisionResearchState>>({});
  const [fundedResearchStatus, setFundedResearchStatus] = createSignal<Record<string, "loading" | "failed">>({});
  const [researchRetryRevision, setResearchRetryRevision] = createSignal(0);
  const [finalCountSelections, setFinalCountSelections] = createSignal<Record<string, string>>({});
  const [finalCountApprovalBusyId, setFinalCountApprovalBusyId] = createSignal<string | null>(null);
  const [reviewObservations, setReviewObservations] = createSignal<Record<string, WeddingReviewDecisionObservation | null>>({});
  const [reminderItem, setReminderItem] = createSignal<WeddingPersonalOsRankedItem | null>(null);
  const [reminderDate, setReminderDate] = createSignal("");
  const fundedResearchAttempts = new Set<string>();
  const vendorPrefetchAttempts = new Set<string>();
  const reviewObservationAttempts = new Set<string>();
  const rsvpSetup = createMemo(() => weddingRsvpSetupFromAfpMessages(
    props.state.afpMessages,
    props.state.workspace.metadata.responseWorkspaceId,
  ));
  const contactOptions = createMemo(() => {
    const seen = new Set<string>();
    const listed = contacts().map((contact) => ({
      name: contact.name,
      detail: [...(contact.roles ?? []), contact.relationshipKind].filter(Boolean).join(" · "),
      contact,
    }));
    for (const name of props.state.helperContactNames) listed.push({
      name,
      detail: "Wedding helper",
      contact: { id: `helper-${name}`, name, relationshipKind: "other" as const },
    });
    return listed.filter((contact) => {
      const key = contact.name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  onMount(() => {
    const userId = readSession()?.user?.id ?? null;
    const refresh = () => setContacts(loadContacts(userId));
    refresh();
    const unsubscribe = subscribeContactsChangedEvent(refresh);
    const completionListener = () => setCompletionRevision((value) => value + 1);
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
    window.addEventListener(WEDDING_TASK_COMPLETION_EVENT, completionListener);
    window.addEventListener(WEDDING_VENDOR_SEARCH_LAUNCH_RESULT_EVENT, vendorResultListener);
    onCleanup(() => {
      unsubscribe();
      window.removeEventListener(WEDDING_TASK_COMPLETION_EVENT, completionListener);
      window.removeEventListener(WEDDING_VENDOR_SEARCH_LAUNCH_RESULT_EVENT, vendorResultListener);
    });
  });
  const completedFocusIds = createMemo(() => {
    completionRevision();
    return new Set(props.state.planningTaskItems
      .filter((task) => loadWeddingTaskCompletion({ taskId: task.id, weddingPlanId: props.state.workspace.metadata.weddingPlanId, responseWorkspaceId: props.state.workspace.metadata.responseWorkspaceId })?.completed)
      .map((task) => `task:${task.id}`));
  });
  const display = createMemo(() => buildWeddingDecisionFocusDisplayState({
    relief: props.state.personalOsProjection.decisionLoadRelief,
    locallyDeferredIds: locallyDeferredIds(),
    locallyHiddenIds: completedFocusIds(),
  }));
  createEffect(() => {
    researchRetryRevision();
    const context = props.state.contextCards.flatMap((card) => [
      card.planningContext.location,
      card.planningContext.atmosphereDescription,
      card.planningContext.vendorPreferences,
      ...(card.planningContext.topPriorities ?? []),
    ]).filter((value): value is string => Boolean(value?.trim())).slice(0, 12);
    weddingDecisionResearchQueueWindow(display().queuedFocusItems).forEach(({ item, queueRank }) => {
      const task = taskFor(item.id);
      if (!needsFundedResearch(item, task)) return;
      const attemptKey = `${props.state.workspace.metadata.weddingPlanId}:${task.id}:${task.title}:${task.notes ?? ""}:${context.join("|")}`;
      if (fundedResearchAttempts.has(attemptKey)) return;
      fundedResearchAttempts.add(attemptKey);
      setFundedResearchStatus((current) => ({ ...current, [item.id]: "loading" }));
      void requestFundedWeddingDecisionResearch({
        weddingPlanId: props.state.workspace.metadata.weddingPlanId,
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
        }}));
        setFundedResearchStatus((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      }).catch(() => setFundedResearchStatus((current) => ({ ...current, [item.id]: "failed" })));
    });
  });
  createEffect(() => {
    const intent = mobileWeddingDecisionOpenIntent();
    if (!intent || !display().visibleFocusItems.some((item) => item.id === intent.itemId)) return;
    if (intent.surface === "research" && researchFor(intent.itemId)) setExpandedResearchItemId(intent.itemId);
    if (intent.surface === "rsvp") setRsvpFollowUpOpenId(intent.itemId);
    if (intent.surface === "task" && taskFor(intent.itemId)) setExpandedTaskId(intent.itemId);
    setMobileWeddingDecisionOpenIntent(null);
  });
  createEffect(() => {
    const sourceIds = new Set(props.state.personalOsProjection.decisionLoadRelief.focusItems.map((item) => item.id));
    setLocallyDeferredIds((current) => {
      const active = new Set([...current].filter((id) => sourceIds.has(id)));
      if (active.size === current.size) return current;
      try {
        if (active.size === 0) window.localStorage.removeItem(deferredStorageKey());
        else window.localStorage.setItem(deferredStorageKey(), JSON.stringify({ ids: [...active], expiresAt: Date.now() + LOCAL_DEFER_TTL_MS }));
      } catch { /* storage is optional */ }
      return active;
    });
  });
  const decisionFocusAction = () => buildWeddingDecisionFocusSidebarAction({
    ...props.state.personalOsProjection.decisionLoadRelief,
    focusItems: display().visibleFocusItems,
  }, "review_all");
  function deferItem(item: (typeof props.state.personalOsProjection.decisionLoadRelief.focusItems)[number], deferredUntilAt?: string | null) {
    const deferred = new Set([...locallyDeferredIds(), item.id]);
    setLocallyDeferredIds(deferred);
    // Persist the optimistic removal across the workspace refresh that follows the AFP write.
    // The durable AFP deferral remains the source of truth once the projection catches up.
    try {
      window.localStorage.setItem(deferredStorageKey(), JSON.stringify({
        ids: [...deferred],
        expiresAt: Date.now() + LOCAL_DEFER_TTL_MS,
      }));
    } catch { /* storage is optional */ }
    queueMicrotask(() => props.onSidebarAction(buildWeddingDecisionDeferSidebarAction(item, deferredUntilAt)));
  }
  function openReminderPicker(item: WeddingPersonalOsRankedItem) {
    setReminderItem(item);
    setReminderDate(defaultWeddingDecisionReminderAt(item).slice(0, 10));
  }
  function saveReminder() {
    const item = reminderItem();
    if (!item || !reminderDate()) return;
    const requested = new Date(`${reminderDate()}T12:00:00`).toISOString();
    setReminderItem(null);
    deferItem(item, requested);
  }
  function taskFor(itemId: string) {
    const taskId = itemId.replace(/^task:/, "");
    return props.state.planningTaskItems.find((task) => task.id === taskId) ?? null;
  }
  function isPendingRsvpFollowUp(itemId: string): boolean {
    const task = taskFor(itemId);
    const metadata = task?.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
      ? task.metadata as Record<string, unknown>
      : {};
    return /pending RSVP/i.test(task?.title ?? "")
      || metadata.guest_follow_up_candidate_id === "wedding_guest_follow_up:pending_rsvps";
  }
  function comparisonFor(item: (typeof props.state.personalOsProjection.decisionLoadRelief.focusItems)[number]) {
    const linked = item.linkedArtifactId?.trim();
    const exact = linked ? props.state.artifactPreviews.find((artifact) => artifact.artifactId === linked) : null;
    if (exact?.vendorComparisonCards.length) return exact;
    const isComparison = item.evidenceLabels.some((label) => /top-three vendor comparison/i.test(label))
      || /preferred vendors|vendor comparison/i.test(item.title);
    if (!isComparison) return null;
    return props.state.artifactPreviews.find((artifact) => artifact.vendorComparisonCards.length > 0) ?? null;
  }
  createEffect(() => {
    researchRetryRevision();
    for (const { item } of weddingDecisionResearchQueueWindow(display().queuedFocusItems)) {
      const query = weddingVendorResearchQueryForDecision(item);
      if (!query || comparisonFor(item)) continue;
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
  const decisionPreparation = createMemo(() => {
    const labels = ["Current step", "Next step", "Following step"];
    const steps = weddingDecisionResearchQueueWindow(display().queuedFocusItems).map(({ item, queueRank }) => {
      const task = taskFor(item.id);
      const vendorQuery = weddingVendorResearchQueryForDecision(item);
      const ready = !task
        || isPendingRsvpFollowUp(item.id)
        || (vendorQuery ? Boolean(comparisonFor(item)) : Boolean(researchFor(item.id)) || !needsFundedResearch(item, task));
      const status = fundedResearchStatus()[item.id];
      return {
        id: item.id,
        label: labels[queueRank] ?? `Step ${queueRank + 1}`,
        title: item.title,
        state: ready ? "ready" as const : status === "failed" ? "failed" as const : "preparing" as const,
      };
    });
    return { steps, ready: steps.every((step) => step.state === "ready") };
  });
  function retryDecisionPreparation() {
    fundedResearchAttempts.clear();
    vendorPrefetchAttempts.clear();
    setFundedResearchStatus((current) => Object.fromEntries(Object.entries(current).filter(([, status]) => status !== "failed")));
    setResearchRetryRevision((value) => value + 1);
  }
  createEffect(() => {
    const weddingPlanId = props.state.workspace.metadata.weddingPlanId;
    for (const card of display().itemCards) {
      const recommended = comparisonFor(card.item)?.vendorComparisonCards.slice().sort((left, right) => left.rank - right.rank)[0];
      if (!recommended?.choiceId) continue;
      const key = `${weddingPlanId}:${recommended.choiceId}`;
      if (reviewObservationAttempts.has(key)) continue;
      reviewObservationAttempts.add(key);
      void loadWeddingReviewDecisionObservation(weddingPlanId, recommended.choiceId)
        .then((observation) => setReviewObservations((current) => ({ ...current, [card.item.id]: observation })))
        .catch(() => setReviewObservations((current) => ({ ...current, [card.item.id]: null })));
    }
  });
  function priorityFor(item: (typeof props.state.personalOsProjection.decisionLoadRelief.focusItems)[number]): string {
    const taskPriority = taskFor(item.id)?.priority?.trim();
    const evidencePriority = item.evidenceLabels.find((label) => /^priority:/i.test(label))?.replace(/^priority:\s*/i, "").trim();
    const priority = taskPriority || evidencePriority || (item.pressureFamily === "obligation" ? "High" : item.pressureFamily === "attention" ? "Medium" : "Low");
    return `${priority.charAt(0).toUpperCase()}${priority.slice(1)} priority`;
  }
  function researchFor(itemId: string) {
    return fundedResearch()[itemId] ?? buildWeddingDecisionResearchState({ task: taskFor(itemId), state: props.state });
  }
  function needsFundedResearch(
    item: (typeof props.state.personalOsProjection.decisionLoadRelief.focusItems)[number],
    task: ReturnType<typeof taskFor>,
  ): task is NonNullable<ReturnType<typeof taskFor>> {
    return Boolean(task
      && !isPendingRsvpFollowUp(item.id)
      && !weddingVendorResearchQueryForDecision(item)
      && !buildWeddingDecisionResearchState({ task, state: props.state }));
  }
  function decisionModel(card: ReturnType<typeof decisionCardFromWeddingFocus>): DecisionCardModel {
    const item = display().itemCards.find((candidate) => candidate.id === card.id)?.item;
    if (!item) return card;
    const research = researchFor(item.id);
    const researchCard: DecisionCardModel = research ? {
      ...card,
      title: /transport|access|guest logistics/i.test(card.title)
        ? card.title.replace(/\s+for\s+(?:AUD\s*)?\$?[\d,.]+\s+total\s*$/i, "")
        : card.title,
      recommendation: {
        summary: research.recommendation,
        reasons: [research.existingArtifactId ? "Based on the saved research evidence linked to this wedding." : "Based on the current task, budget allocation and saved wedding preferences."],
      },
      evidence: card.evidence.length > 0 ? card.evidence : [{
        label: research.existingArtifactId ? "Saved wedding research" : "Wedding task and saved profile",
        ref: research.existingArtifactId ?? `wedding:${item.id}:research`,
        sourceKind: "wedding_planning",
        freshness: research.existingArtifactId ? "current" : "unknown",
      }],
      verification: research.existingArtifactId
        ? { status: "partial", label: "Saved evidence available" }
        : { status: "partial", label: "Planning brief ready; live details to verify" },
      actions: card.actions.some((action) => action.id === "assign")
        ? card.actions
        : [
            card.actions[0]!,
            { id: "assign", label: "Assign", role: "secondary", effect: "Opens assignment controls for this decision", intent: "assign" },
            ...card.actions.slice(1),
          ],
    } : needsFundedResearch(item, taskFor(item.id)) ? {
      ...card,
      recommendation: fundedResearchStatus()[item.id] === "failed"
        ? { summary: "An evidence-backed recommendation is not available yet. Nothing has been recommended or changed.", reasons: ["Try again later, or open the task to review the saved wedding details yourself."] }
        : { summary: "Reviewing the saved wedding details for this decision…", reasons: ["OmnyID will show a recommendation only after the relevant evidence has been checked."] },
    } : card;
    const finalCountChoices = weddingGuestFinalCountChoices(taskFor(item.id));
    if (finalCountChoices.length > 0) {
      const selected = finalCountSelections()[item.id];
      return {
        ...researchCard,
        pattern: "approve_act",
        patternSlots: {
          ...researchCard.patternSlots,
          options: finalCountChoices.map((choice) => ({ id: choice.id, name: choice.label, summary: choice.riskLabel })),
        },
        actions: [
          {
            id: "approve_guest_count",
            label: finalCountApprovalBusyId() === item.id ? "Saving…" : "Approve guest count",
            role: "primary",
            effect: "Records the selected final guest count and completes this decision",
            intent: "approve",
            disabledReason: finalCountApprovalBusyId() === item.id
              ? "The approval is being saved."
              : selected ? null : "Choose a guest-count option first.",
          },
          { id: "assign", label: "Assign", role: "secondary", effect: "Opens assignment controls for this decision", intent: "assign" },
          { id: "later", label: "Decide later", role: "dismiss", effect: "Moves this decision out of the current focus", intent: "defer" },
        ],
      };
    }
    const artifact = comparisonFor(item);
    const recommended = artifact?.vendorComparisonCards.slice().sort((left, right) => left.rank - right.rank)[0];
    if (!artifact || !recommended) return researchCard;
    const others = artifact.vendorComparisonCards
      .filter((vendor) => vendor.choiceId !== recommended.choiceId)
      .slice(0, 2)
      .map((vendor) => vendor.title);
    const lead = others.length > 0
      ? `${recommended.title} is the current top match ahead of ${others.join(" and ")}.`
      : `${recommended.title} is the current top match.`;
    const rationale = [artifact.vendorComparisonHandoff?.recommendationLabel, ...(artifact.vendorComparisonHandoff?.whyLabels ?? []).slice(0, 2)]
      .filter((label): label is string => Boolean(label?.trim()))
      .join(" ");
    const reviewObservation = reviewObservations()[item.id];
    const reviewReason = reviewObservation
      ? `${reviewObservation.summary ?? "A published couple review is available"} (${new Date(reviewObservation.observedAt).toLocaleDateString()}). ${reviewObservation.caveat}`
      : null;
    return {
      ...researchCard,
      recommendation: { summary: `${lead}${rationale ? ` ${rationale}` : ""}`, reasons: [recommended.situationFit || recommended.preferenceMatch, reviewReason].filter((reason): reason is string => Boolean(reason)) },
      evidence: reviewObservation ? [...researchCard.evidence, {
        label: "Dated couple review observation",
        ref: reviewObservation.publicationId,
        sourceKind: "published_wedding_review",
        freshness: "aging",
      }] : researchCard.evidence,
      actions: [
        { id: "select_recommended", label: "Select recommended vendor", role: "primary", effect: `Saves ${recommended.title} for follow-up`, intent: "select" },
        { id: "follow_up", label: "Follow-Up", role: "secondary", effect: `Creates an editable draft for ${recommended.title}`, intent: "draft" },
        { id: "assign", label: "Assign", role: "secondary", effect: "Opens assignment controls for this decision", intent: "assign" },
        { id: "later", label: "Decide later", role: "dismiss", effect: "Moves this decision out of the current focus", intent: "defer" },
      ],
    };
  }
  async function approveFinalGuestCount(itemId: string): Promise<void> {
    const task = taskFor(itemId);
    const choice = weddingGuestFinalCountChoices(task).find((candidate) => candidate.id === finalCountSelections()[itemId]);
    if (!task || !choice || !props.saveProjection || finalCountApprovalBusyId()) {
      if (!props.saveProjection) setVendorSelectionNotice((current) => ({ ...current, [itemId]: "Guest-count saving is not connected in this view." }));
      return;
    }
    const weddingPlanId = props.state.workspace.metadata.weddingPlanId;
    const responseWorkspaceId = props.state.workspace.metadata.responseWorkspaceId;
    setFinalCountApprovalBusyId(itemId);
    setVendorSelectionNotice((current) => ({ ...current, [itemId]: `Saving ${choice.headcount} as the final guest count…` }));
    try {
      await props.saveProjection(weddingGuestFinalCountApprovalToAfpSendInput({ task, choice, weddingPlanId, responseWorkspaceId }));
      const completion = saveWeddingTaskCompletion({ taskId: task.id, weddingPlanId, responseWorkspaceId, completed: true });
      const completionInput = weddingTaskCompletionToAfpSendInput({ record: completion, title: task.title });
      if (completionInput) await props.saveProjection(completionInput);
      setVendorSelectionNotice((current) => ({ ...current, [itemId]: `Final guest count approved as ${choice.headcount}. Guest planning and the task list now use the same recorded decision.` }));
      props.onRefreshWorkspace?.();
    } catch {
      setVendorSelectionNotice((current) => ({ ...current, [itemId]: "The final guest count was not saved. Nothing was changed; please try again." }));
    } finally {
      setFinalCountApprovalBusyId(null);
    }
  }
  function toggleResearch(itemId: string) {
    if (!researchFor(itemId)) return;
    setExpandedResearchItemId((current) => current === itemId ? null : itemId);
  }
  function hasChosenCelebrant() {
    return props.state.contextCards.some((card) => {
      const path = String(card.planningContext?.celebrantPath ?? "").trim().toLowerCase();
      return path === "own_celebrant" || (path.length > 0 && !["need_options", "public_or_registry_celebrant"].includes(path));
    }) || props.state.vendorContactCards.some((card) => /celebrant|officiant/i.test(card.categoryLabel));
  }
  function launchCelebrantSearch() {
    const context = props.state.contextCards.map((card) => card.planningContext).find((item) => item && (item.location || item.topPriorities?.length || item.atmosphereDescription)) ?? null;
    const query = weddingVendorSearchQueryFromIntake({
      vendorLabels: ["authorised wedding celebrant"],
      location: context?.location,
      priorities: (context?.topPriorities ?? []).join(", ") || context?.vendorPreferences,
      atmosphere: context?.atmosphereDescription,
    });
    const launch = saveWeddingVendorSearchLaunch(query, { source: "wedding_home" });
    if (launch) dispatchWeddingVendorSearchLaunch(launch);
  }
  function launchVendorResearch(item: (typeof props.state.personalOsProjection.decisionLoadRelief.focusItems)[number]) {
    const query = weddingVendorResearchQueryForDecision(item);
    if (!query) return false;
    const launch = saveWeddingVendorSearchLaunch(query, { source: "wedding_home" });
    if (launch) dispatchWeddingVendorSearchLaunch(launch);
    props.onSidebarAction({
      kind: "open_workspace_menu",
      label: `Research ${query}`,
      enabled: true,
      reason: null,
      metadata: {
        wedding_workspace_menu: "response_queue",
        vendor_search_scope: "decision_vendor_research",
        vendor_search_query: query,
        source_decision_id: item.id,
      },
      contextLabels: [item.title, query],
    });
    return true;
  }
  function openNewContactForm(taskId: string) {
    setNewContactTaskId(taskId);
    setAssigneePickerTaskId(null);
    setNewContactName("");
    setNewContactRole(WEDDING_ASSIGNMENT_ROLE_OPTIONS[0]);
    setNewContactEmail("");
    setNewContactError(null);
  }
  function addContactForAssignment(taskId: string) {
    const name = newContactName().trim();
    if (!name) return;
    const role = newContactRole().trim() || WEDDING_ASSIGNMENT_ROLE_OPTIONS[0];
    const email = newContactEmail().trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNewContactError("Enter a valid email so this person can receive the task brief.");
      return;
    }
    const userId = readSession()?.user?.id ?? null;
    const contactKey = weddingAssignmentContactKey(email, role);
    const existing = contacts().find((candidate) => (candidate.roles ?? []).some(
      (candidateRole) => weddingAssignmentContactKey(candidate.email ?? "", candidateRole) === contactKey,
    ));
    const contact = existing ?? {
      id: `contact-${Date.now()}`,
      name,
      email,
      relationshipKind: "other" as const,
      roles: [role],
    };
    if (!existing) {
      const next = [...contacts(), contact];
      saveContacts(next, userId);
      setContacts(next);
      void postAgentMessage({
        to: ["agent://master"],
        content: { kind: "contact_add", name: contact.name, email: contact.email, roles: contact.roles ?? [] },
      }).catch(() => undefined);
    }
    setAssignmentDrafts((current) => ({ ...current, [taskId]: contact.name }));
    setAssignmentContacts((current) => ({ ...current, [taskId]: contact }));
    setNewContactTaskId(null);
  }
  return (
    <Show when={props.state.personalOsProjection.hasWeddingPersonalOsSignal}>
      <div class="min-w-0 rounded-[24px] border border-pink-100/80 bg-pink-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-base font-semibold text-pink-950">Your next wedding decision</p>
          </div>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-pink-900">
            {display().remainingCount > 0 ? `${display().remainingCount} next` : "Last one"}
          </span>
        </div>
        <Show when={display().savedForLaterLabel}>
          {(label) => (
          <p class="mt-3 rounded-2xl border border-pink-100 bg-white/75 px-3 py-2 text-sm leading-6 text-pink-950/75">
            {label()}
          </p>
          )}
        </Show>
        <Show when={decisionPreparation().ready} fallback={(
          <section class="mt-3 rounded-2xl border border-pink-100 bg-white/80 p-4" role="status" aria-live="polite">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-pink-900">Preparing your decisions</p>
            <p class="mt-1 text-sm leading-6 text-pink-950/75">Checking the current step and the two after it before showing a recommendation.</p>
            <ul class="mt-3 grid gap-2">
              <For each={decisionPreparation().steps}>{(step) => (
                <li class="flex items-start justify-between gap-3 rounded-xl border border-pink-100 bg-white px-3 py-2">
                  <div><p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-pink-900/70">{step.label}</p><p class="mt-1 text-sm font-semibold text-pink-950">{step.title}</p></div>
                  <span class="shrink-0 text-xs font-semibold text-pink-900">{step.state === "ready" ? "Ready" : step.state === "failed" ? "Needs retry" : "Researching…"}</span>
                </li>
              )}</For>
            </ul>
            <Show when={decisionPreparation().steps.some((step) => step.state === "failed")}>
              <button type="button" class="mt-3 min-h-11 rounded-full border border-pink-300 bg-white px-4 text-sm font-semibold text-pink-950" onClick={retryDecisionPreparation}>Retry research</button>
            </Show>
          </section>
        )}>
        <Show when={display().visibleFocusItems.length > 0} fallback={<p class="mt-3 rounded-2xl border border-pink-100 bg-white/70 px-3 py-2 text-sm leading-6 text-pink-950/75">Nothing needs a yes/no right now.</p>}>
          <div class="mt-3 space-y-2">
            <For each={display().itemCards}>
              {(card) => {
                const item = card.item;
                const expandedTask = () => expandedTaskId() === item.id ? taskFor(item.id) : null;
                const comparison = () => comparisonFor(item);
                const recommendedVendor = () => comparison()?.vendorComparisonCards.slice().sort((left, right) => left.rank - right.rank)[0] ?? null;
                const activeOutreach = () => {
                  const vendors = comparison()?.vendorComparisonCards ?? [];
                  for (const vendor of vendors) {
                    const flow = props.vendorOutreach?.flows()[vendor.choiceId] ?? null;
                    if (flow) return { vendor, flow };
                  }
                  return null;
                };
                const finalCountChoices = () => weddingGuestFinalCountChoices(taskFor(item.id));
                return (
                <div class="space-y-2">
                  <DecisionCard
                    card={decisionModel(decisionCardFromWeddingFocus(card))}
                    mode="standard"
                    showWhyItMatters={false}
                    hero={finalCountChoices().length > 0 ? (
                      <fieldset class="grid gap-2" aria-label="Choose the final guest count">
                        <legend class="mb-1 text-xs font-semibold text-wedding-ink/70">Select the number to approve</legend>
                        <For each={finalCountChoices()}>{(choice) => (
                          <label class={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${finalCountSelections()[item.id] === choice.id ? "border-wedding-primary bg-wedding-slate" : "border-wedding-border bg-white"}`}>
                            <input
                              type="radio"
                              name={`wedding-final-count-${item.id}`}
                              value={choice.id}
                              checked={finalCountSelections()[item.id] === choice.id}
                              onChange={() => setFinalCountSelections((current) => ({ ...current, [item.id]: choice.id }))}
                              class="mt-1 h-4 w-4 shrink-0 accent-wedding-primary"
                            />
                            <span class="min-w-0">
                              <span class="block break-words text-sm font-semibold text-wedding-ink">{choice.label}</span>
                              <span class="mt-1 block break-words text-xs leading-5 text-wedding-ink/70">{choice.riskLabel}</span>
                            </span>
                          </label>
                        )}</For>
                      </fieldset>
                    ) : undefined}
                    onRecommendationSelect={researchFor(item.id) ? () => toggleResearch(item.id) : undefined}
                    onAction={(action) => {
                      if (action.id === "later") {
                        openReminderPicker(item);
                      } else if (action.id === "approve_guest_count") {
                        void approveFinalGuestCount(item.id);
                      } else if (action.id === "select_recommended" && comparison() && recommendedVendor()) {
                        setVendorSelectionNotice((current) => ({
                          ...current,
                          [item.id]: `Saving ${recommendedVendor()!.title} for follow-up...`,
                        }));
                        props.onVendorChoiceSelected?.({
                          artifact: comparison()!,
                          optionId: recommendedVendor()!.choiceId,
                          optionLabel: recommendedVendor()!.title,
                          contact: recommendedVendor(),
                          selected: true,
                        });
                        window.setTimeout(() => setVendorSelectionNotice((current) => ({
                          ...current,
                          [item.id]: `${recommendedVendor()!.title} was selected for follow-up.`,
                        })), 350);
                      } else if (action.id === "follow_up") {
                        const artifact = comparison();
                        const vendor = recommendedVendor();
                        if (artifact && vendor && props.vendorOutreach) {
                          // The composer mounts from this flow, so provide an
                          // immediate visible receipt instead of leaving a
                          // Follow-Up tap apparently inert while drafting.
                          setVendorSelectionNotice((current) => ({
                            ...current,
                            [item.id]: `Preparing an editable follow-up for ${vendor.title}...`,
                          }));
                          void props.vendorOutreach.onContactVendor(
                            vendor,
                            artifact.artifactId,
                            "CHECK_AVAILABILITY_AND_REQUEST_QUOTE",
                          );
                        } else {
                          // Older decision records can outlive their comparison
                          // artifact. Keep the action useful by opening the
                          // existing vendor-search path rather than silently
                          // forwarding an unrendered sidebar action.
                          const launch = saveWeddingVendorSearchLaunch(item.title, { source: "wedding_home" });
                          if (launch) dispatchWeddingVendorSearchLaunch(launch);
                          setVendorSelectionNotice((current) => ({
                            ...current,
                            [item.id]: "This decision needs a vendor choice first. Vendor search is ready to review.",
                          }));
                        }
                      } else if (action.id === "assign") {
                        const task = taskFor(item.id);
                        if (task) {
                          setExpandedTaskId(item.id);
                          setAssigneePickerTaskId(task.id);
                        } else {
                          props.onSidebarAction(buildWeddingDecisionFocusSidebarAction(
                            { ...props.state.personalOsProjection.decisionLoadRelief, focusItems: [item], backlogCount: 0 },
                            "open_item",
                          ));
                        }
                      } else if (action.id === "why") {
                        setExpandedWhyItemId((current) => current === item.id ? null : item.id);
                      } else if (action.id === "open" && /assign\s+\d+\s+attending guest|assign.*guest.*table|seating assignment/i.test(item.title)) {
                        setExpandedTaskId(item.id);
                        setExpandedSeatingItemId((current) => current === item.id ? null : item.id);
                      } else if (action.id === "open" && item.actionMetadata?.wedding_setup_decision === "budget") {
                        setExpandedSetupItemId((current) => current === item.id ? null : item.id);
                      } else if (action.id === "open" && isPendingRsvpFollowUp(item.id)) {
                        setRsvpFollowUpOpenId((current) => current === item.id ? null : item.id);
                      } else if (action.id === "open" && researchFor(item.id)) {
                        toggleResearch(item.id);
                      } else if (action.id === "open" && launchVendorResearch(item)) {
                        setVendorSelectionNotice((current) => ({
                          ...current,
                          [item.id]: `Vendor research is open for ${weddingVendorResearchQueryForDecision(item)}. Compare options before choosing or ordering.`,
                        }));
                      } else if (action.id === "open" && item.sourceSurface === "tasks") {
                        setExpandedTaskId((current) => current === item.id ? null : item.id);
                      } else {
                        props.onSidebarAction(buildWeddingDecisionFocusSidebarAction(
                          { ...props.state.personalOsProjection.decisionLoadRelief, focusItems: [item], backlogCount: 0 },
                          action.id === "why" ? "explain_item" : "open_item",
                        ));
                      }
                    }}
                  />
                  <Show when={vendorSelectionNotice()[item.id]}>
                    {(notice) => <p role="status" class="rounded-xl border border-pink-200 bg-white px-3 py-2 text-xs font-semibold text-pink-950">{notice()}</p>}
                  </Show>
                  <Show when={rsvpFollowUpOpenId() === item.id && rsvpSetup()}>
                    {(setup) => <WeddingDecisionRsvpFollowUp
                      setup={setup()}
                      guestTracking={props.state.guestTracking}
                      afpMessages={props.state.afpMessages}
                      metadata={props.state.workspace.metadata}
                      saveProjection={props.saveProjection}
                      onRefreshWorkspace={props.onRefreshWorkspace}
                    />}
                  </Show>
                  <Show when={rsvpFollowUpOpenId() === item.id && !rsvpSetup()}>
                    <p class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">Set the RSVP event and response deadline in Guests before sending a reminder.</p>
                  </Show>
                  <Show when={expandedResearchItemId() === item.id && researchFor(item.id)}>
                    {(research) => <WeddingDecisionResearchDetail
                      research={research()}
                      saveProjection={props.saveProjection}
                      onRefreshWorkspace={props.onRefreshWorkspace}
                      vendors={comparison()?.vendorComparisonCards}
                      onEmailVendor={(vendor) => {
                        const artifact = comparison();
                        if (!artifact || !props.vendorOutreach) return;
                        void props.vendorOutreach.onContactVendor(vendor, artifact.artifactId, "CHECK_AVAILABILITY_AND_REQUEST_QUOTE");
                      }}
                      onClose={() => setExpandedResearchItemId(null)}
                      onOpenDocuments={(artifactId) => props.onSidebarAction({
                          kind: "open_workspace_menu",
                          label: "Open research in Documents",
                          enabled: true,
                          reason: null,
                          metadata: { wedding_workspace_menu: "documents", linked_artifact_id: artifactId },
                          contextLabels: [item.title, "Research brief"],
                        })}
                    />}
                  </Show>
                  <Show when={weddingVendorResearchQueryForDecision(item)}>
                    {(query) => (
                      <section class="rounded-xl border border-pink-200 bg-white/85 px-3 py-3 text-pink-950" aria-label={`Vendor research for ${query()}`}>
                        <p class="text-xs font-semibold uppercase tracking-wide text-pink-900/70">Start with vendor research</p>
                        <p class="mt-1 text-sm leading-5">Compare a few {query()} before you settle the size, order timing, or insurance details.</p>
                        <button type="button" class="mt-3 min-h-10 rounded-full bg-pink-700 px-3 text-xs font-semibold text-white transition hover:bg-pink-800" onClick={() => launchVendorResearch(item)}>
                          Research {query()}
                        </button>
                      </section>
                    )}
                  </Show>
                  <Show when={activeOutreach()}>
                    {(active) => {
                      const choice = active().vendor;
                      const visibleFlow = active().flow;
                      return <div class="rounded-xl border border-pink-100 bg-white/85 p-3"><WeddingVendorOutreachComposer flow={visibleFlow} busy={visibleFlow.stage === "drafting" || visibleFlow.stage === "sending"} gmailConnected={Boolean(props.gmailConnected)} onBodyChange={(body) => props.vendorOutreach!.onOutreachBodyChange(choice.choiceId, body)} onRecipientChange={(email) => props.vendorOutreach!.onOutreachRecipientChange(choice.choiceId, email)} onAttachmentsChange={(attachments) => props.vendorOutreach!.onOutreachAttachmentsChange(choice.choiceId, attachments)} onPermissionsChange={(permissions) => props.vendorOutreach!.onOutreachPermissionsChange(choice.choiceId, permissions)} onRegenerateDraft={() => props.vendorOutreach!.onRetryOutreach(choice.choiceId)} onSend={() => void props.vendorOutreach!.onSendOutreach(choice.choiceId)} onCancel={() => props.vendorOutreach!.onCancelOutreach(choice.choiceId)} onRetryDraft={() => props.vendorOutreach!.onRetryOutreach(choice.choiceId)} onConnectGmail={() => props.vendorOutreach!.onConnectGmailForOutreach()} /></div>;
                    }}
                  </Show>
                  <Show when={expandedWhyItemId() === item.id}>
                    <p class="rounded-xl border border-pink-100 bg-white/75 px-3 py-2 text-xs leading-5 text-pink-950/80">
                      {card.whyNowLabel}
                    </p>
                  </Show>
                  <Show when={expandedTask()} fallback={expandedTaskId() === item.id ? <p class="rounded-xl border border-pink-100 bg-white/75 px-3 py-2 text-xs leading-5 text-pink-950/75">This task is no longer active.</p> : undefined}>
                    {(task) => (
                      <section class="rounded-xl border border-pink-200 bg-white px-3 py-3 text-pink-950" aria-label={`Task: ${task().title}`}>
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <p class="text-xs font-semibold uppercase tracking-wide text-pink-900/70">Active to-do</p>
                            <h4 class="mt-1 break-words text-sm font-semibold">{task().title}</h4>
                          </div>
                          <button type="button" class="min-h-9 rounded-full border border-pink-200 bg-pink-50 px-3 text-xs font-semibold text-pink-950" onClick={() => setExpandedTaskId(null)}>Close</button>
                        </div>
                        <Show when={task().notes}><p class="mt-2 break-words text-xs leading-5 text-pink-950/75">{task().notes}</p></Show>
                        <div class="relative mt-3 flex flex-wrap items-center gap-2">
                          <input
                            aria-label={`Assign ${task().title}`}
                            class="min-h-9 min-w-0 flex-1 rounded-lg border border-pink-200 bg-white px-2 text-xs text-pink-950 placeholder:text-pink-950/45"
                            placeholder="Assign to someone"
                            value={assignmentDrafts()[task().id] ?? task().assignee ?? ""}
                            onInput={(event) => {
                              setAssignmentDrafts((current) => ({ ...current, [task().id]: event.currentTarget.value }));
                              setAssignmentContacts((current) => {
                                const next = { ...current };
                                delete next[task().id];
                                return next;
                              });
                            }}
                          />
                          <button type="button" class="min-h-9 rounded-full bg-pink-700 px-3 text-xs font-semibold text-white transition hover:bg-pink-800" onClick={() => {
                            const assignee = (assignmentDrafts()[task().id] ?? task().assignee ?? "").trim();
                            if (!assignee) return;
                            const contact = assignmentContacts()[task().id];
                            props.onSidebarAction({ kind: "assign_task", label: "Assign task", enabled: true, reason: null, metadata: { task_id: task().id, task_title: task().title, task_priority: task().priority ?? "normal", assignee, assignee_email: contact?.email ?? null, assignee_role: contact?.roles?.[0] ?? null } });
                          }}>Assign</button>
                          <button type="button" class="min-h-9 rounded-full border border-pink-300 bg-pink-50 px-3 text-xs font-semibold text-pink-950" aria-expanded={assigneePickerTaskId() === task().id} onClick={() => setAssigneePickerTaskId((current) => current === task().id ? null : task().id)}>People</button>
                          <Show when={assigneePickerTaskId() === task().id}>
                            <div class="absolute left-0 top-full z-30 mt-1 max-h-44 w-full overflow-auto rounded-xl border border-pink-200 bg-white p-1 shadow-card">
                              <Show when={contactOptions().length > 0} fallback={<p class="px-2 py-2 text-xs text-pink-950/70">No saved contacts yet. You can still type a name.</p>}>
                                <For each={contactOptions()}>{(option) => <button type="button" class="block w-full rounded-lg px-2 py-2 text-left hover:bg-pink-50" onClick={() => { setAssignmentDrafts((current) => ({ ...current, [task().id]: option.name })); setAssignmentContacts((current) => ({ ...current, [task().id]: option.contact })); setAssigneePickerTaskId(null); }}><span class="block text-xs font-semibold text-pink-950">{option.name}</span><Show when={option.detail}><span class="block text-[11px] text-pink-950/65">{option.detail}</span></Show></button>}</For>
                              </Show>
                              <button type="button" class="mt-1 block w-full rounded-lg border border-dashed border-pink-300 px-2 py-2 text-left text-xs font-semibold text-pink-800 hover:bg-pink-50" onClick={() => openNewContactForm(task().id)}>+ Add a new contact</button>
                            </div>
                          </Show>
                        </div>
                        <Show when={newContactTaskId() === task().id}>
                          <div class="mt-2 grid gap-2 rounded-xl border border-pink-200 bg-pink-50/70 p-2 sm:grid-cols-2">
                            <input aria-label="New contact name" class="min-h-9 rounded-lg border border-pink-200 bg-white px-2 text-xs text-pink-950 placeholder:text-pink-950/45" placeholder="Name" value={newContactName()} onInput={(event) => setNewContactName(event.currentTarget.value)} />
                            <input aria-label="New contact email" type="email" inputMode="email" autocomplete="email" class="min-h-9 rounded-lg border border-pink-200 bg-white px-2 text-xs text-pink-950 placeholder:text-pink-950/45" placeholder="Email" value={newContactEmail()} onInput={(event) => { setNewContactEmail(event.currentTarget.value); setNewContactError(null); }} />
                            <label class="text-[11px] font-semibold text-pink-950/75">Role
                              <select aria-label="New contact role" class="mt-1 min-h-9 w-full rounded-lg border border-pink-200 bg-white px-2 text-xs text-pink-950" value={newContactRole()} onChange={(event) => setNewContactRole(event.currentTarget.value)}>
                                <For each={WEDDING_ASSIGNMENT_ROLE_OPTIONS}>{(role) => <option value={role}>{role}</option>}</For>
                              </select>
                            </label>
                            <div class="flex items-end gap-2">
                              <button type="button" disabled={!newContactName().trim() || !newContactEmail().trim()} class="min-h-9 rounded-full bg-pink-700 px-3 text-xs font-semibold text-white disabled:opacity-45" onClick={() => addContactForAssignment(task().id)}>Add</button>
                              <button type="button" class="min-h-9 rounded-full border border-pink-200 bg-white px-3 text-xs font-semibold text-pink-950" onClick={() => setNewContactTaskId(null)}>Cancel</button>
                            </div>
                            <Show when={newContactError()}>{(message) => <p role="alert" class="text-xs text-red-700 sm:col-span-2">{message()}</p>}</Show>
                          </div>
                        </Show>
                        <Show when={/celebrant/i.test(`${task().title} ${task().notes ?? ""}`) && !hasChosenCelebrant()}>
                          <div class="mt-3 flex flex-wrap gap-2">
                            <button type="button" class="min-h-9 rounded-full border border-pink-300 bg-pink-100 px-3 text-xs font-semibold text-pink-950 transition hover:bg-pink-200" onClick={launchCelebrantSearch}>
                              Find an authorised celebrant
                            </button>
                            <a class="inline-flex min-h-9 items-center rounded-full border border-pink-300 bg-white px-3 text-xs font-semibold text-pink-950 transition hover:bg-pink-50" href="/wedding/talk-to-a-celebrant.html">
                              ☎ Talk to a celebrant
                            </a>
                          </div>
                        </Show>
                      </section>
                    )}
                  </Show>
                  <Show when={expandedSetupItemId() === item.id && item.actionMetadata?.wedding_setup_decision === "budget"}>
                    <section class="rounded-xl border border-pink-200 bg-white p-3 text-pink-950" aria-label="Set your wedding budget">
                      <p class="text-sm font-semibold">Not sure where to start?</p>
                      <p class="mt-1 text-sm leading-6 text-pink-950/75">
                        Don't know where to start? Try the <a class="font-semibold text-pink-800 underline underline-offset-4" href="/wedding/animal-quiz.html">wedding animal quiz</a> to gather your style, then adjust the starting allocation below.
                      </p>
                      <div class="mt-3">
                        <WeddingBudgetTrackerCard
                          state={props.state.budgetTracking}
                          weddingPlanId={props.state.workspace.metadata.weddingPlanId}
                          metadata={props.state.workspace.metadata}
                          contributorPeople={props.state.helperContactNames}
                          onSaveAllocation={props.saveProjection ?? undefined}
                          onSaveContribution={props.saveProjection ?? undefined}
                        />
                      </div>
                    </section>
                  </Show>
                  <Show when={expandedSeatingItemId() === item.id}>
                    <section class="overflow-hidden rounded-xl border border-pink-200 bg-white p-2 sm:p-3" aria-label="Seating assignment canvas">
                      <div class="mb-2 flex items-center justify-between gap-2">
                        <div><p class="text-xs font-semibold uppercase tracking-wide text-pink-900/70">Assign guests in place</p><p class="mt-1 text-xs text-pink-950/70">The task assignment controls stay open above while you place attending guests.</p></div>
                        <button type="button" class="min-h-9 rounded-full border border-pink-200 px-3 text-xs font-semibold text-pink-950" onClick={() => setExpandedSeatingItemId(null)}>Close canvas</button>
                      </div>
                      <WeddingSeatingPanel state={props.state} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace ?? undefined} onSidebarAction={props.onSidebarAction} />
                    </section>
                  </Show>
                </div>
              );}}
            </For>
          </div>
        </Show>
        <Show when={props.state.personalOsProjection.decisionLoadRelief.reliefLabels.length > 0}>
          <ul class="mt-3 space-y-1">
            <For each={props.state.personalOsProjection.decisionLoadRelief.reliefLabels.slice(0, 3)}>
              {(label) => <li class="text-xs leading-5 text-pink-950/70">{label}</li>}
            </For>
          </ul>
        </Show>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={display().reviewDisabled} aria-disabled={display().reviewDisabled} title={display().reviewDisabled ? "There are no decisions ready to review." : "Review the current decision focus."} class="w-full rounded-full border border-pink-200 bg-white/75 px-3 py-2 text-xs font-semibold text-pink-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:py-1.5" onClick={() => props.onSidebarAction(decisionFocusAction())}>
            Review this decision
          </button>
          <Show when={props.state.decisionRecordCards.length > 0}>
            <button type="button" class="w-full rounded-full border border-pink-200 bg-white/75 px-3 py-2 text-xs font-semibold text-pink-950 transition hover:bg-white sm:w-auto sm:py-1.5" onClick={() => setShowDecisionHistory((current) => !current)} aria-expanded={showDecisionHistory()}>
              {showDecisionHistory() ? "Hide past decisions" : `Past decisions (${props.state.decisionRecordCards.length})`}
            </button>
          </Show>
        </div>
        <Show when={showDecisionHistory() && props.state.decisionRecordCards.length > 0}>
          <section class="mt-3 space-y-2 rounded-2xl border border-pink-100 bg-white/75 p-3" aria-label="Past decisions and agent records">
            <p class="text-xs font-semibold text-pink-950">Past decisions and agent records</p>
            <p class="text-xs leading-5 text-pink-950/75">These saved choices are the context OmnyID uses when preparing later plans and follow-ups.</p>
            <For each={props.state.decisionRecordCards}>
              {(record) => <div class="rounded-xl border border-pink-100 bg-white px-3 py-2"><p class="text-xs font-semibold text-pink-950">{record.title}</p><p class="mt-1 text-xs leading-5 text-pink-950/75">{record.detailLabel}</p></div>}
            </For>
          </section>
        </Show>
        </Show>
        <Show when={reminderItem()}>
          {(item) => (
            <div class="fixed inset-0 z-[80] flex items-end bg-black/35 p-3" role="presentation" onClick={() => setReminderItem(null)}>
              <section class="w-full rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="decision-focus-reminder-title" onClick={(event) => event.stopPropagation()}>
                <h3 id="decision-focus-reminder-title" class="text-base font-semibold text-wedding-ink">When should this decision return?</h3>
                <p class="mt-1 text-sm leading-5 text-wedding-ink/70">Suggested: {formatWeddingDecisionDate(defaultWeddingDecisionReminderAt(item()))}. Choose another date if that works better.</p>
                <label for="decision-focus-reminder-date" class="mt-3 block text-xs font-semibold text-wedding-ink">Reminder date</label>
                <input id="decision-focus-reminder-date" type="date" min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} value={reminderDate()} onInput={(event) => setReminderDate(event.currentTarget.value)} class="mt-1 min-h-12 w-full rounded-lg border border-wedding-border px-3 text-base text-wedding-ink" />
                <div class="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" class="min-h-12 rounded-lg border border-wedding-border text-sm font-semibold text-wedding-ink" onClick={() => setReminderItem(null)}>Keep it here</button>
                  <button type="button" class="min-h-12 rounded-lg bg-wedding-primary text-sm font-bold text-wedding-page" onClick={saveReminder}>Set reminder</button>
                </div>
              </section>
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}
