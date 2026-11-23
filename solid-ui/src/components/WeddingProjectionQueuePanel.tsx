// @locs-version: 2.0
import { createMemo, createSignal, For, Show } from "solid-js";

import { WeddingSemanticSurfaceStrip } from "@/components/WeddingSemanticSurfaceStrip";
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingProjectionDispatchReceiptState } from "@/lib/weddingProjectionDispatchState";
import { runWeddingProjectionDispatchQueue } from "@/lib/weddingProjectionDispatchRunnerState";
import type {
  WeddingProjectionQueueAction,
  WeddingProjectionQueueGroup,
  WeddingProjectionQueueViewState,
} from "@/lib/weddingProjectionQueueViewState";
import { buildWeddingProjectionQueueSelectionState } from "@/lib/weddingProjectionQueueState";

type WeddingProjectionSaveFn = (input: SendAfpMessageInput) => Promise<unknown>;

const PANEL_TONE_CLASS: Record<WeddingProjectionQueueViewState["statusTone"], string> = {
  ready: "border-emerald-200/80 bg-emerald-50/90 text-emerald-950",
  review: "border-amber-200/80 bg-amber-50/90 text-amber-950",
  saved: "border-sky-200/80 bg-sky-50/90 text-sky-950",
  empty: "border-slate-200/80 bg-slate-50/90 text-slate-800",
};

function actionButtonClass(action: WeddingProjectionQueueAction): string {
  if (!action.enabled) return "cursor-not-allowed border-slate-200 bg-white/50 text-slate-400";
  if (action.kind === "save_pending_outputs") return "border-emerald-300/70 bg-emerald-600 text-white hover:bg-emerald-700";
  if (action.kind === "review_blocked_outputs") return "border-amber-300/70 bg-white/75 text-amber-900 hover:bg-white";
  return "border-sky-300/70 bg-white/75 text-sky-900 hover:bg-white";
}

function groupStatusLabel(group: WeddingProjectionQueueGroup): string {
  const parts = [
    group.pendingCount > 0 ? `${group.pendingCount} pending` : null,
    group.blockedCount > 0 ? `${group.blockedCount} blocked` : null,
    group.sentCount > 0 ? `${group.sentCount} saved` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : "No items";
}

export function WeddingProjectionQueuePanel(props: {
  state: WeddingProjectionQueueViewState | null | undefined;
  save?: WeddingProjectionSaveFn | null;
  storage?: Storage | null;
  onDispatched?: (receipt: WeddingProjectionDispatchReceiptState) => void;
  onReviewBlocked?: () => void;
  onOpenSaved?: () => void;
}) {
  const [saving, setSaving] = createSignal(false);
  const [receipt, setReceipt] = createSignal<WeddingProjectionDispatchReceiptState | null>(null);
  const [deselectedItemIds, setDeselectedItemIds] = createSignal<Record<string, boolean>>({});
  const queueSelection = createMemo(() => {
    const state = props.state;
    if (!state) return null;
    return buildWeddingProjectionQueueSelectionState({
      queue: state.queue,
      deselectedItemIds: deselectedItemIds(),
    });
  });
  const selectionSummary = createMemo(() => {
    return queueSelection()?.selectionSummaryLabel ?? null;
  });

  function setItemSelected(itemId: string, selected: boolean) {
    setDeselectedItemIds((current) => {
      const next = { ...current };
      if (selected) {
        delete next[itemId];
      } else {
        next[itemId] = true;
      }
      return next;
    });
  }

  async function savePendingOutputs() {
    const state = props.state;
    const queue = queueSelection()?.queue;
    if (!state?.queue.canDispatch || !queue?.canDispatch || saving()) return;
    setSaving(true);
    try {
      const result = await runWeddingProjectionDispatchQueue({
        queue,
        save: props.save,
        storage: props.storage,
      });
      setReceipt(result.receipt);
      props.onDispatched?.(result.receipt);
    } finally {
      setSaving(false);
    }
  }

  function runAction(action: WeddingProjectionQueueAction) {
    if (!action.enabled || saving()) return;
    if (action.kind === "save_pending_outputs") {
      void savePendingOutputs();
      return;
    }
    if (action.kind === "review_blocked_outputs") props.onReviewBlocked?.();
    if (action.kind === "open_saved_outputs") props.onOpenSaved?.();
  }

  return (
    <Show when={props.state}>
      {(state) => (
        <section
          class={`min-w-0 rounded-[24px] border px-3 py-4 shadow-sm sm:rounded-3xl sm:px-4 ${PANEL_TONE_CLASS[state().statusTone]}`}
          aria-label="Wedding planning save queue"
        >
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div class="min-w-0">
              <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-current/65">
                Save queue
              </p>
              <h3 class="mt-1 break-words text-base font-semibold text-current">{state().title}</h3>
              <p class="mt-1 break-words text-xs leading-5 text-current/75">{state().subtitle}</p>
              <Show when={state().dispatchPayload}>
                {(payload) => (
                  <p class="mt-1 break-words text-[11px] text-current/65">
                    {payload().count} ready item{payload().count === 1 ? "" : "s"} will be saved to your wedding plan.
                  </p>
                )}
              </Show>
              <Show when={selectionSummary()}>
                {(summary) => (
                  <p class="mt-1 break-words text-[11px] font-semibold text-current/75">
                    {summary()}
                  </p>
                )}
              </Show>
            </div>
            <div class="grid w-full gap-2 sm:flex sm:flex-wrap md:w-auto md:justify-end">
              <button
                type="button"
                disabled={!state().primaryAction.enabled || saving() || (state().primaryAction.kind === "save_pending_outputs" && !queueSelection()?.queue.canDispatch)}
                title={
                  state().primaryAction.kind === "save_pending_outputs" && !queueSelection()?.queue.canDispatch
                    ? "Select at least one ready item to save."
                    : state().primaryAction.reason ?? undefined
                }
                onClick={() => runAction(state().primaryAction)}
                class={`rounded-full border px-3 py-2 text-xs font-semibold transition disabled:opacity-50 sm:py-1.5 ${actionButtonClass(state().primaryAction)}`}
              >
                {saving() ? "Saving..." : state().primaryAction.kind === "save_pending_outputs" ? queueSelection()?.queue.nextActionLabel : state().primaryAction.label}
              </button>
              <For each={state().secondaryActions}>
                {(action) => (
                  <button
                    type="button"
                    disabled={!action.enabled || saving()}
                    title={action.reason ?? undefined}
                    onClick={() => runAction(action)}
                    class={`rounded-full border px-3 py-2 text-xs font-medium transition disabled:opacity-45 sm:py-1.5 ${actionButtonClass(action)}`}
                  >
                    {action.label}
                  </button>
                )}
              </For>
            </div>
          </div>

          <WeddingSemanticSurfaceStrip
            state={state().semanticSurface}
            limit={6}
            label="Planning meaning"
          />

          <div class="mt-4 grid gap-2 md:grid-cols-3">
            <For each={state().groups}>
              {(group) => (
                <article class="min-w-0 rounded-2xl border border-current/10 bg-white/65 px-3 py-3">
                  <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p class="break-words text-xs font-semibold text-current">{group.label}</p>
                    <span class="max-w-full break-words rounded-full bg-white/70 px-2 py-1 text-[10px] font-medium text-current/70">
                      {groupStatusLabel(group)}
                    </span>
                  </div>
                  <div class="mt-2 space-y-1.5">
                    <For each={group.items.slice(0, 4)}>
                      {(item) => (
                        <Show
                          when={item.status === "pending"}
                          fallback={
                            <p class="break-words text-[11px] text-current/75" title={item.blockedReason ?? item.statusLabel}>
                              {item.title} - {item.statusLabel}
                            </p>
                          }
                        >
                          <label class="flex min-w-0 items-start gap-2 rounded-xl border border-current/10 bg-white/55 px-2 py-2 text-[11px] text-current/75">
                            <input
                              type="checkbox"
                              class="mt-0.5 h-4 w-4 rounded border-current/25 accent-emerald-700"
                              checked={!deselectedItemIds()[item.id]}
                              onChange={(event) => setItemSelected(item.id, event.currentTarget.checked)}
                            />
                            <span class="min-w-0 flex-1 break-words">
                              {item.title} - {item.statusLabel}
                            </span>
                          </label>
                        </Show>
                      )}
                    </For>
                    <Show when={group.items.length > 4}>
                      <p class="text-[11px] text-current/55">+{group.items.length - 4} more</p>
                    </Show>
                  </div>
                </article>
              )}
            </For>
          </div>

          <Show when={receipt()}>
            {(result) => (
              <div class="mt-4 rounded-2xl border border-current/10 bg-white/75 px-3 py-3">
                <p class="break-words text-xs font-semibold text-current">{result().title}</p>
                <p class="mt-1 break-words text-[11px] text-current/70">{result().summaryLabel}</p>
                <Show when={result().failedItems.length > 0}>
                  <div class="mt-2 space-y-1">
                    <For each={result().failedItems.slice(0, 3)}>
                      {(item) => (
                        <p class="break-words text-[11px] text-rose-700">
                          {item.title}: {item.error ?? "Save failed."}
                        </p>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </section>
      )}
    </Show>
  );
}
