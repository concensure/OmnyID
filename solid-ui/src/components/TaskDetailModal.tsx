import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { apiFetch, fetchThread, subscribeThread, type AfpMessage } from "../lib/api";

type AgentTask = {
  id: string;
  intent?: string;
  content?: string;
  status: string;
  priority: string;
  created_at: string;
  started_at?: string | null;
  thread_id?: string;
};

type TaskDetail = AgentTask & {
  plan_json?: unknown;
  result_json?: unknown;
  error?: string | null;
};

type Props = {
  task: AgentTask;
  onClose: () => void;
};

const MSG_TYPE_LABEL: Record<string, string> = {
  agent_plan: "Plan",
  agent_step: "Step",
  agent_result: "Result",
  agent_escalation: "Escalation",
  agent_approval_request: "Awaiting Approval",
  capability_invoke: "Invoke",
  capability_result: "Result",
  "agent:plan": "Plan",
  "agent:step": "Step",
  "agent:result": "Result",
  "agent:provisioned": "Provisioned",
  "agent:research_result": "Research Result",
  "agent:approval_request": "Awaiting Approval",
  "agent:approval_granted": "Approval Granted",
  "agent:approval_rejected": "Approval Rejected",
  "agent:conflict_detected": "Conflict",
  "agent:triage": "Triage",
  "agent:message": "Message",
  "agent:escalation": "Escalation",
};

function messageTypeKey(message: AfpMessage): string {
  return message.subtype ? `${message.type}:${message.subtype}` : message.type;
}

function stepBadgeColor(message: AfpMessage) {
  const key = messageTypeKey(message);
  if (key === "agent:result" || key === "agent_result") return "bg-green-500/20 text-green-600";
  if (key === "agent:conflict_detected" || key === "agent_escalation") return "bg-red-500/20 text-red-400";
  if (key === "agent:escalation") return "bg-red-500/20 text-red-400";
  if (key === "agent:plan" || key === "agent_plan") return "bg-primary/20 text-primary";
  if (key === "agent:provisioned") return "bg-secondary/20 text-secondary";
  return "bg-white/10 text-on-surface-variant";
}

export function TaskDetailModal(props: Props) {
  const [detail, setDetail] = createSignal<TaskDetail | null>(null);
  const [messages, setMessages] = createSignal<AfpMessage[]>([]);
  const [loadingDetail, setLoadingDetail] = createSignal(true);
  const [loadingThread, setLoadingThread] = createSignal(false);

  async function loadDetail() {
    try {
      const d = await apiFetch<TaskDetail>(`/agent/tasks/${props.task.id}`);
      setDetail(d);
    } catch { /* ignore */ }
    setLoadingDetail(false);
  }

  async function loadThread(threadId: string) {
    setLoadingThread(true);
    try {
      const msgs = await fetchThread(threadId);
      setMessages(msgs);
    } catch { /* ignore */ }
    setLoadingThread(false);
  }

  onMount(() => {
    loadDetail();
    if (props.task.thread_id) {
      loadThread(props.task.thread_id);
      // Live updates while task is active
      const isActive = ["executing", "planning", "pending"].includes(props.task.status);
      if (isActive && props.task.thread_id) {
        const unsub = subscribeThread(props.task.thread_id, () => loadThread(props.task.thread_id!));
        onCleanup(unsub);
      }
    }
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: "0",
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": "50",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div
        style={{
          background: "var(--surface, #1a1c1b)",
          border: "1px solid rgba(255,255,255,0.15)",
          "border-radius": "20px",
          padding: "24px",
          "max-width": "640px",
          width: "100%",
          "max-height": "80vh",
          overflow: "auto",
          "box-shadow": "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
              Task Detail
            </p>
            <h2 class="mt-1 text-sm font-semibold text-on-surface line-clamp-2">
              {props.task.intent ?? props.task.content ?? props.task.id}
            </h2>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            class="flex-shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-on-surface-variant hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {/* Meta row */}
        <div class="mb-4 flex flex-wrap gap-3 text-xs text-on-surface-variant">
          <span>Status: <span class="font-medium text-on-surface">{props.task.status}</span></span>
          <span>Priority: <span class="font-medium text-on-surface">{props.task.priority}</span></span>
          <span>Created: {new Date(props.task.created_at).toLocaleString()}</span>
        </div>

        {/* Task detail */}
        <Show when={!loadingDetail() && detail()}>
          {/* Plan steps */}
          <Show when={detail()?.plan_json}>
            <div class="mb-4">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Plan
              </p>
              <pre class="rounded-lg bg-black/20 p-3 font-mono text-[11px] leading-5 text-on-surface-variant whitespace-pre-wrap overflow-auto max-h-32">
                {JSON.stringify(detail()!.plan_json, null, 2)}
              </pre>
            </div>
          </Show>

          {/* Result */}
          <Show when={detail()?.result_json}>
            <div class="mb-4">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-green-600">
                Result
              </p>
              <pre class="rounded-lg bg-green-500/10 p-3 font-mono text-[11px] leading-5 text-on-surface-variant whitespace-pre-wrap overflow-auto max-h-32">
                {JSON.stringify(detail()!.result_json, null, 2)}
              </pre>
            </div>
          </Show>

          {/* Error */}
          <Show when={detail()?.error}>
            <div class="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
              <p class="text-xs font-medium text-red-400">{detail()!.error}</p>
            </div>
          </Show>
        </Show>

        {/* AFP thread */}
        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Reasoning Trace
          </p>
          <Show when={loadingThread()}>
            <p class="text-xs text-on-surface-variant">Loading trace…</p>
          </Show>
          <Show when={!loadingThread() && messages().length === 0}>
            <p class="text-xs text-on-surface-variant">No trace messages yet.</p>
          </Show>
          <div class="space-y-2">
            <For each={messages()}>
              {(msg) => (
                <div class="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div class="mb-1 flex items-center gap-2">
                    <span class={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stepBadgeColor(msg)}`}>
                      {MSG_TYPE_LABEL[messageTypeKey(msg)] ?? MSG_TYPE_LABEL[msg.type] ?? messageTypeKey(msg)}
                    </span>
                    <span class="text-[10px] text-on-surface-variant">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <Show when={msg.content?.rationale as string | undefined}>
                    <p class="text-xs text-on-surface-variant">{msg.content.rationale as string}</p>
                  </Show>
                  <Show when={msg.content?.final_answer as string | undefined}>
                    <p class="text-xs font-medium text-on-surface">{msg.content.final_answer as string}</p>
                  </Show>
                  <Show when={msg.content?.capability_name as string | undefined}>
                    <p class="font-mono text-xs text-on-surface-variant">
                      {msg.content.capability_name as string}
                      <Show when={msg.content?.status}>
                        {" · "}<span class="text-on-surface">{msg.content.status as string}</span>
                      </Show>
                    </p>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
