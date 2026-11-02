// @locs-version: 2.2
import { For, Show, createMemo, createSignal } from "solid-js";

import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import { WeddingTaskComposer } from "@/components/WeddingTaskComposer";
import { WeddingTaskCompletionButton } from "@/components/WeddingTaskCompletionButton";
import { WeddingTaskOwnerControl } from "@/components/WeddingTaskOwnerControl";
import type { SendAfpMessageInput } from "@/lib/api";
import { weddingGanttAxisTicks } from "@/lib/weddingGanttAxisState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { weddingTaskDateToAfpSendInput } from "@/lib/weddingTaskDateProjectionState";
import {
  weddingTimelineBarWidthPercent,
  weddingTimelineFileActionState,
  weddingTimelineStatusLabel,
} from "@/lib/weddingTimelineDisplayState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import {
  weddingTaskSidebarAction,
  weddingTimelineSidebarAction,
} from "@/lib/weddingWorkspaceSidebarActionState";

const ROW_ACTION_CLASS = "min-h-11 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold text-wedding-secondary transition hover:bg-wedding-slate disabled:cursor-not-allowed disabled:opacity-45";

export function WeddingTimelinePanel(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenSavedOutputs?: () => void;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
}) {
  const [showAllRows, setShowAllRows] = createSignal(false);
  // The mobile timeline is a visual schedule, not only a list of coloured
  // dots. Start with the date-scaled chart visible there as well.
  const [showGantt, setShowGantt] = createSignal(typeof window !== "undefined" && window.matchMedia("(max-width: 39.99em)").matches);
  const [mobileFilter, setMobileFilter] = createSignal<"all" | "upcoming" | "completed">("all");
  const [dateNotice, setDateNotice] = createSignal<string | null>(null);
  const isCompleted = (status: string | null | undefined) => /done|complete|accepted/i.test(status ?? "");
  // Filter before applying the compact mobile limit. Previously the first six
  // all-status rows hid completed tasks whenever they happened later in time.
  const filteredRows = createMemo(() => props.state.ganttTimeline.rows.filter((row) => {
    if (mobileFilter() === "all") return true;
    return mobileFilter() === "completed" ? isCompleted(row.statusLabel) : !isCompleted(row.statusLabel);
  }));
  const visibleRows = createMemo(() => showAllRows() ? filteredRows() : filteredRows().slice(0, 6));
  const hiddenRowCount = createMemo(() => Math.max(0, filteredRows().length - visibleRows().length));
  const visibleUndatedItems = createMemo(() => props.state.ganttTimeline.undatedItems.filter((item) => {
    if (mobileFilter() === "all") return true;
    return mobileFilter() === "completed" ? isCompleted(item.statusLabel) : !isCompleted(item.statusLabel);
  }));
  const ganttAxisTicks = createMemo(() => weddingGanttAxisTicks(props.state.ganttTimeline.rows, {
    startLabel: props.state.ganttTimeline.rangeStartLabel,
    endLabel: props.state.ganttTimeline.rangeEndLabel,
  }));
  const taskActionFor = (itemId: string) => {
    const task = props.state.planningTaskItems.find((item) => item.id === itemId);
    return task ? weddingTaskSidebarAction(task, props.state) : weddingTimelineSidebarAction("open_tasks", props.state, itemId);
  };
  const taskActionLabelFor = (itemId: string, fallback: string) => {
    const action = taskActionFor(itemId);
    return action.kind === "open_workspace_menu" ? action.label : fallback;
  };
  const fileActionFor = (linkedArtifactId: string | null | undefined) => weddingTimelineFileActionState({
    linkedArtifactId,
    canOpenArtifact: Boolean(props.onOpenArtifact),
    canOpenSavedOutputs: Boolean(props.onOpenSavedOutputs),
  });
  function openFileAction(linkedArtifactId: string | null | undefined, itemId: string): void {
    const action = fileActionFor(linkedArtifactId);
    if (action?.mode === "open_artifact" && linkedArtifactId) {
      props.onOpenArtifact?.(linkedArtifactId);
      return;
    }
    if (action?.mode === "open_files") {
      props.onOpenSavedOutputs?.();
      return;
    }
    props.onSidebarAction(taskActionFor(itemId));
  }
  function openCalendarOrTaskDates(): void {
    props.onSidebarAction(props.state.ganttTimeline.rows.length > 0
      ? weddingTimelineSidebarAction("open_calendar", props.state)
      : weddingTimelineSidebarAction("open_tasks", props.state));
  }
  function openRowTaskOnMobile(event: MouseEvent, itemId: string): void {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 39.99em)").matches) return;
    if (event.target instanceof HTMLElement && event.target.closest("button, input, select, label")) return;
    props.onSidebarAction(taskActionFor(itemId));
  }
  async function saveTaskDate(itemId: string, title: string, dueDate: string): Promise<void> {
    const input = weddingTaskDateToAfpSendInput({ taskId: itemId, title, dueDate, weddingPlanId: props.state.workspace.metadata.weddingPlanId, responseWorkspaceId: props.state.workspace.metadata.responseWorkspaceId });
    if (!input || !props.saveProjection) { setDateNotice("Task date saving is unavailable in this view."); return; }
    try { await props.saveProjection(input); setDateNotice("Deadline updated."); props.onRefreshWorkspace?.(); }
    catch { setDateNotice("The deadline could not be saved. Try again."); }
  }

  return (
    <div class="min-w-0 rounded-xl border border-wedding-border bg-wedding-card p-3 text-wedding-ink shadow-wedding-card phone:rounded-none phone:border-0 phone:bg-transparent phone:p-0 phone:shadow-none sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="text-base font-semibold text-wedding-ink">Timeline</p>
            <WeddingInfoTip title="Timeline tip" tone="stone">
              Put legal deadlines, payment due dates, and vendor lock-in dates on the calendar. If a date is still uncertain, keep it as a task until it is confirmed.
            </WeddingInfoTip>
          </div>
        </div>
        <span class="max-w-full break-words rounded-lg bg-wedding-slate px-2 py-1 text-xs font-semibold text-wedding-ink/75">
          {props.state.ganttTimeline.rows.length} dated item{props.state.ganttTimeline.rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-11 flex-1 rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-wedding-primary/90 sm:flex-none"
          data-magic-action="open"
          data-magic-icon="calendar"
          data-magic-label={props.state.ganttTimeline.rows.length > 0 ? "Open wedding calendar" : "Add task dates"}
          data-magic-id="wedding:timeline:calendar-or-dates"
          onClick={openCalendarOrTaskDates}
        >
          {props.state.ganttTimeline.rows.length > 0 ? "Open wedding calendar" : "Add task dates"}
        </button>
        <button
          type="button"
          class="min-h-11 flex-1 rounded-lg border border-wedding-secondary bg-white px-4 text-sm font-semibold text-wedding-secondary transition hover:bg-wedding-slate disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
          data-magic-action="open"
          data-magic-icon="tasks"
          data-magic-label="Open wedding tasks"
          data-magic-id="wedding:timeline:tasks"
          onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_tasks", props.state))}
        >
          Open wedding tasks
        </button>
        <Show when={props.state.ganttTimeline.rows.length > 0}>
          <button
            type="button"
            class="min-h-11 flex-1 rounded-lg border border-wedding-secondary bg-white px-4 text-sm font-semibold text-wedding-secondary transition hover:bg-wedding-slate sm:flex-none"
            aria-pressed={showGantt()}
            data-magic-action="toggle"
            data-magic-icon="timeline"
            data-magic-label={showGantt() ? "Hide Gantt chart" : "Show Gantt chart"}
            data-magic-id="wedding:timeline:gantt"
            onClick={() => setShowGantt((value) => !value)}
          >
            {showGantt() ? "Hide Gantt chart" : "Show Gantt chart"}
          </button>
        </Show>
      </div>
      <WeddingTaskComposer weddingPlanId={props.state.workspace.metadata.weddingPlanId} responseWorkspaceId={props.state.workspace.metadata.responseWorkspaceId} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} people={props.state.helperContactNames} />
      <Show when={dateNotice()}>{(message) => <p class="mt-2 text-sm text-wedding-ink/70" role="status">{message()}</p>}</Show>
      <div class="mt-3 flex gap-2 overflow-x-auto phone:flex sm:hidden">
        <For each={["all", "upcoming", "completed"] as const}>{(filter) => <button type="button" onClick={() => setMobileFilter(filter)} class={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${mobileFilter() === filter ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border bg-white text-wedding-ink"}`}>{filter === "all" ? `All (${props.state.ganttTimeline.rows.length})` : filter[0].toUpperCase() + filter.slice(1)}</button>}</For>
      </div>
      <Show when={visibleUndatedItems().length > 0}>
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3 phone:rounded-none phone:border-0 phone:bg-transparent phone:px-0">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs font-semibold text-wedding-ink/70">Done or no-date items</p>
            <button
              type="button"
              disabled={!props.onOpenSavedOutputs}
              class={ROW_ACTION_CLASS}
              onClick={() => props.onOpenSavedOutputs?.()}
            >
              All files
            </button>
          </div>
          <ul class="mt-2 space-y-2">
            <For each={visibleUndatedItems().slice(0, 4)}>
              {(item) => {
                const fileAction = fileActionFor(item.linkedArtifactId);
                return (
                  <li class="rounded-xl border border-slate-200 bg-white px-3 py-2 phone:rounded-none phone:border-0 phone:border-t phone:px-0">
                    <button
                      type="button"
                      class="min-h-11 w-full text-left text-sm font-semibold text-wedding-ink"
                      data-magic-action="open"
                      data-magic-icon={item.linkedArtifactId ? "source" : "task"}
                      data-magic-label={`Open ${item.title}`}
                      data-magic-id={`wedding:timeline:item:${item.id}:open`}
                      onClick={() => item.linkedArtifactId
                        ? openFileAction(item.linkedArtifactId, item.id)
                        : props.onSidebarAction(taskActionFor(item.id))}
                    >
                      {item.title}
                    </button>
                    <p class="text-xs text-wedding-ink/65">{item.categoryLabel}</p>
                    <div class="mt-1 flex flex-wrap items-end gap-2">
                      <Show when={props.state.planningTaskItems.find((task) => task.id === item.id)}>{(task) => <WeddingTaskCompletionButton task={task()} weddingPlanId={props.state.workspace.metadata.weddingPlanId} responseWorkspaceId={props.state.workspace.metadata.responseWorkspaceId} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} compact />}</Show>
                      <Show when={props.state.planningTaskItems.find((task) => task.id === item.id)}>{(task) => <WeddingTaskOwnerControl task={task()} weddingPlanId={props.state.workspace.metadata.weddingPlanId} responseWorkspaceId={props.state.workspace.metadata.responseWorkspaceId} people={props.state.helperContactNames} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} />}</Show>
                      <Show when={props.state.planningTaskItems.find((task) => task.id === item.id)}>{(task) => <label class="flex min-h-16 flex-col justify-end text-xs font-semibold text-wedding-ink/70">Deadline <input type="date" value={task().dueAt?.slice(0, 10) ?? ""} onChange={(event) => void saveTaskDate(task().id, task().title, event.currentTarget.value)} class="mt-1 min-h-11 rounded-lg border border-wedding-border bg-white px-2" /></label>}</Show>
                      <button
                        type="button"
                        class={ROW_ACTION_CLASS}
                        data-magic-action="open"
                        data-magic-icon="task"
                        data-magic-label={taskActionLabelFor(item.id, weddingTimelineStatusLabel(item.statusLabel))}
                        data-magic-id={`wedding:timeline:item:${item.id}:task`}
                        onClick={() => props.onSidebarAction(taskActionFor(item.id))}
                      >
                        {taskActionLabelFor(item.id, weddingTimelineStatusLabel(item.statusLabel))}
                      </button>
                      {fileAction ? (
                        <button
                          type="button"
                          disabled={!fileAction.enabled}
                          title={fileAction.title}
                          class={ROW_ACTION_CLASS}
                          data-magic-action="open"
                          data-magic-icon="source"
                          data-magic-label={fileAction.label}
                          data-magic-id={`wedding:timeline:item:${item.id}:source`}
                          onClick={() => openFileAction(item.linkedArtifactId, item.id)}
                        >
                          {fileAction.label}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={props.state.ganttTimeline.rows.length > 0} fallback={
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
          <p class="text-sm font-semibold text-wedding-ink">No dated timeline yet</p>
          <p class="mt-1 text-sm leading-6 text-wedding-ink/70">
            {props.state.ganttTimeline.blockerLabels[0] ?? "Add wedding tasks with dates, then they will appear here and in Calendar."}
          </p>
            <button
              type="button"
              class="mt-3 min-h-11 w-full rounded-lg border border-wedding-secondary bg-white px-4 text-sm font-semibold text-wedding-secondary transition hover:bg-wedding-slate sm:w-auto"
              data-magic-action="open"
              data-magic-icon="tasks"
              data-magic-label="Open Tasks"
              data-magic-id="wedding:timeline:empty:tasks"
              onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_tasks", props.state))}
            >
            Open Tasks
          </button>
        </div>
      }>
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3 phone:rounded-none phone:border-0 phone:bg-transparent phone:px-0">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-wedding-ink">Schedule chart</p>
              <p class="text-xs leading-5 text-wedding-ink/65">
                Each bar shows when the task starts and how long it lasts.
              </p>
            </div>
            <Show when={props.state.ganttTimeline.rows.length > 6}>
              <button
                type="button"
                class={ROW_ACTION_CLASS}
                data-magic-action="open"
                data-magic-icon="expand"
                data-magic-label={showAllRows() ? "Show less" : `Show all ${props.state.ganttTimeline.rows.length}`}
                data-magic-id="wedding:timeline:toggle-rows"
                onClick={() => setShowAllRows((value) => !value)}
              >
                {showAllRows() ? "Show less" : `Show all ${props.state.ganttTimeline.rows.length}`}
              </button>
            </Show>
          </div>
          <Show when={showGantt()} fallback={<div class="relative space-y-2 before:absolute before:bottom-3 before:left-3 before:top-3 before:w-px before:bg-wedding-border">
          <For each={visibleRows()}>
            {(row) => {
              const fileAction = fileActionFor(row.linkedArtifactId);
              return (
                <article
                  class="relative min-w-0 cursor-pointer pl-8 before:absolute before:left-1.5 before:top-2 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-wedding-primary before:bg-white sm:cursor-default"
                  onClick={(event) => openRowTaskOnMobile(event, row.id)}
                >
                  <div class="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <p class="min-w-0 break-words text-sm font-semibold text-wedding-ink">{row.title}</p>
                    <span class="shrink-0 text-xs font-semibold text-wedding-ink/75">{row.startLabel}</span>
                  </div>
                  <div class="h-3 rounded-full bg-wedding-slate ring-1 ring-inset ring-wedding-border">
                    <div
                      class="h-3 rounded-full"
                      style={{
                        "margin-left": `${row.offsetPercent}%`,
                        width: `${weddingTimelineBarWidthPercent({
                          widthPercent: row.widthPercent,
                          offsetPercent: row.offsetPercent,
                          durationDays: row.durationDays,
                        })}%`,
                        "background-color": row.color,
                      }}
                    />
                  </div>
                  <p class="mt-1 break-words text-xs leading-5 text-wedding-ink/65">
                    {row.categoryLabel} - {row.durationDays} day{row.durationDays === 1 ? "" : "s"} - {weddingTimelineStatusLabel(row.statusLabel)}
                  </p>
                  <p class="mt-1 text-xs font-semibold text-wedding-secondary sm:hidden">
                    {taskActionLabelFor(row.id, "Open task")}
                  </p>
                  <div class="mt-2 hidden flex-wrap items-end gap-1.5 sm:flex">
                    <Show when={props.state.planningTaskItems.find((task) => task.id === row.id)}>{(task) => <WeddingTaskCompletionButton task={task()} weddingPlanId={props.state.workspace.metadata.weddingPlanId} responseWorkspaceId={props.state.workspace.metadata.responseWorkspaceId} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} compact />}</Show>
                    <Show when={props.state.planningTaskItems.find((task) => task.id === row.id)}>{(task) => <WeddingTaskOwnerControl task={task()} weddingPlanId={props.state.workspace.metadata.weddingPlanId} responseWorkspaceId={props.state.workspace.metadata.responseWorkspaceId} people={props.state.helperContactNames} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} />}</Show>
                    <Show when={props.state.planningTaskItems.find((task) => task.id === row.id)}>{(task) => <label class="flex min-h-16 flex-col justify-end text-xs font-semibold text-wedding-ink/70">Deadline <input type="date" value={task().dueAt?.slice(0, 10) ?? ""} onChange={(event) => void saveTaskDate(task().id, task().title, event.currentTarget.value)} class="mt-1 min-h-11 rounded-lg border border-wedding-border bg-white px-2" /></label>}</Show>
                    <button
                      type="button"
                      class={ROW_ACTION_CLASS}
                      data-magic-action="open"
                      data-magic-icon="calendar"
                      data-magic-label={`View date for ${row.title}`}
                      data-magic-id={`wedding:timeline:row:${row.id}:date`}
                      onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_calendar", props.state, row.id))}
                    >
                      View date
                    </button>
                    <button
                      type="button"
                      class={ROW_ACTION_CLASS}
                      data-magic-action="open"
                      data-magic-icon="task"
                      data-magic-label={taskActionLabelFor(row.id, "View task")}
                      data-magic-id={`wedding:timeline:row:${row.id}:task`}
                      onClick={() => props.onSidebarAction(taskActionFor(row.id))}
                    >
                      {taskActionLabelFor(row.id, "View task")}
                    </button>
                    {fileAction ? (
                      <button
                        type="button"
                        disabled={!fileAction.enabled}
                        title={fileAction.title}
                        class={ROW_ACTION_CLASS}
                        data-magic-action="open"
                        data-magic-icon="source"
                        data-magic-label={fileAction.label}
                        data-magic-id={`wedding:timeline:row:${row.id}:source`}
                        onClick={() => openFileAction(row.linkedArtifactId, row.id)}
                      >
                        {fileAction.label}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            }}
          </For>
          </div>}>
            <div class="overflow-x-auto rounded-xl border border-wedding-border bg-white p-3">
              <div class="min-w-[860px]">
                <div class="grid grid-cols-[minmax(8rem,12rem)_1fr_minmax(11rem,14rem)] gap-x-3 border-b border-wedding-border pb-2 sm:grid-cols-[minmax(10rem,14rem)_1fr_minmax(11rem,14rem)]">
                  <p class="text-xs font-semibold uppercase tracking-wide text-wedding-ink/65">All tasks</p>
                  <div class="relative h-8">
                    <For each={ganttAxisTicks()}>
                      {(tick) => <span class="absolute top-0 text-xs font-semibold text-wedding-ink/70" style={{ left: `${tick.offsetPercent}%`, transform: "translateX(-50%)" }}>{tick.label}</span>}
                    </For>
                  </div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-wedding-ink/65">Owner</p>
                </div>
                <div class="mt-2 space-y-2">
                  <For each={filteredRows()}>
                    {(row) => (
                      <div class="grid grid-cols-[minmax(8rem,12rem)_1fr_minmax(11rem,14rem)] items-center gap-x-3 sm:grid-cols-[minmax(10rem,14rem)_1fr_minmax(11rem,14rem)]">
                        <button
                          type="button"
                          class="min-h-11 overflow-visible text-left text-xs font-semibold leading-4 text-wedding-ink"
                          title={`View ${row.title} on the wedding calendar`}
                          onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_calendar", props.state, row.id))}
                        >
                          {row.title}
                        </button>
                        <button
                          type="button"
                          class="relative h-11 rounded-lg bg-wedding-slate text-left"
                          title={`${row.title}: ${row.startLabel} to ${row.endLabel}`}
                          onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_calendar", props.state, row.id))}
                        >
                          <span class="absolute inset-y-3 rounded" style={{ "margin-left": `${row.offsetPercent}%`, width: `${weddingTimelineBarWidthPercent({ widthPercent: row.widthPercent, offsetPercent: row.offsetPercent, durationDays: row.durationDays })}%`, "background-color": row.color }} />
                        </button>
                        <Show when={props.state.planningTaskItems.find((task) => task.id === row.id)}>{(task) => <WeddingTaskOwnerControl task={task()} weddingPlanId={props.state.workspace.metadata.weddingPlanId} responseWorkspaceId={props.state.workspace.metadata.responseWorkspaceId} people={props.state.helperContactNames} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} />}</Show>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Show>
          <Show when={hiddenRowCount() > 0}>
            <p class="mt-2 text-xs leading-5 text-wedding-ink/60">
              {hiddenRowCount()} more timeline item{hiddenRowCount() === 1 ? "" : "s"} hidden to keep this view calm.
            </p>
          </Show>
        </div>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <For each={props.state.ganttTimeline.legend}>
            {(item) => (
              <span class="inline-flex max-w-full items-center gap-1 break-words rounded-lg border border-wedding-border bg-white px-2 py-1 text-xs text-wedding-ink/80">
                <span class="h-2 w-2 rounded-full" style={{ "background-color": item.color }} />
                {item.label}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
