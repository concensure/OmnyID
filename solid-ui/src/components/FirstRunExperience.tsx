// @locs-version: 1.0
/**
 * FirstRunExperience — Session-1 Gmail onboarding flow
 *
 * Phases:
 *   connect       — prompt user to connect Gmail (OAuth)
 *   awaiting_oauth — waiting for the OAuth popup to complete
 *   loading       — animated inbox-analysis progress steps
 *   summary       — inbox counts + top-3 emails + draft reply
 *   review        — edit the draft reply before sending
 *   transparency  — AFP-style log of what the agent did + next steps
 */

import { createSignal, For, Show, onCleanup } from "solid-js";
import {
  fetchGmailInboxSummary,
  fetchGmailOAuthConfig,
  fetchGmailOAuthUrl,
  fetchGmailStatus,
  sendGmailDraft,
} from "../lib/api";
import { ApprovalDecisionButtons } from "@/components/ApprovalDecisionButtons";
import { ApprovalDecisionNotice } from "@/components/ApprovalDecisionNotice";
import { ProcessingGlyph } from "@/components/ProcessingGlyph";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import {
  buildFirstRunGmailOAuthFailureReceipt,
  buildFirstRunExperienceFailureReceipt,
  type FirstRunExperienceFailureReceipt,
} from "@/lib/firstRunExperienceFailureState";
import { saveFirstRunExperienceDone } from "@/lib/firstRunExperienceLocalState";
import { gmailOAuthConfigFailureMessage } from "@/lib/gmailConnectionState";
import {
  type InboxSummary,
} from "@/lib/firstRunExperienceResponseState";

// ── Types ─────────────────────────────────────────────────────────────────────

type FREPhase =
  | "connect"
  | "awaiting_oauth"
  | "loading"
  | "summary"
  | "review"
  | "transparency";

// ── Loading steps shown during inbox analysis ─────────────────────────────────

const LOADING_STEPS = [
  "Connecting to your encrypted homeserver…",
  "Fetching last 24 hours of emails…",
  "Categorising by urgency and sender…",
  "Identifying emails needing a reply…",
  "Drafting response for the most urgent email…",
  "Ready!",
];

// ── Component ─────────────────────────────────────────────────────────────────

export function FirstRunExperience(props: { onComplete: () => void }) {
  const [phase, setPhase] = createSignal<FREPhase>("connect");
  const [loadStep, setLoadStep] = createSignal(0);
  const [summary, setSummary] = createSignal<InboxSummary | null>(null);
  const [draftBody, setDraftBody] = createSignal("");
  const [draftSubject, setDraftSubject] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [sendResult, setSendResult] = createSignal<"sent" | "skipped" | null>(null);
  const [error, setError] = createSignal<FirstRunExperienceFailureReceipt | null>(null);
  const [sendError, setSendError] = createSignal<FirstRunExperienceFailureReceipt | null>(null);
  const [oauthPollCount, setOauthPollCount] = createSignal(0);

  let loadTimer: ReturnType<typeof setInterval> | undefined;
  let oauthPollTimer: ReturnType<typeof setInterval> | undefined;

  onCleanup(() => {
    clearInterval(loadTimer);
    clearInterval(oauthPollTimer);
  });

  // ── OAuth flow ──────────────────────────────────────────────────────────────

  async function connectGmail() {
    setError(null);
    try {
      const url = await fetchGmailOAuthUrl("integration");
      window.open(url, "gmailOAuth", "width=520,height=640,noopener");
      setPhase("awaiting_oauth");
      startOAuthPoll();
    } catch {
      try {
        const config = await fetchGmailOAuthConfig("integration");
        setError(buildFirstRunGmailOAuthFailureReceipt(gmailOAuthConfigFailureMessage(config)));
      } catch {
        setError(buildFirstRunGmailOAuthFailureReceipt(gmailOAuthConfigFailureMessage(null)));
      }
      setPhase("connect");
    }
  }

  function startOAuthPoll() {
    oauthPollTimer = setInterval(async () => {
      setOauthPollCount((n) => n + 1);
      try {
        const status = await fetchGmailStatus("integration");
        if (status.connected) {
          clearInterval(oauthPollTimer);
          setPhase("loading");
          startLoadingAnimation();
        }
      } catch {
        // keep polling
      }
      // Give up after 90 s (30 polls × 3 s)
      if (oauthPollCount() >= 30) {
        clearInterval(oauthPollTimer);
        setError(
          buildFirstRunExperienceFailureReceipt(
            "Confirm Gmail authorisation",
            "Gmail authorisation was not confirmed in time.",
          ),
        );
        setPhase("connect");
      }
    }, 3000);
  }

  // ── Loading animation + inbox fetch ────────────────────────────────────────

  function startLoadingAnimation() {
    setLoadStep(0);
    loadTimer = setInterval(() => {
      setLoadStep((s) => {
        if (s < LOADING_STEPS.length - 1) return s + 1;
        clearInterval(loadTimer);
        void fetchInboxSummary();
        return s;
      });
    }, 900);
  }

  async function fetchInboxSummary() {
    try {
      const data = await fetchGmailInboxSummary();
      applySummary(data);
    } catch {
      setError(
        buildFirstRunExperienceFailureReceipt(
          "Fetch Gmail summary",
          "Could not load the live Gmail summary.",
        ),
      );
      setPhase("connect");
      return;
    }
  }

  function applySummary(data: InboxSummary) {
    setSummary(data);
    setSendError(null);
    if (data.draft) {
      setDraftBody(data.draft.body);
      setDraftSubject(data.draft.subject);
    }
    setPhase("summary");
  }

  // ── Draft actions ───────────────────────────────────────────────────────────

  function editDraft() {
    setPhase("review");
  }

  async function sendDraft() {
    setSending(true);
    setSendError(null);
    try {
      await sendGmailDraft({
        email_id: summary()?.draft?.email_id,
        subject: draftSubject(),
        body: draftBody(),
      });
    } catch (cause: unknown) {
      setSending(false);
      setSendError(
        buildFirstRunExperienceFailureReceipt(
          "Send draft",
          cause instanceof Error ? cause.message : "Could not send this draft.",
        ),
      );
      return;
    }
    setSending(false);
    setSendResult("sent");
    setPhase("transparency");
  }

  function skipDraft() {
    setSendError(null);
    setSendResult("skipped");
    setPhase("transparency");
  }

  function finish() {
    saveFirstRunExperienceDone();
    props.onComplete();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gradient-to-br from-[#0f1117] to-[#1a1d2e] pt-12 pb-12">
      <div class="w-full max-w-md px-4">

        {/* ── Phase: Connect ──────────────────────────────────────────────── */}
        <Show when={phase() === "connect"}>
          <div class="rounded-[28px] border border-white/20 bg-white/8 p-8 shadow-2xl backdrop-blur-md text-center">
            <div class="mb-2 text-5xl">✉️</div>
            <h1 class="mt-4 text-2xl font-bold text-white">Welcome to OmnyID</h1>
            <p class="mt-2 text-sm leading-6 text-white/70">
              Connect your Gmail so your agent can help you manage your inbox intelligently — privately, on your encrypted homeserver.
            </p>
            <Show when={error()}>
              <div
                class={`mt-3 rounded-2xl border px-4 py-3 text-left text-xs leading-5 ${
                  error()?.tone === "danger"
                    ? "border-red-300/30 bg-red-400/10 text-red-200"
                    : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                }`}
              >
                <p class="font-semibold">{error()?.title}</p>
                <p>{error()?.summary}</p>
                <p class="opacity-80">Next step: {error()?.nextStep}</p>
              </div>
            </Show>
            <button
              type="button"
              onClick={() => void connectGmail()}
              class="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 shadow-lg transition hover:bg-white/90"
            >
              <svg class="h-5 w-5" viewBox="0 0 48 48" fill="none">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.7 2.3 30.1 0 24 0 14.7 0 6.7 5.4 2.7 13.3l7.9 6.1C12.5 13 17.8 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.6 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.2-10 7.2-17z"/>
                <path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6L2.4 13.3A23.9 23.9 0 0 0 0 24c0 3.8.9 7.4 2.5 10.6l8.1-6z"/>
                <path fill="#34A853" d="M24 48c6.1 0 11.2-2 14.9-5.4l-7.5-5.8c-2 1.4-4.6 2.2-7.4 2.2-6.2 0-11.4-4.2-13.2-9.8l-8.1 6.2C6.6 42.5 14.7 48 24 48z"/>
              </svg>
              Connect Gmail
            </button>
            <button
              type="button"
              onClick={finish}
              class="mt-3 w-full text-xs text-white/40 transition hover:text-white/60"
            >
              Skip for now
            </button>
            <p class="mt-4 text-[10px] text-white/30">
              🔒 All processing happens on your encrypted homeserver. No data leaves your device.
            </p>
          </div>
        </Show>

        {/* ── Phase: Awaiting OAuth ────────────────────────────────────────── */}
        <Show when={phase() === "awaiting_oauth"}>
          <div class="rounded-[28px] border border-white/20 bg-white/8 p-8 shadow-2xl backdrop-blur-md text-center">
            <div class="mb-4 text-4xl animate-bounce">🔐</div>
            <h2 class="text-lg font-semibold text-white">Complete authorisation</h2>
            <p class="mt-2 text-sm text-white/60">
              A Google sign-in window opened. Complete the authorisation there and we'll continue automatically.
            </p>
            <div class="mt-6 flex justify-center">
              <ProcessingGlyph class="text-primary/65" size={24} strokeWidth={1.55} />
            </div>
            <p class="mt-4 text-[10px] text-white/30">
              Waiting for authorisation… ({oauthPollCount()} / 30)
            </p>
            <button
              type="button"
              onClick={() => { clearInterval(oauthPollTimer); setPhase("loading"); startLoadingAnimation(); }}
              class="mt-4 text-xs text-white/40 transition hover:text-white/60"
            >
              Already authorised? Continue →
            </button>
          </div>
        </Show>

        {/* ── Phase: Loading ───────────────────────────────────────────────── */}
        <Show when={phase() === "loading"}>
          <div class="rounded-[28px] border border-white/20 bg-white/8 p-8 shadow-2xl backdrop-blur-md">
            <div class="mb-4 flex items-center justify-center gap-2 text-white/40">
              <ProcessingGlyph class="text-primary/55" size={18} strokeWidth={1.45} />
              <p class="font-mono text-[10px] uppercase tracking-[0.2em]">
                Inbox Assistant
              </p>
            </div>
            <Show when={error()}>
              <div
                class={`mb-4 rounded-2xl border px-4 py-3 text-xs leading-5 ${
                  error()?.tone === "danger"
                    ? "border-red-300/30 bg-red-400/10 text-red-200"
                    : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                }`}
              >
                <p class="font-semibold">{error()?.title}</p>
                <p>{error()?.summary}</p>
                <p class="opacity-80">Next step: {error()?.nextStep}</p>
              </div>
            </Show>
            <div class="space-y-3">
              {LOADING_STEPS.map((step, i) => (
                <div class={`flex items-center gap-3 transition-opacity duration-300 ${i <= loadStep() ? "opacity-100" : "opacity-25"}`}>
                  <span class={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    i < loadStep() ? "bg-emerald-400 text-white" :
                    i === loadStep() ? "border border-primary/60 bg-primary/20 text-primary animate-pulse" :
                    "border border-white/15 text-white/20"
                  }`}>
                    {i < loadStep() ? "✓" : i + 1}
                  </span>
                  <span class={`text-sm ${i === loadStep() ? "text-white" : i < loadStep() ? "text-white/60" : "text-white/20"}`}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Show>

        {/* ── Phase: Summary ───────────────────────────────────────────────── */}
        <Show when={phase() === "summary" && summary() !== null}>
          {(_) => {
            const s = summary()!;
            return (
              <div class="space-y-4">
                <div class="rounded-[28px] border border-white/20 bg-white/8 p-6 shadow-2xl backdrop-blur-md">
                  <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Inbox Summary · Last 24h</p>
                  <div class="mt-3 flex gap-4">
                    <div class="flex-1 rounded-2xl bg-white/10 px-3 py-2.5 text-center">
                      <p class="text-xl font-bold text-white">{s.total_unread}</p>
                      <p class="text-[10px] text-white/50">unread</p>
                    </div>
                    <div class="flex-1 rounded-2xl bg-amber-400/15 px-3 py-2.5 text-center">
                      <p class="text-xl font-bold text-amber-300">{s.needs_reply}</p>
                      <p class="text-[10px] text-amber-300/60">need reply</p>
                    </div>
                    <div class="flex-1 rounded-2xl bg-white/10 px-3 py-2.5 text-center">
                      <p class="text-xl font-bold text-white/50">{s.newsletters}</p>
                      <p class="text-[10px] text-white/30">newsletters</p>
                    </div>
                  </div>
                </div>

                <div class="rounded-[28px] border border-white/20 bg-white/8 p-6 shadow-2xl backdrop-blur-md">
                  <p class="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Needs Your Reply</p>
                  <div class="space-y-2">
                    <For each={s.priority_emails}>
                      {(email, i) => (
                        <div class={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${i() === 0 ? "border border-amber-400/30 bg-amber-400/8" : "bg-white/5"}`}>
                          <span class={`mt-0.5 h-5 w-5 shrink-0 rounded-full text-center text-[10px] font-bold leading-5 ${i() === 0 ? "bg-amber-400 text-slate-900" : "bg-white/15 text-white/50"}`}>
                            {i() + 1}
                          </span>
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-xs font-semibold text-white">{email.sender} <span class="font-normal text-white/50">· {email.subject}</span></p>
                            <p class="mt-0.5 truncate text-[11px] text-white/40">{email.preview}</p>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>

                <Show when={s.draft}>
                  <div class="rounded-[28px] border border-primary/30 bg-primary/8 p-6 shadow-2xl backdrop-blur-md">
                    <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-primary/60">Draft Reply · {s.draft!.to}</p>
                    <p class="text-xs text-white/60">Subject: {s.draft!.subject}</p>
                    <p class="mt-2 text-sm leading-6 text-white/80 whitespace-pre-line">{s.draft!.body}</p>
                      <Show when={sendError()}>
                        <div
                          class={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${
                            sendError()?.tone === "danger"
                              ? "border-red-300/30 bg-red-400/10 text-red-200"
                              : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                          }`}
                        >
                          <p class="font-semibold">{sendError()?.title}</p>
                          <p>{sendError()?.summary}</p>
                          <p class="opacity-80">Next step: {sendError()?.nextStep}</p>
                        </div>
                      </Show>
                      <div class="mt-4 flex flex-wrap gap-2">
                        <ApprovalDecisionButtons
                          class="flex"
                          showReject={false}
                          busy={sending()}
                          busyLabel="Sending..."
                          approveContext="outbound_send"
                          onApprove={() => {
                            void sendDraft();
                          }}
                          onReject={() => {}}
                          approveClass="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary/80 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={editDraft}
                        class="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm text-white/80 transition hover:bg-white/20"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={skipDraft}
                        class="rounded-full px-4 py-2 text-sm text-white/30 transition hover:text-white/50"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                </Show>

                <Show when={!s.draft}>
                  <div class="rounded-[28px] border border-emerald-300/20 bg-emerald-400/8 p-5 text-center">
                    <p class="text-sm font-medium text-emerald-300">Your inbox is clear!</p>
                    <p class="mt-1 text-xs text-white/50">No urgent replies needed right now.</p>
                    <button
                      type="button"
                      onClick={skipDraft}
                      class="mt-3 rounded-full bg-emerald-500/80 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                    >
                      Continue →
                    </button>
                  </div>
                </Show>
              </div>
            );
          }}
        </Show>

        {/* ── Phase: Review / Edit Draft ───────────────────────────────────── */}
        <Show when={phase() === "review"}>
          <div class="rounded-[28px] border border-white/20 bg-white/8 p-6 shadow-2xl backdrop-blur-md">
            <p class="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Edit Draft Reply</p>
            <label class="block">
              <span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Subject</span>
              <input
                type="text"
                value={draftSubject()}
                onInput={(e) => setDraftSubject(e.currentTarget.value)}
                class="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              />
            </label>
            <label class="mt-3 block">
              <span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Body</span>
              <div class="mt-1">
                <TiptapEditor
                  mode="email"
                  initialContent={draftBody()}
                  disabled={sending()}
                  emailSubject={draftSubject()}
                  submitLabel={sending() ? "Sending..." : "Send draft"}
                  clearOnSend={false}
                  onChange={(_text, markdown) => setDraftBody(markdown)}
                  onSend={async (payload) => {
                    setDraftBody(payload.markdown || payload.text);
                    await sendDraft();
                  }}
                />
              </div>
            </label>
            <p class="mt-1.5 text-[10px] text-white/30">
              Your edits will be remembered to improve future drafts.
            </p>
            <Show when={sendError()}>
              <div
                class={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${
                  sendError()?.tone === "danger"
                    ? "border-red-300/30 bg-red-400/10 text-red-200"
                    : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                }`}
              >
                <p class="font-semibold">{sendError()?.title}</p>
                <p>{sendError()?.summary}</p>
                <p class="opacity-80">Next step: {sendError()?.nextStep}</p>
              </div>
            </Show>
            <div class="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPhase("summary")}
                class="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm text-white/60 transition hover:bg-white/20"
              >
                ← Back
              </button>
            </div>
          </div>
        </Show>

        {/* ── Phase: Transparency / Done ───────────────────────────────────── */}
        <Show when={phase() === "transparency"}>
          <div class="space-y-4">
              <div class="rounded-[28px] border border-white/20 bg-white/8 p-6 shadow-2xl backdrop-blur-md">
                <Show when={sendResult() !== null}>
                  <ApprovalDecisionNotice
                    decision={sendResult() === "sent" ? "approved" : "rejected"}
                    context="outbound_send"
                    class="mb-4 border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-300"
                    detailClass="text-emerald-300/80"
                  />
                </Show>
              <div class="mb-4 flex items-center gap-3">
                <span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-base">🤖</span>
                <div>
                  <p class="text-xs font-semibold text-white">Inbox Triage Agent</p>
                  <p class="text-[10px] text-white/40">Email assistant · active</p>
                </div>
                <span class="ml-auto flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] text-emerald-400">
                  🔒 E2EE
                </span>
              </div>
              <p class="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">What just happened</p>
              <div class="space-y-1.5">
                  {[
                    `Scanned ${summary()?.total_unread ?? 12} emails from the last 24 hours`,
                    `Prioritised ${summary()?.needs_reply ?? 3} that need a reply`,
                    `Drafted 1 response for the most urgent email`,
                  ].map((line, i) => (
                  <div class="flex items-start gap-2 text-xs text-white/60">
                    <span class="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    {line}
                  </div>
                ))}
                <Show when={sendResult() !== null}>
                  <ApprovalDecisionNotice
                    decision={sendResult() === "sent" ? "approved" : "rejected"}
                    context="outbound_send"
                    class="border-0 bg-transparent px-0 py-0 text-xs text-white/60"
                    detailClass="text-white/50"
                  />
                </Show>
              </div>
              <p class="mt-3 text-[10px] text-white/30">
                All processing happened on your encrypted homeserver. No email content left your device.
              </p>
            </div>

            <div class="rounded-[28px] border border-white/20 bg-white/8 p-6 shadow-2xl backdrop-blur-md">
              <p class="mb-3 text-sm font-semibold text-white">
                Your inbox is {sendResult() === "sent" ? "1 reply lighter" : "ready"}. What next?
              </p>
              <div class="space-y-2">
                {[
                  { label: "Set up auto-replies for similar emails", action: "automations" },
                  { label: "Teach the agent your preferred reply style", action: "settings" },
                  { label: "Go to your full inbox", action: "inbox" },
                ].map((item) => (
                  <button
                    type="button"
                    onClick={finish}
                    class="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    <span class="h-1.5 w-1.5 rounded-full bg-primary/60" />
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={finish}
                class="mt-4 w-full rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/80"
              >
                Open my workspace →
              </button>
            </div>
          </div>
        </Show>

      </div>
    </div>
  );
}
