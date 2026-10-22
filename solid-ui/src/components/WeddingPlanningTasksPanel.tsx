// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import {
  buildActiveTaskDecisionViewState,
  type ActiveTaskDecisionItem,
  type ActiveTaskLifecycle,
} from "@/lib/activeTaskDecisionViewState";
import {
  loadWeddingHelperLocalState,
  saveWeddingHelperLocalState,
  weddingHelperResponsibilityToAfpSendInput,
  weddingHelperTaskDueLabel,
  weddingHelperTaskIsDone,
  weddingHelperTaskPriorityLabel,
} from "@/lib/weddingHelpersPanelState";
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

export function WeddingPlanningTasksPanel(props: {
  state: WeddingResponseWorkspaceViewState;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
}) {
  const workspaceId = () => props.state.workspace.metadata.responseWorkspaceId;
  const initial = loadWeddingHelperLocalState(workspaceId());
  const [doneTaskIds, setDoneTaskIds] = createSignal<Record<string, true>>(initial.doneTaskIds);
  const [filter, setFilter] = createSignal<Filter>("open");
  const [savingTaskId, setSavingTaskId] = createSignal<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = createSignal<Record<string, true>>({});
  const [notice, setNotice] = createSignal<string | null>(null);
  const isDone = (task: Task) => weddingHelperTaskIsDone(task, doneTaskIds());
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

  async function setDone(task: Task, done: boolean): Promise<void> {
    const current = loadWeddingHelperLocalState(workspaceId());
    const nextDoneTaskIds = { ...current.doneTaskIds };
    if (done) nextDoneTaskIds[task.id] = true;
    else delete nextDoneTaskIds[task.id];
    saveWeddingHelperLocalState(workspaceId(), { ...current, doneTaskIds: nextDoneTaskIds });
    setDoneTaskIds(nextDoneTaskIds);
    setNotice(done ? "Task marked done. People has been updated too." : "Task reopened. People has been updated too.");
    if (!props.saveProjection) return;
    const sendInput = weddingHelperResponsibilityToAfpSendInput({
      task,
      metadata: props.state.workspace.metadata,
      ownerLabel: current.taskAssignees[task.id] ?? task.assignee ?? "You",
      consultedLabel: current.taskConsultedPeople[task.id],
      lastContactDate: current.taskLastContactDates[task.id],
      status: done ? "done" : "open",
    });
    if (!sendInput) return;
    setSavingTaskId(task.id);
    try {
      await props.saveProjection(sendInput);
      props.onRefreshWorkspace?.();
    } catch {
      setNotice("Updated on this device. Wedding memory will sync when saving is available.");
    } finally {
      setSavingTaskId(null);
    }
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
      <Show when={notice()}>{(message) => <p class="mt-3 rounded-lg border border-wedding-border bg-wedding-slate px-3 py-2 text-sm text-wedding-ink" role="status">{message()}</p>}</Show>
      <Show when={tasks().length > 0} fallback={<p class="mt-4 rounded-lg border border-dashed border-wedding-border bg-wedding-page p-5 text-sm text-wedding-ink/70">No tasks in this view.</p>}>
        <ul class="mt-4 space-y-3">
          <For each={tasks()}>{(task) => (
            <li class="overflow-hidden rounded-xl border border-wedding-border bg-wedding-page">
              <div class="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <button type="button" aria-expanded={expandedTaskIds()[task.id] === true} onClick={() => toggleExpanded(task.id)} class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class={`rounded-lg px-2 py-1 text-[11px] font-bold ${STATUS_CLASS[status(task).id]}`}>{status(task).label}</span>
                    <span class="text-xs font-semibold text-wedding-ink/65">{weddingHelperTaskPriorityLabel(task)}</span>
                  </div>
                  <p class="mt-2 break-words text-base font-semibold text-wedding-ink">{task.title}</p>
                  <p class="mt-1 text-sm text-wedding-ink/70">Due {weddingHelperTaskDueLabel(task)} · {task.assignee?.trim() || "You"}</p>
                  <p class="mt-2 text-xs font-semibold text-wedding-primary">{expandedTaskIds()[task.id] ? "Hide task details" : "View task details"}</p>
                </button>
                <button type="button" disabled={savingTaskId() === task.id} onClick={() => void setDone(task, !isDone(task))} class="min-h-11 shrink-0 rounded-lg border border-wedding-secondary bg-white px-4 text-sm font-semibold text-wedding-secondary disabled:opacity-50">
                  {isDone(task) ? "Reopen" : "Mark done"}
                </button>
              </div>
              <Show when={expandedTaskIds()[task.id]}>
                <div class="border-t border-wedding-border bg-white p-4">
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
