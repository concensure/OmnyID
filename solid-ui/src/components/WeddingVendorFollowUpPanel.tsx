// @locs-version: 2.1
import { For, Show } from "solid-js";

import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import type {
  WeddingResponseWorkspaceViewState,
  WeddingVendorContactWorkspaceCard,
} from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingVendorPursuitLogCard } from "@/lib/weddingVendorPursuitLogPresentationState";
import { buildWeddingVendorFollowUpPanelPresentationState } from "@/lib/weddingVendorFollowUpPanelPresentationState";
import {
  weddingVendorFollowUpPrimaryAction,
  weddingVendorRecordReplyAction,
} from "@/lib/weddingVendorFollowUpPanelActionState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

function vendorContactStatusClass(tone: WeddingVendorContactWorkspaceCard["tone"]): string {
  if (tone === "urgent") return "bg-rose-50 text-rose-900";
  if (tone === "due") return "bg-amber-50 text-amber-900";
  if (tone === "waiting") return "bg-sky-50 text-sky-900";
  if (tone === "closed") return "bg-emerald-50 text-emerald-900";
  return "bg-stone-50 text-stone-800";
}

function vendorContactItemClass(tone: WeddingVendorContactWorkspaceCard["tone"]): string {
  if (tone === "urgent") return "rounded-2xl border border-rose-100 bg-white/80 p-3";
  if (tone === "due") return "rounded-2xl border border-amber-100 bg-white/80 p-3";
  if (tone === "waiting") return "rounded-2xl border border-sky-100 bg-white/80 p-3";
  if (tone === "closed") return "rounded-2xl border border-emerald-100 bg-white/80 p-3";
  return "rounded-2xl border border-stone-100 bg-white/80 p-3";
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
}) {
  const panelState = () => buildWeddingVendorFollowUpPanelPresentationState({
    activeCount: props.state.vendorContactCards.length,
    closedCount: props.state.vendorPursuitLogCards.length,
  });
  return (
    <div class="min-w-0 rounded-[24px] border border-amber-100/80 bg-amber-50/85 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          <div class="min-w-0">
            <p class="break-words text-base font-semibold text-amber-950">{panelState().title}</p>
            <p class="mt-0.5 text-xs leading-5 text-amber-900/70">{panelState().descriptionLabel}</p>
          </div>
          <Show when={panelState().showFollowUpTip}>
            <WeddingInfoTip title="Follow-up tip" tone="rose">
              After an outreach email, wait about 3 to 5 business days before nudging. Keep the last-contact date updated so the planner can suggest the next step without guesswork.
            </WeddingInfoTip>
          </Show>
        </div>
        <span class="max-w-full break-words rounded-full bg-white/85 px-2 py-1 text-xs font-semibold text-amber-900">
          {panelState().badgeLabel}
        </span>
      </div>
      <div class="mt-3 space-y-2">
        <Show when={props.state.vendorContactCards.length > 0}>
          <For each={props.state.vendorContactCards}>
            {(card) => (
              <article class={vendorContactItemClass(card.tone)}>
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="break-words text-sm font-semibold text-stone-950">{card.vendorName}</p>
                    <p class="mt-0.5 text-xs leading-5 text-stone-700/75">{card.categoryLabel}</p>
                  </div>
                  <span class={`max-w-full shrink-0 break-words rounded-full px-2 py-1 text-xs font-semibold ${vendorContactStatusClass(card.tone)}`}>
                    {card.statusLabel}
                  </span>
                </div>
                <p class="mt-2 text-sm leading-6 text-stone-800/75">{card.detailLabel}</p>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                  <div class="rounded-xl border border-stone-200 bg-stone-50/80 px-2.5 py-2">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600">Last contact</p>
                    <p class="mt-1 text-xs leading-5 text-stone-800">{card.lastContactLabel ?? "Not recorded"}</p>
                  </div>
                  <div class="rounded-xl border border-stone-200 bg-stone-50/80 px-2.5 py-2">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600">Follow-up date</p>
                    <p class="mt-1 text-xs leading-5 text-stone-800">{card.followUpDueLabel ?? "No date set"}</p>
                  </div>
                </div>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <For each={card.metadataLabels.slice(0, 4)}>
                    {(label) => (
                      <span class="max-w-full break-words rounded-full border border-stone-200 bg-stone-50/80 px-2 py-1 text-xs text-stone-800/75">
                        {label}
                      </span>
                    )}
                  </For>
                </div>
                <Show
                  when={card.actionMode !== "reply_recorded"}
                  fallback={(
                    <p class="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/80 px-2.5 py-2 text-xs leading-5 text-emerald-950">
                      Reply recorded{card.replyLabel ? ` on ${card.replyLabel}` : ""}. Follow-up is paused; continue from the vendor response.
                    </p>
                  )}
                >
                  <p class="mt-2 rounded-xl border border-stone-200 bg-white/70 px-2.5 py-2 text-xs leading-5 text-stone-800/80">
                    Next step: {card.nextActionLabel}
                  </p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <Show when={card.actionMode === "follow_up" || card.actionMode === "waiting"}>
                      <button
                        type="button"
                        class="rounded-full bg-amber-800 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-900"
                        data-magic-action="follow-up"
                        data-magic-icon="send"
                        data-magic-label={card.primaryActionLabel}
                        data-magic-id={`wedding:vendor-follow-up:${card.id}:primary`}
                        onClick={() => props.onSidebarAction(weddingVendorFollowUpPrimaryAction(card))}
                      >
                        {card.primaryActionLabel}
                      </button>
                    </Show>
                    <Show when={card.actionMode === "waiting"}>
                      <button
                        type="button"
                        class="rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-white"
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
                      class="rounded-full border border-amber-200 bg-white/80 px-3 py-2 text-xs font-semibold text-amber-950 transition hover:bg-white"
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
            )}
          </For>
        </Show>
        <Show when={props.state.vendorPursuitLogCards.length > 0}>
          <div class="rounded-2xl border border-stone-200 bg-white/75 p-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="break-words text-sm font-semibold text-stone-950">Vendor history</p>
                <p class="mt-0.5 text-xs leading-5 text-stone-700/75">Closed paths remain available after they leave the active queue.</p>
              </div>
              <span class="max-w-full shrink-0 break-words rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-800">
                {props.state.vendorPursuitLogCards.length} closed
              </span>
            </div>
            <div class="mt-3 space-y-2">
              <For each={props.state.vendorPursuitLogCards}>
                {(card) => (
                  <article class="rounded-xl border border-stone-100 bg-stone-50/80 px-2.5 py-2">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <p class="break-words text-sm font-semibold text-stone-950">{card.vendorLabel}</p>
                        <p class="mt-0.5 text-xs leading-5 text-stone-700/75">{card.reasonLabel}</p>
                      </div>
                      <span class="max-w-full shrink-0 break-words rounded-full bg-white px-2 py-1 text-xs font-semibold text-stone-800">
                        {card.closedAtLabel ?? "Closed"}
                      </span>
                    </div>
                    <p class="mt-2 text-xs leading-5 text-stone-800/75">{card.detailLabel}</p>
                    <Show when={card.noteLabel}>
                      {(note) => (
                        <p class="mt-2 rounded-lg border border-stone-200 bg-white/80 px-2 py-1.5 text-xs leading-5 text-stone-800">
                          {note()}
                        </p>
                      )}
                    </Show>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      <For each={card.metadataLabels.slice(0, 4)}>
                        {(label) => (
                          <span class="max-w-full break-words rounded-full border border-stone-200 bg-white/80 px-2 py-0.5 text-[11px] text-stone-700">
                            {label}
                          </span>
                        )}
                      </For>
                    </div>
                    <button
                      type="button"
                      class="mt-2 rounded-full border border-stone-200 bg-white/90 px-3 py-2 text-xs font-semibold text-stone-900 transition hover:bg-white"
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
      </div>
    </div>
  );
}
