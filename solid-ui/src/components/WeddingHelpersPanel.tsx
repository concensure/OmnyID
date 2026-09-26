// @locs-version: 2.1
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import type { SendAfpMessageInput } from "@/lib/api";
import {
  buildWeddingHelperPeople,
  buildWeddingHelperWeeklyAgendaRows,
  buildWeddingHelperWorkloadRows,
  loadWeddingHelperLocalState,
  saveWeddingHelperLocalState,
  weddingHelperResponsibilityToAfpSendInput,
  weddingHelperTaskDueLabel,
  weddingHelperTaskPriorityLabel,
  weddingHelperWorkloadSuggestion,
  type WeddingHelperResponsibilityStatus,
} from "@/lib/weddingHelpersPanelState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import {
  weddingTaskSidebarAction,
  weddingTimelineSidebarAction,
} from "@/lib/weddingWorkspaceSidebarActionState";

type WeddingPlanningTask = WeddingResponseWorkspaceViewState["planningTaskItems"][number];

export function WeddingHelpersPanel(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
  metadata?: unknown;
}) {
  const workspaceId = () => props.state.workspace.metadata.responseWorkspaceId;
  const initialState = loadWeddingHelperLocalState(workspaceId());
  const [doneTaskIds, setDoneTaskIds] = createSignal<Record<string, true>>(initialState.doneTaskIds);
  const [taskAssignees, setTaskAssignees] = createSignal<Record<string, string>>(initialState.taskAssignees);
  const [taskConsultedPeople, setTaskConsultedPeople] = createSignal<Record<string, string>>(initialState.taskConsultedPeople);
  const [taskLastContactDates, setTaskLastContactDates] = createSignal<Record<string, string>>(initialState.taskLastContactDates);
  const [customHelperName, setCustomHelperName] = createSignal("");
  const [customHelpers, setCustomHelpers] = createSignal<string[]>(initialState.customHelpers);
  const [saveNotice, setSaveNotice] = createSignal<string | null>(null);
  const helperPeople = createMemo(() => buildWeddingHelperPeople(props.state.helperContactNames, customHelpers()));
  const helperTasks = createMemo(() => props.state.planningTaskItems.slice(0, 30));
  const taskAssignee = (task: WeddingPlanningTask) =>
    taskAssignees()[task.id] ?? task.assignee ?? "Unassigned";
  const taskAction = (task: WeddingPlanningTask) => weddingTaskSidebarAction(task, props.state);
  const openHelperTasks = createMemo(() => helperTasks().filter((task) => !doneTaskIds()[task.id]));
  const doneHelperTasks = createMemo(() => helperTasks().filter((task) => doneTaskIds()[task.id]));
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

  createEffect(() => {
    saveWeddingHelperLocalState(workspaceId(), {
      doneTaskIds: doneTaskIds(),
      taskAssignees: taskAssignees(),
      taskConsultedPeople: taskConsultedPeople(),
      taskLastContactDates: taskLastContactDates(),
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
  }

  async function saveTaskResponsibility(task: WeddingPlanningTask, overrides?: {
    ownerLabel?: string;
    consultedLabel?: string;
    lastContactDate?: string;
    status?: WeddingHelperResponsibilityStatus;
  }): Promise<void> {
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
      setSaveNotice("Saved to wedding memory.");
      props.onRefreshWorkspace?.();
    } catch {
      setSaveNotice("Saved on this page. Wedding memory will sync when saving is available.");
    }
  }

  function addCustomHelper(): void {
    const name = customHelperName().trim();
    if (!name) return;
    setCustomHelpers((current) => current.some((item) => item.toLowerCase() === name.toLowerCase()) ? current : [...current, name]);
    setCustomHelperName("");
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
      <div class="mt-3 flex flex-col gap-2 rounded-2xl border border-fuchsia-100 bg-white/70 p-3 sm:flex-row sm:items-end">
        <label class="min-w-0 flex-1 text-xs font-semibold text-fuchsia-950">
          Add a helper
          <input
            value={customHelperName()}
            onInput={(event) => setCustomHelperName(event.currentTarget.value)}
            placeholder="Name from contacts, guest list, family, or coordinator"
            class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-sm font-normal text-fuchsia-950 outline-none focus:border-fuchsia-300"
          />
        </label>
        <button
          type="button"
          disabled={!customHelperName().trim()}
          onClick={addCustomHelper}
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
                    <button
                      type="button"
                      class="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1.5 text-[11px] font-semibold text-fuchsia-950 transition hover:bg-white"
                      onClick={() => props.onSidebarAction(taskAction(row.task))}
                    >
                      {row.suggestedActionLabel}
                    </button>
                  </div>
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
      <Show when={doneHelperTasks().length > 0}>
        <div class="mt-3 rounded-2xl border border-fuchsia-100 bg-white/70 p-3">
          <p class="text-sm font-semibold text-fuchsia-950">Done</p>
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
        </div>
      </Show>
    </div>
  );
}
