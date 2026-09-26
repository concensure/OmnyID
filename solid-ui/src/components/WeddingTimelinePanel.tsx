// @locs-version: 2.1
import { For, Show } from "solid-js";

import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
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

export function WeddingTimelinePanel(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenSavedOutputs?: () => void;
}) {
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

  return (
    <div class="min-w-0 rounded-[24px] border border-indigo-100/80 bg-indigo-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="text-base font-semibold text-indigo-950">Timeline</p>
            <WeddingInfoTip title="Timeline tip" tone="indigo">
              Put legal deadlines, payment due dates, and vendor lock-in dates on the calendar. If a date is still uncertain, keep it as a task until it is confirmed.
            </WeddingInfoTip>
          </div>
          <p class="mt-1 text-sm leading-6 text-indigo-900/70">
            Open dated items in Calendar, or review all wedding tasks in Tasks.
          </p>
        </div>
        <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-indigo-900">
          {props.state.ganttTimeline.rows.length} dated item{props.state.ganttTimeline.rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={props.state.ganttTimeline.rows.length === 0}
          class="rounded-full border border-indigo-200 bg-white/85 px-3 py-2 text-xs font-semibold text-indigo-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:py-1.5"
          onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_calendar", props.state))}
        >
          Open wedding calendar
        </button>
        <button
          type="button"
          class="rounded-full border border-indigo-200 bg-indigo-100/80 px-3 py-2 text-xs font-semibold text-indigo-950 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 sm:py-1.5"
          onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_tasks", props.state))}
        >
          Open wedding tasks
        </button>
      </div>
      <Show when={props.state.ganttTimeline.rows.length === 0}>
        <p class="mt-2 text-xs leading-5 text-indigo-950/65">
          Add a task with a date before opening the calendar view.
        </p>
      </Show>
      <Show when={props.state.ganttTimeline.undatedItems.length > 0}>
        <div class="mt-3 rounded-2xl border border-indigo-100 bg-white/75 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs font-semibold text-indigo-950/70">Done or no-date items</p>
            <button
              type="button"
              disabled={!props.onOpenSavedOutputs}
              class="rounded-full border border-indigo-100 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-indigo-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => props.onOpenSavedOutputs?.()}
            >
              All files
            </button>
          </div>
          <ul class="mt-2 space-y-2">
            <For each={props.state.ganttTimeline.undatedItems.slice(0, 4)}>
              {(item) => {
                const fileAction = fileActionFor(item.linkedArtifactId);
                return (
                  <li class="rounded-xl border border-indigo-100 bg-indigo-50/60 px-2.5 py-2 text-xs leading-5 text-indigo-950/70">
                    <button
                      type="button"
                      class="text-left font-semibold underline decoration-indigo-300 underline-offset-2"
                      onClick={() => item.linkedArtifactId
                        ? openFileAction(item.linkedArtifactId, item.id)
                        : props.onSidebarAction(taskActionFor(item.id))}
                    >
                      {item.title}
                    </button>
                    <span> - {item.categoryLabel} - </span>
                    <button
                      type="button"
                      class="font-semibold underline decoration-indigo-300 underline-offset-2"
                      onClick={() => props.onSidebarAction(taskActionFor(item.id))}
                    >
                      {taskActionLabelFor(item.id, weddingTimelineStatusLabel(item.statusLabel))}
                    </button>
                    {fileAction ? (
                      <button
                        type="button"
                        disabled={!fileAction.enabled}
                        title={fileAction.title}
                        class="ml-2 rounded-full border border-indigo-100 bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-indigo-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => openFileAction(item.linkedArtifactId, item.id)}
                      >
                        {fileAction.label}
                      </button>
                    ) : null}
                  </li>
                );
              }}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={props.state.ganttTimeline.rows.length > 0} fallback={
        <div class="mt-3 rounded-2xl border border-indigo-100 bg-white/70 px-3 py-3">
          <p class="text-sm font-semibold text-indigo-950">No dated timeline yet</p>
          <p class="mt-1 text-sm leading-6 text-indigo-950/70">
            {props.state.ganttTimeline.blockerLabels[0] ?? "Add wedding tasks with dates, then they will appear here and in Calendar."}
          </p>
          <button
            type="button"
            class="mt-3 rounded-full border border-indigo-200 bg-indigo-100/80 px-3 py-2 text-xs font-semibold text-indigo-950 transition hover:bg-indigo-50 sm:py-1.5"
            onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_tasks", props.state))}
          >
            Open Tasks
          </button>
        </div>
      }>
        <div class="mt-3 space-y-2">
          <For each={props.state.ganttTimeline.rows.slice(0, 6)}>
            {(row) => {
              const fileAction = fileActionFor(row.linkedArtifactId);
              return (
                <article class="min-w-0">
                  <div class="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <p class="min-w-0 break-words text-sm font-semibold text-indigo-950">{row.title}</p>
                    <button
                      type="button"
                      class="shrink-0 text-left text-xs font-semibold text-indigo-900/75 underline decoration-indigo-300 underline-offset-2"
                      title="Open this date in the wedding calendar"
                      onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_calendar", props.state, row.id))}
                    >
                      {row.startLabel}
                    </button>
                  </div>
                  <div class="h-3 rounded-full bg-white/80">
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
                  <p class="mt-1 break-words text-xs leading-5 text-indigo-950/65">
                    {row.categoryLabel} - {row.durationDays} day{row.durationDays === 1 ? "" : "s"} - {weddingTimelineStatusLabel(row.statusLabel)}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      class="rounded-full border border-indigo-100 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-indigo-950 transition hover:bg-white"
                      onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_calendar", props.state, row.id))}
                    >
                      View date
                    </button>
                    <button
                      type="button"
                      class="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-950 transition hover:bg-white"
                      onClick={() => props.onSidebarAction(taskActionFor(row.id))}
                    >
                      {taskActionLabelFor(row.id, "View task")}
                    </button>
                    {fileAction ? (
                      <button
                        type="button"
                        disabled={!fileAction.enabled}
                        title={fileAction.title}
                        class="rounded-full border border-indigo-100 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-indigo-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
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
        </div>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <For each={props.state.ganttTimeline.legend}>
            {(item) => (
              <span class="inline-flex max-w-full items-center gap-1 break-words rounded-full border border-indigo-100 bg-white/75 px-2 py-1 text-xs text-indigo-900/80">
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
