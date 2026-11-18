import { RunbookPanel } from "./RunbookPanel";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { cancelTask, createAgentDelegation, getFleet, revokeDelegation as revokeDelegationRequest, subscribeFleet } from "../lib/api";
import { type AgentFleetFailureReceipt, type AgentFleetRunNotice } from "../lib/agentFleetFailureState";
import {
  fleetActiveCount,
  fleetIdleCount,
  fleetRecentTasks,
  type AgentFleetDelegation as Delegation,
  type AgentFleetResponse as FleetData,
  type AgentFleetTask as AgentTask,
} from "../lib/agentFleetResponseState";
import {
  activateAgentFleetDelegationDraft,
  agentFleetDelegationDraftCanRun,
  cancelAgentFleetTaskAndReload,
  createAgentFleetDelegationDraft,
  loadAgentFleetViewState,
  resetAgentFleetDelegationDraft,
  revokeAgentFleetDelegationAndReload,
  runAgentFleetDelegationViewState,
} from "../lib/agentFleetViewState";
import {
  agentFleetDelegationRowStates,
  agentFleetSummaryState,
  agentFleetTaskRowStates,
} from "../lib/agentFleetPresentationState";
import { EmptyState } from "./EmptyState";
import { MaskSwitcher } from "./MaskSwitcher";
import { SkeletonBlock } from "./Spinner";
import { TaskDetailModal } from "./TaskDetailModal";

const MASK_OPTIONS = ["private", "team", "public"] as const;
type MaskOpt = typeof MASK_OPTIONS[number];

function NewDelegationRow(props: { onRun: (scope: string, mask: MaskOpt, expiresAt: string, task: string) => void }) {
  const [draft, setDraft] = createSignal(createAgentFleetDelegationDraft<MaskOpt>("private"));

  const canRun = createMemo(() => agentFleetDelegationDraftCanRun(draft()));

  function activate() {
    setDraft((current) => activateAgentFleetDelegationDraft(current));
  }

  function handleRun() {
    if (!canRun()) return;
    const current = draft();
    props.onRun(current.scope.trim(), current.mask, current.expiresAt, current.task.trim());
    setDraft(resetAgentFleetDelegationDraft("private"));
  }

  return (
    <tr class="border-t border-white/10 bg-primary/3 transition hover:bg-primary/5">
      <Show when={!draft().active}>
        <td colspan="5" class="px-3 py-2.5">
          <button
            type="button"
            onClick={activate}
            class="flex min-h-9 items-center gap-1.5 text-xs text-primary/70 transition hover:text-primary"
          >
            <span class="flex h-5 w-5 items-center justify-center rounded-full border border-primary/30 text-sm leading-none">+</span>
            New delegation
          </button>
        </td>
      </Show>
      <Show when={draft().active}>
        <td class="px-2 py-2">
          <input
            value={draft().scope}
            onInput={(e) => setDraft((current) => ({ ...current, scope: e.currentTarget.value }))}
            placeholder="Scope (e.g. email:read)"
            class="w-full rounded-lg border border-white/25 bg-white/20 px-2 py-2 text-xs outline-none transition focus:border-primary/40 sm:py-1"
          />
        </td>
        <td class="px-2 py-2">
          <select
            value={draft().mask}
            onChange={(e) => setDraft((current) => ({ ...current, mask: e.currentTarget.value as MaskOpt }))}
            class="w-full rounded-lg border border-white/25 bg-white/20 px-2 py-2 text-xs outline-none transition focus:border-primary/40 sm:py-1"
          >
            {MASK_OPTIONS.map((m) => <option value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </td>
        <td class="px-2 py-2">
          <input
            type="datetime-local"
            value={draft().expiresAt}
            onChange={(e) => setDraft((current) => ({ ...current, expiresAt: e.currentTarget.value }))}
            class="w-full rounded-lg border border-white/25 bg-white/20 px-2 py-2 text-xs outline-none transition focus:border-primary/40 sm:py-1"
          />
        </td>
        <td class="px-2 py-2">
          <input
            value={draft().task}
            onInput={(e) => setDraft((current) => ({ ...current, task: e.currentTarget.value }))}
            placeholder="Task description (optional)"
            class="w-full rounded-lg border border-white/25 bg-white/20 px-2 py-2 text-xs outline-none transition focus:border-primary/40 sm:py-1"
          />
        </td>
        <td class="flex items-center gap-1 px-2 py-2">
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun()}
            class="rounded-lg bg-primary px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-30 sm:py-1"
          >
            Run
          </button>
          <button
            type="button"
            onClick={() => setDraft(resetAgentFleetDelegationDraft("private"))}
            class="rounded-lg px-2 py-2 text-[10px] text-on-surface-variant/60 transition hover:text-on-surface sm:py-1"
          >
            x
          </button>
        </td>
      </Show>
    </tr>
  );
}

export function AgentFleetView(props: { onClose?: () => void; onNavigate?: (view: string) => void }) {
  const [data, setData] = createSignal<FleetData>({});
  const [loading, setLoading] = createSignal(true);
  const [fleetError, setFleetError] = createSignal<AgentFleetFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<AgentFleetFailureReceipt | null>(null);
  const [selectedTask, setSelectedTask] = createSignal<AgentTask | null>(null);
  const [cancelingId, setCancelingId] = createSignal<string | null>(null);
  const [now, setNow] = createSignal(Date.now());
  const [runStreaming, setRunStreaming] = createSignal<AgentFleetRunNotice | null>(null);

  async function load() {
    setLoading(true);
    const result = await loadAgentFleetViewState(getFleet);
    setData(result.data);
    setFleetError(result.error);
    setLoading(false);
  }

  onMount(() => {
    load();
    const unsub = subscribeFleet(() => load());
    onCleanup(unsub);
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(ticker));
  });

  async function revokeDelegation(id: string) {
    setActionError(null);
    const result = await revokeAgentFleetDelegationAndReload(id, {
      revokeDelegation: revokeDelegationRequest,
      loadFleet: getFleet,
    });
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setData(result.data);
  }

  async function handleRunDelegation(scope: string, mask: MaskOpt, expiresAt: string, task: string) {
    const result = await runAgentFleetDelegationViewState(
      { scope, mask, expiresAt, task },
      {
        createDelegation: createAgentDelegation,
        loadFleet: getFleet,
      },
    );
    setRunStreaming(result.startNotice);
    setActionError(null);
    setRunStreaming(result.notice);
    if (result.openView) {
      setData(result.data);
      setTimeout(() => {
        setRunStreaming(null);
        props.onNavigate?.(result.openView!);
      }, result.navigateAfterMs ?? 1200);
      return;
    }
    if (result.clearNoticeAfterMs !== null) {
      setTimeout(() => setRunStreaming(null), result.clearNoticeAfterMs);
    }
  }

  async function handleCancelTask(taskId: string) {
    setCancelingId(taskId);
    setActionError(null);
    const result = await cancelAgentFleetTaskAndReload(taskId, {
      cancelTask,
      loadFleet: getFleet,
    });
    if (result.error) {
      setActionError(result.error);
    } else {
      setData(result.data);
    }
    setCancelingId(null);
  }

  const hasDelegations = createMemo(() => (data().active_delegations ?? []).length > 0);
  const recentTasks = createMemo(() => fleetRecentTasks(data()));
  const delegationRows = createMemo(() => agentFleetDelegationRowStates(data()));
  const taskRows = createMemo(() => agentFleetTaskRowStates(data(), { nowMs: now(), cancelingId: cancelingId() }));
  const fleetSummary = createMemo(() => agentFleetSummaryState(data()));
  const hasRecentTasks = createMemo(() => recentTasks().length > 0);
  const isFleetEmpty = createMemo(() => !hasDelegations() && !hasRecentTasks());

  return (
    <div class="space-y-5">
      <RunbookPanel mode="manage" />
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class={`h-2 w-2 rounded-full ${fleetSummary().indicatorClass}`} />
          <span class="text-xs text-on-surface-variant">
            {fleetSummary().statusLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => props.onClose?.()}
          class="text-base font-semibold text-on-surface transition hover:text-on-surface-variant"
          title="Hide fleet panel"
        >
          Agent Fleet x
        </button>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs text-on-surface-variant">Mask:</span>
        <MaskSwitcher />
      </div>

      <Show when={!!actionError()}>
        <div
          classList={{
            "animate-fade-in rounded-xl border px-4 py-3 text-xs leading-5": true,
            "border-red-400/30 bg-red-50/70 text-red-700": actionError()?.tone === "danger",
            "border-amber-300/40 bg-amber-50/80 text-amber-800": actionError()?.tone !== "danger",
          }}
        >
          <p class="font-semibold">{actionError()?.title}</p>
          <p class="mt-1">{actionError()?.summary}</p>
          <p class="mt-1 opacity-80">{actionError()?.nextStep}</p>
        </div>
      </Show>

      <Show when={loading()}>
        <div class="skeleton-crossfade space-y-4">
          <div class="rounded-lg border border-white/15 bg-white/5 p-4">
            <SkeletonBlock lines={3} />
          </div>
          <div class="rounded-lg border border-white/15 bg-white/5 p-4">
            <SkeletonBlock lines={5} />
          </div>
          <div class="rounded-lg border border-white/15 bg-white/5 p-4">
            <SkeletonBlock lines={5} />
          </div>
        </div>
      </Show>

      <Show when={!loading() && !!fleetError()}>
        <EmptyState
          icon="!"
          title="Agent fleet unavailable"
          body={`${fleetError()?.summary ?? "Failed to load fleet status."} ${fleetError()?.nextStep ?? ""}`.trim()}
          action={
            <button
              type="button"
              class="rounded-xl border border-white/35 bg-white/40 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/70"
              onClick={() => void load()}
            >
              Retry fleet
            </button>
          }
        />
      </Show>

      <Show when={!loading() && !fleetError()}>
        <div class="content-crossfade space-y-5">
          <Show when={isFleetEmpty()}>
            <EmptyState
              icon="AF"
              title="Agent fleet is idle"
              body="No active delegations or recent tasks are visible yet. Start a delegation or open workflows to kick off agent work."
              action={
                <button
                  type="button"
                  class="rounded-xl border border-white/35 bg-white/40 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/70"
                  onClick={() => props.onNavigate?.("workflows")}
                >
                  Open workflows
                </button>
              }
            />
          </Show>

          <section>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Active Delegations
            </h3>
            <div class="overflow-x-auto rounded-lg border border-white/15 bg-white/5">
              <table class="min-w-[42rem] w-full text-sm">
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
                    {(d, index) => {
                      const row = () => delegationRows()[index()]!;
                      return (
                      <tr class="border-b border-white/5 hover:bg-white/5">
                        <td class="max-w-[12rem] break-words px-3 py-2 font-mono text-xs">{row().scope}</td>
                        <td class="px-3 py-2">
                          <span class="rounded-full bg-primary/15 px-2 py-1 text-xs text-primary">{row().mask}</span>
                        </td>
                        <td class="px-3 py-2 text-xs text-on-surface-variant">
                          {row().expiresLabel}
                        </td>
                        <td class="max-w-[16rem] break-words px-3 py-2 font-mono text-xs text-on-surface-variant">{row().taskLabel}</td>
                        <td class="px-3 py-2">
                          <button
                            type="button"
                            class="rounded px-2 py-1.5 text-xs text-red-500 hover:bg-red-500/10"
                            onClick={() => revokeDelegation(d.id)}
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    )}}
                  </For>
                  <NewDelegationRow onRun={handleRunDelegation} />
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Task Queue
            </h3>
            <div class="overflow-x-auto rounded-lg border border-white/15 bg-white/5">
              <table class="min-w-[46rem] w-full text-sm">
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
                    each={recentTasks()}
                    fallback={
                      <tr>
                        <td colspan="6" class="px-3 py-3 text-center text-xs text-on-surface-variant">
                          No tasks
                        </td>
                      </tr>
                    }
                  >
                    {(t, index) => {
                      const row = () => taskRows()[index()]!;
                      return (
                        <tr
                          class="cursor-pointer border-b border-white/5 hover:bg-white/5"
                          onClick={() => setSelectedTask(t)}
                        >
                          <td class="max-w-[16rem] break-words px-3 py-2 text-xs">{row().label}</td>
                          <td class={`px-3 py-2 text-xs font-medium ${row().statusClass}`}>{row().status}</td>
                          <td class="px-3 py-2 font-mono text-xs text-on-surface-variant">{row().durationLabel ?? "-"}</td>
                          <td class="px-3 py-2 text-xs text-on-surface-variant">{row().priority}</td>
                          <td class="px-3 py-2 text-xs text-on-surface-variant">
                            {row().createdLabel}
                          </td>
                          <td class="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <Show when={row().canCancel}>
                              <button
                                type="button"
                                class="rounded px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                                disabled={cancelingId() === t.id}
                                onClick={() => handleCancelTask(t.id)}
                              >
                                {cancelingId() === t.id ? "..." : "Cancel"}
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
        </div>
      </Show>

      <Show when={selectedTask() !== null}>
        <TaskDetailModal task={selectedTask()!} onClose={() => setSelectedTask(null)} />
      </Show>

      <Show when={runStreaming() !== null}>
        <div class="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 animate-fade-in">
          <div
            classList={{
              "flex items-center gap-3 rounded-full border px-5 py-2.5 shadow-panel backdrop-blur-xl": true,
              "border-primary/20 bg-primary/10": runStreaming()?.tone === "info",
              "border-emerald-400/20 bg-emerald-500/10": runStreaming()?.tone === "success",
              "border-red-400/20 bg-red-500/10": runStreaming()?.tone === "danger",
            }}
          >
            <span
              classList={{
                "h-2 w-2 rounded-full": true,
                "animate-pulse bg-primary": runStreaming()?.tone === "info",
                "bg-emerald-400": runStreaming()?.tone === "success",
                "bg-red-400": runStreaming()?.tone === "danger",
              }}
            />
            <span
              classList={{
                "text-xs font-medium": true,
                "text-primary": runStreaming()?.tone === "info",
                "text-emerald-200": runStreaming()?.tone === "success",
                "text-red-100": runStreaming()?.tone === "danger",
              }}
            >
              {runStreaming()?.message}
            </span>
          </div>
        </div>
      </Show>
    </div>
  );
}
