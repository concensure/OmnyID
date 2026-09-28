// @locs-version: 2.0
// @module-id: ui.thread-mini-map
// @primary-capability: knowledge-backlinks-radial-visualization
// @stability: draft
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { fetchBacklinksGraph, type BacklinksGraphResponse } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import {
  buildThreadMiniMapFailureReceipt,
  type ThreadMiniMapFailureReceipt,
} from "@/lib/threadMiniMapFailureState";

export function ThreadMiniMap(props: { threadId: string; readingProgress?: number }) {
  const [collapsed, setCollapsed] = createSignal(true);
  const [graph, setGraph] = createSignal<BacklinksGraphResponse | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [loadError, setLoadError] = createSignal<ThreadMiniMapFailureReceipt | null>(null);

  async function loadGraph() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchBacklinksGraph(props.threadId, 1);
      setGraph(data);
    } catch (error) {
      setGraph(null);
      setLoadError(
        buildThreadMiniMapFailureReceipt(
          error instanceof Error ? error.message : "Could not load backlinks graph.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    void props.threadId;
    void loadGraph();
  });

  const CX = 80;
  const CY = 80;
  const R = 52;

  const satellites = () => {
    const g = graph();
    if (!g) return [];
    const others = g.nodes.filter((n) => n !== g.root);
    return others.map((id, i) => {
      const angle = (2 * Math.PI * i) / Math.max(others.length, 1) - Math.PI / 2;
      return { id, x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
    });
  };

  const hasData = () => {
    const g = graph();
    return !!g && (g.nodes.length > 1 || g.edge_count > 0);
  };
  const normalizedReadingProgress = createMemo(() =>
    Math.max(0, Math.min(1, props.readingProgress ?? 0)),
  );
  const readingFillHeight = createMemo(() => 112 * normalizedReadingProgress());
  const readingFillY = createMemo(() => 136 - readingFillHeight());

  return (
    <div class="rounded-xl border border-white/25 bg-white/10 px-4 py-2.5">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        class="flex w-full items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-outline transition hover:text-on-surface-variant"
      >
        <span>KM Knowledge mini-map</span>
        <span>{collapsed() ? ">" : "v"}</span>
      </button>
      <Show when={!collapsed()}>
        <div class="mt-2 animate-fade-in">
          <Show
            when={!loading()}
            fallback={<p class="py-2 text-center font-mono text-[9px] text-on-surface-variant/40">Loading backlinks...</p>}
          >
            <Show
              when={!loadError()}
              fallback={
                <EmptyState
                  class="py-2"
                  icon="KM"
                  title={loadError()?.title ?? "Could not load backlinks graph"}
                  body={`${loadError()?.summary ?? "Try loading the knowledge mini-map again."} ${loadError()?.nextStep ?? ""}`.trim()}
                  action={
                    <button
                      type="button"
                      class="rounded-full border border-white/25 bg-white/70 px-3 py-1 text-[0.65rem] font-medium text-on-surface transition hover:bg-white"
                      onClick={() => void loadGraph()}
                    >
                      Retry map
                    </button>
                  }
                />
              }
            >
              <Show
                when={hasData()}
                fallback={<p class="py-2 text-center font-mono text-[9px] text-on-surface-variant/40">No backlinks yet</p>}
              >
                <svg viewBox="0 0 160 160" class="h-36 w-full">
                  <defs>
                    <linearGradient id="thread-reading-progress" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stop-color="rgba(14,165,233,0.22)" />
                      <stop offset="100%" stop-color="rgba(79,70,229,0.55)" />
                    </linearGradient>
                  </defs>
                  <rect x="10" y="24" width="8" height="112" rx="4" fill="rgba(49,86,142,0.12)" />
                  <rect
                    x="10"
                    y={readingFillY()}
                    width="8"
                    height={readingFillHeight()}
                    rx="4"
                    fill="url(#thread-reading-progress)"
                  />
                  <title>{`Reading progress ${Math.round(normalizedReadingProgress() * 100)}%`}</title>
                  <circle cx={CX} cy={CY} r={7} fill="rgba(49,86,142,0.75)" />
                  <For each={satellites()}>
                    {(n) => (
                      <g>
                        <line x1={CX} y1={CY} x2={n.x} y2={n.y} stroke="rgba(49,86,142,0.22)" stroke-width="1" />
                        <circle cx={n.x} cy={n.y} r={4} fill="rgba(49,86,142,0.4)" />
                        <title>{n.id}</title>
                      </g>
                    )}
                  </For>
                  <For each={graph()!.edges}>
                    {(edge) => {
                      const src = satellites().find((n) => n.id === edge.source_id) ?? { x: CX, y: CY };
                      const tgt = satellites().find((n) => n.id === edge.target_id) ?? { x: CX, y: CY };
                      return <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y} stroke="rgba(49,86,142,0.12)" stroke-width="0.8" stroke-dasharray="2 3" />;
                    }}
                  </For>
                </svg>
              </Show>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
}
