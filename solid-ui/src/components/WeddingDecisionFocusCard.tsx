// @locs-version: 1.0
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { DecisionCard } from "@/components/DecisionCard";
import { loadContacts, saveContacts, subscribeContactsChangedEvent, type Contact } from "@/lib/contactsLocalState";
import { postAgentMessage, readSession } from "@/lib/api";

import {
  buildWeddingDecisionDeferSidebarAction,
  buildWeddingDecisionFocusSidebarAction,
} from "@/lib/weddingDecisionFocusActionState";
import { buildWeddingDecisionFocusDisplayState } from "@/lib/weddingDecisionFocusDisplayState";
import { decisionCardFromWeddingFocus } from "@/lib/decisionCardState";
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
  const [contacts, setContacts] = createSignal<Contact[]>([]);
  const [assigneePickerTaskId, setAssigneePickerTaskId] = createSignal<string | null>(null);
  const [newContactTaskId, setNewContactTaskId] = createSignal<string | null>(null);
  const [newContactName, setNewContactName] = createSignal("");
  const [newContactRole, setNewContactRole] = createSignal("");
  const contactOptions = createMemo(() => {
    const seen = new Set<string>();
    const listed = contacts().map((contact) => ({
      name: contact.name,
      detail: [...(contact.roles ?? []), contact.relationshipKind].filter(Boolean).join(" · "),
    }));
    for (const name of props.state.helperContactNames) listed.push({ name, detail: "Wedding helper" });
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
    setNewContactRole("");
  }
  function addContactForAssignment(taskId: string) {
    const name = newContactName().trim();
    if (!name) return;
    const role = newContactRole().trim();
    const userId = readSession()?.user?.id ?? null;
    const existing = contacts().find((contact) => contact.name.trim().toLowerCase() === name.toLowerCase());
    const contact = existing ?? {
      id: `contact-${Date.now()}`,
      name,
      relationshipKind: "other" as const,
      ...(role ? { roles: [role] } : {}),
    };
    if (!existing) {
      const next = [...contacts(), contact];
      saveContacts(next, userId);
      setContacts(next);
      void postAgentMessage({
        to: ["agent://master"],
        content: { kind: "contact_add", name: contact.name, roles: contact.roles ?? [] },
      }).catch(() => undefined);
    }
    setAssignmentDrafts((current) => ({ ...current, [taskId]: contact.name }));
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
                return (
                <div class="space-y-2">
                  <DecisionCard
                    card={decisionCardFromWeddingFocus(card)}
                    mode="standard"
                    showWhyItMatters={false}
                    onAction={(action) => {
                      if (action.id === "later") {
                        deferItem(item);
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
                        <div class="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-pink-950/75">
                          <Show when={task().dueLabel}><span class="rounded-full bg-pink-50 px-2 py-1">{task().dueLabel}</span></Show>
                          <Show when={task().priority}><span class="rounded-full bg-pink-50 px-2 py-1">{task().priority} priority</span></Show>
                          <Show when={task().assignee}><span class="rounded-full bg-pink-50 px-2 py-1">{task().assignee}</span></Show>
                        </div>
                        <div class="relative mt-3 flex flex-wrap items-center gap-2">
                          <input
                            aria-label={`Assign ${task().title}`}
                            class="min-h-9 min-w-0 flex-1 rounded-lg border border-pink-200 bg-white px-2 text-xs text-pink-950 placeholder:text-pink-950/45"
                            placeholder="Assign to someone"
                            value={assignmentDrafts()[task().id] ?? task().assignee ?? ""}
                            onInput={(event) => setAssignmentDrafts((current) => ({ ...current, [task().id]: event.currentTarget.value }))}
                          />
                          <button type="button" class="min-h-9 rounded-full bg-pink-700 px-3 text-xs font-semibold text-white transition hover:bg-pink-800" onClick={() => {
                            const assignee = (assignmentDrafts()[task().id] ?? task().assignee ?? "").trim();
                            if (!assignee) return;
                            props.onSidebarAction({ kind: "assign_task", label: "Assign task", enabled: true, reason: null, metadata: { task_id: task().id, task_title: task().title, task_priority: task().priority ?? "normal", assignee } });
                          }}>Assign</button>
                          <button type="button" class="min-h-9 rounded-full border border-pink-300 bg-pink-50 px-3 text-xs font-semibold text-pink-950" aria-expanded={assigneePickerTaskId() === task().id} onClick={() => setAssigneePickerTaskId((current) => current === task().id ? null : task().id)}>People</button>
                          <Show when={assigneePickerTaskId() === task().id}>
                            <div class="absolute left-0 top-full z-30 mt-1 max-h-44 w-full overflow-auto rounded-xl border border-pink-200 bg-white p-1 shadow-card">
                              <Show when={contactOptions().length > 0} fallback={<p class="px-2 py-2 text-xs text-pink-950/70">No saved contacts yet. You can still type a name.</p>}>
                                <For each={contactOptions()}>{(contact) => <button type="button" class="block w-full rounded-lg px-2 py-2 text-left hover:bg-pink-50" onClick={() => { setAssignmentDrafts((current) => ({ ...current, [task().id]: contact.name })); setAssigneePickerTaskId(null); }}><span class="block text-xs font-semibold text-pink-950">{contact.name}</span><Show when={contact.detail}><span class="block text-[11px] text-pink-950/65">{contact.detail}</span></Show></button>}</For>
                              </Show>
                              <button type="button" class="mt-1 block w-full rounded-lg border border-dashed border-pink-300 px-2 py-2 text-left text-xs font-semibold text-pink-800 hover:bg-pink-50" onClick={() => openNewContactForm(task().id)}>+ Add a new contact</button>
                            </div>
                          </Show>
                        </div>
                        <Show when={newContactTaskId() === task().id}>
                          <div class="mt-2 grid gap-2 rounded-xl border border-pink-200 bg-pink-50/70 p-2 sm:grid-cols-[1fr_1fr_auto]">
                            <input aria-label="New contact name" class="min-h-9 rounded-lg border border-pink-200 bg-white px-2 text-xs text-pink-950 placeholder:text-pink-950/45" placeholder="Name" value={newContactName()} onInput={(event) => setNewContactName(event.currentTarget.value)} />
                            <input aria-label="New contact role" class="min-h-9 rounded-lg border border-pink-200 bg-white px-2 text-xs text-pink-950 placeholder:text-pink-950/45" placeholder="Role (optional)" value={newContactRole()} onInput={(event) => setNewContactRole(event.currentTarget.value)} />
                            <div class="flex gap-2">
                              <button type="button" disabled={!newContactName().trim()} class="min-h-9 rounded-full bg-pink-700 px-3 text-xs font-semibold text-white disabled:opacity-45" onClick={() => addContactForAssignment(task().id)}>Add</button>
                              <button type="button" class="min-h-9 rounded-full border border-pink-200 bg-white px-3 text-xs font-semibold text-pink-950" onClick={() => setNewContactTaskId(null)}>Cancel</button>
                            </div>
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
