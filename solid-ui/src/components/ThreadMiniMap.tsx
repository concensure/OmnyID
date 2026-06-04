// @locs-version: 2.0
// @module-id: ui.thread-mini-map
// @primary-capability: knowledge-backlinks-radial-visualization
// @stability: draft
import { createSignal, For, onMount, Show } from "solid-js";
import { fetchBacklinksGraph, type BacklinksGraphResponse } from "@/lib/api";

export function ThreadMiniMap(props: { threadId: string }) {
  const [collapsed, setCollapsed] = createSignal(true);
  const [graph, setGraph] = createSignal<BacklinksGraphResponse | null>(null);

  onMount(async () => {
    try {
      const data = await fetchBacklinksGraph(props.threadId, 1);
      setGraph(data);
    } catch {
      // endpoint not reachable yet — render gracefully empty
    }
  });

  const CX = 80, CY = 80, R = 52;

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
    return g && (g.nodes.length > 1 || g.edge_count > 0);
  };

  return (
    <div class="rounded-xl border border-white/25 bg-white/10 px-4 py-2.5">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        class="flex w-full items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-outline transition hover:text-on-surface-variant"
      >
        <span>⊙ Knowledge mini-map</span>
        <span>{collapsed() ? "▸" : "▾"}</span>
      </button>
      <Show when={!collapsed()}>
        <div class="mt-2 animate-fade-in">
          <Show
            when={hasData()}
            fallback={<p class="text-center font-mono text-[9px] text-on-surface-variant/40 py-2">No backlinks yet</p>}
          >
            <svg viewBox="0 0 160 160" class="h-36 w-full">
              {/* Root node */}
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
        </div>
      </Show>
    </div>
  );
}
