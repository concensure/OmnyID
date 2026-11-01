import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { WeddingTaskCompletionButton } from "@/components/WeddingTaskCompletionButton";
import { WeddingTaskComposer } from "@/components/WeddingTaskComposer";
import { WeddingTaskOwnerControl } from "@/components/WeddingTaskOwnerControl";
import { WeddingTaskContextHelp } from "@/components/WeddingTaskContextHelp";
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import { weddingJourneyGroups, weddingJourneyStageId, WEDDING_JOURNEY_STAGES, type WeddingJourneyStageId } from "@/lib/weddingJourneyStageState";
import { loadWeddingTaskCompletion, WEDDING_TASK_COMPLETION_EVENT } from "@/lib/weddingTaskCompletionLocalState";
import { weddingTaskVisualStatus } from "@/lib/weddingTaskVisualStatusState";

export function WeddingPlanningJourneyStepper(props: {
  tasks: readonly WeddingPlanningTaskItem[];
  weddingPlanId: string;
  responseWorkspaceId: string;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
  people?: readonly string[] | null;
}) {
  const [revision, setRevision] = createSignal(0);
  const taskDone = (task: WeddingPlanningTaskItem) => {
    revision();
    return loadWeddingTaskCompletion({ taskId: task.id, weddingPlanId: props.weddingPlanId, responseWorkspaceId: props.responseWorkspaceId })?.completed
      ?? task.semanticTags?.some((tag) => tag.toLowerCase() === "wedding_task_status:done")
      ?? /done|complete/i.test(`${task.reviewStatus ?? ""} ${task.approvalState ?? ""}`);
  };
  const stageCounts = createMemo(() => WEDDING_JOURNEY_STAGES.map((stage) => {
    const tasks = props.tasks.filter((task) => weddingJourneyStageId(task) === stage.id);
    return { ...stage, tasks, done: tasks.filter(taskDone).length };
  }));
  const firstOpenStage = () => stageCounts().find((stage) => stage.tasks.some((task) => !taskDone(task)))?.id ?? "wedding_after";
  const [selected, setSelected] = createSignal<WeddingJourneyStageId>(firstOpenStage());
  const selectedStage = () => stageCounts().find((stage) => stage.id === selected()) ?? stageCounts()[0]!;
  const groups = createMemo(() => weddingJourneyGroups(props.tasks, selected()));
  onMount(() => {
    const listener = () => setRevision((value) => value + 1);
    window.addEventListener(WEDDING_TASK_COMPLETION_EVENT, listener);
    onCleanup(() => window.removeEventListener(WEDDING_TASK_COMPLETION_EVENT, listener));
  });

  return (
    <section class="mt-5 min-w-0" aria-label="Wedding planning journey">
      <div class="overflow-x-auto pb-1 [scrollbar-width:none]">
        <div class="relative grid min-w-[48rem] grid-cols-6">
          <div class="absolute left-[8.333%] right-[8.333%] top-3 h-0.5 bg-wedding-border" aria-hidden="true" />
          <For each={stageCounts()}>{(stage) => {
            const complete = () => stage.tasks.length > 0 && stage.done === stage.tasks.length;
            const current = () => stage.id === firstOpenStage();
            return (
              <button type="button" aria-pressed={selected() === stage.id} aria-label={`${stage.label}: ${stage.done} of ${stage.tasks.length} tasks done`} onClick={() => setSelected(stage.id)} class="relative z-10 flex min-h-16 min-w-0 flex-col items-center rounded-lg px-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary">
                <span class={`h-6 w-6 rounded-full border-2 ${complete() || current() || selected() === stage.id ? "border-wedding-primary bg-wedding-primary ring-4 ring-wedding-primary/10" : "border-wedding-border bg-wedding-card"}`} aria-hidden="true" />
                <span class={`mt-2 text-[11px] font-semibold leading-4 ${selected() === stage.id ? "text-wedding-primary" : "text-wedding-ink"}`}>{stage.label}</span>
              </button>
            );
          }}</For>
        </div>
      </div>
      <section class="mt-3 w-full rounded-xl border border-wedding-border bg-wedding-page p-4" aria-live="polite" aria-label={`${selectedStage().label} tasks`}>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-display text-lg font-semibold text-wedding-ink">{selectedStage().label}</h3>
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-wedding-ink/70">{selectedStage().done} of {selectedStage().tasks.length} done</span>
            <WeddingTaskComposer weddingPlanId={props.weddingPlanId} responseWorkspaceId={props.responseWorkspaceId} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} initialStage={selected()} people={props.people} compact />
          </div>
        </div>
        <Show when={groups().length > 0} fallback={<p class="mt-3 text-sm text-wedding-ink/65">No tasks are assigned to this stage yet.</p>}>
          <div class="mt-3 grid gap-3">
            <For each={groups()}>{(group) => (
              <section>
                <h4 class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-ink/70">{group.category}</h4>
                <ul class="mt-2 space-y-2">
                  <For each={group.tasks}>{(task) => (
                    <li class="relative grid min-w-0 gap-3 overflow-hidden rounded-lg border border-wedding-border bg-white py-3 pl-5 pr-3 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,15rem)_minmax(10rem,12rem)] sm:items-stretch">
                      <span class={`absolute inset-y-0 left-0 w-1 ${weddingTaskVisualStatus(task, taskDone(task)).railClass}`} aria-hidden="true" />
                      <div class="min-w-0"><span class={`inline-flex rounded-lg px-2 py-1 text-[11px] font-bold ${weddingTaskVisualStatus(task, taskDone(task)).badgeClass}`}>{weddingTaskVisualStatus(task, taskDone(task)).label}</span><div class="mt-2 flex min-w-0 items-start gap-2"><p class={`min-w-0 break-words text-sm font-semibold ${taskDone(task) ? "text-wedding-ink/55 line-through" : "text-wedding-ink"}`}>{task.title}</p><WeddingTaskContextHelp title={task.title} /></div><p class="mt-1 text-xs text-wedding-ink/60">{task.dueAt?.slice(0, 10) || task.dueLabel || "Deadline not set"}</p></div>
                      <WeddingTaskOwnerControl task={task} weddingPlanId={props.weddingPlanId} responseWorkspaceId={props.responseWorkspaceId} people={props.people} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} />
                      <div class="flex min-h-16 min-w-0 items-end justify-end"><WeddingTaskCompletionButton task={task} weddingPlanId={props.weddingPlanId} responseWorkspaceId={props.responseWorkspaceId} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} completed={taskDone(task)} compact /></div>
                    </li>
                  )}</For>
                </ul>
              </section>
            )}</For>
          </div>
        </Show>
      </section>
    </section>
  );
}
