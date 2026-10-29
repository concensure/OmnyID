// @locs-version: 1.0
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { WeddingTaskResponsibilityFields } from "@/components/WeddingTaskResponsibilityFields";
import { WeddingTaskComposer } from "@/components/WeddingTaskComposer";
import { WeddingTaskCompletionButton } from "@/components/WeddingTaskCompletionButton";
import { WeddingTaskOwnerControl } from "@/components/WeddingTaskOwnerControl";
import { WeddingTaskContextHelp } from "@/components/WeddingTaskContextHelp";

import type { SendAfpMessageInput } from "@/lib/api";
import {
  buildActiveTaskDecisionViewState,
  type ActiveTaskDecisionItem,
  type ActiveTaskLifecycle,
} from "@/lib/activeTaskDecisionViewState";
import {
  loadWeddingHelperLocalState,
  weddingHelperTaskDueLabel,
  weddingHelperTaskIsDone,
  weddingHelperTaskPriorityLabel,
} from "@/lib/weddingHelpersPanelState";
import { loadWeddingTaskCompletion, WEDDING_TASK_COMPLETION_EVENT } from "@/lib/weddingTaskCompletionLocalState";
import { weddingTaskDateToAfpSendInput } from "@/lib/weddingTaskDateProjectionState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

type Filter = "open" | "done" | "all";
type Task = WeddingResponseWorkspaceViewState["planningTaskItems"][number];

const STATUS_CLASS: Record<ActiveTaskLifecycle, string> = {
  pending: "bg-amber-100 text-amber-900",
  in_progress: "bg-sky-100 text-sky-900",
  blocked: "bg-rose-100 text-rose-900",
  decided: "bg-emerald-100 text-emerald-900",
  completed: "bg-teal-100 text-teal-900",
  skipped: "bg-slate-200 text-slate-700",
};
const STATUS_RAIL_CLASS: Record<ActiveTaskLifecycle, string> = {
  pending: "bg-wedding-ink/45",
  in_progress: "bg-amber-500",
  blocked: "bg-red-700",
  decided: "bg-wedding-primary",
  completed: "bg-teal-600",
  skipped: "bg-slate-400",
};

export function WeddingPlanningTasksPanel(props: {
  state: WeddingResponseWorkspaceViewState;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
  contactUserId?: string | null;
}) {
  const workspaceId = () => props.state.workspace.metadata.responseWorkspaceId;
  const initial = loadWeddingHelperLocalState(workspaceId());
  const [completionRevision, setCompletionRevision] = createSignal(0);
  const [filter, setFilter] = createSignal<Filter>("open");
  const [savingTaskId, setSavingTaskId] = createSignal<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = createSignal<Record<string, true>>({});
  const [notice, setNotice] = createSignal<string | null>(null);
  const isDone = (task: Task) => {
    completionRevision();
    return loadWeddingTaskCompletion({ taskId: task.id, weddingPlanId: props.state.workspace.metadata.weddingPlanId, responseWorkspaceId: workspaceId() })?.completed
      ?? weddingHelperTaskIsDone(task, initial.doneTaskIds);
  };
  const tasks = createMemo(() => props.state.planningTaskItems.filter((task) => (
    filter() === "all" || (filter() === "done" ? isDone(task) : !isDone(task))
  )));
  const doneCount = createMemo(() => props.state.planningTaskItems.filter(isDone).length);
  const decisionView = createMemo(() => buildActiveTaskDecisionViewState(props.state.afpMessages));
  const decisionTask = (task: Task): ActiveTaskDecisionItem | null => decisionView().items.find((item) => (
    item.id === task.id || item.title.toLowerCase() === task.title.toLowerCase()
  )) ?? null;
  const status = (task: Task): { id: ActiveTaskLifecycle; label: string } => {
    if (isDone(task)) return { id: "completed", label: "Done" };
    const linked = decisionTask(task);
    return linked ? { id: linked.status, label: linked.statusLabel } : { id: "pending", label: "To-do" };
  };
  const toggleExpanded = (taskId: string) => setExpandedTaskIds((current) => {
    const next = { ...current };
    if (next[taskId]) delete next[taskId];
    else next[taskId] = true;
    return next;
  });

  onMount(() => {
    const listener = () => setCompletionRevision((value) => value + 1);
    window.addEventListener(WEDDING_TASK_COMPLETION_EVENT, listener);
    onCleanup(() => window.removeEventListener(WEDDING_TASK_COMPLETION_EVENT, listener));
  });
  async function saveDate(task: Task, dueDate: string): Promise<void> {
    const input = weddingTaskDateToAfpSendInput({ taskId: task.id, title: task.title, dueDate, weddingPlanId: props.state.workspace.metadata.weddingPlanId, responseWorkspaceId: workspaceId() });
    if (!input || !props.saveProjection) return;
    setSavingTaskId(task.id);
    try { await props.saveProjection(input); setNotice("Deadline updated."); props.onRefreshWorkspace?.(); }
    catch { setNotice("The deadline could not be saved. Try again."); }
    finally { setSavingTaskId(null); }
  }

  return (
    <section class="min-w-0 rounded-xl border border-wedding-border bg-wedding-card p-4 shadow-wedding-card sm:p-5" aria-labelledby="wedding-planning-tasks-title">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="wedding-planning-tasks-title" class="font-display text-xl font-semibold text-wedding-ink">Wedding tasks</h2>
          <p class="mt-1 text-sm leading-6 text-wedding-ink/70">The same planning tasks shown in People, with one shared completion status.</p>
        </div>
        <p class="rounded-lg bg-wedding-slate px-3 py-2 text-xs font-semibold text-wedding-ink">{doneCount()} of {props.state.planningTaskItems.length} done</p>
      </div>
      <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter wedding tasks">
        <For each={(["open", "done", "all"] as const)}>{(value) => (
          <button type="button" aria-pressed={filter() === value} onClick={() => setFilter(value)} class={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${filter() === value ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border bg-white text-wedding-ink"}`}>
            {value === "open" ? "To-do" : value === "done" ? "Done" : "All"}
          </button>
        )}</For>
      </div>
      <WeddingTaskComposer weddingPlanId={props.state.workspace.metadata.weddingPlanId} responseWorkspaceId={workspaceId()} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} people={props.state.helperContactNames} />
      <Show when={notice()}>{(message) => <p class="mt-3 rounded-lg border border-wedding-border bg-wedding-slate px-3 py-2 text-sm text-wedding-ink" role="status">{message()}</p>}</Show>
      <Show when={tasks().length > 0} fallback={<p class="mt-4 rounded-lg border border-dashed border-wedding-border bg-wedding-page p-5 text-sm text-wedding-ink/70">No tasks in this view.</p>}>
        <ul class="mt-4 space-y-3">
          <For each={tasks()}>{(task) => (
            <li class="relative overflow-hidden rounded-xl border border-wedding-border bg-wedding-page">
              <span class={`absolute inset-y-0 left-0 w-1 ${STATUS_RAIL_CLASS[status(task).id]}`} aria-hidden="true" />
              <div class="flex min-w-0 flex-col gap-3 py-4 pl-5 pr-4 sm:flex-row sm:items-start sm:justify-between">
                <button type="button" aria-expanded={expandedTaskIds()[task.id] === true} onClick={() => toggleExpanded(task.id)} class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class={`rounded-lg px-2 py-1 text-[11px] font-bold ${STATUS_CLASS[status(task).id]}`}>{status(task).label}</span>
                    <span class="text-xs font-semibold text-wedding-ink/65">{weddingHelperTaskPriorityLabel(task)}</span>
                  </div>
                  <div class="mt-2 flex min-w-0 items-start gap-2"><p class="min-w-0 break-words text-base font-semibold text-wedding-ink">{task.title}</p><WeddingTaskContextHelp title={task.title} /></div>
                  <p class="mt-1 text-sm text-wedding-ink/70">Due {weddingHelperTaskDueLabel(task)}</p>
                  <p class="mt-2 text-xs font-semibold text-wedding-primary">{expandedTaskIds()[task.id] ? "Hide task details" : "View task details"}</p>
                </button>
                <div class="grid min-w-0 gap-2 sm:w-[15rem]">
                  <WeddingTaskOwnerControl task={task} weddingPlanId={props.state.workspace.metadata.weddingPlanId} responseWorkspaceId={workspaceId()} people={props.state.helperContactNames} contactUserId={props.contactUserId} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} />
                  <WeddingTaskCompletionButton task={task} weddingPlanId={props.state.workspace.metadata.weddingPlanId} responseWorkspaceId={workspaceId()} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} />
                </div>
              </div>
              <Show when={expandedTaskIds()[task.id]}>
                <div class="border-t border-wedding-border bg-white p-4">
                  <WeddingTaskResponsibilityFields
                    task={task}
                    state={props.state}
                    saveProjection={props.saveProjection}
                    onRefreshWorkspace={props.onRefreshWorkspace}
                    contactUserId={props.contactUserId}
                  />
                  <label class="mb-4 block text-sm font-semibold text-wedding-ink">Deadline
                    <input type="date" disabled={savingTaskId() === task.id} value={task.dueAt?.slice(0, 10) ?? ""} onChange={(event) => void saveDate(task, event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 font-normal sm:max-w-xs" />
                  </label>
                  <Show when={decisionTask(task)?.decisions.length} fallback={<p class="text-sm text-wedding-ink/65">No decision options are attached to this task yet.</p>}>
                    <ol class="space-y-3">
                      <For each={decisionTask(task)?.decisions ?? []}>{(decision, index) => (
                        <li class="rounded-lg border border-wedding-border bg-wedding-page p-3">
                          <p class="text-xs font-semibold uppercase tracking-wide text-wedding-ink/65">Decision {index() + 1} · {decision.statusLabel}</p>
                          <p class="mt-1 text-sm font-semibold text-wedding-ink">{decision.title}</p>
                          <ul class="mt-2 space-y-2">
                            <For each={decision.options}>{(option) => (
                              <li class={`rounded-lg border px-3 py-2 text-sm ${option.chosen ? "border-wedding-primary bg-wedding-primary/10 text-wedding-primary" : "border-wedding-border bg-white text-wedding-ink"}`}>
                                {option.label}<Show when={option.chosen}><span class="ml-2 text-xs font-bold">Chosen</span></Show>
                              </li>
                            )}</For>
                          </ul>
                          <Show when={decision.chosenOptionLabel && decision.options.length === 0}>{(chosen) => <p class="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Chosen: {chosen()}</p>}</Show>
                        </li>
                      )}</For>
                    </ol>
                  </Show>
                </div>
              </Show>
            </li>
          )}</For>
        </ul>
      </Show>
    </section>
  );
}
