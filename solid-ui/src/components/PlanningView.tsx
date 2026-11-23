// @locs-version: 1.0
/**
 * PlanningView
 *
 * The interactive planning assistant surface.
 * Implements the design spec: query bar, results canvas, editable context,
 * and threaded follow-ups.
 *
 * Architecture: manager-led stateful loop via POST /ui/planning.
 * Session state is kept client-side and forwarded on every follow-up so the
 * backend orchestrator can reason over prior constraints without re-parsing
 * raw chat history.
 */
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
  submitPlanningQuery,
  type PlanningQueryResponse,
} from "@/lib/api";
import {
  buildPlanningFailureReceipt,
  type PlanningFailureReceipt,
} from "@/lib/planningFailureState";
import {
  planningResultMessage,
  planningSessionState,
  planningThreadId,
} from "@/lib/planningViewState";
import { AgentImproveButton } from "@/components/editor/AgentImproveButton";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { PlanningCardRenderer } from "@/components/renderers/PlanningCardRenderer";

function EmptyState(props: { onSelect: (prompt: string) => void }) {
  return (
    <div class="flex flex-col items-center gap-4 py-12 text-center">
      <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl">
        P
      </div>
      <div>
        <h3 class="text-base font-semibold text-on-surface">Planning assistant</h3>
        <p class="mt-1 max-w-xs text-sm text-on-surface-variant">
          Ask a goal-oriented planning question. I&apos;ll find options, explain the reasoning,
          and let you refine assumptions.
        </p>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        {[
          "Best way to get to the city avoiding tolls",
          "Plan my commute for tomorrow morning",
          "Options for getting to the airport by 8pm",
        ].map((prompt) => (
          <button
            type="button"
            class="rounded-full border border-white/35 bg-white/20 px-3 py-1.5 text-xs text-on-surface-variant transition hover:bg-white/40 hover:text-on-surface"
            onClick={() => props.onSelect(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

type HistoryEntry =
  | { kind: "query"; text: string }
  | { kind: "result"; response: PlanningQueryResponse };

type RetryRequest =
  | { kind: "query"; text: string }
  | { kind: "assumption"; key: string; value: string };

export function PlanningView(props: { initialQuery?: string } = {}) {
  const [query, setQuery] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<PlanningFailureReceipt | null>(null);
  const [history, setHistory] = createSignal<HistoryEntry[]>([]);
  const [sessionState, setSessionState] = createSignal<Record<string, unknown> | null>(null);
  const [threadId, setThreadId] = createSignal<string | null>(null);
  const [confirmClear, setConfirmClear] = createSignal(false);
  const [retryRequest, setRetryRequest] = createSignal<RetryRequest | null>(null);

  const PLANNING_PHASES = [
    "Identifying options...",
    "Ranking by your constraints...",
    "Checking assumptions...",
  ];
  const [phaseIndex, setPhaseIndex] = createSignal(0);

  createEffect(() => {
    if (!loading()) return;
    setPhaseIndex(0);
    const id = setInterval(() => setPhaseIndex((i) => (i + 1) % PLANNING_PHASES.length), 2000);
    onCleanup(() => clearInterval(id));
  });

  const submit = async (text: string, options?: { appendHistory?: boolean }) => {
    const trimmed = text.trim();
    if (!trimmed || loading()) return;

    setError(null);
    setQuery("");
    setRetryRequest({ kind: "query", text: trimmed });
    if (options?.appendHistory !== false) {
      setHistory((entries) => [...entries, { kind: "query", text: trimmed }]);
    }
    setLoading(true);

    try {
      const response = await submitPlanningQuery({
        query: trimmed,
        session_state: sessionState() ?? undefined,
        thread_id: threadId() ?? undefined,
      });

      setHistory((entries) => [...entries, { kind: "result", response }]);
      setThreadId(planningThreadId(response));
      setSessionState(planningSessionState(response));
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(buildPlanningFailureReceipt("Planning query", message));
    } finally {
      setLoading(false);
    }
  };

  const submitAssumptionChange = async (key: string, value: string) => {
    const state = sessionState();
    if (!state || loading()) return;

    setError(null);
    setRetryRequest({ kind: "assumption", key, value });
    setLoading(true);

    try {
      const response = await submitPlanningQuery({
        query: "",
        assumption_delta: { key, value },
        session_state: state,
        thread_id: threadId() ?? undefined,
      });

      setHistory((entries) => [...entries, { kind: "result", response }]);
      setThreadId(planningThreadId(response));
      setSessionState(planningSessionState(response));
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(buildPlanningFailureReceipt("Assumption update", message));
    } finally {
      setLoading(false);
    }
  };

  const retryLastRequest = async () => {
    const request = retryRequest();
    if (!request || loading()) return;
    if (request.kind === "query") {
      await submit(request.text, { appendHistory: false });
      return;
    }
    await submitAssumptionChange(request.key, request.value);
  };

  onMount(() => {
    if (props.initialQuery?.trim()) {
      void submit(props.initialQuery.trim());
    }
  });

  return (
    <div class="flex h-full flex-col gap-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-base font-semibold text-on-surface">Planning</h2>
          <p class="text-[11px] text-on-surface-variant">
            Ask a goal, get ranked options with reasoning you can refine.
          </p>
        </div>
        <Show when={threadId()}>
          <Show
            when={!confirmClear()}
            fallback={
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] text-on-surface-variant">Clear session?</span>
                <button
                  type="button"
                  class="rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] text-red-400 transition hover:bg-red-500/25"
                  onClick={() => {
                    setHistory([]);
                    setSessionState(null);
                    setThreadId(null);
                    setConfirmClear(false);
                  }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  class="rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[10px] text-on-surface-variant transition hover:bg-white/30"
                  onClick={() => setConfirmClear(false)}
                >
                  No
                </button>
              </div>
            }
          >
            <button
              type="button"
              class="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[10px] text-on-surface-variant transition hover:bg-white/30"
              onClick={() => setConfirmClear(true)}
            >
              New session
            </button>
          </Show>
        </Show>
      </div>

      <div class="flex-1 overflow-y-auto">
        <Show when={history().length === 0}>
          <EmptyState onSelect={(prompt) => void submit(prompt)} />
        </Show>

        <div class="space-y-4">
          <For each={history()}>
            {(entry) => (
              <>
                <Show when={entry.kind === "query"}>
                  <div class="flex justify-end">
                    <div class="max-w-[80%] rounded-2xl rounded-br-md bg-primary/20 px-4 py-2.5">
                      <p class="text-sm text-on-surface">{(entry as { text: string }).text}</p>
                    </div>
                  </div>
                </Show>

                <Show when={entry.kind === "result"}>
                  <article class="glass-surface animate-fade-in rounded-2xl border border-white/35 p-4 shadow-panel">
                    <PlanningCardRenderer
                      message={planningResultMessage((entry as { response: PlanningQueryResponse }).response)}
                      onFollowUp={(text) => void submit(text)}
                      onAssumptionChange={(key, value) => void submitAssumptionChange(key, value)}
                      onPrefillQuery={(text) => setQuery(text)}
                    />
                  </article>
                </Show>
              </>
            )}
          </For>

          <Show when={loading()}>
            <div class="flex items-center gap-2 text-sm text-on-surface-variant">
              <span class="h-2 w-2 animate-ping rounded-full bg-primary" />
              {PLANNING_PHASES[phaseIndex()]}
            </div>
          </Show>

          <Show when={error()}>
            <div
              class={`rounded-xl border p-3 text-xs ${
                error()?.tone === "danger"
                  ? "border-red-400/30 bg-red-400/8 text-red-700"
                  : "border-amber-300/40 bg-amber-50/80 text-amber-900"
              }`}
            >
              <div class="space-y-1">
                <p class="font-semibold">{error()?.title}</p>
                <p>{error()?.summary}</p>
                <p class="text-[11px] opacity-80">Next step: {error()?.nextStep}</p>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <Show when={retryRequest()}>
                  <button
                    type="button"
                    class="rounded-full border border-current/20 bg-white/70 px-3 py-1.5 text-[11px] font-medium transition hover:bg-white"
                    onClick={() => void retryLastRequest()}
                  >
                    Retry last step
                  </button>
                </Show>
                <button
                  type="button"
                  class="rounded-full border border-current/20 bg-transparent px-3 py-1.5 text-[11px] font-medium opacity-80 transition hover:bg-white/20"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </Show>
        </div>
      </div>

      <div class="flex-shrink-0">
        <div class="rounded-2xl border border-white/35 bg-white/20 px-4 py-3 backdrop-blur">
          <div class="flex flex-col gap-2">
            <TiptapEditor
              mode="compact"
              initialContent={query()}
              disabled={loading()}
              placeholder={
                threadId()
                  ? 'Follow up - e.g. "Leave 20 mins later" or "Show the same by train"'
                  : 'Ask a planning goal - e.g. "Best way to get to the city by 7pm, avoiding tolls"'
              }
              submitLabel={loading() ? PLANNING_PHASES[phaseIndex()] ?? "Sending..." : "Send"}
              clearOnSend={false}
              onChange={(text) => setQuery(text)}
              onSend={async (payload) => {
                await submit(payload.text);
              }}
            />
            <div class="flex justify-end">
              <AgentImproveButton
                text={query()}
                onReplace={(text) => setQuery(text)}
              />
            </div>
          </div>
        </div>
        <p class="mt-1.5 text-center text-[10px] text-on-surface-variant/60">
          Press Ctrl+Enter to send. Shift+Enter adds a newline.
          {history().length > 0 ? " Chip taps continue the session." : ""}
        </p>
      </div>
    </div>
  );
}
