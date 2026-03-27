import { createSignal, onMount, onCleanup, For, Show, createMemo } from "solid-js";
import { apiFetch, cancelTask, subscribeFleet } from "../lib/api";
import { MaskSwitcher } from "./MaskSwitcher";
import { TaskDetailModal } from "./TaskDetailModal";

type Delegation = {
  id: string;
  scope: string;
  mask: string;
  expires_at: string;
  revoked_at?: string | null;
  task_id?: string | null;
};

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

type FleetData = {
  master_instance?: Record<string, unknown>;
  active_delegations?: Delegation[];
  recent_tasks?: AgentTask[];
  active_count?: number;
  idle_count?: number;
};

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

export function AgentFleetView() {
  const [data, setData] = createSignal<FleetData>({});
  const [loading, setLoading] = createSignal(true);
  const [selectedTask, setSelectedTask] = createSignal<AgentTask | null>(null);
  const [cancelingId, setCancelingId] = createSignal<string | null>(null);
  const [now, setNow] = createSignal(Date.now());

  async function load() {
    try {
      const d = await apiFetch<FleetData>("/agent/fleet");
      setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  }

  onMount(() => {
    load();

    // Live updates via WebSocket fleet subscription
    const unsub = subscribeFleet(() => load());
    onCleanup(unsub);

    // Tick every second for duration counters
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(ticker));
  });

  async function revokeDelegation(id: string) {
    try {
      await apiFetch(`/agent/delegate/${id}`, { method: "DELETE" });
      await load();
    } catch { /* ignore */ }
  }

  async function handleCancelTask(taskId: string) {
    setCancelingId(taskId);
    try {
      await cancelTask(taskId);
      await load();
    } catch { /* ignore */ }
    setCancelingId(null);
  }

  const isActive = (status: string) =>
    status === "executing" || status === "planning" || status === "pending";

  const statusColor = (s: string) =>
    s === "completed"
      ? "text-green-600"
      : s === "failed"
        ? "text-red-500"
        : s === "cancelled"
          ? "text-on-surface-variant"
          : s === "executing" || s === "planning"
            ? "text-blue-500"
            : "text-yellow-600";

  return (
    <div class="space-y-5">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class={`h-2 w-2 rounded-full ${(data().active_count ?? 0) > 0 ? "animate-pulse bg-blue-500" : "bg-green-400"}`} />
          <span class="text-xs text-on-surface-variant">
            {data().active_count ?? 0} active · {data().idle_count ?? 0} pending
          </span>
        </div>
        <h2 class="text-base font-semibold text-on-surface">Agent Fleet</h2>
      </div>

      {/* Mask switcher */}
      <div class="flex items-center gap-2">
        <span class="text-xs text-on-surface-variant">Mask:</span>
        <MaskSwitcher />
      </div>

      <Show when={loading()}>
        <p class="text-sm text-on-surface-variant">Loading…</p>
      </Show>

      <Show when={!loading()}>
        {/* Active delegations */}
        <section>
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Active Delegations
          </h3>
          <div class="overflow-x-auto rounded-lg border border-white/15 bg-white/5">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-white/10 text-xs text-on-surface-variant">
                  <th class="px-3 py-2 text-left">Scope</th>
                  <th class="px-3 py-2 text-left">Mask</th>
                  <th class="px-3 py-2 text-left">Expires</th>
                  <th class="px-3 py-2 text-left">Task</th>
                  <th class="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                <For
                  each={data().active_delegations ?? []}
                  fallback={
                    <tr>
                      <td colspan="5" class="px-3 py-3 text-center text-xs text-on-surface-variant">
                        No active delegations
                      </td>
                    </tr>
                  }
                >
                  {(d) => (
                    <tr class="border-b border-white/5 hover:bg-white/5">
                      <td class="px-3 py-2 font-mono text-xs">{d.scope}</td>
                      <td class="px-3 py-2">
                        <span class="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{d.mask}</span>
                      </td>
                      <td class="px-3 py-2 text-xs text-on-surface-variant">
                        {new Date(d.expires_at).toLocaleTimeString()}
                      </td>
                      <td class="px-3 py-2 font-mono text-xs text-on-surface-variant">{d.task_id ?? "—"}</td>
                      <td class="px-3 py-2">
                        <button
                          type="button"
                          class="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
                          onClick={() => revokeDelegation(d.id)}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>

        {/* Task queue */}
        <section>
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Task Queue
          </h3>
          <div class="overflow-x-auto rounded-lg border border-white/15 bg-white/5">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-white/10 text-xs text-on-surface-variant">
                  <th class="px-3 py-2 text-left">Task</th>
                  <th class="px-3 py-2 text-left">Status</th>
                  <th class="px-3 py-2 text-left">Duration</th>
                  <th class="px-3 py-2 text-left">Priority</th>
                  <th class="px-3 py-2 text-left">Created</th>
                  <th class="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                <For
                  each={data().recent_tasks ?? []}
                  fallback={
                    <tr>
                      <td colspan="6" class="px-3 py-3 text-center text-xs text-on-surface-variant">
                        No tasks
                      </td>
                    </tr>
                  }
                >
                  {(t) => {
                    const label = () => t.intent ?? t.content ?? t.id;
                    const duration = createMemo(() => {
                      if (!isActive(t.status) || !t.started_at) return null;
                      return formatDuration(now() - new Date(t.started_at).getTime());
                    });
                    const canCancel = () =>
                      isActive(t.status) && cancelingId() !== t.id;

                    return (
                      <tr
                        class="cursor-pointer border-b border-white/5 hover:bg-white/5"
                        onClick={() => setSelectedTask(t)}
                      >
                        <td class="max-w-[180px] truncate px-3 py-2 text-xs">{label()}</td>
                        <td class={`px-3 py-2 text-xs font-medium ${statusColor(t.status)}`}>
                          {t.status}
                        </td>
                        <td class="px-3 py-2 font-mono text-xs text-on-surface-variant">
                          {duration() ?? "—"}
                        </td>
                        <td class="px-3 py-2 text-xs text-on-surface-variant">{t.priority}</td>
                        <td class="px-3 py-2 text-xs text-on-surface-variant">
                          {new Date(t.created_at).toLocaleDateString()}
                        </td>
                        <td class="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <Show when={canCancel()}>
                            <button
                              type="button"
                              class="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                              disabled={cancelingId() === t.id}
                              onClick={() => handleCancelTask(t.id)}
                            >
                              {cancelingId() === t.id ? "…" : "Cancel"}
                            </button>
                          </Show>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </section>
      </Show>

      {/* Task detail modal */}
      <Show when={selectedTask() !== null}>
        <TaskDetailModal
          task={selectedTask()!}
          onClose={() => setSelectedTask(null)}
        />
      </Show>
    </div>
  );
}
