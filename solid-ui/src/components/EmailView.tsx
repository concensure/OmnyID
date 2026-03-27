import { createSignal, For, onMount, Show } from "solid-js";
import type { DashboardBootstrap } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import { ViewDispatcher } from "@/components/ViewDispatcher";

type GmailAction = "label" | "reply" | "unsubscribe" | "summary";
type ActionState = "idle" | "pending" | "done" | "error";

const GMAIL_ACTIONS: Array<{
  id: GmailAction;
  label: string;
  description: string;
  icon: string;
  objective: string;
}> = [
  {
    id: "label",
    label: "Auto-Label",
    description: "Label all emails using your existing labels, create new ones as needed (asks before creating).",
    icon: "🏷",
    objective: "Review the user's Gmail inbox, identify existing labels, and automatically label all unlabelled emails. Before creating any new label categories, list proposed new labels and ask the user for approval.",
  },
  {
    id: "reply",
    label: "Draft Replies",
    description: "Find important emails needing attention, draft replies, and show them for manual review before sending.",
    icon: "✍️",
    objective: "Scan the Gmail inbox for important emails that require a response (e.g. questions, requests, time-sensitive items). For each, draft a professional reply. Present each draft to the user for review before sending — never send without explicit approval.",
  },
  {
    id: "unsubscribe",
    label: "Unsubscribe",
    description: "Find mailing lists and newsletters, list them, and unsubscribe with your approval.",
    icon: "🚫",
    objective: "Identify all mailing list and newsletter emails in the inbox. Present the full list to the user grouped by sender. For each group the user approves, trigger the unsubscribe action.",
  },
  {
    id: "summary",
    label: "Daily Summary",
    description: "Summarise today's emails into a brief digest with key action items.",
    icon: "📋",
    objective: "Read today's Gmail messages and produce a concise digest: total count, key action items, important senders, and anything requiring urgent attention. Format as a structured AFP message.",
  },
];

export function EmailView(props: { bootstrap: DashboardBootstrap | null; signedIn?: boolean }) {
  const [gmailStatus, setGmailStatus] = createSignal<{ connected: boolean; gmail_email: string; configured: boolean } | null>(null);
  const [connecting, setConnecting] = createSignal(false);
  const [actionStates, setActionStates] = createSignal<Partial<Record<GmailAction, ActionState>>>({});

  function setAction(id: GmailAction, state: ActionState) {
    setActionStates((prev) => ({ ...prev, [id]: state }));
  }

  async function runGmailAction(action: (typeof GMAIL_ACTIONS)[number]) {
    if (actionStates()[action.id] === "pending") return;
    setAction(action.id, "pending");
    try {
      await apiFetch("/agent/orchestrate", {
        method: "POST",
        bodyJson: { objective: action.objective },
      });
      setAction(action.id, "done");
    } catch {
      setAction(action.id, "error");
      // reset after a moment so user can retry
      setTimeout(() => setAction(action.id, "idle"), 3000);
    }
  }

  onMount(async () => {
    try {
      const s = await apiFetch<{ connected: boolean; gmail_email: string; configured: boolean }>("/gmail/status");
      setGmailStatus(s);
    } catch { /* not signed in or server error — ignore */ }
  });

  // Check query param on mount for post-OAuth redirect feedback
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") {
      window.history.replaceState({}, "", window.location.pathname);
      apiFetch<{ connected: boolean; gmail_email: string; configured: boolean }>("/gmail/status")
        .then(setGmailStatus)
        .catch(() => {});
    }
  });

  async function connectGmail() {
    if (!props.signedIn) {
      alert("Sign in to your OmnyID account first, then connect Gmail.");
      return;
    }
    setConnecting(true);
    try {
      const { url } = await apiFetch<{ url: string }>("/gmail/connect-url");
      window.location.href = url;
    } catch (err) {
      alert((err as Error).message || "Gmail OAuth not configured on this server.");
      setConnecting(false);
    }
  }
  const emailMessages = () =>
    (props.bootstrap?.messages ?? [])
      .filter(
        (m) =>
          m.type.includes("email") ||
          m.type.includes("inbox") ||
          m.type.includes("reply") ||
          m.type.includes("action_log") ||
          m.type.includes("approval")
      )
      .slice(0, 20);

  return (
    <div class="space-y-4">
      <div class="glass-surface rounded-xl border border-white/40 p-5 shadow-panel">
        <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Email</p>
        <h3 class="mt-2 text-lg font-semibold text-on-surface">Inbox &amp; Agent Actions</h3>
        <p class="mt-2 text-sm leading-7 text-on-surface-variant">
          Summarised email activity and agent-actioned items from your connected inbox and AFP message threads.
          Agent-to-agent communication uses AFP over WebTransport — no email required for that.
        </p>

        {/* Connect email CTA */}
        <Show
          when={!gmailStatus()?.connected}
          fallback={
              <div class="mt-4 space-y-3">
              <div class="rounded-xl border border-green-500/25 bg-green-500/10 p-3 flex items-center gap-2">
                <span class="text-green-600 text-sm">✓</span>
                <div>
                  <p class="text-sm font-medium text-green-700">Gmail connected</p>
                  <p class="text-xs text-on-surface-variant">{gmailStatus()?.gmail_email}</p>
                </div>
              </div>

              {/* Agent action suggestions */}
              <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline pt-1">
                Agent Actions
              </p>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <For each={GMAIL_ACTIONS}>
                  {(action) => {
                    const state = () => actionStates()[action.id] ?? "idle";
                    const isPending = () => state() === "pending";
                    const isDone = () => state() === "done";
                    const isError = () => state() === "error";
                    return (
                      <button
                        type="button"
                        disabled={isPending()}
                        onClick={() => runGmailAction(action)}
                        class={`group flex items-start gap-3 rounded-xl border p-3 text-left transition
                          ${isDone()
                            ? "border-green-500/30 bg-green-500/10"
                            : isError()
                            ? "border-red-500/30 bg-red-500/10"
                            : "border-white/25 bg-white/10 hover:bg-white/20 hover:border-white/40"
                          }
                          disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        <span class="mt-0.5 text-lg leading-none">{action.icon}</span>
                        <div class="flex-1 min-w-0">
                          <p class="text-xs font-semibold text-on-surface">
                            {action.label}
                            {isDone() && <span class="ml-1.5 text-green-600">✓ Queued</span>}
                            {isError() && <span class="ml-1.5 text-red-500">Failed</span>}
                          </p>
                          <p class="mt-0.5 text-[11px] leading-4 text-on-surface-variant">
                            {action.description}
                          </p>
                          <Show when={isPending()}>
                            <p class="mt-1 font-mono text-[9px] uppercase tracking-wider text-primary animate-pulse">
                              Agent working…
                            </p>
                          </Show>
                        </div>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          }
        >
          <div class="mt-4 rounded-xl border border-primary/25 bg-primary/10 p-4">
            <p class="text-sm font-medium text-on-surface">Connect your inbox</p>
            <p class="mt-1 text-xs leading-5 text-on-surface-variant">
              Connect Gmail so your agent can triage, summarise, and act on your emails with your approval.
              Your OAuth token stays encrypted on your homeserver — the platform never sees it.
            </p>
            <Show
              when={gmailStatus()?.configured !== false}
              fallback={
                <p class="mt-3 text-xs text-yellow-600">
                  Gmail OAuth not configured on this server (OMNYID_GMAIL_CLIENT_ID not set).
                </p>
              }
            >
              <div class="mt-3 flex flex-col gap-1.5">
                <button
                  type="button"
                  disabled={connecting()}
                  onClick={connectGmail}
                  class="self-start rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-60"
                >
                  {connecting() ? "Connecting…" : props.signedIn ? "Connect Gmail" : "Sign in to connect Gmail"}
                </button>
                <p class="text-[10px] leading-4 text-on-surface-variant opacity-70">
                  Your OAuth token is encrypted on your personal homeserver and never shared with OmnyID or any third party.
                </p>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Email-type AFP messages */}
      <Show
        when={emailMessages().length > 0}
        fallback={
          <div class="glass-surface rounded-[22px] border border-dashed border-white/35 p-5 text-sm text-on-surface-variant shadow-panel">
            No email messages yet. Connect your inbox or ask the agent to check it to see activity here.
          </div>
        }
      >
        <div class="space-y-3">
          <For each={emailMessages()}>
            {(msg) => <ViewDispatcher message={msg} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
