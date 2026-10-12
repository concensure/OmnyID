// @locs-version: 1.0
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { DecisionCard } from "@/components/DecisionCard";
import { WeddingVendorOutreachComposer } from "@/components/WeddingVendorOutreachComposer";
import type { WeddingVendorChoiceSelectionSaveInput } from "@/components/WeddingArtifactDetailPanel";
import { loadContacts, saveContacts, subscribeContactsChangedEvent, type Contact } from "@/lib/contactsLocalState";
import { postAgentMessage, readSession } from "@/lib/api";
import {
  WEDDING_ASSIGNMENT_ROLE_OPTIONS,
  weddingAssignmentContactKey,
} from "@/lib/weddingTaskAssignmentEmailState";

import {
  buildWeddingDecisionDeferSidebarAction,
  buildWeddingDecisionFocusSidebarAction,
} from "@/lib/weddingDecisionFocusActionState";
import { buildWeddingDecisionFocusDisplayState } from "@/lib/weddingDecisionFocusDisplayState";
import { decisionCardFromWeddingFocus, type DecisionCardModel } from "@/lib/decisionCardState";
import type { useWeddingVendorOutreachOwner } from "@/lib/useWeddingVendorOutreachOwner";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import {
  dispatchWeddingVendorSearchLaunch,
  saveWeddingVendorSearchLaunch,
  weddingVendorSearchQueryFromIntake,
} from "@/lib/weddingVendorSearchLaunchState";

export function WeddingDecisionFocusCard(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
  vendorOutreach?: ReturnType<typeof useWeddingVendorOutreachOwner>;
  onVendorChoiceSelected?: (input: WeddingVendorChoiceSelectionSaveInput) => void;
  gmailConnected?: boolean;
}) {
  const LOCAL_DEFER_TTL_MS = 10 * 60 * 1000;
  const deferredStorageKey = () => {
    const workspaceId = props.state.workspace.metadata.responseWorkspaceId?.trim() || "default";
    return `omnyid.wedding.deferred-focus.${workspaceId}`;
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
  const [expandedTaskId, setExpandedTaskId] = createSignal<string | null>(null);
  const [expandedWhyItemId, setExpandedWhyItemId] = createSignal<string | null>(null);
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
    onCleanup(unsubscribe);
  });
  const display = createMemo(() => buildWeddingDecisionFocusDisplayState({
    relief: props.state.personalOsProjection.decisionLoadRelief,
    locallyDeferredIds: locallyDeferredIds(),
  }));
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
  function deferItem(item: (typeof props.state.personalOsProjection.decisionLoadRelief.focusItems)[number]) {
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
    queueMicrotask(() => props.onSidebarAction(buildWeddingDecisionDeferSidebarAction(item)));
  }
  function taskFor(itemId: string) {
    const taskId = itemId.replace(/^task:/, "");
    return props.state.planningTaskItems.find((task) => task.id === taskId) ?? null;
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
  function priorityFor(item: (typeof props.state.personalOsProjection.decisionLoadRelief.focusItems)[number]): string {
    const taskPriority = taskFor(item.id)?.priority?.trim();
    const evidencePriority = item.evidenceLabels.find((label) => /^priority:/i.test(label))?.replace(/^priority:\s*/i, "").trim();
    const priority = taskPriority || evidencePriority || (item.pressureFamily === "obligation" ? "High" : item.pressureFamily === "attention" ? "Medium" : "Low");
    return `${priority.charAt(0).toUpperCase()}${priority.slice(1)} priority`;
  }
  function decisionModel(card: ReturnType<typeof decisionCardFromWeddingFocus>): DecisionCardModel {
    const item = display().itemCards.find((candidate) => candidate.id === card.id)?.item;
    if (!item) return card;
    const artifact = comparisonFor(item);
    const recommended = artifact?.vendorComparisonCards.slice().sort((left, right) => left.rank - right.rank)[0];
    if (!artifact || !recommended) return card;
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
    return {
      ...card,
      recommendation: { summary: `${lead}${rationale ? ` ${rationale}` : ""}`, reasons: [recommended.situationFit || recommended.preferenceMatch] },
      actions: [
        { id: "select_recommended", label: "Select recommended vendor", role: "primary", effect: `Saves ${recommended.title} for follow-up`, intent: "select" },
        { id: "follow_up", label: "Follow-Up", role: "secondary", effect: `Creates an editable draft for ${recommended.title}`, intent: "draft" },
        { id: "assign", label: "Assign", role: "secondary", effect: "Opens assignment controls for this decision", intent: "assign" },
        { id: "later", label: "Decide later", role: "dismiss", effect: "Moves this decision out of the current focus", intent: "defer" },
      ],
    };
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
          <p class="text-base font-semibold text-pink-950">Three things worth your attention</p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-pink-900">
            {display().visibleCount} now
          </span>
        </div>
        <Show when={display().savedForLaterLabel}>
          {(label) => (
          <p class="mt-3 rounded-2xl border border-pink-100 bg-white/75 px-3 py-2 text-sm leading-6 text-pink-950/75">
            {label()}
          </p>
          )}
        </Show>
        <Show when={display().visibleFocusItems.length > 0} fallback={<p class="mt-3 rounded-2xl border border-pink-100 bg-white/70 px-3 py-2 text-sm leading-6 text-pink-950/75">Nothing needs a yes/no right now.</p>}>
          <div class="mt-3 space-y-2">
            <For each={display().itemCards}>
              {(card) => {
                const item = card.item;
                const expandedTask = () => expandedTaskId() === item.id ? taskFor(item.id) : null;
                const comparison = () => comparisonFor(item);
                const recommendedVendor = () => comparison()?.vendorComparisonCards.slice().sort((left, right) => left.rank - right.rank)[0] ?? null;
                const recommendedFlow = () => {
                  const vendor = recommendedVendor();
                  return vendor ? props.vendorOutreach?.flows()[vendor.choiceId] ?? null : null;
                };
                return (
                <div class="space-y-2">
                  <DecisionCard
                    card={decisionModel(decisionCardFromWeddingFocus(card))}
                    mode="standard"
                    showWhyItMatters={false}
                    onAction={(action) => {
                      if (action.id === "later") {
                        deferItem(item);
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
                        });
                        window.setTimeout(() => setVendorSelectionNotice((current) => ({
                          ...current,
                          [item.id]: `${recommendedVendor()!.title} was selected for follow-up.`,
                        })), 350);
                      } else if (action.id === "follow_up" && comparison() && recommendedVendor()) {
                        void props.vendorOutreach?.onContactVendor(recommendedVendor()!, comparison()!.artifactId, "CHECK_AVAILABILITY_AND_REQUEST_QUOTE");
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
                  <Show when={recommendedFlow()}>
                    {(visibleFlow) => {
                      const choice = recommendedVendor()!;
                      return <div class="rounded-xl border border-pink-100 bg-white/85 p-3"><WeddingVendorOutreachComposer flow={visibleFlow()} busy={visibleFlow().stage === "drafting" || visibleFlow().stage === "sending"} gmailConnected={Boolean(props.gmailConnected)} onBodyChange={(body) => props.vendorOutreach!.onOutreachBodyChange(choice.choiceId, body)} onRecipientChange={(email) => props.vendorOutreach!.onOutreachRecipientChange(choice.choiceId, email)} onSend={() => void props.vendorOutreach!.onSendOutreach(choice.choiceId)} onCancel={() => props.vendorOutreach!.onCancelOutreach(choice.choiceId)} onRetryDraft={() => props.vendorOutreach!.onRetryOutreach(choice.choiceId)} onConnectGmail={() => props.vendorOutreach!.onConnectGmailForOutreach()} /></div>;
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
                          <button type="button" class="mt-3 min-h-9 rounded-full border border-pink-300 bg-pink-100 px-3 text-xs font-semibold text-pink-950 transition hover:bg-pink-200" onClick={launchCelebrantSearch}>
                            Find an authorised celebrant
                          </button>
                        </Show>
                      </section>
                    )}
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
        <button type="button" disabled={display().reviewDisabled} aria-disabled={display().reviewDisabled} title={display().reviewDisabled ? "There are no decisions ready to review." : "Review the current decision focus."} class="mt-3 w-full rounded-full border border-pink-200 bg-white/75 px-3 py-2 text-xs font-semibold text-pink-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:py-1.5" onClick={() => props.onSidebarAction(decisionFocusAction())}>
          Review top decisions
        </button>
      </div>
    </Show>
  );
}
