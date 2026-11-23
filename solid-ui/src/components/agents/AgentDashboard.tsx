// @locs-version: 1.0
import { createSignal, For, onMount, onCleanup, Show, createMemo, createEffect } from "solid-js";
import {
  approvalModeLabel,
  approvalPendingCountSummary,
} from "afp-ts/continuity";
import {
  cancelTask,
  deleteCapability,
  fetchAgentMemory,
  getFleet,
  fetchSpendHistory,
  getCostBudget,
  fetchLlmConfig,
  listCapabilities,
  readSession,
  resolveAgentTask,
  revokeDelegation,
  setCapabilityEnabled,
  subscribeFleet,
  upsertCostBudget,
  type AgentMemoryResponse,
  type CapabilityDescriptor,
  type CostBudget,
  type LlmConfig,
  type SpendHistoryEntry,
} from "@/lib/api";
import {
  buildAgentDashboardActionFailureReceipt,
  type AgentDashboardActionFailureReceipt,
} from "@/lib/agentDashboardActionFailureState";
import {
  buildAgentDashboardBudgetFailureReceipt,
  type AgentDashboardBudgetFailureReceipt,
} from "@/lib/agentDashboardBudgetFailureState";
import {
  buildAgentDashboardLoadFailureReceipt,
  type AgentDashboardLoadFailureReceipt,
} from "@/lib/agentDashboardLoadFailureState";
import { afpOptionalRecord } from "@/lib/afpMessageRecord";
import { isRecord } from "@/lib/eventDetail";
import {
  fleetActiveOrPendingTasks,
  fleetActiveCount,
  fleetIdleCount,
  fleetMasterInstanceId,
  fleetPendingTasks,
  fleetRecentTasks,
  isAgentFleetTaskActive,
  isAgentFleetTaskCancellable,
  isAgentFleetTaskCancelled,
  isAgentFleetTaskCompleted,
  isAgentFleetTaskFailed,
  isAgentFleetTaskPending,
  type AgentFleetDelegation as Delegation,
  type AgentFleetResponse as FleetData,
  type AgentFleetTask as AgentTask,
} from "@/lib/agentFleetResponseState";
import {
  buildAgentDashboardSkillsFailureReceipt,
  type AgentDashboardSkillsFailureReceipt,
} from "@/lib/agentDashboardSkillsFailureState";
import {
  isAgentDashboardQueryHistoryStorageEvent,
  loadAgentDashboardQueryHistory,
  loadAgentDashboardShortcutsDismissed,
  recordAgentDashboardQueryHistory,
  saveAgentDashboardShortcutsDismissed,
  subscribeAgentDashboardQueryHistoryChanges,
  subscribeAgentDashboardShortcutsDismissedStorage,
  type AgentDashboardQueryHistoryEntry,
} from "@/lib/agentDashboardLocalState";
import {
  agentApprovalExplainer,
  agentApprovalKeyboardHint,
  agentApprovalKeyboardTitle,
} from "@/lib/agentApprovalCopy";
import { ApprovalDecisionButtons } from "@/components/ApprovalDecisionButtons";
import { ApprovalDecisionNotice } from "@/components/ApprovalDecisionNotice";

const FAILED_TASK_RECOVERY_SUGGESTIONS = [
  "Simplify the request",
  "Check permissions",
  "Retry with more context",
] as const;

// â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type Tab = "overview" | "budget" | "skills" | "activity" | "memory" | "history";
type ActivityFilter = "all" | "active" | "completed" | "failed" | "cancelled";

// â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function statusBg(s: string): string {
  if (s === "completed") return "bg-green-500/15 text-green-700";
  if (s === "failed") return "bg-red-500/15 text-red-600";
  if (s === "cancelled") return "bg-white/20 text-on-surface-variant";
  if (isAgentFleetTaskActive({ status: s })) return "bg-blue-500/15 text-blue-700";
  return "bg-amber-400/15 text-amber-700";
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function relativeTime(iso: string): string {
  return relativeTimeFromNow(Date.now(), iso);
}

function relativeTimeFromNow(nowMs: number, iso: string): string {
  const delta = nowMs - new Date(iso).getTime();
  const future = delta < 0;
  const abs = Math.abs(delta);
  const s = Math.floor(abs / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  let label: string;
  if (s < 60) label = `${s}s`;
  else if (m < 60) label = `${m}m`;
  else if (h < 24) label = `${h}h ${m % 60}m`;
  else label = `${d}d`;
  return future ? `in ${label}` : `${label} ago`;
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function compactText(value: string | undefined | null, max = 72): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function readableTaskTarget(task: AgentTask): string {
  return compactText(task.content ?? task.intent ?? task.id, 56) || "your request";
}

function taskNarration(task: AgentTask): string {
  const raw = `${task.intent ?? ""} ${task.content ?? ""}`.toLowerCase();
  const target = readableTaskTarget(task);
  if (raw.includes("search") || raw.includes("find") || raw.includes("research") || raw.includes("fetch")) {
    return `Searching for ${target.toLowerCase()}...`;
  }
  if (raw.includes("email") || raw.includes("reply") || raw.includes("message") || raw.includes("send")) {
    return `Preparing a message for ${target.toLowerCase()}...`;
  }
  if (raw.includes("schedule") || raw.includes("calendar") || raw.includes("book")) {
    return `Working out the schedule for ${target.toLowerCase()}...`;
  }
  if (raw.includes("write") || raw.includes("draft") || raw.includes("create") || raw.includes("compose")) {
    return `Drafting ${target.toLowerCase()}...`;
  }
  if (raw.includes("plan") || raw.includes("organize") || raw.includes("organise")) {
    return `Planning the next steps for ${target.toLowerCase()}...`;
  }
  if (raw.includes("review") || raw.includes("check") || raw.includes("audit")) {
    return `Reviewing ${target.toLowerCase()}...`;
  }
  return `Working on ${target.toLowerCase()}...`;
}

// Item 4 — Daily activity heatmap
function buildHourBuckets(nowMs: number, tasks: AgentTask[]): number[] {
  const buckets = Array(24).fill(0);
  const today = new Date(nowMs).toDateString();
  tasks.forEach(t => {
    const d = new Date(t.created_at ?? "");
    if (d.toDateString() === today) buckets[d.getHours()]++;
  });
  return buckets;
}

function HourHeatmap(props: { tasks: AgentTask[]; now: number }) {
  const buckets = () => buildHourBuckets(props.now, props.tasks);
  const peak = () => Math.max(...buckets(), 1);
  return (
    <div class="mt-3 flex items-end gap-0.5" title="Task activity by hour today">
      <For each={buckets()}>
        {(count, i) => (
          <div
            title={`${i()}:00 - ${count} task${count !== 1 ? "s" : ""}`}
            class="flex-1 rounded-sm bg-primary transition-all"
            style={{ height: `${Math.max(3, (count / peak()) * 24)}px`, opacity: count === 0 ? "0.12" : String(0.3 + (count / peak()) * 0.7) }}
          />
        )}
      </For>
    </div>
  );
}

function pct(used: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, (used / max) * 100);
}

function barColor(p: number): string {
  if (p >= 100) return "bg-red-500";
  if (p >= 80) return "bg-amber-400";
  return "bg-primary";
}

// â"€â"€ Status Bar â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function AgentHealthDot(props: { fleet: FleetData }) {
  const state = createMemo(() => {
    if ((props.fleet.error_count ?? 0) > 0) return "error";
    if (fleetActiveCount(props.fleet) > 0) return "active";
    return "idle";
  });

  const cfg = createMemo(() => {
    if (state() === "error") return { bg: "bg-red-500", anim: "animate-[pulse_0.6s_ease-in-out_infinite]", label: "Error" };
    if (state() === "active") return { bg: "bg-blue-500", anim: "animate-pulse", label: "Active" };
    return { bg: "bg-green-400", anim: "", label: "Idle" };
  });

  return (
    <div class="flex items-center gap-1.5">
      <span class={`h-2 w-2 flex-shrink-0 rounded-full ${cfg().bg} ${cfg().anim}`} />
      <span class="text-xs text-on-surface-variant">{cfg().label}</span>
    </div>
  );
}

function MiniSparkline(props: { history: SpendHistoryEntry[] }) {
  const w = 64;
  const h = 20;
  const maxVal = createMemo(() => Math.max(...props.history.map((e) => e.cost_usd), 0.0001));
  const pts = createMemo(() => {
    const n = props.history.length;
    if (n < 2) return "";
    return props.history
      .map((e, i) => `${((i / (n - 1)) * w).toFixed(1)},${(h - (e.cost_usd / maxVal()) * h).toFixed(1)}`)
      .join(" ");
  });

  return (
    <Show when={props.history.length >= 2} fallback={<span class="text-[10px] text-on-surface-variant">no spend data</span>}>
      <svg viewBox={`0 0 ${w} ${h}`} style={`width:${w}px;height:${h}px`} class="opacity-70">
        <polyline points={pts()} fill="none" stroke="var(--color-primary,#6366f1)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </Show>
  );
}

function AgentStatusBar(props: {
  fleet: FleetData;
  now: number;
  pendingCount: number;
  spendHistory: SpendHistoryEntry[];
  totalSpend: number;
  lastActiveMs: number | null;
  onGoApprovals: () => void;
}) {
  const lastSeenLabel = createMemo(() => {
    if (fleetActiveCount(props.fleet) > 0) return null;
    if (props.lastActiveMs === null) return null;
    const delta = props.now - props.lastActiveMs;
    const mins = Math.floor(delta / 60000);
    if (mins < 1) return "Last active just now";
    if (mins < 60) return `Last active ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `Last active ${hrs}h ago`;
  });

  // 16p â€" sleeping indicator when idle > 10 min
  const isSleeping = createMemo(() => {
    if (fleetActiveCount(props.fleet) > 0) return false;
    if (props.lastActiveMs === null) return false;
    return props.now - props.lastActiveMs > 10 * 60 * 1000;
  });

  return (
    <div class="flex items-center justify-between rounded-2xl border border-white/30 bg-white/15 px-4 py-2.5 gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <AgentHealthDot fleet={props.fleet} />
        {/* 16p â€" sleeping chip when idle > 10 min */}
        <Show when={isSleeping()}>
          <div class="flex items-center gap-2">
            <span class="rounded-full bg-slate-100/60 px-2 py-0.5 text-[10px] font-medium text-slate-500" title="Agent has been idle for more than 10 minutes">Sleeping</span>
            <span class="text-[10px] text-on-surface-variant">Idle for more than 10 minutes.</span>
          </div>
        </Show>
        {/* 15k â€" "last seen" pulse when idle */}
        <span class="text-xs text-on-surface-variant hidden sm:block">
          {fleetActiveCount(props.fleet) > 0
            ? `${fleetActiveCount(props.fleet)} active - ${fleetIdleCount(props.fleet)} idle`
            : lastSeenLabel() ?? `0 active - ${fleetIdleCount(props.fleet)} idle`
          }
        </span>
      </div>

      <div class="flex items-center gap-2 opacity-80">
        <MiniSparkline history={props.spendHistory.slice(-7)} />
        {/* Item 3 — Cost breakdown tooltip */}
        <span
          title="Cost breakdown unavailable"
          class="cursor-help font-mono text-[10px] text-on-surface-variant underline decoration-dotted decoration-on-surface-variant/40"
        >
          ${props.totalSpend.toFixed(4)}
        </span>
      </div>

      <Show when={props.pendingCount > 0}>
        <button
          type="button"
          onClick={props.onGoApprovals}
          class="flex items-center gap-1.5 rounded-xl bg-amber-400/20 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-400/30 transition-colors"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          {props.pendingCount} pending
        </button>
      </Show>
    </div>
  );
}

// â"€â"€ Approval Banner â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// 13c â€" infer a plain-language explainer from intent text
function taskExplainer(task: AgentTask): string {
  return agentApprovalExplainer(task);
}

// 14j â€" keyboard-navigable approval: approve with Enter, reject with Delete/Backspace
function useApprovalKeyboard(props: { onApprove: () => void; onReject: () => void }) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      props.onApprove();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      props.onReject();
    }
  };
}

function isLowRisk(task: AgentTask): boolean {
  const raw = (task.intent ?? task.content ?? "").toLowerCase();
  return raw.includes("search") || raw.includes("fetch") || raw.includes("research") || raw.includes("read") || raw.includes("list") || raw.includes("get");
}

function ApprovalBanner(props: {
  tasks: AgentTask[];
  now: number;
  resolvedTaskIds: string[];
  onResolveTasks: (taskIds: string[]) => void;
  onAllApproved?: () => void;
}) {
  const visibleTasks = createMemo(() =>
    props.tasks.filter((task) => !props.resolvedTaskIds.includes(task.id))
  );
  const top = () => visibleTasks()[0];
  const [bulkApproving, setBulkApproving] = createSignal(false);
  const [actionError, setActionError] = createSignal<AgentDashboardActionFailureReceipt | null>(null);
  let approvalQueueVersion = 0;
  let lastVisibleTaskKey: string | null = null;

  createEffect(() => {
    const visibleTaskKey = visibleTasks().map((task) => task.id).join("|");
    if (lastVisibleTaskKey !== null && visibleTaskKey !== lastVisibleTaskKey) {
      approvalQueueVersion += 1;
      setActionError(null);
      setBulkApproving(false);
    }
    lastVisibleTaskKey = visibleTaskKey;
  });

  async function handleDecision(taskId: string, decision: "approve" | "reject") {
    const queueVersionAtStart = approvalQueueVersion;
    setActionError(null);
    try {
      await resolveAgentTask(taskId, decision);
      if (queueVersionAtStart !== approvalQueueVersion) return;
      props.onResolveTasks([taskId]);
      if (visibleTasks().length <= 1) props.onAllApproved?.();
    } catch (error) {
      if (queueVersionAtStart !== approvalQueueVersion) return;
      setActionError(
        buildAgentDashboardActionFailureReceipt(
          `${decision === "approve" ? "Approve" : "Reject"} queued task`,
          error instanceof Error ? error.message : `Could not ${decision} this task.`,
        ),
      );
    }
  }

  async function approveAllLowRisk() {
    const lowRisk = visibleTasks().filter(isLowRisk);
    if (lowRisk.length === 0) return;
    const queueVersionAtStart = approvalQueueVersion;
    setBulkApproving(true);
    setActionError(null);
    const results = await Promise.allSettled(
      lowRisk.map((task) => resolveAgentTask(task.id, "approve"))
    );
    if (queueVersionAtStart !== approvalQueueVersion) return;
    const succeededIds = results.flatMap((result, index) => {
      const id = lowRisk[index]?.id;
      return result.status === "fulfilled" && id ? [id] : [];
    });
    if (succeededIds.length > 0) {
      props.onResolveTasks(succeededIds);
      if (succeededIds.length === lowRisk.length && visibleTasks().length <= lowRisk.length) props.onAllApproved?.();
    }
    const failedCount = results.filter((result) => result.status === "rejected").length;
    if (failedCount > 0) {
      setActionError({
        title:
          failedCount === lowRisk.length
            ? "Approve low-risk task batch failed"
            : "Low-risk task batch only partially completed",
        summary:
          failedCount === lowRisk.length
            ? "The dashboard could not approve any of the queued low-risk tasks."
            : `Approved ${lowRisk.length - failedCount} of ${lowRisk.length} queued low-risk tasks.`,
        nextStep: "Retry from the same dashboard view, then review any remaining queued tasks individually.",
        tone: "warning",
      });
    }
    setBulkApproving(false);
  }

  return (
    <Show when={visibleTasks().length > 0}>
      <div class="rounded-2xl border border-amber-400/40 bg-amber-50/15 px-4 py-3 space-y-2">
        <Show when={actionError()}>
          <div
            class={`rounded-xl px-3 py-2 text-sm shadow-sm ${
              actionError()?.tone === "danger"
                ? "border border-red-300/60 bg-red-50/90 text-red-900"
                : "border border-amber-300/50 bg-amber-50/90 text-amber-900"
            }`}
          >
            <div class="flex items-center justify-between gap-3">
              <div class="space-y-1">
                <p class="font-medium">{actionError()?.title}</p>
                <p class="text-xs opacity-90">{actionError()?.summary}</p>
                <p class="text-xs opacity-80">{actionError()?.nextStep}</p>
              </div>
              <button
                type="button"
                onClick={() => setActionError(null)}
                class={`rounded px-2 py-1 text-xs font-medium hover:bg-white/70 ${
                  actionError()?.tone === "danger" ? "text-red-900" : "text-amber-900"
                }`}
              >
                Dismiss
              </button>
            </div>
          </div>
        </Show>

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            <span class="text-xs font-semibold text-amber-800">
              {approvalPendingCountSummary(visibleTasks().length)}
            </span>
          </div>
          {/* 15c â€" bulk approve all low-risk (read-only) tasks when 3+ pending */}
          <Show when={visibleTasks().length >= 3 && visibleTasks().some(isLowRisk)}>
            <button
              type="button"
              disabled={bulkApproving()}
              onClick={approveAllLowRisk}
              class="rounded-lg border border-green-400/40 bg-green-500/10 px-2.5 py-1 text-[10px] font-medium text-green-700 transition hover:bg-green-500/20 disabled:opacity-40"
              title="Approve all search/fetch/read tasks - they do not write or send data"
            >
              {bulkApproving() ? "Approving..." : `Approve ${visibleTasks().filter(isLowRisk).length} low-risk`}
            </button>
          </Show>
          <Show when={visibleTasks().length > 1 && visibleTasks().length < 3}>
            <span class="text-[10px] text-amber-700 opacity-70">showing 1 of {visibleTasks().length}</span>
          </Show>
        </div>
        <Show when={top()}>
          {/* 14j â€" focusable wrapper: Enter=approve, Delete/Backspace=reject */}
          <div
            class="flex items-start gap-3 rounded-xl p-1 focus-within:ring-2 focus-within:ring-amber-400/50 outline-none"
            tabIndex={0}
            onKeyDown={useApprovalKeyboard({
              onApprove: () => {
                void handleDecision(top().id, "approve");
              },
              onReject: () => {
                void handleDecision(top().id, "reject");
              },
            })}
            title={agentApprovalKeyboardTitle()}
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                {/* 16o â€" task priority badge */}
                {(() => {
                  const p = (top().priority ?? "normal") as string;
                  if (p === "urgent" || p === "high") return <span class="text-[11px]" title="Urgent priority">High</span>;
                  if (p === "low") return <span class="text-[11px]" title="Low priority">Low</span>;
                  return <span class="text-[11px]" title="Normal priority">Med</span>;
                })()}
                <p class="min-w-0 break-words text-sm font-medium text-on-surface">{top().intent ?? top().content ?? top().id}</p>
                <span class="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  1 of {visibleTasks().length}
                </span>
              </div>
              {/* 13c â€" plain-language explainer so non-technical users understand the impact */}
              <p class="mt-1 text-sm leading-relaxed text-on-surface font-medium">
                {taskExplainer(top())}
              </p>
              <p class="text-[10px] text-on-surface-variant mt-0.5">
                Priority: {top().priority} - {relativeTimeFromNow(props.now, top().created_at)}
                <span class="ml-2 opacity-50">- {agentApprovalKeyboardHint()}</span>
              </p>
            </div>
            <div class="flex flex-shrink-0 gap-1.5">
              <ApprovalDecisionButtons
                class="flex gap-1.5"
                onApprove={() => {
                  void handleDecision(top().id, "approve");
                }}
                onReject={() => {
                  void handleDecision(top().id, "reject");
                }}
                approveClass="rounded-lg border border-green-500/30 bg-green-500/15 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-500/25 transition-colors"
                rejectClass="rounded-lg border border-red-500/30 bg-red-500/15 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/25 transition-colors"
              />
            </div>
          </div>
          <ApprovalDecisionNotice
            decision="rejected"
            context="queued_execution"
            class="border-0 bg-transparent px-1 py-0 text-[10px] text-amber-800/80"
            detailClass="text-amber-800/80"
          />
        </Show>
      </div>
    </Show>
  );
}

// â"€â"€ Overview Tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function OverviewTab(props: { fleet: FleetData; now: number }) {
  const delegations = () => props.fleet.active_delegations ?? [];
  const recentTasks = () => fleetRecentTasks(props.fleet);
  const instance = () => afpOptionalRecord(props.fleet.master_instance);
  const [revoking, setRevoking] = createSignal<string | null>(null);
  const [revoked, setRevoked] = createSignal<string[]>([]);
  const [actionError, setActionError] = createSignal<AgentDashboardActionFailureReceipt | null>(null);
  const [showSoul, setShowSoul] = createSignal(false);
  let lastSoulKey: string | null = null;

  createEffect(() => {
    const delegationIds = new Set(delegations().map((delegation) => delegation.id));
    setRevoking((prev) => (prev && delegationIds.has(prev) ? prev : null));
    setRevoked((prev) => prev.filter((id) => delegationIds.has(id)));
  });

  createEffect(() => {
    if (instance()?.["soul_md"]) return;
    setShowSoul(false);
  });

  createEffect(() => {
    const currentSoulKey = instance()
      ? `${String(instance()?.["id"] ?? "")}::${String(instance()?.["soul_md"] ?? "")}`
      : null;
    if (lastSoulKey !== null && currentSoulKey !== lastSoulKey) {
      setShowSoul(false);
    }
    lastSoulKey = currentSoulKey;
  });

  const visibleDelegations = createMemo(() =>
    delegations().filter((d) => !revoked().includes(d.id))
  );

  async function handleRevoke(id: string) {
    setRevoking(id);
    setActionError(null);
    try {
      await revokeDelegation(id);
      setRevoked((prev) => [...prev, id]);
    } catch (error) {
      setActionError(
        buildAgentDashboardActionFailureReceipt(
          "Revoke delegation",
          error instanceof Error ? error.message : "Could not revoke this delegation.",
        ),
      );
    }
    setRevoking(null);
  }

  return (
    <div class="space-y-6">
      <Show when={instance()}>
        <div class="rounded-2xl border border-white/30 bg-white/25 p-4">
          <p class="label-caps mb-3">Master Agent</p>
          <div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <p class="text-xs text-on-surface-variant">ID</p>
              <p class="mt-0.5 truncate font-mono text-xs text-on-surface" title={String(instance()!["id"] ?? "")}>
                {String(instance()!["id"] ?? "-")}
              </p>
            </div>
            <div>
              <p class="text-xs text-on-surface-variant">Status</p>
              <div class="mt-1 flex items-center gap-1.5">
                <span class={`h-2 w-2 rounded-full flex-shrink-0 ${fleetActiveCount(props.fleet) > 0 ? "animate-pulse bg-blue-500" : "bg-green-400"}`} />
                <span class="text-xs text-on-surface">{fleetActiveCount(props.fleet) > 0 ? "Active" : "Idle"}</span>
              </div>
            </div>
            <div>
              <p class="text-xs text-on-surface-variant">Soul</p>
              <div class="mt-0.5 flex items-center gap-2">
                <p class="text-xs text-on-surface">
                  {instance()!["soul_md"] ? "Configured" : "Default"}
                </p>
                <Show when={instance()!["soul_md"]}>
                  <button
                    type="button"
                    onClick={() => setShowSoul((value) => !value)}
                    class="text-[10px] font-medium text-primary transition hover:text-primary/80"
                  >
                    {showSoul() ? "Hide" : "View"}
                  </button>
                </Show>
              </div>
            </div>
          </div>
          <Show when={showSoul() && instance()!["soul_md"]}>
            <div class="mt-3 rounded-xl border border-white/20 bg-white/15 p-3">
              <p class="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">Soul prompt</p>
              <p class="mt-2 whitespace-pre-wrap text-xs leading-5 text-on-surface">
                {String(instance()!["soul_md"] ?? "")}
              </p>
            </div>
          </Show>
        </div>
      </Show>

      {/* 17h - staggered fleet stats entrance */}
      {/* Item 7-6 — Primary stats always visible; secondary stats revealed on hover */}
      <div class="group grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Active", value: fleetActiveCount(props.fleet), accent: "text-blue-500", primary: true },
          { label: "Idle / Pending", value: fleetIdleCount(props.fleet), accent: "text-yellow-600", primary: true },
          { label: "Delegations", value: visibleDelegations().length, accent: "text-primary", primary: false },
          { label: "Tasks (recent)", value: recentTasks().length, accent: "text-on-surface", primary: false },
        ].map((stat, i) => (
          <div
            class={`rounded-2xl border border-white/30 bg-white/20 p-3 text-center motion-safe:animate-fade-in transition-opacity duration-200 ${stat.primary ? "" : "opacity-40 group-hover:opacity-100"}`}
            style={{ "animation-delay": `${i * 60}ms`, "animation-fill-mode": "both" }}
          >
            <p class={`text-2xl font-bold ${stat.accent}`}>{stat.value}</p>
            <p class="mt-0.5 text-xs text-on-surface-variant">{stat.label}</p>
          </div>
        ))}
      </div>
      {/* Item 4 - Daily activity heatmap */}
      <HourHeatmap tasks={recentTasks()} now={props.now} />

      <section>
        <h3 class="label-caps mb-2">Active Delegations</h3>
        <Show when={actionError()}>
          {(receipt) => (
            <div
              class={`mb-3 flex items-start justify-between gap-3 rounded-xl px-3 py-2 text-xs ${
                receipt().tone === "danger"
                  ? "border border-red-300/60 bg-red-50/90 text-red-900"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-800"
              }`}
            >
              <div class="space-y-1">
                <p class="font-medium">{receipt().title}</p>
                <p class="opacity-90">{receipt().summary}</p>
                <p class="opacity-80">{receipt().nextStep}</p>
              </div>
              <button
                type="button"
                onClick={() => setActionError(null)}
                class={`rounded px-1.5 py-0.5 font-medium transition hover:bg-white/40 ${
                  receipt().tone === "danger" ? "text-red-900" : "text-amber-800/80 hover:text-amber-900"
                }`}
              >
                Dismiss
              </button>
            </div>
          )}
        </Show>
        <div class="overflow-x-auto rounded-xl border border-white/15 bg-white/5">
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
                each={visibleDelegations()}
                fallback={
                  <tr>
                    <td colspan="5" class="px-3 py-5 text-center">
                      <p class="text-xs text-on-surface-variant">No active delegations</p>
                      <p class="mt-1 text-[10px] text-on-surface-variant opacity-70">
                        Delegations are created automatically when the agent needs extended permissions for a task.
                      </p>
                    </td>
                  </tr>
                }
              >
                {(d) => (
                  <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td class="max-w-[12rem] break-words px-3 py-2 font-mono text-xs">{d.scope}</td>
                    <td class="px-3 py-2">
                      <span class="rounded-full bg-primary/15 px-2 py-1 text-xs text-primary">{d.mask}</span>
                    </td>
                    <td class="px-3 py-2 text-xs text-on-surface-variant" title={new Date(d.expires_at).toISOString()}>
                      {relativeTimeFromNow(props.now, d.expires_at)}
                    </td>
                    <td class="max-w-[16rem] break-words px-3 py-2 font-mono text-xs text-on-surface-variant">{d.task_id ?? "-"}</td>
                    <td class="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={revoking() === d.id}
                        onClick={() => handleRevoke(d.id)}
                        class="rounded px-2 py-1.5 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                      >
                        {revoking() === d.id ? "..." : "Revoke"}
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// â"€â"€ Budget Tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function Gauge(props: { label: string; used: number; max: number; unit: string; warnAt?: number; paceNote?: string | null; warningNote?: string | null }) {
  const p = createMemo(() => pct(props.used, props.max));
  const warn = createMemo(() => props.warnAt !== undefined && p() >= props.warnAt);
  return (
    <div class="space-y-1">
      <div class="flex items-center justify-between text-xs">
        <span class={`flex items-center gap-1 ${warn() ? "text-amber-600 font-medium" : "text-on-surface-variant"}`}>
          <Show when={warn()}>
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          </Show>
          {props.label}
        </span>
        <span class="font-mono text-on-surface">
          {props.used.toLocaleString(undefined, { maximumFractionDigits: 4 })} / {props.max.toLocaleString()} {props.unit}
        </span>
      </div>
      <div class="h-2.5 w-full overflow-hidden rounded-full bg-white/20">
        <div
          class={`h-full rounded-full transition-all duration-500 ${barColor(p())}`}
          style={`width: ${p()}%`}
        />
      </div>
      <div class="flex justify-between text-[10px] text-on-surface-variant">
        <span>{p().toFixed(1)}% used</span>
        <Show when={warn()}>
          <span class="text-amber-600">threshold reached</span>
        </Show>
      </div>
      <Show when={props.paceNote}>
        <p class="text-[10px] text-on-surface-variant">{props.paceNote}</p>
      </Show>
      <Show when={props.warningNote}>
        <p class="text-[10px] text-amber-700">{props.warningNote}</p>
      </Show>
    </div>
  );
}

function SpendSparkline(props: { history: SpendHistoryEntry[] }) {
  const maxCost = createMemo(() => Math.max(...props.history.map((h) => h.cost_usd), 0.0001));
  const width = 320;
  const height = 48;

  const points = createMemo(() => {
    const n = props.history.length;
    if (n === 0) return "";
    return props.history
      .map((h, i) => {
        const x = (i / Math.max(n - 1, 1)) * width;
        const y = height - (h.cost_usd / maxCost()) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  });

  return (
    <Show when={props.history.length > 1} fallback={<p class="text-xs text-on-surface-variant">No spend data yet</p>}>
      <svg viewBox={`0 0 ${width} ${height}`} class="w-full" style="height:48px">
        <polyline
          points={points()}
          fill="none"
          stroke="var(--color-primary, #6366f1)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </Show>
  );
}

// ITEM 6 — Budget utilisation arc
function BudgetArc(props: { used: number; max: number; size?: number }) {
  const size = props.size ?? 48;
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const pct = () => props.max > 0 ? Math.min(1, props.used / props.max) : 0;
  const offset = () => circ * (1 - pct());
  const color = () => pct() >= 0.95 ? "#ef4444" : pct() >= 0.80 ? "#f59e0b" : "var(--color-primary,#635bff)";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} class="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4" />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none"
        stroke={color()}
        stroke-width="4"
        stroke-linecap="round"
        stroke-dasharray={String(circ)}
        stroke-dashoffset={String(offset())}
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s" }}
      />
    </svg>
  );
}

function BudgetTab(props: { now: number }) {
  const [budget, setBudget] = createSignal<CostBudget | null>(null);
  const [llm, setLlm] = createSignal<LlmConfig | null>(null);
  const [history, setHistory] = createSignal<SpendHistoryEntry[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal<AgentDashboardBudgetFailureReceipt | null>(null);
  const [editing, setEditing] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [actionError, setActionError] = createSignal<AgentDashboardBudgetFailureReceipt | null>(null);

  const [editUsd, setEditUsd] = createSignal("");
  const [editCalls, setEditCalls] = createSignal("");
  const [editTokens, setEditTokens] = createSignal("");
  const [editSoft, setEditSoft] = createSignal("");
  let latestBudgetPanelRequestId = 0;
  let latestBudgetSaveRequestId = 0;
  let savedTimer: ReturnType<typeof setTimeout> | null = null;

  onCleanup(() => {
    if (savedTimer) clearTimeout(savedTimer);
  });

  function syncEditFieldsFromBudget(nextBudget: CostBudget | null) {
    if (nextBudget) {
      setEditUsd(String(nextBudget.max_cost_usd));
      setEditCalls(String(nextBudget.max_api_calls));
      setEditTokens(String(nextBudget.max_llm_tokens));
      setEditSoft(String(nextBudget.soft_limit_ratio));
      return;
    }
    setEditUsd("");
    setEditCalls("");
    setEditTokens("");
    setEditSoft("");
  }

  function updateEditField(setter: (value: string) => void, value: string) {
    setActionError(null);
    setSaved(false);
    setter(value);
  }

  function parseOptionalFloat(value: string): number | undefined {
    const normalized = value.trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function parseOptionalInt(value: string): number | undefined {
    const normalized = value.trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  function buildOptimisticBudget(base: CostBudget | null): CostBudget {
    const nextMaxCostUsd = parseOptionalFloat(editUsd());
    const nextMaxApiCalls = parseOptionalInt(editCalls());
    const nextMaxLlmTokens = parseOptionalInt(editTokens());
    const nextSoftLimitRatio = parseOptionalFloat(editSoft());
    return {
      ...base,
      max_cost_usd: nextMaxCostUsd ?? base?.max_cost_usd ?? 0,
      max_api_calls: nextMaxApiCalls ?? base?.max_api_calls ?? 0,
      max_llm_tokens: nextMaxLlmTokens ?? base?.max_llm_tokens ?? 0,
      soft_limit_ratio: nextSoftLimitRatio ?? base?.soft_limit_ratio ?? 0.8,
    };
  }

  function buildDraftValidationReceipt(summary: string, nextStep: string): AgentDashboardBudgetFailureReceipt {
    return {
      title: "Review budget limits",
      summary,
      nextStep,
      tone: "warning",
    };
  }

  function validateBudgetDraft(): AgentDashboardBudgetFailureReceipt | null {
    if (!budget()) {
      if (!editUsd().trim() || !editCalls().trim() || !editTokens().trim() || !editSoft().trim()) {
        return buildDraftValidationReceipt(
          "Create a full budget before saving.",
          "Enter values for USD, API calls, token limit, and soft warning ratio to create the first budget.",
        );
      }
    }

    const usd = parseOptionalFloat(editUsd());
    if (editUsd().trim() !== "" && (!Number.isFinite(usd) || (usd ?? 0) < 0)) {
      return buildDraftValidationReceipt(
        "The monthly USD limit must be a valid non-negative number.",
        "Enter a non-negative dollar amount, or leave the field blank to keep the current setting.",
      );
    }

    const calls = parseOptionalInt(editCalls());
    if (editCalls().trim() !== "" && (!Number.isFinite(calls) || (calls ?? 0) < 0)) {
      return buildDraftValidationReceipt(
        "The API call limit must be a valid non-negative whole number.",
        "Enter a whole number of calls, or leave the field blank to keep the current setting.",
      );
    }

    const tokens = parseOptionalInt(editTokens());
    if (editTokens().trim() !== "" && (!Number.isFinite(tokens) || (tokens ?? 0) < 0)) {
      return buildDraftValidationReceipt(
        "The token limit must be a valid non-negative whole number.",
        "Enter a whole number of tokens, or leave the field blank to keep the current setting.",
      );
    }

    const softLimit = parseOptionalFloat(editSoft());
    if (editSoft().trim() !== "" && (!Number.isFinite(softLimit) || (softLimit ?? 0) < 0 || (softLimit ?? 0) > 1)) {
      return buildDraftValidationReceipt(
        "The soft warning ratio must be between 0 and 1.",
        "Enter a value like 0.8 for an 80% warning threshold, or leave the field blank to keep the current setting.",
      );
    }

    return null;
  }

  function isMissingBudgetError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return message.includes("404") || message.includes("not found") || message.includes("no budget");
  }

  async function loadBudgetPanel() {
    const requestId = ++latestBudgetPanelRequestId;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    setSaved(false);
    try {
      const [b, l, h] = await Promise.all([
        getCostBudget().catch((error) => {
          if (isMissingBudgetError(error)) return null;
          throw error;
        }),
        fetchLlmConfig().catch(() => null),
        fetchSpendHistory(30).catch(() => null),
      ]);
      if (requestId !== latestBudgetPanelRequestId) return;
      setBudget(b);
      setLlm(l);
      setHistory(h?.history ?? []);
      if (!editing()) syncEditFieldsFromBudget(b);
    } catch (error) {
      if (requestId !== latestBudgetPanelRequestId) return;
      setBudget(null);
      setLlm(null);
      setHistory([]);
      if (!editing()) syncEditFieldsFromBudget(null);
      setLoadError(
        buildAgentDashboardBudgetFailureReceipt(
          "Load budget settings",
          error instanceof Error ? error.message : "Could not load budget settings.",
        ),
      );
    }
    if (requestId !== latestBudgetPanelRequestId) return;
    setLoading(false);
  }

  onMount(() => {
    void loadBudgetPanel();
  });

  async function handleSave() {
    setActionError(null);
    setSaved(false);
    const draftValidation = validateBudgetDraft();
    if (draftValidation) {
      setActionError(draftValidation);
      return;
    }
    const saveRequestId = ++latestBudgetSaveRequestId;
    const saveRequestGuard = ++latestBudgetPanelRequestId;
    setSaving(true);
    try {
      const nextBudgetDraft = buildOptimisticBudget(budget());
      await upsertCostBudget({
        max_cost_usd: parseOptionalFloat(editUsd()),
        max_api_calls: parseOptionalInt(editCalls()),
        max_llm_tokens: parseOptionalInt(editTokens()),
        soft_limit_ratio: parseOptionalFloat(editSoft()),
      });
      if (saveRequestGuard !== latestBudgetPanelRequestId) return;
      const b = await getCostBudget().catch(() => null);
      if (saveRequestGuard !== latestBudgetPanelRequestId) return;
      const appliedBudget = b ?? nextBudgetDraft;
      setBudget(appliedBudget);
      syncEditFieldsFromBudget(appliedBudget);
      setSaved(true);
      setEditing(false);
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(() => {
        setSaved(false);
        savedTimer = null;
      }, 2000);
    } catch (error) {
      if (saveRequestGuard !== latestBudgetPanelRequestId) return;
      setActionError(
        buildAgentDashboardBudgetFailureReceipt(
          "Save budget limits",
          error instanceof Error ? error.message : "Could not save budget limits.",
        ),
      );
    } finally {
      if (saveRequestId === latestBudgetSaveRequestId) {
        setSaving(false);
      }
    }
  }

  // Derive actual spend from 30-day history
  const usedUsd = createMemo(() => history().reduce((s, h) => s + h.cost_usd, 0));
  const usedCalls = createMemo(() => history().reduce((s, h) => s + h.api_calls, 0));
  const usedTokens = createMemo(() => history().reduce((s, h) => s + h.tokens, 0));
  const monthProgress = createMemo(() => {
    const now = new Date(props.now);
    const day = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return daysInMonth > 0 ? day / daysInMonth : 0;
  });
  const paceStatus = createMemo(() => {
    const budgetValue = budget();
    if (!budgetValue || budgetValue.max_cost_usd <= 0) return null;
    const spendFraction = usedUsd() / budgetValue.max_cost_usd;
    const delta = spendFraction - monthProgress();
    if (delta > 0.08) return "Ahead of pace";
    if (delta < -0.08) return "Behind pace";
    return "On track";
  });
  const paceNote = createMemo(() => {
    const budgetValue = budget();
    if (!budgetValue || budgetValue.max_cost_usd <= 0) return null;
    return `${paceStatus()} for this month based on ${new Date(props.now).getDate()} days elapsed.`;
  });
  const warningDays = createMemo(() => {
    const budgetValue = budget();
    const thresholdRatio = budgetValue?.soft_limit_ratio ?? 0.8;
    const thresholdValue = (budgetValue?.max_cost_usd ?? 0) * thresholdRatio;
    const spend = usedUsd();
    const spendDays = history().filter((entry) => entry.cost_usd > 0).length;
    const avgDailySpend = spendDays > 0 ? spend / spendDays : 0;
    if (!budgetValue || spend < thresholdValue || avgDailySpend <= 0) return null;
    const remaining = Math.max(0, (budgetValue.max_cost_usd - spend) / avgDailySpend);
    const rounded = Math.max(1, Math.round(remaining));
    return `At this rate you'll reach your monthly limit in about ${rounded} day${rounded === 1 ? "" : "s"}.`;
  });

  return (
    <div class="space-y-6">
      <Show when={actionError()}>
        <div
          class={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
            actionError()?.tone === "danger"
              ? "border border-red-300/60 bg-red-50/90 text-red-900"
              : "border border-amber-300/50 bg-amber-50/90 text-amber-900"
          }`}
        >
          <div class="flex items-center justify-between gap-3">
            <div class="space-y-1">
              <p class="font-medium">{actionError()?.title}</p>
              <p class="text-xs opacity-90">{actionError()?.summary}</p>
              <p class="text-xs opacity-80">{actionError()?.nextStep}</p>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              class={`rounded px-2 py-1 text-xs font-medium hover:bg-white/70 ${
                actionError()?.tone === "danger" ? "text-red-900" : "text-amber-900"
              }`}
            >
              Dismiss
            </button>
          </div>
        </div>
      </Show>

      <Show when={!loading()} fallback={<p class="text-sm text-on-surface-variant">Loading...</p>}>
      <Show
        when={!loadError()}
        fallback={
          <div
            class={`rounded-2xl p-8 text-center shadow-sm ${
              loadError()?.tone === "danger"
                ? "border border-red-300/60 bg-red-50/90 text-red-900"
                : "border border-amber-300/50 bg-amber-50/90 text-amber-900"
            }`}
          >
            <p class="text-sm font-semibold uppercase tracking-[0.14em] mb-2">Budget</p>
            <p class="text-sm font-medium">{loadError()?.title ?? "Could not load budget dashboard"}</p>
            <p class="mt-1 text-xs opacity-90">{loadError()?.summary}</p>
            <p class="mt-1 text-xs opacity-80">{loadError()?.nextStep}</p>
            <button
              type="button"
              onClick={() => void loadBudgetPanel()}
              class={`mt-4 rounded-xl bg-white/80 px-3 py-2 text-xs font-medium transition hover:bg-white ${
                loadError()?.tone === "danger"
                  ? "border border-red-400/50 text-red-900"
                  : "border border-amber-400/50 text-amber-900"
              }`}
            >
              Retry budget
            </button>
          </div>
        }
      >
      <div class="rounded-2xl border border-white/30 bg-white/20 p-4 space-y-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <BudgetArc used={usedUsd()} max={budget()?.max_cost_usd ?? 0} />
            <div>
              <p class="label-caps">Run Budget</p>
              <p class="text-[10px] text-on-surface-variant mt-0.5">30-day rolling totals vs. configured limits, plus pace against the current month.</p>
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-white/30 bg-white/30 px-3 py-1 text-xs font-medium text-on-surface transition-colors hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={saving()}
            onClick={() =>
              setEditing((value) => {
                if (value) syncEditFieldsFromBudget(budget());
                setActionError(null);
                if (!value) setSaved(false);
                return !value;
              })
            }
          >
            {editing() ? "Cancel" : "Edit limits"}
          </button>
        </div>

        <Show when={budget()} fallback={<p class="text-xs text-on-surface-variant">No budget limits configured yet.</p>}>
          <Gauge
            label="USD spent"
            used={usedUsd()}
            max={budget()!.max_cost_usd}
            unit="$"
            warnAt={(budget()!.soft_limit_ratio ?? 0.8) * 100}
            paceNote={paceNote()}
            warningNote={warningDays()}
          />
          <Gauge label="API Calls" used={usedCalls()} max={budget()!.max_api_calls} unit="calls" warnAt={80} />
          <Gauge label="LLM Tokens" used={usedTokens()} max={budget()!.max_llm_tokens} unit="tok" warnAt={80} />
          <div class="flex items-center gap-2 text-xs text-on-surface-variant">
            <span class="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span>Soft warning threshold: {((budget()!.soft_limit_ratio ?? 0.8) * 100).toFixed(0)}%</span>
          </div>
        </Show>

        <Show when={editing()}>
          <div class="mt-1 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
            {[
              { label: "Max USD ($)", val: editUsd, set: setEditUsd, step: "0.01" },
              { label: "Max API Calls", val: editCalls, set: setEditCalls, step: "1" },
              { label: "Max Tokens", val: editTokens, set: setEditTokens, step: "1000" },
              { label: "Soft Limit (0-1)", val: editSoft, set: setEditSoft, step: "0.05" },
            ].map((f) => (
              <label class="flex flex-col gap-1">
                <span class="text-xs text-on-surface-variant">{f.label}</span>
                <input
                  type="number"
                  step={f.step}
                  class="rounded-lg border border-white/30 bg-white/30 px-2 py-1.5 text-xs text-on-surface outline-none focus:border-primary/60 transition-colors"
                  disabled={saving()}
                  value={f.val()}
                  onInput={(e) => updateEditField(f.set, (e.target as HTMLInputElement).value)}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            class="mt-2 w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            disabled={saving()}
            onClick={handleSave}
          >
            {saving() ? "Saving..." : saved() ? "Saved" : "Save Budget"}
          </button>
        </Show>
      </div>

      <Show when={llm()}>
        <div class="rounded-2xl border border-white/30 bg-white/20 p-4">
          <p class="label-caps mb-3">Monthly LLM Spend</p>
          <Gauge
            label="Monthly cap"
            used={llm()!.usage_cents_current_month / 100}
            max={llm()!.monthly_budget_cents / 100}
            unit="$"
            warnAt={80}
          />
          <p class="mt-2 text-xs text-on-surface-variant">
            <span class="font-medium text-on-surface">${(llm()!.usage_cents_current_month / 100).toFixed(2)}</span>
            {" "}of{" "}
            <span class="font-medium text-on-surface">${(llm()!.monthly_budget_cents / 100).toFixed(2)}</span>
            {" "}used this month
          </p>
        </div>
      </Show>

      <div class="rounded-2xl border border-white/30 bg-white/20 p-4">
        <div class="mb-3 flex items-center justify-between">
          <p class="label-caps">30-Day Spend</p>
          <span class="font-mono text-xs text-on-surface">${usedUsd().toFixed(4)}</span>
        </div>
        <SpendSparkline history={history()} />
        <div class="mt-3 grid grid-cols-3 gap-2 text-center border-t border-white/15 pt-3">
          <div>
            <p class="text-[10px] text-on-surface-variant">Days w/ Spend</p>
            <p class="text-sm font-semibold text-on-surface">{history().filter((h) => h.cost_usd > 0).length}</p>
          </div>
          <div>
            <p class="text-[10px] text-on-surface-variant">Total API Calls</p>
            <p class="text-sm font-semibold text-on-surface">{usedCalls().toLocaleString()}</p>
          </div>
          <div>
            <p class="text-[10px] text-on-surface-variant">Total Tokens</p>
            <p class="text-sm font-semibold text-on-surface">{usedTokens().toLocaleString()}</p>
          </div>
        </div>
      </div>
      </Show>
      </Show>
    </div>
  );
}

// â"€â"€ Skills Tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type ApprovalModeInfo = { label: string; icon: string; cls: string };

function getApprovalMode(mode: string): ApprovalModeInfo {
  if (mode === "autonomous") return { label: approvalModeLabel(mode), icon: "OK", cls: "bg-green-500/15 text-green-700" };
  if (mode === "suggest_only") return { label: approvalModeLabel(mode), icon: "->", cls: "bg-blue-500/15 text-blue-700" };
  return { label: approvalModeLabel(mode), icon: "!", cls: "bg-amber-500/15 text-amber-700" };
}

function SkillsTab(props: { tasks: AgentTask[]; now: number }) {
  const [caps, setCaps] = createSignal<CapabilityDescriptor[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal<AgentDashboardSkillsFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<AgentDashboardSkillsFailureReceipt | null>(null);
  const [search, setSearch] = createSignal("");
  const [togglingId, setTogglingId] = createSignal<string | null>(null);
  const [optimisticStates, setOptimisticStates] = createSignal<Record<string, boolean>>({});
  const [toggleErrorId, setToggleErrorId] = createSignal<string | null>(null);
  const [deletingId, setDeletingId] = createSignal<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = createSignal<string | null>(null);
  const [expandedId, setExpandedId] = createSignal<string | null>(null);
  let latestCapabilitiesRequestId = 0;
  let toggleErrorTimer: ReturnType<typeof setTimeout> | null = null;

  onCleanup(() => {
    if (toggleErrorTimer) clearTimeout(toggleErrorTimer);
  });

  createEffect(() => {
    const capabilityIds = new Set(caps().map((cap) => cap.id));
    setExpandedId((prev) => (prev && capabilityIds.has(prev) ? prev : null));
    setConfirmDeleteId((prev) => (prev && capabilityIds.has(prev) ? prev : null));
    setToggleErrorId((prev) => (prev && capabilityIds.has(prev) ? prev : null));
  });

  async function syncCapabilitiesFromServer() {
    const requestId = ++latestCapabilitiesRequestId;
    try {
      const list = await listCapabilities();
      if (requestId !== latestCapabilitiesRequestId) return { requestId, status: "stale" as const };
      setCaps(Array.isArray(list) ? list : []);
      return { requestId, status: "applied" as const };
    } catch (error) {
      if (requestId !== latestCapabilitiesRequestId) return { requestId, status: "stale" as const };
      return { requestId, status: "failed" as const, error };
    }
  }

  async function refreshAfterMutation(actionLabel: string, appliedSummary: string) {
    const result = await syncCapabilitiesFromServer();
    if (result.status === "applied") {
      setLoadError(null);
      return;
    }
    if (result.status === "stale") return;
    const receipt = buildAgentDashboardSkillsFailureReceipt(
      "Refresh capabilities",
      result.error instanceof Error ? result.error.message : "Could not refresh capabilities.",
    );
    setActionError({
      title: `${actionLabel} applied, but refresh failed`,
      summary: appliedSummary,
      nextStep: receipt.nextStep,
      tone: receipt.tone,
    });
  }

  async function load() {
    setLoadError(null);
    const result = await syncCapabilitiesFromServer();
    if (result.status === "stale") return;
    if (result.status === "failed") {
      setCaps([]);
      setLoadError(
        buildAgentDashboardSkillsFailureReceipt(
          "Load capabilities",
          result.error instanceof Error ? result.error.message : "Could not load capabilities.",
        ),
      );
    }
    if (result.requestId !== latestCapabilitiesRequestId) return;
    setLoading(false);
  }

  onMount(load);

  async function handleToggle(cap: CapabilityDescriptor) {
    const next = !cap.enabled;
    setActionError(null);
    setOptimisticStates((prev) => ({ ...prev, [cap.id]: next }));
    setTogglingId(cap.id);
    try {
      await setCapabilityEnabled(cap.id, next);
      setCaps((prev) => prev.map((item) => (item.id === cap.id ? { ...item, enabled: next } : item)));
      setOptimisticStates((prev) => { const c = { ...prev }; delete c[cap.id]; return c; });
      await refreshAfterMutation(
        `${next ? "Enable" : "Disable"} capability`,
        `${cap.name} was ${next ? "enabled" : "disabled"}, but the dashboard could not confirm the latest capability list.`,
      );
    } catch (error) {
      // Revert optimistic state and briefly flag the error
      setOptimisticStates((prev) => { const c = { ...prev }; delete c[cap.id]; return c; });
      setToggleErrorId(cap.id);
      setActionError(
        buildAgentDashboardSkillsFailureReceipt(
          `${next ? "Enable" : "Disable"} capability`,
          error instanceof Error ? error.message : `Could not ${next ? "enable" : "disable"} ${cap.name}.`,
        ),
      );
      if (toggleErrorTimer) clearTimeout(toggleErrorTimer);
      toggleErrorTimer = setTimeout(() => {
        setToggleErrorId(null);
        toggleErrorTimer = null;
      }, 2000);
    }
    setTogglingId(null);
  }

  async function handleDelete(id: string) {
    setActionError(null);
    setDeletingId(id);
    setConfirmDeleteId(null);
    const capName = caps().find((cap) => cap.id === id)?.name ?? "this capability";
    try {
      await deleteCapability(id);
      setCaps((prev) => prev.filter((cap) => cap.id !== id));
      setExpandedId((prev) => (prev === id ? null : prev));
      await refreshAfterMutation(
        "Delete capability",
        `${capName} was deleted, but the dashboard could not confirm the latest capability list.`,
      );
    } catch (error) {
      setActionError(
        buildAgentDashboardSkillsFailureReceipt(
          "Delete capability",
          error instanceof Error ? error.message : `Could not delete ${capName}.`,
        ),
      );
    }
    setDeletingId(null);
  }

  const filtered = createMemo(() => {
    const q = search().toLowerCase();
    if (!q) return caps();
    return caps().filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const grouped = createMemo(() => {
    const groups = new Map<string, CapabilityDescriptor[]>();
    for (const cap of filtered()) {
      const key = cap.tags[0] ?? "general";
      const arr = groups.get(key) ?? [];
      arr.push(cap);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  return (
    <div class="space-y-4">
      <input
        type="search"
        placeholder="Search capabilities..."
        class="w-full rounded-xl border border-white/30 bg-white/25 px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:border-primary/60 transition-colors"
        value={search()}
        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
      />

      <Show when={loading()}>
        <p class="text-sm text-on-surface-variant">Loading...</p>
      </Show>

      <Show when={!loading() && !!actionError()}>
        <div
          class={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
            actionError()?.tone === "danger"
              ? "border border-red-300/60 bg-red-50/90 text-red-900"
              : "border border-amber-300/50 bg-amber-50/90 text-amber-900"
          }`}
        >
          <div class="flex items-center justify-between gap-3">
            <div class="space-y-1">
              <p class="font-medium">{actionError()?.title}</p>
              <p class="text-xs opacity-90">{actionError()?.summary}</p>
              <p class="text-xs opacity-80">{actionError()?.nextStep}</p>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              class={`rounded px-2 py-1 text-xs font-medium hover:bg-white/70 ${
                actionError()?.tone === "danger" ? "text-red-900" : "text-amber-900"
              }`}
            >
              Dismiss
            </button>
          </div>
        </div>
      </Show>

      <Show when={!loading() && !!loadError()}>
        <div
          class={`rounded-2xl p-8 text-center shadow-sm ${
            loadError()?.tone === "danger"
              ? "border border-red-300/60 bg-red-50/90 text-red-900"
              : "border border-amber-300/50 bg-amber-50/90 text-amber-900"
          }`}
        >
          <p class="text-sm font-semibold uppercase tracking-[0.14em] mb-2">Tools</p>
          <p class="text-sm font-medium">{loadError()?.title ?? "Could not load capabilities"}</p>
          <p class="mt-1 text-xs opacity-90">{loadError()?.summary}</p>
          <p class="mt-1 text-xs opacity-80">{loadError()?.nextStep}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            class={`mt-4 rounded-xl bg-white/80 px-3 py-2 text-xs font-medium transition hover:bg-white ${
              loadError()?.tone === "danger"
                ? "border border-red-400/50 text-red-900"
                : "border border-amber-400/50 text-amber-900"
            }`}
          >
            Retry capabilities
          </button>
        </div>
      </Show>

      <Show when={!loading() && !loadError() && filtered().length === 0}>
        <div class="rounded-2xl border border-white/20 bg-white/10 p-8 text-center">
          <p class="text-sm font-semibold uppercase tracking-[0.14em] text-on-surface-variant mb-2">Tools</p>
          <p class="text-sm font-medium text-on-surface">
            {search() ? "No capabilities match your search" : "No capabilities registered"}
          </p>
          <p class="mt-1 text-xs text-on-surface-variant">
            {search() ? "Try a different search term." : "Go to Agent Settings -> Capabilities to add capabilities."}
          </p>
        </div>
      </Show>

      <Show when={!loading() && !loadError()}>
        <For each={grouped()}>
        {([group, items]) => (
          <div>
            <p class="label-caps mb-2 capitalize">{group}</p>
            <div class="space-y-2">
              <For each={items}>
                {(cap) => {
                  const effectiveEnabled = () => optimisticStates()[cap.id] ?? cap.enabled;
                  const isExpanded = () => expandedId() === cap.id;
                  const hasError = () => toggleErrorId() === cap.id;
                  const isConfirmingDelete = () => confirmDeleteId() === cap.id;
                  const modeInfo = getApprovalMode(cap.approval_mode);

                  return (
                    <div
                      class={`rounded-2xl border transition-all ${
                        effectiveEnabled()
                          ? "border-white/30 bg-white/20"
                          : "border-white/15 bg-white/8 opacity-60"
                      } ${hasError() ? "border-red-400/50 ring-1 ring-red-400/30" : ""}`}
                    >
                      <div class="flex items-center gap-3 px-4 py-3">
                        <button
                          type="button"
                          title={effectiveEnabled() ? "Disable" : "Enable"}
                          disabled={togglingId() === cap.id}
                          onClick={() => handleToggle(cap)}
                          class={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                            effectiveEnabled() ? "bg-primary" : "bg-white/30"
                          }`}
                        >
                          <span
                            class={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                              effectiveEnabled() ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>

                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-1.5">
                            <span class="font-mono text-sm font-medium text-on-surface">{cap.name}</span>
                            <span class={`rounded-full px-2 py-0.5 text-[10px] font-medium ${modeInfo.cls}`}>
                              {modeInfo.icon} {modeInfo.label}
                            </span>
                            <For each={cap.tags.slice(1, 4)}>
                              {(tag) => (
                                <span class="rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-on-surface-variant">
                                  {tag}
                                </span>
                              )}
                            </For>
                          </div>
                          <Show when={!isExpanded()}>
                            <p class="mt-0.5 truncate text-xs text-on-surface-variant">{cap.description}</p>
                          </Show>
                        </div>

                        <div class="flex flex-shrink-0 items-center gap-1">
                          <button
                            type="button"
                            class="rounded px-2 py-1 text-xs text-on-surface-variant hover:bg-white/20 transition-colors"
                            onClick={() => setExpandedId(isExpanded() ? null : cap.id)}
                          >
                            {isExpanded() ? "Hide details" : "Show details"}
                          </button>
                          <Show
                            when={isConfirmingDelete()}
                            fallback={
                              <button
                                type="button"
                                class="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                                onClick={() => setConfirmDeleteId(cap.id)}
                              >
                                Delete
                              </button>
                            }
                          >
                            <div class="flex items-center gap-1">
                              <span class="text-[10px] text-on-surface-variant">Sure?</span>
                              <button
                                type="button"
                                disabled={deletingId() === cap.id}
                                class="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-500/10"
                                onClick={() => handleDelete(cap.id)}
                              >
                                {deletingId() === cap.id ? "..." : "Yes"}
                              </button>
                              <button
                                type="button"
                                class="rounded px-1.5 py-0.5 text-[10px] text-on-surface-variant hover:bg-white/20"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                No
                              </button>
                            </div>
                          </Show>
                        </div>
                      </div>

                      <Show when={isExpanded()}>
                        <div class="border-t border-white/15 px-4 py-3 space-y-2">
                          <p class="text-xs text-on-surface-variant">{cap.description}</p>
                          <div class="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span class="text-on-surface-variant">Version: </span>
                              <span class="font-mono text-on-surface">{cap.version}</span>
                            </div>
                            <div>
                              <span class="text-on-surface-variant">ID: </span>
                              <span class="font-mono text-on-surface" title={cap.id}>{cap.id.slice(0, 16)}...</span>
                            </div>
                          </div>
                          <div>
                            <p class="text-xs text-on-surface-variant mb-1">Input Schema</p>
                            <pre class="overflow-x-auto rounded bg-white/10 p-2 font-mono text-[10px] text-on-surface max-h-32">
                              {JSON.stringify(cap.input_schema, null, 2)}
                            </pre>
                          </div>
                          {/* 15q â€" capability dependency stub: list other caps this one may require */}
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        )}
        </For>
      </Show>

      {/* 14t â€" Capability activity log: recent tasks that match registered capability names */}
      <Show when={props.tasks.length > 0 && caps().length > 0}>
        <div class="mt-4">
          <p class="label-caps mb-2">Recent Skill Invocations</p>
          <div class="space-y-1.5">
            <For each={props.tasks.slice(0, 8).filter(t => {
              const intent = (t.intent ?? t.content ?? "").toLowerCase();
              return caps().some(c => intent.includes(c.name.toLowerCase()));
            })}>
              {(t) => {
                const matchedCap = caps().find(c => (t.intent ?? t.content ?? "").toLowerCase().includes(c.name.toLowerCase()));
                return (
                  <div class="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                    <span class="flex-shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                      {matchedCap?.name ?? "skill"}
                    </span>
                    <p class="min-w-0 flex-1 truncate text-xs text-on-surface-variant">{t.intent ?? t.content ?? t.id}</p>
                    <span class={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${statusBg(t.status)}`}>{t.status}</span>
                    <span class="flex-shrink-0 font-mono text-[10px] text-on-surface-variant/50">{relativeTimeFromNow(props.now, t.created_at)}</span>
                  </div>
                );
              }}
            </For>
            <Show when={props.tasks.filter(t => caps().some(c => (t.intent ?? t.content ?? "").toLowerCase().includes(c.name.toLowerCase()))).length === 0}>
              <p class="text-xs text-on-surface-variant">No recent skill invocations found in task history.</p>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}

// â"€â"€ Activity Tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// ITEM 4 — ETA countdown helper
function etaCountdownFromNow(nowMs: number, isoEnd: string): string {
  const remaining = Math.floor((new Date(isoEnd).getTime() - nowMs) / 1000);
  if (remaining <= 0) return "finishing up";
  if (remaining < 60) return `~${remaining}s left`;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  if (mins < 60) return `~${mins}m ${secs}s left`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `~${hrs}h ${remMins}m left`;
}

function ActivityTab(props: {
  fleet: FleetData;
  now: number;
  resolvedPendingIds: string[];
  cancelledPendingIds: string[];
  onResolvePendingTasks: (taskIds: string[]) => void;
  onCancelPendingTasks: (taskIds: string[]) => void;
}) {
  const [filter, setFilter] = createSignal<ActivityFilter>("all");
  const [cancelingId, setCancelingId] = createSignal<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<AgentDashboardActionFailureReceipt | null>(null);
  const [localTaskStatusOverrides, setLocalTaskStatusOverrides] = createSignal<Record<string, string>>({});

  const allTasks = () => fleetRecentTasks(props.fleet);
  const pending = createMemo(() =>
    fleetPendingTasks(props.fleet).filter(
      (t) => !props.resolvedPendingIds.includes(t.id) && !props.cancelledPendingIds.includes(t.id),
    )
  );

  createEffect(() => {
    const tasksById = new Map(allTasks().map((task) => [task.id, task.status] as const));
    const cancellableTaskIds = new Set(
      fleetActiveOrPendingTasks(props.fleet).map((task) => task.id),
    );
    setConfirmCancelId((prev) => (prev && cancellableTaskIds.has(prev) ? prev : null));
    setCancelingId((prev) => (prev && cancellableTaskIds.has(prev) ? prev : null));
    setLocalTaskStatusOverrides((prev) => {
      const next: Record<string, string> = {};
      for (const [taskId, status] of Object.entries(prev)) {
        const liveStatus = tasksById.get(taskId);
        if (liveStatus && liveStatus !== status) next[taskId] = status;
      }
      return next;
    });
  });

  const tasksWithLocalStatus = createMemo(() =>
    allTasks().map((task) => {
      const overrideStatus = localTaskStatusOverrides()[task.id];
      return overrideStatus ? { ...task, status: overrideStatus } : task;
    })
  );

  const filtered = createMemo(() => {
    const f = filter();
    const tasks = tasksWithLocalStatus();
    if (f === "all") return tasks;
    if (f === "active") return tasks.filter((t) => isAgentFleetTaskCancellable(t));
    if (f === "completed") return tasks.filter((t) => isAgentFleetTaskCompleted(t));
    if (f === "failed") return tasks.filter((t) => isAgentFleetTaskFailed(t));
    return tasks.filter((t) => isAgentFleetTaskCancelled(t));
  });

  const filterCounts = createMemo(() => ({
    all: tasksWithLocalStatus().length,
    active: tasksWithLocalStatus().filter((t) => isAgentFleetTaskCancellable(t)).length,
    completed: tasksWithLocalStatus().filter((t) => isAgentFleetTaskCompleted(t)).length,
    failed: tasksWithLocalStatus().filter((t) => isAgentFleetTaskFailed(t)).length,
    cancelled: tasksWithLocalStatus().filter((t) => isAgentFleetTaskCancelled(t)).length,
  }));

  async function handleCancel(id: string) {
    const wasPending = allTasks().some((task) => task.id === id && isAgentFleetTaskPending(task));
    setActionError(null);
    setCancelingId(id);
    setConfirmCancelId(null);
    try {
      await cancelTask(id);
      setLocalTaskStatusOverrides((prev) => ({ ...prev, [id]: "cancelled" }));
      if (wasPending) props.onCancelPendingTasks([id]);
    } catch (error) {
      setActionError(
        buildAgentDashboardActionFailureReceipt(
          "Cancel task",
          error instanceof Error ? error.message : "Could not cancel this task.",
        ),
      );
    }
    setCancelingId(null);
  }

  async function handleQueueDecision(taskId: string, decision: "approve" | "reject") {
    setActionError(null);
    try {
      await resolveAgentTask(taskId, decision);
      props.onResolvePendingTasks([taskId]);
    } catch (error) {
      setActionError(
        buildAgentDashboardActionFailureReceipt(
          `${decision === "approve" ? "Approve" : "Reject"} queued task`,
          error instanceof Error ? error.message : `Could not ${decision} this task.`,
        ),
      );
    }
  }

  const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "completed", label: "Done" },
    { id: "failed", label: "Failed" },
    { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <div class="space-y-5">
      <Show when={actionError()}>
        <div
          class={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
            actionError()?.tone === "danger"
              ? "border border-red-300/60 bg-red-50/90 text-red-900"
              : "border border-amber-300/50 bg-amber-50/90 text-amber-900"
          }`}
        >
          <div class="flex items-center justify-between gap-3">
            <div class="space-y-1">
              <p class="font-medium">{actionError()?.title}</p>
              <p class="text-xs opacity-90">{actionError()?.summary}</p>
              <p class="text-xs opacity-80">{actionError()?.nextStep}</p>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              class={`rounded px-2 py-1 text-xs font-medium hover:bg-white/70 ${
                actionError()?.tone === "danger" ? "text-red-900" : "text-amber-900"
              }`}
            >
              Dismiss
            </button>
          </div>
        </div>
      </Show>

      <Show when={pending().length > 0}>
        <section>
          <div class="mb-2 flex items-center gap-2">
            <h3 class="label-caps">Approval Queue</h3>
            <span class="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white animate-pulse">
              {pending().length}
            </span>
          </div>
          <div class="space-y-2">
            <For each={pending()}>
              {(t) => (
                // 14j â€" each pending task card is keyboard focusable (Enter=approve, Del=reject)
                <div
                  tabIndex={0}
                  onKeyDown={useApprovalKeyboard({
                    onApprove: () => {
                      void handleQueueDecision(t.id, "approve");
                    },
                    onReject: () => {
                      void handleQueueDecision(t.id, "reject");
                    },
                  })}
                  class="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-50/10 p-3 outline-none focus:ring-2 focus:ring-amber-400/50"
                >
                  <span class="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-on-surface">{t.intent ?? t.content ?? t.id}</p>
                    <p class="mt-1 text-sm leading-relaxed text-on-surface">{taskExplainer(t)}</p>
                    <p class="text-xs text-on-surface-variant mt-0.5">
                      Priority: {t.priority} - {relativeTimeFromNow(props.now, t.created_at)}
                      <span class="ml-2 opacity-50">- {agentApprovalKeyboardHint()}</span>
                    </p>
                  </div>
                    <div class="flex gap-1 flex-shrink-0">
                      <ApprovalDecisionButtons
                        class="flex gap-1"
                        onApprove={() => {
                          void handleQueueDecision(t.id, "approve");
                        }}
                        onReject={() => {
                          void handleQueueDecision(t.id, "reject");
                        }}
                        approveClass="rounded-lg border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-500/20 transition-colors"
                        rejectClass="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/20 transition-colors"
                      />
                    </div>
                </div>
              )}
            </For>
            <ApprovalDecisionNotice
              decision="rejected"
              context="queued_execution"
              class="border-0 bg-transparent px-0 py-0 text-[10px] text-amber-800/80"
              detailClass="text-amber-800/80"
            />
          </div>
        </section>
      </Show>

      <section>
        <div class="mb-3 flex items-center justify-between">
          <h3 class="label-caps">Task Log</h3>
          <div class="flex gap-1">
            <For each={FILTERS}>
              {(f) => {
                const count = filterCounts()[f.id];
                return (
                  <button
                    type="button"
                    onClick={() => setFilter(f.id)}
                    class={`rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${
                      filter() === f.id
                        ? "bg-primary/20 text-primary"
                        : "text-on-surface-variant hover:bg-white/20"
                    }`}
                  >
                    {f.label}
                    <Show when={count > 0}>
                      <span class="ml-1 opacity-60">{count}</span>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>

        <div class="space-y-2">
          <Show
            when={filtered().length > 0}
            fallback={
              <div class="rounded-xl border border-white/15 bg-white/5 py-8 text-center">
                <p class="text-sm text-on-surface-variant">
                  {filter() === "all"
                    ? "Your agent is ready. Give it something to work on."
                    : `No ${filter()} tasks.`}
                </p>
              </div>
            }
          >
            <For each={filtered()}>
              {(t) => {
                const isActive = () => isAgentFleetTaskCancellable(t);
                const duration = createMemo(() => {
                  if (!isActive() || !t.started_at) return null;
                  return formatMs(props.now - new Date(t.started_at).getTime());
                });
                // 13m â€" elapsed progress bar: caps at 5 min, pulses near limit
                const elapsedPct = createMemo(() => {
                  if (!isActive() || !t.started_at) return 0;
                  const elapsedMs = props.now - new Date(t.started_at).getTime();
                  return Math.min(100, (elapsedMs / (5 * 60 * 1000)) * 100);
                });
                const isConfirming = () => confirmCancelId() === t.id;

                return (
                  <div class="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 hover:bg-white/10 transition-colors">
                    <div class="flex items-center gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-xs font-medium text-on-surface">{t.intent ?? t.content ?? t.id}</p>
                      <p class="mt-1 truncate text-sm text-on-surface">{taskNarration(t)}</p>
                      {/* 14e â€" workflow step breadcrumb derived from intent */}
                      <Show when={t.intent && t.intent.toLowerCase().includes("->")}>
                        <p class="mt-0.5 flex items-center gap-1 flex-wrap text-[9px] text-on-surface-variant/50 font-mono">
                          <For each={(t.intent ?? "").split("->").map(s => s.trim()).filter(Boolean)}>
                            {(step, si) => (
                              <>
                                <Show when={si() > 0}><span class="opacity-40">{"->"}</span></Show>
                                <span class={si() === (t.intent ?? "").split("->").length - 1 ? "text-primary/70 font-semibold" : ""}>{step}</span>
                              </>
                            )}
                          </For>
                        </p>
                      </Show>
                      {/* ITEM 4 — ETA countdown */}
                      <Show when={isActive() && t.estimated_end_at}>
                        {(() => {
                          const remaining = Math.floor((new Date(t.estimated_end_at!).getTime() - props.now) / 1000);
                          const label = etaCountdownFromNow(props.now, t.estimated_end_at!);
                          return (
                            <p class={`mt-0.5 text-[10px] ${remaining < 60 && remaining > 0 ? "text-amber-500" : "text-on-surface-variant"}`}>
                              {label}
                            </p>
                          );
                        })()}
                      </Show>
                      <p class="mt-0.5 text-[10px] text-on-surface-variant" title={new Date(t.created_at).toISOString()}>
                        {relativeTimeFromNow(props.now, t.created_at)} - {t.priority}
                        <Show when={duration()}>
                          <span class="ml-1 text-blue-400"> - {duration()} elapsed</span>
                        </Show>
                      </p>
                    </div>
                    <span class={`rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0 ${statusBg(t.status)}`}>
                      {t.status}
                    </span>
                    {/* 14r â€" workflow output diff indicator for completed write actions */}
                    <Show when={isAgentFleetTaskCompleted(t) && t.intent && /write|creat|edit|updat|delet|modif/i.test(t.intent)}>
                      <button
                        type="button"
                        onClick={() => {
                          if (t.thread_id) {
                            dispatchOpenThreadEvent({ threadId: t.thread_id });
                          }
                        }}
                        title="This task made changes - view the thread to see the before-and-after output"
                        class="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-400 border border-blue-400/30 hover:bg-blue-500/10 transition-colors"
                      >
                        diff
                      </button>
                    </Show>
                    <Show when={isActive()}>
                      <Show
                        when={isConfirming()}
                        fallback={
                          <button
                            type="button"
                            class="rounded px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/10 flex-shrink-0 transition-colors"
                            onClick={() => setConfirmCancelId(t.id)}
                          >
                            Cancel
                          </button>
                        }
                      >
                        <div class="flex items-center gap-1 flex-shrink-0">
                          <span class="text-[10px] text-on-surface-variant">Sure?</span>
                          <button
                            type="button"
                            disabled={cancelingId() === t.id}
                            class="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-500/10"
                            onClick={() => handleCancel(t.id)}
                          >
                            {cancelingId() === t.id ? "..." : "Yes"}
                          </button>
                          <button
                            type="button"
                            class="rounded px-1.5 py-0.5 text-[10px] text-on-surface-variant hover:bg-white/20"
                            onClick={() => setConfirmCancelId(null)}
                          >
                            No
                          </button>
                        </div>
                      </Show>
                    </Show>
                    </div>
                    {/* 15j â€" failure recovery breadcrumb: retry options below failed tasks */}
                    <Show when={isAgentFleetTaskFailed(t)}>
                      <div class="mt-2 flex flex-wrap items-center gap-1.5">
                        <span class="text-[10px] text-red-500/70">Try:</span>
                        {FAILED_TASK_RECOVERY_SUGGESTIONS.map(suggestion => (
                          <button
                            type="button"
                            class="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] text-on-surface-variant transition hover:bg-white/25 hover:text-on-surface"
                            title={`Re-run as: "${suggestion}: ${t.intent ?? t.content ?? ""}"`}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </Show>
                    {/* 13m â€" elapsed progress bar for active tasks */}
                    <Show when={isActive() && elapsedPct() > 0}>
                      <div class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/15" title={`${Math.round(elapsedPct())}% of 5-min expected window`}>
                        <div
                          class={`h-full rounded-full transition-all ${elapsedPct() >= 80 ? "bg-amber-400" : "bg-blue-400"}`}
                          style={`width:${elapsedPct()}%`}
                        />
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>
      </section>
    </div>
  );
}

function MemoryTab(props: {
  memory: AgentMemoryResponse | null;
  loading: boolean;
  loadError: AgentDashboardLoadFailureReceipt | null;
  now: number;
  tier: string;
  harness: string;
  tokenBudget: number;
  includeStale: boolean;
  onTierChange: (value: string) => void;
  onHarnessChange: (value: string) => void;
  onTokenBudgetChange: (value: number) => void;
  onIncludeStaleChange: (value: boolean) => void;
  onRefresh: () => void;
}) {
  const items = createMemo(() => props.memory?.items ?? []);
  const warnings = createMemo(() => props.memory?.warnings ?? []);
  const pointerBundle = createMemo(() => props.memory?.pointer_bundle ?? null);

  return (
    <div class="space-y-5">
      <div class="rounded-2xl border border-white/30 bg-white/20 p-4">
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex min-w-[140px] flex-col gap-1 text-xs text-on-surface-variant">
            <span class="font-semibold uppercase tracking-[0.14em] text-on-surface">Tier</span>
            <select
              value={props.tier}
              onChange={(event) => props.onTierChange(event.currentTarget.value)}
              class="rounded-xl border border-white/30 bg-white/70 px-3 py-2 text-sm text-on-surface"
            >
              <option value="session">Session</option>
              <option value="project">Project</option>
              <option value="long_term">Long-term</option>
            </select>
          </label>
          <label class="flex min-w-[160px] flex-col gap-1 text-xs text-on-surface-variant">
            <span class="font-semibold uppercase tracking-[0.14em] text-on-surface">Harness</span>
            <select
              value={props.harness}
              onChange={(event) => props.onHarnessChange(event.currentTarget.value)}
              class="rounded-xl border border-white/30 bg-white/70 px-3 py-2 text-sm text-on-surface"
            >
              <option value="handoff">Handoff</option>
              <option value="review">Review</option>
              <option value="debug">Debug</option>
              <option value="architecture">Architecture</option>
              <option value="refactor">Refactor</option>
              <option value="incident">Incident</option>
            </select>
          </label>
          <label class="flex min-w-[140px] flex-col gap-1 text-xs text-on-surface-variant">
            <span class="font-semibold uppercase tracking-[0.14em] text-on-surface">Token budget</span>
            <input
              type="number"
              min="0"
              step="10"
              value={props.tokenBudget}
              onInput={(event) => props.onTokenBudgetChange(Number(event.currentTarget.value) || 0)}
              class="rounded-xl border border-white/30 bg-white/70 px-3 py-2 text-sm text-on-surface"
            />
          </label>
          <label class="flex items-center gap-2 rounded-xl border border-white/30 bg-white/50 px-3 py-2 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={props.includeStale}
              onChange={(event) => props.onIncludeStaleChange(event.currentTarget.checked)}
            />
            Include stale
          </label>
          <button
            type="button"
            onClick={props.onRefresh}
            class="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            {props.loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        <Show when={props.loadError}>
          <div
            class={`mt-3 rounded-2xl border px-3 py-2 text-sm ${
              props.loadError?.tone === "danger"
                ? "border-rose-300/60 bg-rose-50/80 text-rose-700"
                : "border-amber-300/60 bg-amber-50/80 text-amber-900"
            }`}
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="font-semibold">{props.loadError?.title}</p>
                <p class="mt-1">{props.loadError?.summary}</p>
                <p class="mt-1 text-xs opacity-80">{props.loadError?.nextStep}</p>
              </div>
              <button
                type="button"
                onClick={props.onRefresh}
                class="font-medium underline underline-offset-2"
              >
                Retry memory
              </button>
            </div>
          </div>
        </Show>
        <Show when={props.memory?.message}>
          <p class="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-800">
            {props.memory?.message}
          </p>
        </Show>
      </div>

      <Show when={pointerBundle()}>
        <div class="rounded-2xl border border-sky-200/60 bg-sky-50/70 p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="label-caps text-sky-700">Pointer bundle</p>
              <p class="mt-1 text-sm text-sky-900">
                {pointerBundle()!.items.length} items - token estimate {pointerBundle()!.token_estimate}
              </p>
            </div>
            <span class="rounded-full border border-sky-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
              {pointerBundle()!.harness || props.harness}
            </span>
          </div>
          <pre class="mt-3 overflow-auto rounded-2xl border border-sky-100 bg-white/80 p-3 text-xs leading-6 text-sky-950 whitespace-pre-wrap">
            {pointerBundle()!.pointers_text}
          </pre>
        </div>
      </Show>

      <Show when={warnings().length > 0}>
        <div class="rounded-2xl border border-amber-200/60 bg-amber-50/60 p-4">
          <p class="label-caps text-amber-700">Warnings</p>
          <div class="mt-3 space-y-2">
            <For each={warnings()}>
              {(warning) => (
                <div class="rounded-xl border border-amber-200/60 bg-white/70 px-3 py-2 text-sm text-amber-900">
                  <p class="font-medium">{warning.message}</p>
                  <p class="mt-1 text-[11px] uppercase tracking-[0.12em] text-amber-700">
                    {warning.code}{warning.memory_id ? ` - ${warning.memory_id}` : ""}
                  </p>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <div class="rounded-2xl border border-white/30 bg-white/20 p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="label-caps">Memory items</p>
            <p class="mt-1 text-sm text-on-surface-variant">
              Agent memory stored as Ledger AFP messages across session, project, and long-term tiers.
            </p>
          </div>
          <span class="rounded-full bg-white/50 px-3 py-1 text-xs text-on-surface-variant">
            {items().length} items
          </span>
        </div>
        <div class="mt-4 space-y-3">
          <Show
            when={items().length > 0}
            fallback={
              <Show
                when={!props.loadError}
                fallback={
                  <div
                    class={`rounded-2xl border px-4 py-3 text-sm ${
                      props.loadError?.tone === "danger"
                        ? "border-rose-300/60 bg-rose-50/80 text-rose-700"
                        : "border-amber-300/60 bg-amber-50/80 text-amber-900"
                    }`}
                  >
                    <p class="font-semibold">{props.loadError?.title}</p>
                    <p class="mt-1">{props.loadError?.summary}</p>
                    <p class="mt-1 text-xs opacity-80">{props.loadError?.nextStep}</p>
                  </div>
                }
              >
                <p class="text-sm text-on-surface-variant">Nothing stored here yet - your agent will remember important things as you work together.</p>
              </Show>
            }
          >
            <For each={items()}>
              {(item) => (
                <div class="rounded-2xl border border-white/30 bg-white/50 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="flex flex-wrap gap-2">
                      <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                        {item.tier}
                      </span>
                      <span class="rounded-full border border-violet-200/70 bg-violet-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                        {item.type}
                      </span>
                      <span class={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusBg(item.status ?? "")}`}>
                        {item.status}
                      </span>
                    </div>
                    <span class="text-[11px] text-on-surface-variant">{relativeTimeFromNow(props.now, item.updated_at ?? item.created_at)}</span>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-on-surface">{item.content}</p>
                  <div class="mt-3 flex flex-wrap gap-4 text-[11px] text-on-surface-variant">
                    <span>confidence {((item.confidence ?? 0) * 100).toFixed(0)}%</span>
                    <Show when={item.namespace}><span>namespace {item.namespace}</span></Show>
                    <Show when={item.role}><span>role {item.role}</span></Show>
                    <Show when={item.repo_state_hash}>
                      <span title={item.repo_state_hash ?? undefined}>repo {item.repo_state_hash?.slice(0, 12)}</span>
                    </Show>
                  </div>
                  <Show when={(item.citations ?? []).length > 0}>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <For each={item.citations ?? []}>
                        {(citation) => (
                          <span class="rounded-full border border-white/40 bg-white/70 px-2.5 py-1 text-[10px] text-on-surface-variant">
                            {citation}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
}

// â"€â"€ History Tab (8g) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function normalizeQueryHistoryText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// 14s â€" generate a markdown session handoff summary
function generateHandoffSummary(nowMs: number, history: AgentDashboardQueryHistoryEntry[], tasks: AgentTask[]): string {
  const lines = [`# OmnyID Session Handoff - ${new Date(nowMs).toLocaleString()}`, ""];
  lines.push("## Recent Queries");
  for (const h of history.slice(0, 10)) {
    lines.push(`- **${h.query}** (${h.view || "chat"}, ${relativeTimeFromNow(nowMs, h.ts)})`);
  }
  lines.push("");
  lines.push("## Recent Tasks");
  for (const t of tasks.slice(0, 10)) {
    lines.push(`- [${t.status}] ${t.intent ?? t.content ?? t.id} - ${relativeTimeFromNow(nowMs, t.created_at)}`);
  }
  return lines.join("\n");
}

function HistoryTab(props: { tasks: AgentTask[]; now: number }) {
  const sessionUserId = readSession()?.user?.id ?? null;
  const [historyVersion, setHistoryVersion] = createSignal(0);
  const history = createMemo(() => {
    historyVersion();
    return loadAgentDashboardQueryHistory(sessionUserId);
  });
  const [search, setSearch] = createSignal("");
  const [summaryCopied, setSummaryCopied] = createSignal(false);
  const [actionError, setActionError] = createSignal<AgentDashboardActionFailureReceipt | null>(null);
  const normalizedSearch = createMemo(() => normalizeQueryHistoryText(search()).toLowerCase());
  let summaryCopiedTimer: ReturnType<typeof setTimeout> | null = null;
  let summaryCopyRequestVersion = 0;

  onMount(() => {
    const refreshHistory = () => setHistoryVersion((value) => value + 1);
    const handleStorage = (event: StorageEvent) => {
      if (isAgentDashboardQueryHistoryStorageEvent(event, sessionUserId)) refreshHistory();
    };
    const unsubscribeQueryHistory = subscribeAgentDashboardQueryHistoryChanges(refreshHistory);
    window.addEventListener("storage", handleStorage);
    onCleanup(() => {
      window.removeEventListener("storage", handleStorage);
      unsubscribeQueryHistory();
    });
  });

  onCleanup(() => {
    if (summaryCopiedTimer) clearTimeout(summaryCopiedTimer);
  });

  const filtered = createMemo(() => {
    const q = normalizedSearch();
    return history().filter(h => !q || h.query.toLowerCase().includes(q) || h.view.toLowerCase().includes(q));
  });

  return (
    <div class="space-y-4">
      <Show when={actionError()}>
        <div
          class={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
            actionError()?.tone === "danger"
              ? "border border-red-300/60 bg-red-50/90 text-red-900"
              : "border border-amber-300/50 bg-amber-50/90 text-amber-900"
          }`}
        >
          <div class="flex items-center justify-between gap-3">
            <div class="space-y-1">
              <p class="font-medium">{actionError()?.title}</p>
              <p class="text-xs opacity-90">{actionError()?.summary}</p>
              <p class="text-xs opacity-80">{actionError()?.nextStep}</p>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              class={`rounded px-2 py-1 text-xs font-medium hover:bg-white/70 ${
                actionError()?.tone === "danger" ? "text-red-900" : "text-amber-900"
              }`}
            >
              Dismiss
            </button>
          </div>
        </div>
      </Show>

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p class="label-caps mb-1">Query History</p>
          <p class="text-xs text-on-surface-variant">Last 50 queries sent to the agent from this browser.</p>
        </div>
        <button
          type="button"
          class="flex-shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
          title="Copy a markdown summary of this session to clipboard"
          onClick={() => {
            const requestVersion = ++summaryCopyRequestVersion;
            setActionError(null);
            setSummaryCopied(false);
            if (summaryCopiedTimer) {
              clearTimeout(summaryCopiedTimer);
              summaryCopiedTimer = null;
            }
            try {
              const md = generateHandoffSummary(props.now, history(), props.tasks);
              const clipboard = navigator.clipboard;
              if (!clipboard?.writeText) {
                throw new Error("Clipboard access is not available in this browser context.");
              }
              clipboard.writeText(md).then(() => {
                if (requestVersion !== summaryCopyRequestVersion) return;
                setSummaryCopied(true);
                if (summaryCopiedTimer) clearTimeout(summaryCopiedTimer);
                summaryCopiedTimer = setTimeout(() => {
                  if (requestVersion !== summaryCopyRequestVersion) return;
                  setSummaryCopied(false);
                  summaryCopiedTimer = null;
                }, 2000);
              }).catch((error: unknown) => {
                if (requestVersion !== summaryCopyRequestVersion) return;
                setActionError(
                  buildAgentDashboardActionFailureReceipt(
                    "Copy session summary",
                    error instanceof Error ? error.message : "Could not copy session summary.",
                  ),
                );
                setSummaryCopied(false);
              });
            } catch (error) {
              if (requestVersion !== summaryCopyRequestVersion) return;
              setActionError(
                buildAgentDashboardActionFailureReceipt(
                  "Copy session summary",
                  error instanceof Error ? error.message : "Could not copy session summary.",
                ),
              );
              setSummaryCopied(false);
            }
          }}
        >
          {summaryCopied() ? "Copied summary" : "Copy session summary"}
        </button>
        <button
          type="button"
          class="flex-shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-white/20 hover:text-on-surface"
          title="Download a JSON audit log of every agent action in this session"
          onClick={() => {
            setActionError(null);
            try {
              const exportedAt = new Date(props.now).toISOString();
              const exportStamp = exportedAt.replace(/[:]/g, "-");
              const log = {
                exported_at: exportedAt,
                session_origin: window.location.origin,
                queries: history(),
                tasks: props.tasks.map(t => ({
                  id: t.id,
                  intent: t.intent ?? t.content,
                  status: t.status,
                  priority: t.priority,
                  created_at: t.created_at,
                  started_at: t.started_at,
                })),
              };
              const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `omnyid-audit-${exportStamp}.json`;
              a.style.display = "none";
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                URL.revokeObjectURL(url);
                a.remove();
              }, 0);
            } catch (error) {
              setActionError(
                buildAgentDashboardActionFailureReceipt(
                  "Download audit log",
                  error instanceof Error ? error.message : "Download blocked",
                ),
              );
            }
          }}
        >
          Download audit log
        </button>
      </div>
      <input
        type="search"
        placeholder="Search history..."
        class="w-full rounded-xl border border-white/30 bg-white/25 px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:border-primary/60"
        value={search()}
        onInput={e => setSearch((e.target as HTMLInputElement).value)}
      />
      <Show
        when={filtered().length > 0}
        fallback={
          <div class="rounded-xl border border-white/15 bg-white/5 py-8 text-center">
            <p class="text-sm text-on-surface-variant">
              {normalizedSearch() ? "No history matches your search." : "No queries recorded yet - try asking your agent a question."}
            </p>
          </div>
        }
      >
        <div class="space-y-1.5">
          <For each={filtered()}>
            {(h) => (
              <div class="flex items-start gap-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-on-surface">{h.query}</p>
                  <p class="mt-0.5 text-[10px] text-on-surface-variant">
                    {"->"} {h.view || "chat"} - {relativeTimeFromNow(props.now, h.ts)}
                  </p>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* 8o â€" Running workflows section */}
      <Show when={props.tasks.filter(t => t.status === "executing" || t.status === "planning").length > 0}>
        <div>
          <p class="label-caps mb-2">Running Workflows</p>
          <div class="space-y-2">
            <For each={props.tasks.filter(t => t.status === "executing" || t.status === "planning")}>
              {(t) => (
                <div class="flex items-center gap-3 rounded-xl border border-blue-400/30 bg-blue-50/15 px-3 py-2.5">
                  <span class="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500 animate-pulse" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-medium text-on-surface">{t.intent ?? t.content ?? t.id}</p>
                    <p class="mt-1 truncate text-sm text-on-surface">{taskNarration(t)}</p>
                    <p class="text-[10px] text-blue-600">{t.status} - {relativeTimeFromNow(props.now, t.created_at)}</p>
                    {/* ITEM 5 — task progress bar */}
                    <Show when={t.status === "executing" || t.status === "planning"}>
                      {(() => {
                        const prog = typeof t.estimated_progress === "number" ? t.estimated_progress : null;
                        return (
                          <div class="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                            <Show
                              when={prog !== null}
                              fallback={<div class="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-primary/50" />}
                            >
                              <div class="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(prog ?? 0) * 100}%` }} />
                            </Show>
                          </div>
                        );
                      })()}
                    </Show>
                  </div>
                  <span class="rounded-full border border-blue-400/40 bg-blue-500/10 px-2 py-0.5 font-mono text-[9px] text-blue-700">
                    LIVE
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

// â"€â"€ Main Dashboard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// ── ITEM 3 — Completed task sparkline ─────────────────────────────────────

function CompletedSparkline(props: { data: number[] }) {
  const W = 60;
  const H = 20;
  const n = 7;
  const barW = W / n;
  const maxVal = () => Math.max(...props.data, 1);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style="display:inline-block;vertical-align:middle">
      {Array.from({ length: n }, (_, i) => {
        const val = props.data[i] ?? 0;
        const barH = Math.max(1, (val / maxVal()) * 18);
        return (
          <rect
            x={i * barW + 1}
            y={H - barH}
            width={barW - 2}
            height={barH}
            fill="#22c55e"
            rx="1"
          />
        );
      })}
    </svg>
  );
}

export function AgentDashboard() {
  const sessionUserId = readSession()?.user?.id ?? null;
  const [activeTab, setActiveTab] = createSignal<Tab>("overview");
  const [fleet, setFleet] = createSignal<FleetData>({});
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal<AgentDashboardLoadFailureReceipt | null>(null);
  const [spendLoadError, setSpendLoadError] = createSignal<AgentDashboardLoadFailureReceipt | null>(null);
  // 14l â€" task completion celebration
  const [celebration, setCelebration] = createSignal<string | null>(null);
  let prevCompletedIds = new Set<string>();
  let lastFleetInstanceId: string | null = null;
  let celebTimer: ReturnType<typeof setTimeout> | null = null;
  const [now, setNow] = createSignal(Date.now());
  // 15k â€" track last time agent was active (for "Last active N min ago" display)
  const [lastActiveMs, setLastActiveMs] = createSignal<number | null>(null);
  // 15m â€" empty approval queue affirmation
  const [showQueueClear, setShowQueueClear] = createSignal(false);
  let prevEffectivePendingCount = 0;
  let queueClearTimer: ReturnType<typeof setTimeout> | null = null;
  const [spendHistory, setSpendHistory] = createSignal<SpendHistoryEntry[]>([]);
  let latestSpendHistoryRequestId = 0;
  const [memoryLoading, setMemoryLoading] = createSignal(false);
  const [memoryLoadError, setMemoryLoadError] = createSignal<AgentDashboardLoadFailureReceipt | null>(null);
  const [memoryTier, setMemoryTier] = createSignal("project");
  const [memoryHarness, setMemoryHarness] = createSignal("handoff");
  const [memoryTokenBudget, setMemoryTokenBudget] = createSignal(180);
  const [memoryIncludeStale, setMemoryIncludeStale] = createSignal(false);
  const [memoryResponse, setMemoryResponse] = createSignal<AgentMemoryResponse | null>(null);
  const [resolvedPendingTaskIds, setResolvedPendingTaskIds] = createSignal<string[]>([]);
  const [cancelledPendingTaskIds, setCancelledPendingTaskIds] = createSignal<string[]>([]);
  let latestFleetRequestId = 0;
  let latestMemoryRequestId = 0;
  const recentFleetTasks = createMemo(() => fleetRecentTasks(fleet()));
  const masterInstanceId = createMemo(() => fleetMasterInstanceId(fleet()));

  async function loadFleet() {
    const requestId = ++latestFleetRequestId;
    setLoadError(null);
    try {
      const d = await getFleet();
      if (requestId !== latestFleetRequestId) return;
      const nextInstanceId = fleetMasterInstanceId(d);
      const instanceChanged = lastFleetInstanceId !== null && nextInstanceId !== lastFleetInstanceId;
      if (instanceChanged) {
        prevCompletedIds = new Set<string>();
        prevEffectivePendingCount = 0;
        setLastActiveMs(null);
        setCelebration(null);
        setShowQueueClear(false);
        setMemoryLoadError(null);
        setMemoryResponse(null);
        setResolvedPendingTaskIds([]);
        setCancelledPendingTaskIds([]);
        if (celebTimer) {
          clearTimeout(celebTimer);
          celebTimer = null;
        }
        if (queueClearTimer) {
          clearTimeout(queueClearTimer);
          queueClearTimer = null;
        }
      }
      // 14l â€" detect newly completed tasks and trigger celebration
      const nowCompleted = new Set(
        fleetRecentTasks(d).filter((task) => isAgentFleetTaskCompleted(task)).map((task) => task.id)
      );
      const newlyDone = [...nowCompleted].filter(id => !prevCompletedIds.has(id));
      if (newlyDone.length > 0 && prevCompletedIds.size > 0) {
        const task = fleetRecentTasks(d).find((entry) => entry.id === newlyDone[0]);
        const label = task?.intent?.slice(0, 50) ?? "Task";
        setCelebration(`${label} completed`);
        if (celebTimer) clearTimeout(celebTimer);
        celebTimer = setTimeout(() => setCelebration(null), 3500);
      }
      prevCompletedIds = nowCompleted;
      lastFleetInstanceId = nextInstanceId;
      // 15k â€" record last active timestamp when agent was running
      if (fleetActiveCount(d) > 0) setLastActiveMs(Date.now());
      setFleet(d);
    } catch (error) {
      if (requestId !== latestFleetRequestId) return;
      setLoadError(
        buildAgentDashboardLoadFailureReceipt(
          "Load agent dashboard",
          error instanceof Error ? error.message : "Could not load agent fleet.",
        ),
      );
      setFleet({});
    }
    if (requestId !== latestFleetRequestId) return;
    setLoading(false);
  }

  async function loadMemory() {
    const requestId = ++latestMemoryRequestId;
    setMemoryLoading(true);
    setMemoryLoadError(null);
    setMemoryResponse(null);
    try {
      const response = await fetchAgentMemory("master", {
        tier: memoryTier(),
        harness: memoryHarness(),
        token_budget: memoryTokenBudget(),
        include_stale: memoryIncludeStale(),
        limit: 12,
      });
      if (requestId !== latestMemoryRequestId) return;
      setMemoryResponse(response);
    } catch (error) {
      if (requestId !== latestMemoryRequestId) return;
      setMemoryLoadError(
        buildAgentDashboardLoadFailureReceipt(
          "Load agent memory",
          error instanceof Error ? error.message : "Could not load agent memory.",
        ),
      );
      setMemoryResponse(null);
    }
    if (requestId !== latestMemoryRequestId) return;
    setMemoryLoading(false);
  }

  async function loadSpendHistory() {
    const requestId = ++latestSpendHistoryRequestId;
    try {
      const history = await fetchSpendHistory(30);
      if (requestId !== latestSpendHistoryRequestId) return;
      setSpendLoadError(null);
      setSpendHistory(history?.history ?? []);
    } catch (error) {
      if (requestId !== latestSpendHistoryRequestId) return;
      setSpendHistory([]);
      setSpendLoadError(
        buildAgentDashboardLoadFailureReceipt(
          "Load spend history",
          error instanceof Error ? error.message : "Could not load spend history.",
        ),
      );
    }
  }

  onMount(() => {
    loadFleet();
    void loadSpendHistory();

    const unsub = subscribeFleet(() => loadFleet());
    onCleanup(unsub);

    const ticker = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(ticker));
    onCleanup(() => { if (celebTimer) clearTimeout(celebTimer); });
    onCleanup(() => { if (queueClearTimer) clearTimeout(queueClearTimer); });

    // Alt+1-6 keyboard shortcuts for tab switching
    function handleKey(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isEditableEventTarget(e.target)) return;
      const map: Record<string, Tab> = {
        "1": "overview",
        "2": "budget",
        "3": "skills",
        "4": "activity",
        "5": "memory",
        "6": "history",
      };
      const tab = map[e.key];
      if (tab) { e.preventDefault(); setActiveTab(tab); }
    }
    const unsubscribeShortcutsDismissed = subscribeAgentDashboardShortcutsDismissedStorage(() => {
      setShortcutsDismissed(loadAgentDashboardShortcutsDismissed(sessionUserId));
    }, sessionUserId);
    window.addEventListener("keydown", handleKey);
    onCleanup(() => window.removeEventListener("keydown", handleKey));
    onCleanup(() => unsubscribeShortcutsDismissed());
  });

  createEffect(() => {
    if (activeTab() !== "memory") {
      latestMemoryRequestId += 1;
      setMemoryLoading(false);
      return;
    }
    if (loading() || !!loadError() || !masterInstanceId()) {
      latestMemoryRequestId += 1;
      setMemoryLoading(false);
      setMemoryLoadError(null);
      setMemoryResponse(null);
      return;
    }
    masterInstanceId();
    memoryTier();
    memoryHarness();
    memoryTokenBudget();
    memoryIncludeStale();
    void loadMemory();
  });

  createEffect(() => {
    if (loading() || !!loadError()) return;
    const pendingIds = new Set(
      recentFleetTasks()
        .filter((task) => isAgentFleetTaskPending(task))
        .map((task) => task.id)
    );
    setResolvedPendingTaskIds((prev) => prev.filter((id) => pendingIds.has(id)));
    setCancelledPendingTaskIds((prev) => prev.filter((id) => pendingIds.has(id)));
  });

  function markPendingTasksResolved(taskIds: string[]) {
    if (taskIds.length === 0) return;
    setResolvedPendingTaskIds((prev) => [...new Set([...prev, ...taskIds])]);
  }

  function markPendingTasksCancelled(taskIds: string[]) {
    if (taskIds.length === 0) return;
    setCancelledPendingTaskIds((prev) => [...new Set([...prev, ...taskIds])]);
  }

  const pendingTasks = createMemo(() =>
    recentFleetTasks().filter(
      (t) =>
        isAgentFleetTaskPending(t) &&
        !resolvedPendingTaskIds().includes(t.id) &&
        !cancelledPendingTaskIds().includes(t.id)
    )
  );

  createEffect(() => {
    if (loading() || !!loadError()) {
      if (showQueueClear()) setShowQueueClear(false);
      if (queueClearTimer) {
        clearTimeout(queueClearTimer);
        queueClearTimer = null;
      }
      prevEffectivePendingCount = 0;
      return;
    }
    const pendingCount = pendingTasks().length;
    if (prevEffectivePendingCount > 0 && pendingCount === 0) {
      setShowQueueClear(true);
      if (queueClearTimer) clearTimeout(queueClearTimer);
      queueClearTimer = setTimeout(() => setShowQueueClear(false), 3500);
    }
    prevEffectivePendingCount = pendingCount;
  });

  // Item 3 (new) — keyboard shortcut hint strip
  const [shortcutsDismissed, setShortcutsDismissed] = createSignal(loadAgentDashboardShortcutsDismissed(sessionUserId));

  // Item 4 (new) — task status filter pills
  const [taskFilter, setTaskFilter] = createSignal<"all" | "running" | "queued" | "failed">("all");
  const filteredTasks = createMemo(() => {
    const tasks = recentFleetTasks();
    if (taskFilter() === "all") return tasks;
    return tasks.filter((t) =>
      taskFilter() === "running" ? isAgentFleetTaskActive(t) :
      taskFilter() === "queued" ? isAgentFleetTaskPending(t) :
      (isAgentFleetTaskFailed(t) || t.terminal_state === "failed")
    );
  });

  // ITEM 3 — last 7 days completed counts
  const last7DaysCompleted = createMemo(() => {
    const tasks = recentFleetTasks();
    const buckets = Array(7).fill(0);
    const nowMs = now();
    for (const t of tasks) {
      if (!isAgentFleetTaskCompleted(t)) continue;
      const daysAgo = Math.floor((nowMs - new Date(t.created_at).getTime()) / 86400000);
      if (daysAgo >= 0 && daysAgo < 7) {
        buckets[6 - daysAgo] = (buckets[6 - daysAgo] ?? 0) + 1;
      }
    }
    return buckets;
  });

  const totalSpend = createMemo(() =>
    spendHistory().reduce((s, h) => s + h.cost_usd, 0)
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "budget", label: "Budget" },
    { id: "skills", label: "Skills" },
    { id: "activity", label: "Activity" },
    { id: "memory", label: "Memory" },
    { id: "history", label: "History" },
  ];

  return (
    <div class="space-y-4">
      {/* 14l â€" task completion celebration toast */}
      <Show when={celebration()}>
        <div class="pointer-events-none fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 celebrate-pop">
          <div class="flex items-center gap-2.5 rounded-2xl border border-green-300/60 bg-green-50/95 px-5 py-3 text-sm font-medium text-green-800 shadow-xl backdrop-blur-sm">
            {celebration()}
          </div>
        </div>
      </Show>

      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-on-surface">Agents</h1>
          <p class="mt-0.5 text-xs text-on-surface-variant">
            Fleet, budgets, skills, and activity
            <span class="ml-2 opacity-40 hidden sm:inline">Alt+1-6 to switch tabs</span>
          </p>
        </div>
        {/* ITEM 3 — completed sparkline */}
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-on-surface-variant">7d done</span>
          <CompletedSparkline data={last7DaysCompleted()} />
        </div>
      </div>

      {/* Item 3 (new) — keyboard shortcut hint strip */}
      <Show when={!shortcutsDismissed()}>
        <div class="mb-3 flex items-center gap-4 rounded-xl border border-white/20 bg-white/30 px-4 py-2 text-xs text-on-surface-variant">
          <span class="font-medium text-on-surface">Shortcuts:</span>
          <span><kbd class="rounded border border-white/40 bg-white/60 px-1.5 py-0.5 font-mono text-[10px]">Alt+1-6</kbd> Switch tabs</span>
          <button type="button" class="ml-auto text-on-surface-variant/50 hover:text-on-surface-variant"
            onClick={() => {
              setShortcutsDismissed(saveAgentDashboardShortcutsDismissed(true, sessionUserId));
            }}>✕</button>
        </div>
      </Show>

      {/* Always-visible health bar */}
      <Show when={!loading() && !loadError()}>
        <AgentStatusBar
          fleet={fleet()}
          now={now()}
          pendingCount={pendingTasks().length}
          spendHistory={spendHistory()}
          totalSpend={totalSpend()}
          lastActiveMs={lastActiveMs()}
          onGoApprovals={() => setActiveTab("activity")}
        />
      </Show>

      <Show when={!loading() && loadError()}>
        <div
          class={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            loadError()?.tone === "danger"
              ? "border-rose-300/50 bg-rose-50/90 text-rose-700"
              : "border-amber-300/50 bg-amber-50/90 text-amber-900"
          }`}
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="font-medium">{loadError()?.title}</p>
              <p class="mt-1 text-xs opacity-80">{loadError()?.summary}</p>
              <p class="mt-1 text-xs opacity-80">{loadError()?.nextStep}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void loadFleet();
              }}
              class="rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs font-medium transition hover:bg-white"
            >
              Retry dashboard
            </button>
          </div>
        </div>
      </Show>

      <Show when={!loading() && !loadError() && spendLoadError()}>
        <div
          class={`rounded-2xl border px-4 py-2.5 text-xs ${
            spendLoadError()?.tone === "danger"
              ? "border-rose-300/40 bg-rose-50/70 text-rose-700"
              : "border-amber-300/40 bg-amber-50/70 text-amber-900"
          }`}
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="font-semibold">{spendLoadError()?.title}</p>
              <p class="mt-1">{spendLoadError()?.summary}</p>
              <p class="mt-1 opacity-80">{spendLoadError()?.nextStep}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadSpendHistory()}
              class="font-medium underline underline-offset-2"
            >
              Retry spend
            </button>
          </div>
        </div>
      </Show>

      {/* 15m â€" empty approval queue affirmation toast */}
      <Show when={showQueueClear()}>
        <div class="pointer-events-none fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 celebrate-pop">
          <div class="flex items-center gap-2.5 rounded-2xl border border-green-300/60 bg-green-50/95 px-5 py-3 text-sm font-medium text-green-800 shadow-xl backdrop-blur-sm">
            <span class="text-base">OK</span>
            <span>All tasks reviewed - you are up to date</span>
          </div>
        </div>
      </Show>

      {/* Inline approval banner â€" shown above tabs when not on activity tab */}
      <Show when={!loading() && !loadError() && pendingTasks().length > 0 && activeTab() !== "activity"}>
        <ApprovalBanner
          tasks={pendingTasks()}
          now={now()}
          resolvedTaskIds={resolvedPendingTaskIds()}
          onResolveTasks={markPendingTasksResolved}
        />
      </Show>

      {/* Tab bar */}
      <nav class="flex gap-1 rounded-2xl border border-white/30 bg-white/20 p-1" role="tablist">
        <For each={tabs}>
          {(tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab() === tab.id}
              class={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                activeTab() === tab.id
                  ? "bg-white/60 text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:bg-white/30"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <Show when={tab.id === "activity" && pendingTasks().length > 0}>
                <span class="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-white animate-pulse">
                  {pendingTasks().length}
                </span>
              </Show>
            </button>
          )}
        </For>
      </nav>

      {/* Tab content */}
      <div role="tabpanel">
        <Show when={loading()}>
          <p class="text-sm text-on-surface-variant">Loading...</p>
        </Show>
        <Show when={!loading() && !loadError()}>
        <Show when={activeTab() === "overview"}>
          <OverviewTab fleet={fleet()} now={now()} />
        </Show>
        <Show when={activeTab() === "budget"}>
          <BudgetTab now={now()} />
        </Show>
        <Show when={activeTab() === "skills"}>
          <SkillsTab tasks={recentFleetTasks()} now={now()} />
        </Show>
        <Show when={activeTab() === "activity"}>
          <ActivityTab
            fleet={fleet()}
            now={now()}
            resolvedPendingIds={resolvedPendingTaskIds()}
            cancelledPendingIds={cancelledPendingTaskIds()}
            onResolvePendingTasks={markPendingTasksResolved}
            onCancelPendingTasks={markPendingTasksCancelled}
          />
        </Show>
          <Show when={activeTab() === "memory"}>
            <MemoryTab
              memory={memoryResponse()}
              loading={memoryLoading()}
              loadError={memoryLoadError()}
              now={now()}
              tier={memoryTier()}
              harness={memoryHarness()}
              tokenBudget={memoryTokenBudget()}
              includeStale={memoryIncludeStale()}
              onTierChange={setMemoryTier}
              onHarnessChange={setMemoryHarness}
              onTokenBudgetChange={setMemoryTokenBudget}
              onIncludeStaleChange={setMemoryIncludeStale}
              onRefresh={() => void loadMemory()}
            />
          </Show>
          {/* 8g â€" Query history tab */}
          <Show when={activeTab() === "history"}>
            <HistoryTab tasks={recentFleetTasks()} now={now()} />
          </Show>
        </Show>
      </div>
    </div>
  );
}
import { dispatchOpenThreadEvent } from "@/lib/openThreadEvent";
