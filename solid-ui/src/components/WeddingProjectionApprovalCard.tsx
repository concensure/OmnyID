// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingProjectionDispatchReceiptState } from "@/lib/weddingProjectionDispatchState";
import { runWeddingProjectionDispatchQueue } from "@/lib/weddingProjectionDispatchRunnerState";
import type { WeddingProjectionQueueViewState } from "@/lib/weddingProjectionQueueViewState";

type WeddingProjectionSaveFn = (input: SendAfpMessageInput) => Promise<unknown>;

export function WeddingProjectionApprovalCard(props: {
  state: WeddingProjectionQueueViewState | null | undefined;
  save?: WeddingProjectionSaveFn | null;
  storage?: Storage | null;
  onDispatched?: (receipt: WeddingProjectionDispatchReceiptState) => void;
  onReviewBlocked?: () => void;
}) {
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [vendorDetailsExpanded, setVendorDetailsExpanded] = createSignal(false);
  const readyCount = () => props.state?.queue.pendingItems.length ?? 0;
  const blockedCount = () => props.state?.queue.blockedItems.length ?? 0;
  const semanticItems = () => props.state?.semanticSurface.primitives.slice(0, 3) ?? [];
  const vendorDrafts = () => props.state?.vendorOutreachDraftCards ?? [];
  const vendorDecisionPolicies = () => props.state?.vendorDecisionPolicyCards ?? [];
  const vendorApprovalCard = () => props.state?.vendorApprovalCard ?? null;
  const showVendorDetails = () => !vendorApprovalCard()?.collapsedByDefault || vendorDetailsExpanded();
  const shouldShow = () => readyCount() > 0 || blockedCount() > 0;
  const primaryButtonLabel = () => {
    if (saving()) return "Saving...";
    return props.state?.primaryAction.label ?? "Nothing ready to save";
  };

  async function approveReadyItems() {
    const queue = props.state?.queue;
    if (!queue?.canDispatch || saving()) return;
    setSaving(true);
    setNotice("Saving these to your wedding plan...");
    try {
      const result = await runWeddingProjectionDispatchQueue({
        queue,
        save: props.save,
        storage: props.storage,
      });
      props.onDispatched?.(result.receipt);
      setNotice(result.receipt.failedItems.length > 0
        ? "Some items saved, but a few need another try."
        : "Saved to your wedding plan.");
    } catch {
      setNotice("These could not be saved yet. Try again after checking your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Show when={shouldShow()}>
      <section class="rounded-[24px] border border-emerald-100 bg-emerald-50/85 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <p class="text-base font-semibold text-emerald-950">{props.state?.title ?? "Save planning outputs"}</p>
            <p class="mt-1 text-sm leading-6 text-emerald-900/75">
              {props.state?.description ?? "Save the files, dates, tasks, and notes OmnyID just prepared so they stay in this wedding plan."}
            </p>
            <Show when={readyCount() > 0}>
              <div class="mt-3 inline-flex max-w-full items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-950">
                Draft - not saved to your account yet
              </div>
            </Show>
            <Show when={props.state?.externalSendGuardLabel}>
              {(label) => (
                <p class="mt-2 rounded-2xl border border-rose-100 bg-rose-50/80 px-3 py-2 text-xs font-semibold leading-5 text-rose-950">
                  {label()}
                </p>
              )}
            </Show>
            <Show when={vendorApprovalCard()}>
              {(card) => (
                <div class="mt-3 rounded-2xl border border-emerald-200/80 bg-white/75 px-3 py-2">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800/70">
                        Vendor follow-up
                      </p>
                      <p class="mt-1 text-xs font-semibold text-emerald-950">{card().summaryLabel}</p>
                    </div>
                    <Show when={card().collapsedByDefault}>
                      <button
                        type="button"
                        onClick={() => setVendorDetailsExpanded((value) => !value)}
                        class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-900 transition hover:bg-emerald-100"
                      >
                        {showVendorDetails() ? "Hide vendor details" : card().detailToggleLabel}
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </Show>
            <Show when={semanticItems().length > 0}>
              <div class="mt-3 grid gap-2">
                <For each={semanticItems()}>
                  {(item) => (
                    <div class="rounded-2xl border border-emerald-200/70 bg-white/65 px-3 py-2">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800/70">
                        {item.label}
                      </p>
                      <p class="mt-1 text-xs font-semibold text-emerald-950">{item.title}</p>
                      <p class="mt-0.5 text-[11px] leading-5 text-emerald-900/70">{item.stateLabel}</p>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={vendorDrafts().length > 0 && showVendorDetails()}>
              <div class="mt-3 grid gap-2">
                <For each={vendorDrafts()}>
                  {(draft) => (
                    <div class="rounded-2xl border border-amber-200/80 bg-white/75 px-3 py-2">
                      <div class="flex flex-wrap items-start justify-between gap-2">
                        <div class="min-w-0">
                          <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800/75">
                            Vendor draft
                          </p>
                          <p class="mt-1 break-words text-xs font-semibold text-amber-950">{draft.vendorLabel}</p>
                          <p class="mt-0.5 break-words text-[11px] leading-5 text-amber-900/70">{draft.subjectLabel}</p>
                        </div>
                        <div class="flex shrink-0 flex-wrap gap-1">
                          <span class="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-amber-900">{draft.saveLabel}</span>
                          <span class="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-900">{draft.externalSendGuardLabel}</span>
                          <Show when={draft.approvalRequired}>
                            <span class="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900">Approval required</span>
                          </Show>
                          <Show when={draft.providerReceiptRequired}>
                            <span class="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-900">Receipt required</span>
                          </Show>
                        </div>
                      </div>
                      <p class="mt-2 text-[11px] leading-5 text-amber-900/75">{draft.bodyPreview}</p>
                      <Show when={draft.checklistLabels.length > 0}>
                        <div class="mt-2 flex flex-wrap gap-1">
                          <For each={draft.checklistLabels.slice(0, 6)}>
                            {(label) => (
                              <span class="rounded-full border border-amber-100 bg-amber-50/80 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                                {label}
                              </span>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={vendorDecisionPolicies().length > 0 && showVendorDetails()}>
              <div class="mt-3 grid gap-2">
                <For each={vendorDecisionPolicies()}>
                  {(policy) => (
                    <div class="rounded-2xl border border-sky-200/80 bg-white/75 px-3 py-2">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-800/75">
                        Vendor decision
                      </p>
                      <p class="mt-1 break-words text-xs font-semibold text-sky-950">{policy.selectedVendorLabel}</p>
                      <div class="mt-2 flex flex-wrap gap-1">
                        <For each={policy.consequenceLabels}>
                          {(label) => (
                            <span class="rounded-full border border-sky-100 bg-sky-50/85 px-2 py-0.5 text-[10px] font-medium text-sky-900">
                              {label}
                            </span>
                          )}
                        </For>
                        <Show when={policy.approvalRequired}>
                          <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">Approval before outreach</span>
                        </Show>
                        <Show when={policy.noExternalSendWithoutApproval}>
                          <span class="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-900">No external send</span>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={blockedCount() > 0}>
              <p class="mt-1 text-xs leading-5 text-amber-800">
                {blockedCount()} item{blockedCount() === 1 ? "" : "s"} need a little more detail before saving.
              </p>
            </Show>
            <Show when={notice()}>
              {(text) => <p class="mt-2 text-xs font-semibold text-emerald-950">{text()}</p>}
            </Show>
          </div>
          <div class="grid gap-2 sm:min-w-48">
            <button
              type="button"
              disabled={readyCount() === 0 || saving()}
              onClick={() => void approveReadyItems()}
              data-magic-action="approve"
              data-magic-icon="save"
              data-magic-label={primaryButtonLabel()}
              data-magic-id="wedding:projection:approve-ready"
              class="rounded-full border border-emerald-300 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {primaryButtonLabel()}
            </button>
            <Show when={blockedCount() > 0}>
              <button
                type="button"
                onClick={props.onReviewBlocked}
                data-magic-action="open"
                data-magic-icon="review"
                data-magic-label="Review missing details"
                data-magic-id="wedding:projection:review-blocked"
                class="rounded-full border border-amber-200 bg-white/80 px-4 py-2 text-xs font-semibold text-amber-900 transition hover:bg-white"
              >
                Review missing details
              </button>
            </Show>
          </div>
        </div>
      </section>
    </Show>
  );
}
