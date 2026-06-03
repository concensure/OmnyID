import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { GridStack } from "gridstack";
import type { AfpMessage, DashboardBootstrap } from "@/lib/api";
import { AlternateViewsInspector } from "@/components/AlternateViewsInspector";
import { ViewDispatcher } from "@/components/ViewDispatcher";

const LAYOUT_KEY = "omnyid.grid-layout";
const PINNED_KEY = "omnyid.pinned-msgs";
const DISMISSED_KEY = "omnyid.dismissed-msgs";
const FILTER_HINT_KEY = "omnyid.feed.filter_hint_seen";
const SNOOZE_KEY = "omnyid.feed.snoozed";
const READ_AT_KEY = "omnyid.feed.last_read_at";
const COLLAPSED_KEY = "omnyid.feed.collapsed";

function loadSnoozed(): Map<string, number> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SNOOZE_KEY) ?? "{}") as Record<string, number>;
    return new Map(Object.entries(raw));
  } catch { return new Map(); }
}
function saveSnoozed(m: Map<string, number>) {
  sessionStorage.setItem(SNOOZE_KEY, JSON.stringify(Object.fromEntries(m)));
}

function relativeTime(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function typeHue(type: string): number {
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) & 0xffff;
  return h % 360;
}

function cardAgeOpacity(ts: string | undefined): string {
  if (!ts) return "";
  const ageSecs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (ageSecs > 72 * 3600) return "opacity-60";
  if (ageSecs > 24 * 3600) return "opacity-80";
  return "";
}

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
  let filterRowRef: HTMLDivElement | undefined;

  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = createSignal(PAGE_SIZE);
  const [activeTypes, setActiveTypes] = createSignal<Set<string>>(new Set());

  const allFilteredMessages = createMemo(() => {
    void tick(); // re-evaluate every minute so snooze expiries wake cards
    const types = activeTypes();
    const snz = snoozed();
    const now = Date.now();
    return (props.bootstrap?.messages ?? [])
      .filter((m) => !dismissed().has(m.id))
      .filter((m) => { const wakeAt = snz.get(m.id); return wakeAt === undefined || wakeAt <= now; })
      .filter((m) => types.size === 0 || types.has(m.type));
  });

  const totalUndismissed = createMemo(() =>
    (props.bootstrap?.messages ?? []).filter((m) => !dismissed().has(m.id)).length
  );

  const messages = () => allFilteredMessages().slice(0, visibleCount());

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

  const [dismissed, setDismissed] = createSignal<Set<string>>(
    new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]"))
  );
  const [undoDismissId, setUndoDismissId] = createSignal<string | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | undefined;

  const [snoozed, setSnoozed] = createSignal<Map<string, number>>(loadSnoozed());
  const [lastReadAt, setLastReadAt] = createSignal<number>(
    parseInt(localStorage.getItem(READ_AT_KEY) ?? "0")
  );
  function markAllRead() {
    const now = Date.now();
    localStorage.setItem(READ_AT_KEY, String(now));
    setLastReadAt(now);
  }
  const isNewCard = (msg: { timestamp?: string }) => {
    const ts = msg.timestamp ? new Date(msg.timestamp).getTime() : 0;
    return ts > lastReadAt();
  };
  const newCardCount = createMemo(() => messages().filter((m) => isNewCard(m) && !dismissed().has(m.id)).length);
  const [collapsed, setCollapsed] = createSignal<Set<string>>(
    new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]"))
  );
  function toggleCollapse(msgId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });
  }
  const [snoozePickerId, setSnoozePickerId] = createSignal<string | null>(null);
  const [snoozePickerDays, setSnoozePickerDays] = createSignal(0);
  const [snoozePickerHours, setSnoozePickerHours] = createSignal(1);
  const [snoozedToastId, setSnoozedToastId] = createSignal<string | null>(null);
  let snoozeToastTimer: ReturnType<typeof setTimeout> | undefined;

  function snoozeCard(msgId: string, durationMs: number) {
    const wakeAt = Date.now() + durationMs;
    setSnoozed((prev) => { const next = new Map(prev); next.set(msgId, wakeAt); saveSnoozed(next); return next; });
    setSnoozePickerId(null);
    clearTimeout(snoozeToastTimer);
    setSnoozedToastId(msgId);
    snoozeToastTimer = setTimeout(() => setSnoozedToastId(null), 5000);
  }
  function unsnoozeCard(msgId: string) {
    setSnoozed((prev) => { const next = new Map(prev); next.delete(msgId); saveSnoozed(next); return next; });
    setSnoozedToastId(null);
  }

  function dismissCard(msgId: string) {
    if (pinned().has(msgId)) return; // pinned cards cannot be dismissed
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(msgId);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      return next;
    });
    clearTimeout(undoTimer);
    setUndoDismissId(msgId);
    undoTimer = setTimeout(() => setUndoDismissId(null), 5000);
  }

  function undoDismiss() {
    const id = undoDismissId();
    if (!id) return;
    clearTimeout(undoTimer);
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      return next;
    });
    setUndoDismissId(null);
  }
  function restoreAllDismissed() {
    setDismissed(new Set<string>());
    localStorage.removeItem(DISMISSED_KEY);
  }

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

  const [pinnedNavIdx, setPinnedNavIdx] = createSignal(0);
  function scrollToPinned(idx: number) {
    const ids = [...pinned()];
    if (ids.length === 0 || !gridEl) return;
    const clamped = ((idx % ids.length) + ids.length) % ids.length;
    setPinnedNavIdx((clamped + 1) % ids.length);
    const el = gridEl.querySelector(`[data-msg-id="${ids[clamped]}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const [summaryExpanded, setSummaryExpanded] = createSignal(false);
  const [showDismissed, setShowDismissed] = createSignal(false);
  const [filterHintSeen, setFilterHintSeen] = createSignal(!!localStorage.getItem(FILTER_HINT_KEY));
  createEffect(() => {
    if (activeTypes().size > 0 && !filterHintSeen()) {
      setFilterHintSeen(true);
      localStorage.setItem(FILTER_HINT_KEY, "1");
    }
  });
  const [resetPending, setResetPending] = createSignal(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  function startReset() {
    setResetPending(true);
    resetTimer = setTimeout(() => setResetPending(false), 4000);
  }
  function confirmReset() {
    clearTimeout(resetTimer);
    setResetPending(false);
    localStorage.removeItem(LAYOUT_KEY);
    if (gs) { gs.off("change"); gs.destroy(false); gs = undefined; }
    requestAnimationFrame(() => initGrid());
  }

  const [bulkDismissPending, setBulkDismissPending] = createSignal(false);
  let bulkDismissTimer: ReturnType<typeof setTimeout> | undefined;
  const oldCardCount = () =>
    (props.bootstrap?.messages ?? []).filter((m) => {
      if (dismissed().has(m.id) || pinned().has(m.id)) return false;
      return Math.floor((Date.now() - new Date(m.timestamp ?? 0).getTime()) / 1000) > 72 * 3600;
    }).length;
  function startBulkDismiss() {
    setBulkDismissPending(true);
    bulkDismissTimer = setTimeout(() => setBulkDismissPending(false), 4000);
  }
  function confirmBulkDismiss() {
    clearTimeout(bulkDismissTimer);
    setBulkDismissPending(false);
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const m of props.bootstrap?.messages ?? []) {
        if (pinned().has(m.id)) continue;
        const age = Math.floor((Date.now() - new Date(m.timestamp ?? 0).getTime()) / 1000);
        if (age > 72 * 3600) next.add(m.id);
      }
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      return next;
    });
  }
  createEffect(() => { activeTypes(); setVisibleCount(PAGE_SIZE); });

  const allMessageTypes = createMemo(() => {
    const types = new Set<string>();
    for (const m of props.bootstrap?.messages ?? []) types.add(m.type);
    return [...types];
  });

  const dismissedMessages = () =>
    (props.bootstrap?.messages ?? []).filter((m) => dismissed().has(m.id));
  const [tick, setTick] = createSignal(0);

  onMount(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "f" || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      filterRowRef?.querySelector("button")?.focus();
    }
    document.addEventListener("keydown", onKeyDown);

    onCleanup(() => { clearInterval(id); document.removeEventListener("keydown", onKeyDown); });
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

  const threadTypeMap = createMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages()) {
      if (!map.has(m.thread_id)) map.set(m.thread_id, m.type);
    }
    return map;
  });

  const threadCountMap = createMemo(() => {
    const map = new Map<string, number>();
    for (const m of messages()) {
      map.set(m.thread_id, (map.get(m.thread_id) ?? 0) + 1);
    }
    return map;
  });

  const typeCountMap = createMemo(() => {
    const map = new Map<string, number>();
    for (const m of props.bootstrap?.messages ?? []) {
      map.set(m.type, (map.get(m.type) ?? 0) + 1);
    }
    return map;
  });

  const typeSpark = createMemo(() => {
    const msgs = props.bootstrap?.messages ?? [];
    if (msgs.length === 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totals: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const m of msgs) {
      if (!m.timestamp) continue;
      const msgDay = new Date(m.timestamp);
      msgDay.setHours(0, 0, 0, 0);
      const age = Math.floor((today.getTime() - msgDay.getTime()) / 86400000);
      if (age >= 0 && age < 7) totals[6 - age]++;
    }
    if (totals.every((n) => n === 0)) return null;
    const max = Math.max(1, ...totals);
    const labels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today.getTime() - (6 - i) * 86400000);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    });
    return { totals, max, labels };
  });

  return (
    <div class="space-y-4">
      <div class={`glass-surface rounded-[24px] border p-5 shadow-panel transition-colors ${activeTypes().size > 0 ? "border-primary/35 border-t-[3px]" : "border-white/40"}`}>
        <div class="flex items-center justify-between gap-2">
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Agent feed</p>
          <div class="flex items-center gap-3">
            <Show when={newCardCount() > 0}>
              <button
                type="button"
                onClick={markAllRead}
                title="Mark all cards as read"
                class="flex items-center gap-1 text-[10px] text-primary/70 transition hover:text-primary"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
                {newCardCount()} new · mark read
              </button>
            </Show>
            <Show when={pinned().size > 0}>
              <button
                type="button"
                onClick={() => scrollToPinned(pinnedNavIdx())}
                title="Click to scroll to pinned card"
                class="font-mono text-[10px] text-primary/70 transition hover:text-primary"
              >
                {pinned().size} pinned ↑
              </button>
            </Show>
            <Show when={dismissed().size > 0}>
              <button
                type="button"
                onClick={() => setShowDismissed((v) => !v)}
                class="text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
              >
                {dismissed().size} dismissed {showDismissed() ? "▴" : "▾"}
              </button>
            </Show>
            <Show when={oldCardCount() > 0 && !bulkDismissPending()} fallback={
              <Show when={bulkDismissPending()}>
                <div class="flex items-center gap-[0.6em]">
                  <button
                    type="button"
                    onClick={confirmBulkDismiss}
                    class="text-[10px] text-red-500 transition hover:text-red-400"
                  >
                    Dismiss {oldCardCount()} old?
                  </button>
                  <button
                    type="button"
                    onClick={() => { clearTimeout(bulkDismissTimer); setBulkDismissPending(false); }}
                    class="text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
                  >
                    ×
                  </button>
                </div>
              </Show>
            }>
              <button
                type="button"
                onClick={startBulkDismiss}
                title="Dismiss all non-pinned cards older than 72h"
                class="text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
              >
                Dismiss old ({oldCardCount()})
              </button>
            </Show>
            <Show
              when={resetPending()}
              fallback={
                <button
                  type="button"
                  onClick={startReset}
                  class="text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
                >
                  Reset layout
                </button>
              }
            >
              <div class="flex items-center gap-[0.6em]">
                <button
                  type="button"
                  onClick={confirmReset}
                  class="text-[10px] text-red-500 transition hover:text-red-400"
                >
                  Confirm reset
                </button>
                <button
                  type="button"
                  onClick={() => { clearTimeout(resetTimer); setResetPending(false); }}
                  class="text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
                >
                  ×
                </button>
              </div>
            </Show>
          </div>
        </div>
        <Show when={allMessageTypes().length > 1}>
          <div ref={filterRowRef} class="mt-2 flex flex-wrap gap-1.5" title="Press F to focus filters">
            <For each={allMessageTypes()}>
              {(type) => (
                <button
                  type="button"
                  title="Click to toggle · Right-click to isolate"
                  onClick={() => setActiveTypes((prev) => {
                    const next = new Set(prev);
                    if (next.has(type)) next.delete(type);
                    else next.add(type);
                    return next;
                  })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setActiveTypes(new Set([type]));
                  }}
                  class={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                    activeTypes().has(type)
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-white/25 bg-white/15 text-on-surface-variant/50 hover:bg-white/30"
                  }`}
                >
                  {type}
                  <span class="ml-[0.3em] tabular-nums opacity-60">({typeCountMap().get(type) ?? 0})</span>
                </button>
              )}
            </For>
            <Show when={activeTypes().size > 0}>
              <button
                type="button"
                onClick={() => setActiveTypes(new Set())}
                class="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[9px] text-on-surface-variant/40 transition hover:text-on-surface-variant"
              >
                clear ×
              </button>
            </Show>
            <Show when={!filterHintSeen()}>
              <kbd class="ml-auto self-center rounded border border-on-surface/15 bg-on-surface/5 px-1.5 py-0.5 font-mono text-[9px] text-on-surface-variant/30 select-none">f</kbd>
            </Show>
          </div>
        </Show>
        <Show when={typeSpark() !== null}>
          <div class="mt-2 flex items-end gap-[2px]" title="7-day message activity">
            <For each={typeSpark()!.totals}>
              {(count, i) => (
                <div
                  class="flex-1 min-w-0 rounded-sm transition-all"
                  style={`height: ${count > 0 ? Math.max(4, Math.round((count / typeSpark()!.max) * 24)) : 2}px; background: ${count > 0 ? "rgba(49,86,142,0.32)" : "rgba(0,0,0,0.06)"}`}
                  title={`${typeSpark()!.labels[i()]}: ${count} message${count === 1 ? "" : "s"}`}
                />
              )}
            </For>
          </div>
        </Show>
        <Show when={showDismissed() && dismissedMessages().length > 0}>
          <div class="mt-3 space-y-1 rounded-xl border border-white/20 bg-white/10 p-3 animate-fade-in">
            <div class="flex items-center justify-between mb-2">
              <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline">Dismissed cards</p>
              <button
                type="button"
                onClick={() => { localStorage.removeItem(DISMISSED_KEY); setDismissed(new Set<string>()); setShowDismissed(false); }}
                class="text-[10px] text-on-surface-variant/40 transition hover:text-on-surface-variant"
              >
                Restore all
              </button>
            </div>
            <For each={dismissedMessages()}>
              {(msg) => (
                <div class="flex items-center justify-between gap-2 rounded-lg bg-white/10 px-3 py-1.5">
                  <span class="font-mono text-[9px] uppercase tracking-[0.12em] text-on-surface-variant truncate">
                    {msg.type} · {msg.id.slice(0, 8)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDismissed((prev) => { const next = new Set(prev); next.delete(msg.id); localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])); return next; })}
                    class="flex-shrink-0 rounded-full border border-white/30 bg-white/30 px-2 py-0.5 text-[10px] text-primary transition hover:bg-white/50"
                  >
                    Restore
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
        <h3 class="mt-2 text-lg font-semibold text-on-surface">Messages &amp; summaries</h3>
        <Show
          when={props.commandSummary}
          fallback={
            <p class="mt-2 text-sm leading-7 text-on-surface-variant">
              Drag the handle bar to reorder cards. Resize with the corner handle. Click pin to pin a card in place.
            </p>
          }
        >
          <div class="mt-2 group">
            <p class={`text-sm leading-7 text-on-surface-variant ${summaryExpanded() ? "" : "line-clamp-3"}`}>
              {props.commandSummary}
            </p>
            <Show when={(props.commandSummary?.length ?? 0) > 160}>
              <button
                type="button"
                onClick={() => setSummaryExpanded((v) => !v)}
                class="mt-0.5 text-[10px] font-medium text-primary hover:text-primary/70 transition"
              >
                {summaryExpanded() ? "Show less ▴" : "Show more ▾"}
              </button>
            </Show>
          </div>
        </Show>
        <Show when={threadIds().length > 0 && Boolean(props.onOpenThread)}>
          <div class="mt-4 flex flex-wrap gap-2">
            <span class="self-center font-mono text-[9px] uppercase tracking-[0.2em] text-outline">
              Open thread
            </span>
            <For each={threadIds()}>
              {(tid) => {
                const msgType = () => threadTypeMap().get(tid);
                const count = () => threadCountMap().get(tid) ?? 0;
                const shortId = tid.slice(0, 6) + "…" + tid.slice(-4);
                return (
                  <button
                    type="button"
                    onClick={() => props.onOpenThread!(tid)}
                    class="flex items-center gap-1.5 rounded-full border border-white/40 bg-white/40 px-3 py-1 font-mono text-[10px] text-on-surface transition hover:bg-white/60"
                  >
                    {msgType() ? `${msgType()} · ${shortId}` : shortId}
                    <span class="rounded-full bg-on-surface/10 px-1.5 text-[9px] text-on-surface-variant">
                      {count()}
                    </span>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      <Show when={props.bootstrap === null}>
        <div class="space-y-3">
          {[0, 1, 2].map(() => (
            <div class="animate-pulse rounded-[20px] border border-white/20 bg-white/15 shadow-panel">
              <div class="flex items-center justify-between border-b border-white/10 bg-white/10 px-4 py-2">
                <div class="h-2.5 w-24 rounded-full bg-white/30" />
                <div class="h-2.5 w-10 rounded-full bg-white/20" />
              </div>
              <div class="space-y-2 p-4">
                <div class="h-3 w-3/4 rounded-full bg-white/25" />
                <div class="h-3 w-1/2 rounded-full bg-white/20" />
              </div>
            </div>
          ))}
        </div>
      </Show>

      <Show
        when={props.bootstrap !== null && renderUnits().length > 0}
        fallback={
          <Show when={props.bootstrap !== null}>
            <div class="glass-surface rounded-[22px] border border-dashed border-white/35 p-5 shadow-panel">
              <Show
                when={activeTypes().size > 0}
                fallback={
                  <Show when={dismissed().size > 0 || snoozed().size > 0} fallback={<>
                    <p class="text-sm text-on-surface-variant">Your agents haven't sent anything yet.</p>
                    <p class="mt-2 text-xs font-medium text-primary">
                      → Try asking a question above, or activate an agent in <strong class="text-on-surface">Workflows</strong>.
                    </p>
                  </>}>
                    <div class="flex flex-col items-center gap-2 py-2 text-center animate-fade-in">
                      <p class="text-base font-semibold text-on-surface">All caught up ✓</p>
                      <p class="text-xs text-on-surface-variant/60">
                        {dismissed().size > 0 && `${dismissed().size} card${dismissed().size === 1 ? "" : "s"} dismissed`}
                        {dismissed().size > 0 && snoozed().size > 0 && " · "}
                        {snoozed().size > 0 && `${snoozed().size} snoozed`}
                      </p>
                      <Show when={dismissed().size > 0}>
                        <button
                          type="button"
                          onClick={restoreAllDismissed}
                          class="mt-1 rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/15"
                        >
                          Restore all →
                        </button>
                      </Show>
                    </div>
                  </Show>
                }
              >
                <p class="text-sm text-on-surface-variant">No messages match the active filter.</p>
                <button
                  type="button"
                  onClick={() => setActiveTypes(new Set())}
                  class="mt-2 text-xs font-medium text-primary transition hover:text-primary/70"
                >
                  Clear filter →
                </button>
              </Show>
            </div>
          </Show>
        }
      >
        <div ref={(el) => { gridEl = el; }} class="grid-stack">
          <For each={renderUnits()}>
            {(unit) => {
              const msg = unit.kind === "generative_card" ? unit.card : unit.message;
              return (
                <div class="grid-stack-item" gs-id={msg.id} gs-w="12" gs-h="3">
                  <div class={`grid-stack-item-content group relative overflow-hidden rounded-[20px] border shadow-panel backdrop-blur-sm transition-colors ${
                    pinned().has(msg.id)
                      ? "border-primary/30 bg-primary/5 border-l-2 border-l-primary/60"
                      : `border-white/35 bg-white/20 ${cardAgeOpacity(msg.timestamp)}`
                  }`}>
                    <Show when={!pinned().has(msg.id)}>
                      <div class="pointer-events-none absolute left-0 top-0 z-10 h-full w-[3px]"
                           style={`background: hsl(${typeHue(msg.type)}, 50%, 60%); opacity: 0.5`} />
                    </Show>
                    <div
                      class="drag-handle flex cursor-grab select-none items-center justify-between border-b border-white/15 bg-white/25 px-4 py-2 active:cursor-grabbing"
                      tabIndex={0}
                      aria-label={`Card ${msg.type} — drag handle. Alt+Up/Down to reorder.`}
                      onKeyDown={(e) => {
                        if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                        e.preventDefault();
                        const item = (e.currentTarget as HTMLElement).closest(".grid-stack-item") as HTMLElement | null;
                        if (!item || !gs) return;
                        const currentY = parseInt(item.getAttribute("gs-y") ?? "0");
                        const dir = e.key === "ArrowUp" ? -1 : 1;
                        const newY = Math.max(0, currentY + dir);
                        if (newY !== currentY) { gs.update(item, { y: newY }); saveLayout(); }
                        (e.currentTarget as HTMLElement).focus();
                      }}
                    >
                      <div class="flex items-center gap-2" data-msg-id={msg.id}>
                        <span class="text-xs leading-none text-on-surface-variant opacity-40">{pinned().has(msg.id) ? "📌" : "⋮⋮"}</span>
                        <Show when={isNewCard(msg)}>
                          <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" title="New since last read" />
                        </Show>
                        <span class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline">
                          {msg.type}
                        </span>
                        <Show when={msg.timestamp}>
                          {/* tick() read ensures the memo re-evaluates every minute */}
                          <span class="font-mono text-[9px] text-on-surface-variant/40">{(tick(), relativeTime(msg.timestamp))}</span>
                        </Show>
                        <Show when={Boolean(props.onOpenThread) && Boolean(msg.thread_id)}>
                          <button
                            type="button"
                            title="Open thread"
                            onClick={() => props.onOpenThread!(msg.thread_id)}
                            class="rounded px-1.5 py-0.5 font-mono text-[9px] text-primary opacity-0 transition group-hover:opacity-60 hover:!opacity-100 hover:bg-primary/10"
                          >
                            → Thread
                          </button>
                        </Show>
                        {(() => {
                          const parts = (msg.from ?? "").split("/").filter(Boolean);
                          const role = parts[parts.length - 2] ?? "";
                          const isUser = role === "user" || role === "workspace";
                          const name = (parts[parts.length - 1] ?? "").replace(/_/g, " ");
                          return !isUser && name ? (
                            <span class="font-mono text-[0.55em] text-on-surface-variant/35 opacity-0 transition group-hover:opacity-100">
                              {name}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div class="flex items-center gap-1">
                        <button
                          type="button"
                          title={pinned().has(msg.id) ? "Pinned — click to unpin" : "Click to pin in place"}
                          class={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                            pinned().has(msg.id)
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-transparent opacity-30 text-on-surface-variant hover:opacity-100 hover:bg-white/40"
                          }`}
                          onClick={() => togglePin(msg.id)}
                        >
                          {pinned().has(msg.id) ? "pinned" : "pin"}
                        </button>
                        <button
                          type="button"
                          title={collapsed().has(msg.id) ? "Expand card" : "Collapse card"}
                          class="rounded-full border border-transparent px-1.5 py-0.5 text-[10px] text-on-surface-variant opacity-30 transition hover:!opacity-100 hover:bg-white/40"
                          onClick={(e) => { e.stopPropagation(); toggleCollapse(msg.id); }}
                        >
                          {collapsed().has(msg.id) ? "▸" : "▾"}
                        </button>
                        <Show when={!pinned().has(msg.id)}>
                          <div class="relative">
                            <button
                              type="button"
                              title="Snooze card"
                              class="rounded-full border border-transparent px-1.5 py-0.5 text-[10px] text-on-surface-variant opacity-0 transition group-hover:opacity-30 hover:!opacity-100 hover:bg-white/40"
                              onClick={(e) => { e.stopPropagation(); setSnoozePickerId((prev) => prev === msg.id ? null : msg.id); setSnoozePickerDays(0); setSnoozePickerHours(1); }}
                            >
                              ⏱
                            </button>
                            <Show when={snoozePickerId() === msg.id}>
                              <div class="absolute right-0 top-full z-30 mt-1 w-52 animate-fade-in rounded-2xl border border-white/45 bg-white/97 p-3 shadow-panel backdrop-blur-xl">
                                <p class="mb-2 font-mono text-[8px] uppercase tracking-[0.15em] text-outline">Snooze for</p>
                                <div class="flex flex-wrap gap-1 mb-2.5">
                                  {([
                                    { label: "1h", ms: 3_600_000 },
                                    { label: "4h", ms: 14_400_000 },
                                    { label: "8h", ms: 28_800_000 },
                                    { label: "1d", ms: 86_400_000 },
                                    { label: "3d", ms: 259_200_000 },
                                  ] as const).map(({ label, ms }) => (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); snoozeCard(msg.id, ms); }}
                                      class="rounded-full border border-primary/25 bg-primary/8 px-2.5 py-0.5 text-[10px] font-medium text-primary transition hover:bg-primary/15"
                                    >{label}</button>
                                  ))}
                                </div>
                                <div class="flex items-center gap-1 border-t border-white/30 pt-2">
                                  <input
                                    type="number"
                                    min="0"
                                    max="30"
                                    value={snoozePickerDays()}
                                    onInput={(e) => setSnoozePickerDays(Math.max(0, parseInt(e.currentTarget.value) || 0))}
                                    class="w-11 rounded-md border border-white/30 bg-white/50 px-1.5 py-0.5 text-center text-[10px] text-on-surface outline-none focus:border-primary/40"
                                  />
                                  <span class="text-[9px] text-on-surface-variant/50">d</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="23"
                                    value={snoozePickerHours()}
                                    onInput={(e) => setSnoozePickerHours(Math.max(0, Math.min(23, parseInt(e.currentTarget.value) || 0)))}
                                    class="w-11 rounded-md border border-white/30 bg-white/50 px-1.5 py-0.5 text-center text-[10px] text-on-surface outline-none focus:border-primary/40"
                                  />
                                  <span class="text-[9px] text-on-surface-variant/50">h</span>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); const ms = snoozePickerDays() * 86_400_000 + snoozePickerHours() * 3_600_000; if (ms > 0) snoozeCard(msg.id, ms); }}
                                    class="ml-auto rounded-md bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary transition hover:bg-primary/20"
                                  >set</button>
                                </div>
                              </div>
                            </Show>
                          </div>
                          <button
                            type="button"
                            title="Dismiss card"
                            class="rounded-full border border-transparent px-1.5 py-0.5 text-[10px] text-on-surface-variant opacity-0 transition group-hover:opacity-40 hover:!opacity-100 hover:bg-white/40"
                            onClick={() => dismissCard(msg.id)}
                          >
                            ×
                          </button>
                        </Show>
                      </div>
                    </div>
                    <Show when={!collapsed().has(msg.id)}>
                    {(() => {
                      let swipeX = 0;
                      let swipeY = 0;
                      return (
                        <div
                          class="overflow-auto p-4 min-h-[60px]"
                          onPointerDown={(e) => { swipeX = e.clientX; swipeY = e.clientY; }}
                          onPointerUp={(e) => {
                            const dx = e.clientX - swipeX;
                            const dy = Math.abs(e.clientY - swipeY);
                            const emPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
                            if (dx > 3 * emPx && dy < dx * 0.7 && !pinned().has(msg.id)) {
                              snoozeCard(msg.id, 3_600_000);
                            } else if (dx < -(3 * emPx) && dy < Math.abs(dx) * 0.7) {
                              togglePin(msg.id);
                            }
                          }}
                        >
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
                      );
                    })()}
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-center gap-3">
          <p class="font-mono text-[0.65em] text-on-surface-variant/50">
            Showing {Math.min(visibleCount(), allFilteredMessages().length)} of {totalUndismissed()}
            <Show when={activeTypes().size > 0 && totalUndismissed() > allFilteredMessages().length}>
              <span> · {totalUndismissed() - allFilteredMessages().length} filtered out</span>
            </Show>
          </p>
          <Show when={allFilteredMessages().length > visibleCount()}>
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              class="rounded-full border border-white/35 bg-white/35 px-4 py-1.5 font-mono text-[0.75em] text-on-surface-variant transition hover:bg-white/50"
            >
              Show more ↓
            </button>
          </Show>
        </div>
      </Show>
      <Show when={undoDismissId() !== null}>
        <div class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div class="flex items-center gap-3 rounded-full border border-white/45 bg-white/95 px-4 py-2 shadow-panel backdrop-blur-xl">
            <span class="text-xs text-on-surface-variant">Card dismissed</span>
            <button
              type="button"
              onClick={undoDismiss}
              class="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary transition hover:bg-primary/20"
            >
              Undo
            </button>
          </div>
        </div>
      </Show>
      <Show when={snoozedToastId() !== null}>
        <div class="fixed bottom-16 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div class="flex items-center gap-3 rounded-full border border-white/45 bg-white/95 px-4 py-2 shadow-panel backdrop-blur-xl">
            <span class="text-xs text-on-surface-variant">Card snoozed ⏱</span>
            <button
              type="button"
              onClick={() => unsnoozeCard(snoozedToastId()!)}
              class="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary transition hover:bg-primary/20"
            >
              Undo
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
