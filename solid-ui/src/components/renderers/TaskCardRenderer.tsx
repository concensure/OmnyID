import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  high: "bg-red-500/15 text-red-600 border-red-500/30",
  normal: "bg-primary/15 text-primary border-primary/30",
  low: "bg-slate-400/15 text-slate-500 border-slate-400/30",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  shopping: "Shopping",
  todo: "To-do",
  reminder: "Reminder",
  note: "Note",
  contact_follow_up: "Follow-up",
  general: "Task",
};

const STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  pending: { dot: "bg-yellow-400", label: "Pending" },
  in_progress: { dot: "bg-blue-500 animate-pulse", label: "In progress" },
  completed: { dot: "bg-green-500", label: "Done" },
  cancelled: { dot: "bg-slate-400", label: "Cancelled" },
};

const TASK_TRIAGE_DONE_LABEL = "Done";
const TASK_TRIAGE_SNOOZE_LABEL = "Snooze";
const TASK_TRIAGE_AGENT_LABEL = "Agent";
const TASK_TRIAGE_UNDO_LABEL = "Undo";
const TASK_DONE_TOAST = "Marked done";
const TASK_SNOOZE_TOAST = "Snoozed";
const TASK_AGENT_TOAST = "Queued for agent";
const TASK_DONE_STATE_LABEL = "Marked done";
const TASK_SNOOZE_STATE_LABEL = "Snoozed";
const TASK_AGENT_STATE_LABEL = "Queued for agent";

function taskScalarString(value: unknown, fallback: string): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export function TaskCardRenderer(props: {
  message: AfpMessage;
  view?: AfpView;
}) {
  const viewContent = () => afpRecord(props.message.encryption ? undefined : props.view?.content);
  const messageContent = () => afpRecord(decryptedDisplayContent(props.message));

  const [triage, setTriage] = createSignal<"done" | "snoozed" | "queued" | null>(null);
  const [toastMsg, setToastMsg] = createSignal<string | null>(null);
  const [toastFading, setToastFading] = createSignal(false);
  let toastTimer: ReturnType<typeof setTimeout>;
  let fadeTimer: ReturnType<typeof setTimeout>;

  function showToast(msg: string) {
    clearTimeout(toastTimer);
    clearTimeout(fadeTimer);
    setToastFading(false);
    setToastMsg(msg);
    fadeTimer = setTimeout(() => setToastFading(true), 1600);
    toastTimer = setTimeout(() => setToastMsg(null), 2100);
  }

  onCleanup(() => {
    clearTimeout(toastTimer);
    clearTimeout(fadeTimer);
  });

  const cardState = createMemo(() => {
    const view = viewContent();
    const message = messageContent();
    const title = taskScalarString(view["title"] ?? message["title"], "Task");
    const description = taskScalarString(view["description"] ?? message["description"], "");
    const priority = taskScalarString(view["priority"] ?? message["priority"], "normal");
    const taskType = taskScalarString(view["task_type"] ?? message["task_type"], "general");
    const status = taskScalarString(view["status"] ?? message["status"], "pending");
    const triageState = triage();
    const toastText = toastMsg();
    return {
      title,
      description,
      showDescription: Boolean(description),
      priorityText: priority,
      priorityClass: PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.normal,
      typeLabel: TASK_TYPE_LABELS[taskType] ?? "Task",
      statusInfo: STATUS_STYLES[status] ?? STATUS_STYLES.pending,
      showTriageActions: !triageState && status !== "completed" && status !== "cancelled",
      showStatusSummary: !triageState && (status === "completed" || status === "cancelled"),
      triageState,
      triageStateClass:
        triageState === "done"
          ? "text-green-700"
          : triageState === "snoozed"
            ? "text-slate-600"
            : "text-primary",
      triageStateText:
        triageState === "done"
          ? TASK_DONE_STATE_LABEL
          : triageState === "snoozed"
            ? TASK_SNOOZE_STATE_LABEL
            : TASK_AGENT_STATE_LABEL,
      showToast: Boolean(toastText),
      toastText,
      toastOpacity: toastFading() ? "0" : "1",
    };
  });

  return (
    <div class="relative space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <span class={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${cardState().statusInfo.dot}`} />
          <h3 class="min-w-0 break-words text-sm font-semibold leading-5 text-on-surface">{cardState().title}</h3>
        </div>

        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
          <span class="max-w-full rounded-full bg-white/30 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant break-words">
            {cardState().typeLabel}
          </span>
          <span class={`max-w-full rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] break-words ${cardState().priorityClass}`}>
            {cardState().priorityText}
          </span>
        </div>
      </div>

      <Show when={cardState().showDescription}>
        <p class="break-words text-xs leading-5 text-on-surface-variant">{cardState().description}</p>
      </Show>

      <div class="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
        <Show
          when={cardState().triageState}
          fallback={
            <Show
              when={cardState().showTriageActions}
              fallback={
                <>
                  <span class="font-mono text-[9px] uppercase tracking-[0.15em] text-outline">Status</span>
                  <span class="break-words text-xs text-on-surface-variant">{cardState().statusInfo.label}</span>
                </>
              }
            >
              <button
                type="button"
                onClick={() => {
                  setTriage("done");
                  showToast(TASK_DONE_TOAST);
                }}
                class="rounded-full border border-green-400/40 bg-green-50/70 px-2.5 py-1 text-[10px] font-medium text-green-700 transition hover:bg-green-100/80"
              >
                {TASK_TRIAGE_DONE_LABEL}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTriage("snoozed");
                  showToast(TASK_SNOOZE_TOAST);
                }}
                class="rounded-full border border-slate-300/50 bg-slate-50/70 px-2.5 py-1 text-[10px] font-medium text-slate-600 transition hover:bg-slate-100/80"
              >
                {TASK_TRIAGE_SNOOZE_LABEL}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTriage("queued");
                  showToast(TASK_AGENT_TOAST);
                }}
                class="rounded-full border border-primary/30 bg-primary/8 px-2.5 py-1 text-[10px] font-medium text-primary transition hover:bg-primary/15"
              >
                {TASK_TRIAGE_AGENT_LABEL}
              </button>
            </Show>
          }
        >
          <span class={`text-xs font-medium ${cardState().triageStateClass}`}>
            {cardState().triageStateText}
          </span>
          <button
            type="button"
            onClick={() => setTriage(null)}
            class="ml-1 text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
          >
            {TASK_TRIAGE_UNDO_LABEL}
          </button>
        </Show>
      </div>
      <Show when={cardState().showToast}>
        <div
          class="pointer-events-none absolute bottom-3 right-3 rounded-full border border-white/50 bg-on-surface/80 px-3 py-1 text-[10px] font-medium text-white shadow-md backdrop-blur-sm transition-opacity duration-500"
          style={{ opacity: cardState().toastOpacity }}
        >
          {cardState().toastText}
        </div>
      </Show>
    </div>
  );
}
