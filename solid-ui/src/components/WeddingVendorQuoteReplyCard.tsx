// @locs-version: 1.0
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { AttachmentsRenderer } from "@/components/renderers/AttachmentsRenderer";
import type { EditorPayload } from "@/lib/editorPayload";
import type { WeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";
import { buildWeddingProviderSetupPresentationState } from "@/lib/weddingProviderSetupPresentationState";
import { weddingQuoteAttachmentMessageState } from "@/lib/weddingQuoteAttachmentMessageState";
import {
  weddingVendorQuoteReplyConsentChangeState,
  weddingVendorQuoteReplyDraftSyncState,
  weddingVendorQuoteReplyDraftPersistenceState,
  weddingVendorQuoteReplyEditorDirtyState,
  weddingVendorQuoteReplyPresentationState,
  weddingVendorQuoteReplyProofPersistenceState,
  weddingVendorQuoteReplySendGateState,
  type WeddingVendorQuoteReplyDraftPersistenceStatus,
  type WeddingVendorQuoteReplyFlowState,
} from "@/lib/weddingVendorQuoteReplyFlowState";
import { buildWeddingVendorQuoteReplyUiCopyState } from "@/lib/weddingVendorQuoteReplyUiState";
import { subscribeMagicActionEvent } from "@/lib/magicActionEvent";
import type { ViewName } from "@/lib/viewNames";

export function WeddingVendorQuoteReplyCard(props: {
  flow: WeddingVendorQuoteReplyFlowState;
  recipient: string;
  subject: string;
  draftBody: string;
  busy?: boolean;
  busyLabel?: string | null;
  draftPersistenceStatus?: WeddingVendorQuoteReplyDraftPersistenceStatus | null;
  proofSaveNotice?: string | null;
  providerReadiness?: WeddingProviderExecutorReadinessState | null;
  onSaveDraft: (payload: EditorPayload) => Promise<void> | void;
  onApproveWording: () => void;
  onAcknowledgeBudgetImpact: () => void;
  onSend: () => void;
  onUndo: () => void;
  onViewSentThread: () => void;
  onProviderSetup?: (view: ViewName) => void;
}) {
  const [draft, setDraft] = createSignal(props.draftBody);
  const [syncedDraftBody, setSyncedDraftBody] = createSignal(props.draftBody);
  const [forceReplyEditorOpen, setForceReplyEditorOpen] = createSignal(false);
  const [quoteDetailsOpen, setQuoteDetailsOpen] = createSignal(false);
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
    setQuoteDetailsOpen(false);
  });
  const quote = () => props.flow.quote;
  const quoteAttachmentMessage = () => weddingQuoteAttachmentMessageState({
    quote: quote(),
    threadId: props.flow.threadId,
  });
  const providerReadiness = () => props.providerReadiness ?? null;
  const providerSetup = () => {
    const readiness = providerReadiness();
    return readiness ? buildWeddingProviderSetupPresentationState(readiness) : null;
  };
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
  const budgetAcknowledgementBlocked = () => props.busy || props.flow.budgetImpactAcknowledged;
  const primaryActionDisabled = () => {
    if (props.busy) return true;
    const action = presentation().primaryActionKind;
    if (action === "approve_wording") return !canApproveWording();
    if (action === "acknowledge_budget") return budgetAcknowledgementBlocked();
    if (action === "send") return !canSendNow();
    if (action === "undo_send" || action === "view_sent_log" || action === "save_reply") return false;
    return true;
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
    if (action === "save_reply") setForceReplyEditorOpen(true);
  };
  const handleSecondaryAction = () => {
    const action = presentation().secondaryActionKind;
    if (action === "view_quote") {
      setQuoteDetailsOpen(true);
      return;
    }
    if (action === "edit_reply") setForceReplyEditorOpen(true);
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
  const headingId = () => `vendor-quote-reply-${props.flow.threadId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const quoteDetailsId = () => `${headingId()}-quote-details`;

  return (
    <section class="min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 shadow-sm" aria-labelledby={headingId()}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase text-emerald-800/70">{presentation().eyebrowLabel}</p>
          <h3 id={headingId()} class="mt-1 break-words text-lg font-semibold text-emerald-950">{props.flow.title}</h3>
          <p class="mt-1 max-w-3xl break-words text-sm leading-6 text-emerald-900/75">{props.flow.summary}</p>
        </div>
        <span class="max-w-full break-words rounded-full bg-white/85 px-3 py-1 text-sm font-semibold text-emerald-950">
          {props.flow.semanticObject.stateLabel}
        </span>
      </div>

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

      <Show when={props.flow.stage !== "sent" && props.flow.stage !== "sending_undo_window"}>
        <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div class="rounded-xl border border-emerald-100 bg-white/85 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-semibold text-emerald-950">Quote</p>
              <span class="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-950">
                {quote().amountLabel}
              </span>
            </div>
            <dl class="mt-3 grid gap-2 text-sm text-emerald-900/80">
              <div>
                <dt class="text-xs font-semibold uppercase text-emerald-800/60">Vendor</dt>
                <dd class="break-words font-semibold text-emerald-950">{quote().vendorName}</dd>
              </div>
              <div>
                <dt class="text-xs font-semibold uppercase text-emerald-800/60">Budget impact</dt>
                <dd class="break-words font-semibold text-emerald-950">{quote().budgetDeltaLabel ?? "Not measured yet"}</dd>
              </div>
              <div>
                <dt class="text-xs font-semibold uppercase text-emerald-800/60">Valid until</dt>
                <dd class="break-words">{quote().validUntil ?? "Not stated"}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setQuoteDetailsOpen((open) => !open)}
              aria-expanded={quoteDetailsOpen()}
              aria-controls={quoteDetailsId()}
              data-magic-action="open"
              data-magic-icon="quote"
              data-magic-label={quoteDetailsOpen() ? "Hide quote details" : "See the quote"}
              data-magic-id={`wedding:quote-reply:${props.flow.id}:quote-details`}
              class="mt-3 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              {quoteDetailsOpen() ? "Hide quote details" : "See the quote"}
            </button>
            <div class="mt-3 rounded-xl border border-emerald-100 bg-white/80 p-3">
              <p class="text-sm font-semibold text-emerald-950">Recommendation</p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span class="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-950">
                  {props.flow.recommendationLabel}
                </span>
                <span class="rounded-full bg-white px-2 py-1 text-xs font-semibold text-emerald-900">
                  {props.flow.recommendationConfidenceLabel}
                </span>
              </div>
              <p class="mt-1 break-words text-sm leading-6 text-emerald-900/75">
                {props.flow.recommendationRationale}
              </p>
              <Show when={props.flow.recommendationWhyLabels.length > 0}>
                <div class="mt-3 rounded-lg bg-emerald-50/75 p-2">
                  <p class="text-xs font-semibold uppercase text-emerald-800/60">Why</p>
                  <ul class="mt-1 space-y-1">
                    <For each={props.flow.recommendationWhyLabels.slice(0, 5)}>
                      {(label) => <li class="break-words text-xs leading-5 text-emerald-900/75">{label}</li>}
                    </For>
                  </ul>
                </div>
              </Show>
            </div>
            <Show when={quoteDetailsOpen()}>
              <div id={quoteDetailsId()} class="mt-3">
                <Show when={quote().inclusions.length > 0}>
                  <div class="rounded-lg bg-emerald-50/75 p-2">
                    <p class="text-xs font-semibold uppercase text-emerald-800/60">Included</p>
                    <ul class="mt-1 space-y-1">
                      <For each={quote().inclusions}>
                        {(item) => <li class="break-words text-sm leading-5 text-emerald-900/75">{item}</li>}
                      </For>
                    </ul>
                  </div>
                </Show>
                <Show when={quoteAttachmentMessage()}>
                  {(message) => (
                    <div class="mt-3 rounded-xl border border-emerald-100 bg-white/80 p-3">
                      <p class="mb-2 text-sm font-semibold text-emerald-950">Original file</p>
                      <AttachmentsRenderer message={message()} />
                    </div>
                  )}
                </Show>
              </div>
            </Show>
          </div>

          <div class="min-w-0 rounded-xl border border-emerald-100 bg-white/85 p-3">
            <p class="text-sm font-semibold text-emerald-950">{presentation().replySectionLabel}</p>
            <p class="mt-1 text-sm leading-6 text-emerald-900/75">
              {presentation().decisionPromptLabel}
            </p>
            <Show
              when={showReplyEditor()}
              fallback={(
                <div class="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="break-words text-sm font-semibold text-emerald-950">
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
                      class="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Edit reply
                    </button>
                  </div>
                  <p class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white/80 p-3 text-sm leading-6 text-emerald-900/75">
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
                    setDraft(payload.markdown || payload.text);
                    await props.onSaveDraft(payload);
                  }}
                />
              </div>
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

            <div class="mt-3 grid gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
              <label class="flex items-start gap-2 text-sm leading-5 text-emerald-950">
                <input
                  type="checkbox"
                  checked={props.flow.approvedWording}
                  disabled={!canApproveWording()}
                  onChange={(event) => {
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
                <label class="flex items-start gap-2 text-sm leading-5 text-emerald-950">
                  <input
                    type="checkbox"
                    checked={props.flow.budgetImpactAcknowledged}
                    disabled={budgetAcknowledgementBlocked()}
                    onChange={(event) => {
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
                <div class="mt-3 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-rose-950" role="alert" aria-live="assertive" data-telemetry-event={uiCopy().failureTelemetryEvent ?? undefined}>
                  <p class="text-sm font-semibold">{uiCopy().failureNoticeTitle}</p>
                  <p class="mt-1 break-words text-sm leading-6 text-rose-900/80">{message()}</p>
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
                    {(view) => (
                      <button
                        type="button"
                        onClick={() => props.onProviderSetup?.(view())}
                        aria-label={`Open setup for ${readiness().requiredProvider ?? "connected app"}`}
                        data-magic-action="open"
                        data-magic-icon="setup"
                        data-magic-label={providerSetup()?.buttonLabel ?? "Open setup"}
                        data-magic-id={`wedding:quote-reply:${props.flow.id}:provider-setup`}
                        class="mt-3 rounded-full border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
                      >
                        {providerSetup()?.buttonLabel ?? "Open setup"}
                      </button>
                    )}
                  </Show>
                </div>
              )}
            </Show>

            <div class="mt-3 flex flex-wrap gap-2">
              <p class="basis-full break-words text-sm leading-6 text-emerald-900/75">
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
                class="rounded-full bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-emerald-300"
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
                    class="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
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
