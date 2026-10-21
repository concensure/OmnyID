import { For, Show, createMemo, createSignal } from "solid-js";
import type { DashboardBootstrap } from "@/lib/api";
import { dashboardBootstrapMessages } from "@/lib/dashboardBootstrapState";
import {
  buildActiveTaskDecisionViewState,
  type ActiveTaskDecisionItem,
  type ActiveTaskLifecycle,
} from "@/lib/activeTaskDecisionViewState";
import type { ViewName } from "@/lib/viewNames";

type FilterId = "all" | ActiveTaskLifecycle;

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In progress" },
  { id: "decided", label: "Decided" },
  { id: "skipped", label: "Skipped" },
  { id: "blocked", label: "Blocked" },
  { id: "completed", label: "Completed" },
];

const STATUS_CLASS: Record<ActiveTaskLifecycle, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-900",
  in_progress: "border-sky-200 bg-sky-50 text-sky-900",
  decided: "border-emerald-200 bg-emerald-50 text-emerald-900",
  skipped: "border-slate-200 bg-slate-100 text-slate-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-900",
  completed: "border-teal-200 bg-teal-50 text-teal-900",
};

function TaskDecisionDetails(props: { task: ActiveTaskDecisionItem }) {
  return (
    <div class="border-t border-wedding-border px-4 py-4">
      <Show when={props.task.decisions.length > 0} fallback={
        <p class="text-sm leading-6 text-wedding-ink/65">No decision options are attached to this task yet.</p>
      }>
        <ol class="space-y-4">
          <For each={props.task.decisions}>{(decision, index) => (
            <li class="rounded-[10px] border border-wedding-border bg-wedding-page p-3">
              <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-semibold uppercase tracking-wide text-wedding-ink/70">Decision {index() + 1}</p>
                  <h3 class="mt-1 break-words text-sm font-semibold text-wedding-ink">{decision.title}</h3>
                </div>
                <span class={`rounded-md border px-2 py-1 text-xs font-semibold ${STATUS_CLASS[decision.status]}`}>{decision.statusLabel}</span>
              </div>
              <Show when={decision.options.length > 0} fallback={
                <p class="mt-3 text-sm text-wedding-ink/65">Options have not been added to this decision yet.</p>
              }>
                <ul class="mt-3 space-y-2" aria-label={`Options for ${decision.title}`}>
                  <For each={decision.options}>{(option) => (
                    <li class={`rounded-lg border px-3 py-2 ${option.chosen ? "border-wedding-primary bg-wedding-primary/10" : "border-wedding-border bg-white"}`}>
                      <div class="flex min-w-0 items-start gap-2">
                        <span class={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${option.chosen ? "bg-wedding-primary" : "border border-wedding-ink/35 bg-white"}`} aria-hidden="true" />
                        <div class="min-w-0">
                          <p class="break-words text-sm font-medium text-wedding-ink">{option.label}</p>
                          <Show when={option.detail}>{(detail) => <p class="mt-0.5 break-words text-xs leading-5 text-wedding-ink/65">{detail()}</p>}</Show>
                          <Show when={option.chosen}><p class="mt-1 text-xs font-semibold text-wedding-primary">Chosen option</p></Show>
                        </div>
                      </div>
                    </li>
                  )}</For>
                </ul>
              </Show>
              <Show when={decision.chosenOptionLabel && !decision.options.some((option) => option.chosen)}>
                <p class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  Chosen: {decision.chosenOptionLabel}
                </p>
              </Show>
            </li>
          )}</For>
        </ol>
      </Show>
    </div>
  );
}

export function ActiveTasksDecisionView(props: {
  bootstrap: DashboardBootstrap | null;
  onAddTask: () => void;
  onOpenThread: (threadId: string, messageId?: string | null) => void;
  onNavigate: (view: ViewName) => void;
}) {
  const [filter, setFilter] = createSignal<FilterId>("all");
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({});
  const state = createMemo(() => buildActiveTaskDecisionViewState(dashboardBootstrapMessages(props.bootstrap)));
  const items = createMemo(() => state().items.filter((item) => filter() === "all" || item.status === filter()));
  const draftCount = () => props.bootstrap?.task_runtime_summary?.active_draft_task_count ?? 0;

  return (
    <section class="animate-fade-in space-y-4">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-wedding-primary">Tasks</p>
          <h2 class="mt-1 break-words font-display text-2xl font-semibold text-wedding-ink">Decisions and to-dos</h2>
          <p class="mt-1 max-w-2xl text-sm leading-6 text-wedding-ink/70">See what is pending, underway, decided, skipped or complete, with the options that informed each decision.</p>
        </div>
        <button type="button" onClick={props.onAddTask} class="min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-wedding-primary/90">Add task in calendar</button>
      </header>

      <Show when={draftCount() > 0}>
        <p class="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{draftCount()} draft task{draftCount() === 1 ? " is" : "s are"} still being prepared.</p>
      </Show>

      <div class="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Task status">
        <For each={FILTERS}>{(item) => (
          <button
            type="button"
            role="tab"
            aria-selected={filter() === item.id}
            class={`min-h-11 shrink-0 rounded-lg border px-3 text-sm font-semibold transition ${filter() === item.id ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border bg-white text-wedding-ink hover:bg-wedding-slate"}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label} ({state().counts[item.id]})
          </button>
        )}</For>
      </div>

      <Show when={items().length > 0} fallback={
        <div class="rounded-[12px] border border-dashed border-wedding-border bg-wedding-card p-8 text-center">
          <p class="text-sm font-semibold text-wedding-ink">No {filter() === "all" ? "tasks" : FILTERS.find((item) => item.id === filter())?.label.toLowerCase()} here yet.</p>
          <p class="mt-1 text-sm text-wedding-ink/65">New tasks and decisions will appear here automatically.</p>
        </div>
      }>
        <div class="space-y-3">
          <For each={items()}>{(task) => {
            const isOpen = () => expanded()[task.id] === true;
            return (
              <article class="overflow-hidden rounded-[12px] border border-wedding-border bg-wedding-card shadow-sm">
                <button
                  type="button"
                  class="flex min-h-16 w-full min-w-0 items-start gap-3 px-4 py-3 text-left transition hover:bg-wedding-slate/60"
                  aria-expanded={isOpen()}
                  onClick={() => setExpanded((current) => ({ ...current, [task.id]: !current[task.id] }))}
                >
                  <span class={`mt-0.5 shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${STATUS_CLASS[task.status]}`}>{task.statusLabel}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block break-words text-sm font-semibold text-wedding-ink">{task.title}</span>
                    <Show when={task.description}>{(description) => <span class="mt-1 block break-words text-xs leading-5 text-wedding-ink/65">{description()}</span>}</Show>
                    <span class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-wedding-ink/70">
                      <Show when={task.dueLabel}>{(due) => <span>Due {due()}</span>}</Show>
                      <span>{task.decisions.length} decision{task.decisions.length === 1 ? "" : "s"}</span>
                    </span>
                  </span>
                  <span class="mt-2 shrink-0 text-wedding-primary" aria-hidden="true">{isOpen() ? "−" : "+"}</span>
                </button>
                <Show when={isOpen()}>
                  <TaskDecisionDetails task={task} />
                  <Show when={task.threadId}>
                    <div class="border-t border-wedding-border px-4 py-3">
                      <button type="button" class="min-h-11 rounded-lg border border-wedding-primary px-3 text-sm font-semibold text-wedding-primary hover:bg-wedding-primary/5" onClick={() => props.onOpenThread(task.threadId!, task.sourceMessageId)}>Open task details</button>
                    </div>
                  </Show>
                </Show>
              </article>
            );
          }}</For>
        </div>
      </Show>
    </section>
  );
}
