// @locs-version: 1.0
import { For, Show, createMemo, createSignal } from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { orchestrateAgent } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { loadAgentResponseStylePayload } from "@/lib/agentResponseStyle";
import {
  threadDashboardAvailableFiltersFromContent,
  type ThreadDashboardAvailableFilters,
  threadDashboardActionDefinition,
  type ThreadDashboardFilters,
  THREAD_DASHBOARD_CLEAR_FILTERS_LABEL,
  threadDashboardMatchesFilters,
  type ThreadDashboardActionButtonState,
  type ThreadDashboardActionId,
  type ThreadDashboardRowActionState,
  threadDashboardRowPresentationState,
  threadDashboardSummaryState,
  threadDashboardThreadsFromContent,
  type ThreadDashboardThreadRecord,
} from "@/lib/threadDashboardPresentationState";
import { threadDashboardTrustState } from "@/lib/threadDashboardTrustState";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";

type Thread = ThreadDashboardThreadRecord;

type AvailableFilters = ThreadDashboardAvailableFilters;

type RowAction = ThreadDashboardActionId;
type ActionButtonState = ThreadDashboardActionButtonState;

type ThreadRowState = {
  thread: Thread;
  fromText: ReturnType<typeof threadDashboardRowPresentationState>["fromText"];
  subjectText: ReturnType<typeof threadDashboardRowPresentationState>["subjectText"];
  relativeTimeText: ReturnType<typeof threadDashboardRowPresentationState>["relativeTimeText"];
  labels: ReturnType<typeof threadDashboardRowPresentationState>["labels"];
  showAttention: ReturnType<typeof threadDashboardRowPresentationState>["showAttention"];
  attentionTitle: ReturnType<typeof threadDashboardRowPresentationState>["attentionTitle"];
  suggestedActionText: ReturnType<typeof threadDashboardRowPresentationState>["suggestedActionText"];
  boundedReasonText: ReturnType<typeof threadDashboardRowPresentationState>["boundedReasonText"];
  actionReasonText: ReturnType<typeof threadDashboardRowPresentationState>["actionReasonText"];
  showSuggestedAction: ReturnType<typeof threadDashboardRowPresentationState>["showSuggestedAction"];
  showConfidence: ReturnType<typeof threadDashboardRowPresentationState>["showConfidence"];
  confidenceText: ReturnType<typeof threadDashboardRowPresentationState>["confidenceText"];
  confidenceClass: ReturnType<typeof threadDashboardRowPresentationState>["confidenceClass"];
  rowClass: ReturnType<typeof threadDashboardRowPresentationState>["rowClass"];
  showTooltip: ReturnType<typeof threadDashboardRowPresentationState>["showTooltip"];
  actionButtons: ActionButtonState[];
};

const THREAD_UNDO_LABEL = "Undo";
const THREAD_EMPTY_LABEL = "No threads match the current filters.";
const THREAD_NEEDS_ATTENTION_FALLBACK = "Needs attention";
const THREAD_ALL_CONTACTS = "All contacts";
const THREAD_ALL_LABELS = "All labels";
const THREAD_ALL_SUPERTAGS = "All supertags";

function threadReasonFilterText(thread: Thread): string {
  return threadDashboardTrustState({
    suggestedAction: thread.suggested_action ?? null,
    actionReason: thread.action_reason ?? null,
  }).reasonFilterText;
}

function threadRowState(props: {
  thread: Thread;
  rowActionStates: Partial<Record<RowAction, ThreadDashboardRowActionState>>;
  tooltipRowId: string | null;
}): ThreadRowState {
  const presentation = threadDashboardRowPresentationState({
    thread: props.thread,
    rowActionStates: props.rowActionStates,
    tooltipRowId: props.tooltipRowId,
    attentionFallbackTitle: THREAD_NEEDS_ATTENTION_FALLBACK,
  });

  return {
    thread: props.thread,
    ...presentation,
  };
}

export function ThreadDashboardRenderer(props: { message: AfpMessage }) {
  const content = createMemo(() => afpRecord(decryptedDisplayContent(props.message)));
  const allThreads = createMemo(() => threadDashboardThreadsFromContent(content()));
  const filters = createMemo(() => threadDashboardAvailableFiltersFromContent(content()));

  const [filterContact, setFilterContact] = createSignal("");
  const [filterLabel, setFilterLabel] = createSignal("");
  const [filterTag, setFilterTag] = createSignal("");
  const [rowStates, setRowStates] = createSignal<Record<string, Partial<Record<RowAction, ThreadDashboardRowActionState>>>>({});
  const [archivedIds, setArchivedIds] = createSignal<Set<string>>(new Set());
  const [tooltipRow, setTooltipRow] = createSignal<string | null>(null);
  const [undoThread, setUndoThread] = createSignal<Thread | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | undefined;

  const dashboardState = createMemo(() => {
    const activeFilters: ThreadDashboardFilters = {
      contactFilter: filterContact(),
      labelFilter: filterLabel(),
      tagFilter: filterTag(),
    };
    const archived = archivedIds();
    const visibleThreads = allThreads()
      .filter((thread) =>
        threadDashboardMatchesFilters({
          thread,
          archivedIds: archived,
          filters: activeFilters,
          reasonFilterText: threadReasonFilterText(thread),
        }),
      )
      .map((thread) =>
        threadRowState({
          thread,
          rowActionStates: rowStates()[thread.id] ?? {},
          tooltipRowId: tooltipRow(),
        }),
      );

    const undoThreadValue = undoThread();
    const summaryState = threadDashboardSummaryState({
      visibleThreads,
      filters: activeFilters,
      undoThreadSubject: undoThreadValue?.subject ?? null,
    });

    return {
      filters: filters(),
      visibleThreads,
      attentionCount: summaryState.attentionCount,
      showAttentionCount: summaryState.showAttentionCount,
      hasActiveFilters: summaryState.hasActiveFilters,
      visibleThreadCountText: summaryState.visibleThreadCountText,
      showEmpty: summaryState.showEmpty,
      undoThread: undoThreadValue,
      showUndoNotice: summaryState.showUndoNotice,
      undoSummary: summaryState.undoSummary,
    };
  });

  function clearFilters() {
    setFilterContact("");
    setFilterLabel("");
    setFilterTag("");
  }

  function setRowAction(threadId: string, action: RowAction, state: ThreadDashboardRowActionState) {
    setRowStates((previous) => ({
      ...previous,
      [threadId]: { ...(previous[threadId] ?? {}), [action]: state },
    }));
  }

  async function runAction(thread: Thread, action: RowAction) {
    if (action === "archive") {
      setArchivedIds((previous) => new Set([...previous, thread.id]));
      setUndoThread(thread);
      clearTimeout(undoTimer);
      undoTimer = setTimeout(() => setUndoThread(null), 5000);
      return;
    }

    const currentState = rowStates()[thread.id]?.[action] ?? "idle";
    if (currentState === "pending") return;

    setRowAction(thread.id, action, "pending");

    try {
      await orchestrateAgent({
        objective: threadDashboardActionDefinition(action).objective(thread),
        ...(await loadAgentResponseStylePayload()),
      });
      setRowAction(thread.id, action, "done");
      setTimeout(() => setRowAction(thread.id, action, "idle"), 3000);
    } catch {
      setRowAction(thread.id, action, "error");
      setTimeout(() => setRowAction(thread.id, action, "idle"), 3000);
    }
  }

  function undoArchive() {
    const thread = undoThread();
    if (!thread) return;
    setArchivedIds((previous) => {
      const next = new Set(previous);
      next.delete(thread.id);
      return next;
    });
    clearTimeout(undoTimer);
    setUndoThread(null);
  }

  return (
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <Show when={(dashboardState().filters.contacts ?? []).length > 0}>
          <select
            value={filterContact()}
            onChange={(event) => setFilterContact(event.currentTarget.value)}
            class={`rounded-lg border bg-white/10 px-3 py-1.5 text-xs text-on-surface-variant focus:outline-none ${filterContact() ? "border-primary/50" : "border-white/20"}`}
          >
            <option value="">{THREAD_ALL_CONTACTS}</option>
            <For each={dashboardState().filters.contacts ?? []}>
              {(contact) => <option value={contact}>{contact}</option>}
            </For>
          </select>
        </Show>

        <Show when={(dashboardState().filters.labels ?? []).length > 0}>
          <select
            value={filterLabel()}
            onChange={(event) => setFilterLabel(event.currentTarget.value)}
            class={`rounded-lg border bg-white/10 px-3 py-1.5 text-xs text-on-surface-variant focus:outline-none ${filterLabel() ? "border-primary/50" : "border-white/20"}`}
          >
            <option value="">{THREAD_ALL_LABELS}</option>
            <For each={dashboardState().filters.labels ?? []}>
              {(label) => <option value={label}>{label}</option>}
            </For>
          </select>
        </Show>

        <Show when={(dashboardState().filters.supertags ?? []).length > 0}>
          <select
            value={filterTag()}
            onChange={(event) => setFilterTag(event.currentTarget.value)}
            class={`rounded-lg border bg-white/10 px-3 py-1.5 text-xs text-on-surface-variant focus:outline-none ${filterTag() ? "border-primary/50" : "border-white/20"}`}
          >
            <option value="">{THREAD_ALL_SUPERTAGS}</option>
            <For each={dashboardState().filters.supertags ?? []}>
              {(tag) => <option value={tag}>{tag}</option>}
            </For>
          </select>
        </Show>

        <Show when={dashboardState().hasActiveFilters}>
          <button
            type="button"
            class="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs text-on-surface-variant transition hover:bg-white/10 hover:text-on-surface"
            onClick={clearFilters}
          >
            {THREAD_DASHBOARD_CLEAR_FILTERS_LABEL}
          </button>
        </Show>

        <Show when={dashboardState().showAttentionCount}>
          <span class="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-300">
            {dashboardState().attentionCount} need attention
          </span>
        </Show>

        <span class="ml-auto text-[11px] text-on-surface-variant">
          {dashboardState().visibleThreadCountText}
        </span>
      </div>

      <div class="overflow-x-auto rounded-xl border border-white/15">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-white/10 bg-white/5">
              <th class="px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant">
                From
              </th>
              <th class="px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant">
                Subject
              </th>
              <th class="hidden px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant sm:table-cell">
                Last activity
              </th>
              <th class="hidden px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant sm:table-cell">
                AI suggested action
              </th>
              <th
                class="hidden px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant md:table-cell"
                title="Agent confidence - how certain the agent is about its suggested action"
              >
                Conf.
              </th>
              <th class="px-3 py-2.5 text-right font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={!dashboardState().showEmpty}
              fallback={
                <tr>
                  <td colspan="6" class="py-8 text-center text-on-surface-variant">
                    {THREAD_EMPTY_LABEL}
                  </td>
                </tr>
              }
            >
              <For each={dashboardState().visibleThreads}>
                {(thread) => (
                  <tr class={thread.rowClass}>
                    <td class="px-3 py-2.5">
                      <div class="flex items-center gap-1.5">
                        <Show when={thread.showAttention}>
                          <span
                            class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400"
                            title={thread.attentionTitle}
                          />
                        </Show>
                        <span class="max-w-[100px] truncate font-medium text-on-surface">{thread.fromText}</span>
                      </div>
                    </td>

                    <td class="max-w-[200px] px-3 py-2.5">
                      <p class="truncate text-on-surface">{thread.subjectText}</p>
                      <div class="mt-0.5 flex flex-wrap gap-1">
                        <For each={thread.labels}>
                          {(label) => (
                            <span class="rounded bg-white/10 px-1 py-0.5 text-[9px] text-on-surface-variant">
                              {label}
                            </span>
                          )}
                        </For>
                      </div>
                    </td>

                    <td class="hidden whitespace-nowrap px-3 py-2.5 text-on-surface-variant sm:table-cell">
                      {thread.relativeTimeText}
                    </td>

                    <td class="hidden px-3 py-2.5 sm:table-cell">
                      <Show when={thread.showSuggestedAction}>
                        <div class="relative">
                          <button
                            type="button"
                            onMouseEnter={() => setTooltipRow(thread.thread.id)}
                            onMouseLeave={() => setTooltipRow(null)}
                            class="text-left text-on-surface-variant underline decoration-dotted underline-offset-2 hover:text-on-surface"
                          >
                            {thread.suggestedActionText}
                          </button>
                          <Show when={thread.showTooltip}>
                            <div class="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-lg border border-white/20 bg-[#1a1c1b] p-2.5 shadow-lg">
                              <div class="space-y-2">
                                <TrustSummaryBlocks
                                  boundedReason={thread.boundedReasonText}
                                  selectionReason={thread.actionReasonText}
                                  showSelectionReason={Boolean(thread.actionReasonText)}
                                  confidence={thread.confidenceText}
                                />
                              </div>
                            </div>
                          </Show>
                        </div>
                      </Show>
                    </td>

                    <td class="hidden px-3 py-2.5 md:table-cell">
                      <Show when={thread.showConfidence}>
                        <span class={`font-medium ${thread.confidenceClass}`}>{thread.confidenceText}</span>
                      </Show>
                    </td>

                    <td class="px-3 py-2.5">
                      <div class="flex flex-wrap items-center justify-end gap-1">
                        <For each={thread.actionButtons}>
                          {(action) => (
                            <button
                              type="button"
                              title={action.label}
                              aria-label={action.label}
                              disabled={action.disabled}
                              onClick={() => runAction(thread.thread, action.id)}
                              class={action.className}
                            >
                              <span class="mr-0.5">{action.icon}</span>
                              <span class="hidden sm:inline">{action.label}</span>
                              <span class="sr-only">{action.label}</span>
                            </button>
                          )}
                        </For>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
      </div>

      <Show when={dashboardState().showUndoNotice}>
        <div class="flex items-center justify-between rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs">
          <span class="text-on-surface-variant">
            <span class="font-medium text-on-surface">{dashboardState().undoSummary}</span>
          </span>
          <button
            type="button"
            class="font-medium text-primary transition hover:opacity-80"
            onClick={undoArchive}
          >
            {THREAD_UNDO_LABEL}
          </button>
        </div>
      </Show>
    </div>
  );
}
