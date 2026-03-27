import { Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";

const PRIORITY_STYLES: Record<string, string> = {
  high:   "bg-red-500/15 text-red-600 border-red-500/30",
  normal: "bg-primary/15 text-primary border-primary/30",
  low:    "bg-slate-400/15 text-slate-500 border-slate-400/30",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  shopping: "Shopping",
  todo:     "To-do",
  reminder: "Reminder",
  note:     "Note",
  general:  "Task",
};

const STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  pending:     { dot: "bg-yellow-400", label: "Pending" },
  in_progress: { dot: "bg-blue-500 animate-pulse", label: "In progress" },
  completed:   { dot: "bg-green-500", label: "Done" },
  cancelled:   { dot: "bg-slate-400", label: "Cancelled" },
};

export function TaskCardRenderer(props: {
  message: AfpMessage;
  view?: AfpView;
}) {
  const vc = () => props.view?.content ?? {};
  const mc = () => props.message.content;

  const title       = () => (vc()["title"]       ?? mc()["title"]       ?? "Task") as string;
  const description = () => (vc()["description"] ?? mc()["description"] ?? "") as string;
  const priority    = () => (vc()["priority"]    ?? mc()["priority"]    ?? "normal") as string;
  const taskType    = () => (vc()["task_type"]   ?? mc()["task_type"]   ?? "general") as string;
  const status      = () => (vc()["status"]      ?? mc()["status"]      ?? "pending") as string;

  const priorityStyle = () => PRIORITY_STYLES[priority()] ?? PRIORITY_STYLES.normal;
  const statusInfo    = () => STATUS_STYLES[status()] ?? STATUS_STYLES.pending;
  const typeLabel     = () => TASK_TYPE_LABELS[taskType()] ?? "Task";

  return (
    <div class="space-y-3">
      {/* Header row */}
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2">
          {/* Status dot */}
          <span class={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${statusInfo().dot}`} />
          <h3 class="text-sm font-semibold leading-5 text-on-surface">{title()}</h3>
        </div>

        {/* Badges */}
        <div class="flex flex-shrink-0 items-center gap-1.5">
          <span class="rounded-full bg-white/30 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant">
            {typeLabel()}
          </span>
          <span class={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] ${priorityStyle()}`}>
            {priority()}
          </span>
        </div>
      </div>

      {/* Description */}
      <Show when={description()}>
        <p class="text-xs leading-5 text-on-surface-variant">{description()}</p>
      </Show>

      {/* Status line */}
      <div class="flex items-center gap-1.5 border-t border-white/10 pt-2">
        <span class="font-mono text-[9px] uppercase tracking-[0.15em] text-outline">Status</span>
        <span class="text-xs text-on-surface-variant">{statusInfo().label}</span>
      </div>
    </div>
  );
}
