// @locs-version: 1.0
import { For, Show, createMemo, createSignal } from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { safeHref, sendAfpMessage } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import {
  ExecutionExplanationBadge,
  ExecutionExplanationText,
} from "@/components/renderers/ExecutionExplanationDisplay";
import { WeddingTaskStageView } from "@/components/WeddingTaskStageView";
import {
  artifactLabel,
  asRecord,
  asString,
  humanizeTaskStatus,
  normalizeTaskStatus,
  readTaskExecutionExplanation,
  readToolResultMetadata,
  taskExecutionExplanationChip,
  taskExecutionExplanationText,
  type TaskExecutionExplanation,
  type ToolResultMetadata,
} from "@/lib/taskResultMeta";
import {
  buildWeddingTaskHierarchyState,
} from "@/lib/weddingTaskHierarchyState";
import {
  ledgerTaskUpdateSendInput,
  ledgerTaskWithOverrides,
  todoTaskStates,
  type LedgerTask,
  type TodoTaskState,
} from "@/lib/ledgerBoardTodoState";

type BoardView = "kanban" | "todo" | "timeline";

type TaskCardState = {
  task: LedgerTask;
  title: string;
  statusText: string;
  statusDotClass: string;
  containerClass: string;
  progress: number;
  showProgress: boolean;
  showBackgroundBadge: boolean;
  description: string | null;
  summary: string | null;
  errorText: string | null;
  explanationChip: ReturnType<typeof taskExecutionExplanationChip>;
  explanationText: string | null;
  showDescription: boolean;
  showSummary: boolean;
  showError: boolean;
  showAssignedTo: boolean;
  showDueDate: boolean;
  dueDateText: string | null;
  showMilestone: boolean;
  showRawStatus: boolean;
  rawStatusText: string | null;
  showToolLabel: boolean;
  toolLabel: string | null;
  showCapability: boolean;
  capabilityText: string | null;
  showBlockers: boolean;
  blockersText: string | null;
  showDependencies: boolean;
  dependenciesText: string | null;
  showChannel: boolean;
  channelText: string | null;
  showToolUrl: boolean;
  toolUrl: string | null;
  toolLabelText: string | null;
};

type KanbanColumnState = {
  id: string;
  label: string;
  headerClass: string;
  count: number;
  taskItems: TaskCardState[];
  showEmpty: boolean;
};

type TimelineTaskState = {
  task: LedgerTask;
  title: string;
  statusText: string;
  statusClass: string;
  statusDotClass: string;
  showProgress: boolean;
  progress: number;
};

type TimelineMilestoneState = {
  milestone: string;
  taskItems: TimelineTaskState[];
};

type StatsState = {
  total: number;
  done: number;
  blocked: number;
  active: number;
  percentComplete: number;
  showBlocked: boolean;
};

const VIEW_LABELS: Record<BoardView, string> = {
  kanban: "Board",
  todo: "List",
  timeline: "Timeline",
};

const COLUMN_CONFIG = [
  { id: "pending", label: "To do", headerClass: "text-on-surface-variant" },
  { id: "in_progress", label: "In progress", headerClass: "text-blue-400" },
  { id: "blocked", label: "Blocked", headerClass: "text-amber-400" },
  { id: "done", label: "Done", headerClass: "text-emerald-400" },
  { id: "cancelled", label: "Cancelled", headerClass: "text-slate-500" },
] as const;

const STATUS_DOT: Record<string, string> = {
  pending: "bg-yellow-400",
  in_progress: "bg-blue-500 animate-pulse",
  blocked: "bg-amber-400",
  done: "bg-emerald-400",
  cancelled: "bg-slate-400",
};

const PRIORITY_RING: Record<string, string> = {
  critical: "border-red-400/50",
  high: "border-amber-400/40",
  normal: "border-white/15",
  low: "border-white/8",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  done: "bg-emerald-500/15 text-emerald-300",
  blocked: "bg-amber-500/15 text-amber-300",
  in_progress: "bg-blue-500/15 text-blue-300",
};

const DONE_STATUSES = new Set(["done", "cancelled"]);

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
    : [];
}

function ledgerString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function ledgerNumber(value: unknown, fallback: number): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : NaN;
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function ledgerBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function mergeTasks(messages: AfpMessage[]): LedgerTask[] {
  const taskMap = new Map<string, LedgerTask>();

  for (const message of messages) {
    if (message.type !== "task") continue;
    const content = asRecord(decryptedDisplayContent(message));
    const taskId = ledgerString(content.task_id);
    if (!taskId) continue;

    const existing = taskMap.get(taskId) ?? ({} as Partial<LedgerTask>);
    const rawStatus = ledgerString(content.status, existing.raw_status ?? existing.status ?? "pending");
    const toolMeta = readToolResultMetadata(message);
    const executionExplanation = readTaskExecutionExplanation(message);
    const dependsOn = stringArray(content.depends_on);
    const blockers = stringArray(content.blockers);
    const metadata = asRecord(message.metadata);

    taskMap.set(taskId, {
      task_id: taskId,
      thread_id: message.thread_id ?? existing.thread_id ?? "",
      source_message_id: message.id ?? existing.source_message_id ?? "",
      title: ledgerString(content.title, existing.title ?? "Untitled"),
      description: ledgerString(content.description, existing.description ?? ""),
      status: normalizeTaskStatus(rawStatus),
      raw_status: rawStatus,
      priority: ledgerString(content.priority, existing.priority ?? "normal"),
      progress: ledgerNumber(content.progress, existing.progress ?? 0),
      milestone: ledgerString(content.milestone, existing.milestone ?? ""),
      assigned_to: ledgerString(content.assigned_to, existing.assigned_to ?? ""),
      due_date: ledgerString(content.due_date ?? content.due_at, existing.due_date ?? ""),
      due_label: ledgerString(content.due_label, existing.due_label ?? ""),
      wedding_task_kind: ledgerString(content.wedding_task_kind, existing.wedding_task_kind ?? ""),
      wedding_plan_id: ledgerString(content.wedding_plan_id, existing.wedding_plan_id ?? ""),
      response_workspace_id: ledgerString(content.response_workspace_id, existing.response_workspace_id ?? ""),
      second_order_loop: ledgerString(metadata.second_order_loop ?? content.second_order_loop, existing.second_order_loop ?? ""),
      second_order_evidence_labels: stringArray(metadata.second_order_evidence_labels).length > 0
        ? stringArray(metadata.second_order_evidence_labels)
        : stringArray(content.second_order_evidence_labels).length > 0
          ? stringArray(content.second_order_evidence_labels)
          : existing.second_order_evidence_labels ?? [],
      preparation_checklist: metadata.preparation_checklist === true
        || content.preparation_checklist === true
        || existing.preparation_checklist === true,
      preparation_checklist_item: ledgerString(metadata.preparation_checklist_item ?? content.preparation_checklist_item, existing.preparation_checklist_item ?? ""),
      alert_offset_days: numberArray(metadata.alert_offset_days).length > 0
        ? numberArray(metadata.alert_offset_days)
        : numberArray(content.alert_offset_days).length > 0
          ? numberArray(content.alert_offset_days)
          : existing.alert_offset_days ?? [],
      alert_dates: stringArray(metadata.alert_dates).length > 0
        ? stringArray(metadata.alert_dates)
        : stringArray(content.alert_dates).length > 0
          ? stringArray(content.alert_dates)
          : existing.alert_dates ?? [],
      schedule_basis: ledgerString(metadata.schedule_basis ?? content.schedule_basis, existing.schedule_basis ?? ""),
      depends_on: dependsOn.length > 0
        ? dependsOn
        : existing.depends_on ?? [],
      blockers: blockers.length > 0
        ? blockers
        : existing.blockers ?? [],
      background: ledgerBoolean(content.background, existing.background ?? false),
      summary: asString(content.summary) || asString(content.result) || existing.summary || "",
      error: asString(content.error) || existing.error || "",
      tool_meta: Object.values(toolMeta).some(Boolean) ? toolMeta : existing.tool_meta,
      execution_explanation: executionExplanation ?? existing.execution_explanation ?? null,
    });
  }

  return [...taskMap.values()];
}

function formatDueDate(dateString: string): string {
  if (!dateString) return "";
  try {
    const dueDate = new Date(dateString);
    if (isNaN(dueDate.getTime())) return dateString;
    const now = new Date();
    const diffDays = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < -1) return `Overdue by ${Math.abs(diffDays)}d`;
    if (diffDays < 0) return "Due yesterday";
    if (diffDays === 0) return "Due today";
    if (diffDays === 1) return "Due tomorrow";
    if (diffDays <= 7) return `Due in ${diffDays} days`;
    return `Due ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  } catch {
    return dateString;
  }
}

function taskCardState(task: LedgerTask): TaskCardState {
  const explanationChip = taskExecutionExplanationChip(task.raw_status ?? task.status, task.execution_explanation ?? null);
  const explanationText = taskExecutionExplanationText(task.execution_explanation ?? null);
  const description = task.description?.trim() ? task.description : null;
  const summary = task.summary?.trim() ? task.summary : null;
  const errorText = task.error?.trim() ? task.error : null;
  const dueDateText = task.due_date ? formatDueDate(task.due_date) : null;
  const blockersText = (task.blockers ?? []).length > 0 ? task.blockers!.join(", ") : null;
  const dependenciesText = (task.depends_on ?? []).length > 0 ? task.depends_on!.join(", ") : null;
  const rawStatusText =
    task.raw_status && task.raw_status !== task.status ? humanizeTaskStatus(task.raw_status) : null;
  const toolLabel =
    task.tool_meta?.connector_label || task.tool_meta?.tool_name || task.tool_meta?.tool_slug || null;
  const capabilityText = task.tool_meta?.capability ?? null;
  const channelText = task.tool_meta?.channel ?? null;
  const toolUrl = task.tool_meta?.url ? safeHref(task.tool_meta.url) : null;
  const toolLabelText = task.tool_meta ? artifactLabel(task.tool_meta) : null;

  return {
    task,
    title: task.title,
    statusText: humanizeTaskStatus(task.raw_status ?? task.status),
    statusDotClass: STATUS_DOT[task.status] ?? "bg-slate-400",
    containerClass: `rounded-xl border bg-white/6 px-3 py-2.5 cursor-pointer transition hover:bg-white/10 ${
      PRIORITY_RING[task.priority] ?? "border-white/15"
    }`,
    progress: task.progress,
    showProgress: task.progress > 0 && task.status !== "done",
    showBackgroundBadge: Boolean(task.background),
    description,
    summary,
    errorText,
    explanationChip,
    explanationText: explanationText || null,
    showDescription: Boolean(description),
    showSummary: Boolean(summary),
    showError: Boolean(errorText),
    showAssignedTo: Boolean(task.assigned_to),
    showDueDate: Boolean(dueDateText),
    dueDateText,
    showMilestone: Boolean(task.milestone),
    showRawStatus: Boolean(rawStatusText),
    rawStatusText,
    showToolLabel: Boolean(toolLabel),
    toolLabel,
    showCapability: Boolean(capabilityText),
    capabilityText,
    showBlockers: Boolean(blockersText),
    blockersText,
    showDependencies: Boolean(dependenciesText),
    dependenciesText,
    showChannel: Boolean(channelText),
    channelText,
    showToolUrl: Boolean(toolUrl && toolLabelText),
    toolUrl,
    toolLabelText,
  };
}

function statusBadgeClass(status: string) {
  return STATUS_BADGE_CLASS[status] ?? "bg-white/10 text-on-surface-variant";
}

function statsState(tasks: LedgerTask[]): StatsState {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const active = tasks.filter((task) => task.status === "in_progress").length;
  const percentComplete = total > 0 ? Math.round((done / total) * 100) : 0;
  return {
    total,
    done,
    blocked,
    active,
    percentComplete,
    showBlocked: blocked > 0,
  };
}

function kanbanColumnStates(tasks: LedgerTask[]): KanbanColumnState[] {
  return COLUMN_CONFIG.map((column) => {
    const taskItems = tasks
      .filter((task) => task.status === column.id)
      .map((task) => taskCardState(task));
    return {
      id: column.id,
      label: column.label,
      headerClass: column.headerClass,
      count: taskItems.length,
      taskItems,
      showEmpty: taskItems.length === 0,
    };
  });
}

function timelineTaskState(task: LedgerTask): TimelineTaskState {
  return {
    task,
    title: task.title,
    statusText: task.status.replace("_", " "),
    statusClass: statusBadgeClass(task.status),
    statusDotClass: STATUS_DOT[task.status] ?? "bg-slate-400",
    showProgress: task.progress > 0 && task.status !== "done",
    progress: task.progress,
  };
}

function timelineMilestoneStates(tasks: LedgerTask[]): TimelineMilestoneState[] {
  const groups = new Map<string, LedgerTask[]>();
  for (const task of tasks) {
    const milestone = task.milestone || "No milestone";
    const existing = groups.get(milestone) ?? [];
    existing.push(task);
    groups.set(milestone, existing);
  }

  return [...groups.entries()].map(([milestone, milestoneTasks]) => ({
    milestone,
    taskItems: milestoneTasks.map((task) => timelineTaskState(task)),
  }));
}

function TaskPill(props: { state: TaskCardState }) {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class={props.state.containerClass} onClick={() => setExpanded((value) => !value)}>
      <div class="flex items-start gap-2">
        <span class={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${props.state.statusDotClass}`} />
        <p class="flex-1 text-xs font-medium leading-4 text-on-surface">{props.state.title}</p>
        <Show when={props.state.showBackgroundBadge}>
          <span
            title="Background task - running without blocking the main flow"
            class="flex-shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] text-primary"
          >
            bg
          </span>
        </Show>
        <ExecutionExplanationBadge
          chip={props.state.explanationChip}
          class="flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em]"
        />
      </div>

      <Show when={props.state.showProgress}>
        <div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full bg-primary transition-all duration-500" style={`width:${props.state.progress}%`} />
        </div>
      </Show>

      <Show when={expanded()}>
        <div class="mt-2.5 space-y-1.5 border-t border-white/10 pt-2">
          <Show when={props.state.showDescription}>
            <p class="text-[11px] leading-4 text-on-surface-variant">{props.state.description}</p>
          </Show>
          <Show when={props.state.showSummary}>
            <p class="text-[11px] leading-4 text-on-surface-variant">{props.state.summary}</p>
          </Show>
          <Show when={props.state.showError}>
            <p class="text-[11px] leading-4 text-red-300">{props.state.errorText}</p>
          </Show>
          <ExecutionExplanationText
            text={props.state.explanationText}
            hiddenWhen={props.state.errorText}
            class="text-[11px] leading-4 text-on-surface-variant/80"
          />
          <div class="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-on-surface-variant/70">
            <Show when={props.state.showAssignedTo}>
              <span>Assigned: {props.state.task.assigned_to}</span>
            </Show>
            <Show when={props.state.showDueDate}>
              <span>{props.state.dueDateText}</span>
            </Show>
            <Show when={props.state.showMilestone}>
              <span>Milestone: {props.state.task.milestone}</span>
            </Show>
            <Show when={props.state.showRawStatus}>
              <span>Status: {props.state.rawStatusText}</span>
            </Show>
            <Show when={props.state.showToolLabel}>
              <span>Tool: {props.state.toolLabel}</span>
            </Show>
            <Show when={props.state.showCapability}>
              <span>Capability: {props.state.capabilityText}</span>
            </Show>
          </div>
          <Show when={props.state.showBlockers}>
            <p class="text-[11px] text-amber-300">Blockers: {props.state.blockersText}</p>
          </Show>
          <Show when={props.state.showDependencies}>
            <p class="text-[11px] text-on-surface-variant/60">Depends on: {props.state.dependenciesText}</p>
          </Show>
          <Show when={props.state.showChannel}>
            <p class="text-[11px] text-on-surface-variant/70">Channel: {props.state.channelText}</p>
          </Show>
          <Show when={props.state.showToolUrl}>
            <a
              href={props.state.toolUrl!}
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 transition hover:text-sky-200"
            >
              <span>{props.state.toolLabelText}</span>
              <span aria-hidden="true">-&gt;</span>
            </a>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function KanbanBoard(props: { columns: KanbanColumnState[] }) {
  return (
    <div class="overflow-x-auto">
      <div class="flex gap-3 pb-2" style="min-width: max-content">
        <For each={props.columns}>
          {(column) => (
            <div class="flex w-56 flex-shrink-0 flex-col gap-2">
              <div class="flex items-center justify-between px-1 py-0.5">
                <span class={`text-xs font-semibold ${column.headerClass}`}>{column.label}</span>
                <span class="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] text-on-surface-variant">
                  {column.count}
                </span>
              </div>
              <div class="min-h-[60px] space-y-1.5">
                <For each={column.taskItems}>{(task) => <TaskPill state={task} />}</For>
                <Show when={column.showEmpty}>
                  <div class="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[10px] text-on-surface-variant/40">
                    Empty
                  </div>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function TodoList(props: {
  tasks: TodoTaskState[];
  ownerDrafts: Record<string, string>;
  savingTaskIds: Record<string, boolean>;
  onSelectTask: (taskId: string, selected: boolean) => void;
  onToggleDone: (task: LedgerTask, done: boolean) => void;
  onOwnerDraftChange: (taskId: string, value: string) => void;
  onAssignOwner: (task: LedgerTask, assignedTo: string) => void;
}) {
  return (
    <div class="space-y-1.5">
      <For each={props.tasks}>
        {(task) => (
          <div class={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition ${task.selected ? "border-primary/45 bg-primary/10" : task.done ? "border-white/5 bg-white/[0.03] opacity-60" : "border-white/10 bg-white/5"}`}>
            <input
              type="checkbox"
              checked={task.done}
              disabled={props.savingTaskIds[task.task.task_id] === true}
              aria-label={task.done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
              onChange={(event) => props.onToggleDone(task.task, event.currentTarget.checked)}
              class="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/10 text-primary focus:ring-primary/40"
            />
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={task.selected}
                  onClick={() => props.onSelectTask(task.task.task_id, !task.selected)}
                  class={`min-w-0 rounded-lg px-1.5 py-0.5 text-left text-sm leading-5 transition ${task.selected ? "bg-primary/15 text-on-surface" : task.titleClass}`}
                >
                  {task.title}
                </button>
                <span class={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${task.statusDotClass}`} />
                <Show when={task.showBackgroundBadge}>
                  <span
                    title="Background task - running without blocking the main flow"
                    class="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] text-primary"
                  >
                    bg
                  </span>
                </Show>
              </div>
              <div class="flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant">
                <Show when={task.showAssignedTo} fallback={<span>Owner: Unassigned</span>}>
                  <span>Owner: {task.assignedToText}</span>
                </Show>
                <Show when={task.showDueDate}>
                  <span>{task.dueDateText}</span>
                </Show>
                <Show when={props.savingTaskIds[task.task.task_id] === true}>
                  <span class="text-primary">Saving...</span>
                </Show>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <label class="sr-only" for={`task-owner-${task.task.task_id}`}>Assign owner for {task.title}</label>
                <input
                  id={`task-owner-${task.task.task_id}`}
                  value={props.ownerDrafts[task.task.task_id] ?? task.assignedToText ?? ""}
                  placeholder="Assign owner"
                  disabled={props.savingTaskIds[task.task.task_id] === true}
                  onInput={(event) => props.onOwnerDraftChange(task.task.task_id, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      props.onAssignOwner(task.task, event.currentTarget.value);
                    }
                  }}
                  onBlur={(event) => props.onAssignOwner(task.task, event.currentTarget.value)}
                  class="min-w-40 rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary/60 focus:outline-none"
                />
              </div>
              <Show when={task.showProgress}>
                <div class="flex items-center gap-2">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div class="h-full rounded-full bg-primary" style={`width:${task.progress}%`} />
                  </div>
                  <span class="text-[10px] text-on-surface-variant">{task.progress}%</span>
                </div>
              </Show>
              <Show when={task.showBlockers}>
                <p class="text-[11px] text-amber-300">Warning: {task.blockersText}</p>
              </Show>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function TimelineView(props: { milestones: TimelineMilestoneState[] }) {
  const onlyNoMilestone = () =>
    props.milestones.length === 1 && props.milestones[0].milestone === "No milestone";
  const flatTasks = () => (onlyNoMilestone() ? props.milestones[0].taskItems : []);

  return (
    <div class="space-y-6">
      <Show
        when={!onlyNoMilestone()}
        fallback={
          <div class="space-y-2">
            <For each={flatTasks()}>
              {(task) => (
                <div class="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <span class={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${task.statusDotClass}`} />
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-medium text-on-surface">{task.title}</p>
                    <Show when={task.showProgress}>
                      <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div class="h-full rounded-full bg-primary" style={`width:${task.progress}%`} />
                      </div>
                    </Show>
                  </div>
                  <span class={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${task.statusClass}`}>
                    {task.statusText}
                  </span>
                </div>
              )}
            </For>
          </div>
        }
      >
        <For each={props.milestones}>
          {(milestone) => (
            <div class="relative pl-5">
              <div class="absolute bottom-0 left-1.5 top-2 w-px bg-white/10" />
              <div class="absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-surface-container" />
              <p class="mb-3 text-xs font-semibold text-primary">{milestone.milestone}</p>
              <div class="space-y-2">
                <For each={milestone.taskItems}>
                  {(task) => (
                    <div class="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <span class={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${task.statusDotClass}`} />
                      <div class="min-w-0 flex-1">
                        <p class="text-xs font-medium text-on-surface">{task.title}</p>
                        <Show when={task.showProgress}>
                          <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                            <div class="h-full rounded-full bg-primary" style={`width:${task.progress}%`} />
                          </div>
                        </Show>
                      </div>
                      <span class={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${task.statusClass}`}>
                        {task.statusText}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

function StatsBar(props: { stats: StatsState; onBlockedClick: () => void }) {
  return (
    <div class="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
      <div class="flex items-center gap-1.5 text-xs">
        <span class="h-2 w-2 rounded-full bg-emerald-400" />
        <span class="text-on-surface-variant">{props.stats.done} done</span>
      </div>
      <div class="flex items-center gap-1.5 text-xs">
        <span class="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
        <span class="text-on-surface-variant">{props.stats.active} active</span>
      </div>
      <Show when={props.stats.showBlocked}>
        <button
          type="button"
          class="flex items-center gap-1.5 text-xs transition hover:opacity-80"
          onClick={props.onBlockedClick}
        >
          <span class="h-2 w-2 rounded-full bg-amber-400" />
          <span class="text-amber-300">{props.stats.blocked} blocked</span>
        </button>
      </Show>
      <div class="ml-auto flex items-center gap-2">
        <div class="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full bg-emerald-400 transition-all duration-500" style={`width:${props.stats.percentComplete}%`} />
        </div>
        <span class="text-xs font-medium text-on-surface" title={`${props.stats.done} of ${props.stats.total} tasks done`}>
          {props.stats.percentComplete}% complete
        </span>
      </div>
    </div>
  );
}

export function LedgerBoardRenderer(props: {
  message: AfpMessage;
  tasks?: AfpMessage[];
}) {
  const allMessages = createMemo(() => [props.message, ...(props.tasks ?? [])]);
  const tasks = createMemo(() => mergeTasks(allMessages()));
  const [selectedTaskIds, setSelectedTaskIds] = createSignal<Record<string, boolean>>({});
  const [localStatusOverrides, setLocalStatusOverrides] = createSignal<Record<string, string>>({});
  const [localOwnerOverrides, setLocalOwnerOverrides] = createSignal<Record<string, string>>({});
  const [ownerDrafts, setOwnerDrafts] = createSignal<Record<string, string>>({});
  const [savingTaskIds, setSavingTaskIds] = createSignal<Record<string, boolean>>({});
  const displayedTasks = createMemo(() => tasks().map((task) => ledgerTaskWithOverrides(task, {
    status: localStatusOverrides()[task.task_id] ?? null,
    assignedTo: localOwnerOverrides()[task.task_id] ?? null,
  })));
  const content = createMemo(() => afpRecord(decryptedDisplayContent(props.message)));
  const defaultView = createMemo<BoardView>(() => {
    const candidate = content().default_view as BoardView;
    return (["kanban", "todo", "timeline"] as BoardView[]).includes(candidate) ? candidate : "kanban";
  });

  const [activeView, setActiveView] = createSignal<BoardView>(defaultView());

  const boardState = createMemo(() => {
    const taskItems = displayedTasks();
    const title = ledgerString(content().title, "Task board");
    const description = ledgerString(content().description);
    const stats = statsState(taskItems);
    const kanbanColumns = kanbanColumnStates(taskItems);
    const selectedIds = new Set(Object.entries(selectedTaskIds())
      .filter(([, selected]) => selected)
      .map(([taskId]) => taskId));
    const todoItems = todoTaskStates(taskItems, selectedIds);
    const timelineMilestones = timelineMilestoneStates(taskItems);
    const weddingHierarchy = buildWeddingTaskHierarchyState(taskItems);

    return {
      title,
      description,
      showDescription: description.length > 0,
      hasTasks: taskItems.length > 0,
      taskItems,
      stats,
      kanbanColumns,
      todoItems,
      timelineMilestones,
      weddingHierarchy,
      showWeddingHierarchy: weddingHierarchy.hasWeddingTasks,
      showKanban: activeView() === "kanban",
      showTodo: activeView() === "todo",
      showTimeline: activeView() === "timeline",
      activeView: activeView(),
      viewItems: (["kanban", "todo", "timeline"] as BoardView[]).map((view) => ({
        view,
        label: VIEW_LABELS[view],
        active: activeView() === view,
      })),
    };
  });

  function handleBlockedClick() {
    setActiveView("todo");
  }

  async function saveTaskUpdate(task: LedgerTask, update: { assignedTo?: string | null; status?: string | null }) {
    const sendInput = ledgerTaskUpdateSendInput(task, update);
    if (!sendInput) return;
    setSavingTaskIds((current) => ({ ...current, [task.task_id]: true }));
    try {
      await sendAfpMessage(sendInput);
    } catch {
      // The optimistic row remains usable; the source AFP thread can be retried by changing it again.
    } finally {
      setSavingTaskIds((current) => {
        const next = { ...current };
        delete next[task.task_id];
        return next;
      });
    }
  }

  function toggleTodoDone(task: LedgerTask, done: boolean) {
    const nextStatus = done ? "done" : "pending";
    setLocalStatusOverrides((current) => ({ ...current, [task.task_id]: nextStatus }));
    void saveTaskUpdate(task, { status: nextStatus });
  }

  function assignTodoOwner(task: LedgerTask, value: string) {
    const assignedTo = value.trim();
    if ((task.assigned_to ?? "") === assignedTo && localOwnerOverrides()[task.task_id] === undefined) return;
    setLocalOwnerOverrides((current) => ({ ...current, [task.task_id]: assignedTo }));
    setOwnerDrafts((current) => ({ ...current, [task.task_id]: assignedTo }));
    void saveTaskUpdate(task, { assignedTo });
  }

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-on-surface">{boardState().title}</h3>
          <Show when={boardState().showDescription}>
            <p class="mt-0.5 text-xs text-on-surface-variant">{boardState().description}</p>
          </Show>
        </div>

        <div class="flex overflow-hidden rounded-full border border-white/20 text-xs">
          <For each={boardState().viewItems}>
            {(item) => (
              <button
                type="button"
                class={`px-3 py-1 transition ${item.active ? "bg-white/20 text-on-surface" : "text-on-surface-variant hover:bg-white/10"}`}
                onClick={() => setActiveView(item.view)}
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={boardState().hasTasks}>
        <StatsBar stats={boardState().stats} onBlockedClick={handleBlockedClick} />
      </Show>

      <Show when={boardState().showWeddingHierarchy}>
        <WeddingTaskStageView
          stages={boardState().weddingHierarchy.stages}
          saveTaskStatus={sendAfpMessage}
        />
      </Show>

      <Show
        when={boardState().hasTasks}
        fallback={
          <div class="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-on-surface-variant/60">
            No tasks yet - ask your agent to plan the work and it will appear here.
          </div>
        }
      >
        <Show when={boardState().showKanban}>
          <KanbanBoard columns={boardState().kanbanColumns} />
        </Show>
        <Show when={boardState().showTodo}>
          <TodoList
            tasks={boardState().todoItems}
            ownerDrafts={ownerDrafts()}
            savingTaskIds={savingTaskIds()}
            onSelectTask={(taskId, selected) => setSelectedTaskIds((current) => ({ ...current, [taskId]: selected }))}
            onToggleDone={toggleTodoDone}
            onOwnerDraftChange={(taskId, value) => setOwnerDrafts((current) => ({ ...current, [taskId]: value }))}
            onAssignOwner={assignTodoOwner}
          />
        </Show>
        <Show when={boardState().showTimeline}>
          <TimelineView milestones={boardState().timelineMilestones} />
        </Show>
      </Show>
    </div>
  );
}
