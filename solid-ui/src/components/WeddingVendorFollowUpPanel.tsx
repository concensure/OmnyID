// @locs-version: 2.1
import { createSignal, For, Show } from "solid-js";

import { WeddingVendorOutreachComposer } from "@/components/WeddingVendorOutreachComposer";
import type {
  WeddingResponseWorkspaceViewState,
  WeddingVendorContactWorkspaceCard,
} from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingVendorPursuitLogCard } from "@/lib/weddingVendorPursuitLogPresentationState";
import type { WeddingVendorQuoteReplyFlowState } from "@/lib/weddingVendorQuoteReplyFlowState";
import {
  weddingVendorFollowUpAlertLabel,
  weddingVendorFollowUpCardHeadline,
  weddingVendorFollowUpCardRationale,
} from "@/lib/weddingVendorFollowUpPanelPresentationState";
import {
  weddingVendorFollowUpOutreachChoiceId,
  weddingVendorFollowUpPrimaryAction,
  weddingVendorRecordReplyAction,
} from "@/lib/weddingVendorFollowUpPanelActionState";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";
import { weddingVendorOutreachSentLabel } from "@/lib/weddingVendorOutreachFlowState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { AfpAttachment } from "@/lib/api";
import type { WeddingVendorEnquiryPermissions } from "@/lib/weddingVendorEnquiryPermissionsState";
import { WeddingTrustInfoTip } from "@/components/WeddingTrustInfoTip";
import { WeddingConfirmDialog } from "@/components/WeddingConfirmDialog";

function localToday(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function VendorContactChip(props: { label: string; value: string | null; kind: "address" | "email" | "phone" }) {
  const [open, setOpen] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  function copyValue() {
    const value = props.value;
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <div class="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open()}
        class="max-w-full break-words rounded-full border border-wedding-muted/50 bg-white px-2.5 py-1 text-xs font-semibold text-wedding-accent-dark transition hover:border-wedding-accent hover:bg-wedding-surface-blush"
      >
        {props.label}
      </button>
      <Show when={open()}>
        <div class="mt-1 flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-wedding-muted/30 bg-wedding-surface-muted px-2 py-1.5">
          <span class="break-words text-xs leading-5 text-wedding-text">
            {props.value ?? `No ${props.kind === "address" ? "address" : props.kind} on file`}
          </span>
          <Show when={props.value}>
            <button
              type="button"
              onClick={copyValue}
              class="min-h-11 shrink-0 rounded-full border border-wedding-accent bg-white px-2 text-[11px] font-semibold text-wedding-text transition hover:bg-wedding-surface-blush"
            >
              {copied() ? "Copied" : "Copy"}
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function followUpTasksAction(card: WeddingVendorContactWorkspaceCard): WeddingWorkspaceSidebarAction {
  return {
    kind: "open_tasks",
    label: "Open follow-up tasks",
    enabled: true,
    reason: null,
    metadata: {
      wedding_vendor_follow_up_tasks: {
        vendor_id: card.vendorId,
        vendor_name: card.vendorName,
        stage: card.stage,
      },
    },
    contextLabels: [card.vendorName, card.nextActionLabel],
  };
}

function closedVendorSourceAction(card: WeddingVendorPursuitLogCard): WeddingWorkspaceSidebarAction {
  return {
    kind: "open_tasks",
    label: "Open vendor history",
    enabled: true,
    reason: null,
    metadata: {
      wedding_vendor_pursuit_log: {
        vendor_name: card.vendorLabel,
        reason: card.reasonLabel,
        closed_at: card.closedAtIso,
      },
    },
    contextLabels: [card.vendorLabel, card.reasonLabel, card.closedAtLabel ?? "Closed"],
  };
}

export function WeddingVendorFollowUpPanel(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
  onViewQuoteReplyProof?: (flow: WeddingVendorQuoteReplyFlowState) => void;
  vendorOutreachFlows: Record<string, WeddingVendorOutreachFlowState>;
  gmailConnected: boolean;
  onOpenOutreachComposer: (card: WeddingVendorContactWorkspaceCard) => void;
  onOutreachBodyChange: (choiceId: string, bodyMarkdown: string, bodyHtml?: string) => void;
  onOutreachRecipientChange: (choiceId: string, email: string) => void;
  onOutreachAttachmentsChange: (choiceId: string, attachments: AfpAttachment[]) => void;
  onOutreachPermissionsChange: (choiceId: string, permissions: WeddingVendorEnquiryPermissions) => void;
  onRetryOutreach: (choiceId: string) => void;
  onSendOutreach: (choiceId: string) => void;
  onCancelOutreach: (choiceId: string) => void;
  onConnectGmailForOutreach: () => void;
  onSetFollowUpDate: (card: WeddingVendorContactWorkspaceCard, date: string) => Promise<boolean>;
  onDismissFollowUp: (card: WeddingVendorContactWorkspaceCard) => Promise<boolean>;
}) {
  const activeCards = () => props.state.vendorContactCards.filter((card) => {
    if (!card.followUpDueAt || card.actionMode !== "waiting") return true;
    const dueAt = Date.parse(card.followUpDueAt);
    return !Number.isFinite(dueAt) || dueAt <= Date.now();
  });
  const alertLabel = () => weddingVendorFollowUpAlertLabel(activeCards().length);
  const hasHistory = () => props.state.vendorPursuitLogCards.length > 0 || props.state.vendorQuoteReplyLogFlows.length > 0;

  return (
    <div class="min-w-0 rounded-[28px] border border-wedding-surface-muted bg-wedding-surface p-4 shadow-card sm:p-5">
      <Show when={alertLabel()}>
        {(label) => (
          <div class="mb-3 inline-flex items-center gap-2 rounded-full bg-wedding-surface-blush px-3 py-1.5">
            <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-wedding-accent" aria-hidden="true" />
            <span class="text-xs font-semibold text-wedding-text">{label()}</span>
          </div>
        )}
      </Show>

      <Show
        when={activeCards().length > 0}
        fallback={
          <Show when={!hasHistory()}>
            <p class="text-sm leading-6 text-wedding-muted">
              Selected vendors will appear here after outreach or reply tracking starts.
            </p>
          </Show>
        }
      >
        <div class="space-y-3 sm:space-y-4">
          <For each={activeCards()}>
            {(card) => {
              let followUpDateInput: HTMLInputElement | undefined;
              const rationale = () => weddingVendorFollowUpCardRationale(card);
              const outreachChoiceId = () => weddingVendorFollowUpOutreachChoiceId(card);
              const outreachFlow = () => props.vendorOutreachFlows[outreachChoiceId()] ?? null;
              const [followUpDate, setFollowUpDate] = createSignal(card.followUpDueAt?.slice(0, 10) ?? "");
              const [dateSaving, setDateSaving] = createSignal(false);
              const [dateNotice, setDateNotice] = createSignal<string | null>(null);
              const [dismissOpen, setDismissOpen] = createSignal(false);
              const [dismissBusy, setDismissBusy] = createSignal(false);
              const saveFollowUpDate = async () => {
                if (!followUpDate() || dateSaving()) return;
                setDateSaving(true); setDateNotice(null);
                const saved = await props.onSetFollowUpDate(card, followUpDate());
                setDateSaving(false); setDateNotice(saved ? "Follow-up date saved." : "Couldn't save that date. Please try again.");
              };
              return (
                <article class="select-text rounded-2xl border border-wedding-muted/25 bg-white p-3 py-3 sm:p-4 sm:py-4">
                  <p class="inline-flex rounded-full border border-wedding-accent bg-wedding-surface-blush px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-wedding-text shadow-sm">
                    Needs your response
                  </p>
                  <h3 class="mt-1 break-words font-serif text-xl font-bold leading-7 text-wedding-text sm:text-2xl">
                    {weddingVendorFollowUpCardHeadline(card)}
                  </h3>
                  <p class="mt-2 break-words text-sm leading-6 text-wedding-text/85">{card.detailLabel}</p>

                  <div class="mt-3 grid gap-2 sm:grid-cols-2">
                    <div class="rounded-xl border border-wedding-muted/20 bg-wedding-surface-muted px-2.5 py-2">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-wedding-muted">Last contact</p>
                      <p class="mt-1 text-xs leading-5 text-wedding-text">
                        <strong>{card.lastContactLabel ?? "Not recorded"}</strong>
                      </p>
                    </div>
                    <label class="rounded-xl border border-wedding-muted/20 bg-wedding-surface-muted px-2.5 py-2">
                      <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-wedding-muted">Follow-up date</span>
                      <div class="mt-1 flex gap-1">
                        <input
                          ref={(element) => { followUpDateInput = element; }}
                          type="date"
                          min={localToday()}
                          value={followUpDate()}
                          onInput={(event) => { setFollowUpDate(event.currentTarget.value); setDateNotice(null); }}
                          onChange={() => void saveFollowUpDate()}
                          class="block min-h-10 min-w-0 flex-1 cursor-text select-text rounded-lg border border-wedding-muted/35 bg-white px-2 text-xs font-semibold text-wedding-text outline-none focus:border-wedding-cta focus:ring-2 focus:ring-wedding-surface-blush"
                          aria-label={`Follow-up date for ${card.vendorName}`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            followUpDateInput?.focus();
                            followUpDateInput?.showPicker?.();
                          }}
                          class="min-h-10 shrink-0 rounded-lg border border-wedding-muted/35 bg-white px-2 text-xs font-semibold text-wedding-text hover:bg-wedding-surface-blush"
                          aria-label={`Set reminder for ${card.vendorName}`}
                        >
                          Remind
                        </button>
                        <button type="button" disabled={!followUpDate() || dateSaving()} onClick={() => void saveFollowUpDate()} class="min-h-10 shrink-0 rounded-lg bg-wedding-primary px-2 text-xs font-semibold text-wedding-page disabled:opacity-50">{dateSaving() ? "Saving…" : "Save"}</button>
                      </div>
                      <Show when={dateNotice()}>{(notice) => <span class="mt-1 block text-[11px] text-wedding-ink" role="status">{notice()}</span>}</Show>
                    </label>
                  </div>

                  <div class="mt-3 rounded-xl border border-wedding-muted/15 bg-wedding-surface-muted px-3 py-2">
                    <p class="text-xs leading-5 text-wedding-text">
                      <span class="font-semibold">{rationale() ? "" : "Why we suggest this: "}</span>
                      {rationale() ?? "still reviewing — nothing concrete recorded for this vendor yet."}
                    </p>
                  </div>

                  <Show when={card.contactChips.length > 0}>
                    <div class="mt-3 flex flex-wrap items-start gap-1.5">
                      <For each={card.contactChips}>
                        {(chip) => <VendorContactChip label={chip.label} value={chip.value} kind={chip.kind} />}
                      </For>
                    </div>
                  </Show>

                  <Show
                    when={card.actionMode !== "reply_recorded"}
                    fallback={
                      <>
                        <button type="button" class="mt-3 min-h-[44px] w-full rounded-2xl border-2 border-wedding-cta bg-white px-5 py-3 text-sm font-bold text-wedding-text shadow-md transition hover:bg-wedding-surface-blush" onClick={() => props.onOpenOutreachComposer(card)}>
                          Reply to {card.vendorName}
                        </button>
                        <Show when={outreachFlow()}>
                          {(flow) => <WeddingVendorOutreachComposer flow={flow()} busy={flow().stage === "drafting" || flow().stage === "sending"} gmailConnected={props.gmailConnected} vendorWebsiteUrl={card.websiteUrl} onBodyChange={(body, html) => props.onOutreachBodyChange(outreachChoiceId(), body, html)} onRecipientChange={(email) => props.onOutreachRecipientChange(outreachChoiceId(), email)} onAttachmentsChange={(attachments) => props.onOutreachAttachmentsChange(outreachChoiceId(), attachments)} onPermissionsChange={(permissions) => props.onOutreachPermissionsChange(outreachChoiceId(), permissions)} onRegenerateDraft={() => props.onRetryOutreach(outreachChoiceId())} onSend={() => props.onSendOutreach(outreachChoiceId())} onCancel={() => props.onCancelOutreach(outreachChoiceId())} onConnectGmail={() => props.onConnectGmailForOutreach()} />}
                        </Show>
                      </>
                    }
                  >
                    <Show
                      when={card.actionMode === "follow_up"}
                      fallback={
                        <button
                          type="button"
                          class="mt-3 min-h-[44px] w-full rounded-2xl border-2 border-wedding-cta bg-white px-5 py-3 text-sm font-bold text-wedding-text shadow-md transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-cta focus:ring-offset-2"
                          data-magic-action="follow-up"
                          data-magic-icon="send"
                          data-magic-label={card.primaryActionLabel}
                          data-magic-id={`wedding:vendor-follow-up:${card.id}:primary`}
                          onClick={() => props.onSidebarAction(weddingVendorFollowUpPrimaryAction(card))}
                        >
                          {card.primaryActionLabel}
                        </button>
                      }
                    >
                      <Show
                        when={outreachFlow()?.stage === "sent"}
                        fallback={
                          <button
                            type="button"
                            class="mt-3 min-h-[44px] w-full rounded-2xl border-2 border-wedding-cta bg-white px-5 py-3 text-sm font-bold text-wedding-text shadow-md transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-cta focus:ring-offset-2"
                            data-magic-action="follow-up"
                            data-magic-icon="send"
                            data-magic-label={card.primaryActionLabel}
                            data-magic-id={`wedding:vendor-follow-up:${card.id}:primary`}
                            onClick={() => props.onOpenOutreachComposer(card)}
                          >
                            {card.primaryActionLabel}
                          </button>
                        }
                      >
                        <p class="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/80 px-2.5 py-2 text-xs leading-5 text-emerald-950">
                          {`✓ ${weddingVendorOutreachSentLabel({ sentAtIso: outreachFlow()?.sentAtIso ?? null })}`}
                        </p>
                      </Show>
                      <Show when={outreachFlow()}>
                        {(flow) => (
                          <WeddingVendorOutreachComposer
                            flow={flow()}
                            busy={flow().stage === "drafting" || flow().stage === "sending"}
                            gmailConnected={props.gmailConnected}
                            vendorWebsiteUrl={card.websiteUrl}
                            onBodyChange={(bodyMarkdown, bodyHtml) => props.onOutreachBodyChange(outreachChoiceId(), bodyMarkdown, bodyHtml)}
                            onRecipientChange={(email) => props.onOutreachRecipientChange(outreachChoiceId(), email)}
                            onAttachmentsChange={(attachments) => props.onOutreachAttachmentsChange(outreachChoiceId(), attachments)}
                            onPermissionsChange={(permissions) => props.onOutreachPermissionsChange(outreachChoiceId(), permissions)}
                            onRegenerateDraft={() => props.onRetryOutreach(outreachChoiceId())}
                            onSend={() => props.onSendOutreach(outreachChoiceId())}
                            onCancel={() => props.onCancelOutreach(outreachChoiceId())}
                            onConnectGmail={() => props.onConnectGmailForOutreach()}
                          />
                        )}
                      </Show>
                      <Show when={card.actionMode === "waiting"}>
                        <WeddingTrustInfoTip
                          class="mt-3"
                          label="If this vendor does not reply"
                          items={[{ question: "What happens next?", answer: "Your reminder stays in OmnyID. You can send one reviewed follow-up, choose another shortlisted vendor, or close the enquiry. OmnyID does not repeatedly contact them on its own." }]}
                        />
                      </Show>
                    </Show>
                    <div class="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Show when={card.actionMode === "waiting"}>
                        <button
                          type="button"
                          class="min-h-[44px] w-full rounded-2xl border-2 border-wedding-accent bg-white px-4 py-3 text-sm font-bold text-wedding-text shadow-md transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-accent focus:ring-offset-2 sm:w-auto sm:flex-1"
                          data-magic-action="record-reply"
                          data-magic-icon="reply"
                          data-magic-label="Record reply"
                          data-magic-id={`wedding:vendor-follow-up:${card.id}:record-reply`}
                          onClick={() => props.onSidebarAction(weddingVendorRecordReplyAction(card))}
                        >
                          Record reply
                        </button>
                      </Show>
                      <button
                        type="button"
                        class="min-h-[44px] w-full rounded-2xl border-2 border-wedding-accent bg-white px-4 py-3 text-sm font-bold text-wedding-text shadow-md transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-accent focus:ring-offset-2 sm:w-auto sm:flex-1"
                        data-magic-action="open"
                        data-magic-icon="tasks"
                        data-magic-label="Open follow-up tasks"
                        data-magic-id={`wedding:vendor-follow-up:${card.id}:tasks`}
                        onClick={() => props.onSidebarAction(followUpTasksAction(card))}
                      >
                        Open follow-up tasks
                      </button>
                      <button
                        type="button"
                        class="min-h-[44px] w-full rounded-2xl border-2 border-wedding-muted/60 bg-white px-4 py-3 text-sm font-bold text-wedding-text shadow-sm transition hover:bg-wedding-surface-muted focus:outline-none focus:ring-2 focus:ring-wedding-muted sm:w-auto sm:flex-1"
                        onClick={() => setDismissOpen(true)}
                      >
                        Close follow-up
                      </button>
                    </div>
                    <WeddingConfirmDialog
                      open={dismissOpen()}
                      title={`Close the ${card.vendorName} follow-up?`}
                      detail="This removes the message from Today and the response queue permanently. The closure stays in your private wedding record, but OmnyID will not bring this follow-up back."
                      confirmLabel="Close permanently"
                      destructive
                      busy={dismissBusy()}
                      onCancel={() => setDismissOpen(false)}
                      onConfirm={() => {
                        setDismissBusy(true);
                        void props.onDismissFollowUp(card).then((saved) => {
                          setDismissBusy(false);
                          if (saved) setDismissOpen(false);
                        });
                      }}
                    />
                  </Show>
                </article>
              );
            }}
          </For>
        </div>
      </Show>

      <Show when={hasHistory()}>
        <details class="mt-4 rounded-2xl border border-wedding-surface-muted bg-white/60 p-3 [&_summary]:cursor-pointer">
          <summary class="text-sm font-semibold text-wedding-text">
            Resolved vendor history
          </summary>
          <div class="mt-3 space-y-4">
            <Show when={props.state.vendorPursuitLogCards.length > 0}>
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.12em] text-wedding-muted">
                  Vendor history — {props.state.vendorPursuitLogCards.length} closed
                </p>
                <div class="mt-2 divide-y divide-wedding-surface-muted sm:space-y-2 sm:divide-y-0">
                  <For each={props.state.vendorPursuitLogCards}>
                    {(card) => (
                      <article class="border-0 bg-transparent px-0 py-2 first:pt-0 sm:rounded-xl sm:border sm:border-wedding-surface-muted sm:bg-wedding-surface-muted/40 sm:px-2.5">
                        <div class="flex items-start justify-between gap-2">
                          <div class="min-w-0">
                            <p class="break-words text-sm font-semibold text-wedding-text">{card.vendorLabel}</p>
                            <p class="mt-0.5 text-xs leading-5 text-wedding-muted">{card.reasonLabel}</p>
                          </div>
                          <span class="max-w-full shrink-0 break-words rounded-full bg-white px-2 py-1 text-xs font-semibold text-wedding-muted">
                            {card.closedAtLabel ?? "Closed"}
                          </span>
                        </div>
                        <p class="mt-2 text-xs leading-5 text-wedding-text/80">{card.detailLabel}</p>
                        <Show when={card.noteLabel}>
                          {(note) => (
                            <p class="mt-2 rounded-lg border border-wedding-surface-muted bg-white px-2 py-1.5 text-xs leading-5 text-wedding-text">
                              {note()}
                            </p>
                          )}
                        </Show>
                        <button
                          type="button"
                          class="mt-2 rounded-full border border-wedding-surface-muted bg-white px-3 py-2 text-xs font-semibold text-wedding-text transition hover:bg-wedding-surface-blush"
                          data-magic-action="open"
                          data-magic-icon="history"
                          data-magic-label="Open vendor history"
                          data-magic-id={`wedding:vendor-history:${card.id}:source`}
                          onClick={() => props.onSidebarAction(closedVendorSourceAction(card))}
                        >
                          Open vendor history
                        </button>
                      </article>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <Show when={props.state.vendorQuoteReplyLogFlows.length > 0}>
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.12em] text-wedding-muted">
                  Sent quote replies — {props.state.vendorQuoteReplyLogFlows.length} sent
                </p>
                <div class="mt-2 divide-y divide-wedding-surface-muted sm:space-y-2 sm:divide-y-0">
                  <For each={props.state.vendorQuoteReplyLogFlows}>
                    {(flow) => (
                      <article class="border-0 bg-transparent px-0 py-2 first:pt-0 sm:rounded-xl sm:border sm:border-wedding-surface-muted sm:bg-wedding-surface-muted/40 sm:px-2.5">
                        <div class="flex flex-wrap items-start justify-between gap-2">
                          <div class="min-w-0">
                            <p class="break-words text-sm font-semibold text-wedding-text">{flow.quote.vendorName}</p>
                            <p class="mt-0.5 text-xs leading-5 text-wedding-muted">
                              {flow.sentConfirmationLabel ?? "Reply sent."}
                            </p>
                          </div>
                          <span class="max-w-full shrink-0 break-words rounded-full bg-white px-2 py-1 text-xs font-semibold text-wedding-muted">
                            {flow.sentReceiptId ? "Proof ready" : "Proof pending"}
                          </span>
                        </div>
                        <p class="mt-2 break-words text-xs leading-5 text-wedding-text/80">{flow.summary}</p>
                        <button
                          type="button"
                          class="mt-2 rounded-full border border-wedding-surface-muted bg-white px-3 py-2 text-xs font-semibold text-wedding-text transition hover:bg-wedding-surface-blush disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!props.onViewQuoteReplyProof}
                          data-magic-action="open"
                          data-magic-icon="proof"
                          data-magic-label="View sent proof"
                          data-magic-id={`wedding:sent-quote-reply:${flow.id}:proof`}
                          onClick={() => props.onViewQuoteReplyProof?.(flow)}
                        >
                          View sent proof
                        </button>
                      </article>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </details>
      </Show>
    </div>
  );
}
