import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { GridStack } from "gridstack";
import type { AfpMessage, DashboardBootstrap } from "@/lib/api";
import { AlternateViewsInspector } from "@/components/AlternateViewsInspector";
import { ViewDispatcher } from "@/components/ViewDispatcher";

const LAYOUT_KEY = "omnyid.grid-layout";
const PINNED_KEY = "omnyid.pinned-msgs";

type RenderUnit =
  | { kind: "standalone"; message: AfpMessage }
  | { kind: "generative_card"; card: AfpMessage; updates: AfpMessage[] };

export function DashboardFeed(props: {
  bootstrap: DashboardBootstrap | null;
  commandSummary?: string;
  advanced?: boolean;
  onOpenThread?: (threadId: string) => void;
}) {
  let gridEl: HTMLDivElement | undefined;
  let gs: GridStack | undefined;

  const messages = () => (props.bootstrap?.messages ?? []).slice(0, 12);

  const renderUnits = createMemo<RenderUnit[]>(() => {
    const msgs = messages();
    const updatesMap = new Map<string, AfpMessage[]>();
    const units: RenderUnit[] = [];

    for (const msg of msgs) {
      if (msg.type !== "card_section_update") continue;
      const cardId = String((msg.content as Record<string, unknown>)["card_id"] ?? "");
      if (!cardId) continue;
      const arr = updatesMap.get(cardId) ?? [];
      arr.push(msg);
      updatesMap.set(cardId, arr);
    }

    for (const msg of msgs) {
      if (msg.type === "card_section_update") continue;
      if (msg.type === "generative_card") {
        const cardId = String((msg.content as Record<string, unknown>)["card_id"] ?? msg.id);
        units.push({
          kind: "generative_card",
          card: msg,
          updates: updatesMap.get(cardId) ?? [],
        });
      } else {
        units.push({ kind: "standalone", message: msg });
      }
    }

    return units;
  });

  const [pinned, setPinned] = createSignal<Set<string>>(
    new Set(JSON.parse(localStorage.getItem(PINNED_KEY) ?? "[]"))
  );

  function togglePin(msgId: string) {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      localStorage.setItem(PINNED_KEY, JSON.stringify([...next]));
      return next;
    });

    if (!gs || !gridEl) return;
    const el = gridEl
      .querySelector(`[data-msg-id="${msgId}"]`)
      ?.closest(".grid-stack-item") as HTMLElement | null;
    if (!el) return;
    const isPinned = pinned().has(msgId);
    gs.update(el, { locked: !isPinned, noMove: !isPinned, noResize: !isPinned });
  }

  function saveLayout() {
    if (!gs) return;
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(gs.save()));
    } catch {
      /* ignore quota errors */
    }
  }

  function initGrid() {
    if (!gridEl) return;
    if (gs) {
      gs.off("change");
      gs.destroy(false);
    }
    gs = GridStack.init(
      {
        float: false,
        margin: 8,
        cellHeight: 60,
        animate: true,
        handle: ".drag-handle",
        resizable: { handles: "se" },
      },
      gridEl
    );
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "[]") as Array<Record<string, unknown>>;
    if (saved.length) {
      try {
        gs.load(saved, false);
      } catch {
        /* ignore */
      }
    }
    for (const msgId of pinned()) {
      const el = gridEl
        .querySelector(`[data-msg-id="${msgId}"]`)
        ?.closest(".grid-stack-item") as HTMLElement | null;
      if (el) gs.update(el, { locked: true, noMove: true, noResize: true });
    }
    gs.on("change", saveLayout);
  }

  createEffect(() => {
    const units = renderUnits();
    if (!gridEl) return;
    requestAnimationFrame(() => {
      if (units.length > 0) initGrid();
    });
  });

  onCleanup(() => {
    gs?.off("change");
    gs?.destroy(false);
    gs = undefined;
  });

  const threadIds = () => {
    const seen = new Set<string>();
    return messages()
      .map((m) => m.thread_id)
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  };

  return (
    <div class="space-y-4">
      <div class="glass-surface rounded-[24px] border border-white/40 p-5 shadow-panel">
        <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Agent feed</p>
        <h3 class="mt-2 text-lg font-semibold text-on-surface">Messages &amp; summaries</h3>
        <p class="mt-2 text-sm leading-7 text-on-surface-variant">
          {props.commandSummary ||
            "Drag the handle bar to reorder cards. Resize with the corner handle. Click â—‹ to pin a card in place."}
        </p>
        <Show when={threadIds().length > 0 && Boolean(props.onOpenThread)}>
          <div class="mt-4 flex flex-wrap gap-2">
            <span class="self-center font-mono text-[9px] uppercase tracking-[0.2em] text-outline">
              Open thread
            </span>
            <For each={threadIds()}>
              {(tid) => (
                <button
                  type="button"
                  onClick={() => props.onOpenThread!(tid)}
                  class="rounded-full border border-white/40 bg-white/40 px-3 py-1 font-mono text-[10px] text-on-surface transition hover:bg-white/60"
                >
                  {tid.length > 20 ? `${tid.slice(0, 8)}â€¦${tid.slice(-6)}` : tid}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show
        when={renderUnits().length > 0}
        fallback={
          <div class="glass-surface rounded-[22px] border border-dashed border-white/35 p-5 text-sm text-on-surface-variant shadow-panel">
            No messages yet. Sign in to load live AFP messages from your agents.
          </div>
        }
      >
        <div ref={(el) => { gridEl = el; }} class="grid-stack">
          <For each={renderUnits()}>
            {(unit) => {
              const msg = unit.kind === "generative_card" ? unit.card : unit.message;
              return (
                <div class="grid-stack-item" gs-id={msg.id} gs-w="12" gs-h="3">
                  <div class="grid-stack-item-content overflow-hidden rounded-[20px] border border-white/35 bg-white/20 shadow-panel backdrop-blur-sm">
                    <div class="drag-handle flex cursor-grab select-none items-center justify-between border-b border-white/15 bg-white/25 px-4 py-2 active:cursor-grabbing">
                      <div class="flex items-center gap-2" data-msg-id={msg.id}>
                        <span class="text-xs leading-none text-on-surface-variant opacity-40">â ¿â ¿</span>
                        <span class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline">
                          {msg.type}
                        </span>
                      </div>
                      <button
                        type="button"
                        title={pinned().has(msg.id) ? "Pinned â€” click to unpin" : "Click to pin in place"}
                        class={`rounded-full px-2 py-0.5 text-xs transition hover:bg-white/40 ${
                          pinned().has(msg.id) ? "text-primary" : "text-on-surface-variant"
                        }`}
                        onClick={() => togglePin(msg.id)}
                      >
                        {pinned().has(msg.id) ? "ðŸ“Œ" : "â—‹"}
                      </button>
                    </div>
                    <div class="overflow-auto p-4">
                      <div class="space-y-3">
                        {unit.kind === "generative_card" ? (
                          <ViewDispatcher
                            message={unit.card}
                            cardUpdates={unit.updates}
                          />
                        ) : (
                          <ViewDispatcher message={msg} />
                        )}
                        <Show when={props.advanced}>
                          <AlternateViewsInspector
                            message={unit.kind === "generative_card" ? unit.card : msg}
                            cardUpdates={unit.kind === "generative_card" ? unit.updates : undefined}
                            compact
                          />
                        </Show>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
