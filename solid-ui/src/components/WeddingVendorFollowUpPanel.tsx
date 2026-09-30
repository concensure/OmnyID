// @locs-version: 2.1
import { For, Show } from "solid-js";

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
  weddingVendorFollowUpPrimaryAction,
  weddingVendorRecordReplyAction,
} from "@/lib/weddingVendorFollowUpPanelActionState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

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
}) {
  const activeCards = () => props.state.vendorContactCards;
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
        <div class="divide-y divide-wedding-surface-muted sm:space-y-4 sm:divide-y-0">
          <For each={activeCards()}>
            {(card) => {
              const rationale = () => weddingVendorFollowUpCardRationale(card);
              return (
                <article class="border-0 bg-transparent p-0 py-3 first:pt-0 sm:rounded-2xl sm:border sm:border-wedding-surface-muted sm:bg-white/70 sm:p-4 sm:py-4">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-wedding-accent">
                    Needs your decision
                  </p>
                  <h3 class="mt-1 break-words font-serif text-xl font-bold leading-7 text-wedding-text sm:text-2xl">
                    {weddingVendorFollowUpCardHeadline(card)}
                  </h3>
                  <p class="mt-2 break-words text-sm leading-6 text-wedding-text/85">{card.detailLabel}</p>

                  <div class="mt-3 grid gap-2 sm:grid-cols-2">
                    <div class="rounded-xl border border-wedding-surface-muted bg-wedding-surface-muted/60 px-2.5 py-2">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-wedding-muted">Last contact</p>
                      <p class="mt-1 text-xs leading-5 text-wedding-text">
                        <strong>{card.lastContactLabel ?? "Not recorded"}</strong>
                      </p>
                    </div>
                    <div class="rounded-xl border border-wedding-surface-muted bg-wedding-surface-muted/60 px-2.5 py-2">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-wedding-muted">Follow-up date</p>
                      <p class="mt-1 text-xs leading-5 text-wedding-text">
                        <strong>{card.followUpDueLabel ?? "No date set"}</strong>
                      </p>
                    </div>
                  </div>

                  <div class="mt-3 rounded-xl bg-wedding-surface-muted px-3 py-2">
                    <p class="text-xs leading-5 text-wedding-text">
                      <span class="font-semibold">{rationale() ? "" : "Why we suggest this: "}</span>
                      {rationale() ?? "still reviewing — nothing concrete recorded for this vendor yet."}
                    </p>
                  </div>

                  <Show when={card.metadataLabels.length > 0}>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      <For each={card.metadataLabels.slice(0, 4)}>
                        {(label) => (
                          <span class="max-w-full break-words rounded-full border border-wedding-surface-muted bg-white px-2 py-1 text-xs text-wedding-muted">
                            {label}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>

                  <Show
                    when={card.actionMode !== "reply_recorded"}
                    fallback={
                      <p class="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/80 px-2.5 py-2 text-xs leading-5 text-emerald-950">
                        Reply recorded{card.replyLabel ? ` on ${card.replyLabel}` : ""}. Follow-up is paused; continue from the vendor response.
                      </p>
                    }
                  >
                    <button
                      type="button"
                      class="mt-3 w-full rounded-2xl bg-wedding-cta px-5 py-3 text-sm font-bold text-white transition hover:bg-wedding-cta-hover focus:outline-none focus:ring-2 focus:ring-wedding-cta focus:ring-offset-2"
                      data-magic-action="follow-up"
                      data-magic-icon="send"
                      data-magic-label={card.primaryActionLabel}
                      data-magic-id={`wedding:vendor-follow-up:${card.id}:primary`}
                      onClick={() => props.onSidebarAction(weddingVendorFollowUpPrimaryAction(card))}
                    >
                      {card.primaryActionLabel}
                    </button>
                    <div class="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Show when={card.actionMode === "waiting"}>
                        <button
                          type="button"
                          class="w-full rounded-2xl bg-wedding-accent min-h-[44px] px-4 py-3 text-sm font-semibold text-white transition hover:bg-wedding-accent-hover sm:w-auto sm:flex-1"
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
                        class="w-full rounded-2xl bg-wedding-accent min-h-[44px] px-4 py-3 text-sm font-semibold text-white transition hover:bg-wedding-accent-hover sm:w-auto sm:flex-1"
                        data-magic-action="open"
                        data-magic-icon="tasks"
                        data-magic-label="Open follow-up tasks"
                        data-magic-id={`wedding:vendor-follow-up:${card.id}:tasks`}
                        onClick={() => props.onSidebarAction(followUpTasksAction(card))}
                      >
                        Open follow-up tasks
                      </button>
                    </div>
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

      <p class="mt-4 text-xs text-wedding-muted">
        One thread. One decision. Nothing sends until you approve it.
      </p>
    </div>
  );
}
