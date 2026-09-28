import { createMemo, createSignal, For, Show } from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { ViewDispatcher } from "@/components/ViewDispatcher";

export function AlternateViewsInspector(props: {
  message: AfpMessage;
  compact?: boolean;
  cardUpdates?: AfpMessage[];
}) {
  const [selectedKey, setSelectedKey] = createSignal<string | null>(null);
  const views = createMemo(() =>
    [...(props.message.views ?? [])]
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map((view, index) => ({
        key: `${view.format}:${index}:${view.priority ?? 0}`,
        view,
      }))
  );
  const selectedView = createMemo(() => {
    const key = selectedKey();
    if (!key) return null;
    return views().find((entry) => entry.key === key)?.view ?? null;
  });

  return (
    <Show when={views().length > 1}>
      <div class="glass-surface rounded-xl border border-white/35 p-4 shadow-panel">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
              View Inspector
            </p>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-on-surface-variant">
              Inspect alternate AFP views carried on this message without changing the default workspace rendering path.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class={`rounded-full px-3 py-1.5 text-xs transition ${
                !selectedKey()
                  ? "bg-primary text-white"
                  : "border border-white/30 bg-white/30 text-on-surface"
              }`}
              onClick={() => setSelectedKey(null)}
            >
              Default
            </button>
            <For each={views()}>
              {(entry) => (
                <button
                  type="button"
                  class={`rounded-full px-3 py-1.5 text-xs transition ${
                    selectedKey() === entry.key
                      ? "bg-primary text-white"
                      : "border border-white/30 bg-white/30 text-on-surface"
                  }`}
                  onClick={() => setSelectedKey(entry.key)}
                >
                  {entry.view.format} | p{entry.view.priority ?? 0}
                </button>
              )}
            </For>
          </div>
        </div>
        <Show when={selectedView()}>
          {(view) => (
            <div class="mt-4">
              <ViewDispatcher
                message={props.message}
                viewOverride={view()}
                compact={props.compact}
                cardUpdates={props.cardUpdates}
              />
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}
