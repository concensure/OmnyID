// @locs-version: 2.1
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import type { SendAfpMessageInput } from "@/lib/api";
import { loadContacts, saveContacts } from "@/lib/contactsLocalState";
import {
  buildWeddingHelperPeople,
  buildWeddingHelperWeeklyAgendaRows,
  buildWeddingHelperWorkloadRows,
  loadWeddingHelperLocalState,
  saveWeddingHelperLocalState,
  upsertWeddingHelperContact,
  weddingHelperContactToAfpSendInput,
  weddingHelperResponsibilityToAfpSendInput,
  weddingHelperTaskDueLabel,
  weddingHelperTaskIsDone,
  weddingHelperTaskPriorityLabel,
  weddingHelperWorkloadSuggestion,
  type WeddingHelperResponsibilityStatus,
} from "@/lib/weddingHelpersPanelState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { loadWeddingTaskCompletion, saveWeddingTaskCompletion, WEDDING_TASK_COMPLETION_EVENT, type WeddingTaskCompletionRecord } from "@/lib/weddingTaskCompletionLocalState";
import { weddingTaskCompletionToAfpSendInput } from "@/lib/weddingTaskCompletionProjectionState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import {
  weddingTaskSidebarAction,
  weddingTimelineSidebarAction,
} from "@/lib/weddingWorkspaceSidebarActionState";
import {
  WEDDING_HELPER_TASK_TAB_EVENT,
  weddingHelperTaskTabFromEvent,
  type WeddingHelperTaskTab,
} from "@/lib/weddingHelpersNavigationState";

type WeddingPlanningTask = WeddingResponseWorkspaceViewState["planningTaskItems"][number];

export function WeddingHelpersPanel(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
  metadata?: unknown;
  contactUserId?: string | null;
}) {
  const workspaceId = () => props.state.workspace.metadata.responseWorkspaceId;
  const initialState = loadWeddingHelperLocalState(workspaceId());
  const projectedDoneTaskIds = Object.fromEntries(
    props.state.planningTaskItems.filter((task) => loadWeddingTaskCompletion({ taskId: task.id, weddingPlanId: props.state.workspace.metadata.weddingPlanId, responseWorkspaceId: workspaceId() })?.completed ?? weddingHelperTaskIsDone(task)).map((task) => [task.id, true]),
  ) as Record<string, true>;
  const [doneTaskIds, setDoneTaskIds] = createSignal<Record<string, true>>({ ...initialState.doneTaskIds, ...projectedDoneTaskIds });
  const [confirmedTaskIds, setConfirmedTaskIds] = createSignal<Record<string, true>>(initialState.confirmedTaskIds);
  const [taskAssignees, setTaskAssignees] = createSignal<Record<string, string>>(initialState.taskAssignees);
  const [taskConsultedPeople, setTaskConsultedPeople] = createSignal<Record<string, string>>(initialState.taskConsultedPeople);
  const [taskLastContactDates, setTaskLastContactDates] = createSignal<Record<string, string>>(initialState.taskLastContactDates);
  const [taskDueDates, setTaskDueDates] = createSignal<Record<string, string>>(initialState.taskDueDates);
  const [taskTab, setTaskTab] = createSignal<WeddingHelperTaskTab>("open");
  const [customHelperName, setCustomHelperName] = createSignal("");
  const [customHelperEmail, setCustomHelperEmail] = createSignal("");
  const [customHelperPhone, setCustomHelperPhone] = createSignal("");
  const [customHelperRole, setCustomHelperRole] = createSignal("Helper");
  const [customHelpers, setCustomHelpers] = createSignal<string[]>(initialState.customHelpers);
  const [saveNotice, setSaveNotice] = createSignal<string | null>(null);
  const [agendaDueDateTaskId, setAgendaDueDateTaskId] = createSignal<string | null>(null);
  const [agendaDueDateDraft, setAgendaDueDateDraft] = createSignal("");
  const inferredPartnerNames = createMemo(() => inferWeddingPartnerNames(props.state));
  const helperPeople = createMemo(() => buildWeddingHelperPeople(props.state.helperContactNames, customHelpers(), inferredPartnerNames()));
  const helperTasks = createMemo(() => props.state.planningTaskItems.slice(0, 30).map((task) => {
    const localDueDate = taskDueDates()[task.id];
    return {
    ...task,
    dueAt: localDueDate ? `${localDueDate}T12:00:00.000Z` : task.dueAt,
    dueLabel: localDueDate || task.dueLabel,
    // An unassigned task belongs to the account owner first. It can then be
    // deliberately reassigned to a partner or helper instead of vanishing
    // from everyone's workload.
    assignee: task.assignee?.trim() || helperPeople()[0] || "You",
  };
  }));
  const taskAssignee = (task: WeddingPlanningTask) =>
    taskAssignees()[task.id] ?? task.assignee ?? helperPeople()[0] ?? "You";
  const taskAction = (task: WeddingPlanningTask) => weddingTaskSidebarAction(task, props.state);
  const openHelperTasks = createMemo(() => helperTasks().filter((task) => !weddingHelperTaskIsDone(task, doneTaskIds())));
  const doneHelperTasks = createMemo(() => helperTasks().filter((task) => weddingHelperTaskIsDone(task, doneTaskIds())));
  const workloadRows = createMemo(() => buildWeddingHelperWorkloadRows({
    people: helperPeople(),
    tasks: helperTasks(),
    doneTaskIds: doneTaskIds(),
    taskAssignees: taskAssignees(),
  }));
  const workloadSuggestion = createMemo(() => weddingHelperWorkloadSuggestion(workloadRows()));
  const weeklyAgendaRows = createMemo(() => buildWeddingHelperWeeklyAgendaRows({
    tasks: helperTasks(),
    doneTaskIds: doneTaskIds(),
    taskAssignees: taskAssignees(),
    taskConsultedPeople: taskConsultedPeople(),
  }));

  onMount(() => {
    const handler = (event: Event) => {
      const nextTab = weddingHelperTaskTabFromEvent(event);
      if (nextTab) setTaskTab(nextTab);
    };
    window.addEventListener(WEDDING_HELPER_TASK_TAB_EVENT, handler);
    const completionHandler = (event: Event) => {
      const detail = (event as CustomEvent<WeddingTaskCompletionRecord>).detail;
      if (!detail || typeof detail.taskId !== "string" || !detail.taskId || detail.responseWorkspaceId !== workspaceId()) return;
      const taskId = detail.taskId;
      setDoneTaskIds((current) => {
        const next = { ...current };
        if (detail.completed) next[taskId] = true; else delete next[taskId];
        return next;
      });
    };
    window.addEventListener(WEDDING_TASK_COMPLETION_EVENT, completionHandler);
    onCleanup(() => { window.removeEventListener(WEDDING_HELPER_TASK_TAB_EVENT, handler); window.removeEventListener(WEDDING_TASK_COMPLETION_EVENT, completionHandler); });
  });

  createEffect(() => {
    saveWeddingHelperLocalState(workspaceId(), {
      doneTaskIds: doneTaskIds(),
      confirmedTaskIds: confirmedTaskIds(),
      taskAssignees: taskAssignees(),
      taskConsultedPeople: taskConsultedPeople(),
      taskLastContactDates: taskLastContactDates(),
      taskDueDates: taskDueDates(),
      customHelpers: customHelpers(),
    });
  });

  function setTaskDone(taskId: string, done: boolean): void {
    setDoneTaskIds((current) => {
      const next = { ...current };
      if (done) next[taskId] = true;
      else delete next[taskId];
      return next;
    });
    const task = props.state.planningTaskItems.find((item) => item.id === taskId);
    const record = saveWeddingTaskCompletion({ taskId, completed: done, weddingPlanId: props.state.workspace.metadata.weddingPlanId, responseWorkspaceId: workspaceId() });
    const input = weddingTaskCompletionToAfpSendInput({ record, title: task?.title });
    if (input && props.saveProjection) void props.saveProjection(input).then(() => props.onRefreshWorkspace?.()).catch(() => setSaveNotice("Updated on this device. Wedding memory will sync when saving is available."));
  }

  async function saveTaskResponsibility(task: WeddingPlanningTask, overrides?: {
    ownerLabel?: string;
    consultedLabel?: string;
    lastContactDate?: string;
    status?: WeddingHelperResponsibilityStatus;
  }, options?: { refreshWorkspace?: boolean; quiet?: boolean }): Promise<void> {
    if (!props.saveProjection) return;
    const sendInput = weddingHelperResponsibilityToAfpSendInput({
      task,
      metadata: props.metadata ?? props.state.workspace.metadata,
      ownerLabel: overrides?.ownerLabel ?? taskAssignee(task),
      consultedLabel: overrides?.consultedLabel ?? taskConsultedPeople()[task.id],
      lastContactDate: overrides?.lastContactDate ?? taskLastContactDates()[task.id],
      status: overrides?.status ?? (doneTaskIds()[task.id] ? "done" : "open"),
    });
    if (!sendInput) return;
    try {
      await props.saveProjection(sendInput);
      if (!options?.quiet) setSaveNotice("Saved to wedding memory.");
      if (options?.refreshWorkspace !== false) props.onRefreshWorkspace?.();
    } catch {
      if (!options?.quiet) setSaveNotice("Saved on this page. Wedding memory will sync when saving is available.");
    }
  }

  function expectedDueDate(task: WeddingPlanningTask): string {
    const current = task.dueAt?.slice(0, 10);
    if (current && /^\d{4}-\d{2}-\d{2}$/.test(current)) return current;
    const title = task.title.toLowerCase();
    const leadDays = /venue|vendor|photograph|florist|cater|celebrant|officiant/.test(title)
      ? 14
      : /invite|guest|seating/.test(title)
        ? 21
        : task.priority === "urgent"
          ? 3
          : task.priority === "high"
            ? 7
            : 10;
    const date = new Date();
    date.setDate(date.getDate() + leadDays);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function openAgendaDueDate(task: WeddingPlanningTask): void {
    setAgendaDueDateTaskId(task.id);
    setAgendaDueDateDraft(expectedDueDate(task));
  }

  function confirmAgendaTask(task: WeddingPlanningTask): void {
    setConfirmedTaskIds((current) => ({ ...current, [task.id]: true }));
    void saveTaskResponsibility(task, { status: "on_track" }, { refreshWorkspace: false, quiet: true });
  }

  function saveAgendaDueDate(task: WeddingPlanningTask): void {
    const dueDate = agendaDueDateDraft();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return;
    setTaskDueDates((current) => ({ ...current, [task.id]: dueDate }));
    setAgendaDueDateTaskId(null);
    void saveTaskResponsibility(
      { ...task, dueAt: `${dueDate}T12:00:00.000Z`, dueLabel: dueDate },
      { status: "open" },
      { refreshWorkspace: false, quiet: true },
    );
  }

  function upsertHelperContact(draft: {
    name: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  }): "created" | "updated" {
    const result = upsertWeddingHelperContact(loadContacts(props.contactUserId), draft);
    if (!result) return "created";
    saveContacts(result.contacts, props.contactUserId);
    return result.action;
  }

  async function addCustomHelper(): Promise<void> {
    const name = customHelperName().trim();
    if (!name) return;
    const role = customHelperRole().trim() || "Helper";
    const email = customHelperEmail().trim();
    const phone = customHelperPhone().trim();
    setCustomHelpers((current) => current.some((item) => item.toLowerCase() === name.toLowerCase()) ? current : [...current, name]);
    const contactAction = upsertHelperContact({ name, email, phone, role });
    if (props.saveProjection) {
      const sendInput = weddingHelperContactToAfpSendInput({
        name,
        email,
        phone,
        role,
        metadata: props.metadata ?? props.state.workspace.metadata,
      });
      if (sendInput) {
        try {
          await props.saveProjection(sendInput);
          setSaveNotice(`Added ${name} to helpers and ${contactAction === "created" ? "Contacts" : "updated Contacts"}.`);
          props.onRefreshWorkspace?.();
        } catch {
          setSaveNotice(`Added ${name} here and in Contacts. Wedding memory will sync when saving is available.`);
        }
      }
    } else {
      setSaveNotice(`Added ${name} here and in Contacts.`);
    }
    setCustomHelperName("");
    setCustomHelperEmail("");
    setCustomHelperPhone("");
    setCustomHelperRole("Helper");
  }

  function inferWeddingPartnerNames(state: WeddingResponseWorkspaceViewState): string[] {
    const text = [
      ...state.contextCards.flatMap((card) => [...card.answeredLabels, ...card.metadataLabels]),
      ...state.helperContactNames,
      JSON.stringify(state.workspace.metadata ?? {}),
    ].join("\n");
    const names: string[] = [];
    const pair = text.match(/\b([A-Z][a-z]{1,30})\s+(?:and|&)\s+([A-Z][a-z]{1,30})\b/);
    if (pair) names.push(pair[1], pair[2]);
    for (const match of text.matchAll(/\b(?:bride|groom|partner|fiance|fiancee)\s*[:=-]\s*([A-Z][a-z]{1,30}(?:\s+[A-Z][a-z]{1,30})?)\b/gi)) {
      names.push(match[1]);
    }
    return [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 2);
  }

  return (
    <div class="min-w-0 rounded-[24px] border border-fuchsia-100/80 bg-fuchsia-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #C2410C" aria-hidden="true">
              <WeddingDashboardIcon id="user-plus" class="h-4 w-4" />
            </span>
            <p class="text-lg font-bold tracking-tight text-fuchsia-950">Who is helping</p>
            <WeddingInfoTip title="Helper tip" tone="fuchsia">
              Give each task one owner and one due date. Use Consult when someone should be asked, but should not become responsible for finishing the task.
            </WeddingInfoTip>
          </div>
          <p class="mt-1 text-sm leading-6 text-fuchsia-900/75">
            Give every wedding task one clear owner, a due date, and someone to consult when needed.
          </p>
        </div>
        <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-fuchsia-900">
          {openHelperTasks().length} to do
        </span>
      </div>
      <div class="mt-3 grid gap-2 md:grid-cols-3">
        <For each={workloadRows().slice(0, 6)}>
          {(row) => (
            <div class="rounded-2xl border border-fuchsia-100 bg-white/75 px-3 py-2">
              <p class="break-words text-xs font-semibold text-fuchsia-950">{row.name}</p>
              <p class="mt-1 text-sm font-semibold text-fuchsia-900">{row.workloadLabel}</p>
              <p class="mt-0.5 text-xs leading-5 text-fuchsia-900/65">{row.workloadDetailLabel}</p>
              <p class="mt-0.5 text-xs leading-5 text-fuchsia-900/65">{row.overdueCount} overdue</p>
            </div>
          )}
        </For>
      </div>
      <p class="mt-3 rounded-2xl border border-fuchsia-100 bg-white/70 px-3 py-2 text-sm leading-6 text-fuchsia-950/75">
        {workloadSuggestion()}
      </p>
      <Show when={saveNotice()}>
        {(notice) => (
          <p class="mt-2 rounded-2xl border border-fuchsia-100 bg-white/75 px-3 py-2 text-xs font-semibold text-fuchsia-900">
            {notice()}
          </p>
        )}
      </Show>
      <div class="mt-3 grid gap-2 rounded-2xl border border-fuchsia-100 bg-white/70 p-3 md:grid-cols-[1.25fr_1fr_1fr_1fr_auto] md:items-end">
        <label class="min-w-0 text-xs font-semibold text-fuchsia-950">
          Add a helper
          <input
            list="wedding-helper-suggestions"
            value={customHelperName()}
            onInput={(event) => setCustomHelperName(event.currentTarget.value)}
            placeholder="Name from contacts, guest list, family, or coordinator"
            class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-sm font-normal text-fuchsia-950 outline-none focus:border-fuchsia-300"
          />
          <datalist id="wedding-helper-suggestions">
            <For each={helperPeople()}>
              {(name) => <option value={name} />}
            </For>
          </datalist>
        </label>
        <label class="min-w-0 text-xs font-semibold text-fuchsia-950">
          Email
          <input
            type="email"
            value={customHelperEmail()}
            onInput={(event) => setCustomHelperEmail(event.currentTarget.value)}
            placeholder="Optional"
            class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-sm font-normal text-fuchsia-950 outline-none focus:border-fuchsia-300"
          />
        </label>
        <label class="min-w-0 text-xs font-semibold text-fuchsia-950">
          Phone
          <input
            type="tel"
            value={customHelperPhone()}
            onInput={(event) => setCustomHelperPhone(event.currentTarget.value)}
            placeholder="Optional"
            class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-sm font-normal text-fuchsia-950 outline-none focus:border-fuchsia-300"
          />
        </label>
        <label class="min-w-0 text-xs font-semibold text-fuchsia-950">
          Role
          <select
            value={customHelperRole()}
            onChange={(event) => setCustomHelperRole(event.currentTarget.value)}
            class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-sm font-normal text-fuchsia-950 outline-none focus:border-fuchsia-300"
          >
            <option value="Helper">Helper</option>
            <option value="Partner">Partner</option>
            <option value="Parent / family">Parent / family</option>
            <option value="Wedding party">Wedding party</option>
            <option value="Coordinator">Coordinator</option>
            <option value="Planner">Planner</option>
          </select>
        </label>
        <button
          type="button"
          disabled={!customHelperName().trim()}
          onClick={() => void addCustomHelper()}
          class="rounded-full border border-fuchsia-200 bg-fuchsia-100/80 px-3 py-2 text-xs font-semibold text-fuchsia-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          Add person
        </button>
      </div>
      <div class="mt-3 rounded-2xl border border-fuchsia-100 bg-white/70 p-3">
        <p class="text-sm font-semibold text-fuchsia-950">Weekly 10-minute agenda</p>
        <Show when={weeklyAgendaRows().length > 0} fallback={<p class="mt-1 text-sm leading-6 text-fuchsia-950/70">No open tasks need review right now.</p>}>
          <ol class="mt-2 space-y-2">
            <For each={weeklyAgendaRows()}>
              {(row) => (
                <li class="rounded-xl border border-fuchsia-100 bg-white/75 px-3 py-2">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="break-words text-xs font-semibold text-fuchsia-950">{row.task.title}</p>
                      <p class="mt-1 text-xs leading-5 text-fuchsia-950/70">
                        {row.ownerLabel} - {row.dueLabel}
                      </p>
                      <p class="mt-1 text-xs leading-5 text-fuchsia-900/70">{row.reasonLabel}</p>
                    </div>
                    <Show
                      when={row.suggestedActionLabel === "Confirm status"}
                      fallback={
                        <button
                          type="button"
                          class="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1.5 text-[11px] font-semibold text-fuchsia-950 transition hover:bg-white"
                          onClick={() => props.onSidebarAction(taskAction(row.task))}
                        >
                          {row.suggestedActionLabel}
                        </button>
                      }
                    >
                      <button
                        type="button"
                        aria-pressed={Boolean(confirmedTaskIds()[row.id])}
                        class={`rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition ${confirmedTaskIds()[row.id] ? "border-emerald-300 bg-emerald-100 text-emerald-950" : "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950 hover:bg-white"}`}
                        onClick={() => confirmAgendaTask(row.task)}
                      >
                        {confirmedTaskIds()[row.id] ? "On track" : "Confirm status"}
                      </button>
                    </Show>
                  </div>
                  <Show when={row.dueLabel === "Add due date"}>
                    <div class="mt-2">
                      <Show
                        when={agendaDueDateTaskId() === row.id}
                        fallback={<button type="button" class="text-xs font-semibold text-fuchsia-900 underline decoration-fuchsia-300 underline-offset-2" onClick={() => openAgendaDueDate(row.task)}>Add due date</button>}
                      >
                        <div class="flex flex-wrap items-center gap-2">
                          <input type="date" value={agendaDueDateDraft()} onInput={(event) => setAgendaDueDateDraft(event.currentTarget.value)} class="min-h-10 rounded-lg border border-fuchsia-200 bg-white px-2 text-xs text-fuchsia-950 outline-none" />
                          <button type="button" class="min-h-10 rounded-lg border border-fuchsia-200 bg-fuchsia-100 px-3 text-xs font-semibold text-fuchsia-950" onClick={() => saveAgendaDueDate(row.task)}>Set due date</button>
                        </div>
                      </Show>
                    </div>
                  </Show>
                </li>
              )}
            </For>
          </ol>
        </Show>
      </div>
      <Show when={helperTasks().length > 0} fallback={
        <div class="mt-3 rounded-2xl border border-fuchsia-100 bg-white/70 p-2">
          <p class="text-sm leading-6 text-fuchsia-950/75">
            No tasks are ready to assign yet. Add wedding tasks, import a list, or ask OmnyID to create the next planning checklist.
          </p>
          <button
            type="button"
            class="mt-3 rounded-full border border-fuchsia-200 bg-fuchsia-100/80 px-3 py-2 text-xs font-semibold text-fuchsia-950 transition hover:bg-white sm:py-1.5"
            onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_tasks", props.state))}
          >
            Open wedding tasks
          </button>
        </div>
      }>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={taskTab() === "open"}
            class={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${taskTab() === "open" ? "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-950" : "border-fuchsia-100 bg-white/75 text-fuchsia-900 hover:bg-fuchsia-50"}`}
            onClick={() => setTaskTab("open")}
          >
            To do ({openHelperTasks().length})
          </button>
          <button
            type="button"
            aria-pressed={taskTab() === "done"}
            class={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${taskTab() === "done" ? "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-950" : "border-fuchsia-100 bg-white/75 text-fuchsia-900 hover:bg-fuchsia-50"}`}
            onClick={() => setTaskTab("done")}
          >
            Done ({doneHelperTasks().length})
          </button>
        </div>
        <Show when={taskTab() === "open"}>
        <div class="mt-3 space-y-2">
          <For each={openHelperTasks()}>
            {(task) => {
              const action = taskAction(task);
              return (
                <article class="rounded-2xl border border-fuchsia-100 bg-white/75 p-3">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="break-words text-sm font-semibold text-fuchsia-950">{task.title}</p>
                      <p class="mt-1 text-xs leading-5 text-fuchsia-900/70">
                        Due:{" "}
                        <button
                          type="button"
                          class="font-semibold underline decoration-fuchsia-300 underline-offset-2"
                          title="Open this task"
                          onClick={() => props.onSidebarAction(action)}
                        >
                          {weddingHelperTaskDueLabel(task)}
                        </button>
                        {" "}- Priority: {weddingHelperTaskPriorityLabel(task)}
                      </p>
                    </div>
                    <span class="max-w-full break-words rounded-full bg-fuchsia-50 px-2 py-1 text-xs text-fuchsia-900">
                      To do
                    </span>
                  </div>
                  <div class="mt-3 grid gap-2 md:grid-cols-3">
                    <label class="text-xs font-semibold text-fuchsia-950">
                      Owner
                      <select
                        value={taskAssignee(task)}
                        onChange={(event) => {
                          const ownerLabel = event.currentTarget.value;
                          setTaskAssignees((current) => ({ ...current, [task.id]: ownerLabel }));
                          void saveTaskResponsibility(task, { ownerLabel });
                        }}
                        class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-xs font-medium text-fuchsia-950 outline-none"
                      >
                        <option value="Unassigned">Unassigned</option>
                        <For each={helperPeople()}>
                          {(name) => <option value={name}>{name}</option>}
                        </For>
                      </select>
                    </label>
                    <label class="text-xs font-semibold text-fuchsia-950">
                      Consult
                      <select
                        value={taskConsultedPeople()[task.id] ?? "No one yet"}
                        onChange={(event) => {
                          const consultedLabel = event.currentTarget.value;
                          setTaskConsultedPeople((current) => ({ ...current, [task.id]: consultedLabel }));
                          void saveTaskResponsibility(task, { consultedLabel });
                        }}
                        class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-xs font-medium text-fuchsia-950 outline-none"
                      >
                        <option value="No one yet">No one yet</option>
                        <For each={helperPeople()}>
                          {(name) => <option value={name}>{name}</option>}
                        </For>
                      </select>
                    </label>
                    <label class="text-xs font-semibold text-fuchsia-950">
                      Last contact
                      <input
                        type="date"
                        value={taskLastContactDates()[task.id] ?? ""}
                        onChange={(event) => {
                          const lastContactDate = event.currentTarget.value;
                          setTaskLastContactDates((current) => ({ ...current, [task.id]: lastContactDate }));
                          void saveTaskResponsibility(task, { lastContactDate });
                        }}
                        class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-xs font-medium text-fuchsia-950 outline-none"
                      />
                      <span class="mt-1 block text-[11px] font-normal leading-4 text-fuchsia-900/60">
                        For this page. Vendor follow-ups are tracked in Response queue.
                      </span>
                    </label>
                  </div>
                  <button
                    type="button"
                    class="mt-3 rounded-full border border-fuchsia-200 bg-fuchsia-100/80 px-3 py-2 text-xs font-semibold text-fuchsia-950 transition hover:bg-white sm:py-1.5"
                    onClick={() => {
                      setTaskDone(task.id, true);
                      void saveTaskResponsibility(task, { status: "done" });
                    }}
                  >
                    Mark done
                  </button>
                  <Show when={action.kind === "open_workspace_menu"}>
                    <button
                      type="button"
                      class="ml-2 mt-3 rounded-full border border-fuchsia-200 bg-white px-3 py-2 text-xs font-semibold text-fuchsia-950 transition hover:bg-fuchsia-50 sm:py-1.5"
                      onClick={() => props.onSidebarAction(action)}
                    >
                      {action.label}
                    </button>
                  </Show>
                </article>
              );
            }}
          </For>
        </div>
        </Show>
      </Show>
      <Show when={helperTasks().length > 0 && taskTab() === "done"}>
        <div class="mt-3 rounded-2xl border border-fuchsia-100 bg-white/70 p-3">
          <p class="text-sm font-semibold text-fuchsia-950">Done</p>
          <Show when={doneHelperTasks().length > 0} fallback={
            <p class="mt-2 rounded-xl border border-fuchsia-100 bg-white/75 px-3 py-2 text-xs leading-5 text-fuchsia-950/70">
              No completed tasks yet. Mark a task done and it will appear here.
            </p>
          }>
            <div class="mt-2 space-y-1">
              <For each={doneHelperTasks()}>
                {(task) => (
                  <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fuchsia-100 bg-white/75 px-3 py-2">
                    <p class="break-words text-xs font-semibold text-fuchsia-950">{task.title}</p>
                    <button
                      type="button"
                      class="rounded-full border border-fuchsia-100 bg-fuchsia-50 px-2 py-1 text-[11px] font-semibold text-fuchsia-950"
                      onClick={() => {
                        setTaskDone(task.id, false);
                        void saveTaskResponsibility(task, { status: "open" });
                      }}
                    >
                      Move to to-do
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
