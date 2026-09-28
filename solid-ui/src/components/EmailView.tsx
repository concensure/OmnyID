import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { DashboardBootstrap } from "@/lib/api";
import {
  disconnectGmail,
  fetchGmailOAuthConfig,
  fetchGmailOAuthUrl,
  fetchGmailInboxSummary,
  fetchGmailStatus,
  orchestrateAgent,
  readSession,
  sendAfpMessage,
} from "@/lib/api";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { loadLedger } from "@/lib/profileLedger";
import { loadAgentResponseStylePayload } from "@/lib/agentResponseStyle";
import {
  guestGmailRedirectMessage,
  signedInGmailRedirectFallbackMessage,
  type GmailRedirectState,
} from "@/lib/gmailRedirectState";
import {
  gmailActionAvailabilityState,
  gmailConnectionWarningState,
  gmailOAuthConfigFailureMessage,
  type GmailConnectionStatus,
} from "@/lib/gmailConnectionState";
import { buildEmailActionFailureReceipt, type EmailActionFailureReceipt } from "@/lib/emailActionFailureState";
import {
  loadLocalEmailDrafts,
  loadLocalEmailMailboxOverrides,
  loadLocalEmailReadState,
  loadLocalGmailSyncPreference,
  persistLocalEmailDrafts,
  persistLocalEmailMailboxOverrides,
  persistLocalEmailReadState,
  persistLocalGmailSyncPreference,
  type LocalEmailDraft,
  type LocalGmailSyncPreference,
} from "@/lib/emailLocalState";
import { dashboardBootstrapMessages } from "@/lib/dashboardBootstrapState";
import { buildEmailGmailSyncUiState } from "@/lib/emailGmailSyncUiState";
import type { InboxSummary } from "@/lib/firstRunExperienceResponseState";
import {
  buildEmailItems,
  emailLabelOptions,
  emailMailboxCounts,
  emailSmartFolderCounts,
  filterEmailItems,
  initialComposerBody,
  mailboxLabel,
  MAILBOX_OPTIONS,
  relativeEmailTime,
  selectedEmailItem,
  splitQuotedEmailBody,
  unreadEmailItemCount,
  type EmailMessageCard,
  type MailboxKey,
} from "@/lib/emailViewState";
import { surfaceDateTimeLabel } from "@/lib/surfaceTimestampPresentation";

type GmailAction = "label" | "reply" | "unsubscribe" | "summary";
type ActionState = "idle" | "pending" | "done" | "error";
type ComposerTone = "short" | "thoughtful" | "direct";

const GMAIL_ACTIONS: Array<{
  id: GmailAction;
  label: string;
  description: string;
  objective: string;
}> = [
  {
    id: "label",
    label: "Auto-label",
    description: "Review messages and apply or propose labels.",
    objective:
      "Review the user's Gmail inbox, identify existing labels, and automatically label unlabelled emails. Before creating any new label categories, list proposed new labels and ask the user for approval.",
  },
  {
    id: "reply",
    label: "Draft replies",
    description: "Prepare replies for messages needing attention.",
    objective:
      "Scan the Gmail inbox for important emails that require a response. For each, draft a professional reply. Present each draft to the user for review before sending and never send without explicit approval.",
  },
  {
    id: "unsubscribe",
    label: "Unsubscribe",
    description: "Group newsletters and propose cleanup actions.",
    objective:
      "Identify mailing list and newsletter emails in the inbox. Present the full list to the user grouped by sender. For each group the user approves, trigger the unsubscribe action.",
  },
  {
    id: "summary",
    label: "Daily summary",
    description: "Summarise today's email activity into a digest.",
    objective:
      "Read today's Gmail messages and produce a concise digest: total count, key action items, important senders, and anything requiring urgent attention. Format as a structured AFP message.",
  },
];

function senderInitials(sender: string): string {
  const parts = sender
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "EM";
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[1]?.[0] ?? "" : parts[0]?.[1] ?? "";
  return `${first}${second}`.toUpperCase() || "EM";
}

function senderAvatarColor(sender: string, senderDetail?: string | null): string {
  const seedSource = (senderDetail && senderDetail.includes("@")
    ? senderDetail.split("@")[1]
    : senderDetail || sender || "omnyid").toLowerCase();
  let hash = 0;
  for (let i = 0; i < seedSource.length; i += 1) {
    hash = (hash * 31 + seedSource.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 58% 52%)`;
}


export function EmailView(props: {
  bootstrap: DashboardBootstrap | null;
  signedIn?: boolean;
}) {
  const sessionUserId = readSession()?.user?.id ?? null;
  const [gmailStatus, setGmailStatus] = createSignal<GmailConnectionStatus | null>(null);
  const [connecting, setConnecting] = createSignal(false);
  const [disconnecting, setDisconnecting] = createSignal(false);
  const [actionStates, setActionStates] = createSignal<Partial<Record<GmailAction, ActionState>>>({});
  const [writeLikeMe, setWriteLikeMe] = createSignal(false);
  const [profilingEnabled, setProfilingEnabledState] = createSignal(false);
  const [connectError, setConnectError] = createSignal<string | null>(null);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [selectedMailbox, setSelectedMailbox] = createSignal<MailboxKey>("inbox");
  const [selectedSmartFolder, setSelectedSmartFolder] = createSignal<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = createSignal<string | null>(null);
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [composerSubject, setComposerSubject] = createSignal("");
  const [composerBody, setComposerBody] = createSignal("");
  const [composerTone, setComposerTone] = createSignal<ComposerTone>("short");
  const [composerSaving, setComposerSaving] = createSignal(false);
  const [statusLoadError, setStatusLoadError] = createSignal<string | null>(null);
  const [localDrafts, setLocalDrafts] = createSignal<LocalEmailDraft[]>(loadLocalEmailDrafts(sessionUserId));
  const [readMessageIds, setReadMessageIds] = createSignal<Set<string>>(loadLocalEmailReadState(sessionUserId));
  const [mailboxOverrides, setMailboxOverrides] = createSignal<Record<string, MailboxKey>>(loadLocalEmailMailboxOverrides(sessionUserId));
  const [gmailSyncPreference, setGmailSyncPreference] =
    createSignal<LocalGmailSyncPreference>(loadLocalGmailSyncPreference(sessionUserId));
  const [gmailInboxSummary, setGmailInboxSummary] = createSignal<InboxSummary | null>(null);
  const [gmailInboxSummaryLoading, setGmailInboxSummaryLoading] = createSignal(false);
  const [gmailInboxSummaryError, setGmailInboxSummaryError] = createSignal<string | null>(null);
  const [composerFeedback, setComposerFeedback] = createSignal<string | null>(null);
  const [expandedQuotedThreads, setExpandedQuotedThreads] = createSignal<Record<string, boolean>>({});
  const [lastActionFailureReceipt, setLastActionFailureReceipt] = createSignal<{
    threadId: string;
    receipt: EmailActionFailureReceipt;
  } | null>(null);

  async function loadGmailStatus() {
    setStatusLoadError(null);
    const status = await fetchGmailStatus();
    setGmailStatus(status);
    return status;
  }

  onMount(async () => {
    const ledger = await loadLedger();
    setProfilingEnabledState(ledger.profiling_enabled);
  });

  onMount(async () => {
    if (!props.signedIn) {
      setGmailStatus({ connected: false, gmail_email: "", configured: true });
      return;
    }
    try {
      await loadGmailStatus();
    } catch (error: unknown) {
      setStatusLoadError(error instanceof Error ? error.message : "Failed to load Gmail connection status.");
    }
  });

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailRedirectState = params.get("gmail") as GmailRedirectState | null;
    if (!gmailRedirectState) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (!props.signedIn) {
      setConnectError(guestGmailRedirectMessage(gmailRedirectState));
      return;
    }
    if (gmailRedirectState === "connected") {
      setConnectError(null);
      void loadGmailStatus()
        .then((status) => {
          if (!status.connected) {
            setConnectError(signedInGmailRedirectFallbackMessage("connected"));
          }
        })
        .catch((error: unknown) => {
          setStatusLoadError(error instanceof Error ? error.message : "Failed to refresh Gmail connection status.");
          setConnectError(signedInGmailRedirectFallbackMessage("connected"));
        });
      return;
    }
    setConnectError(signedInGmailRedirectFallbackMessage(gmailRedirectState));
  });

  function setAction(id: GmailAction, state: ActionState) {
    setActionStates((prev) => ({ ...prev, [id]: state }));
  }

  async function runGmailAction(action: (typeof GMAIL_ACTIONS)[number]) {
    if (gmailActionAvailability()?.blocking) {
      if (props.signedIn) {
        await connectGmail();
      } else {
        setConnectError("Sign in and reconnect Gmail before running inbox actions.");
      }
      return;
    }
    if (actionStates()[action.id] === "pending") return;
    setAction(action.id, "pending");
    setLastActionFailureReceipt((prev) =>
      prev?.threadId === selectedItem()?.threadId ? null : prev,
    );
    try {
      let bodyJson: Record<string, unknown> = { objective: action.objective };
      if (action.id === "reply" && writeLikeMe()) {
        bodyJson = {
          objective: action.objective,
          ...(await loadAgentResponseStylePayload()),
        };
      }
      await orchestrateAgent(bodyJson as { objective: string } & Record<string, unknown>);
      setAction(action.id, "done");
    } catch (error: unknown) {
      setAction(action.id, "error");
      const selected = selectedItem();
      const errorMessage = error instanceof Error ? error.message : "The inbox action failed before the agent could finish it.";
      const receipt = buildEmailActionFailureReceipt(action.label, errorMessage, gmailStatus());
      setLastActionFailureReceipt(
        selected
          ? {
            threadId: selected.threadId,
            receipt,
          }
          : null,
      );
      if (selected && props.signedIn) {
        try {
          await sendAfpMessage({
            thread_id: selected.threadId,
            parent_id: selected.message.id,
            from: "agent:email-support@omnyid.com",
            to: [],
            type: "note",
            subtype: "agent_action_failure",
            content: {
              title: receipt.title,
              body: `${receipt.summary} ${receipt.nextStep}`,
              action_label: action.label,
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
            references: [
              { id: selected.message.id, rel: "source_email" },
            ],
            metadata: {
              origin: "email_agent_action_failure",
              source_message_id: selected.message.id,
              source_thread_id: selected.threadId,
              action_id: action.id,
              action_label: action.label,
              failure_tone: receipt.tone,
              raw_error_message: errorMessage,
            },
            store_in_relational: true,
          });
        } catch {
          // Keep the inline failure receipt even when logging back into the thread fails.
        }
      }
      if (props.signedIn) {
        void loadGmailStatus().catch(() => undefined);
      }
      setTimeout(() => setAction(action.id, "idle"), 3000);
    }
  }

  async function connectGmail() {
    if (!props.signedIn) {
      setConnectError("Please sign in to your OmnyID account first, then connect Gmail.");
      return;
    }
    setConnecting(true);
    setConnectError(null);
    try {
      const url = await fetchGmailOAuthUrl();
      window.location.href = url;
    } catch {
      try {
        const config = await fetchGmailOAuthConfig();
        setConnectError(gmailOAuthConfigFailureMessage(config));
      } catch {
        setConnectError(gmailOAuthConfigFailureMessage(null));
      }
      setConnecting(false);
    }
  }

  async function disconnectConnectedGmail() {
    if (!props.signedIn || disconnecting()) return;
    setDisconnecting(true);
    setConnectError(null);
    try {
      await disconnectGmail();
      setGmailStatus((prev) => ({
        connected: false,
        gmail_email: "",
        configured: prev?.configured ?? true,
      }));
      setConnectError("Gmail was disconnected from this workspace.");
    } catch (error: unknown) {
      setConnectError(error instanceof Error ? error.message : "Failed to disconnect Gmail.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function saveComposerDraft(bodyOverride?: string) {
    if (composerSaving()) return;
    const subject = composerSubject().trim();
    const body = (bodyOverride ?? composerBody()).trim();
    if (!subject && !body) {
      setComposerFeedback("Add a subject or draft body before saving.");
      return;
    }
    setComposerSaving(true);
    try {
      const now = new Date().toISOString();
      const draft: LocalEmailDraft = {
        id: `local-draft-${Date.now()}`,
        threadId: `thread:local-draft:${Date.now()}`,
        sender: "You",
        senderDetail: "Local shell draft",
        subject: subject || "Untitled draft",
        preview: body.slice(0, 180) || "Draft saved locally.",
        body,
        timestamp: now,
        supertags: composerTone() === "thoughtful" ? ["Tone:Thoughtful"] : composerTone() === "direct" ? ["Tone:Direct"] : ["Tone:Short"],
      };
      const next = [draft, ...localDrafts()];
      setLocalDrafts(next);
      persistLocalEmailDrafts(next, sessionUserId);
      setComposerFeedback("Draft saved locally in Drafts.");
      setComposerOpen(false);
      setSelectedMailbox("drafts");
      setSelectedSmartFolder(null);
      setSelectedMessageId(draft.id);
    } catch (error: unknown) {
      setComposerFeedback(error instanceof Error ? error.message : "Could not save this draft locally.");
    } finally {
      setComposerSaving(false);
    }
  }

  function handleComposerSubmitShortcut(event: KeyboardEvent) {
    if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    void saveComposerDraft();
  }

  function markMessagesRead(messageIds: string[]) {
    if (!messageIds.length) return;
    setReadMessageIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of messageIds) {
        if (next.has(id)) continue;
        next.add(id);
        changed = true;
      }
      if (changed) persistLocalEmailReadState(next, sessionUserId);
      return changed ? next : prev;
    });
  }

  function markVisibleMessagesRead() {
    const unreadVisibleIds = filteredItems()
      .filter((item) => item.unread)
      .map((item) => item.id);
    if (!unreadVisibleIds.length) return;
    markMessagesRead(unreadVisibleIds);
    setComposerFeedback(`Marked ${unreadVisibleIds.length} visible email${unreadVisibleIds.length === 1 ? "" : "s"} as read.`);
  }

  function moveMessageToMailbox(messageId: string, targetMailbox: MailboxKey) {
    const item = emailItems().find((entry) => entry.id === messageId);
    if (!item || item.mailbox === targetMailbox) return;
    setMailboxOverrides((prev) => {
      const next = { ...prev, [messageId]: targetMailbox };
      persistLocalEmailMailboxOverrides(next, sessionUserId);
      return next;
    });
    if (targetMailbox !== "trash") {
      markMessagesRead([messageId]);
    }
    setSelectedMailbox(targetMailbox);
    setSelectedSmartFolder(null);
    setComposerFeedback(
      targetMailbox === "archive"
        ? `Moved "${item.subject}" to Archive.`
        : `Moved "${item.subject}" to Trash.`,
    );
  }

  function updateGmailSyncPreference(preference: LocalGmailSyncPreference) {
    setGmailSyncPreference(preference);
    persistLocalGmailSyncPreference(preference, sessionUserId);
    setComposerFeedback(
      preference === "full_inbox"
        ? "Gmail preference saved: Full inbox."
        : "Gmail preference saved: New mail only.",
    );
  }

  function handleMailboxShortcut(event: KeyboardEvent) {
    if (composerOpen()) return;
    const target = event.target as HTMLElement | null;
    if (
      target
      && (target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.isContentEditable
        || target.closest("[contenteditable='true']"))
    ) {
      return;
    }
    const item = selectedItem();
    if (!item) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "e" || event.key === "E") {
      event.preventDefault();
      moveMessageToMailbox(item.id, "archive");
      return;
    }
    if (event.key === "#") {
      event.preventDefault();
      moveMessageToMailbox(item.id, "trash");
    }
  }

  const emailItems = createMemo(() =>
    buildEmailItems({
      messages: dashboardBootstrapMessages(props.bootstrap),
      localDrafts: localDrafts(),
      mailboxOverrides: mailboxOverrides(),
      readMessageIds: readMessageIds(),
    }),
  );

  const labelOptions = createMemo(() =>
    emailLabelOptions(emailItems()),
  );

  const smartFolderCounts = createMemo(() =>
    emailSmartFolderCounts(emailItems()),
  );

  const mailboxCounts = createMemo(() =>
    emailMailboxCounts(emailItems()),
  );

  const filteredItems = createMemo(() =>
    filterEmailItems({
      items: emailItems(),
      selectedMailbox: selectedMailbox(),
      selectedSmartFolder: selectedSmartFolder(),
      query: searchQuery(),
    }),
  );

  const unreadVisibleCount = createMemo(() =>
    unreadEmailItemCount(filteredItems()),
  );

  createEffect(() => {
    const items = filteredItems();
    const selectedId = selectedMessageId();
    if (!items.length) {
      setSelectedMessageId(null);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedMessageId(items[0]?.id ?? null);
    }
  });

  const selectedItem = createMemo(() => selectedEmailItem(filteredItems(), selectedMessageId()));
  const selectedQuotedSegment = createMemo(() => splitQuotedEmailBody(selectedItem()?.body ?? ""));
  const isDemo = createMemo(() => !props.signedIn);

  createEffect(() => {
    const item = selectedItem();
    if (!item?.unread) return;
    markMessagesRead([item.id]);
  });

  const gmailConnectionWarning = createMemo(() =>
    gmailConnectionWarningState(gmailStatus()),
  );
  const gmailActionAvailability = createMemo(() =>
    gmailActionAvailabilityState(gmailStatus()),
  );
  const gmailSyncUi = createMemo(() =>
    buildEmailGmailSyncUiState({
      connected: gmailStatus(),
      preference: gmailSyncPreference(),
      summary: gmailInboxSummary(),
      loading: gmailInboxSummaryLoading(),
      error: gmailInboxSummaryError(),
    }),
  );

  async function refreshGmailInboxSummary() {
    if (!gmailStatus()?.connected || gmailInboxSummaryLoading()) return;
    setGmailInboxSummaryLoading(true);
    setGmailInboxSummaryError(null);
    try {
      setGmailInboxSummary(await fetchGmailInboxSummary());
    } catch (error: unknown) {
      setGmailInboxSummaryError(error instanceof Error ? error.message : "Could not check Gmail right now.");
    } finally {
      setGmailInboxSummaryLoading(false);
    }
  }

  function openComposer(prefill?: EmailMessageCard | null) {
    const source = prefill ?? selectedItem();
    setComposerFeedback(null);
    setComposerSubject(source ? `Re: ${source.subject}` : "");
    setComposerBody(initialComposerBody(source ?? null));
    setComposerTone(writeLikeMe() ? "thoughtful" : "short");
    setComposerOpen(true);
  }

  const selectedReferences = createMemo(() =>
    (selectedItem()?.message.references ?? []).slice(0, 6),
  );

  return (
    <div
      tabIndex={0}
      onKeyDown={handleMailboxShortcut}
      class="relative flex h-full min-h-[42rem] flex-col overflow-hidden rounded-[28px] border border-[#eadfd7] bg-[#fffaf6] shadow-[0_20px_60px_rgba(43,33,24,0.08)] outline-none"
    >
      <div class="flex min-h-14 flex-wrap items-center gap-3 border-b border-[#eadfd7] px-4 py-3 sm:px-5">
        <div class="min-w-0 flex-1">
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9b8f84]">Email workspace</p>
          <div class="mt-1 flex items-center gap-2">
            <h2 class="truncate text-[1.05rem] font-semibold text-[#1f1a17]">Inbox</h2>
            <span class="rounded-full border border-[#eadfd7] bg-white px-2 py-0.5 text-[11px] text-[#7d7065]">
              {filteredItems().length} visible
            </span>
            <Show when={isDemo()}>
              <span class="rounded-full border border-[#f2cbc0] bg-[#fff4f0] px-2 py-0.5 text-[11px] text-[#b2644b]">
                Demo preview
              </span>
            </Show>
          </div>
        </div>
        <div class="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xl">
          <div class="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-[#eadfd7] bg-white px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <svg aria-hidden viewBox="0 0 16 16" class="h-4 w-4 text-[#9b8f84]">
              <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M10.5 10.5 14 14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" />
            </svg>
            <input
              value={searchQuery()}
              onInput={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="Search sender, subject, labels, or supertags"
              class="min-w-0 flex-1 bg-transparent text-sm text-[#1f1a17] outline-none placeholder:text-[#9b8f84]"
            />
          </div>
          <button
            type="button"
            onClick={() => openComposer()}
            class="inline-flex min-h-11 items-center justify-center rounded-full bg-[#ff6b35] px-4 text-sm font-semibold text-white transition hover:bg-[#ef5a25]"
          >
            {isDemo() ? "New draft" : "New email"}
          </button>
        </div>
      </div>

      <Show when={isDemo()}>
        <div class="border-b border-[#f2cbc0] bg-[#fff4f0] px-4 py-3 sm:px-5">
          <p class="text-sm leading-6 text-[#b2644b]">
            You're viewing a <span class="font-semibold">sample inbox preview</span> in guest mode.
            Sign in to replace these cards with your real AFP-derived or Gmail-connected email state.
          </p>
        </div>
      </Show>

      <Show when={statusLoadError()}>
        <div class="border-b border-[#f2cbc0] bg-[#fff4f0] px-4 py-3 sm:px-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-[#b2644b]">{statusLoadError()}</p>
            <button
              type="button"
              onClick={() =>
                void loadGmailStatus().catch((error: unknown) => {
                  setStatusLoadError(error instanceof Error ? error.message : "Failed to load Gmail connection status.");
                })
              }
              class="inline-flex min-h-10 items-center rounded-full border border-[#f2cbc0] bg-white px-3 text-sm text-[#b2644b] transition hover:border-[#ddb29f]"
            >
              Retry status
            </button>
          </div>
        </div>
      </Show>

      <Show when={composerFeedback()}>
        <div class="border-b border-[#eadfd7] bg-[#fff8f4] px-4 py-3 sm:px-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-[#8b5a44]">{composerFeedback()}</p>
            <button
              type="button"
              onClick={() => setComposerFeedback(null)}
              class="inline-flex min-h-10 items-center rounded-full border border-[#eadfd7] bg-white px-3 text-sm text-[#6d6158] transition hover:border-[#d9c8bc]"
            >
              Dismiss
            </button>
          </div>
        </div>
      </Show>

      <div class="flex flex-wrap items-center gap-2 border-b border-[#f1e7df] px-4 py-3 sm:px-5">
        <For each={MAILBOX_OPTIONS}>
          {(option) => (
            <button
              type="button"
              onClick={() => {
                setSelectedMailbox(option.key);
                setSelectedSmartFolder(null);
              }}
              class={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition ${
                selectedMailbox() === option.key
                  ? "border-[#ff6b35] bg-[#fff0ea] text-[#ff6b35]"
                  : "border-[#eadfd7] bg-white text-[#6d6158] hover:border-[#d9c8bc]"
              }`}
            >
              <span>{option.label}</span>
              <span class="rounded-full bg-black/5 px-2 py-0.5 text-[11px]">
                {mailboxCounts().find((entry) => entry.key === option.key)?.count ?? 0}
              </span>
            </button>
          )}
        </For>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)_20rem]">
        <aside class="border-b border-[#eadfd7] bg-white/70 px-4 py-4 lg:border-b-0 lg:border-r lg:px-3">
          <div class="space-y-5">
            <section>
              <p class="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b8f84]">Folders</p>
              <div class="space-y-1.5">
                <For each={mailboxCounts()}>
                  {(entry) => (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMailbox(entry.key);
                        setSelectedSmartFolder(null);
                      }}
                      class={`flex min-h-11 w-full items-center justify-between rounded-2xl px-3 text-left text-sm transition ${
                        selectedMailbox() === entry.key && !selectedSmartFolder()
                          ? "bg-[#fff0ea] text-[#ff6b35]"
                          : "text-[#2c241f] hover:bg-[#f8f2ee]"
                      }`}
                    >
                      <span>{entry.label}</span>
                      <span class="text-xs text-[#8b7d72]">{entry.count}</span>
                    </button>
                  )}
                </For>
              </div>
            </section>

            <Show when={smartFolderCounts().length > 0}>
              <section>
                <p class="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b8f84]">Smart folders</p>
                <div class="space-y-1.5">
                  <For each={smartFolderCounts()}>
                    {(entry) => (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMailbox("inbox");
                          setSelectedSmartFolder(entry.id);
                        }}
                        class={`flex min-h-11 w-full items-center justify-between rounded-2xl px-3 text-left text-sm transition ${
                          selectedSmartFolder() === entry.id
                            ? "bg-[#fff0ea] text-[#ff6b35]"
                            : "text-[#2c241f] hover:bg-[#f8f2ee]"
                        }`}
                      >
                        <span>{entry.label}</span>
                        <span class="text-xs text-[#8b7d72]">{entry.count}</span>
                      </button>
                    )}
                  </For>
                </div>
              </section>
            </Show>

            <Show when={labelOptions().length > 0}>
              <section>
                <p class="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b8f84]">Labels</p>
                <div class="flex flex-wrap gap-2">
                  <For each={labelOptions()}>
                    {(label) => (
                      <span class="rounded-full border border-[#eadfd7] bg-[#fffaf6] px-2.5 py-1 text-xs text-[#6d6158]">
                        {label}
                      </span>
                    )}
                  </For>
                </div>
              </section>
            </Show>
          </div>
        </aside>

        <main class="min-h-0 border-b border-[#eadfd7] bg-[#fffdfb] lg:border-b-0 lg:border-r">
          <div class="flex h-full min-h-0 flex-col">
            <div class="border-b border-[#f1e7df] px-4 py-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b8f84]">
                    {selectedSmartFolder()
                      ? `${smartFolderCounts().find((entry) => entry.id === selectedSmartFolder())?.label ?? "Smart folder"} lens`
                      : `${mailboxLabel(selectedMailbox())} list`}
                  </p>
                  <p class="mt-1 text-sm text-[#6d6158]">
                    <Show
                      when={selectedSmartFolder()}
                      fallback={isDemo()
                        ? `Browse sample ${mailboxLabel(selectedMailbox()).toLowerCase()} messages in demo mode.`
                        : `Browse ${mailboxLabel(selectedMailbox()).toLowerCase()} messages with AFP-backed fallback metadata.`}
                    >
                      Focused slice of inbox work surfaced from existing labels, supertags, and message cues.
                    </Show>
                  </p>
                  <Show when={!isDemo()}>
                    <p class="mt-2 max-w-2xl text-xs leading-5 text-[#8b7d72]">
                      Read state plus Archive and Trash actions in this workspace are currently <span class="font-medium text-[#6d6158]">local mailbox organization controls</span>. Gmail connection improves inbox visibility, but these controls do not yet guarantee remote Gmail folder mutation.
                    </p>
                  </Show>
                </div>
                <Show when={unreadVisibleCount() > 0}>
                  <button
                    type="button"
                    onClick={markVisibleMessagesRead}
                    class="inline-flex min-h-10 items-center rounded-full border border-[#eadfd7] bg-white px-3 text-sm text-[#6d6158] transition hover:border-[#d9c8bc] hover:text-[#1f1a17]"
                    title="Mark all currently visible emails as read"
                  >
                    Mark all as read
                  </button>
                </Show>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <Show
                when={filteredItems().length > 0}
                fallback={
                  <div class="rounded-[22px] border border-dashed border-[#ddcec1] bg-white px-5 py-10 text-center text-sm text-[#7d7065]">
                    <p>
                      {isDemo()
                        ? "No sample email messages match this demo view yet."
                        : "No email messages match this view yet. Connect Gmail or ask the agent to summarise your inbox."}
                    </p>
                    <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => openComposer()}
                        class="inline-flex min-h-10 items-center rounded-full bg-[#ff6b35] px-3 text-xs font-semibold text-white transition hover:bg-[#ef5a25]"
                      >
                        {isDemo() ? "New draft" : "New email"}
                      </button>
                    </div>
                  </div>
                }
              >
                <div class="space-y-2">
                  <For each={filteredItems()}>
                    {(item) => (
                      <button
                        type="button"
                        onClick={() => setSelectedMessageId(item.id)}
                        class={`w-full rounded-[22px] border bg-white px-4 py-4 text-left shadow-[0_10px_28px_rgba(43,33,24,0.04)] transition ${
                          selectedMessageId() === item.id
                            ? "border-[#ff6b35] bg-[#fff8f4]"
                            : "border-[#eadfd7] hover:border-[#d9c8bc] hover:bg-[#fffdfa]"
                        }`}
                      >
                        <div class="flex items-start gap-3">
                          <div class="relative mt-0.5 flex-shrink-0">
                            <div
                              class="flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-semibold text-white shadow-[0_6px_18px_rgba(43,33,24,0.12)]"
                              style={{ background: senderAvatarColor(item.sender, item.senderDetail) }}
                              aria-hidden="true"
                            >
                              {senderInitials(item.sender)}
                            </div>
                            <div class={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${item.unread ? "bg-[#ff6b35]" : "bg-[#d9c8bc]"}`} />
                          </div>
                          <div class="min-w-0 flex-1">
                            <div class="flex items-start justify-between gap-3">
                              <div class="min-w-0">
                                <p class="truncate text-sm font-semibold text-[#1f1a17]">
                                  {item.sender}
                                  <Show when={item.senderDetail}>
                                    <span class="ml-1.5 text-xs font-normal text-[#8b7d72]">{item.senderDetail}</span>
                                  </Show>
                                </p>
                                <h3 class="mt-0.5 truncate text-[0.96rem] font-semibold text-[#2c241f]">
                                  {item.subject}
                                </h3>
                              </div>
                              <span class="whitespace-nowrap text-xs text-[#8b7d72]">{relativeEmailTime(item.timestamp)}</span>
                            </div>
                            <p class="content-font-body mt-2 line-clamp-2 text-sm leading-6 text-[#6d6158]">{item.preview}</p>
                            <div class="mt-3 flex flex-wrap gap-2">
                              <Show when={item.requiresApproval}>
                                <span class="rounded-full border border-[#ffd2c2] bg-[#fff0ea] px-2.5 py-1 text-[11px] font-medium text-[#ff6b35]">
                                  Approval
                                </span>
                              </Show>
                              <Show when={item.actionable}>
                                <span class="rounded-full border border-[#eadfd7] bg-[#f8f2ee] px-2.5 py-1 text-[11px] text-[#6d6158]">
                                  Needs attention
                                </span>
                              </Show>
                              <For each={item.supertags.slice(0, 2)}>
                                {(tag) => (
                                  <span class="rounded-full border border-[#eadfd7] bg-white px-2.5 py-1 text-[11px] text-[#6d6158]">
                                    {tag}
                                  </span>
                                )}
                              </For>
                              <For each={item.labels.slice(0, 2)}>
                                {(label) => (
                                  <span class="rounded-full border border-[#eadfd7] bg-white px-2.5 py-1 text-[11px] text-[#8b7d72]">
                                    {label}
                                  </span>
                                )}
                              </For>
                            </div>
                          </div>
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </main>

        <aside class="min-h-0 bg-white/75">
          <div class="flex h-full min-h-0 flex-col">
            <div class="border-b border-[#f1e7df] px-4 py-4">
              <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b8f84]">Preview and support</p>
              <h3 class="mt-1 text-sm font-semibold text-[#1f1a17]">
                {selectedItem()?.subject ?? "Email support rail"}
              </h3>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <Show
                when={selectedItem()}
                fallback={
                  <div class="rounded-[22px] border border-dashed border-[#ddcec1] bg-white px-4 py-8 text-center text-sm text-[#7d7065]">
                    Select an email to inspect the thread, related cues, and agent support.
                  </div>
                }
              >
                {(item) => (
                  <div class="space-y-4">
                    <section class="rounded-[22px] border border-[#eadfd7] bg-white p-4 shadow-[0_10px_24px_rgba(43,33,24,0.04)]">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="text-sm font-semibold text-[#1f1a17]">{item().sender}</p>
                          <p class="mt-0.5 text-xs text-[#8b7d72]">{item().senderDetail ?? "AFP email source"}</p>
                        </div>
                        <span class="text-xs text-[#8b7d72]">
                          {surfaceDateTimeLabel(item().timestamp) || item().timestamp}
                        </span>
                      </div>
                      <h4 class="mt-3 text-[1rem] font-semibold leading-6 text-[#1f1a17]">{item().subject}</h4>
                      <div class="mt-3 space-y-3">
                        <p class="content-font-body whitespace-pre-wrap text-sm leading-7 text-[#433730]">
                          {selectedQuotedSegment().primaryBody}
                        </p>
                        <Show when={selectedQuotedSegment().quotedBody}>
                          <div class="rounded-2xl border border-[#eadfd7] bg-[#fcf7f3]">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedQuotedThreads((prev) => ({
                                  ...prev,
                                  [item().id]: !prev[item().id],
                                }))
                              }
                              class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#f8f0ea]"
                            >
                              <span class="text-sm font-medium text-[#6d6158]">
                                {expandedQuotedThreads()[item().id]
                                  ? "Hide previous messages"
                                  : `Show ${selectedQuotedSegment().hiddenMessageCount} previous message${selectedQuotedSegment().hiddenMessageCount === 1 ? "" : "s"}`}
                              </span>
                              <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b8f84]">
                                {expandedQuotedThreads()[item().id] ? "Collapse" : "Expand"}
                              </span>
                            </button>
                            <Show when={expandedQuotedThreads()[item().id]}>
                              <div class="border-t border-[#eadfd7] px-4 py-3">
                                <p class="content-font-body whitespace-pre-wrap text-sm leading-7 text-[#7d7065]">
                                  {selectedQuotedSegment().quotedBody}
                                </p>
                              </div>
                            </Show>
                          </div>
                        </Show>
                      </div>
                      <div class="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openComposer(item())}
                          class="inline-flex min-h-11 items-center rounded-full bg-[#ff6b35] px-4 text-sm font-semibold text-white transition hover:bg-[#ef5a25]"
                        >
                          Reply
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMailbox("drafts");
                            setSelectedSmartFolder(null);
                          }}
                          class="inline-flex min-h-11 items-center rounded-full border border-[#eadfd7] bg-white px-4 text-sm text-[#6d6158] transition hover:border-[#d9c8bc]"
                        >
                          Open drafts
                        </button>
                      </div>
                    </section>

                    <section class="rounded-[22px] border border-[#eadfd7] bg-white p-4 shadow-[0_10px_24px_rgba(43,33,24,0.04)]">
                      <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b8f84]">Thread context</p>
                      <div class="mt-3 flex flex-wrap gap-2">
                        <span class="rounded-full border border-[#eadfd7] bg-[#fffaf6] px-2.5 py-1 text-[11px] text-[#6d6158]">
                          {mailboxLabel(item().mailbox)}
                        </span>
                        <For each={item().supertags}>
                          {(tag) => (
                            <span class="rounded-full border border-[#eadfd7] bg-[#fffaf6] px-2.5 py-1 text-[11px] text-[#6d6158]">
                              {tag}
                            </span>
                          )}
                        </For>
                        <For each={item().labels}>
                          {(label) => (
                            <span class="rounded-full border border-[#eadfd7] bg-white px-2.5 py-1 text-[11px] text-[#8b7d72]">
                              {label}
                            </span>
                          )}
                        </For>
                      </div>
                      <Show when={selectedReferences().length > 0}>
                        <div class="mt-4 space-y-2">
                          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-[#9b8f84]">Related references</p>
                          <For each={selectedReferences()}>
                            {(reference) => (
                              <div class="rounded-2xl border border-[#eadfd7] bg-[#fffaf6] px-3 py-2 text-sm text-[#6d6158]">
                                <div class="font-medium text-[#2c241f]">{reference.label ?? reference.type}</div>
                                <div class="mt-0.5 text-xs text-[#8b7d72]">{reference.target}</div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </section>

                    <section class="rounded-[22px] border border-[#eadfd7] bg-white p-4 shadow-[0_10px_24px_rgba(43,33,24,0.04)]">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b8f84]">Agent actions</p>
                          <p class="mt-1 text-sm text-[#6d6158]">Asynchronous inbox support, not the main surface.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWriteLikeMe((value) => !value)}
                          class={`inline-flex min-h-10 items-center rounded-full border px-3 text-xs font-medium transition ${
                            writeLikeMe()
                              ? "border-[#ff6b35] bg-[#fff0ea] text-[#ff6b35]"
                              : "border-[#eadfd7] bg-white text-[#6d6158]"
                          }`}
                        >
                          Write like me
                        </button>
                      </div>
                      <Show when={writeLikeMe()}>
                        <p class="mt-2 text-xs leading-5 text-[#8b7d72]">
                          Draft replies will use your manual voice profile.
                          <Show when={!profilingEnabled()}> Profiling is still disabled in Profile Ledger.</Show>
                        </p>
                      </Show>
                      <Show when={gmailActionAvailability()}>
                        {(availability) => (
                          <div
                            class={`mt-3 rounded-2xl border px-3 py-3 ${
                              availability().tone === "danger"
                                ? "border-[#f2cbc0] bg-[#fff4f0]"
                                : availability().tone === "warning"
                                  ? "border-[#f1dfb9] bg-[#fff9ee]"
                                  : "border-[#eadfd7] bg-[#fffaf6]"
                            }`}
                          >
                            <div class="flex flex-wrap items-start justify-between gap-3">
                              <div class="min-w-0">
                                <p
                                  class={`text-xs font-semibold uppercase tracking-[0.12em] ${
                                    availability().tone === "danger"
                                      ? "text-[#b2644b]"
                                      : availability().tone === "warning"
                                        ? "text-[#8b6421]"
                                        : "text-[#6d6158]"
                                  }`}
                                >
                                  {availability().summary}
                                </p>
                                <p
                                  class={`mt-1 text-xs leading-5 ${
                                    availability().tone === "danger"
                                      ? "text-[#b2644b]"
                                      : availability().tone === "warning"
                                        ? "text-[#8b6421]"
                                        : "text-[#7d7065]"
                                  }`}
                                >
                                  {availability().detail}
                                </p>
                              </div>
                              <Show when={availability().actionLabel}>
                                <button
                                  type="button"
                                  disabled={connecting()}
                                  onClick={() => void connectGmail()}
                                  class="inline-flex min-h-10 items-center rounded-full border border-current/15 bg-white px-3 text-xs font-semibold text-[#6d6158] transition hover:border-current/30 disabled:opacity-60"
                                >
                                  {connecting() ? "Reconnecting..." : availability().actionLabel}
                                </button>
                              </Show>
                            </div>
                          </div>
                        )}
                      </Show>
                      <div class="mt-3 space-y-2">
                        <Show when={lastActionFailureReceipt()?.threadId === item().threadId && lastActionFailureReceipt()}>
                          <div
                            class={`rounded-2xl border px-3 py-3 ${
                              lastActionFailureReceipt()?.receipt.tone === "danger"
                                ? "border-[#f2cbc0] bg-[#fff4f0]"
                                : "border-[#f1dfb9] bg-[#fff9ee]"
                            }`}
                          >
                            <p
                              class={`text-sm font-semibold ${
                                lastActionFailureReceipt()?.receipt.tone === "danger" ? "text-[#b2644b]" : "text-[#8b6421]"
                              }`}
                            >
                              {lastActionFailureReceipt()?.receipt.title}
                            </p>
                            <p
                              class={`mt-1 text-xs leading-5 ${
                                lastActionFailureReceipt()?.receipt.tone === "danger" ? "text-[#b2644b]" : "text-[#8b6421]"
                              }`}
                            >
                              {lastActionFailureReceipt()?.receipt.summary}
                            </p>
                            <p class="mt-2 text-xs font-medium text-[#6d6158]">
                              Next step: {lastActionFailureReceipt()?.receipt.nextStep}
                            </p>
                            <p class="mt-2 text-[11px] uppercase tracking-[0.12em] text-[#8b7d72]">
                              Logged in this thread
                            </p>
                          </div>
                        </Show>
                        <For each={GMAIL_ACTIONS}>
                          {(action) => {
                            const state = () => actionStates()[action.id] ?? "idle";
                            return (
                              <button
                                type="button"
                                disabled={state() === "pending" || Boolean(gmailActionAvailability()?.blocking)}
                                onClick={() => runGmailAction(action)}
                                class={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                                  state() === "done"
                                    ? "border-[#d3e8d7] bg-[#f2fbf4]"
                                    : state() === "error"
                                      ? "border-[#f2cbc0] bg-[#fff4f0]"
                                      : "border-[#eadfd7] bg-[#fffdfb] hover:border-[#d9c8bc]"
                                }`}
                              >
                                <div class="flex items-start justify-between gap-3">
                                  <div>
                                    <p class="text-sm font-semibold text-[#1f1a17]">{action.label}</p>
                                    <p class="mt-1 text-xs leading-5 text-[#6d6158]">{action.description}</p>
                                  </div>
                                  <span class="text-[11px] uppercase tracking-[0.12em] text-[#8b7d72]">
                                    {state() === "pending"
                                      ? "Working"
                                      : state() === "done"
                                        ? "Queued"
                                        : state() === "error"
                                          ? "Retry"
                                          : gmailActionAvailability()?.blocking
                                            ? "Reconnect first"
                                            : "Ready"}
                                  </span>
                                </div>
                              </button>
                            );
                          }}
                        </For>
                      </div>
                    </section>

                    <section class="rounded-[22px] border border-[#eadfd7] bg-white p-4 shadow-[0_10px_24px_rgba(43,33,24,0.04)]">
                      <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b8f84]">Connection</p>
                      <Show
                        when={gmailStatus()?.connected}
                        fallback={
                          <div class="mt-3 space-y-3">
                            <p class="text-sm leading-6 text-[#6d6158]">
                              {isDemo()
                                ? "Sign in and connect Gmail so inbox actions can use your account. Messages appear here once OmnyID has saved or synced them as email records."
                                : "Connect Gmail so inbox actions can use your account. This list shows saved OmnyID email records and synced AFP events."}
                            </p>
                            <Show
                              when={gmailStatus()?.configured !== false}
                              fallback={<p class="text-xs text-[#b2644b]">Gmail OAuth is not configured on this server.</p>}
                            >
                              <button
                                type="button"
                                disabled={connecting()}
                                onClick={connectGmail}
                                class="inline-flex min-h-11 items-center rounded-full bg-[#ff6b35] px-4 text-sm font-semibold text-white transition hover:bg-[#ef5a25] disabled:opacity-60"
                              >
                                {connecting() ? "Connecting..." : props.signedIn ? "Connect Gmail" : "Sign in to connect Gmail"}
                              </button>
                            </Show>
                            <Show when={statusLoadError() && !gmailStatus()}>
                              <button
                                type="button"
                                onClick={() =>
                                  void loadGmailStatus().catch((error: unknown) => {
                                    setStatusLoadError(error instanceof Error ? error.message : "Failed to load Gmail connection status.");
                                  })
                                }
                                class="inline-flex min-h-10 items-center rounded-full border border-[#eadfd7] bg-white px-4 text-sm text-[#6d6158] transition hover:border-[#d9c8bc]"
                              >
                                Retry status
                              </button>
                            </Show>
                            <Show when={connectError()}>
                              <p class="rounded-2xl border border-[#f2cbc0] bg-[#fff4f0] px-3 py-2 text-xs text-[#b2644b]">
                                {connectError()}
                              </p>
                            </Show>
                          </div>
                        }
                      >
                        <div class="mt-3 rounded-2xl border border-[#d3e8d7] bg-[#f2fbf4] px-3 py-3">
                          <Show when={gmailConnectionWarning()}>
                            {(warning) => (
                              <div
                                class={`mb-3 rounded-2xl border px-3 py-3 ${
                                  warning().tone === "danger"
                                    ? "border-[#f2cbc0] bg-[#fff4f0]"
                                    : "border-[#f1dfb9] bg-[#fff9ee]"
                                }`}
                              >
                                <div class="flex flex-wrap items-start justify-between gap-3">
                                  <div class="min-w-0">
                                    <p
                                      class={`text-sm font-semibold ${
                                        warning().tone === "danger" ? "text-[#b2644b]" : "text-[#8b6421]"
                                      }`}
                                    >
                                      {warning().title}
                                    </p>
                                    <p
                                      class={`mt-1 text-xs leading-5 ${
                                        warning().tone === "danger" ? "text-[#b2644b]" : "text-[#8b6421]"
                                      }`}
                                    >
                                      {warning().detail}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={connecting()}
                                    onClick={() => void connectGmail()}
                                    class="inline-flex min-h-10 items-center rounded-full border border-current/15 bg-white px-3 text-xs font-semibold text-[#6d6158] transition hover:border-current/30 disabled:opacity-60"
                                  >
                                    {connecting() ? "Reconnecting..." : warning().actionLabel}
                                  </button>
                                </div>
                              </div>
                            )}
                          </Show>
                          <p class="text-sm font-semibold text-[#245536]">Gmail connected</p>
                          <p class="mt-1 text-xs text-[#4f6f5b]">{gmailStatus()?.gmail_email}</p>
                          <Show when={gmailSyncUi().visible}>
                            <div
                              class={`mt-3 rounded-2xl border px-3 py-3 ${
                                gmailSyncUi().tone === "warning"
                                  ? "border-[#f1dfb9] bg-[#fff9ee]"
                                  : gmailSyncUi().tone === "success"
                                    ? "border-[#d3e8d7] bg-white"
                                    : "border-[#d3e8d7] bg-white/70"
                              }`}
                            >
                              <div class="flex flex-wrap items-start justify-between gap-3">
                                <div class="min-w-0">
                                  <p class="text-sm font-semibold text-[#245536]">{gmailSyncUi().title}</p>
                                  <p class="mt-1 text-xs leading-5 text-[#4f6f5b]">{gmailSyncUi().detail}</p>
                                  <Show when={gmailSyncUi().summaryLabel}>
                                    {(label) => (
                                      <p class="mt-2 rounded-full bg-[#f2fbf4] px-2.5 py-1 text-[11px] font-medium text-[#245536]">
                                        {label()}
                                      </p>
                                    )}
                                  </Show>
                                </div>
                                <button
                                  type="button"
                                  disabled={gmailInboxSummaryLoading()}
                                  onClick={() => void refreshGmailInboxSummary()}
                                  class="inline-flex min-h-10 items-center rounded-full border border-[#d3e8d7] bg-white px-3 text-xs font-semibold text-[#245536] transition hover:border-[#bdd9c2] disabled:opacity-60"
                                >
                                  {gmailSyncUi().actionLabel}
                                </button>
                              </div>
                            </div>
                          </Show>
                          <div class="mt-4 rounded-2xl border border-[#d3e8d7] bg-white/70 p-3">
                            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[#4f6f5b]">Gmail mail to show</p>
                            <div class="mt-3 grid grid-cols-1 gap-2">
                              <button
                                type="button"
                                onClick={() => updateGmailSyncPreference("new_only")}
                                aria-pressed={gmailSyncPreference() === "new_only" ? "true" : "false"}
                                class={`rounded-2xl border px-3 py-3 text-left transition ${
                                  gmailSyncPreference() === "new_only"
                                    ? "border-[#8fc79d] bg-[#f2fbf4]"
                                    : "border-[#eadfd7] bg-white hover:border-[#d9c8bc]"
                                }`}
                              >
                                <span class="text-sm font-semibold text-[#1f1a17]">New mail only</span>
                                <span class="mt-1 block text-xs leading-5 text-[#6d6158]">Show new Gmail messages from now on.</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => updateGmailSyncPreference("full_inbox")}
                                aria-pressed={gmailSyncPreference() === "full_inbox" ? "true" : "false"}
                                class={`rounded-2xl border px-3 py-3 text-left transition ${
                                  gmailSyncPreference() === "full_inbox"
                                    ? "border-[#8fc79d] bg-[#f2fbf4]"
                                    : "border-[#eadfd7] bg-white hover:border-[#d9c8bc]"
                                }`}
                              >
                                <span class="text-sm font-semibold text-[#1f1a17]">Full inbox</span>
                                <span class="mt-1 block text-xs leading-5 text-[#6d6158]">Bring in older Gmail messages when inbox history sync is available.</span>
                              </button>
                            </div>
                          </div>
                          <div class="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={disconnecting()}
                              onClick={() => void disconnectConnectedGmail()}
                              class="inline-flex min-h-10 items-center rounded-full border border-[#d3e8d7] bg-white px-4 text-sm font-semibold text-[#245536] transition hover:border-[#bdd9c2] disabled:opacity-60"
                            >
                              {disconnecting() ? "Disconnecting..." : "Disconnect Gmail"}
                            </button>
                          </div>
                        </div>
                      </Show>
                    </section>
                  </div>
                )}
              </Show>
            </div>
          </div>
        </aside>
      </div>

      <Show when={composerOpen()}>
        <div class="absolute inset-0 z-20 flex justify-end bg-[rgba(31,26,23,0.24)] backdrop-blur-[1px]">
          <button
            type="button"
            aria-label="Close composer"
            class="flex-1 cursor-default"
            onClick={() => setComposerOpen(false)}
          />
          <div class="flex h-full w-full max-w-[24rem] flex-col border-l border-[#eadfd7] bg-[#fffaf6] shadow-[0_20px_60px_rgba(43,33,24,0.18)]">
            <div class="flex items-start justify-between gap-3 border-b border-[#eadfd7] px-4 py-4">
              <div>
                <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b8f84]">Composer</p>
                <h3 class="mt-1 text-base font-semibold text-[#1f1a17]">New email</h3>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                disabled={composerSaving()}
                class="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-[#eadfd7] bg-white text-[#6d6158] transition hover:border-[#d9c8bc]"
              >
                x
              </button>
            </div>
            <div class="flex-1 space-y-4 overflow-y-auto px-4 py-4" onKeyDown={handleComposerSubmitShortcut}>
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9b8f84]">Subject</label>
                <input
                  value={composerSubject()}
                  onInput={(event) => setComposerSubject(event.currentTarget.value)}
                  disabled={composerSaving()}
                  placeholder="What is this email about?"
                  class="h-11 w-full rounded-2xl border border-[#eadfd7] bg-white px-4 text-sm text-[#1f1a17] outline-none placeholder:text-[#9b8f84]"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9b8f84]">Tone</label>
                <div class="flex flex-wrap gap-2">
                  <For each={["short", "thoughtful", "direct"] as ComposerTone[]}>
                    {(tone) => (
                      <button
                        type="button"
                        onClick={() => setComposerTone(tone)}
                        disabled={composerSaving()}
                        class={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm transition ${
                          composerTone() === tone
                            ? "border-[#ff6b35] bg-[#fff0ea] text-[#ff6b35]"
                            : "border-[#eadfd7] bg-white text-[#6d6158]"
                        }`}
                      >
                        {tone}
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9b8f84]">Draft</label>
                <TiptapEditor
                  mode="email"
                  initialContent={composerBody()}
                  disabled={composerSaving()}
                  placeholder="Write the email body here."
                  submitLabel={composerSaving() ? "Saving..." : "Save draft"}
                  clearOnSend={false}
                  class="content-font-body"
                  onChange={(_text, markdown) => setComposerBody(markdown)}
                  onCancel={() => setComposerOpen(false)}
                  onSend={async (payload) => {
                    await saveComposerDraft(payload.markdown || payload.text);
                  }}
                />
              </div>
              <div class="rounded-[22px] border border-[#eadfd7] bg-white px-4 py-3 text-sm text-[#6d6158]">
                This saves a draft in OmnyID. You will still review and send approved emails through the connected Gmail send flow.
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
