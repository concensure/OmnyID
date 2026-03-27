import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { AlternateViewsInspector } from "@/components/AlternateViewsInspector";
import { fetchThread, subscribeThread } from "@/lib/api";
import { ViewDispatcher } from "@/components/ViewDispatcher";
import { GlassPanel } from "@/components/GlassPanel";

/**
 * Full thread view: loads all AFP messages for a given thread_id,
 * renders each through ViewDispatcher, and keeps the thread live via
 * the relay WebSocket (/relay/ws subscribe_thread).
 *
 * Agents' view hints (views[].format) take full effect here —
 * each message is independently dispatched to its renderer.
 */
export function ThreadView(props: { threadId: string; advanced?: boolean; onBack?: () => void }) {
  const [messages, setMessages] = createSignal<AfpMessage[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const [live, setLive] = createSignal(false);

  /**
   * Group messages for rendering:
   * - `generative_card` messages are rendered with their associated `card_section_update` messages.
   * - All other messages pass through ViewDispatcher unchanged.
   * Returns a list of render units.
   */
  type RenderUnit =
    | { kind: "standalone"; message: AfpMessage }
    | { kind: "generative_card"; card: AfpMessage; updates: AfpMessage[] };

  const renderUnits = createMemo<RenderUnit[]>(() => {
    const msgs = messages();
    // Build a map of card_id → generative_card message
    const cardMap = new Map<string, AfpMessage>();
    for (const m of msgs) {
      if (m.type === "generative_card") {
        const cardId = String((m.content as any)?.card_id ?? m.id);
        cardMap.set(cardId, m);
      }
    }

    // Collect updates per card_id
    const updatesMap = new Map<string, AfpMessage[]>();
    for (const m of msgs) {
      if (m.type === "card_section_update") {
        const cardId = String((m.content as any)?.card_id ?? "");
        if (cardId) {
          const arr = updatesMap.get(cardId) ?? [];
          arr.push(m);
          updatesMap.set(cardId, arr);
        }
      }
    }

    const units: RenderUnit[] = [];
    const seenCardIds = new Set<string>();

    for (const m of msgs) {
      if (m.type === "card_section_update") continue; // folded into card units

      if (m.type === "generative_card") {
        const cardId = String((m.content as any)?.card_id ?? m.id);
        if (!seenCardIds.has(cardId)) {
          seenCardIds.add(cardId);
          units.push({
            kind: "generative_card",
            card: m,
            updates: updatesMap.get(cardId) ?? [],
          });
        }
        continue;
      }

      units.push({ kind: "standalone", message: m });
    }

    return units;
  });

  async function reload() {
    try {
      const msgs = await fetchThread(props.threadId);
      setMessages(msgs);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  onMount(async () => {
    setLoading(true);
    await reload();
    setLoading(false);

    // Subscribe to relay for real-time updates
    const unsub = subscribeThread(props.threadId, () => void reload());
    setLive(true);
    onCleanup(() => {
      unsub();
      setLive(false);
    });
  });

  const formatCounts = () => {
    const counts: Record<string, number> = {};
    for (const m of messages()) {
      const fmt = m.views?.[0]?.format ?? "inbox";
      counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return Object.entries(counts);
  };

  return (
    <div class="space-y-6">
      {/* Header */}
      <GlassPanel class="p-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Thread</p>
            <h2 class="mt-1 break-all font-mono text-lg font-semibold text-on-surface">
              {props.threadId}
            </h2>
          </div>
          <div class="flex items-center gap-3">
            <Show when={messages().length > 0}>
              <div class="flex flex-wrap gap-2">
                <For each={formatCounts()}>
                  {([fmt, count]) => (
                    <span class="rounded-full bg-white/50 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant">
                      {fmt} · {count}
                    </span>
                  )}
                </For>
              </div>
            </Show>
            {/* Live indicator */}
            <span
              class={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] ${
                live()
                  ? "bg-green-500/20 text-green-700"
                  : "bg-outline/10 text-outline"
              }`}
            >
              <span
                class={`h-1.5 w-1.5 rounded-full ${live() ? "bg-green-500" : "bg-outline"}`}
              />
              {live() ? "live" : "offline"}
            </span>
            <Show when={props.onBack}>
              <button
                type="button"
                onClick={props.onBack}
                class="rounded-full border border-white/40 bg-white/30 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/50"
              >
                ← Back
              </button>
            </Show>
          </div>
        </div>
      </GlassPanel>

      {/* Loading skeleton */}
      <Show when={loading()}>
        <div class="space-y-4">
          <For each={[1, 2, 3]}>
            {() => (
              <div class="h-24 animate-pulse rounded-[20px] border border-white/25 bg-white/15" />
            )}
          </For>
        </div>
      </Show>

      {/* Error */}
      <Show when={error()}>
        <GlassPanel class="p-5">
          <p class="text-sm text-error">{error()}</p>
        </GlassPanel>
      </Show>

      {/* Messages via ViewDispatcher (with generative card grouping) */}
      <Show when={!loading() && !error()}>
        <div class="space-y-4">
          <For
            each={renderUnits()}
            fallback={
              <GlassPanel class="p-5">
                <p class="text-sm text-on-surface-variant">No messages in this thread yet.</p>
              </GlassPanel>
            }
          >
            {(unit) => {
              if (unit.kind === "generative_card") {
                return (
                  <div class="space-y-3">
                    <ViewDispatcher
                      message={unit.card}
                      cardUpdates={unit.updates}
                    />
                    <Show when={props.advanced}>
                      <AlternateViewsInspector
                        message={unit.card}
                        cardUpdates={unit.updates}
                        compact
                      />
                    </Show>
                  </div>
                );
              }
              return (
                <div class="space-y-3">
                  <ViewDispatcher message={unit.message} />
                  <Show when={props.advanced}>
                    <AlternateViewsInspector message={unit.message} compact />
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
