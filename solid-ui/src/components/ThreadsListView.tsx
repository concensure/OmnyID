import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import type { AfpMessage, ThreadSummary, ThreadSummariesResponse } from "@/lib/api";
import {
  createNoteFromThread,
  fetchThreadSummaries,
  readSession,
} from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { QueueDensityToggle } from "@/components/QueueDensityToggle";
import { ThreadDiscoveryLens } from "@/components/ThreadDiscoveryLens";
import { ThreadDiscoveryStateSummary } from "@/components/ThreadDiscoveryStateSummary";
import { subscribeMagicActionEvent } from "@/lib/magicActionEvent";
import { collectKindCounts, objectKindLabel } from "@/lib/objectKinds";
import { createLocalSemanticRouterPreviewController } from "@/lib/localSemanticRouter";
import { buildThreadSearchInput, parseThreadSearchInput } from "@/lib/threadSearch";
import {
  buildThreadSummariesSearchRequest,
  isThreadSummariesSearchActive,
  threadSummariesList,
  threadSummariesRetrievalState,
} from "@/lib/threadSummariesResponseState";
import { isRecord } from "@/lib/eventDetail";
import { threadMessagePreview, threadMessagePreviewBullets } from "@/lib/threadMessageRowState";
import type { ThreadSearchLaunchContext } from "@/lib/threadSearchNavigation";
import { threadSortMillis, type ThreadSortMode } from "@/lib/threadSort";
import {
  loadDismissedMergePairs,
  loadArchivedThreadIds,
  loadThreadDensity,
  loadThreadLastRead,
  loadLockedThreadIds,
  loadThreadOrder,
  loadPinnedThreadIds,
  loadThreadPriority,
  loadThreadQueryHistory,
  loadThreadSortMode,
  loadStarredThreadIds,
  loadThreadTitles,
  saveArchivedThreadIds,
  saveDismissedMergePairs,
  saveThreadDensity,
  saveThreadLastRead,
  saveLockedThreadIds,
  saveThreadOrder,
  savePinnedThreadIds,
  saveThreadPriority,
  saveThreadSortMode,
  saveStarredThreadIds,
  saveThreadTitles,
  threadDensityIsCompact,
  type ThreadDensity,
  type ThreadPriorityLevel,
} from "@/lib/threadListLocalState";
import { applyThreadSelection, pruneThreadSelectionToVisible } from "@/lib/threadMultiSelect";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import {
  buildThreadSearchFailureReceipt,
  type ThreadSearchFailureReceipt,
} from "@/lib/threadSearchFailureState";
import {
  loadVimNavigationEnabled,
  subscribeVimNavigationPreference,
} from "@/lib/vimNavigationPreference";
import { afpRecord } from "@/lib/afpMessageRecord";
import * as threadListState from "@/lib/threadListViewState";
import {
  loadThreadRelatedContextState,
  mergeSelectedThreadsState,
  submitThreadReplyState,
  toggleThreadReplyComposerState,
  type ThreadRelatedContextEntry as ThreadInteractionContextEntry,
} from "@/lib/threadInteractionState";
import type { ThreadOrchestrationFailureReceipt } from "@/lib/threadOrchestrationFailureState";

function threadListScalarString(value: unknown, fallback = ""): string {
  return threadListState.threadListScalarString(value, fallback);
}

function threadListFirstString(record: Record<string, unknown>, keys: string[], fallback = ""): string {
  return threadListState.threadListFirstString(record, keys, fallback);
}

// 15a/15o — derive a human-readable title from the first message's content
function threadTitle(tid: string, msgs: AfpMessage[]): string {
  return threadListState.threadTitle(tid, msgs);
}

// 15r — derive sender name from AFP message content/metadata
function deriveSender(msg: AfpMessage): string {
  return threadListState.deriveThreadSender(msg);
}

// 15r — derive channel label from AFP message type
function deriveNoticeChannel(msg: AfpMessage): { label: string; icon: string } {
  return threadListState.deriveThreadNoticeChannel(msg);
}

type SenderGroup = {
  sender: string;
  channel: string;
  channelIcon: string;
  msgs: AfpMessage[];
};

// 13l — relative timestamp helper
function relativeTime(isoStr: string | undefined): string {
  return threadListState.relativeThreadTime(isoStr);
}

// 16i — avatar initials colour derived from sender name hash
function senderColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  const hue = h % 360;
  return `hsl(${hue},55%,52%)`;
}
function senderInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// 27b — one-word intent label derived from message type for preview panel
function intentLabel(msgType: string): string {
  return threadListState.threadIntentLabel(msgType);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 16g — highlight matching substring with <mark>; text is HTML-escaped first to prevent XSS
function highlightMatch(text: string, query: string): string {
  const safe = escapeHtml(text);
  if (!query.trim()) return safe;
  try {
    const safeQuery = escapeHtml(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return safe.replace(new RegExp(`(${safeQuery})`, "gi"), "<mark>$1</mark>");
  } catch { return safe; }
}

function threadPreviewMeta(message: Pick<AfpMessage, "type" | "timestamp">) {
  return threadListState.threadPreviewMetaState(message);
}

function threadBoundaryText(timestamp: string | undefined) {
  return threadListState.threadBoundaryLabel(timestamp);
}

function threadQueryHistoryMeta(timestamp: string) {
  return threadListState.threadQueryHistoryPresentation({ timestamp });
}

function targetIsTypingSurface(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  const tag = element?.tagName ?? "";
  return ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || Boolean(element?.isContentEditable);
}

function threadSupertags(msgs: AfpMessage[]): string[] {
  const tags = new Set<string>();
  for (const msg of msgs) {
    for (const tag of msg.supertags ?? []) {
      const normalized = String(tag ?? "").trim().toLowerCase();
      if (normalized) tags.add(normalized);
    }
  }
  return [...tags];
}

function supertagTopicKey(tags: string[]): string | null {
  const preferredPrefixes = ["project:", "area:", "resource:", "topic:"];
  for (const prefix of preferredPrefixes) {
    const match = tags.find((tag) => tag.startsWith(prefix) && tag.length > prefix.length);
    if (match) return match.slice(prefix.length);
  }
  const generic = tags[0];
  return generic ? generic.replace(/^#/, "") : null;
}

type ThreadFilter = "all" | "search" | "notice" | "suggestions";
type ThreadContextMenuState = {
  threadId: string;
  x: number;
  y: number;
};

/** Thread list view with filter tabs for Search history and Notice channels. */
export function ThreadsListView(props: {
  messages: AfpMessage[];
  threadSummaries?: ThreadSummary[];
  initialSearchQuery?: string | null;
  initialSearchLaunchContext?: ThreadSearchLaunchContext | null;
  onOpenThread: (threadId: string) => void;
  onRequestSearchFocus?: () => void;
  onOpenAgentSettings?: () => void;
}) {
  const sessionUserId = readSession()?.user?.id ?? null;
  let threadsRootRef: HTMLDivElement | undefined;
  let threadSearchInputRef: HTMLInputElement | undefined;
  const [filter, setFilter] = createSignal<ThreadFilter>("all");
  const [density, setDensity] = createSignal<ThreadDensity>(loadThreadDensity(sessionUserId));
  function setDensityMode(mode: ThreadDensity) {
    setDensity(mode);
    saveThreadDensity(mode, sessionUserId);
  }
  const [sortMode, setSortMode] = createSignal<ThreadSortMode>(loadThreadSortMode(sessionUserId));
  function setThreadSortMode(mode: ThreadSortMode) {
    setSortMode(mode);
    saveThreadSortMode(mode, sessionUserId);
  }
  // 16g — thread search query
  const [threadSearch, setThreadSearch] = createSignal("");
  const [threadContextMenu, setThreadContextMenu] = createSignal<ThreadContextMenuState | null>(null);
  // 16f — last-read timestamps per thread
  const MAX_LAST_READ = 500;
  const [lastRead, setLastRead] = createSignal<Record<string, string>>(loadThreadLastRead(sessionUserId));
  function markRead(tid: string) {
    const ts = new Date().toISOString();
    setLastRead(prev => {
      let n = { ...prev, [tid]: ts };
      // Evict oldest entries if cap exceeded
      const keys = Object.keys(n);
      if (keys.length > MAX_LAST_READ) {
        const sorted = keys.sort((a, b) => (n[a] ?? "").localeCompare(n[b] ?? ""));
        for (const k of sorted.slice(0, keys.length - MAX_LAST_READ)) delete n[k];
      }
      saveThreadLastRead(n, sessionUserId);
      return n;
    });
  }
  function unreadCount(tid: string, msgs: AfpMessage[]): number {
    const lr = lastRead()[tid];
    if (!lr) return msgs.length;
    return msgs.filter(m => m.timestamp && new Date(m.timestamp) > new Date(lr)).length;
  }
  function isThreadUnread(tid: string, msgs: AfpMessage[]): boolean {
    return unreadCount(tid, msgs) > 0;
  }
  // 19l — archived threads
  const [archivedThreads, setArchivedThreads] = createSignal<Set<string>>(loadArchivedThreadIds(sessionUserId));
  const [showArchived, setShowArchived] = createSignal(false);
  function archiveThread(tid: string) {
    setArchivedThreads(prev => {
      const next = new Set(prev);
      next.add(tid);
      return saveArchivedThreadIds(next, sessionUserId);
    });
  }
  function unarchiveThread(tid: string) {
    setArchivedThreads(prev => {
      const next = new Set(prev);
      next.delete(tid);
      return saveArchivedThreadIds(next, sessionUserId);
    });
  }

  // 19n — inline thread title edit
  const [threadTitles, setThreadTitles] = createSignal<Record<string, string>>(loadThreadTitles(sessionUserId));
  const [editingTitleId, setEditingTitleId] = createSignal<string | null>(null);
  const [titleDraft, setTitleDraft] = createSignal("");

  // 18m — starred threads
  const [starredThreads, setStarredThreads] = createSignal<Set<string>>(loadStarredThreadIds(sessionUserId));
  function toggleStar(tid: string) {
    setStarredThreads(prev => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid); else next.add(tid);
      return saveStarredThreadIds(next, sessionUserId);
    });
  }

  // 17q — thread drag reorder
  const [threadOrder, setThreadOrder] = createSignal<string[]>(loadThreadOrder(sessionUserId));
  const [dragSrc, setDragSrc] = createSignal<string | null>(null);
  const [dragOver, setDragOver] = createSignal<string | null>(null);
  // Cross-domain drag: track when an email card is being dragged toward a note target
  const [crossDragThread, setCrossDragThread] = createSignal<string | null>(null);
  const [noteDropZone, setNoteDropZone] = createSignal<"none" | "over" | "success" | "error">("none");
  const [noteDropStatus, setNoteDropStatus] = createSignal("");
  function reorderThreads(srcId: string, tgtId: string) {
    setThreadOrder(prev => {
      const ids = threads().map(t => t.threadId);
      const order = prev.length > 0 ? prev : ids;
      const next = [...order];
      const si = next.indexOf(srcId); const ti = next.indexOf(tgtId);
      if (si < 0) { next.unshift(srcId); } else { next.splice(si, 1); next.splice(ti < 0 ? 0 : ti, 0, srcId); }
      return saveThreadOrder(next, sessionUserId);
    });
  }
  // 16h — swipe-to-archive tracking
  const [swipeTouchX, setSwipeTouchX] = createSignal<Record<string, number>>({});
  const [swipeRevealed, setSwipeRevealed] = createSignal<string | null>(null);
  // 14c — inline thread preview: expand to show message snippet before opening
  const [previewThreadId, setPreviewThreadId] = createSignal<string | null>(null);
  const [remoteThreadResponse, setRemoteThreadResponse] = createSignal<ThreadSummariesResponse | null>(null);
  const [remoteThreadSearchError, setRemoteThreadSearchError] = createSignal<ThreadSearchFailureReceipt | null>(null);
  const localRouterPreview = createLocalSemanticRouterPreviewController({ profile: "thread" });
  // Progressive summary disclosure: which thread row has its summary bullets expanded
  const [expandedSummaryId, setExpandedSummaryId] = createSignal<string | null>(null);
  // Contextual echoes: related knowledge cards fetched for the open preview
  const [relatedCtx, setRelatedCtx] = createSignal<Map<string, ThreadInteractionContextEntry>>(new Map());
  const [threadActionError, setThreadActionError] = createSignal<ThreadOrchestrationFailureReceipt | null>(null);

  function focusThreadSearchInput() {
    setFilter("all");
    queueMicrotask(() => threadSearchInputRef?.focus());
  }

  async function fetchRelatedCtx(threadId: string, messageId: string) {
    const current = relatedCtx();
    setRelatedCtx(new Map(current).set(threadId, { loading: true, items: [] }));
    const next = await loadThreadRelatedContextState({
      current,
      threadId,
      messageId,
    });
    setRelatedCtx(next);
  }

  createEffect(() => {
    const tid = previewThreadId();
    if (!tid || relatedCtx().has(tid)) return;
    const t = threads().find(t => t.threadId === tid);
    const msgId = t?.lastMessage?.id;
    if (msgId) fetchRelatedCtx(tid, msgId);
  });

  // 26h — long-press preview: timer refs (not reactive)
  const longPressTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  const longPressStartPos: Record<string, { x: number; y: number }> = {};

  // 20l — thread merge selection
  const [selectedForMerge, setSelectedForMerge] = createSignal<Set<string>>(new Set());
  const [selectionAnchorThreadId, setSelectionAnchorThreadId] = createSignal<string | null>(null);
  const [merging, setMerging] = createSignal(false);
  function selectedVisibleThreads() {
    const selected = selectedForMerge();
    return threads().filter((thread) => selected.has(thread.threadId));
  }
  function selectedArchivableThreadIds() {
    return selectedVisibleThreads()
      .map((thread) => thread.threadId)
      .filter((threadId) => !archivedThreads().has(threadId) && !lockedThreads().has(threadId));
  }
  function selectedExportableThreads() {
    return selectedVisibleThreads().filter((thread) => thread.messages.length > 0);
  }

  function setThreadSelection(threadId: string, checked: boolean, options?: { shiftKey?: boolean }) {
    const shiftKey = options?.shiftKey ?? false;
    const visibleIds = threads().map((thread) => thread.threadId);
    setSelectedForMerge((prev) =>
      applyThreadSelection(prev, visibleIds, threadId, checked, selectionAnchorThreadId(), shiftKey)
    );
    setSelectionAnchorThreadId(threadId);
  }

  function handleThreadPrimaryClick(event: MouseEvent, threadId: string) {
    if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      const selected = selectedForMerge().has(threadId);
      setThreadSelection(threadId, !selected, { shiftKey: true });
      return;
    }
    markRead(threadId);
    props.onOpenThread(threadId);
  }

  function clearSelectedThreads() {
    setSelectedForMerge(new Set<string>());
    setSelectionAnchorThreadId(null);
  }

  async function mergeSelectedThreads() {
    const ids = [...selectedForMerge()];
    if (ids.length < 2) return;
    setThreadActionError(null);
    setMerging(true);
    try {
      const result = await mergeSelectedThreadsState(ids);
      if (result.shouldClearSelection) clearSelectedThreads();
      setThreadActionError(result.error);
    } finally { setMerging(false); }
  }

  function selectAllVisibleThreads() {
    const visibleIds = threads().map((thread) => thread.threadId);
    setSelectedForMerge(new Set(visibleIds));
    setSelectionAnchorThreadId(visibleIds[0] ?? null);
  }

  function archiveSelectedThreads() {
    const ids = selectedArchivableThreadIds();
    if (ids.length === 0) return;
    setArchivedThreads((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return saveArchivedThreadIds(next);
    });
    clearSelectedThreads();
  }

  // 21f — locked threads (prevent archive/merge)
  const [lockedThreads, setLockedThreads] = createSignal<Set<string>>(loadLockedThreadIds());
  function toggleLock(tid: string) {
    setLockedThreads(prev => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid); else next.add(tid);
      return saveLockedThreadIds(next);
    });
  }

  const [pinnedThreads, setPinnedThreads] = createSignal<Set<string>>(loadPinnedThreadIds());
  function togglePin(tid: string) {
    setPinnedThreads(prev => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid); else next.add(tid);
      return savePinnedThreadIds(next);
    });
  }

  // 22f — inline quick reply composer
  const [replyingToThread, setReplyingToThread] = createSignal<string | null>(null);
  const [replyDraft, setReplyDraft] = createSignal("");
  const [replySubmittingThreadId, setReplySubmittingThreadId] = createSignal<string | null>(null);

  // 27c — dismissed merge suggestion pairs (persisted to avoid re-showing)
  const [dismissedMergePairs, setDismissedMergePairs] = createSignal<Set<string>>(loadDismissedMergePairs());

  async function submitReply(threadId: string) {
    if (!replyDraft().trim() || replySubmittingThreadId() === threadId) return;
    setThreadActionError(null);
    setReplySubmittingThreadId(threadId);
    try {
      const result = await submitThreadReplyState({
        threadId,
        replyDraft: replyDraft(),
        replyingToThreadId: replyingToThread(),
        submittingThreadId: replySubmittingThreadId(),
      });
      setReplyDraft(result.nextReplyDraft);
      setReplyingToThread(result.nextReplyingThreadId);
      setThreadActionError(result.error);
    } finally {
      if (replySubmittingThreadId() === threadId) setReplySubmittingThreadId(null);
    }
  }

  // 22g — thread priority flag
  const [threadPriority, setThreadPrioritySignal] = createSignal<Record<string, ThreadPriorityLevel | null>>(
    loadThreadPriority(sessionUserId)
  );

  function setPriority(threadId: string, level: ThreadPriorityLevel | null) {
    setThreadPrioritySignal(prev => {
      const next = { ...prev, [threadId]: level };
      return saveThreadPriority(next, sessionUserId);
    });
  }

  function cyclePriority(threadId: string) {
    const current = threadPriority()[threadId] ?? null;
    const next: ThreadPriorityLevel | null =
      current === null ? "high" :
      current === "high" ? "medium" :
      current === "medium" ? "low" :
      null;
    setPriority(threadId, next);
  }

  function priorityEmoji(level: ThreadPriorityLevel | null | undefined): string {
    if (level === "high") return "🔴";
    if (level === "medium") return "🟡";
    if (level === "low") return "🔵";
    return "○";
  }

    function threadMarkdownLines(thread: { threadId: string; messages: AfpMessage[] }) {
    return threadListState.threadMarkdownLines(
      thread,
      threadTitles()[thread.threadId] ?? threadTitle(thread.threadId, thread.messages),
    );
  }

  // 21e — export thread as Markdown
  function exportThread(thread: { threadId: string; messages: AfpMessage[] }) {
    const lines = threadMarkdownLines(thread);
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thread-${thread.threadId.slice(0, 20)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSelectedThreads() {
    const selected = selectedExportableThreads();
    if (selected.length === 0) return;
    if (selected.length === 1) {
      exportThread(selected[0]);
      return;
    }
    const bundle = selected
      .map((thread) => threadMarkdownLines(thread).join("\n"))
      .join("\n\n---\n\n");
    const blob = new Blob([bundle], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `threads-bundle-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 20m — smart topic grouping
  const [groupByTopic, setGroupByTopic] = createSignal(false);
  function topicWords(msgs: AfpMessage[]): string[] {
    return threadListState.topicWords(msgs);
  }
  function dominantTopicKey(msgs: AfpMessage[]): string {
    return threadListState.dominantThreadTopicKey(msgs);
  }
function togglePreview(tid: string, e: MouseEvent) {
    e.stopPropagation();
    setPreviewThreadId(prev => prev === tid ? null : tid);
  }

  function openThreadContextMenu(event: MouseEvent, threadId: string) {
    event.preventDefault();
    event.stopPropagation();
    setThreadContextMenu({
      threadId,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 260),
    });
  }

  function closeThreadContextMenu() {
    setThreadContextMenu(null);
  }

  createEffect(() => {
    if (!threadContextMenu()) return;
    const close = () => setThreadContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  // 30i — Keyboard Nav Mode: Tab activates highlight ring, Esc exits
  const [kbNavActive, setKbNavActive] = createSignal(false);
  const [kbNavIdx, setKbNavIdx] = createSignal(0);
  const [vimNavigationEnabled, setVimNavigationEnabled] = createSignal(loadVimNavigationEnabled());

  // 30n — Hover-to-expand: expand message preview after 600ms hover
  const [hoverExpandId, setHoverExpandId] = createSignal<string | null>(null);
  const hoverExpandTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  function startHoverExpand(tid: string) {
    if (hoverExpandTimers[tid]) return;
    hoverExpandTimers[tid] = setTimeout(() => {
      setHoverExpandId(tid);
      delete hoverExpandTimers[tid];
    }, 600);
  }
  function cancelHoverExpand(tid: string) {
    if (hoverExpandTimers[tid]) { clearTimeout(hoverExpandTimers[tid]); delete hoverExpandTimers[tid]; }
    setHoverExpandId(null);
  }

  // 30c — Smart Compose Autocomplete: hint based on recent words
  const [autocompleteHint, setAutocompleteHint] = createSignal("");
  const COMPOSE_PHRASES = [
    "sounds good", "let me check", "will follow up", "got it", "thanks for the update",
    "can you clarify", "I agree", "let's schedule a call", "noted", "on it",
  ];
  function updateAutocomplete(text: string) {
    if (!text.trim()) { setAutocompleteHint(""); return; }
    const lower = text.toLowerCase();
    const match = COMPOSE_PHRASES.find(p => p.startsWith(lower.split(" ").slice(-2).join(" ")) && p !== lower.trim());
    setAutocompleteHint(match ? match.slice(lower.split(" ").slice(-2).join(" ").length) : "");
  }

  // 29a — Magic Pointer action handler for thread items
  onMount(() => {
    const unsubscribeVimNavigationPreference = subscribeVimNavigationPreference((enabled) => {
      setVimNavigationEnabled(enabled);
    });
    onCleanup(() => unsubscribeVimNavigationPreference());

    const unsubscribeMagicActionEvent = subscribeMagicActionEvent(({ action, msgId }) => {
      if (!msgId) return;
      if (action === 'open') { markRead(msgId); props.onOpenThread(msgId); }
      if (action === 'star') toggleStar(msgId);
    });
    onCleanup(() => unsubscribeMagicActionEvent());

    // 30i — Keyboard Nav Mode handler
    function handleKbNav(e: KeyboardEvent) {
      if (targetIsTypingSurface(e.target)) return;
      const activeElement = document.activeElement;
      const threadListFocused = Boolean(
        threadsRootRef
        && activeElement
        && (activeElement === threadsRootRef || threadsRootRef.contains(activeElement))
      );
      if (threadListFocused && e.key.toLowerCase() === "a" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        selectAllVisibleThreads();
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
        if (filter() === "all" && !threadSearch().trim()) return;
        e.preventDefault();
        recordShortcutUse("filter_reset");
        clearThreadFilters();
        return;
      }
      if ((e.key === "j" || e.key === "k") && vimNavigationEnabled() && threadListFocused) {
        e.preventDefault();
        const visible = threads();
        if (visible.length === 0) return;
        setKbNavActive(true);
        setKbNavIdx((prev) => {
          if (!kbNavActive()) return e.key === "k" ? visible.length - 1 : 0;
          return e.key === "j"
            ? Math.min(prev + 1, visible.length - 1)
            : Math.max(prev - 1, 0);
        });
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (!kbNavActive()) { setKbNavActive(true); setKbNavIdx(0); return; }
        setKbNavIdx(prev => prev + (e.shiftKey ? -1 : 1));
      }
      if (e.key === "Escape") setKbNavActive(false);
      if (kbNavActive()) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const visible = threads();
          const t = visible[kbNavIdx()];
          if (t) { markRead(t.threadId); props.onOpenThread(t.threadId); }
        }
      }
    }
    document.addEventListener('keydown', handleKbNav);
    onCleanup(() => document.removeEventListener('keydown', handleKbNav));
  });

  const queryHistory = createMemo((): Array<{ query: string; timestamp: string; result?: string }> => {
    return loadThreadQueryHistory(sessionUserId);
  });

  const parsedThreadSearch = createMemo(() => parseThreadSearchInput(threadSearch()));

  createEffect(() => {
    const injected = props.initialSearchQuery?.trim();
    if (!injected || injected === threadSearch().trim()) return;
    setThreadSearch(injected);
  });

  createEffect(() => {
    const parsed = parsedThreadSearch();
    if (!isThreadSummariesSearchActive(parsed)) {
      setRemoteThreadResponse(null);
      setRemoteThreadSearchError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setRemoteThreadSearchError(null);
      void fetchThreadSummaries(buildThreadSummariesSearchRequest(parsed, 40))
        .then((response) => {
          setRemoteThreadResponse(response);
          setRemoteThreadSearchError(null);
        })
        .catch((error: unknown) => {
          setRemoteThreadSearchError(
            buildThreadSearchFailureReceipt(
              "Load remote thread search",
              error instanceof Error ? error.message : "Could not load thread search results.",
            ),
          );
        });
    }, 180);
    onCleanup(() => window.clearTimeout(timer));
  });

  function retryRemoteThreadSearch() {
    const parsed = parsedThreadSearch();
    if (!isThreadSummariesSearchActive(parsed)) return;
    setRemoteThreadSearchError(null);
    void fetchThreadSummaries(buildThreadSummariesSearchRequest(parsed, 40))
      .then((response) => {
        setRemoteThreadResponse(response);
      })
      .catch((error: unknown) => {
        setRemoteThreadSearchError(
          buildThreadSearchFailureReceipt(
            "Load remote thread search",
            error instanceof Error ? error.message : "Could not load thread search results.",
          ),
        );
      });
  }

  createEffect(() => {
    const parsed = parsedThreadSearch();
    if (!isThreadSummariesSearchActive(parsed)) {
      localRouterPreview.clear();
      return;
    }
    localRouterPreview.schedule(threadSearch());
  });

  function summaryToPseudoMessage(summary: ThreadSummary): AfpMessage {
    return threadListState.summaryToPseudoMessage(summary);
  }

  // Group all messages into threads by thread_id
  const threads = createMemo(() => {
    return threadListState.buildThreadEntries(props.messages, props.threadSummaries);
  });

  createEffect(() => {
    const visibleIds = threads().map((thread) => thread.threadId);
    setSelectedForMerge((prev) => {
      const next = pruneThreadSelectionToVisible(prev, visibleIds);
      return next.size === prev.size ? prev : next;
    });
    if (selectionAnchorThreadId() && !visibleIds.includes(selectionAnchorThreadId()!)) {
      setSelectionAnchorThreadId(threads()[0]?.threadId ?? null);
    }
  });

  // 19m — thread mention detector
  const threadMentions = createMemo(() => {
    return threadListState.buildThreadMentionMap(threads());
  });

  // 15r — group notice items by sender then channel (e.g. "3 emails from Sarah", "5 messages from John on Slack")
  const [expandedSenderKeys, setExpandedSenderKeys] = createSignal<Set<string>>(new Set());
  function toggleSenderGroup(key: string) {
    setExpandedSenderKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const noticeGroupsBySender = createMemo<SenderGroup[]>(() => {
    return threadListState.buildNoticeGroupsBySender(props.messages);
  });

  // 17q — sorted threads respecting user drag order
  const filteredThreads = createMemo(() => {
    const parsed = parsedThreadSearch();
    return threadListState.filterOrderedThreads({
      threads: threads(),
      order: threadOrder(),
      query: parsed.query,
      remoteThreadResponse: remoteThreadResponse(),
      searchByServer: isThreadSummariesSearchActive(parsed),
    });
  });

  const availableThreadKinds = createMemo(() => {
    const fromSummaries = collectKindCounts((props.threadSummaries ?? []).map((summary) => summary.dominant_kind));
    if (fromSummaries.length > 0) return fromSummaries;
    return collectKindCounts(
      threads().map((thread) => thread.messages.find((message) => message.kind?.trim())?.kind),
    );
  });

  const availableThreadSupertags = createMemo(() => {
    return threadListState.availableThreadSupertagCounts(threads());
  });

  function toggleThreadKindLens(kind: string) {
    const parsed = parsedThreadSearch();
    setThreadSearch(
      buildThreadSearchInput({
        query: parsed.query,
        tags: parsed.tags,
        metadataTerms: parsed.metadataTerms,
        kind: parsed.kind === kind ? undefined : kind,
        threadIds: parsed.threadIds,
        fromAgents: parsed.fromAgents,
        timeRange: parsed.timeRange,
      }),
    );
  }

  function toggleThreadTagLens(tag: string) {
    const parsed = parsedThreadSearch();
    const normalizedTag = tag.trim().toLowerCase();
    const nextTags = parsed.tags.includes(normalizedTag)
      ? parsed.tags.filter((entry) => entry !== normalizedTag)
      : [...parsed.tags, normalizedTag];
    setThreadSearch(
      buildThreadSearchInput({
        query: parsed.query,
        tags: nextTags,
        metadataTerms: parsed.metadataTerms,
        kind: parsed.kind,
        threadIds: parsed.threadIds,
        fromAgents: parsed.fromAgents,
        timeRange: parsed.timeRange,
      }),
    );
  }

  function clearThreadFilters() {
    setFilter("all");
    setThreadSearch("");
  }

  // 18m + 19m — sort: pinned > mentions > starred > unread > normal
  const sortedThreads = createMemo(() =>
    threadListState.sortVisibleThreads({
      threads: filteredThreads(),
      pinnedThreads: pinnedThreads(),
      mentionedThreads: threadMentions(),
      starredThreads: starredThreads(),
      unreadCount,
      sortMode: sortMode(),
    })
  );

  // 19l — filter archived/active threads
  const filteredForArchive = createMemo(() =>
    threadListState.filterArchivedThreads(sortedThreads(), archivedThreads(), showArchived())
  );

  // 27c — detect pairs of threads with ≥2 overlapping topic words (soft merge suggestion)
  const mergeablePairs = createMemo(() => {
    return threadListState.buildMergeableThreadPairs(
      filteredForArchive(),
      dismissedMergePairs(),
      threadTitles(),
    );
  });

  // 22g — priority-sorted flat thread list (high > medium > low > none)
  const prioritySortedThreads = createMemo(() => {
    return threadListState.prioritySortedThreads(filteredForArchive(), threadPriority());
  });

  // 24f — flat list with day-boundary dividers
  type FlatListItem = threadListState.FlatListItem;
  const flatItemsWithDividers = createMemo<FlatListItem[]>(() => {
    return threadListState.buildFlatItemsWithDividers(prioritySortedThreads());
  });

  // 20m — group filtered threads by canonical supertag topic when available,
  // falling back to heuristic content words for legacy messages.
  const topicGroups = createMemo((): Map<string, threadListState.ThreadListEntry[]> | null => {
    if (!groupByTopic()) return null;
    return threadListState.buildTopicGroups(filteredForArchive());
  });

  // P5.4 — group proactive suggestions by entity_id for the Suggestions tab
  type SuggestionGroup = threadListState.SuggestionGroup;

  const suggestionGroups = createMemo<SuggestionGroup[]>(() => {
    const proactiveMsgs = props.messages.filter(m => m.type === "proactive_suggestion");
    const map = new Map<string, SuggestionGroup>();
    for (const msg of proactiveMsgs) {
      const c = afpRecord(msg.content);
      const entityId = threadListScalarString(c.entity_id, "general");
      const urgency = threadListScalarString(c.urgency, "medium");
      const label = entityId === "general"
        ? "Agent suggestions"
        : `Agent suggestions — ${entityId}`;
      if (!map.has(entityId)) {
        map.set(entityId, { entityId, label, msgs: [], urgency });
      }
      map.get(entityId)!.msgs.push(msg);
    }
    return [...map.values()].sort((a, b) => {
      const order = ["high", "medium", "low"];
      return order.indexOf(a.urgency) - order.indexOf(b.urgency);
    });
  });

  const proactiveTotalCount = createMemo(() =>
    threadListState.proactiveSuggestionCount(props.messages)
  );

  const filterTabs: Array<{ id: ThreadFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "search", label: "Search" },
    { id: "notice", label: "Notice" },
    { id: "suggestions", label: `Suggestions${proactiveTotalCount() > 0 ? ` (${proactiveTotalCount()})` : ""}` },
  ];

  return (
    <div ref={threadsRootRef} tabIndex={0} class="space-y-4 outline-none">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Threads</p>
          <h2 class="mt-1 text-xl font-semibold text-on-surface">Conversations</h2>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <div class="flex items-center gap-1 rounded-full border border-white/35 bg-white/35 px-1.5 py-1">
            <span class="px-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-outline/70">Sort</span>
            <For each={([
              { id: "activity", label: "Latest", title: "Sort by latest message arrival" },
              { id: "recently_edited", label: "Edited", title: "Sort by newest edit or update across the thread" },
            ] as const)}>
              {(option) => (
                <button
                  type="button"
                  onClick={() => setThreadSortMode(option.id)}
                  class={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    sortMode() === option.id
                      ? "bg-white text-on-surface shadow-sm"
                      : "text-on-surface-variant/70 hover:bg-white/45"
                  }`}
                  aria-pressed={sortMode() === option.id}
                  title={option.title}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>
          <QueueDensityToggle density={density()} onSelect={setDensityMode} tone="indigo" />
          {/* Filter tabs */}
          <nav class="flex items-center gap-1 rounded-full border border-white/35 bg-white/35 px-2 py-1.5">
            <For each={filterTabs}>
              {(tab) => (
                <button
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  class={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    filter() === tab.id
                      ? "bg-primary text-white"
                      : "text-on-surface-variant hover:bg-white/50"
                  }`}
                >
                  {tab.label}
                </button>
              )}
            </For>
          </nav>
        </div>
      </div>

      {/* ── All threads ─────────────────────────────────────────────────────── */}
      <Show when={filter() === "all"}>
        {/* 16g — thread search input */}
        <div class="flex items-center gap-2 rounded-2xl border border-white/40 bg-white/30 px-4 py-2 backdrop-blur">
          <span class="text-on-surface-variant/40 text-sm select-none">🔍</span>
          <input
            type="search"
            value={threadSearch()}
            onInput={e => setThreadSearch(e.currentTarget.value)}
            placeholder="Search threads, #tags, kind:task, from:agent, after:2026-06-01…"
            class="min-w-0 flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40"
            aria-label="Search conversations"
            ref={threadSearchInputRef}
          />
          <Show when={threadSearch()}>
            <button type="button" class="text-[10px] text-on-surface-variant/50 hover:text-on-surface-variant" onClick={() => setThreadSearch("")} aria-label="Clear search">✕</button>
          </Show>
        </div>
        <Show when={availableThreadKinds().length > 0}>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <span class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline">
              kind lens
            </span>
            <For each={availableThreadKinds()}>
              {(entry) => (
                <button
                  type="button"
                  onClick={() => toggleThreadKindLens(entry.kind)}
                  class={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] transition ${
                    parsedThreadSearch().kind === entry.kind
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-white/20 bg-white/10 text-on-surface-variant/55 hover:bg-white/20"
                  }`}
                  title={`Filter threads by ${objectKindLabel(entry.kind)}`}
                >
                  {objectKindLabel(entry.kind)}
                  <span class="ml-[0.3em] tabular-nums opacity-60">({entry.count})</span>
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={availableThreadSupertags().length > 0}>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <span class="font-mono text-[9px] uppercase tracking-[0.16em] text-outline">
              topic lens
            </span>
            <For each={availableThreadSupertags()}>
              {(entry) => (
                <button
                  type="button"
                  onClick={() => toggleThreadTagLens(entry.tag)}
                  class={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] transition ${
                    parsedThreadSearch().tags.includes(entry.tag)
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-white/25 bg-white/15 text-on-surface-variant/55 hover:bg-white/30"
                  }`}
                  title={`Filter threads tagged #${entry.tag}`}
                >
                  #{entry.tag}
                  <span class="ml-[0.3em] tabular-nums opacity-60">({entry.count})</span>
                </button>
              )}
            </For>
            <Show when={parsedThreadSearch().tags.length > 0}>
              <button
                type="button"
                onClick={() =>
                  setThreadSearch(
                    buildThreadSearchInput({
                      query: parsedThreadSearch().query,
                      tags: [],
                      metadataTerms: parsedThreadSearch().metadataTerms,
                      kind: parsedThreadSearch().kind,
                      threadIds: parsedThreadSearch().threadIds,
                      fromAgents: parsedThreadSearch().fromAgents,
                      timeRange: parsedThreadSearch().timeRange,
                    }),
                  )
                }
                class="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[9px] text-on-surface-variant/40 transition hover:text-on-surface-variant"
              >
                clear topic x
              </button>
            </Show>
          </div>
        </Show>
        {/* 13f — inline thread composer */}
        <Show
          when={
            (parsedThreadSearch().query.length >= 2
              || parsedThreadSearch().tags.length > 0
              || !!parsedThreadSearch().kind
              || parsedThreadSearch().threadIds.length > 0
              || parsedThreadSearch().fromAgents.length > 0
              || !!parsedThreadSearch().timeRange?.from
              || !!parsedThreadSearch().timeRange?.to)
            && threadSummariesRetrievalState(remoteThreadResponse())
          }
        >
          <ThreadDiscoveryStateSummary
            class="mt-2 rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 shadow-card backdrop-blur"
            state={threadSummariesRetrievalState(remoteThreadResponse())}
            launchContext={props.initialSearchLaunchContext}
            query={parsedThreadSearch().query}
            localRouterResult={localRouterPreview.result()}
            localRouterCapabilities={localRouterPreview.capabilities()}
            onRefreshLocalPreview={() => localRouterPreview.load(threadSearch())}
          />
        </Show>
        <Show
          when={
            (parsedThreadSearch().query.length >= 2
              || parsedThreadSearch().tags.length > 0
              || !!parsedThreadSearch().kind
              || parsedThreadSearch().threadIds.length > 0
              || parsedThreadSearch().fromAgents.length > 0
              || !!parsedThreadSearch().timeRange?.from
              || !!parsedThreadSearch().timeRange?.to)
            && remoteThreadResponse()
          }
        >
          <ThreadDiscoveryLens
            query={threadSearch()}
            result={remoteThreadResponse()}
            onSubmitQuery={(query) => setThreadSearch(query)}
          />
        </Show>
        <Show when={remoteThreadSearchError()}>
          <div
            class={`rounded-2xl border px-4 py-3 text-sm shadow-card ${
              remoteThreadSearchError()?.tone === "danger"
                ? "border-red-200/70 bg-red-50/85 text-red-700"
                : "border-amber-200/70 bg-amber-50/85 text-amber-800"
            }`}
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="space-y-1">
                <p class="font-semibold">{remoteThreadSearchError()?.title}</p>
                <p>{remoteThreadSearchError()?.summary}</p>
                <p class="text-xs opacity-80">Next step: {remoteThreadSearchError()?.nextStep}</p>
              </div>
              <button
                type="button"
                onClick={retryRemoteThreadSearch}
                class={`rounded-xl border bg-white/80 px-3 py-1.5 text-xs font-medium transition hover:bg-white ${
                  remoteThreadSearchError()?.tone === "danger"
                    ? "border-red-200/70 text-red-700"
                    : "border-amber-200/70 text-amber-800"
                }`}
              >
                Retry search
              </button>
            </div>
          </div>
        </Show>
        <Show when={threadActionError()}>
          <div
            class={`rounded-2xl border px-4 py-3 text-sm shadow-card ${
              threadActionError()?.tone === "danger"
                ? "border-red-200/70 bg-red-50/85 text-red-700"
                : "border-amber-200/70 bg-amber-50/85 text-amber-800"
            }`}
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="space-y-1">
                <p class="font-semibold">{threadActionError()?.title}</p>
                <p>{threadActionError()?.summary}</p>
                <p class="text-xs opacity-80">Next step: {threadActionError()?.nextStep}</p>
              </div>
              <button
                type="button"
                onClick={() => setThreadActionError(null)}
                class={`rounded-xl border bg-white/80 px-3 py-1.5 text-xs font-medium transition hover:bg-white ${
                  threadActionError()?.tone === "danger"
                    ? "border-red-200/70 text-red-700"
                    : "border-amber-200/70 text-amber-800"
                }`}
              >
                Dismiss
              </button>
            </div>
          </div>
        </Show>
        <div class="flex items-center gap-2 rounded-2xl border border-white/40 bg-white/30 px-4 py-2.5 backdrop-blur">
          <span class="text-on-surface-variant/40 text-lg select-none">+</span>
          <input
            type="text"
            placeholder="Start a new conversation…"
            class="min-w-0 flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = e.currentTarget.value.trim();
                if (val) {
                  const tid = `thread_new_${Date.now()}`;
                  props.onOpenThread(tid);
                  e.currentTarget.value = "";
                }
              }
            }}
          />
        </div>

        {/* 19l — archive toggle / 20m — group by topic toggle */}
        <div class="flex items-center justify-end gap-3 mb-1">
          <button type="button"
            onClick={() => setGroupByTopic(v => !v)}
            class={`text-[10px] transition rounded-full px-2 py-0.5 ${groupByTopic() ? "bg-primary/15 text-primary font-semibold" : "text-on-surface-variant/50 hover:text-on-surface-variant"}`}>
            {groupByTopic() ? "✓ Grouped by topic" : "Group by topic"}
          </button>
          <button type="button"
            onClick={() => setShowArchived(v => !v)}
            class="text-[10px] text-on-surface-variant/50 hover:text-on-surface-variant transition">
            {showArchived() ? "← Active threads" : `Show archived (${archivedThreads().size})`}
          </button>
        </div>

        {/* 20l / 29a — thread multi-select status */}
        <Show when={selectedForMerge().size > 0}>
          <div class="flex items-center justify-between rounded-2xl border border-primary/25 bg-primary/8 px-4 py-2 backdrop-blur">
            <div class="min-w-0">
              <p class="text-[11px] font-medium text-primary">{selectedForMerge().size} threads selected</p>
              <p class="font-mono text-[9px] uppercase tracking-[0.14em] text-primary/55">Shift+click for range. Ctrl+A selects visible.</p>
            </div>
            <button
              type="button"
              onClick={clearSelectedThreads}
              class="rounded-full border border-white/45 bg-white/80 px-3 py-1 text-[10px] font-semibold text-on-surface transition hover:bg-white"
            >
              Clear
            </button>
          </div>
        </Show>

        {/* 27c — soft merge suggestion: surfaces when two threads share ≥2 meaningful words */}
        <Show when={mergeablePairs().length > 0 && filter() === 'all'}>
          {(() => {
            const pair = mergeablePairs()[0];
            if (!pair) return null;
            return (
              <div class='flex items-center justify-between gap-3 rounded-2xl border border-sky-200/50 bg-sky-50/40 px-4 py-2 text-[11px] backdrop-blur'>
                <span class='text-sky-800'>These threads look related — <span class='font-medium'>merge them?</span></span>
                <div class='flex items-center gap-2 flex-shrink-0'>
                  <button type='button'
                    onClick={() => setSelectedForMerge(new Set([pair.idA, pair.idB]))}
                    class='rounded-full bg-sky-600 px-3 py-1 text-[10px] font-semibold text-white transition hover:bg-sky-700'>
                    Merge
                  </button>
                  <button type='button'
                    onClick={() => {
                      setDismissedMergePairs(prev => {
                        const next = new Set(prev); next.add(pair.pairKey);
                        return saveDismissedMergePairs(next);
                      });
                    }}
                    class='text-[10px] text-sky-700/60 hover:text-sky-800 transition'>
                    Not related
                  </button>
                </div>
              </div>
            );
          })()}
        </Show>

        {/* 28e — recent threads jump bar: 3 most recently active threads as chip shortcuts */}
        {(() => {
          const all = filteredForArchive();
          if (all.length <= 4) return null;
          const recent = [...all]
            .sort((a, b) => {
              const ta = a.messages[a.messages.length - 1]?.timestamp ?? '';
              const tb = b.messages[b.messages.length - 1]?.timestamp ?? '';
              return tb.localeCompare(ta);
            })
            .slice(0, 3);
          return (
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="font-mono text-[8px] uppercase tracking-[0.14em] text-on-surface-variant/40 flex-shrink-0">Recent:</span>
              {recent.map(t => {
                const title = threadTitles()[t.threadId] ?? threadTitle(t.threadId, t.messages);
                return (
                  <button
                    type="button"
                    onClick={() => { markRead(t.threadId); props.onOpenThread(t.threadId); }}
                    class="rounded-full border border-white/30 bg-white/30 px-3 py-1 text-[10px] text-on-surface-variant transition hover:bg-white/50 hover:text-on-surface max-w-[140px] truncate"
                    title={title}
                  >
                    {title}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Cross-domain drop zone — visible while dragging a thread card */}
        <Show when={crossDragThread()} keyed>
          {(tid) => {
            const t = threads().find(th => th.threadId === tid);
            async function handleNoteDrop() {
              setNoteDropZone("over");
              try {
                const lastContent = t?.lastMessage ? afpRecord(t.lastMessage.content) : {};
                const title = t?.lastMessage
                  ? String(lastContent.subject ?? lastContent.title ?? tid)
                  : tid;
                const summary = t?.lastMessage
                  ? String(lastContent.summary ?? lastContent.text ?? "").slice(0, 300)
                  : "";
                await createNoteFromThread({ threadId: tid, title, summary, sourceMessageId: t?.lastMessage?.id });
                setNoteDropZone("success");
                setNoteDropStatus("Note created");
                setTimeout(() => { setCrossDragThread(null); setNoteDropZone("none"); }, 2000);
              } catch {
                setNoteDropZone("error");
                setNoteDropStatus("Failed to create note");
                setTimeout(() => setNoteDropZone("none"), 2000);
              }
            }
            const zoneClass = () => {
              const z = noteDropZone();
              if (z === "over") return "border-primary bg-primary/15 scale-[1.01]";
              if (z === "success") return "border-green-500 bg-green-500/10";
              if (z === "error") return "border-red-400 bg-red-400/10";
              return "border-primary/40 bg-primary/5 hover:bg-primary/10";
            };
            return (
              <div
                class={`flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-3 transition-all ${zoneClass()}`}
                onDragOver={(e) => { e.preventDefault(); setNoteDropZone("over"); }}
                onDragLeave={() => { if (noteDropZone() === "over") setNoteDropZone("none"); }}
                onDrop={(e) => { e.preventDefault(); void handleNoteDrop(); }}
              >
                <Show when={noteDropZone() === "success"}>
                  <span class="text-green-500 text-sm">✓ {noteDropStatus()}</span>
                </Show>
                <Show when={noteDropZone() === "error"}>
                  <span class="text-red-400 text-sm">✗ {noteDropStatus()}</span>
                </Show>
                <Show when={noteDropZone() !== "success" && noteDropZone() !== "error"}>
                  <span class="text-lg">📝</span>
                  <span class="text-sm font-medium text-primary/80">
                    {noteDropZone() === "over" ? "Release to create note…" : "Drop here to clip as Note"}
                  </span>
                </Show>
              </div>
            );
          }}
        </Show>

        {/* 20m — grouped or flat thread list */}

        <Show when={!groupByTopic()} fallback={
          <div class="space-y-4">
            <For each={[...(topicGroups()?.entries() ?? [])]}>
              {([topic, threads]) => (
                <div>
                  <p class="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-on-surface-variant/50 px-1"># {topic} ({threads.length})</p>
                  <div class="space-y-2">
                    <For each={threads}>
                      {(thread) => {
                        const title = () => threadTitle(thread.threadId, thread.messages);
                        const unread = () => unreadCount(thread.threadId, thread.messages);
                        const firstSender = () => deriveSender(thread.messages[0] ?? ({} as AfpMessage));
                        const isDragOver = () => dragOver() === thread.threadId;
                        return (
                        <div
                          class={`group relative overflow-hidden rounded-2xl border backdrop-blur transition ${isDragOver() ? "border-primary/50 bg-primary/10" : "border-white/40 bg-white/35 hover:bg-white/45"}`}
                          data-magic-action="open"
                          data-magic-label="💬 Open thread"
                          data-magic-icon="💬"
                          data-magic-alt-action="star"
                          data-magic-alt-label="⭐ Star thread"
                          data-magic-alt-icon="⭐"
                          data-magic-id={thread.threadId}
                          draggable="true"
                          onDragStart={(e) => { setDragSrc(thread.threadId); setCrossDragThread(thread.threadId); setNoteDropZone("none"); e.dataTransfer?.setData("text/x-afp-thread-id", thread.threadId); }}
                          onDragOver={e => { e.preventDefault(); setDragOver(thread.threadId); }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={e => { e.preventDefault(); const src = dragSrc(); if (src && src !== thread.threadId) reorderThreads(src, thread.threadId); setDragSrc(null); setDragOver(null); }}
                          onDragEnd={() => { setDragSrc(null); setDragOver(null); setCrossDragThread(null); setNoteDropZone("none"); }}
                          onTouchStart={e => setSwipeTouchX(prev => ({ ...prev, [thread.threadId]: e.touches[0].clientX }))}
                          onTouchEnd={e => {
                            const startX = swipeTouchX()[thread.threadId];
                            if (startX !== undefined && startX - e.changedTouches[0].clientX > 48) {
                              setSwipeRevealed(prev => prev === thread.threadId ? null : thread.threadId);
                            }
                            setSwipeTouchX(prev => { const n = { ...prev }; delete n[thread.threadId]; return n; });
                          }}
                        >
                          {/* Pin indicator strip (grouped view) */}
                          <Show when={pinnedThreads().has(thread.threadId)}>
                            <div class="flex items-center gap-1.5 border-b border-primary/15 bg-primary/5 px-4 py-0.5">
                              <span class="text-[10px] text-primary/50">📌</span>
                              <span class="font-mono text-[8px] uppercase tracking-[0.14em] text-primary/45">Pinned</span>
                            </div>
                          </Show>
                          {/* 23e — pinned context strip (grouped view) */}
                          {(() => {
                            const firstMsg = thread.messages[0];
                            if (!firstMsg || thread.messages.length < 2) return null;
                            const fc = afpRecord(firstMsg.content);
                            const intent = threadListFirstString(fc, ["intent", "query", "subject"]).slice(0, 72);
                            if (!intent) return null;
                            return (
                              <div class="border-b border-white/15 bg-white/10 px-4 py-1">
                                <p class="truncate font-mono text-[8px] uppercase tracking-[0.14em] text-on-surface-variant/40">{intent}</p>
                              </div>
                            );
                          })()}
                          {/* 24g — last active context (grouped view) */}
                          {(() => {
                            const lr = lastRead()[thread.threadId];
                            const unreadN = unreadCount(thread.threadId, thread.messages);
                            if (!lr || unreadN === 0) return null;
                            const ms = Date.now() - new Date(lr).getTime();
                            const ago = ms < 60000 ? "just now" : ms < 3600000 ? `${Math.floor(ms / 60000)}m ago` : ms < 86400000 ? `${Math.floor(ms / 3600000)}h ago` : `${Math.floor(ms / 86400000)}d ago`;
                            return (
                              <div class="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-1">
                                <span class="font-mono text-[8px] text-on-surface-variant/40">Last here {ago}</span>
                                <span class="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[8px] font-medium text-primary">{unreadN} new</span>
                              </div>
                            );
                          })()}
                          <Show when={swipeRevealed() === thread.threadId}>
                            <div class="absolute inset-y-0 right-0 flex items-center">
                              <button type="button" class="h-full rounded-r-2xl bg-rose-400 px-5 text-sm font-medium text-white transition hover:bg-rose-500" onClick={() => setSwipeRevealed(null)}>Archive</button>
                            </div>
                          </Show>
                          <div class={`flex items-center gap-3 px-4 pt-3 transition-transform ${swipeRevealed() === thread.threadId ? "-translate-x-20" : ""}`}>
                            {/* 20l — merge checkbox */}
                            <input
                              type="checkbox"
                              checked={selectedForMerge().has(thread.threadId)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setThreadSelection(thread.threadId, !selectedForMerge().has(thread.threadId), { shiftKey: e.shiftKey });
                              }}
                              class="flex-shrink-0 rounded border border-white/40 bg-white/30 accent-primary"
                            />
                            <div
                              class={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold text-white select-none ${unread() > 0 ? "thread-unread-ring" : ""}`}
                              style={{ "background-color": senderColor(firstSender()), "--ring-speed": unread() > 3 ? "0.9s" : "1.6s" }}
                              aria-hidden="true"
                            >
                              {senderInitials(firstSender())}
                            </div>
                            <span class="flex-shrink-0 cursor-grab text-on-surface-variant/30 select-none text-sm" aria-label="Drag to reorder">⠿</span>
                            <button
                              type="button"
                              class="min-w-0 flex-1 text-left"
                              onClick={(event) => handleThreadPrimaryClick(event, thread.threadId)}
                            >
                              <div class="flex items-start justify-between gap-3">
                                <Show when={editingTitleId() === thread.threadId} fallback={
                                  <span
                                    class={`flex-1 truncate pr-2 text-[15px] leading-[1.2] tracking-[-0.01em] ${
                                      isThreadUnread(thread.threadId, thread.messages)
                                        ? "font-semibold text-on-surface"
                                        : "font-medium text-on-surface/80"
                                    }`}
                                    title="Double-click to rename"
                                    onDblClick={(e) => { e.stopPropagation(); setEditingTitleId(thread.threadId); setTitleDraft(threadTitles()[thread.threadId] ?? title()); }}
                                    innerHTML={highlightMatch(threadTitles()[thread.threadId] ?? title(), threadSearch())}
                                  />
                                }>
                                  <input
                                    type="text"
                                    value={titleDraft()}
                                    onInput={e => setTitleDraft(e.currentTarget.value)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") {
                                        recordShortcutUse("form_submit");
                                        const next = { ...threadTitles(), [thread.threadId]: titleDraft().trim() || title() };
                                        setThreadTitles(saveThreadTitles(next, sessionUserId));
                                        setEditingTitleId(null);
                                      }
                                      if (e.key === "Escape") {
                                        recordShortcutUse("form_cancel");
                                        setEditingTitleId(null);
                                      }
                                    }}
                                    onBlur={() => setEditingTitleId(null)}
                                    class="flex-1 rounded border border-primary/30 bg-white/50 px-1.5 py-0.5 text-sm text-on-surface outline-none"
                                    onClick={e => e.stopPropagation()}
                                    autofocus
                                  />
                                </Show>
                                <div class="flex flex-shrink-0 items-center gap-1">
                                  <Show when={threadMentions().get(thread.threadId)}>
                                    <span class="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-primary" title="You were mentioned">@</span>
                                  </Show>
                                  <Show when={unread() > 0}>
                                    <span class="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[9px] font-bold text-white shadow-sm">{unread()}</span>
                                  </Show>
                                  <span class="rounded-full border border-white/30 bg-white/45 px-1.5 py-0.5 font-mono text-[9px] text-on-surface-variant/75">
                                    {thread.messages.length} msg{thread.messages.length !== 1 ? "s" : ""}
                                  </span>
                                </div>
                              </div>
                              <Show when={thread.lastMessage} keyed>
                                {(msg) => {
                                  const preview = threadMessagePreview(msg);
                                  const bullets = threadMessagePreviewBullets(preview);
                                  const meta = threadPreviewMeta(msg);
                                  return (
                                    <div class="mt-2 rounded-2xl border border-white/25 bg-white/50 px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                                      <div class="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-on-surface-variant/50">
                                        <span class="max-w-[11rem] truncate font-semibold text-on-surface-variant/70">
                                          {firstSender()}
                                        </span>
                                        <span class="text-on-surface-variant/20">•</span>
                                        <span class="font-mono uppercase tracking-[0.12em] text-on-surface-variant/45">
                                          {meta.intentLabelText}
                                        </span>
                                        <span class="text-on-surface-variant/20">•</span>
                                        <span title={meta.absoluteTimestampText}>
                                          {meta.relativeTimestampText}
                                        </span>
                                      </div>
                                      <Show when={expandedSummaryId() !== thread.threadId}>
                                        <p class="line-clamp-2 text-[12.5px] leading-5 text-on-surface-variant/80">{preview}</p>
                                      </Show>
                                      <Show when={expandedSummaryId() === thread.threadId}>
                                        <ul class="space-y-0.5">
                                          <For each={bullets.length > 1 ? bullets : [preview]}>
                                            {(b) => (
                                              <li class="flex gap-1.5 text-xs leading-relaxed text-on-surface-variant/80">
                                                <span class="mt-px shrink-0 text-primary/50">•</span>
                                                <span>{b}</span>
                                              </li>
                                            )}
                                          </For>
                                        </ul>
                                      </Show>
                                      <Show when={bullets.length > 1}>
                                        <button
                                          type="button"
                                          class={`mt-1 font-mono text-[9px] uppercase tracking-[0.12em] transition hover:opacity-100 ${expandedSummaryId() === thread.threadId ? "text-primary/60" : "text-on-surface-variant/35 group-hover:text-on-surface-variant/55"}`}
                                          onClick={(e) => { e.stopPropagation(); setExpandedSummaryId(v => v === thread.threadId ? null : thread.threadId); }}
                                        >
                                          {expandedSummaryId() === thread.threadId ? "Less" : "More"}
                                        </button>
                                      </Show>
                                    </div>
                                  );
                                }}
                              </Show>
                              <div class="pb-3" />
                            </button>
                            <Show when={unread() > 0}>
                              <span class="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" title="New messages" />
                            </Show>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleStar(thread.threadId); }}
                              class={`flex-shrink-0 text-sm transition ${starredThreads().has(thread.threadId) ? "text-amber-400" : "text-transparent group-hover:text-on-surface-variant/40"}`}
                              title="Star thread"
                            >
                              {starredThreads().has(thread.threadId) ? "⭐" : "☆"}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); togglePin(thread.threadId); }}
                              class={`flex-shrink-0 text-[11px] transition ${pinnedThreads().has(thread.threadId) ? "opacity-100" : "text-transparent group-hover:opacity-40 hover:opacity-80"}`}
                              title={pinnedThreads().has(thread.threadId) ? "Unpin thread" : "Pin to top"}
                            >
                              📌
                            </button>
                            <Show when={!archivedThreads().has(thread.threadId)}>
                              <button type="button"
                                title="Archive thread"
                                onClick={(e) => { e.stopPropagation(); archiveThread(thread.threadId); }}
                                class="flex-shrink-0 text-[10px] text-transparent group-hover:text-on-surface-variant/40 hover:text-rose-500 transition"
                                aria-label="Archive">
                                ⊗
                              </button>
                            </Show>
                            <Show when={archivedThreads().has(thread.threadId)}>
                              <button type="button"
                                title="Restore thread"
                                onClick={(e) => { e.stopPropagation(); unarchiveThread(thread.threadId); }}
                                class="flex-shrink-0 text-[10px] text-on-surface-variant/60 hover:text-emerald-600 transition">
                                ↩
                              </button>
                            </Show>
                            <button
                              type="button"
                              title={previewThreadId() === thread.threadId ? "Collapse preview" : "Preview messages"}
                              class="flex-shrink-0 self-start mt-1 rounded-lg px-2 py-1 text-[10px] text-on-surface-variant/50 transition hover:bg-white/40 hover:text-on-surface-variant"
                              onClick={(e) => togglePreview(thread.threadId, e)}
                            >
                              {previewThreadId() === thread.threadId ? "▲" : "▼"}
                            </button>
                          </div>
                          <Show when={previewThreadId() === thread.threadId}>
                            <div class="border-t border-white/20 px-4 py-3 space-y-1.5 max-h-40 overflow-y-auto">
                              <For each={thread.messages.slice(-3)}>
                                {(msg) => {
                                  const c = afpRecord(msg.content);
                                  const text = (c?.summary ?? c?.text ?? c?.body ?? msg.type) as string;
                                  const meta = threadPreviewMeta(msg);
                                  return (
                                    <div class="rounded-lg bg-white/20 px-3 py-2">
                                      <p class="truncate text-xs text-on-surface">{String(text).slice(0, 120)}</p>
                                      <p class="mt-0.5 font-mono text-[9px] text-on-surface-variant/50">{msg.type} · {meta.relativeTimestampText}</p>
                                    </div>
                                  );
                                }}
                              </For>
                              <button
                                type="button"
                                class="w-full rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
                                onClick={() => props.onOpenThread(thread.threadId)}
                              >
                                Open conversation →
                              </button>
                            </div>
                          </Show>
                        </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        }>
        <div class="space-y-2">
          <For
            each={flatItemsWithDividers()}
            fallback={
              <Show
                when={!remoteThreadSearchError()}
                fallback={
                  <EmptyState
                    icon="TS"
                    title={remoteThreadSearchError()?.title ?? "Could not load remote thread search"}
                    body={`${remoteThreadSearchError()?.summary ?? "Remote thread search is unavailable right now."} ${remoteThreadSearchError()?.nextStep ?? ""}`.trim()}
                    action={
                      <button
                        type="button"
                        onClick={retryRemoteThreadSearch}
                        class="rounded-xl border border-amber-200/70 bg-white/80 px-3 py-1.5 text-sm font-medium text-amber-800 transition hover:bg-white"
                      >
                        Retry search
                      </button>
                    }
                  />
                }
              >
                <div class="rounded-3xl border border-white/50 bg-white/35 p-10 text-center space-y-2">
                  {/* 13e — smart empty state with context-sensitive call to action */}
                  <p class="text-2xl">💬</p>
                  <p class="text-sm font-medium text-on-surface">No conversations yet</p>
                  <div class="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <Show when={props.onRequestSearchFocus}>
                      <button
                        type="button"
                        onClick={() => props.onRequestSearchFocus?.()}
                        class="rounded-full border border-white/45 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
                      >
                        Ask your agent
                      </button>
                    </Show>
                    <button
                      type="button"
                      onClick={focusThreadSearchInput}
                      class="rounded-full border border-white/45 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
                    >
                      Search threads
                    </button>
                  </div>
                  <p class="text-xs text-on-surface-variant">Ask the agent something to start a thread — try "Summarise my emails" or "What's on my calendar today?"</p>
                </div>
              </Show>
            }
          >
            {(item) => {
              /* 24f — day boundary divider */
              if (item._kind === "divider") {
                return (
                  <div class="flex items-center gap-3 py-1">
                    <div class="h-px flex-1 bg-white/20" />
                    <span class="font-mono text-[9px] uppercase tracking-[0.16em] text-on-surface-variant/40 whitespace-nowrap">{item.label}</span>
                    <div class="h-px flex-1 bg-white/20" />
                  </div>
                );
              }
              const thread = item;
              const title = () => threadTitle(thread.threadId, thread.messages);
              const unread = () => unreadCount(thread.threadId, thread.messages);
              const firstSender = () => deriveSender(thread.messages[0] ?? ({} as AfpMessage));
              const isDragOver = () => dragOver() === thread.threadId;
              const compact = () => threadDensityIsCompact(density());
              return (
              <div
                class={`group relative overflow-hidden rounded-2xl border backdrop-blur transition ${isDragOver() ? "border-primary/50 bg-primary/10" : "border-white/40 bg-white/35 hover:bg-white/45"} ${kbNavActive() && kbNavIdx() === sortedThreads().indexOf(thread) ? "ring-2 ring-primary/60" : ""}`}
                data-magic-action="open"
                data-magic-label="💬 Open thread"
                data-magic-icon="💬"
                data-magic-alt-action="star"
                data-magic-alt-label="⭐ Star thread"
                data-magic-alt-icon="⭐"
                data-magic-id={thread.threadId}
                draggable="true"
                onMouseEnter={() => startHoverExpand(thread.threadId)}
                onMouseLeave={() => cancelHoverExpand(thread.threadId)}
                onContextMenu={(e) => openThreadContextMenu(e, thread.threadId)}
                onDragStart={(e) => { setDragSrc(thread.threadId); setCrossDragThread(thread.threadId); setNoteDropZone("none"); e.dataTransfer?.setData("text/x-afp-thread-id", thread.threadId); }}
                onDragOver={e => { e.preventDefault(); setDragOver(thread.threadId); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => { e.preventDefault(); const src = dragSrc(); if (src && src !== thread.threadId) reorderThreads(src, thread.threadId); setDragSrc(null); setDragOver(null); }}
                onDragEnd={() => { setDragSrc(null); setDragOver(null); setCrossDragThread(null); setNoteDropZone("none"); }}
                onTouchStart={e => setSwipeTouchX(prev => ({ ...prev, [thread.threadId]: e.touches[0].clientX }))}
                onTouchEnd={e => {
                  const startX = swipeTouchX()[thread.threadId];
                  if (startX !== undefined && startX - e.changedTouches[0].clientX > 48) {
                    setSwipeRevealed(prev => prev === thread.threadId ? null : thread.threadId);
                  }
                  setSwipeTouchX(prev => { const n = { ...prev }; delete n[thread.threadId]; return n; });
                }}
onPointerDown={(e) => { // 26h — long-press opens preview
                  if (e.button !== 0) return;
                  longPressStartPos[thread.threadId] = { x: e.clientX, y: e.clientY };
                  longPressTimers[thread.threadId] = setTimeout(() => {
                    setPreviewThreadId(prev => prev === thread.threadId ? null : thread.threadId);
                    delete longPressTimers[thread.threadId];
                  }, 500);
                }}
                onPointerUp={() => { if (longPressTimers[thread.threadId]) { clearTimeout(longPressTimers[thread.threadId]); delete longPressTimers[thread.threadId]; } delete longPressStartPos[thread.threadId]; }}
                onPointerLeave={() => { if (longPressTimers[thread.threadId]) { clearTimeout(longPressTimers[thread.threadId]); delete longPressTimers[thread.threadId]; } delete longPressStartPos[thread.threadId]; }}
                onPointerMove={(e) => {
                  const start = longPressStartPos[thread.threadId];
                  if (!start) return;
                  if (Math.abs(e.clientX - start.x) > 8 || Math.abs(e.clientY - start.y) > 8) {
                    if (longPressTimers[thread.threadId]) { clearTimeout(longPressTimers[thread.threadId]); delete longPressTimers[thread.threadId]; }
                  }
                }}
              >
                {/* Pin-to-top indicator strip */}
                <Show when={pinnedThreads().has(thread.threadId)}>
                  <div class="flex items-center gap-1.5 border-b border-primary/15 bg-primary/5 px-4 py-0.5">
                    <span class="text-[10px] text-primary/50">📌</span>
                    <span class="font-mono text-[8px] uppercase tracking-[0.14em] text-primary/45">Pinned</span>
                  </div>
                </Show>
                {/* 23e — pinned context strip: one-line thread purpose derived from first message intent/query */}
                {(() => {
                  const firstMsg = thread.messages[0];
                  if (!firstMsg || thread.messages.length < 2) return null;
                  const fc = afpRecord(firstMsg.content);
                  const intent = threadListFirstString(fc, ["intent", "query", "subject"]).slice(0, 72);
                  if (!intent) return null;
                  return (
                    <div class="border-b border-white/15 bg-white/10 px-4 py-1">
                      <p class="truncate font-mono text-[8px] uppercase tracking-[0.14em] text-on-surface-variant/40">{intent}</p>
                    </div>
                  );
                })()}
                {/* 24g — last active context: orient user when returning to a thread after an absence */}
                {(() => {
                  const lr = lastRead()[thread.threadId];
                  const unreadN = unread();
                  if (!lr || unreadN === 0) return null;
                  const ms = Date.now() - new Date(lr).getTime();
                  const ago = ms < 60000 ? "just now" : ms < 3600000 ? `${Math.floor(ms / 60000)}m ago` : ms < 86400000 ? `${Math.floor(ms / 3600000)}h ago` : `${Math.floor(ms / 86400000)}d ago`;
                  return (
                    <div class="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-1">
                      <span class="font-mono text-[8px] text-on-surface-variant/40">Last here {ago}</span>
                      <span class="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[8px] font-medium text-primary">{unreadN} new</span>
                    </div>
                  );
                })()}
                {/* 16h — swipe-to-archive action revealed on swipe-left */}
                <Show when={swipeRevealed() === thread.threadId}>
                  <div class="absolute inset-y-0 right-0 flex items-center">
                    <button type="button" class="h-full rounded-r-2xl bg-rose-400 px-5 text-sm font-medium text-white transition hover:bg-rose-500" onClick={() => setSwipeRevealed(null)}>Archive</button>
                  </div>
                </Show>
                <div class={`flex items-center gap-3 transition-transform ${compact() ? "px-3 pt-2.5" : "px-4 pt-3"} ${swipeRevealed() === thread.threadId ? "-translate-x-20" : ""}`}>
                  {/* 20l — merge checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedForMerge().has(thread.threadId)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setThreadSelection(thread.threadId, !selectedForMerge().has(thread.threadId), { shiftKey: e.shiftKey });
                    }}
                    class="flex-shrink-0 rounded border border-white/40 bg-white/30 accent-primary"
                  />
                  {/* 16i — sender avatar initials, 30m — unread pulse ring */}
                  <div
                    class={`flex-shrink-0 flex items-center justify-center rounded-full font-bold text-white select-none ${compact() ? "h-8 w-8 text-[10px]" : "h-9 w-9 text-[11px]"} ${unread() > 0 ? "thread-unread-ring" : ""}`}
                    style={{ "background-color": senderColor(firstSender()), "--ring-speed": unread() > 3 ? "0.9s" : "1.6s" }}
                    aria-hidden="true"
                  >
                    {senderInitials(firstSender())}
                  </div>
                  {/* 17q — drag handle */}
                  <span class="flex-shrink-0 cursor-grab text-on-surface-variant/30 select-none text-sm" aria-label="Drag to reorder">⠿</span>
                  <button
                    type="button"
                    class="min-w-0 flex-1 text-left"
                    onClick={(event) => handleThreadPrimaryClick(event, thread.threadId)}
                  >
                    <div class="flex items-start justify-between gap-3">
                      {/* 22g — priority emoji in header */}
                      <Show when={threadPriority()[thread.threadId]}>
                        <span class="flex-shrink-0 text-[11px]" title={`Priority: ${threadPriority()[thread.threadId]}`}>
                          {priorityEmoji(threadPriority()[thread.threadId])}
                        </span>
                      </Show>
                      {/* 19n — inline title edit / 15a/15o — human-readable title with 16g search highlight */}
                      <Show when={editingTitleId() === thread.threadId} fallback={
                        <span
                          class={`flex-1 truncate pr-2 leading-[1.2] tracking-[-0.01em] ${compact() ? "text-[14px]" : "text-[15px]"} ${
                            isThreadUnread(thread.threadId, thread.messages)
                              ? "font-semibold text-on-surface"
                              : "font-medium text-on-surface/80"
                          }`}
                          title="Double-click to rename"
                          onDblClick={(e) => { e.stopPropagation(); setEditingTitleId(thread.threadId); setTitleDraft(threadTitles()[thread.threadId] ?? title()); }}
                          innerHTML={highlightMatch(threadTitles()[thread.threadId] ?? title(), threadSearch())}
                        />
                      }>
                        <input
                          type="text"
                          value={titleDraft()}
                          onInput={e => setTitleDraft(e.currentTarget.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              recordShortcutUse("form_submit");
                              const next = { ...threadTitles(), [thread.threadId]: titleDraft().trim() || title() };
                              setThreadTitles(saveThreadTitles(next, sessionUserId));
                              setEditingTitleId(null);
                            }
                            if (e.key === "Escape") {
                              recordShortcutUse("form_cancel");
                              setEditingTitleId(null);
                            }
                          }}
                          onBlur={() => setEditingTitleId(null)}
                          class="flex-1 rounded border border-primary/30 bg-white/50 px-1.5 py-0.5 text-sm text-on-surface outline-none"
                          onClick={e => e.stopPropagation()}
                          autofocus
                        />
                      </Show>
                      <div class="flex flex-shrink-0 items-center gap-1">
                        {/* 19m — mention badge */}
                        <Show when={threadMentions().get(thread.threadId)}>
                          <span class="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-primary" title="You were mentioned">
                            @
                          </span>
                        </Show>
                        {/* 16f — unread count badge */}
                        <Show when={unread() > 0}>
                          <span class="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[9px] font-bold text-white shadow-sm">{unread()}</span>
                        </Show>
                        <span class="rounded-full border border-white/30 bg-white/45 px-1.5 py-0.5 font-mono text-[9px] text-on-surface-variant/75">
                          {thread.messages.length} msg{thread.messages.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <Show when={thread.lastMessage} keyed>
                      {(msg) => {
                        const preview = threadMessagePreview(msg);
                        const bullets = threadMessagePreviewBullets(preview);
                        const meta = threadPreviewMeta(msg);
                        return (
                          <div class={`rounded-2xl border border-white/25 bg-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] ${compact() ? "mt-1.5 px-3 py-2" : "mt-2 px-3.5 py-2.5"}`}>
                            <div class={`flex flex-wrap items-center gap-x-2 gap-y-1 text-on-surface-variant/45 ${compact() ? "mb-1 text-[9px]" : "mb-1.5 text-[10px]"}`}>
                              <span class="max-w-[11rem] truncate font-semibold text-on-surface-variant/70">
                                {firstSender()}
                              </span>
                              <span class="text-on-surface-variant/20">•</span>
                              <span class="font-mono uppercase tracking-[0.12em] text-on-surface-variant/45">
                                {meta.intentLabelText}
                              </span>
                              <span class="text-on-surface-variant/20">•</span>
                              <span title={meta.absoluteTimestampText}>
                                {meta.relativeTimestampText}
                              </span>
                            </div>
                            <Show when={expandedSummaryId() !== thread.threadId}>
                              <p class={`line-clamp-2 text-on-surface-variant/78 ${compact() ? "text-[12px] leading-[1.35rem]" : "text-[12.5px] leading-5"}`}>{preview}</p>
                            </Show>
                            <Show when={expandedSummaryId() === thread.threadId}>
                              <ul class="space-y-0.5">
                                <For each={bullets.length > 1 ? bullets : [preview]}>
                                  {(b) => (
                                    <li class={`flex gap-1.5 text-on-surface-variant/80 ${compact() ? "text-[11px] leading-5" : "text-xs leading-relaxed"}`}>
                                      <span class="mt-px shrink-0 text-primary/50">•</span>
                                      <span>{b}</span>
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </Show>
                            <Show when={bullets.length > 1}>
                              <button
                                type="button"
                                class={`mt-1 font-mono text-[9px] uppercase tracking-[0.12em] transition hover:opacity-100 ${expandedSummaryId() === thread.threadId ? "text-primary/60" : "text-on-surface-variant/35 group-hover:text-on-surface-variant/55"}`}
                                onClick={(e) => { e.stopPropagation(); setExpandedSummaryId(v => v === thread.threadId ? null : thread.threadId); }}
                              >
                              {expandedSummaryId() === thread.threadId ? "Less" : "More"}
                              </button>
                            </Show>
                          </div>
                        );
                      }}
                    </Show>
                    {/* 10i / 13l — relative timestamp, ISO on hover */}
                    <div class={compact() ? "pb-2" : "pb-3"} />
                  </button>
                  {/* 18n — unread dot */}
                  <Show when={unread() > 0}>
                    <span class="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" title="New messages" />
                  </Show>
                  {/* 18m — star button */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleStar(thread.threadId); }}
                    class={`flex-shrink-0 text-sm transition ${
                      starredThreads().has(thread.threadId)
                        ? "text-amber-400"
                        : "text-transparent group-hover:text-on-surface-variant/40"
                    }`}
                    title="Star thread"
                  >
                    {starredThreads().has(thread.threadId) ? "⭐" : "☆"}
                  </button>
                  {/* Pin to top button */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); togglePin(thread.threadId); }}
                    class={`flex-shrink-0 text-[11px] transition ${
                      pinnedThreads().has(thread.threadId)
                        ? "opacity-100"
                        : "text-transparent group-hover:opacity-40 hover:opacity-80"
                    }`}
                    title={pinnedThreads().has(thread.threadId) ? "Unpin thread" : "Pin to top"}
                    aria-label={pinnedThreads().has(thread.threadId) ? "Unpin" : "Pin to top"}
                  >
                    📌
                  </button>
                  {/* 19l — archive / unarchive button */}
                  <Show when={!archivedThreads().has(thread.threadId) && !lockedThreads().has(thread.threadId)}>
                    <button type="button"
                      title="Archive thread"
                      onClick={(e) => { e.stopPropagation(); archiveThread(thread.threadId); }}
                      class="flex-shrink-0 text-[10px] text-transparent group-hover:text-on-surface-variant/40 hover:text-rose-500 transition"
                      aria-label="Archive">
                      ⊗
                    </button>
                  </Show>
                  <Show when={archivedThreads().has(thread.threadId)}>
                    <button type="button"
                      title="Restore thread"
                      onClick={(e) => { e.stopPropagation(); unarchiveThread(thread.threadId); }}
                      class="flex-shrink-0 text-[10px] text-on-surface-variant/60 hover:text-emerald-600 transition">
                      ↩
                    </button>
                  </Show>
                  {/* 21e — export as Markdown */}
                  <button
                    type="button"
                    title="Export thread as Markdown"
                    onClick={(e) => { e.stopPropagation(); exportThread(thread); }}
                    class="flex-shrink-0 text-[10px] text-transparent group-hover:text-on-surface-variant/40 hover:text-primary transition"
                    aria-label="Export thread"
                  >
                    ↓
                  </button>
                  {/* 21f — lock button */}
                  <button
                    type="button"
                    title={lockedThreads().has(thread.threadId) ? "Unlock thread" : "Lock thread (prevents archive/merge)"}
                    onClick={(e) => { e.stopPropagation(); toggleLock(thread.threadId); }}
                    class={`flex-shrink-0 text-[11px] transition ${
                      lockedThreads().has(thread.threadId)
                        ? "text-amber-500"
                        : "text-transparent group-hover:text-on-surface-variant/40 hover:text-amber-500"
                    }`}
                    aria-label={lockedThreads().has(thread.threadId) ? "Unlock" : "Lock"}
                  >
                    {lockedThreads().has(thread.threadId) ? "🔒" : "🔓"}
                  </button>
                  {/* 22g — priority cycle button */}
                  <button
                    type="button"
                    title={`Priority: ${threadPriority()[thread.threadId] ?? "none"} — click to cycle`}
                    onClick={(e) => { e.stopPropagation(); cyclePriority(thread.threadId); }}
                    class={`flex-shrink-0 text-[11px] transition ${threadPriority()[thread.threadId] ? "opacity-100" : "text-transparent group-hover:opacity-40 hover:opacity-70"}`}
                    aria-label="Cycle priority"
                  >
                    {priorityEmoji(threadPriority()[thread.threadId])}
                  </button>
                  {/* 22f — reply button (hidden for archived/locked) */}
                  <Show when={!archivedThreads().has(thread.threadId) && !lockedThreads().has(thread.threadId)}>
                    <button
                      type="button"
                      title="Quick reply"
                      onClick={(e) => { e.stopPropagation(); setThreadActionError(null); setReplyingToThread((prev) => toggleThreadReplyComposerState(prev, thread.threadId)); }}
                      class="flex-shrink-0 text-[10px] text-transparent group-hover:text-on-surface-variant/50 hover:text-primary transition"
                      aria-label="Reply"
                    >
                      ↩ Reply
                    </button>
                  </Show>
                  {/* 14c — preview toggle */}
                  <button
                    type="button"
                    title={previewThreadId() === thread.threadId ? "Collapse preview" : "Preview messages"}
                    class="flex-shrink-0 self-start mt-1 rounded-lg px-2 py-1 text-[10px] text-on-surface-variant/50 transition hover:bg-white/40 hover:text-on-surface-variant"
                    onClick={(e) => togglePreview(thread.threadId, e)}
                  >
                    {previewThreadId() === thread.threadId ? "▲" : "▼"}
                  </button>
                </div>
                {/* 22f — inline reply composer */}
                <Show when={replyingToThread() === thread.threadId}>
                  <div class="border-t border-white/20 px-4 py-3">
                    <div class="mt-2 flex flex-col gap-1">
                      {/* 30c — Smart Compose Autocomplete wrapper */}
                      <TiptapEditor
                        mode="compact"
                        initialContent={replyDraft()}
                        disabled={replySubmittingThreadId() === thread.threadId}
                        placeholder="Quick reply..."
                        clearOnSend
                        onChange={(text) => {
                          setReplyDraft(text);
                          updateAutocomplete(text);
                        }}
                        onSend={async (payload) => {
                          setReplyDraft(payload.text);
                          await submitReply(thread.threadId);
                        }}
                      />
                      <div class="flex gap-2 justify-end">
                        <button
                          disabled={replySubmittingThreadId() === thread.threadId}
                          onClick={() => { setThreadActionError(null); setReplyingToThread(null); setReplyDraft(""); }}
                          class="text-xs text-neutral-500 px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={replySubmittingThreadId() === thread.threadId || !replyDraft().trim()}
                          onClick={() => submitReply(thread.threadId)}
                          class="text-xs bg-primary text-white px-3 py-1 rounded hover:opacity-80 disabled:opacity-50"
                        >
                          {replySubmittingThreadId() === thread.threadId ? "Sending..." : "Send"}
                        </button>
                      </div>
                    </div>
                  </div>
                </Show>
                {/* 14c — inline preview panel (27a, 27b, 27q enhanced) */}
                <Show when={previewThreadId() === thread.threadId}>
                  <div class="border-t border-white/20 px-4 py-3 space-y-1.5 max-h-48 overflow-y-auto">
                    <For each={thread.messages.slice(-4)}>
                      {(msg, msgIdx) => {
                        const c = afpRecord(msg.content);
                        const text = (c?.summary ?? c?.text ?? c?.body ?? msg.type) as string;
                        const allSlice = thread.messages.slice(-4);
                        const prevMsg = msgIdx() > 0 ? allSlice[msgIdx() - 1] : null;
                        const showBoundary = !!(prevMsg?.timestamp && msg.timestamp &&
                          new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime() > 86400000);
                        const label = intentLabel(msg.type);
                        const meta = threadPreviewMeta(msg);
                        const isQuestion = msg.type === 'clarification_request';
                        return (
                          <div class='space-y-1'>
                            {/* 27q — session boundary marker when gap > 1 day */}
                            <Show when={showBoundary}>
                              <div class='flex items-center gap-2 py-0.5'>
                                <div class='h-px flex-1 bg-white/15' />
                                <span class='font-mono text-[8px] text-on-surface-variant/35'>{threadBoundaryText(msg.timestamp)}</span>
                                <div class='h-px flex-1 bg-white/15' />
                              </div>
                            </Show>
                            {/* 27a/27b — intent label + clarification request special card */}
                            <div class={`rounded-lg px-3 py-2 ${isQuestion ? 'border border-sky-200/50 bg-sky-50/30' : 'bg-white/20'}`}>
                              <span class={`mb-0.5 block font-mono text-[8px] uppercase tracking-[0.1em] ${isQuestion ? 'text-sky-600 font-semibold' : 'text-on-surface-variant/40'}`}>{label}</span>
                              <p class='truncate text-xs text-on-surface'>{String(text).slice(0, 120)}</p>
                              <p class='mt-0.5 font-mono text-[9px] text-on-surface-variant/50'>{msg.type} · {meta.relativeTimestampText}</p>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                    <button
                      type="button"
                      class="w-full rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
                      onClick={() => props.onOpenThread(thread.threadId)}
                    >
                      Open conversation →
                    </button>
                    {/* Contextual echoes — related knowledge cards for the selected thread */}
                    {(() => {
                      const ctx = relatedCtx().get(thread.threadId);
                      if (!ctx) return null;
                      return (
                        <div class="border-t border-white/10 pt-2 space-y-1.5">
                          <p class="font-mono text-[8px] uppercase tracking-[0.12em] text-on-surface-variant/40">Related context</p>
                          <Show when={ctx.loading}>
                            <p class="text-[10px] text-on-surface-variant/40 animate-pulse">Fetching…</p>
                          </Show>
                          <Show when={!ctx.loading && ctx.items.length > 0}>
                            <div class="flex flex-wrap gap-1.5">
                              <For each={ctx.items}>
                                {(item) => (
                                  <span
                                    title={item.type}
                                    class="inline-block max-w-[14rem] truncate rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[10px] text-on-surface-variant"
                                  >
                                    {item.label}
                                  </span>
                                )}
                              </For>
                            </div>
                          </Show>
                          <Show when={!ctx.loading && ctx.items.length === 0}>
                            <p class="text-[10px] text-on-surface-variant/30">No related context found</p>
                          </Show>
                        </div>
                      );
                    })()}
                  </div>
                </Show>
                {/* 30n — Hover-to-Expand: message preview expands after 600ms hover */}
                <Show when={hoverExpandId() === thread.threadId && previewThreadId() !== thread.threadId}>
                  <div class="border-t border-white/15 px-4 py-2.5 space-y-1 hover-expand-preview animate-fade-in">
                    <p class="font-mono text-[8px] uppercase tracking-[0.14em] text-on-surface-variant/40 mb-1">Quick preview</p>
                    <For each={thread.messages.slice(-2)}>
                      {(msg) => {
                        const c = afpRecord(msg.content);
                        const text = threadListFirstString(c, ["summary", "text", "body"], msg.type).slice(0, 100);
                        return (
                          <div class="flex items-start gap-2">
                            <span class="font-mono text-[8px] uppercase tracking-[0.1em] text-on-surface-variant/40 shrink-0 mt-0.5 w-12 truncate">{msg.type}</span>
                            <p class="text-[11px] text-on-surface-variant truncate flex-1">{text}</p>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
              );
            }}
          </For>
        </div>
        </Show>
      </Show>

      {/* ── Search threads ──────────────────────────────────────────────────── */}
      <Show when={filter() === "search"}>
        <div class="space-y-3">
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Past search conversations</p>
          <Show
            when={queryHistory().length > 0}
            fallback={
              <div class="rounded-3xl border border-white/50 bg-white/35 p-10 text-center space-y-2">
                {/* 13e — smart empty state */}
                <p class="text-2xl">🔍</p>
                <p class="text-sm font-medium text-on-surface">No search history yet</p>
                <p class="text-xs text-on-surface-variant">Use the search bar or press <kbd class="rounded border border-white/30 px-1 font-mono text-[10px]">Ctrl+/</kbd> to run your first search.</p>
                <div class="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <Show when={props.onRequestSearchFocus}>
                    <button
                      type="button"
                      onClick={() => props.onRequestSearchFocus?.()}
                      class="rounded-full border border-white/45 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
                    >
                      Ask your agent
                    </button>
                  </Show>
                  <button
                    type="button"
                    onClick={focusThreadSearchInput}
                    class="rounded-full border border-white/45 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
                  >
                    Search threads
                  </button>
                </div>
              </div>
            }
          >
            <For each={queryHistory().slice(0, 30)}>
              {(entry) => (
                <div class="rounded-2xl border border-white/40 bg-white/35 px-4 py-3 backdrop-blur">
                  <div class="flex items-start justify-between gap-2">
                    <p class="text-sm font-medium text-on-surface">{entry.query}</p>
                    <p class="flex-shrink-0 font-mono text-[10px] text-on-surface-variant/50" title={threadQueryHistoryMeta(entry.timestamp).absoluteTimestampText}>
                      {relativeTime(entry.timestamp)}
                    </p>
                  </div>
                  <Show when={entry.result}>
                    <p class="mt-1 truncate text-xs text-on-surface-variant/70">{entry.result}</p>
                  </Show>
                  <p class="mt-1 font-mono text-[10px] text-on-surface-variant/40">
                    {threadQueryHistoryMeta(entry.timestamp).weekdayDateText}
                  </p>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>

      {/* ── Notice threads by sender → channel (15r) ──────────────────────── */}
      <Show when={filter() === "notice"}>
        <div class="space-y-3">
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Grouped by sender</p>
          <Show
            when={noticeGroupsBySender().length > 0}
            fallback={
              <div class="rounded-3xl border border-white/50 bg-white/35 p-10 text-center space-y-2">
                <p class="text-2xl">🔔</p>
                <p class="text-sm font-medium text-on-surface">No notices yet</p>
                <p class="text-xs text-on-surface-variant">Notices will appear here grouped by sender when your agent receives emails, Slack messages, or other communications.</p>
                <div class="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <Show when={props.onRequestSearchFocus}>
                    <button
                      type="button"
                      onClick={() => props.onRequestSearchFocus?.()}
                      class="rounded-full border border-white/45 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
                    >
                      Ask your agent
                    </button>
                  </Show>
                  <button
                    type="button"
                    onClick={focusThreadSearchInput}
                    class="rounded-full border border-white/45 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
                  >
                    Search threads
                  </button>
                </div>
              </div>
            }
          >
            <For each={noticeGroupsBySender()}>
              {(group) => {
                const key = `${group.sender}::${group.channel}`;
                const isExpanded = () => expandedSenderKeys().has(key);
                const countLabel = group.msgs.length === 1
                  ? `1 ${group.channel === "email" ? "email" : "message"}`
                  : `${group.msgs.length} ${group.channel === "email" ? "emails" : "messages"}`;
                const channelSuffix = group.channel !== "chat" ? ` on ${group.channel}` : "";
                return (
                  <div class="overflow-hidden rounded-2xl border border-white/40 bg-white/35 backdrop-blur">
                    <button
                      type="button"
                      class="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-on-surface transition hover:bg-white/20"
                      onClick={() => toggleSenderGroup(key)}
                    >
                      <span class="flex items-center gap-2">
                        {/* 16i — sender avatar */}
                        <span
                          class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ "background-color": senderColor(group.sender) }}
                          aria-hidden="true"
                        >{senderInitials(group.sender)}</span>
                        <span class="text-sm leading-none">{group.channelIcon}</span>
                        <span>
                          <span class="font-semibold">{countLabel}</span>
                          <span class="text-on-surface-variant"> from </span>
                          <span class="font-semibold">{group.sender}</span>
                          {channelSuffix && <span class="text-on-surface-variant">{channelSuffix}</span>}
                        </span>
                        <span class="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[9px] font-semibold text-primary">
                          {group.msgs.length}
                        </span>
                      </span>
                      <span class="text-[10px] text-on-surface-variant/50">{isExpanded() ? "▲" : "▼"}</span>
                    </button>
                    <Show when={isExpanded()}>
                      <div class="border-t border-white/20 px-4 py-2 space-y-1">
                        <For each={group.msgs}>
                          {(msg) => {
                            const c = afpRecord(msg.content);
                            const text = threadListFirstString(c, ["summary", "subject", "text"], msg.type);
                            const meta = threadPreviewMeta(msg);
                            return (
                              <button
                                type="button"
                                class="w-full rounded-lg px-3 py-2 text-left text-xs text-on-surface transition hover:bg-white/30"
                                onClick={() => props.onOpenThread(msg.thread_id)}
                              >
                                <span class="block truncate">{text}</span>
                                <span class="mt-0.5 block font-mono text-[9px] text-on-surface-variant/50">
                                  {meta.relativeTimestampText}
                                </span>
                              </button>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>
      </Show>

      {/* P5.4 — Suggestions tab: proactive messages grouped by entity_id */}
      <Show when={filter() === "suggestions"}>
        <div class="space-y-3">
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Grouped by subject</p>
          <Show
            when={suggestionGroups().length > 0}
            fallback={
              <div class="rounded-3xl border border-white/50 bg-white/35 p-10 text-center space-y-2">
                <p class="text-2xl">💡</p>
                <p class="text-sm font-medium text-on-surface">No suggestions yet</p>
                <p class="text-xs text-on-surface-variant">
                  Your agent will surface proactive suggestions here when it detects patterns in your workflow.
                  Enable heuristic packs in Agent Settings to get started.
                </p>
                <div class="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <Show when={props.onOpenAgentSettings}>
                    <button
                      type="button"
                      onClick={() => props.onOpenAgentSettings?.()}
                      class="rounded-full border border-white/45 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
                    >
                      Open Agent Settings
                    </button>
                  </Show>
                  <Show when={props.onRequestSearchFocus}>
                    <button
                      type="button"
                      onClick={() => props.onRequestSearchFocus?.()}
                      class="rounded-full border border-white/45 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
                    >
                      Ask your agent
                    </button>
                  </Show>
                </div>
              </div>
            }
          >
            <For each={suggestionGroups()}>
              {(group) => {
                const urgencyClass = group.urgency === "high"
                  ? "border-rose-400/40 bg-rose-50/30"
                  : group.urgency === "medium"
                  ? "border-amber-400/40 bg-amber-50/30"
                  : "border-violet-400/40 bg-violet-50/30";
                const urgencyDot = group.urgency === "high" ? "bg-rose-500"
                  : group.urgency === "medium" ? "bg-amber-500" : "bg-violet-500";
                const entityKey = group.entityId ?? "general";
                const isExpanded = () => expandedSenderKeys().has(`suggestion::${entityKey}`);
                return (
                  <div class={`overflow-hidden rounded-2xl border backdrop-blur ${urgencyClass}`}>
                    <button
                      type="button"
                      class="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-on-surface transition hover:bg-white/20"
                      onClick={() => toggleSenderGroup(`suggestion::${entityKey}`)}
                    >
                      <span class="flex items-center gap-2">
                        <span class={`h-2 w-2 flex-shrink-0 rounded-full ${urgencyDot}`} aria-hidden="true" />
                        <span class="font-semibold">{group.label}</span>
                        <span class="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[9px] font-semibold text-primary">
                          {group.msgs.length}
                        </span>
                      </span>
                      <span class="text-[10px] text-on-surface-variant/50">{isExpanded() ? "▲" : "▼"}</span>
                    </button>
                    <Show when={isExpanded()}>
                      <div class="border-t border-white/20 px-4 py-2 space-y-1">
                        <For each={group.msgs}>
                          {(msg) => {
                            const c = afpRecord(msg.content);
                            const desc = threadListFirstString(c, ["description", "action_label"], msg.subtype ?? "Suggestion");
                            const label = threadListScalarString(c.action_label, "View");
                            const meta = threadPreviewMeta(msg);
                            return (
                              <div class="flex items-start justify-between gap-3 rounded-lg px-3 py-2 hover:bg-white/20">
                                <div class="min-w-0 flex-1">
                                  <p class="truncate text-xs text-on-surface">{desc}</p>
                                  <p class="mt-0.5 font-mono text-[9px] text-on-surface-variant/50">
                                    {meta.relativeTimestampText}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  class="flex-shrink-0 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold text-primary transition hover:bg-primary/20"
                                  onClick={() => props.onOpenThread(msg.thread_id)}
                                >
                                  {label}
                                </button>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>
      </Show>
      <Show when={selectedForMerge().size > 0}>
        <div class="pointer-events-none sticky bottom-4 z-30 flex justify-center px-2">
          <div class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/60 bg-white/92 px-3 py-2 shadow-panel backdrop-blur-xl">
            <span class="rounded-full bg-primary/12 px-2.5 py-1 text-[10px] font-semibold text-primary">
              {selectedForMerge().size} selected
            </span>
            <button
              type="button"
              disabled={selectedArchivableThreadIds().length === 0}
              onClick={archiveSelectedThreads}
              class="rounded-full border border-white/45 bg-white px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Archive
            </button>
            <button
              type="button"
              disabled={selectedExportableThreads().length === 0}
              onClick={exportSelectedThreads}
              class="rounded-full border border-white/45 bg-white px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Export
            </button>
            <Show when={selectedForMerge().size >= 2}>
              <button
                type="button"
                disabled={merging()}
                onClick={mergeSelectedThreads}
                class="rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {merging() ? "Merging..." : "Merge"}
              </button>
            </Show>
            <button
              type="button"
              onClick={clearSelectedThreads}
              class="rounded-full border border-white/45 bg-white px-3 py-1.5 text-[11px] font-semibold text-on-surface transition hover:bg-white/80"
            >
              Clear
            </button>
          </div>
        </div>
      </Show>
      <Show when={threadContextMenu()} keyed>
        {(menu) => {
          const thread = () => sortedThreads().find((entry) => entry.threadId === menu.threadId);
          return (
            <Portal>
              <div
                class="fixed inset-0 z-[140]"
                onPointerDown={() => closeThreadContextMenu()}
                onContextMenu={(event) => {
                  event.preventDefault();
                  closeThreadContextMenu();
                }}
              >
                <div
                  class="absolute w-52 rounded-2xl border border-white/55 bg-white/96 p-2 shadow-panel backdrop-blur-xl"
                  style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <div class="px-2 pb-2 pt-1">
                    <p class="truncate text-sm font-semibold text-on-surface">{threadTitles()[menu.threadId] ?? threadTitle(menu.threadId, thread()?.messages ?? [])}</p>
                    <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/55">Thread actions</p>
                  </div>
                  <div class="space-y-1">
                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                      onClick={() => {
                        toggleStar(menu.threadId);
                        closeThreadContextMenu();
                      }}
                    >
                      <span>{starredThreads().has(menu.threadId) ? "Unstar thread" : "Star thread"}</span>
                      <span class="font-mono text-[10px] text-on-surface-variant/55">{starredThreads().has(menu.threadId) ? "on" : "off"}</span>
                    </button>
                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                      onClick={() => {
                        togglePin(menu.threadId);
                        closeThreadContextMenu();
                      }}
                    >
                      <span>{pinnedThreads().has(menu.threadId) ? "Unpin thread" : "Pin to top"}</span>
                      <span class="font-mono text-[10px] text-on-surface-variant/55">pin</span>
                    </button>
                    <Show
                      when={!archivedThreads().has(menu.threadId) && !lockedThreads().has(menu.threadId)}
                      fallback={
                        <Show when={archivedThreads().has(menu.threadId)}>
                          <button
                            type="button"
                            class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                            onClick={() => {
                              unarchiveThread(menu.threadId);
                              closeThreadContextMenu();
                            }}
                          >
                            <span>Restore thread</span>
                            <span class="font-mono text-[10px] text-on-surface-variant/55">live</span>
                          </button>
                        </Show>
                      }
                    >
                      <button
                        type="button"
                        class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                        onClick={() => {
                          archiveThread(menu.threadId);
                          closeThreadContextMenu();
                        }}
                      >
                        <span>Archive thread</span>
                        <span class="font-mono text-[10px] text-on-surface-variant/55">hide</span>
                      </button>
                    </Show>
                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                      onClick={() => {
                        toggleLock(menu.threadId);
                        closeThreadContextMenu();
                      }}
                    >
                      <span>{lockedThreads().has(menu.threadId) ? "Unlock thread" : "Lock thread"}</span>
                      <span class="font-mono text-[10px] text-on-surface-variant/55">{lockedThreads().has(menu.threadId) ? "open" : "locked"}</span>
                    </button>
                    <Show when={!archivedThreads().has(menu.threadId) && !lockedThreads().has(menu.threadId)}>
                      <button
                        type="button"
                        class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                        onClick={() => {
                          setThreadActionError(null);
                          setReplyingToThread((prev) => toggleThreadReplyComposerState(prev, menu.threadId));
                          closeThreadContextMenu();
                        }}
                      >
                        <span>Quick reply</span>
                        <span class="font-mono text-[10px] text-on-surface-variant/55">reply</span>
                      </button>
                    </Show>
                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                      onClick={() => {
                        const target = thread();
                        if (target) exportThread(target);
                        closeThreadContextMenu();
                      }}
                    >
                      <span>Export markdown</span>
                      <span class="font-mono text-[10px] text-on-surface-variant/55">md</span>
                    </button>
                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                      onClick={() => {
                        markRead(menu.threadId);
                        props.onOpenThread(menu.threadId);
                        closeThreadContextMenu();
                      }}
                    >
                      <span>Open thread</span>
                      <span class="font-mono text-[10px] text-on-surface-variant/55">open</span>
                    </button>
                  </div>
                </div>
              </div>
            </Portal>
          );
        }}
      </Show>
    </div>
  );
}



