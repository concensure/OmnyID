import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import type { AfpMessage, DashboardBootstrap } from "@/lib/api";
import type {
  WorkspaceAssistNavigationView,
  WorkspaceAssistDraftRefreshInput,
  WorkspaceAssistRefreshOrigin,
} from "@/lib/workspaceAssist";
import { AlternateViewsInspector } from "@/components/AlternateViewsInspector";
import {
  fetchThread,
  orchestrateAgent,
  readSession,
  retryFederatedAgentMessage,
  sendAfpMessage,
  sendFederatedAgentMessage,
  subscribeThread,
} from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { ViewDispatcher } from "@/components/ViewDispatcher";
import { GlassPanel } from "@/components/GlassPanel";
import { ProcessingGlyph } from "@/components/ProcessingGlyph";
import { ThreadMiniMap } from "@/components/ThreadMiniMap";
import { Tip } from "@/components/Tip";
import { toast } from "@/components/Toast";
import { openObjectSearch } from "@/lib/objectSearchNavigation";
import { dispatchOpenThreadEvent } from "@/lib/openThreadEvent";
import { loadUserProfile } from "@/lib/profileLocalState";
import {
  loadThreadViewLastReadMessageId,
  loadThreadViewReactions,
  loadThreadViewScrollPosition,
  loadThreadViewStarredMessageIds,
  saveThreadViewLastReadMessageId,
  saveThreadViewReactions,
  saveThreadViewScrollPosition,
  saveThreadViewStarredMessageIds,
} from "@/lib/threadViewLocalState";
import { WorkspaceAssistPanel } from "@/components/WorkspaceAssistPanel";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import {
  detectWorkspaceAssistTopic,
  selectWorkspaceAssistSuggestion,
} from "afp-ts/workspace-assistance";
import {
  buildDashboardWorkspaceAssistCandidates,
  buildDashboardWorkspaceAssistRecentTitles,
  workspaceAssistNavigationView,
} from "@/lib/workspaceAssist";
import {
  buildThreadOrchestrationFailureReceipt,
  type ThreadOrchestrationFailureReceipt,
} from "@/lib/threadOrchestrationFailureState";
import {
  buildThreadLoadFailureReceipt,
  type ThreadLoadFailureReceipt,
} from "@/lib/threadLoadFailureState";
import { afpRecord } from "@/lib/afpMessageRecord";
import { loadAgentResponseStylePayload } from "@/lib/agentResponseStyle";
import {
  absoluteUtcTimestamp,
  displayMessageTimestamp,
  relativeMessageTime,
} from "@/lib/messageTimestampPresentation";
import {
  FEDERATION_BODY_MAX_CHARS,
  FEDERATION_SUBJECT_MAX_CHARS,
  federatedComposerValidationError,
  federatedTextCharCount,
  federationDeliveryReceiptSummary,
  federationDeliveryStatus,
  senderColorClassForThreadView,
  threadViewAtSuggestions,
  threadViewMentionAliases,
  threadViewMessageCostCents,
  threadViewMessageMentionsCurrentUser,
  threadViewMessageMetadata,
  threadViewMessageObjectSearchSeed,
  threadViewMessageSmtpId,
  threadViewMessageStringValues,
  threadViewMessageTextContent,
  threadViewMessageWordCount,
  threadViewObjectSearchSeed,
  threadViewRecentTitles,
  threadViewSenderCounts,
  threadViewSenderLabel,
  threadViewSenderRole,
  threadViewTokenEstimate,
  threadViewTotalCostCents,
  threadViewTypingStatusLabel,
  threadViewTypingTask,
  threadViewMessageDates,
} from "@/lib/threadViewPresentationState";
import {
  threadViewBuildRawMessageById,
  threadViewBuildRenderEntries,
  threadViewBuildRenderUnits,
  threadViewDateLabel,
  threadViewFilterRenderEntriesByQuery,
  threadViewFilterRenderEntriesBySender,
  threadViewMessageContentCardId,
  threadViewRenderableEntries,
  threadViewRenderUnitMessage,
  type ThreadViewRenderEntry,
  type ThreadViewRenderUnit,
} from "@/lib/threadViewRenderState";

const REACTIONS = ["+1", "heart", "ok", "idea"] as const;

const AFP_TYPE_DEFS: Record<string, string> = {
  note: "Free-form note stored in the append-only message log",
  task: "Action item assigned to a user or agent",
  summary: "Agent-generated distillation of thread or document content",
  research: "Agent research result with sources and citations",
  knowledge_card: "Curated knowledge atom indexed by the Knowledge Curator",
  daemon_heartbeat: "Periodic liveness ping emitted by a background daemon",
  backlink_update: "Audit record of a cross-reference between two messages",
  email_inbound: "Incoming email captured from the Email Gateway",
  email_draft: "Outbound email draft pending user review",
  proactive_suggestion: "Agent-initiated recommendation without a user prompt",
  clarification_request: "Agent asking for more information before proceeding",
  branch_create: "Agent opened a copy-on-write branch for exploratory work",
  branch_merge: "Agent branch merged back into the main message log",
  workspace_create: "New ephemeral workspace initialised for isolated work",
  agent_task: "Sub-task dispatched to a specialist agent",
  generative_card: "Rich multi-section card built incrementally by an agent",
  card_section_update: "Incremental update to an in-progress generative card",
  approval_request: "Agent requesting user sign-off before a high-impact action",
  approval_response: "User grant or denial in response to an approval request",
};

const QUICK_REPLIES = ["Tell me more", "Summarise this", "What's next?"] as const;
const TYPING_FALLBACK_LABELS = [
  "Searching...",
  "Reading context...",
  "Drafting...",
  "Reviewing...",
] as const;

const SENDER_COLORS = [
  "border-l-2 border-l-sky-400/50",
  "border-l-2 border-l-violet-400/50",
  "border-l-2 border-l-emerald-400/50",
  "border-l-2 border-l-rose-400/50",
  "border-l-2 border-l-amber-400/50",
] as const;
type MessageContextMenuState = {
  msgId: string;
  x: number;
  y: number;
};
function senderColorClass(senderName: string): string {
  return senderColorClassForThreadView(senderName, SENDER_COLORS);
}

function buildMessageObjectSearchSeed(message: AfpMessage): string {
  return threadViewMessageObjectSearchSeed(message);
}

function senderLabel(from: string): string {
  return threadViewSenderLabel(from);
}

function senderRole(from: string): string {
  return threadViewSenderRole(from);
}

function relativeTime(ts: string): string {
  return relativeMessageTime(ts);
}

function displayTimestamp(ts: string): string {
  return displayMessageTimestamp(ts);
}

function buildThreadObjectSearchSeed(messages: AfpMessage[]): string {
  return threadViewObjectSearchSeed(messages);
}

function mentionAliasesFromProfile(): string[] {
  if (typeof window === "undefined") return [];
  const profile = loadUserProfile(readSession()?.user?.id ?? null);
  return threadViewMentionAliases(profile.displayName);
}

function messageTextContent(message: AfpMessage): string {
  return threadViewMessageTextContent(message);
}

function messageStringValues(message: AfpMessage): string[] {
  return threadViewMessageStringValues(message);
}

function messageWordCount(message: AfpMessage): number {
  return threadViewMessageWordCount(message);
}

function messageMetadata(message: AfpMessage): Record<string, unknown> | undefined {
  return threadViewMessageMetadata(message);
}

function messageCostCents(message: AfpMessage): number {
  return threadViewMessageCostCents(message);
}

function messageSmtpId(message: AfpMessage): string | null {
  return threadViewMessageSmtpId(message);
}

function messageMentionsCurrentUser(message: AfpMessage): boolean {
  return threadViewMessageMentionsCurrentUser(message, mentionAliasesFromProfile());
}

/**
 * Full thread view: loads all AFP messages for a given thread_id,
 * renders each through ViewDispatcher, and keeps the thread live via
 * the relay WebSocket (/relay/ws subscribe_thread).
 *
 * Agents' view hints (views[].format) take full effect here.
 * each message is independently dispatched to its renderer.
 */
export function ThreadView(props: {
  threadId: string;
  initialFocusMessageId?: string | null;
  initialReplyDraft?: string | null;
  bootstrap?: DashboardBootstrap | null;
  advanced?: boolean;
  onBack?: () => void;
  onOpenWorkspaceAssist?: (view: WorkspaceAssistNavigationView) => void;
  onRequestWorkspaceAssistDraftRefresh?: (input: WorkspaceAssistDraftRefreshInput) => void;
  workspaceAssistRefreshOrigin?: WorkspaceAssistRefreshOrigin | null;
}) {
  const [messages, setMessages] = createSignal<AfpMessage[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal<ThreadLoadFailureReceipt | null>(null);
  const [refreshError, setRefreshError] = createSignal<ThreadLoadFailureReceipt | null>(null);
  const [live, setLive] = createSignal(false);
  const [focusedMessageId, setFocusedMessageId] = createSignal<string | null>(null);
  const [atBottom, setAtBottom] = createSignal(true);
  const [showScrollTop, setShowScrollTop] = createSignal(false);
  const [unseenCount, setUnseenCount] = createSignal(0);
  const [readingProgress, setReadingProgress] = createSignal(0);
  const [copied, setCopied] = createSignal(false);
  const [copiedMsgId, setCopiedMsgId] = createSignal<string | null>(null);
  const [copiedMsgText, setCopiedMsgText] = createSignal<string | null>(null);
  const [copiedDeepLinkId, setCopiedDeepLinkId] = createSignal<string | null>(null);
  const [messageContextMenu, setMessageContextMenu] = createSignal<MessageContextMenuState | null>(null);
  const [showMsgSearch, setShowMsgSearch] = createSignal(false);
  const [msgSearch, setMsgSearch] = createSignal("");
  let msgSearchInputRef: HTMLInputElement | undefined;
  function copyMsgId(id: string) {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId((prev) => (prev === id ? null : prev)), 1500);
    });
  }
  function copyMsgText(content: unknown, msgId: string) {
    const record = afpRecord(content);
    const parts: string[] = [];
    const title = record["title"] ?? record["subject"];
    if (typeof title === "string" && title) parts.push(title);
    const body = record["body"] ?? record["summary"] ?? record["description"] ?? record["text"] ?? record["markdown"] ?? record["query"];
    if (typeof body === "string" && body) parts.push(body);
    const text = parts.join("\n\n") || JSON.stringify(record, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMsgText(msgId);
      setTimeout(() => setCopiedMsgText((prev) => (prev === msgId ? null : prev)), 1500);
    });
  }
  function messageDeepLink(msgId: string): string {
    return `omnyid://thread/${props.threadId}/msg/${msgId}`;
  }
  function copyMessageDeepLink(msgId: string) {
    navigator.clipboard.writeText(messageDeepLink(msgId)).then(() => {
      setCopiedDeepLinkId(msgId);
      setTimeout(() => setCopiedDeepLinkId((prev) => (prev === msgId ? null : prev)), 1500);
    });
  }
  function openMessageContextMenu(event: MouseEvent, msgId: string) {
    event.preventDefault();
    event.stopPropagation();
    setMessageContextMenu({
      msgId,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 180),
    });
  }
  function closeMessageContextMenu() {
    setMessageContextMenu(null);
  }
  const sessionUserId = readSession()?.user?.id ?? null;
  const [starredMsgs, setStarredMsgs] = createSignal<Set<string>>(loadThreadViewStarredMessageIds(sessionUserId));
  function toggleStar(id: string) {
    setStarredMsgs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return saveThreadViewStarredMessageIds(next, sessionUserId);
    });
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
  const [replyFailureReceipt, setReplyFailureReceipt] = createSignal<ThreadOrchestrationFailureReceipt | null>(null);
  const [federationComposerOpen, setFederationComposerOpen] = createSignal(false);
  const [federationRecipientAgentId, setFederationRecipientAgentId] = createSignal("");
  const [federationSubject, setFederationSubject] = createSignal("");
  const [federationBody, setFederationBody] = createSignal("");
  const [federationSending, setFederationSending] = createSignal(false);
  const [federationError, setFederationError] = createSignal("");
  const [retryingFederationAttemptId, setRetryingFederationAttemptId] = createSignal<string | null>(null);
  const federationComposerValidation = createMemo(() =>
    federatedComposerValidationError({
      recipientAgentId: federationRecipientAgentId(),
      subject: federationSubject(),
      body: federationBody(),
    })
  );
  const federationSubjectCharCount = createMemo(() => federatedTextCharCount(federationSubject()));
  const federationBodyCharCount = createMemo(() => federatedTextCharCount(federationBody()));
  let appliedInitialReplyDraft: string | null = null;
  createEffect(() => {
    const draft = props.initialReplyDraft?.trim() ?? "";
    if (!draft || draft === appliedInitialReplyDraft || replyText().trim()) return;
    appliedInitialReplyDraft = draft;
    setReplyText(draft);
  });

  async function sendReply() {
    const text = replyText().trim();
    if (!text || replySending()) return;
    setReplySending(true);
    setReplyError("");
    setReplyFailureReceipt(null);
    try {
      const mention = text.match(/^@(\w+)\s+/);
      const routedText = mention ? `[Route to ${mention[1]}]: ${text.slice(mention[0].length)}` : text;
      setAtQuery(null);
      await orchestrateAgent({
        objective: routedText,
        thread_id: props.threadId,
        ...(await loadAgentResponseStylePayload()),
      });
      setReplyText("");
      setReplySent(true);
      setTimeout(() => setReplySent(false), 2000);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Send failed";
      const receipt = buildThreadOrchestrationFailureReceipt(errorMessage);
      setReplyError(receipt.title);
      setReplyFailureReceipt(receipt);
      try {
        const latestMessage = messages()[messages().length - 1] ?? null;
        await sendAfpMessage({
          thread_id: props.threadId,
          parent_id: latestMessage?.id ?? null,
          from: "agent:thread-assist@omnyid.com",
          to: [],
          type: "note",
          subtype: "thread_orchestration_failure",
          content: {
            title: receipt.title,
            body: `${receipt.summary} ${receipt.nextStep}`,
            error_summary: receipt.summary,
            next_step: receipt.nextStep,
          },
          views: [
            {
              format: "rich_text",
              priority: 1,
              content: {
                markdown: `### ${receipt.title}\n\n${receipt.summary}\n\n**Next step:** ${receipt.nextStep}`,
              },
            },
          ],
          metadata: {
            origin: "thread_orchestration_failure",
            failure_tone: receipt.tone,
            raw_error_message: errorMessage,
          },
          store_in_relational: true,
        });
      } catch {
        // Keep the inline recovery receipt even if the thread log append fails.
      }
    }
    setReplySending(false);
  }

  async function sendFederatedMessage() {
    const recipient = federationRecipientAgentId().trim();
    const body = federationBody().trim();
    if (!recipient || !body || federationSending()) return;
    const validationError = federationComposerValidation();
    if (validationError) {
      setFederationError(validationError);
      return;
    }
    setFederationSending(true);
    setFederationError("");
    try {
      const response = await sendFederatedAgentMessage({
        recipient_agent_id: recipient,
        thread_id: props.threadId,
        subject: federationSubject().trim() || null,
        body,
      });
      setFederationComposerOpen(false);
      setFederationRecipientAgentId("");
      setFederationSubject("");
      setFederationBody("");
      if (response.source_thread_id && response.thread_id) {
        toast.success("Agent message sent in federation delivery thread", {
          duration: 7000,
          action: {
            label: "Open",
            onClick: () => dispatchOpenThreadEvent({
              threadId: response.thread_id!,
              messageId: response.message_id,
            }),
          },
        });
      } else {
        toast.success("Agent message sent");
      }
      await reload({ preserveExisting: true });
    } catch (error) {
      setFederationError(error instanceof Error ? error.message : "Federated send failed");
      await reload({ preserveExisting: true });
    } finally {
      setFederationSending(false);
    }
  }

  async function retryFederatedMessage(attemptedMessageId: string) {
    const messageId = attemptedMessageId.trim();
    if (!messageId || retryingFederationAttemptId()) return;
    setRetryingFederationAttemptId(messageId);
    try {
      const response = await retryFederatedAgentMessage({ attempted_message_id: messageId });
      toast.success(response.retried ? "Federation retry sent" : "Federation delivery already accepted");
      await reload({ preserveExisting: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Federation retry failed");
      await reload({ preserveExisting: true });
    } finally {
      setRetryingFederationAttemptId((current) => current === messageId ? null : current);
    }
  }

  function applyQuickReply(text: string) {
    setReplyText(text);
    setPreviewReply(false);
  }

  const threadTokenEstimate = createMemo(() =>
    threadViewTokenEstimate(messages())
  );

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
  let focusHighlightTimer: ReturnType<typeof setTimeout> | undefined;

  function updateReadingProgress() {
    if (!messagesContainerRef) {
      setReadingProgress(0);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef;
    const scrollableHeight = Math.max(1, scrollHeight - clientHeight);
    setReadingProgress(Math.max(0, Math.min(1, scrollTop / scrollableHeight)));
  }

  function scrollToBottom() {
    if (messagesContainerRef) {
      messagesContainerRef.scrollTop = messagesContainerRef.scrollHeight;
      setAtBottom(true);
      setUnseenCount(0);
      setReadingProgress(1);
      const msgs = messages();
      const last = msgs[msgs.length - 1];
      if (last) saveThreadViewLastReadMessageId(props.threadId, last.id, sessionUserId);
    }
  }

  function onScroll() {
    if (!messagesContainerRef) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef;
    setAtBottom(scrollHeight - scrollTop - clientHeight < 80);
    setShowScrollTop(scrollTop > 200);
    updateReadingProgress();
    saveThreadViewScrollPosition(props.threadId, scrollTop, sessionUserId);
  }

  createEffect(() => {
    const targetId = props.initialFocusMessageId;
    if (!targetId || !messagesContainerRef) return;
    if (!messages().some((message) => message.id === targetId)) return;
    const el = messagesContainerRef.querySelector(`[data-msg-id="${targetId}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setFocusedMessageId(targetId);
    if (focusHighlightTimer) clearTimeout(focusHighlightTimer);
    focusHighlightTimer = setTimeout(() => setFocusedMessageId((current) => current === targetId ? null : current), 2500);
  });

  createEffect(() => {
    if (!messageContextMenu()) return;
    const close = () => setMessageContextMenu(null);
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

  onCleanup(() => {
    if (focusHighlightTimer) clearTimeout(focusHighlightTimer);
  });

/**
 * Group messages for rendering:
 * - `generative_card` messages are rendered with their associated `card_section_update` messages.
 * - All other messages pass through ViewDispatcher unchanged.
 * Returns a list of render units.
 */
  type RenderUnit = ThreadViewRenderUnit;

  type RenderEntry = ThreadViewRenderEntry;

  const renderUnits = createMemo<RenderUnit[]>(() => threadViewBuildRenderUnits(messages()));
  const federationReceiptSummary = createMemo(() => federationDeliveryReceiptSummary(messages()));

  const rawMessageById = createMemo(() => {
    return threadViewBuildRawMessageById(renderUnits());
  });

  const filteredRenderEntries = createMemo<RenderEntry[]>(() => {
    const q = msgSearch().toLowerCase().trim();
    if (!q || !showMsgSearch()) return renderEntries();
    return threadViewFilterRenderEntriesByQuery(renderEntries(), q);
  });

  const displayedEntries = createMemo<RenderEntry[]>(() => {
    return threadViewFilterRenderEntriesBySender(filteredRenderEntries(), senderFilter());
  });

  const renderEntries = createMemo<RenderEntry[]>(() => {
    const lastReadId = loadThreadViewLastReadMessageId(props.threadId, sessionUserId);
    return threadViewBuildRenderEntries(renderUnits(), lastReadId);
  });

  async function reload(opts?: { preserveExisting?: boolean }) {
    try {
      const msgs = await fetchThread(props.threadId);
      setMessages(msgs);
      setLoadError(null);
      setRefreshError(null);
    } catch (err: unknown) {
      if (opts?.preserveExisting) {
        setRefreshError(
          buildThreadLoadFailureReceipt(
            "Refresh thread",
            err instanceof Error ? err.message : "Could not refresh thread.",
          ),
        );
      } else {
        setLoadError(
          buildThreadLoadFailureReceipt(
            "Load thread",
            err instanceof Error ? err.message : "Could not load thread.",
          ),
        );
      }
    }
  }

  async function copyFocusedMessageJson() {
    const focusedId = focusedMessageId();
    if (!focusedId) {
      toast.warning("Focus a message first.");
      return;
    }
    const message = rawMessageById().get(focusedId);
    if (!message) {
      toast.error("Could not find the focused message.");
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(message, null, 2));
      toast.success("Copied raw AFP JSON.");
    } catch {
      toast.error("Could not copy raw AFP JSON.");
    }
  }

  onMount(async () => {
    setLoading(true);
    await reload();
    setLoading(false);

    // Restore scroll position: saved pos -> last-read message -> bottom
    requestAnimationFrame(() => {
      const savedPos = loadThreadViewScrollPosition(props.threadId, sessionUserId);
      if (savedPos !== null && messagesContainerRef) {
        messagesContainerRef.scrollTop = savedPos;
        updateReadingProgress();
        return;
      }
      const lastId = loadThreadViewLastReadMessageId(props.threadId, sessionUserId);
      if (lastId && messagesContainerRef) {
        const el = messagesContainerRef.querySelector(`[data-msg-id="${lastId}"]`) as HTMLElement | null;
        if (el) {
          el.scrollIntoView({ block: "start" });
          updateReadingProgress();
          return;
        }
      }
      scrollToBottom();
    });

    // Subscribe to relay for real-time updates
    const unsub = subscribeThread(props.threadId, () => void reload({ preserveExisting: true }));
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
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          void copyFocusedMessageJson();
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
        saveThreadViewScrollPosition(props.threadId, messagesContainerRef.scrollTop, sessionUserId);
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
    return threadViewSenderCounts(messages());
  });
  const [showSenderBreakdown, setShowSenderBreakdown] = createSignal(false);
  const [senderFilter, setSenderFilter] = createSignal<string | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = createSignal(false);
  const [agentTrustMsgId, setAgentTrustMsgId] = createSignal<string | null>(null);
  const [openTraces, setOpenTraces] = createSignal<Set<string>>(new Set());
  const [reactions, setReactions] = createSignal<Record<string, Record<string, number>>>(
    loadThreadViewReactions(sessionUserId)
  );
  function addReaction(msgId: string, emoji: string) {
    setReactions((prev) => {
      const msgR = prev[msgId] ?? {};
      const next = { ...prev, [msgId]: { ...msgR, [emoji]: (msgR[emoji] ?? 0) + 1 } };
      return saveThreadViewReactions(next, sessionUserId);
    });
  }
  function agentHue(from: string): number {
    let h = 0;
    for (let i = 0; i < from.length; i++) h = (h * 31 + from.charCodeAt(i)) & 0xffff;
    return h % 360;
  }
  const [hoveredTag, setHoveredTag] = createSignal<string | null>(null);
  const [hoveredReaction, setHoveredReaction] = createSignal<string | null>(null);
  const [previewReply, setPreviewReply] = createSignal(false);
  const [showCostReceipt, setShowCostReceipt] = createSignal(false);
  const [atQuery, setAtQuery] = createSignal<string | null>(null);
  const AGENT_NAMES = ["knowledge_curator", "email_gateway", "master", "health_maintenance"] as const;
  const atSuggestions = createMemo(() => {
    return threadViewAtSuggestions(atQuery(), AGENT_NAMES);
  });
  const totalCostCents = createMemo(() =>
    threadViewTotalCostCents(messages())
  );
  const typingTask = createMemo<string | null>(() => {
    return threadViewTypingTask(messages());
  });

  const [typingStartedAt, setTypingStartedAt] = createSignal<number | null>(null);
  const [typingElapsed, setTypingElapsed] = createSignal(0);
  const typingStatusLabel = createMemo(() => {
    return threadViewTypingStatusLabel(typingTask(), typingElapsed(), TYPING_FALLBACK_LABELS);
  });
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
    return threadViewMessageDates(messages());
  });
  const threadObjectSearchSeed = createMemo(() => buildThreadObjectSearchSeed(messages()));
  const threadRecentTitles = createMemo(() => threadViewRecentTitles(messages()));
  const replyWorkspaceAssist = createMemo(() => {
    if (!replyText().trim()) return null;

    const topic = detectWorkspaceAssistTopic({
      app_label: "Thread reply composer",
      document_title: props.threadId,
      editor_text: replyText(),
      recent_activity_titles: [
        ...threadRecentTitles(),
        ...buildDashboardWorkspaceAssistRecentTitles(props.bootstrap ?? null),
      ],
    });

    return selectWorkspaceAssistSuggestion({
      topic,
      candidates: buildDashboardWorkspaceAssistCandidates(props.bootstrap ?? null, {
        refreshOrigin: props.workspaceAssistRefreshOrigin ?? "cached",
      }),
    });
  });
  createEffect(() => {
    props.onRequestWorkspaceAssistDraftRefresh?.({
      channelId: `thread:${props.threadId}`,
      surfaceKey: `thread:${props.threadId}`,
      documentTitle: props.threadId,
      text: replyText(),
    });
  });

  function openReplyWorkspaceAssist() {
    const destination = workspaceAssistNavigationView(replyWorkspaceAssist()?.destination_view);
    if (destination) {
      props.onOpenWorkspaceAssist?.(destination);
    }
  }

  function jumpToDate(dateLabel: string) {
    if (!messagesContainerRef) return;
    for (const m of messages()) {
      if (!m.timestamp) continue;
      const d = threadViewDateLabel(m.timestamp);
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
                {copied() ? "OK" : "Copy"}
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
                    prev
                  </button>
                  <button
                    type="button"
                    title={`Jump to bookmark ${starredNavIdx() + 1} of ${starredMsgs().size}`}
                    onClick={() => scrollToStarred(starredNavIdx())}
                    class="px-1 font-mono text-[9px] text-amber-600"
                  >
                    * {starredMsgs().size}
                  </button>
                  <button
                    type="button"
                    title="Next bookmark"
                    onClick={() => scrollToStarred(starredNavIdx() + 1)}
                    class="rounded-full px-2 py-1 font-mono text-[9px] text-amber-500 transition hover:bg-amber-400/20"
                  >
                    next
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
                        by sender {showSenderBreakdown() ? "^" : "v"}
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
                    title="Open indexed object retrieval for this thread"
                    onClick={() =>
                      openObjectSearch({
                        query: threadObjectSearchSeed(),
                        focusThreadId: props.threadId,
                        launchContext: {
                          sourceLabel: "Thread",
                          reason: "Related objects for this thread",
                        },
                      })
                    }
                    class="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[9px] text-primary transition hover:bg-primary/20"
                  >
                    related objects
                  </button>
                  <button
                    type="button"
                    title="Send a signed AFP message to another agent"
                    onClick={() => {
                      setFederationError("");
                      setFederationComposerOpen(true);
                    }}
                    class="rounded-full border border-teal-500/25 bg-teal-500/10 px-2.5 py-1 font-mono text-[9px] text-teal-700 transition hover:bg-teal-500/20"
                  >
                    agent to agent
                  </button>
                  <button
                    type="button"
                    title="Search messages (Ctrl+F)"
                    onClick={() => { setShowMsgSearch((v) => !v); requestAnimationFrame(() => msgSearchInputRef?.focus()); }}
                    class={`rounded-full border px-2.5 py-1 font-mono text-[9px] transition ${showMsgSearch() ? "border-primary/30 bg-primary/10 text-primary" : "border-white/30 bg-white/25 text-on-surface-variant hover:bg-white/50"}`}
                  >
                    search
                  </button>
                  <Show when={senderFilter()}>
                    <button
                      type="button"
                      onClick={() => setSenderFilter(null)}
                      title="Clear sender filter"
                      class="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[9px] text-primary transition hover:bg-primary/20"
                    >
                      {senderFilter()} x
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
            {/* Cost receipt chip */}
            <Show when={totalCostCents() > 0}>
              <div class="relative">
                <button type="button" onClick={() => setShowCostReceipt((v) => !v)}
                  class={`rounded-full border px-2.5 py-1 font-mono text-[9px] transition ${showCostReceipt() ? "border-primary/30 bg-primary/10 text-primary" : "border-white/30 bg-white/25 text-on-surface-variant/50 hover:bg-white/50"}`}>
                  {`$${(totalCostCents() / 100).toFixed(3)}`}
                </button>
                <Show when={showCostReceipt()}>
                  <div class="absolute right-0 top-full z-40 mt-1 w-64 animate-fade-in rounded-xl border border-white/45 bg-white/97 p-3 shadow-panel backdrop-blur-xl">
                    <p class="mb-2 font-mono text-[8px] uppercase tracking-[0.18em] text-outline">Cost Receipt</p>
                    <For each={messages().filter((m) => messageCostCents(m) > 0)}>
                      {(m) => (
                        <div class="flex items-center justify-between py-0.5 text-[10px]">
                          <span class="truncate font-mono text-on-surface-variant/70 max-w-[75%]">{m.type}</span>
                          <span class="font-mono text-on-surface-variant">{`$${(messageCostCents(m) / 100).toFixed(3)}`}</span>
                        </div>
                      )}
                    </For>
                    <div class="mt-1.5 border-t border-white/20 pt-1.5 flex justify-between font-mono text-[9px] font-semibold text-on-surface">
                      <span>Total</span><span>{`$${(totalCostCents() / 100).toFixed(3)}`}</span>
                    </div>
                  </div>
                </Show>
              </div>
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
              {headerCollapsed() ? "show" : "hide"}
            </button>
            <Show when={props.onBack}>
              <button
                type="button"
                onClick={props.onBack}
                class="rounded-full border border-white/40 bg-white/30 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/50"
              >
                Back
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

      {/* Load failure */}
      <Show when={!loading() && loadError() && messages().length === 0}>
        <EmptyState
          icon="TH"
          title={loadError()?.title ?? "Could not load thread"}
          body={`${loadError()?.summary ?? "This thread is unavailable right now."} ${loadError()?.nextStep ?? ""}`.trim()}
          action={
            <button
              type="button"
              onClick={() => void reload()}
              class="rounded-xl border border-rose-200/70 bg-white/80 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-white"
            >
              Retry thread
            </button>
          }
        />
      </Show>

      {/* Messages via ViewDispatcher (with generative card grouping) */}
      <Show when={!loading() && !loadError()}>
        <div class="relative">
          <Show when={refreshError()}>
            <div
              class={`mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-card ${
                refreshError()?.tone === "danger"
                  ? "border-red-200/70 bg-red-50/85 text-red-700"
                  : "border-amber-200/70 bg-amber-50/85 text-amber-800"
              }`}
            >
              <div class="space-y-1">
                <p class="font-semibold">{refreshError()?.title}</p>
                <p>{refreshError()?.summary}</p>
                <p class="text-xs opacity-80">Next step: {refreshError()?.nextStep}</p>
              </div>
              <button
                type="button"
                onClick={() => void reload({ preserveExisting: true })}
                class={`rounded-xl border bg-white/80 px-3 py-1.5 text-xs font-medium transition hover:bg-white ${
                  refreshError()?.tone === "danger"
                    ? "border-red-200/70 text-red-700"
                    : "border-amber-200/70 text-amber-800"
                }`}
              >
                Retry refresh
              </button>
            </div>
          </Show>
          <Show when={showScrollTop()}>
            <div class="absolute top-0 left-0 right-0 z-10 flex justify-center pointer-events-none animate-fade-in">
              <button
                type="button"
                class="pointer-events-auto flex items-center gap-[0.375em] rounded-full border border-white/50 bg-white/80 px-[1em] py-[0.375em] text-xs font-medium text-on-surface shadow-md backdrop-blur-sm transition hover:bg-white"
                onClick={() => { if (messagesContainerRef) messagesContainerRef.scrollTop = 0; }}
              >
                ^ top
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
                placeholder="Search messages... (Ctrl+F)"
                class="flex-1 rounded-xl border border-white/30 bg-white/30 px-4 py-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:border-primary/40"
              />
              <Show when={msgSearch()}>
                <span class="flex-shrink-0 font-mono text-[10px] text-on-surface-variant/50">
                  {threadViewRenderableEntries(filteredRenderEntries()).length} match{threadViewRenderableEntries(filteredRenderEntries()).length === 1 ? "" : "es"}
                </span>
              </Show>
              <button
                type="button"
                onClick={() => { setShowMsgSearch(false); setMsgSearch(""); }}
                class="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs text-on-surface-variant/50 transition hover:text-on-surface-variant"
              >x</button>
            </div>
          </Show>
          {/* Bookmarks minimap vertical track on right edge */}
          <Show when={starredMsgs().size > 0}>
            {(() => {
              const msgEntries = threadViewRenderableEntries(renderEntries());
              const total = msgEntries.length;
              if (total === 0) return null;
              return (
                <div class="absolute right-0 top-0 bottom-0 z-10 flex w-1.5 flex-col" title="Bookmarked messages">
                  <div class="relative flex-1 rounded-full bg-white/15">
                    <For each={msgEntries}>
                      {(entry, i) => {
                        const msgId = threadViewRenderUnitMessage(entry).id;
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
                if (entry.kind === "last_visit_divider") {
                  return (
                    <div class="flex items-center gap-3 py-1.5">
                      <div class="h-px flex-1 bg-amber-300/40" />
                      <span class="rounded-full border border-amber-300/50 bg-amber-50/80 px-3 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                        New since last visit
                      </span>
                      <div class="h-px flex-1 bg-amber-300/40" />
                    </div>
                  );
                }
                const unit = entry;
                const msg = threadViewRenderUnitMessage(unit);
                const role = senderRole(msg.from ?? "");
                const isUser = role === "user" || role === "workspace";
                const name = senderLabel(msg.from ?? "agent");
                const mentionsCurrentUser = !isUser && messageMentionsCurrentUser(msg);
                const federationStatus = federationDeliveryStatus(msg, federationReceiptSummary());
                return (
                  <div
                    class={`group space-y-1.5 rounded-2xl transition ${
                      senderCounts().length > 1 && !isUser ? senderColorClass(name) : ""
                    } ${
                      focusedMessageId() === msg.id
                        ? "bg-amber-100/70 ring-2 ring-amber-300/70 ring-offset-2 ring-offset-transparent"
                        : mentionsCurrentUser
                          ? "bg-amber-50/80 ring-1 ring-amber-300/55 ring-offset-1 ring-offset-transparent"
                          : ""
                    }`}
                    data-msg-id={msg.id}
                    tabIndex={0}
                    onFocus={() => setFocusedMessageId(msg.id)}
                    onClick={() => setFocusedMessageId(msg.id)}
                    onPointerEnter={() => setFocusedMessageId(msg.id)}
                    onContextMenu={(event) => openMessageContextMenu(event, msg.id)}
                  >
                    <div class={`flex items-center gap-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
                      <div class="relative">
                        <button
                          type="button"
                          onClick={() => !isUser && setSenderFilter((prev) => prev === name ? null : name)}
                          onMouseEnter={() => !isUser && setAgentTrustMsgId(msg.id)}
                          onMouseLeave={() => setAgentTrustMsgId(null)}
                          title={isUser ? undefined : senderFilter() === name ? "Clear sender filter" : `Filter to ${name}`}
                          class={`font-mono text-[9px] uppercase tracking-[0.16em] transition ${
                            !isUser ? "cursor-pointer hover:text-primary" : "cursor-default"
                          } ${senderFilter() === name ? "font-semibold text-primary" : "text-on-surface-variant/50"}`}
                        >
                          {isUser ? "you" : name}
                        </button>
                        <Show when={agentTrustMsgId() === msg.id && !isUser}>
                          <div class="absolute left-0 top-full z-50 mt-1 w-52 animate-fade-in rounded-2xl border border-white/45 bg-white/97 p-3 shadow-panel backdrop-blur-xl">
                            <p class="mb-1.5 font-mono text-[8px] uppercase tracking-[0.18em] text-outline">Agent Identity</p>
                            <div class="mb-2 flex gap-1">
                              {[0, 1, 2].map((i) => (
                                <div class="h-3 w-8 rounded-sm"
                                     style={`background: hsl(${(agentHue(msg.from ?? "") + i * 120) % 360}, 45%, 60%)`} />
                              ))}
                            </div>
                            <p class="break-all font-mono text-[9px] text-on-surface/80">{msg.from}</p>
                            <div class="mt-2 flex items-center gap-1.5">
                              <span class="h-1.5 w-1.5 rounded-full bg-green-400" />
                              <span class="font-mono text-[8px] text-green-600">Signed &amp; Verified</span>
                            </div>
                          </div>
                        </Show>
                      </div>
                      <Show when={!isUser}>
                        <Tip label={AFP_TYPE_DEFS[msg.type] ?? `AFP message type: ${msg.type}`} side="bottom">
                          <span class="cursor-help rounded-full border border-white/30 bg-white/25 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-on-surface-variant/40">
                            {msg.type}
                          </span>
                        </Tip>
                      </Show>
                      <Show when={messageSmtpId(msg)}>
                        {(smtpId) => <button type="button" title={`SMTP ID: ${smtpId()} - click to copy`}
                          onClick={() => navigator.clipboard.writeText(smtpId())}
                          class="rounded-full bg-amber-400/10 px-1.5 py-0.5 font-mono text-[8px] text-amber-700 transition hover:bg-amber-400/20">SMTP</button>
                        }
                      </Show>
                      <Show when={msg.timestamp}>
                        <span
                          title={absoluteUtcTimestamp(msg.timestamp)}
                          class="font-mono text-[8px] text-on-surface-variant/30"
                        >
                          {displayTimestamp(msg.timestamp)}
                        </span>
                      </Show>
                      <Show when={mentionsCurrentUser}>
                        <span class="rounded-full border border-amber-300/60 bg-amber-100/85 px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                          @you
                        </span>
                      </Show>
                      <button
                        type="button"
                        title="Copy message text"
                        onClick={() => copyMsgText(msg.content, msg.id)}
                        class="font-mono text-[0.55em] text-on-surface-variant/20 opacity-0 transition group-hover:opacity-100 hover:!text-on-surface-variant/60"
                      >
                        {copiedMsgText() === msg.id ? "OK" : "copy"}
                      </button>
                      <button
                        type="button"
                        title={`Copy message ID: ${msg.id}`}
                        onClick={() => copyMsgId(msg.id)}
                        class="font-mono text-[0.55em] text-on-surface-variant/20 opacity-0 transition group-hover:opacity-100 hover:!text-on-surface-variant/60"
                      >
                        {copiedMsgId() === msg.id ? "OK" : "id"}
                      </button>
                      <button
                        type="button"
                        title={`Copy deep link: ${messageDeepLink(msg.id)}`}
                        onClick={() => copyMessageDeepLink(msg.id)}
                        class="font-mono text-[0.55em] text-on-surface-variant/20 opacity-0 transition group-hover:opacity-100 hover:!text-primary"
                      >
                        {copiedDeepLinkId() === msg.id ? "copied" : "link"}
                      </button>
                      <button
                        type="button"
                        title="Find related objects for this message"
                        onClick={() =>
                          openObjectSearch({
                            query: buildMessageObjectSearchSeed(msg),
                            focusThreadId: props.threadId,
                            focusObjectId: msg.id,
                            launchContext: {
                              sourceLabel: "Thread message",
                              reason: `Related objects for ${msg.kind ?? "this"} message`,
                            },
                          })
                        }
                        class="font-mono text-[0.55em] text-primary/40 opacity-0 transition group-hover:opacity-100 hover:!text-primary"
                      >
                        objects
                      </button>
                      <button
                        type="button"
                        title={starredMsgs().has(msg.id) ? "Remove bookmark" : "Bookmark this message"}
                        onClick={() => toggleStar(msg.id)}
                        class={`text-[0.7em] transition ${starredMsgs().has(msg.id) ? "text-amber-400 opacity-100" : "text-on-surface-variant/20 opacity-0 group-hover:opacity-100 hover:!text-amber-400"}`}
                      >
                        {starredMsgs().has(msg.id) ? "*" : "o"}
                      </button>
                      <button
                        type="button"
                        title={collapsedMsgs().has(msg.id) ? "Expand message" : "Collapse message"}
                        onClick={() => toggleCollapse(msg.id)}
                        class="font-mono text-[0.6em] text-on-surface-variant/20 opacity-0 transition group-hover:opacity-100 hover:!text-on-surface-variant/60"
                      >
                        {collapsedMsgs().has(msg.id) ? "+" : "-"}
                      </button>
                      <Show when={!isUser && Object.keys(messageMetadata(msg) ?? {}).length > 0}>
                        <button
                          type="button"
                          title={openTraces().has(msg.id) ? "Hide intent trace" : "Show agent intent trace"}
                          onClick={() => setOpenTraces((prev) => { const next = new Set(prev); if (next.has(msg.id)) next.delete(msg.id); else next.add(msg.id); return next; })}
                          class={`font-mono text-[0.5em] transition ${openTraces().has(msg.id) ? "text-primary opacity-100" : "text-on-surface-variant/15 opacity-0 group-hover:opacity-100 hover:!text-primary"}`}
                        >meta</button>
                      </Show>
                    </div>
                    <Show when={!collapsedMsgs().has(msg.id)}>
                    <div class="content-font-body space-y-3">
                      {unit.kind === "generative_card" ? (
                        <>
                          <ViewDispatcher message={unit.card} cardUpdates={unit.updates} />
                          <Show when={props.advanced}>
                            <AlternateViewsInspector message={unit.card} cardUpdates={unit.updates} compact />
                          </Show>
                        </>
                      ) : unit.kind === "ledger_board" ? (
                        <>
                          <ViewDispatcher message={unit.message} taskUpdates={unit.taskUpdates} />
                          <Show when={props.advanced}>
                            <AlternateViewsInspector message={unit.message} compact />
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
                      <Show when={federationStatus}>
                        {(status) => (
                          <div
                            class={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                              status().tone === "failed"
                                ? "border-red-200/80 bg-red-50/80 text-red-800"
                                : status().tone === "sent"
                                  ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800"
                                  : "border-sky-200/80 bg-sky-50/80 text-sky-800"
                            }`}
                          >
                            <div class="min-w-0">
                              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.16em]">
                                {status().label}
                              </p>
                              <p class="mt-0.5 break-words">{status().detail}</p>
                            </div>
                            <Show when={status().attemptedMessageId}>
                              {(attemptedMessageId) => (
                                <div class="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    class="rounded-full border border-current/20 bg-white/60 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white"
                                    onClick={() => {
                                      const el = messagesContainerRef?.querySelector(`[data-msg-id="${attemptedMessageId()}"]`) as HTMLElement | null;
                                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                                      setFocusedMessageId(attemptedMessageId());
                                    }}
                                  >
                                    Attempt
                                  </button>
                                  <Show when={status().tone === "failed"}>
                                    <Show
                                      when={!federationReceiptSummary().acceptedAttemptIds.has(attemptedMessageId())}
                                      fallback={
                                        <span class="rounded-full border border-current/20 bg-white/60 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">
                                          Accepted
                                        </span>
                                      }
                                    >
                                      <button
                                        type="button"
                                        class="rounded-full border border-current/20 bg-white/70 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={retryingFederationAttemptId() === attemptedMessageId()}
                                        onClick={() => void retryFederatedMessage(attemptedMessageId())}
                                      >
                                        {retryingFederationAttemptId() === attemptedMessageId() ? "Retrying" : "Retry"}
                                      </button>
                                    </Show>
                                  </Show>
                                </div>
                              )}
                            </Show>
                          </div>
                        )}
                      </Show>
                      <Show when={openTraces().has(msg.id)}>
                        <div class="animate-fade-in rounded-xl border border-primary/15 bg-primary/5 p-3">
                          <p class="mb-1 font-mono text-[8px] uppercase tracking-[0.18em] text-outline">Agent intent trace</p>
                          <pre class="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[9px] text-on-surface-variant/70">{JSON.stringify(msg.metadata ?? {}, null, 2)}</pre>
                        </div>
                      </Show>
                    </div>
                    </Show>
                    {/* Supertag chips detected #tags from message content */}
                    {(() => {
                      const tags = [...new Set(
                        messageStringValues(msg)
                          .join(" ").match(/#[\w-]+/g) ?? []
                      )];
                      if (!tags.length) return null;
                      return (
                        <div class="flex flex-wrap gap-1">
                          <For each={tags}>{(tag) => (
                            <div class="relative">
                              <button type="button" onMouseEnter={() => setHoveredTag(`${msg.id}:${tag}`)} onMouseLeave={() => setHoveredTag(null)}
                                class="rounded-full bg-primary/8 px-2 py-0.5 font-mono text-[9px] text-primary transition hover:bg-primary/15">{tag}</button>
                              <Show when={hoveredTag() === `${msg.id}:${tag}`}>
                                <div class="absolute bottom-full left-0 z-50 mb-1 w-48 animate-fade-in rounded-xl border border-white/45 bg-white/97 p-2.5 shadow-panel backdrop-blur-xl">
                                  <p class="mb-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-outline">Supertag Definition</p>
                                  <p class="text-xs font-semibold text-on-surface">{tag}</p>
                                  <p class="mt-1 font-mono text-[9px] text-on-surface-variant/70">
                                    {messages().filter((m) => JSON.stringify(m.content).includes(tag)).length} uses · Auto-indexed by Curator
                                  </p>
                                </div>
                              </Show>
                            </div>
                          )}</For>
                        </div>
                      );
                    })()}
                    {/* Smart reply suggestions shown after long agent messages (>100 words) */}
                    {(() => {
                      if (isUser) return null;
                      const wc = messageWordCount(msg);
                      if (wc <= 100) return null;
                      return (
                        <div class="flex flex-wrap gap-1.5 animate-fade-in">
                          <For each={QUICK_REPLIES}>
                            {(reply) => (
                              <button
                                type="button"
                                onClick={() => applyQuickReply(reply)}
                                class="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 font-mono text-[9px] text-primary/70 transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                              >
                                {reply}
                              </button>
                            )}
                          </For>
                        </div>
                      );
                    })()}
                    {/* Reactions */}
                    <div class="flex flex-wrap items-center gap-1 min-h-[1.125rem]">
                      <For each={Object.entries(reactions()[msg.id] ?? {})}>
                        {([emoji, count]) => {
                          const key = `${msg.id}:${emoji}`;
                          const wordCount = messageWordCount(msg);
                          return (
                            <div class="relative">
                              <button type="button" onClick={() => addReaction(msg.id, emoji)}
                                onMouseEnter={() => setHoveredReaction(key)} onMouseLeave={() => setHoveredReaction(null)}
                                class="flex items-center gap-1 rounded-full border border-white/30 bg-white/25 px-2 py-0.5 text-[11px] transition hover:bg-white/45">
                                {emoji} <span class="font-mono text-[9px] text-on-surface-variant/60">{count as number}</span>
                              </button>
                              <Show when={hoveredReaction() === key}>
                                <div class="absolute bottom-full left-0 z-50 mb-1 w-44 animate-fade-in rounded-xl border border-white/45 bg-white/97 p-2.5 shadow-panel backdrop-blur-xl">
                                  <p class="font-mono text-[8px] uppercase tracking-[0.18em] text-outline mb-1">Reaction Analytics</p>
                                  <p class="font-mono text-[9px] text-on-surface-variant/70">{count as number} reaction{(count as number) === 1 ? "" : "s"}</p>
                                  <p class="font-mono text-[9px] text-on-surface-variant/70">{wordCount} words · {relativeTime(msg.timestamp)}</p>
                                </div>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                      <div class="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                        <For each={REACTIONS}>
                          {(emoji) => (
                            <button
                              type="button"
                              title={`React with ${emoji}`}
                              onClick={() => addReaction(msg.id, emoji)}
                              class="rounded-full px-1 py-0.5 text-[11px] transition hover:bg-white/40 hover:scale-110"
                            >{emoji}</button>
                          )}
                        </For>
                      </div>
                    </div>
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
                v {unseenCount() > 0 ? `${unseenCount()} new` : "Jump to latest"}
              </button>
            </div>
          </Show>
        </div>
      </Show>

      {/* Typing indicator shows contextual task label + progress bar for long-running ops */}
      <Show when={typingStartedAt() !== null}>
        <div class="space-y-1.5 px-2 py-1 animate-fade-in">
          <div class="flex items-center gap-2">
            <ProcessingGlyph class="flex-shrink-0 text-primary/55" size={18} strokeWidth={1.4} />
            <span class="font-mono text-[9px] text-on-surface-variant/50">
              {typingStatusLabel()} {formatTypingElapsed(typingElapsed())}
            </span>
          </div>
          <Show when={typingElapsed() >= 5}>
            <div class="h-0.5 overflow-hidden rounded-full bg-primary/15">
              <div class="h-full bg-primary/40 transition-all duration-1000"
                style={`width: ${Math.min(98, (typingElapsed() / 60) * 100)}%`} />
            </div>
          </Show>
        </div>
      </Show>
      <Show when={messageContextMenu()} keyed>
        {(menu) => (
          <Portal>
            <div
              class="fixed inset-0 z-[140]"
              onPointerDown={() => closeMessageContextMenu()}
              onContextMenu={(event) => {
                event.preventDefault();
                closeMessageContextMenu();
              }}
            >
              <div
                class="absolute w-56 rounded-2xl border border-white/55 bg-white/96 p-2 shadow-panel backdrop-blur-xl"
                style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
                onPointerDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
              >
                <div class="px-2 pb-2 pt-1">
                  <p class="truncate text-sm font-semibold text-on-surface">AFP message</p>
                  <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/55">{menu.msgId}</p>
                </div>
                <div class="space-y-1">
                  <button
                    type="button"
                    class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                    onClick={() => {
                      copyMessageDeepLink(menu.msgId);
                      closeMessageContextMenu();
                    }}
                  >
                    <span>Copy deep link</span>
                    <span class="font-mono text-[10px] text-on-surface-variant/55">{copiedDeepLinkId() === menu.msgId ? "copied" : "omnyid://"}</span>
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}
      </Show>
      <Show when={federationComposerOpen()}>
        <Portal>
          <div
            class="fixed inset-0 z-[150] flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-sm"
            onPointerDown={() => {
              if (!federationSending()) setFederationComposerOpen(false);
            }}
          >
            <form
              class="w-full max-w-xl rounded-2xl border border-white/55 bg-white/96 p-5 shadow-panel backdrop-blur-xl"
              onPointerDown={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                void sendFederatedMessage();
              }}
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-outline">Federation</p>
                  <h3 class="mt-1 text-lg font-semibold text-on-surface">Send agent message</h3>
                </div>
                <button
                  type="button"
                  disabled={federationSending()}
                  onClick={() => setFederationComposerOpen(false)}
                  class="rounded-full border border-white/40 bg-white/40 px-2.5 py-1 text-xs text-on-surface-variant transition hover:bg-white/70 disabled:opacity-50"
                >
                  x
                </button>
              </div>

              <label class="mt-5 block">
                <span class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/60">
                  Agent ID
                </span>
                <input
                  value={federationRecipientAgentId()}
                  onInput={(event) => {
                    setFederationRecipientAgentId(event.currentTarget.value);
                    if (federationError()) setFederationError("");
                  }}
                  placeholder="agent:alice@example.com"
                  class="mt-1 w-full rounded-xl border border-white/40 bg-white/70 px-3 py-2 font-mono text-sm text-on-surface outline-none placeholder:text-on-surface-variant/35 focus:border-teal-500/40"
                  autocomplete="off"
                  required
                />
              </label>

              <label class="mt-3 block">
                <span class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/60">
                  Subject
                </span>
                <input
                  value={federationSubject()}
                  onInput={(event) => {
                    setFederationSubject(event.currentTarget.value);
                    if (federationError()) setFederationError("");
                  }}
                  placeholder="Optional"
                  class="mt-1 w-full rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/35 focus:border-teal-500/40"
                />
              </label>
              <div
                class={`mt-1 flex justify-end font-mono text-[10px] ${
                  federationSubjectCharCount() > FEDERATION_SUBJECT_MAX_CHARS
                    ? "text-red-600"
                    : "text-on-surface-variant/45"
                }`}
              >
                {federationSubjectCharCount().toLocaleString()} / {FEDERATION_SUBJECT_MAX_CHARS.toLocaleString()}
              </div>

              <label class="mt-3 block">
                <span class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/60">
                  Message
                </span>
                <textarea
                  value={federationBody()}
                  onInput={(event) => {
                    setFederationBody(event.currentTarget.value);
                    if (federationError()) setFederationError("");
                  }}
                  placeholder="Compose the message this agent should receive."
                  class="mt-1 min-h-36 w-full resize-y rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-sm leading-6 text-on-surface outline-none placeholder:text-on-surface-variant/35 focus:border-teal-500/40"
                  required
                />
              </label>
              <div
                class={`mt-1 flex justify-end font-mono text-[10px] ${
                  federationBodyCharCount() > FEDERATION_BODY_MAX_CHARS
                    ? "text-red-600"
                    : "text-on-surface-variant/45"
                }`}
              >
                {federationBodyCharCount().toLocaleString()} / {FEDERATION_BODY_MAX_CHARS.toLocaleString()}
              </div>

              <Show when={federationError()}>
                <div class="mt-3 rounded-xl border border-red-200/70 bg-red-50/85 px-3 py-2 text-sm text-red-700">
                  {federationError()}
                </div>
              </Show>

              <div class="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={federationSending()}
                  onClick={() => setFederationComposerOpen(false)}
                  class="rounded-full border border-white/40 bg-white/35 px-4 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/70 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={federationSending() || Boolean(federationComposerValidation())}
                  class="rounded-full bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:opacity-40"
                >
                  {federationSending() ? "Sending..." : "Send message"}
                </button>
              </div>
            </form>
          </div>
        </Portal>
      </Show>

      {/* Thread knowledge mini-map */}
      <ThreadMiniMap threadId={props.threadId} readingProgress={readingProgress()} />

      {/* Reply compose box */}
      <GlassPanel class="p-4">
        <form onSubmit={(e) => { e.preventDefault(); void sendReply(); }}>
          {/* @mention agent suggestions */}
          <Show when={atSuggestions().length > 0}>
            <div class="mb-1.5 flex flex-wrap gap-1 animate-fade-in">
              <For each={atSuggestions()}>
                {(a) => (
                  <button type="button"
                    class="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[9px] text-primary transition hover:bg-primary/20"
                    onClick={() => { setReplyText((t) => t.replace(/@\w*$/, `@${a} `)); setAtQuery(null); }}>
                    @{a}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <TiptapEditor
            mode="compact"
            initialContent={replyText()}
            disabled={replySending()}
            placeholder="Reply... (@agent to route)"
            clearOnSend
            onChange={(text) => {
              setReplyText(text);
              const m = text.match(/@(\w*)$/);
              setAtQuery(m ? m[1] : null);
            }}
            onSend={async (payload) => {
              setReplyText(payload.text);
              await sendReply();
            }}
          />
          <div class="mt-3">
            <WorkspaceAssistPanel
              suggestion={replyWorkspaceAssist()}
              refreshOrigin={props.workspaceAssistRefreshOrigin}
              onOpen={openReplyWorkspaceAssist}
            />
          </div>
          <Show when={replyFailureReceipt()}>
            <div
              class={`mt-3 rounded-2xl border px-4 py-3 ${
                replyFailureReceipt()?.tone === "danger"
                  ? "border-[#f2cbc0] bg-[#fff4f0]"
                  : "border-[#f1dfb9] bg-[#fff9ee]"
              }`}
            >
              <p
                class={`text-sm font-semibold ${
                  replyFailureReceipt()?.tone === "danger" ? "text-[#b2644b]" : "text-[#8b6421]"
                }`}
              >
                {replyFailureReceipt()?.title}
              </p>
              <p
                class={`mt-1 text-xs leading-5 ${
                  replyFailureReceipt()?.tone === "danger" ? "text-[#b2644b]" : "text-[#8b6421]"
                }`}
              >
                {replyFailureReceipt()?.summary}
              </p>
              <p class="mt-2 text-xs font-medium text-on-surface-variant">
                Next step: {replyFailureReceipt()?.nextStep}
              </p>
              <p class="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/60">
                Logged in this thread
              </p>
            </div>
          </Show>
          {/* Token budget bar: green < 60%, amber < 80%, red >= 80% of 100k token limit */}
          {(() => {
            const total = threadTokenEstimate() + Math.ceil(replyText().length / 4);
            const pct = Math.min(100, (total / 100000) * 100);
            const color = pct < 60 ? "bg-green-500/50" : pct < 80 ? "bg-amber-400/60" : "bg-red-500/60";
            return (
              <div
                class="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/15"
                title={`~${total.toLocaleString()} tokens in context · ${Math.round(pct)}% of 100k limit`}
              >
                <div class={`h-full rounded-full transition-all duration-300 ${color}`} style={`width: ${pct}%`} />
              </div>
            );
          })()}
          {/* Draft preview panel */}
          <Show when={previewReply() && replyText().trim()}>
            <div class="mt-1.5 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-on-surface whitespace-pre-wrap animate-fade-in">
              <p class="mb-1 font-mono text-[8px] uppercase tracking-[0.18em] text-outline">AFP preview · note</p>
              {replyText()}
            </div>
          </Show>
          <div class="mt-2 flex items-center justify-between gap-3">
            <Show when={replyError()}>
              <span class="text-xs text-red-500">{replyError()}</span>
            </Show>
            <Show when={replySent()}>
              <span class="text-xs font-medium text-green-600">OK Sent to orchestrator</span>
            </Show>
            <Show when={replyText().length > 50}>
              <span class="font-mono text-[0.65em] tabular-nums text-on-surface-variant/40">
                {replyText().length} chars · ~{Math.round(replyText().length / 4)} tokens
              </span>
            </Show>
            <div class="flex-1" />
            <Show when={replyText().trim().length > 0}>
              <button type="button" onClick={() => setPreviewReply((v) => !v)}
                class={`rounded-full border px-2.5 py-1 font-mono text-[9px] transition ${previewReply() ? "border-primary/30 bg-primary/10 text-primary" : "border-white/30 bg-white/25 text-on-surface-variant/50 hover:bg-white/50"}`}>
                {previewReply() ? "Edit" : "Preview"}
              </button>
            </Show>
            <button
              type="submit"
              disabled={replySending() || !replyText().trim()}
              class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 transition hover:bg-primary/80"
            >
              {replySending() ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </GlassPanel>
    </div>
  );
}
