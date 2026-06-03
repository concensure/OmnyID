import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { AlternateViewsInspector } from "@/components/AlternateViewsInspector";
import { fetchThread, orchestrate, subscribeThread } from "@/lib/api";
import { ViewDispatcher } from "@/components/ViewDispatcher";
import { GlassPanel } from "@/components/GlassPanel";

const STARRED_KEY = "omnyid.thread.starred";

const SENDER_COLORS = [
  "border-l-2 border-l-sky-400/50",
  "border-l-2 border-l-violet-400/50",
  "border-l-2 border-l-emerald-400/50",
  "border-l-2 border-l-rose-400/50",
  "border-l-2 border-l-amber-400/50",
];
function senderColorClass(senderName: string): string {
  let h = 0;
  for (let i = 0; i < senderName.length; i++) h = (h * 31 + senderName.charCodeAt(i)) & 0xffff;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}

function senderLabel(from: string): string {
  // "omnyid://agent/knowledge_curator" → "knowledge_curator"
  const parts = from.split("/").filter(Boolean);
  const raw = parts[parts.length - 1] ?? from;
  return raw.replace(/_/g, " ");
}

function senderRole(from: string): string {
  const parts = from.split("/").filter(Boolean);
  // segment before the name: "agent", "workspace", "user"
  return parts[parts.length - 2] ?? "";
}

function relativeTime(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

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
  const [atBottom, setAtBottom] = createSignal(true);
  const [showScrollTop, setShowScrollTop] = createSignal(false);
  const [unseenCount, setUnseenCount] = createSignal(0);
  const [copied, setCopied] = createSignal(false);
  const [copiedMsgId, setCopiedMsgId] = createSignal<string | null>(null);
  const [copiedMsgText, setCopiedMsgText] = createSignal<string | null>(null);
  const [showMsgSearch, setShowMsgSearch] = createSignal(false);
  const [msgSearch, setMsgSearch] = createSignal("");
  let msgSearchInputRef: HTMLInputElement | undefined;
  function copyMsgId(id: string) {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId((prev) => (prev === id ? null : prev)), 1500);
    });
  }
  function copyMsgText(content: Record<string, unknown>, msgId: string) {
    const parts: string[] = [];
    const title = content["title"] ?? content["subject"];
    if (typeof title === "string" && title) parts.push(title);
    const body = content["body"] ?? content["summary"] ?? content["description"] ?? content["text"] ?? content["markdown"] ?? content["query"];
    if (typeof body === "string" && body) parts.push(body);
    const text = parts.join("\n\n") || JSON.stringify(content, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMsgText(msgId);
      setTimeout(() => setCopiedMsgText((prev) => (prev === msgId ? null : prev)), 1500);
    });
  }
  const [starredMsgs, setStarredMsgs] = createSignal<Set<string>>(
    (() => { try { return new Set<string>(JSON.parse(localStorage.getItem(STARRED_KEY) ?? "[]")); } catch { return new Set<string>(); } })()
  );
  function toggleStar(id: string) {
    const next = new Set(starredMsgs());
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    setStarredMsgs(next);
    localStorage.setItem(STARRED_KEY, JSON.stringify([...next]));
  }
  const [starredNavIdx, setStarredNavIdx] = createSignal(0);
  const [collapsedMsgs, setCollapsedMsgs] = createSignal<Set<string>>(new Set<string>());
  function toggleCollapse(id: string) {
    const next = new Set(collapsedMsgs());
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsedMsgs(next);
  }
  function collapseAll() {
    setCollapsedMsgs(new Set(renderUnits().map((u) => (u.kind === "generative_card" ? u.card : u.message).id)));
  }
  function expandAll() {
    setCollapsedMsgs(new Set<string>());
  }
  const [replyText, setReplyText] = createSignal("");
  const [replySending, setReplySending] = createSignal(false);
  const [replySent, setReplySent] = createSignal(false);
  const [replyError, setReplyError] = createSignal("");
  let replyRef: HTMLTextAreaElement | undefined;

  async function sendReply() {
    const text = replyText().trim();
    if (!text || replySending()) return;
    setReplySending(true);
    setReplyError("");
    try {
      await orchestrate(text, { thread_id: props.threadId });
      setReplyText("");
      setReplySent(true);
      setTimeout(() => setReplySent(false), 2000);
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "Send failed");
    }
    setReplySending(false);
  }

  function copyThreadId() {
    navigator.clipboard.writeText(props.threadId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function scrollToStarred(idx: number) {
    const ids = [...starredMsgs()];
    if (ids.length === 0 || !messagesContainerRef) return;
    const clamped = ((idx % ids.length) + ids.length) % ids.length;
    setStarredNavIdx(clamped);
    const el = messagesContainerRef.querySelector(`[data-msg-id="${ids[clamped]}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  let messagesContainerRef: HTMLDivElement | undefined;

  const lastReadKey = () => `omnyid.thread.lastread.${props.threadId}`;
  const scrollPosKey = `omnyid.thread.scrollpos.${props.threadId}`;

  function scrollToBottom() {
    if (messagesContainerRef) {
      messagesContainerRef.scrollTop = messagesContainerRef.scrollHeight;
      setAtBottom(true);
      setUnseenCount(0);
      const msgs = messages();
      const last = msgs[msgs.length - 1];
      if (last) localStorage.setItem(lastReadKey(), last.id);
    }
  }

  function onScroll() {
    if (!messagesContainerRef) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef;
    setAtBottom(scrollHeight - scrollTop - clientHeight < 80);
    setShowScrollTop(scrollTop > 200);
    sessionStorage.setItem(scrollPosKey, String(scrollTop));
  }

  /**
   * Group messages for rendering:
   * - `generative_card` messages are rendered with their associated `card_section_update` messages.
   * - All other messages pass through ViewDispatcher unchanged.
   * Returns a list of render units.
   */
  type RenderUnit =
    | { kind: "standalone"; message: AfpMessage }
    | { kind: "generative_card"; card: AfpMessage; updates: AfpMessage[] };

  type RenderEntry =
    | { kind: "date_separator"; label: string; id: string }
    | RenderUnit;

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

  const filteredRenderEntries = createMemo<RenderEntry[]>(() => {
    const q = msgSearch().toLowerCase().trim();
    if (!q || !showMsgSearch()) return renderEntries();
    return renderEntries().filter((entry) => {
      if (entry.kind === "date_separator") return false;
      const msg = entry.kind === "generative_card" ? entry.card : entry.message;
      const c = msg.content as Record<string, unknown>;
      const text = [c.title, c.subject, c.body, c.summary, c.text, c.markdown, c.query, msg.type]
        .filter((v): v is string => typeof v === "string").join(" ").toLowerCase();
      return text.includes(q);
    });
  });

  const displayedEntries = createMemo<RenderEntry[]>(() => {
    const sf = senderFilter();
    if (!sf) return filteredRenderEntries();
    return filteredRenderEntries().filter((entry) => {
      if (entry.kind === "date_separator") return false;
      const msg = entry.kind === "generative_card" ? entry.card : entry.message;
      return senderLabel(msg.from ?? "agent") === sf;
    });
  });

  const renderEntries = createMemo<RenderEntry[]>(() => {
    const units = renderUnits();
    const result: RenderEntry[] = [];
    let lastDate = "";
    for (const unit of units) {
      const msg = unit.kind === "generative_card" ? unit.card : unit.message;
      const ts = msg.timestamp;
      if (ts) {
        const dateLabel = new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        if (dateLabel !== lastDate) {
          lastDate = dateLabel;
          result.push({ kind: "date_separator", label: dateLabel, id: `sep-${dateLabel}` });
        }
      }
      result.push(unit);
    }
    return result;
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

    // Restore scroll position: saved pos → last-read message → bottom
    requestAnimationFrame(() => {
      const savedPos = sessionStorage.getItem(scrollPosKey);
      if (savedPos && messagesContainerRef) {
        messagesContainerRef.scrollTop = parseInt(savedPos);
        return;
      }
      const lastId = localStorage.getItem(lastReadKey());
      if (lastId && messagesContainerRef) {
        const el = messagesContainerRef.querySelector(`[data-msg-id="${lastId}"]`) as HTMLElement | null;
        if (el) { el.scrollIntoView({ block: "start" }); return; }
      }
      scrollToBottom();
    });

    // Subscribe to relay for real-time updates
    const unsub = subscribeThread(props.threadId, () => void reload());
    setLive(true);

    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          setShowMsgSearch((v) => !v);
          requestAnimationFrame(() => msgSearchInputRef?.focus());
          return;
        }
      }
      if (e.key === "Escape") {
        if (showMsgSearch()) { setShowMsgSearch(false); setMsgSearch(""); return; }
        props.onBack?.();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    onCleanup(() => {
      unsub();
      setLive(false);
      document.removeEventListener("keydown", onKeyDown);
      clearInterval(typingTimerId);
      if (messagesContainerRef) {
        sessionStorage.setItem(scrollPosKey, String(messagesContainerRef.scrollTop));
      }
    });
  });

  let prevUnitCount = 0;
  createEffect(() => {
    const units = renderUnits();
    const delta = units.length - prevUnitCount;
    prevUnitCount = units.length;
    if (units.length > 0 && atBottom()) {
      requestAnimationFrame(() => scrollToBottom());
    } else if (delta > 0 && !atBottom()) {
      setUnseenCount((n) => n + delta);
    }
  });

  const formatCounts = () => {
    const counts: Record<string, number> = {};
    for (const m of messages()) {
      const fmt = m.views?.[0]?.format ?? "inbox";
      counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return Object.entries(counts);
  };

  const senderCounts = createMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of messages()) {
      const name = senderLabel(m.from ?? "agent");
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  });
  const [showSenderBreakdown, setShowSenderBreakdown] = createSignal(false);
  const [senderFilter, setSenderFilter] = createSignal<string | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = createSignal(false);

  const [typingStartedAt, setTypingStartedAt] = createSignal<number | null>(null);
  const [typingElapsed, setTypingElapsed] = createSignal(0);
  let typingTimerId: ReturnType<typeof setInterval> | undefined;
  function formatTypingElapsed(secs: number): string {
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }
  createEffect(() => {
    const msgs = messages();
    const now = Date.now();
    const typingMsg = msgs.find((m) =>
      (m.type === "typing" || m.type === "daemon_typing") &&
      m.timestamp &&
      now - new Date(m.timestamp).getTime() < 30_000
    );
    if (typingMsg) {
      if (!typingStartedAt()) {
        const start = typingMsg.timestamp ? new Date(typingMsg.timestamp).getTime() : now;
        setTypingStartedAt(start);
        setTypingElapsed(Math.floor((now - start) / 1000));
        clearInterval(typingTimerId);
        typingTimerId = setInterval(() => {
          const s = typingStartedAt();
          if (s) setTypingElapsed(Math.floor((Date.now() - s) / 1000));
        }, 1000);
      }
    } else if (typingStartedAt()) {
      setTypingStartedAt(null);
      setTypingElapsed(0);
      clearInterval(typingTimerId);
    }
  });

  const messageDates = createMemo(() => {
    const seen = new Set<string>();
    const dates: string[] = [];
    for (const m of messages()) {
      if (!m.timestamp) continue;
      const d = new Date(m.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (!seen.has(d)) { seen.add(d); dates.push(d); }
    }
    return dates;
  });

  function jumpToDate(dateLabel: string) {
    if (!messagesContainerRef) return;
    for (const m of messages()) {
      if (!m.timestamp) continue;
      const d = new Date(m.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (d === dateLabel) {
        const el = messagesContainerRef.querySelector(`[data-msg-id="${m.id}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
  }

  return (
    <div class="space-y-6">
      {/* Header */}
      <GlassPanel class="p-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Thread</p>
            <div class="mt-1 flex items-center gap-2">
              <h2 class="break-all font-mono text-lg font-semibold text-on-surface">
                {props.threadId}
              </h2>
              <button
                type="button"
                onClick={copyThreadId}
                title="Copy thread ID"
                class="flex-shrink-0 rounded-full border border-white/30 bg-white/30 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant transition hover:bg-white/60"
              >
                {copied() ? "✓" : "⧉"}
              </button>
            </div>
          </div>
          <Show when={messageDates().length > 1 && !headerCollapsed()}>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <span class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline">Jump</span>
              <For each={messageDates()}>
                {(date) => (
                  <button
                    type="button"
                    onClick={() => jumpToDate(date)}
                    class="rounded-full border border-white/30 bg-white/25 px-2.5 py-0.5 font-mono text-[9px] text-on-surface-variant transition hover:bg-white/50"
                  >
                    {date}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <div class="flex items-center gap-3">
            <Show when={!headerCollapsed()}>
              <Show when={starredMsgs().size > 0}>
                <div class="flex items-center rounded-full bg-amber-400/15">
                  <button
                    type="button"
                    title="Previous bookmark"
                    onClick={() => scrollToStarred(starredNavIdx() - 1)}
                    class="rounded-full px-2 py-1 font-mono text-[9px] text-amber-500 transition hover:bg-amber-400/20"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    title={`Jump to bookmark ${starredNavIdx() + 1} of ${starredMsgs().size}`}
                    onClick={() => scrollToStarred(starredNavIdx())}
                    class="px-1 font-mono text-[9px] text-amber-600"
                  >
                    ★ {starredMsgs().size}
                  </button>
                  <button
                    type="button"
                    title="Next bookmark"
                    onClick={() => scrollToStarred(starredNavIdx() + 1)}
                    class="rounded-full px-2 py-1 font-mono text-[9px] text-amber-500 transition hover:bg-amber-400/20"
                  >
                    ▶
                  </button>
                </div>
              </Show>
              <Show when={messages().length > 0}>
                <div class="flex flex-wrap gap-2">
                  <For each={formatCounts()}>
                    {([fmt, count]) => (
                      <span class="rounded-full bg-white/50 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant">
                        {fmt} · {count}
                      </span>
                    )}
                  </For>
                  <Show when={senderCounts().length > 1}>
                    <div class="relative">
                      <button
                        type="button"
                        onClick={() => setShowSenderBreakdown((v) => !v)}
                        class="rounded-full bg-white/50 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant transition hover:bg-white/70"
                        title="Message count by sender"
                      >
                        by sender {showSenderBreakdown() ? "▴" : "▾"}
                      </button>
                      <Show when={showSenderBreakdown()}>
                        <div class="absolute right-0 top-full z-40 mt-1 min-w-[160px] animate-fade-in rounded-xl border border-white/45 bg-white/95 p-2 shadow-panel backdrop-blur-xl">
                          <For each={senderCounts()}>
                            {([name, count]) => (
                              <button
                                type="button"
                                onClick={() => { setSenderFilter((prev) => prev === name ? null : name); setShowSenderBreakdown(false); }}
                                class={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-xs transition hover:bg-primary/8 ${senderFilter() === name ? "text-primary font-semibold" : "text-on-surface-variant"}`}
                              >
                                <span class="font-mono truncate">{name}</span>
                                <span class="flex-shrink-0 font-mono text-[10px] text-on-surface-variant/50">{count}</span>
                              </button>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </Show>
                </div>
              </Show>
              {/* Message count */}
              <Show when={messages().length > 0}>
                <div class="flex items-center gap-1.5">
                  <span class="rounded-full bg-white/50 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant">
                    {messages().length} {messages().length === 1 ? "message" : "messages"}
                  </span>
                  <Show when={messages().length > 1}>
                    <Show
                      when={collapsedMsgs().size < renderUnits().length}
                      fallback={
                        <button
                          type="button"
                          onClick={expandAll}
                          class="rounded-full border border-white/30 bg-white/25 px-2.5 py-1 font-mono text-[9px] text-on-surface-variant transition hover:bg-white/50"
                        >
                          Expand all
                        </button>
                      }
                    >
                      <button
                        type="button"
                        onClick={collapseAll}
                        class="rounded-full border border-white/30 bg-white/25 px-2.5 py-1 font-mono text-[9px] text-on-surface-variant transition hover:bg-white/50"
                      >
                        Collapse all
                      </button>
                    </Show>
                  </Show>
                  <Show when={collapsedMsgs().size > 0}>
                    <span class="rounded-full border border-outline/20 bg-outline/8 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-on-surface-variant/50">
                      {collapsedMsgs().size} collapsed
                    </span>
                  </Show>
                  <button
                    type="button"
                    title="Search messages (Ctrl+F)"
                    onClick={() => { setShowMsgSearch((v) => !v); requestAnimationFrame(() => msgSearchInputRef?.focus()); }}
                    class={`rounded-full border px-2.5 py-1 font-mono text-[9px] transition ${showMsgSearch() ? "border-primary/30 bg-primary/10 text-primary" : "border-white/30 bg-white/25 text-on-surface-variant hover:bg-white/50"}`}
                  >
                    ⌕
                  </button>
                  <Show when={senderFilter()}>
                    <button
                      type="button"
                      onClick={() => setSenderFilter(null)}
                      title="Clear sender filter"
                      class="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[9px] text-primary transition hover:bg-primary/20"
                    >
                      {senderFilter()} ×
                    </button>
                  </Show>
                  <Show when={unseenCount() > 0 && !atBottom()}>
                    <span class="animate-fade-in rounded-full bg-amber-400/90 px-2 py-0.5 font-mono text-[9px] font-semibold text-white">
                      +{unseenCount()} new
                    </span>
                  </Show>
                </div>
              </Show>
            </Show>
            {/* Live indicator + header collapse toggle */}
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
            <button
              type="button"
              title={headerCollapsed() ? "Expand thread header" : "Collapse thread header"}
              onClick={() => setHeaderCollapsed((v) => !v)}
              class="rounded-full border border-white/30 bg-white/20 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant/50 transition hover:bg-white/40 hover:text-on-surface-variant"
            >
              {headerCollapsed() ? "▾" : "▴"}
            </button>
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
        <div class="relative">
          <Show when={showScrollTop()}>
            <div class="absolute top-0 left-0 right-0 z-10 flex justify-center pointer-events-none animate-fade-in">
              <button
                type="button"
                class="pointer-events-auto flex items-center gap-[0.375em] rounded-full border border-white/50 bg-white/80 px-[1em] py-[0.375em] text-xs font-medium text-on-surface shadow-md backdrop-blur-sm transition hover:bg-white"
                onClick={() => { if (messagesContainerRef) messagesContainerRef.scrollTop = 0; }}
              >
                ↑ top
              </button>
            </div>
          </Show>
          {/* Ctrl+F message search bar */}
          <Show when={showMsgSearch()}>
            <div class="mb-2 flex items-center gap-2 animate-fade-in">
              <input
                ref={msgSearchInputRef}
                type="text"
                value={msgSearch()}
                onInput={(e) => setMsgSearch(e.currentTarget.value)}
                placeholder="Search messages… (Ctrl+F)"
                class="flex-1 rounded-xl border border-white/30 bg-white/30 px-4 py-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:border-primary/40"
              />
              <Show when={msgSearch()}>
                <span class="flex-shrink-0 font-mono text-[10px] text-on-surface-variant/50">
                  {filteredRenderEntries().filter((e) => e.kind !== "date_separator").length} match{filteredRenderEntries().filter((e) => e.kind !== "date_separator").length === 1 ? "" : "es"}
                </span>
              </Show>
              <button
                type="button"
                onClick={() => { setShowMsgSearch(false); setMsgSearch(""); }}
                class="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs text-on-surface-variant/50 transition hover:text-on-surface-variant"
              >×</button>
            </div>
          </Show>
          {/* Bookmarks minimap — vertical track on right edge */}
          <Show when={starredMsgs().size > 0}>
            {(() => {
              type RenderUnit2 = { kind: "standalone"; message: AfpMessage } | { kind: "generative_card"; card: AfpMessage; updates: AfpMessage[] };
              const msgEntries = renderEntries().filter((e): e is RenderUnit2 => e.kind !== "date_separator");
              const total = msgEntries.length;
              if (total === 0) return null;
              return (
                <div class="absolute right-0 top-0 bottom-0 z-10 flex w-1.5 flex-col" title="Bookmarked messages">
                  <div class="relative flex-1 rounded-full bg-white/15">
                    <For each={msgEntries}>
                      {(entry, i) => {
                        const msgId = entry.kind === "generative_card" ? entry.card.id : entry.kind === "standalone" ? entry.message.id : null;
                        if (!msgId || !starredMsgs().has(msgId)) return null;
                        const pct = total > 1 ? (i() / (total - 1)) * 100 : 50;
                        return (
                          <button
                            type="button"
                            title="Jump to bookmark"
                            onClick={() => {
                              const el = messagesContainerRef?.querySelector(`[data-msg-id="${msgId}"]`) as HTMLElement | null;
                              el?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            class="absolute left-0 right-0 mx-auto h-2 w-2 -translate-y-1/2 rounded-full bg-amber-400 shadow-sm transition hover:scale-150"
                            style={`top: ${pct}%`}
                          />
                        );
                      }}
                    </For>
                  </div>
                </div>
              );
            })()}
          </Show>
          <div
            ref={messagesContainerRef}
            class="max-h-[65vh] overflow-y-auto space-y-4 pr-3 scroll-smooth"
            onScroll={onScroll}
          >
            <For
              each={displayedEntries()}
              fallback={
                <GlassPanel class="p-5">
                  <p class="text-sm text-on-surface-variant">No messages in this thread yet.</p>
                </GlassPanel>
              }
            >
              {(entry) => {
                if (entry.kind === "date_separator") {
                  return (
                    <div class="flex items-center gap-3 py-1">
                      <div class="h-px flex-1 bg-white/15" />
                      <span class="font-mono text-[9px] text-on-surface-variant/30">{entry.label}</span>
                      <div class="h-px flex-1 bg-white/15" />
                    </div>
                  );
                }
                const unit = entry;
                const msg = unit.kind === "generative_card" ? unit.card : unit.message;
                const role = senderRole(msg.from ?? "");
                const isUser = role === "user" || role === "workspace";
                const name = senderLabel(msg.from ?? "agent");
                return (
                  <div class={`group space-y-1.5 ${senderCounts().length > 1 && !isUser ? senderColorClass(name) : ""}`} data-msg-id={msg.id}>
                    <div class={`flex items-center gap-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
                      <button
                        type="button"
                        onClick={() => !isUser && setSenderFilter((prev) => prev === name ? null : name)}
                        title={isUser ? undefined : senderFilter() === name ? "Clear sender filter" : `Filter to ${name}`}
                        class={`font-mono text-[9px] uppercase tracking-[0.16em] transition ${
                          !isUser ? "cursor-pointer hover:text-primary" : "cursor-default"
                        } ${senderFilter() === name ? "font-semibold text-primary" : "text-on-surface-variant/50"}`}
                      >
                        {isUser ? "you" : name}
                      </button>
                      <Show when={!isUser}>
                        <span class="rounded-full border border-white/30 bg-white/25 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-on-surface-variant/40">
                          {msg.type}
                        </span>
                      </Show>
                      <Show when={msg.timestamp}>
                        <span class="font-mono text-[8px] text-on-surface-variant/30">
                          {relativeTime(msg.timestamp)}
                        </span>
                      </Show>
                      <button
                        type="button"
                        title="Copy message text"
                        onClick={() => copyMsgText(msg.content, msg.id)}
                        class="font-mono text-[0.55em] text-on-surface-variant/20 opacity-0 transition group-hover:opacity-100 hover:!text-on-surface-variant/60"
                      >
                        {copiedMsgText() === msg.id ? "✓" : "copy"}
                      </button>
                      <button
                        type="button"
                        title={`Copy message ID: ${msg.id}`}
                        onClick={() => copyMsgId(msg.id)}
                        class="font-mono text-[0.55em] text-on-surface-variant/20 opacity-0 transition group-hover:opacity-100 hover:!text-on-surface-variant/60"
                      >
                        {copiedMsgId() === msg.id ? "✓" : "⧉"}
                      </button>
                      <button
                        type="button"
                        title={starredMsgs().has(msg.id) ? "Remove bookmark" : "Bookmark this message"}
                        onClick={() => toggleStar(msg.id)}
                        class={`text-[0.7em] transition ${starredMsgs().has(msg.id) ? "text-amber-400 opacity-100" : "text-on-surface-variant/20 opacity-0 group-hover:opacity-100 hover:!text-amber-400"}`}
                      >
                        {starredMsgs().has(msg.id) ? "★" : "☆"}
                      </button>
                      <button
                        type="button"
                        title={collapsedMsgs().has(msg.id) ? "Expand message" : "Collapse message"}
                        onClick={() => toggleCollapse(msg.id)}
                        class="font-mono text-[0.6em] text-on-surface-variant/20 opacity-0 transition group-hover:opacity-100 hover:!text-on-surface-variant/60"
                      >
                        {collapsedMsgs().has(msg.id) ? "▸" : "▾"}
                      </button>
                    </div>
                    <Show when={!collapsedMsgs().has(msg.id)}>
                    <div class="space-y-3">
                      {unit.kind === "generative_card" ? (
                        <>
                          <ViewDispatcher message={unit.card} cardUpdates={unit.updates} />
                          <Show when={props.advanced}>
                            <AlternateViewsInspector message={unit.card} cardUpdates={unit.updates} compact />
                          </Show>
                        </>
                      ) : (
                        <>
                          <ViewDispatcher message={unit.message} />
                          <Show when={props.advanced}>
                            <AlternateViewsInspector message={unit.message} compact />
                          </Show>
                        </>
                      )}
                    </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
          <Show when={!atBottom()}>
            <div class="sticky bottom-0 flex justify-center pb-2 pt-1 animate-fade-in">
              <button
                type="button"
                onClick={scrollToBottom}
                class="flex items-center gap-1.5 rounded-full border border-white/50 bg-white/80 px-4 py-1.5 text-xs font-medium text-on-surface shadow-md backdrop-blur-sm transition hover:bg-white"
              >
                ↓ {unseenCount() > 0 ? `${unseenCount()} new` : "Jump to latest"}
              </button>
            </div>
          </Show>
        </div>
      </Show>

      {/* Typing indicator */}
      <Show when={typingStartedAt() !== null}>
        <div class="flex items-center gap-2 px-2 py-1 animate-fade-in">
          <div class="flex gap-[3px]">
            <span class="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce" style="animation-delay: 0ms" />
            <span class="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce" style="animation-delay: 150ms" />
            <span class="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce" style="animation-delay: 300ms" />
          </div>
          <span class="font-mono text-[9px] text-on-surface-variant/50">
            agent is thinking… {formatTypingElapsed(typingElapsed())}
          </span>
        </div>
      </Show>

      {/* Reply compose box */}
      <GlassPanel class="p-4">
        <form onSubmit={(e) => { e.preventDefault(); void sendReply(); }}>
          <textarea
            ref={replyRef}
            rows={1}
            value={replyText()}
            onInput={(e) => {
              setReplyText(e.currentTarget.value);
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); }
            }}
            placeholder="Reply in this thread… (Enter to send, Shift+Enter for newline)"
            disabled={replySending()}
            class="w-full resize-none overflow-hidden rounded-xl border border-white/30 bg-white/30 px-4 py-2.5 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:border-primary/40 disabled:opacity-60"
            style="min-height: 40px"
          />
          <div class="mt-2 flex items-center justify-between gap-3">
            <Show when={replyError()}>
              <span class="text-xs text-red-500">{replyError()}</span>
            </Show>
            <Show when={replySent()}>
              <span class="text-xs font-medium text-green-600">✓ Sent to orchestrator</span>
            </Show>
            <Show when={replyText().length > 50}>
              <span class="font-mono text-[0.65em] tabular-nums text-on-surface-variant/40">
                {replyText().length} chars · ~{Math.round(replyText().length / 4)} tokens
              </span>
            </Show>
            <div class="flex-1" />
            <button
              type="submit"
              disabled={replySending() || !replyText().trim()}
              class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 transition hover:bg-primary/80"
            >
              {replySending() ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </GlassPanel>
    </div>
  );
}
