// @locs-version: 1.0
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { AttachmentsRenderer } from "@/components/renderers/AttachmentsRenderer";
import { WeddingNormalizedQuoteSummary } from "@/components/WeddingNormalizedQuoteSummary";
import { fetchGmailOAuthConfig, fetchGmailOAuthUrl } from "@/lib/api";
import type { EditorPayload } from "@/lib/editorPayload";
import { gmailOAuthConfigFailureMessage } from "@/lib/gmailConnectionState";
import type { WeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";
import { weddingQuoteAttachmentMessageState } from "@/lib/weddingQuoteAttachmentMessageState";
import {
  weddingVendorQuoteReplyConsentChangeState,
  weddingVendorQuoteReplyContextualSurfaceState,
  weddingVendorQuoteReplyDraftSyncState,
  weddingVendorQuoteReplyDraftPersistenceState,
  weddingVendorQuoteReplyEditorDirtyState,
  weddingVendorQuoteReplyHomeSurfaceState,
  weddingVendorQuoteReplyPresentationState,
  weddingVendorQuoteReplyProofPersistenceState,
  weddingVendorQuoteReplySendGateState,
  type WeddingVendorQuoteReplyDraftPersistenceStatus,
  type WeddingVendorQuoteReplyFlowState,
} from "@/lib/weddingVendorQuoteReplyFlowState";
import type { WeddingVendorQuoteAttachmentParserState } from "@/lib/weddingVendorQuoteAttachmentParserState";
import { buildWeddingVendorQuoteReplyUiCopyState } from "@/lib/weddingVendorQuoteReplyUiState";
import { subscribeMagicActionEvent } from "@/lib/magicActionEvent";
import type { ViewName } from "@/lib/viewNames";

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function WeddingVendorQuoteReplyCard(props: {
  flow: WeddingVendorQuoteReplyFlowState;
  surface?: "home" | "workspace";
  recipient: string;
  subject: string;
  draftBody: string;
  busy?: boolean;
  busyLabel?: string | null;
  draftPersistenceStatus?: WeddingVendorQuoteReplyDraftPersistenceStatus | null;
  proofSaveNotice?: string | null;
  providerReadiness?: WeddingProviderExecutorReadinessState | null;
  attachmentParserState?: WeddingVendorQuoteAttachmentParserState | null;
  attachmentParsing?: boolean;
  onSaveDraft: (payload: EditorPayload) => Promise<void> | void;
  onApproveWording: () => void;
  onUnapproveWording?: () => void;
  onAcknowledgeBudgetImpact: () => void;
  onUnacknowledgeBudgetImpact?: () => void;
  onSend: () => void;
  onUndo: () => void;
  onViewSentThread: () => void;
  onParseAttachment?: () => void;
  onProviderSetup?: (view: ViewName) => void;
}) {
  const [draft, setDraft] = createSignal(props.draftBody);
  const [syncedDraftBody, setSyncedDraftBody] = createSignal(props.draftBody);
  const [forceReplyEditorOpen, setForceReplyEditorOpen] = createSignal(false);
  const [homeExpanded, setHomeExpanded] = createSignal(false);
  const [quoteDetailsOpen, setQuoteDetailsOpen] = createSignal(false);
  const [wordingChecked, setWordingChecked] = createSignal(props.flow.approvedWording);
  const [budgetChecked, setBudgetChecked] = createSignal(props.flow.budgetImpactAcknowledged);
  const [draftSaveFeedback, setDraftSaveFeedback] = createSignal<string | null>(null);
  const [draftSaveRequested, setDraftSaveRequested] = createSignal(false);
  const [gmailConnecting, setGmailConnecting] = createSignal(false);
  const [gmailSetupError, setGmailSetupError] = createSignal<string | null>(null);
  createEffect(() => {
    const next = weddingVendorQuoteReplyDraftSyncState({
      currentDraft: draft(),
      previousSavedDraft: syncedDraftBody(),
      nextSavedDraft: props.draftBody,
    });
    setSyncedDraftBody(next.syncedDraftBody);
    if (next.adoptedSavedDraft) setDraft(next.draft);
  });
  createEffect(() => {
    props.flow.id;
    props.flow.stage;
    setForceReplyEditorOpen(false);
    setHomeExpanded(false);
    setQuoteDetailsOpen(false);
    setDraftSaveFeedback(null);
    setDraftSaveRequested(false);
    setGmailSetupError(null);
  });
  createEffect(() => setWordingChecked(props.flow.approvedWording));
  createEffect(() => setBudgetChecked(props.flow.budgetImpactAcknowledged));
  const quote = () => props.flow.quote;
  const quoteAttachmentUrl = () => safeHttpUrl(quote().attachmentUrl);
  const quoteAttachmentMessage = () => weddingQuoteAttachmentMessageState({
    quote: quote(),
    threadId: props.flow.threadId,
  });
  const providerReadiness = () => props.providerReadiness ?? null;
  const proofPersistence = () => weddingVendorQuoteReplyProofPersistenceState({
    notice: props.proofSaveNotice,
  });
  const dirtyState = () => weddingVendorQuoteReplyEditorDirtyState({
    savedDraft: props.draftBody,
    editorDraft: draft(),
    approvedWording: props.flow.approvedWording,
  });
  const draftPersistence = () => weddingVendorQuoteReplyDraftPersistenceState({
    status: props.draftPersistenceStatus,
  });
  createEffect(() => {
    if (!draftSaveRequested()) return;
    if (dirtyState().dirty) return;
    if (props.draftPersistenceStatus === "saving") {
      setDraftSaveFeedback("Saving this reply to the wedding...");
      return;
    }
    if (props.draftPersistenceStatus === "saved") {
      setDraftSaveFeedback("Saved to this wedding. You can approve and send when ready.");
      return;
    }
    if (props.draftPersistenceStatus === "local_only") {
      setDraftSaveFeedback("Saved only on this device. Try saving again before approving or sending.");
    }
  });
  const canApproveWording = () => (
    !dirtyState().dirty
    && !draftPersistence().blocksApproval
    && props.flow.canApproveWording
    && !props.flow.approvedWording
    && draft().trim().length > 0
    && !props.busy
  );
  const sendGate = () => weddingVendorQuoteReplySendGateState({
    flowCanSend: props.flow.canSend,
    dirtyState: dirtyState(),
    draftPersistence: draftPersistence(),
    providerReadiness: providerReadiness(),
    busy: props.busy,
  });
  const canSendNow = () => sendGate().canStartSend;
  const presentation = () => weddingVendorQuoteReplyPresentationState({
    flow: props.flow,
    dirtyState: dirtyState(),
    draftPersistence: draftPersistence(),
  });
  const showReplyEditor = () => presentation().showReplyEditor || forceReplyEditorOpen();
  const compactHome = () => (
    props.surface === "home"
    && !homeExpanded()
    && props.flow.stage !== "sent"
    && props.flow.stage !== "sending_undo_window"
  );
  const homeSurface = () => weddingVendorQuoteReplyHomeSurfaceState({
    flow: props.flow,
    presentation: presentation(),
  });
  const budgetAcknowledgementBlocked = () => props.busy || !quote().budgetDeltaLabel;
  const primaryActionDisabled = () => {
    if (props.busy) return true;
    const action = presentation().primaryActionKind;
    if (action === "approve_wording") return !canApproveWording();
    if (action === "acknowledge_budget") return budgetAcknowledgementBlocked();
    if (action === "send") return !canSendNow();
    if (action === "undo_send" || action === "view_sent_log" || action === "save_reply") return false;
    return true;
  };
  const draftPayload = (): EditorPayload => ({
    markdown: draft(),
    text: draft(),
    afpMessage: {
      thread_id: props.flow.threadId,
      parent_id: props.flow.quoteMessageId,
      type: "email_draft",
      kind: "wedding_vendor_quote_reply_draft",
      subtype: "wedding_vendor_quote_reply_draft",
      content: {
        text: draft(),
        to: props.recipient,
        subject: props.subject,
        semantic_object: props.flow.semanticObject,
      },
      views: [{
        format: "email",
        content: {
          text: draft(),
          to: props.recipient,
          subject: props.subject,
          semantic_object: props.flow.semanticObject,
        },
      }],
      attachments: [],
      references: props.flow.quoteMessageId
        ? [{ type: "wedding_vendor_quote", target: props.flow.quoteMessageId, label: "Vendor quote" }]
        : [],
    },
  });
  const saveCurrentDraft = async () => {
    setDraftSaveRequested(true);
    setDraftSaveFeedback("Saving this reply to the wedding...");
    try {
      await props.onSaveDraft(draftPayload());
    } catch {
      setDraftSaveFeedback("Could not confirm the save. The reply is still here; try saving again.");
    }
  };
  const connectGmailDirectly = async () => {
    if (gmailConnecting()) return;
    setGmailConnecting(true);
    setGmailSetupError(null);
    try {
      const url = await fetchGmailOAuthUrl();
      window.location.href = url;
    } catch {
      try {
        const config = await fetchGmailOAuthConfig();
        setGmailSetupError(gmailOAuthConfigFailureMessage(config));
      } catch {
        setGmailSetupError(gmailOAuthConfigFailureMessage(null));
      }
      setGmailConnecting(false);
    }
  };
  const handlePrimaryAction = () => {
    const action = presentation().primaryActionKind;
    if (action === "approve_wording") {
      if (canApproveWording()) props.onApproveWording();
      return;
    }
    if (action === "acknowledge_budget") {
      if (!budgetAcknowledgementBlocked()) props.onAcknowledgeBudgetImpact();
      return;
    }
    if (action === "send") {
      if (canSendNow()) props.onSend();
      return;
    }
    if (action === "undo_send") {
      props.onUndo();
      return;
    }
    if (action === "view_sent_log") {
      props.onViewSentThread();
      return;
    }
    if (action === "save_reply") void saveCurrentDraft();
  };
  const handleSecondaryAction = () => {
    const action = presentation().secondaryActionKind;
    if (action === "view_quote") {
      setQuoteDetailsOpen(true);
      return;
    }
    if (action === "edit_reply") setForceReplyEditorOpen(true);
  };
  const handleHomeQuoteAction = () => {
    setHomeExpanded(true);
    setQuoteDetailsOpen(true);
  };
  const handleHomeReplyAction = () => {
    setHomeExpanded(true);
    setForceReplyEditorOpen(true);
  };
  onMount(() => {
    const unsubscribe = subscribeMagicActionEvent((detail) => {
      if (detail.msgId !== `wedding:quote-reply:${props.flow.id}:primary`) return;
      if (detail.action !== "quote-secondary") return;
      handleSecondaryAction();
    });
    onCleanup(unsubscribe);
  });
  const uiCopy = () => buildWeddingVendorQuoteReplyUiCopyState({
    flow: props.flow,
    sendGate: sendGate(),
    draftPersistence: draftPersistence(),
    proofPersistence: proofPersistence(),
    providerReadiness: providerReadiness(),
  });
  const contextualSurface = () => weddingVendorQuoteReplyContextualSurfaceState({
    flow: props.flow,
    dirtyState: dirtyState(),
    draftPersistence: draftPersistence(),
    primaryActionEnabled: !primaryActionDisabled(),
  });
  const draftPersistenceClass = () => {
    if (draftPersistence().tone === "success") return "border-emerald-200 bg-emerald-50/90 text-emerald-950";
    if (draftPersistence().tone === "warning") return "border-amber-200 bg-amber-50/90 text-amber-950";
    return "border-sky-100 bg-sky-50/80 text-sky-950";
  };
  const providerStatusClass = () => (
    providerReadiness()?.productionReady
      ? "border-emerald-100 bg-white/75 text-emerald-950"
      : "border-amber-200 bg-amber-50/90 text-amber-950"
  );
  const proofPersistenceClass = () => (
    proofPersistence()?.tone === "warning"
      ? "border-amber-200 bg-amber-50/90 text-amber-950"
      : "border-emerald-200 bg-emerald-50/90 text-emerald-950"
  );
  const attachmentEvidenceClass = () => {
    const status = props.attachmentParserState?.status;
    if (status === "already_extracted") return "border-emerald-200 bg-emerald-50/80 text-emerald-950";
    if (status === "request_ready") return "border-amber-200 bg-amber-50/90 text-amber-950";
    return "border-slate-200 bg-slate-50/90 text-slate-950";
  };
  const attachmentEvidenceDetail = () => {
    const parser = props.attachmentParserState;
    if (!parser) return null;
    if (parser.status === "request_ready") {
      return "The original file is saved, but its text still needs parser extraction before the recommendation can fully rely on the attachment.";
    }
    if (parser.status === "already_extracted") {
      return "The quote attachment text has been extracted and can be used as response evidence.";
    }
    return parser.blockerLabels[0] ?? "Attachment evidence is not available for parser extraction.";
  };
  const headingId = () => `vendor-quote-reply-${props.flow.threadId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const quoteDetailsId = () => `${headingId()}-quote-details`;

  return (
    <section class="min-w-0 rounded-[28px] border border-wedding-surface-blush bg-white p-5 shadow-sm sm:p-7" aria-labelledby={headingId()}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-bold uppercase tracking-[0.12em] text-wedding-accent">{presentation().eyebrowLabel}</p>
          <h3 id={headingId()} class="mt-2 break-words font-serif text-2xl font-semibold leading-8 text-wedding-text">{props.flow.title}</h3>
          <p class="mt-2 max-w-3xl break-words text-base leading-7 text-wedding-text">{props.flow.summary}</p>
        </div>
        <span class="max-w-full break-words rounded-full bg-wedding-surface-blush px-3 py-1 text-sm font-semibold text-wedding-accent">
          {props.flow.semanticObject.stateLabel}
        </span>
      </div>

      <div class={`mt-5 rounded-2xl border p-4 ${
        contextualSurface().surfaceWeight === "receipt"
          ? "border-wedding-surface-blush bg-wedding-surface-blush/55"
          : "border-wedding-surface-muted bg-wedding-surface-muted/75"
      }`}>
        <div class="grid gap-3 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
          <div class="min-w-0">
            <p class="text-xs font-bold uppercase tracking-[0.12em] text-wedding-muted">Status</p>
            <p class="mt-1 break-words text-sm font-semibold text-wedding-text">
              {contextualSurface().statusLabel}
            </p>
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-xs font-bold uppercase tracking-[0.12em] text-wedding-muted">Recommendation</p>
              <span class="rounded-full bg-white px-2 py-1 text-xs font-semibold text-wedding-text">
                {contextualSurface().confidenceLabel}
              </span>
            </div>
            <p class="mt-1 break-words text-sm font-semibold text-wedding-text">
              {contextualSurface().recommendationLabel}
            </p>
            <p class="mt-1 break-words text-sm leading-6 text-wedding-muted">
              {contextualSurface().rationaleLabel}
            </p>
          </div>
        </div>
        <Show when={contextualSurface().whyLabels.length > 0}>
          <div class="mt-4 rounded-2xl bg-white/80 p-3">
            <p class="text-xs font-bold uppercase tracking-[0.12em] text-wedding-muted">Why</p>
            <ul class="mt-1 grid gap-1 sm:grid-cols-2">
              <For each={contextualSurface().whyLabels.slice(0, 4)}>
                {(label) => <li class="break-words text-xs leading-5 text-wedding-muted">{label}</li>}
              </For>
            </ul>
          </div>
        </Show>
      </div>

      <Show when={compactHome()}>
        <div class="mt-5 border-t border-dashed border-wedding-surface-blush pt-4">
          <p class="text-sm font-bold uppercase tracking-[0.12em] text-wedding-muted">Quote summary</p>
          <dl class="mt-3 grid gap-3 text-sm text-wedding-muted sm:grid-cols-3">
            <div class="rounded-2xl bg-wedding-surface-muted p-4">
              <dt class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-muted">Total</dt>
              <dd class="mt-1 break-words text-lg font-bold text-wedding-text">{quote().amountLabel}</dd>
            </div>
            <div class="rounded-2xl bg-wedding-surface-muted p-4">
              <dt class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-muted">Valid until</dt>
              <dd class="mt-1 break-words text-lg font-bold text-wedding-text">{quote().validUntil ?? "Not stated"}</dd>
            </div>
            <div class="rounded-2xl bg-wedding-surface-muted p-4">
              <dt class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-muted">Vendor</dt>
              <dd class="mt-1 break-words text-lg font-bold text-wedding-text">{quote().vendorName}</dd>
            </div>
          </dl>
          <Show when={homeSurface().budgetImpactLabel}>
            {(budgetImpact) => (
              <p class="mt-3 break-words rounded-2xl bg-wedding-warm-note px-4 py-3 text-sm font-semibold leading-6 text-wedding-text">
                {budgetImpact()}
              </p>
            )}
          </Show>
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleHomeQuoteAction}
              data-magic-action="open"
              data-magic-icon="quote"
              data-magic-label="View normalized quote"
              data-magic-id={`wedding:quote-reply:${props.flow.id}:home-quote`}
              class="min-h-[44px] rounded-2xl border-2 border-wedding-accent bg-white px-5 py-3 text-sm font-bold text-wedding-text transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {homeSurface().quoteActionLabel}
            </button>
            <button
              type="button"
              onClick={handleHomeReplyAction}
              data-magic-action="open"
              data-magic-icon="edit"
              data-magic-label={homeSurface().replyActionLabel}
              data-magic-id={`wedding:quote-reply:${props.flow.id}:home-reply`}
              class="min-h-[44px] rounded-2xl border-2 border-wedding-cta bg-white px-5 py-3 text-sm font-bold text-wedding-text transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-cta focus:ring-offset-2"
            >
              {homeSurface().replyActionLabel}
            </button>
          </div>
        </div>
      </Show>

      <Show when={props.flow.stage === "sent"}>
        <div class="mt-4 rounded-xl border border-emerald-200 bg-white/85 p-3" role="status" aria-live="polite">
          <p class="text-sm font-semibold text-emerald-950">{props.flow.sentConfirmationLabel ?? "Reply sent."}</p>
          <p class="mt-1 text-sm leading-6 text-emerald-900/75">
            {uiCopy().sentStatusLabel}
          </p>
          <Show when={proofPersistence()}>
            {(proof) => (
              <div class={`mt-3 rounded-xl border p-3 ${proofPersistenceClass()}`} role={uiCopy().proofNoticeRole} aria-live={uiCopy().proofNoticeAriaLive}>
                <p class="text-sm font-semibold">{proof().label}</p>
                <p class="mt-1 break-words text-sm leading-6 opacity-80">{proof().detail}</p>
              </div>
            )}
          </Show>
          <button
            type="button"
            onClick={handlePrimaryAction}
            aria-label="View saved sent proof for this vendor reply"
            data-magic-action="open"
            data-magic-icon="proof"
            data-magic-label={proofPersistence()?.actionLabel ?? presentation().primaryActionLabel}
            data-magic-id={`wedding:quote-reply:${props.flow.id}:sent-proof`}
            class="mt-3 rounded-full border border-emerald-200 bg-emerald-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
          >
            {proofPersistence()?.actionLabel ?? presentation().primaryActionLabel}
          </button>
        </div>
      </Show>

      <Show when={props.flow.stage === "sending_undo_window"}>
        <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 p-3" role="status" aria-live="assertive">
          <p class="text-sm font-semibold text-amber-950">{presentation().undoTitle ?? "Sending soon"}</p>
          <p class="mt-1 text-sm leading-6 text-amber-900/80">
            {presentation().undoDetail ?? uiCopy().undoStatusLabel}
          </p>
          <button
            type="button"
            onClick={handlePrimaryAction}
            aria-label="Undo scheduled vendor email send"
            data-magic-action="dismiss"
            data-magic-icon="undo"
            data-magic-label={presentation().primaryActionLabel}
            data-magic-id={`wedding:quote-reply:${props.flow.id}:undo-send`}
            class="mt-3 rounded-full border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
          >
            {presentation().primaryActionLabel}
          </button>
        </div>
      </Show>

      <Show when={!compactHome() && props.flow.stage !== "sent" && props.flow.stage !== "sending_undo_window"}>
        <div class="mt-5 grid gap-4">
          <div class="border-t border-dashed border-wedding-surface-blush pt-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-bold uppercase tracking-[0.12em] text-wedding-muted">Quote summary</p>
              <span class="rounded-full bg-wedding-surface-muted px-2 py-1 text-xs font-semibold text-wedding-text">
                {quote().amountLabel}
              </span>
            </div>
            <dl class="mt-3 grid gap-3 text-sm text-wedding-muted sm:grid-cols-3">
              <div class="rounded-2xl bg-wedding-surface-muted p-4">
                <dt class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-muted">Total</dt>
                <dd class="mt-1 break-words text-lg font-bold text-wedding-text">{quote().amountLabel}</dd>
              </div>
              <div class="rounded-2xl bg-wedding-surface-muted p-4">
                <dt class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-muted">Valid until</dt>
                <dd class="mt-1 break-words text-lg font-bold text-wedding-text">{quote().validUntil ?? "Not stated"}</dd>
              </div>
              <div class="rounded-2xl bg-wedding-surface-muted p-4">
                <dt class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-muted">Vendor</dt>
                <dd class="mt-1 break-words text-lg font-bold text-wedding-text">{quote().vendorName}</dd>
              </div>
            </dl>
            <Show when={quote().budgetDeltaLabel}>
              {(budgetDelta) => (
                <p class="mt-3 break-words text-sm font-semibold text-wedding-text/85">
                  Budget impact: {budgetDelta()}
                </p>
              )}
            </Show>
            <Show
              when={quoteAttachmentUrl()}
              fallback={(
                <button
                  type="button"
                  onClick={() => setQuoteDetailsOpen((open) => !open)}
                  aria-expanded={quoteDetailsOpen()}
                  aria-controls={quoteDetailsId()}
                  data-magic-action="open"
                  data-magic-icon="quote"
                  data-magic-label={quoteDetailsOpen() ? "Hide quote details" : "Show quote details"}
                  data-magic-id={`wedding:quote-reply:${props.flow.id}:quote-details`}
                  class="mt-3 rounded-full border border-wedding-surface-blush bg-white px-3 py-1.5 text-sm font-semibold text-wedding-accent-dark transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-accent focus:ring-offset-2"
                >
                  {quoteDetailsOpen() ? "Hide quote details" : "Show quote details"}
                </button>
              )}
            >
              {(attachmentUrl) => (
                <a
                  href={attachmentUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-magic-action="open"
                  data-magic-icon="quote"
                  data-magic-label="Open quote file"
                  data-magic-id={`wedding:quote-reply:${props.flow.id}:quote-file`}
                  class="mt-3 inline-flex rounded-full border border-wedding-surface-blush bg-white px-3 py-1.5 text-sm font-semibold text-wedding-accent-dark transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-accent focus:ring-offset-2"
                >
                  Open quote file
                </a>
              )}
            </Show>
            <Show when={quoteDetailsOpen()}>
              <div id={quoteDetailsId()} class="mt-3">
                <WeddingNormalizedQuoteSummary quote={quote()} />
                <Show when={quoteAttachmentMessage()}>
                  {(message) => (
                    <div class="mt-3 rounded-xl border border-wedding-surface-muted bg-white p-3">
                      <p class="mb-2 text-sm font-semibold text-wedding-text">Original file</p>
                      <AttachmentsRenderer message={message()} />
                      <Show when={props.attachmentParserState}>
                        {(parser) => (
                          <div class={`mt-3 rounded-xl border p-3 ${attachmentEvidenceClass()}`} role="status" aria-live="polite">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                              <p class="break-words text-sm font-semibold">{parser().statusLabel}</p>
                              <span class="rounded-full bg-white/75 px-2 py-1 text-xs font-semibold">
                                {parser().ready ? "Parser ready" : parser().status === "already_extracted" ? "Extracted" : "Needs source"}
                              </span>
                            </div>
                            <Show when={attachmentEvidenceDetail()}>
                              {(detail) => <p class="mt-1 break-words text-sm leading-6 opacity-80">{detail()}</p>}
                            </Show>
                            <Show when={parser().fileName || parser().mimeType}>
                              <p class="mt-2 break-words text-xs leading-5 opacity-70">
                                {[parser().fileName, parser().mimeType].filter(Boolean).join(" - ")}
                              </p>
                            </Show>
                            <Show when={parser().ready && props.onParseAttachment}>
                              <button
                                type="button"
                                disabled={props.attachmentParsing}
                                onClick={() => props.onParseAttachment?.()}
                                data-magic-action="extract"
                                data-magic-icon="file-text"
                                data-magic-label="Extract quote text"
                                data-magic-id={`wedding:quote-reply:${props.flow.id}:extract-attachment`}
                                class="mt-3 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {props.attachmentParsing ? "Extracting..." : "Extract quote text"}
                              </button>
                            </Show>
                          </div>
                        )}
                      </Show>
                    </div>
                  )}
                </Show>
              </div>
            </Show>
          </div>

          <div class="min-w-0 border-t border-dashed border-wedding-surface-blush pt-4">
            <p class="text-sm font-bold uppercase tracking-[0.12em] text-wedding-muted">{presentation().replySectionLabel}</p>
            <p class="mt-1 text-sm leading-6 text-wedding-muted">
              {presentation().decisionPromptLabel}
            </p>
            <Show
              when={showReplyEditor()}
              fallback={(
                <div class="mt-3 rounded-2xl border border-wedding-surface-muted bg-white p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="break-words text-sm font-semibold text-wedding-text">
                      {presentation().readOnlyReplyLabel ?? "Reply wording is approved."}
                    </p>
                    <button
                      type="button"
                      disabled={props.busy}
                      onClick={() => setForceReplyEditorOpen(true)}
                      data-magic-action="open"
                      data-magic-icon="edit"
                      data-magic-label="Edit reply"
                      data-magic-id={`wedding:quote-reply:${props.flow.id}:edit-reply`}
                      class="rounded-full border border-wedding-surface-blush bg-white px-3 py-1.5 text-sm font-semibold text-wedding-accent-dark transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Edit reply
                    </button>
                  </div>
                  <p class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-sm leading-6 text-wedding-text/85">
                    {props.flow.draftBody}
                  </p>
                </div>
              )}
            >
              <div class="mt-3">
                <TiptapEditor
                  mode="email"
                  initialContent={draft()}
                  threadId={props.flow.threadId}
                  emailTo={props.recipient}
                  emailSubject={props.subject}
                  disabled={props.busy}
                  placeholder="Write the reply here."
                  submitLabel={props.busy ? "Saving..." : "Save reply"}
                  clearOnSend={false}
                  class="content-font-body"
                  onChange={(_text, markdown) => setDraft(markdown)}
                  onSend={async (payload) => {
                    setDraftSaveRequested(true);
                    setDraftSaveFeedback("Saving this reply to the wedding...");
                    setDraft(payload.markdown || payload.text);
                    try {
                      await props.onSaveDraft(payload);
                    } catch {
                      setDraftSaveFeedback("Could not confirm the save. The reply is still here; try saving again.");
                    }
                  }}
                />
              </div>
            </Show>

            <Show when={draftSaveFeedback()}>
              {(message) => (
                <div class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-emerald-950" role="status" aria-live="polite">
                  <p class="text-sm font-semibold">{message()}</p>
                </div>
              )}
            </Show>

            <Show when={dirtyState().dirty}>
              <div class="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-amber-950">
                <p class="text-sm font-semibold">Edited reply not saved yet</p>
                <p class="mt-1 text-sm leading-6 text-amber-900/80">
                  Save the reply again before approving or sending it.
                </p>
              </div>
            </Show>

            <Show when={props.draftPersistenceStatus && !dirtyState().dirty}>
              <div class={`mt-3 rounded-xl border p-3 ${draftPersistenceClass()}`} role={uiCopy().draftNoticeRole} aria-live={uiCopy().draftNoticeAriaLive}>
                <p class="text-sm font-semibold">{draftPersistence().label}</p>
                <p class="mt-1 text-sm leading-6 opacity-80">{draftPersistence().detail}</p>
              </div>
            </Show>

            <div class="mt-4 grid gap-3">
              <label class="flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold leading-5 text-emerald-950">
                <input
                  type="checkbox"
                  checked={wordingChecked()}
                  disabled={props.busy || dirtyState().dirty || draftPersistence().blocksApproval || draft().trim().length === 0}
                  onChange={(event) => {
                    setWordingChecked(event.currentTarget.checked);
                    if (!event.currentTarget.checked) {
                      props.onUnapproveWording?.();
                      return;
                    }
                    const consent = weddingVendorQuoteReplyConsentChangeState({
                      checked: event.currentTarget.checked,
                      blocked: !canApproveWording(),
                      alreadyRecorded: props.flow.approvedWording,
                    });
                    if (consent.shouldRecord) props.onApproveWording();
                  }}
                  class="mt-1 h-4 w-4 rounded border-emerald-300 text-emerald-700"
                />
                <span>I have reviewed the wording.</span>
              </label>
              <Show when={quote().budgetDeltaLabel}>
                <label class="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold leading-5 text-wedding-text">
                  <input
                    type="checkbox"
                    checked={budgetChecked()}
                    disabled={budgetAcknowledgementBlocked()}
                    onChange={(event) => {
                      setBudgetChecked(event.currentTarget.checked);
                      if (!event.currentTarget.checked) {
                        props.onUnacknowledgeBudgetImpact?.();
                        return;
                      }
                      const consent = weddingVendorQuoteReplyConsentChangeState({
                        checked: event.currentTarget.checked,
                        blocked: budgetAcknowledgementBlocked(),
                        alreadyRecorded: props.flow.budgetImpactAcknowledged,
                      });
                      if (consent.shouldRecord) props.onAcknowledgeBudgetImpact();
                    }}
                    class="mt-1 h-4 w-4 rounded border-emerald-300 text-emerald-700"
                  />
                  <span>{presentation().budgetAcknowledgementLabel}</span>
                </label>
              </Show>
            </div>

            <Show when={props.flow.failureMessage}>
              {(message) => (
                <div class="mt-3 rounded-xl border border-wedding-surface-blush bg-wedding-surface-blush p-3 text-wedding-accent-dark" role="alert" aria-live="assertive" data-telemetry-event={uiCopy().failureTelemetryEvent ?? undefined}>
                  <p class="text-sm font-semibold">{uiCopy().failureNoticeTitle}</p>
                  <p class="mt-1 break-words text-sm leading-6 text-wedding-accent/80">{message()}</p>
                </div>
              )}
            </Show>

            <Show when={providerReadiness()}>
              {(readiness) => (
                <div class={`mt-3 rounded-xl border p-3 ${providerStatusClass()}`} role={uiCopy().providerNoticeRole} aria-live={uiCopy().providerNoticeAriaLive}>
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="break-words text-sm font-semibold">{readiness().summary}</p>
                    <span class="rounded-full bg-white/75 px-2 py-1 text-xs font-semibold">
                      {readiness().productionReady ? "Ready" : "Setup needed"}
                    </span>
                  </div>
                  <p class="mt-1 break-words text-sm leading-6 opacity-80">{readiness().detail}</p>
                  <Show when={!readiness().productionReady && readiness().setupView}>
                    <button
                      type="button"
                      disabled={gmailConnecting()}
                      onClick={() => void connectGmailDirectly()}
                      aria-label="Connect Gmail"
                      data-magic-action="open"
                      data-magic-icon="setup"
                      data-magic-label="Connect Gmail"
                      data-magic-id={`wedding:quote-reply:${props.flow.id}:provider-setup`}
                      class="mt-3 rounded-full border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {gmailConnecting() ? "Connecting Gmail..." : "Connect Gmail"}
                    </button>
                  </Show>
                  <Show when={gmailSetupError()}>
                    {(message) => <p class="mt-2 break-words text-xs leading-5 text-amber-950/80">{message()}</p>}
                  </Show>
                </div>
              )}
            </Show>

            <div class="mt-3 flex flex-wrap gap-2">
              <p class="basis-full break-words text-sm leading-6 text-wedding-muted">
                {uiCopy().sendStatusCopy}
              </p>
              <button
                type="button"
                disabled={primaryActionDisabled()}
                onClick={handlePrimaryAction}
                aria-label={presentation().primaryActionLabel}
                data-magic-action={presentation().primaryActionKind === "send" ? "approve" : presentation().primaryActionKind === "undo_send" ? "dismiss" : "open"}
                data-magic-icon={presentation().primaryActionKind === "send" ? "send" : presentation().primaryActionKind === "approve_wording" ? "approve" : "action"}
                data-magic-label={props.busy ? props.busyLabel ?? "Working..." : presentation().primaryActionLabel}
                data-magic-alt-action={presentation().secondaryActionLabel ? "quote-secondary" : undefined}
                data-magic-alt-icon={presentation().secondaryActionKind === "edit_reply" ? "edit" : "quote"}
                data-magic-alt-label={presentation().secondaryActionLabel ?? undefined}
                data-magic-id={`wedding:quote-reply:${props.flow.id}:primary`}
                class="min-h-[44px] rounded-2xl border-2 border-wedding-cta bg-white px-5 py-3 text-sm font-bold text-wedding-text transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-cta focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-wedding-muted/20 sm:flex-1"
              >
                {props.busy ? props.busyLabel ?? "Working..." : presentation().primaryActionLabel}
              </button>
              <Show when={presentation().secondaryActionLabel}>
                {(label) => (
                  <button
                    type="button"
                    disabled={props.busy}
                    onClick={handleSecondaryAction}
                    aria-controls={presentation().secondaryActionKind === "view_quote" ? quoteDetailsId() : undefined}
                    data-magic-action="open"
                    data-magic-icon={presentation().secondaryActionKind === "edit_reply" ? "edit" : "quote"}
                    data-magic-label={label()}
                    data-magic-id={`wedding:quote-reply:${props.flow.id}:secondary`}
                    class="min-h-[44px] rounded-2xl border-2 border-wedding-accent bg-white px-5 py-3 text-sm font-bold text-wedding-text transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
                  >
                    {label()}
                  </button>
                )}
              </Show>
              <Show when={props.flow.stage === "blocked"}>
                <span class="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                  Needs connected app or approval
                </span>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </section>
  );
}
