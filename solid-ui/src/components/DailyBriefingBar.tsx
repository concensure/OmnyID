// @locs-version: 1.0
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { ContinuityMessage } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import {
  generateProjections,
  generateTemporalProjection,
  getContinuitySummary,
  synthesizeBehaviorPatterns,
  synthesizeState,
} from "@/lib/api";
import {
  buildDailyBriefingFailureReceipt,
  type DailyBriefingFailureReceipt,
} from "@/lib/dailyBriefingFailureState";
import { dailyBriefingState } from "@/lib/dailyBriefingState";

function activateOnEnterOrSpace(event: KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export function DailyBriefingBar() {
  const [messages, setMessages] = createSignal<ContinuityMessage[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [loadError, setLoadError] = createSignal<DailyBriefingFailureReceipt | null>(null);
  const [refreshError, setRefreshError] = createSignal<DailyBriefingFailureReceipt | null>(null);
  const briefing = createMemo(() => dailyBriefingState(messages()));

  async function loadBriefing() {
    setLoadError(null);
    const data = await getContinuitySummary();
    setMessages(data.messages ?? []);
  }

  onMount(async () => {
    setLoading(true);
    try {
      await loadBriefing();
    } catch (error: unknown) {
      setLoadError(
        buildDailyBriefingFailureReceipt(
          "Load briefing",
          error instanceof Error ? error.message : "Could not load daily briefing.",
        ),
      );
    }
    setLoading(false);
  });

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await Promise.allSettled([
        synthesizeState(),
        synthesizeBehaviorPatterns(),
        generateTemporalProjection(7),
        generateProjections(),
      ]);
      await loadBriefing();
    } catch (error: unknown) {
      setRefreshError(
        buildDailyBriefingFailureReceipt(
          "Refresh briefing",
          error instanceof Error ? error.message : "Could not refresh daily briefing.",
        ),
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Show
      when={!loading()}
      fallback={
        <div class="glass-surface overflow-hidden rounded-xl border border-white/35 shadow-panel px-[1em] py-[0.75em] text-[0.7rem] text-on-surface-variant opacity-70">
          Loading briefing...
        </div>
      }
    >
      <Show
        when={!loadError()}
        fallback={
          <EmptyState
            icon="DB"
            title={loadError()?.title ?? "Could not load daily briefing"}
            body={`${loadError()?.summary ?? "Daily briefing is unavailable right now."} ${loadError()?.nextStep ?? ""}`.trim()}
            action={
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void loadBriefing()
                    .catch((error: unknown) => {
                      setLoadError(
                        buildDailyBriefingFailureReceipt(
                          "Load briefing",
                          error instanceof Error ? error.message : "Could not load daily briefing.",
                        ),
                      );
                    })
                    .finally(() => setLoading(false));
                }}
                class="rounded-xl border border-rose-200/70 bg-white/80 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-white"
              >
                Retry briefing
              </button>
            }
          />
        }
      >
      <div class="glass-surface overflow-hidden rounded-xl border border-white/35 shadow-panel">
        <div
          role="button"
          tabindex={0}
          class="flex w-full items-center gap-3 px-[1em] py-[0.75em] text-left transition hover:bg-white/10"
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(event) => activateOnEnterOrSpace(event, () => setExpanded((v) => !v))}
        >
          <span class="text-base leading-none">[]</span>
          <div class="min-w-0 flex-1">
            <p class="break-words text-xs font-semibold text-on-surface">
              {briefing().headline}
            </p>
            <Show when={briefing().summaryLine}>
              <p class="mt-[0.15em] break-words text-[0.65rem] text-on-surface-variant">
                {briefing().summaryLine}
              </p>
            </Show>
          </div>
          <span class="shrink-0 text-xs text-on-surface-variant">
            {expanded() ? "^" : "v"}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void refresh();
            }}
            disabled={refreshing()}
            class="ml-1 shrink-0 rounded-full border border-white/25 px-[0.65em] py-[0.45em] text-[0.65rem] text-on-surface-variant transition hover:bg-white/20 disabled:opacity-50 sm:py-[0.2em]"
            title="Refresh briefing"
          >
            {refreshing() ? "..." : "R"}
          </button>
        </div>

        <Show when={refreshError()}>
          <div
            classList={{
              "border-t px-[1em] py-[0.55em] text-[0.7rem]": true,
              "border-amber-200/40 bg-amber-50/85 text-amber-800": refreshError()?.tone !== "danger",
              "border-rose-200/40 bg-rose-50/85 text-rose-800": refreshError()?.tone === "danger",
            }}
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0 space-y-0.5">
                <p class="break-words font-semibold">{refreshError()?.title}</p>
                <p class="break-words">{refreshError()?.summary}</p>
                <p class="break-words opacity-80">{refreshError()?.nextStep}</p>
              </div>
              <button
                type="button"
                onClick={() => void refresh()}
                class="rounded-full border border-current/20 bg-white/80 px-2.5 py-1 text-[0.65rem] font-medium transition hover:bg-white"
              >
                Retry refresh
              </button>
            </div>
          </div>
        </Show>

        <Show when={expanded()}>
          <div class="space-y-[0.875em] border-t border-white/15 px-[1em] py-[0.75em]">
            <Show when={briefing().focusItems.length}>
              <div>
                <p class="mb-[0.4em] font-mono text-[0.55rem] uppercase tracking-[0.2em] text-outline">
                  Today's Focus
                </p>
                <ul class="space-y-[0.25em]">
                  <For each={briefing().focusItems}>
                    {(item) => (
                      <li class="flex min-w-0 items-start gap-[0.4em] text-[0.7rem] text-on-surface-variant">
                        <span class="mt-[0.15em] shrink-0 opacity-60">{">"}</span>
                        <span class="min-w-0 break-words">{item}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>

            <Show when={briefing().projectionCards.length > 0}>
              <div>
                <p class="mb-[0.4em] font-mono text-[0.55rem] uppercase tracking-[0.2em] text-outline">
                  Anticipatory Insights
                </p>
                <div class="space-y-[0.375em]">
                  <For each={briefing().projectionCards}>
                    {(card) => (
                      <div class="flex items-start gap-[0.5em] rounded-lg border border-white/15 bg-white/5 px-[0.6em] py-[0.4em]">
                        <span class="mt-[0.1em] shrink-0 text-sm leading-none">
                          {card.categoryIcon}
                        </span>
                        <div class="min-w-0 flex-1">
                          <p class={`break-words text-[0.7rem] font-medium ${card.urgencyToneClass}`}>
                            {card.headline}
                          </p>
                          <p class="break-words text-[0.65rem] leading-relaxed text-on-surface-variant">
                            {card.body}
                          </p>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={briefing().temporalProjectionSummaries.length > 0}>
              <div>
                <p class="mb-[0.4em] font-mono text-[0.55rem] uppercase tracking-[0.2em] text-outline">
                  Week Ahead
                </p>
                <For each={briefing().temporalProjectionSummaries}>
                  {(summary) => (
                    <div class="text-[0.7rem] leading-relaxed text-on-surface-variant">
                      [ ] {summary}
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <Show when={briefing().patternChips.length > 0}>
              <div>
                <p class="mb-[0.4em] font-mono text-[0.55rem] uppercase tracking-[0.2em] text-outline">
                  Your Patterns
                </p>
                <div class="flex flex-wrap gap-[0.375em]">
                  <For each={briefing().patternChips}>
                    {(chip) => (
                      <span class="flex items-center gap-[0.3em] rounded-full border border-white/20 bg-white/8 px-[0.6em] py-[0.2em] text-[0.65rem] text-on-surface-variant">
                        {chip.categoryIcon} {chip.summary}
                      </span>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show
              when={!briefing().hasContent}
            >
              <p class="text-[0.7rem] text-on-surface-variant opacity-60">
                No briefing data yet - tap refresh to generate your first synthesis.
              </p>
            </Show>
          </div>
        </Show>
      </div>
      </Show>
    </Show>
  );
}
