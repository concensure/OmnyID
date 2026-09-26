// @locs-version: 2.0
import { For, Show, createMemo, createSignal } from "solid-js";
import type { WeddingTaskHierarchyStage } from "@/lib/weddingTaskHierarchyState";
import {
  loadWeddingTaskCompletion,
  saveWeddingTaskCompletion,
  type WeddingTaskCompletionRecord,
} from "@/lib/weddingTaskCompletionLocalState";
import { weddingTaskCompletionToAfpSendInput } from "@/lib/weddingTaskCompletionProjectionState";
import { buildWeddingTaskCompletionSyncState } from "@/lib/weddingTaskCompletionSyncState";
import {
  dispatchWeddingTaskCompletionSync,
  type WeddingTaskCompletionSaveFn,
  type WeddingTaskCompletionSyncDispatchReceipt,
} from "@/lib/weddingTaskCompletionSyncDispatchState";

export type WeddingTaskStageViewTask = {
  task_id: string;
  title: string;
  status: string;
  milestone?: string;
  wedding_plan_id?: string;
  response_workspace_id?: string;
  second_order_loop?: string;
  second_order_evidence_labels?: readonly string[];
  preparation_checklist?: boolean;
  preparation_checklist_item?: string;
  alert_offset_days?: readonly number[];
  schedule_basis?: string;
};

export function WeddingTaskStageView(props: {
  stages: WeddingTaskHierarchyStage<WeddingTaskStageViewTask>[];
  saveTaskStatus?: WeddingTaskCompletionSaveFn;
}) {
  const taskSyncKey = (input: { taskId: string; completed: boolean; savedAt: string }) =>
    `${input.taskId}:${input.completed ? "done" : "pending"}:${input.savedAt}`;
  const [completedOverrides, setCompletedOverrides] = createSignal<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = createSignal<"open" | "done">("open");
  const [syncRefreshKey, setSyncRefreshKey] = createSignal(0);
  const [syncing, setSyncing] = createSignal(false);
  const [syncingTaskIds, setSyncingTaskIds] = createSignal<Record<string, boolean>>({});
  const [syncedTaskIds, setSyncedTaskIds] = createSignal<Record<string, boolean>>({});
  const [syncReceipt, setSyncReceipt] = createSignal<WeddingTaskCompletionSyncDispatchReceipt | null>(null);
  const [taskNotice, setTaskNotice] = createSignal<string | null>(null);
  const syncState = createMemo(() => {
    syncRefreshKey();
    return buildWeddingTaskCompletionSyncState(props.stages, localStorage);
  });
  const pendingItems = createMemo(() =>
    syncState().pendingItems.filter((item) => syncedTaskIds()[taskSyncKey(item)] !== true));
  const hasPendingItems = createMemo(() => pendingItems().length > 0);
  const pendingSummaryLabel = createMemo(() => {
    const count = pendingItems().length;
    if (count === 0) return "No task status changes waiting to save";
    return `${count} task status update${count === 1 ? "" : "s"} ready to save`;
  });
  const itemCompleted = (task: WeddingTaskStageViewTask, fallback: boolean) =>
    completedOverrides()[task.task_id]
    ?? loadWeddingTaskCompletion({
      taskId: task.task_id,
      responseWorkspaceId: task.response_workspace_id,
      weddingPlanId: task.wedding_plan_id,
    }, localStorage)?.completed
    ?? fallback;
  const saveSingleTaskStatus = async (task: WeddingTaskStageViewTask, record: WeddingTaskCompletionRecord) => {
    const sendInput = weddingTaskCompletionToAfpSendInput({
      record,
      title: task.title,
      sourceMessageId: task.task_id,
    });
    if (!sendInput || !props.saveTaskStatus) {
      setTaskNotice("Task status is marked here. Connect account saving for the planner to advance the next step.");
      return;
    }
    setSyncingTaskIds((current) => ({ ...current, [task.task_id]: true }));
    try {
      const receipt = await dispatchWeddingTaskCompletionSync({
        items: [{
          taskId: task.task_id,
          title: task.title,
          completed: record.completed,
          statusLabel: record.completed ? "Ready to mark done" : "Ready to mark not done",
          actionLabel: record.completed ? "Mark done" : "Mark not done",
          detailLabel: `${record.completed ? "Done" : "Reopened"} locally at ${record.savedAt}`,
          savedAt: record.savedAt,
          sendInput,
        }],
        save: props.saveTaskStatus,
      });
      setSyncReceipt(receipt);
      setTaskNotice(receipt.savedCount === 1 ? "Task update sent. The planner can now advance the next related step." : receipt.summaryLabel);
      if (receipt.savedCount === 1) {
        setSyncedTaskIds((current) => ({
          ...current,
          [taskSyncKey({ taskId: task.task_id, completed: record.completed, savedAt: record.savedAt })]: true,
        }));
      }
    } finally {
      setSyncingTaskIds((current) => {
        const next = { ...current };
        delete next[task.task_id];
        return next;
      });
    }
  };
  const toggleTask = (task: WeddingTaskStageViewTask, fallback: boolean) => {
    const completed = !itemCompleted(task, fallback);
    setCompletedOverrides((current) => ({ ...current, [task.task_id]: completed }));
    const record = saveWeddingTaskCompletion({
      taskId: task.task_id,
      responseWorkspaceId: task.response_workspace_id,
      weddingPlanId: task.wedding_plan_id,
      completed,
    }, localStorage);
    setSyncRefreshKey((value) => value + 1);
    if (record) void saveSingleTaskStatus(task, record);
  };
  const savePendingSync = async () => {
    if (syncing() || !hasPendingItems()) return;
    const itemsToSave = pendingItems();
    setSyncing(true);
    try {
      const receipt = await dispatchWeddingTaskCompletionSync({
        items: itemsToSave,
        save: props.saveTaskStatus,
      });
      setSyncReceipt(receipt);
      if (receipt.savedCount > 0) {
        setSyncedTaskIds((current) => {
          const next = { ...current };
          for (const result of receipt.results) {
            const item = itemsToSave.find((pending) => pending.taskId === result.taskId);
            if (result.status === "saved" && item) next[taskSyncKey(item)] = true;
          }
          return next;
        });
      }
    } finally {
      setSyncing(false);
    }
  };
  const itemIsDone = (item: WeddingTaskHierarchyStage<WeddingTaskStageViewTask>["items"][number]) =>
    itemCompleted(item.task, item.completed);
  const filteredStages = createMemo(() => props.stages
    .map((stage) => ({
      ...stage,
      items: stage.items.filter((item) => activeTab() === "done" ? itemIsDone(item) : item.stageId !== "done" || !itemIsDone(item)),
    }))
    .filter((stage) => stage.items.length > 0));
  const openTaskCount = createMemo(() => props.stages.reduce((count, stage) =>
    count + stage.items.filter((item) => item.stageId !== "done" || !itemIsDone(item)).length, 0));
  const doneTaskCount = createMemo(() => props.stages.reduce((count, stage) =>
    count + stage.items.filter((item) => itemIsDone(item)).length, 0));
  const emptyStateLabel = createMemo(() => {
    if (activeTab() === "done") {
      return openTaskCount() > 0
        ? "No completed wedding tasks yet. Tick a task when it is finished and it will move here."
        : "No completed wedding tasks yet.";
    }
    if (doneTaskCount() > 0) {
      return "No open wedding tasks right now. You can review finished work instead.";
    }
    return "No open wedding tasks right now. Add or import planning details, then OmnyID will turn the next steps into tasks here.";
  });
  const emptyStateAction = createMemo<null | { label: string; tab: "open" | "done" }>(() => {
    if (activeTab() === "done" && openTaskCount() > 0) return { label: "View to-do tasks", tab: "open" };
    if (activeTab() === "open" && doneTaskCount() > 0) return { label: "View done tasks", tab: "done" };
    return null;
  });

  return (
    <section class="min-w-0 rounded-[24px] border border-rose-100/60 bg-[linear-gradient(135deg,rgba(255,241,242,0.72),rgba(255,251,235,0.68))] p-3 shadow-[0_18px_50px_-34px_rgba(190,18,60,0.45)] sm:rounded-3xl">
      <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="text-xs font-semibold text-rose-700/70">Wedding timeline</p>
          <p class="text-xs leading-5 text-rose-950/75">
            Anytime tasks stay first, dated tasks are grouped by preparation stage, and completed tasks can be unticked.
          </p>
          <p class="mt-1 text-xs leading-5 text-rose-950/60">
            Ticking a task saves the status and asks the planner to advance the next related step.
          </p>
        </div>
        <Show when={hasPendingItems()}>
          <div class="w-full rounded-2xl border border-rose-200/70 bg-white/70 px-3 py-2 text-left sm:max-w-sm">
            <p class="text-xs font-semibold text-rose-800/70">Ready to save</p>
            <p class="text-xs font-semibold text-rose-950">{pendingSummaryLabel()}</p>
            <div class="mt-1 space-y-1">
              <For each={pendingItems().slice(0, 3)}>
                {(item) => (
                  <p class="break-words text-xs leading-5 text-rose-950/70" title={item.detailLabel}>
                    {item.actionLabel}: {item.title}
                  </p>
                )}
              </For>
            </div>
            <button
              type="button"
              class="mt-2 w-full rounded-full bg-rose-800 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-900 disabled:cursor-not-allowed disabled:bg-rose-300 sm:w-auto sm:py-1"
              disabled={syncing()}
              onClick={() => void savePendingSync()}
            >
              {syncing() ? "Saving..." : "Save status updates"}
            </button>
            <Show when={syncReceipt()}>
              {(receipt) => (
                <p class="mt-1 text-xs leading-5 text-rose-950/65">
                  {receipt().summaryLabel}
                </p>
              )}
            </Show>
          </div>
        </Show>
      </div>
      <Show when={taskNotice()}>
        {(notice) => (
          <p class="mb-3 rounded-2xl border border-rose-100 bg-white/70 px-3 py-2 text-xs leading-5 text-rose-950/70">
            {notice()}
          </p>
        )}
      </Show>
      <div class="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          class={`rounded-full px-3 py-2 text-xs font-semibold transition ${activeTab() === "open" ? "bg-rose-800 text-white shadow-sm" : "border border-rose-200 bg-white/70 text-rose-950 hover:bg-white"}`}
          onClick={() => setActiveTab("open")}
        >
          To do ({openTaskCount()})
        </button>
        <button
          type="button"
          class={`rounded-full px-3 py-2 text-xs font-semibold transition ${activeTab() === "done" ? "bg-rose-800 text-white shadow-sm" : "border border-rose-200 bg-white/70 text-rose-950 hover:bg-white"}`}
          onClick={() => setActiveTab("done")}
        >
          Done ({doneTaskCount()})
        </button>
      </div>
      <div class="space-y-3">
        <Show
          when={filteredStages().length > 0}
          fallback={
            <div class="rounded-2xl border border-rose-100 bg-white/70 px-3 py-3 text-sm leading-6 text-rose-950/70">
              <p>{emptyStateLabel()}</p>
              <Show when={emptyStateAction()}>
                {(action) => (
                  <button
                    type="button"
                    class="mt-2 rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-950 transition hover:bg-rose-50"
                    onClick={() => setActiveTab(action().tab)}
                  >
                    {action().label}
                  </button>
                )}
              </Show>
            </div>
          }
        >
        <For each={filteredStages()}>
          {(stage) => (
            <div class={`min-w-0 rounded-2xl border px-3 py-2.5 ${stage.accentClass}`}>
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                  <h4 class="break-words text-sm font-semibold">{stage.label}</h4>
                  <p class="break-words text-xs opacity-75">{stage.timingLabel}</p>
                </div>
                <span class="max-w-full break-words rounded-full bg-white/55 px-2 py-1 text-xs font-semibold">
                  {stage.items.length} task{stage.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <div class="space-y-1.5">
                <For each={stage.items}>
                  {(item) => {
                    const completed = () => itemCompleted(item.task, item.completed);
                    return (
                      <label class={`flex min-w-0 items-start gap-2 rounded-xl border border-white/60 bg-white/65 px-3 py-2.5 transition ${completed() ? "opacity-55" : "shadow-sm"}`}>
                        <input
                          type="checkbox"
                          class="mt-1 h-4 w-4 rounded border-white/70 accent-rose-700"
                          checked={completed()}
                          aria-label={item.checkboxLabel}
                          onChange={() => toggleTask(item.task, item.completed)}
                        />
                        <span class="min-w-0 flex-1">
                          <span class={`block break-words text-xs font-semibold leading-5 ${completed() ? "line-through text-slate-500" : item.titleClass}`}>
                            {item.title}
                          </span>
                          <span class="mt-0.5 flex flex-wrap items-center gap-2 break-words text-xs opacity-75">
                            <span>{item.dueText}</span>
                            <Show when={item.task.milestone}>
                              <span>Stage: {item.task.milestone}</span>
                            </Show>
                          </span>
                          <Show when={item.loopLabel || item.evidenceLabels.length > 0 || item.preparationLabels.length > 0}>
                            <span class="mt-1 flex flex-wrap items-center gap-1.5">
                              <For each={item.preparationLabels}>
                                {(label) => (
                                  <span class="max-w-full break-words rounded-full border border-rose-200/70 bg-white/80 px-2 py-1 text-xs font-semibold text-rose-900">
                                    {label}
                                  </span>
                                )}
                              </For>
                              <Show when={item.loopLabel}>
                                {(label) => (
                                  <span class="max-w-full break-words rounded-full border border-rose-200/70 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-900">
                                    {label()}
                                  </span>
                                )}
                              </Show>
                              <For each={item.evidenceLabels}>
                                {(label) => (
                                  <span class="max-w-full break-words rounded-full border border-white/70 bg-white/70 px-2 py-1 text-xs text-slate-700">
                                    {label}
                                  </span>
                                )}
                              </For>
                            </span>
                          </Show>
                          <Show when={syncingTaskIds()[item.task.task_id]}>
                            <span class="mt-1 block text-xs font-semibold text-rose-800">
                              Sending update to the planner...
                            </span>
                          </Show>
                        </span>
                        <span class={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${completed() ? "bg-emerald-400" : item.statusClass}`} />
                      </label>
                    );
                  }}
                </For>
              </div>
            </div>
          )}
        </For>
        </Show>
      </div>
    </section>
  );
}
