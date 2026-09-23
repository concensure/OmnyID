// @locs-version: 2.0
import { For, Show } from "solid-js";

import type {
  WeddingArrivalAction,
  WeddingNavigationArrivalBannerState,
} from "@/lib/weddingNavigationArrivalViewState";

const TONE_CLASS: Record<WeddingNavigationArrivalBannerState["tone"], string> = {
  sky: "border-sky-200/70 bg-sky-50/85 text-sky-900",
  emerald: "border-emerald-200/70 bg-emerald-50/85 text-emerald-900",
  amber: "border-amber-200/80 bg-amber-50/90 text-amber-900",
  rose: "border-rose-200/80 bg-rose-50/90 text-rose-900",
  violet: "border-violet-200/70 bg-violet-50/85 text-violet-900",
};

const CARD_TONE_CLASS: Record<WeddingNavigationArrivalBannerState["tone"], string> = {
  sky: "border-sky-200/70 bg-white/65 text-sky-900",
  emerald: "border-emerald-200/70 bg-white/65 text-emerald-900",
  amber: "border-amber-200/70 bg-white/70 text-amber-900",
  rose: "border-rose-200/70 bg-white/70 text-rose-900",
  violet: "border-violet-200/70 bg-white/65 text-violet-900",
};

function runAction(
  action: WeddingArrivalAction,
  callbacks: {
    onAction?: (action: WeddingArrivalAction) => void;
    onDismiss?: () => void;
  },
) {
  if (action.disabled) return;
  if (action.kind === "dismiss") {
    callbacks.onDismiss?.();
    return;
  }
  callbacks.onAction?.(action);
}

export function WeddingNavigationArrivalBanner(props: {
  state: WeddingNavigationArrivalBannerState | null | undefined;
  onAction?: (action: WeddingArrivalAction) => void;
  onDismiss?: () => void;
}) {
  return (
    <Show when={props.state}>
      {(state) => (
        <section
          class={`mb-4 min-w-0 overflow-hidden rounded-[24px] border px-3 py-4 shadow-sm backdrop-blur sm:rounded-3xl sm:px-4 ${TONE_CLASS[state().tone]}`}
          aria-label="Wedding planning arrival context"
        >
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
                  {state().badge}
                </span>
                <For each={state().chips.slice(0, 4)}>
                  {(chip) => (
                    <span class="max-w-full rounded-full border border-current/10 bg-white/50 px-2.5 py-1 text-[10px] font-medium">
                      {chip.label}: {chip.value}
                    </span>
                  )}
                </For>
              </div>
              <h2 class="mt-3 break-words text-base font-semibold text-current">
                {state().title}
              </h2>
              <p class="mt-1 max-w-3xl break-words text-xs leading-5 text-current/75">
                {state().subtitle}
              </p>
            </div>
            <div class="grid w-full gap-2 md:w-auto md:min-w-52">
              <div>
                <button
                  type="button"
                  class="w-full rounded-full bg-current px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5"
                  disabled={state().primaryAction.disabled}
                  onClick={() => runAction(state().primaryAction, props)}
                  title={state().primaryAction.description}
                >
                  {state().primaryAction.label}
                </button>
                <p class="mt-1 text-[11px] leading-4 text-current/70">
                  {state().primaryAction.description}
                </p>
              </div>
              <button
                type="button"
                class="rounded-full border border-current/20 bg-white/55 px-3 py-2 text-xs font-semibold text-current transition hover:bg-white/80 sm:py-1.5"
                onClick={() => runAction(state().dismissAction, props)}
              >
                {state().dismissAction.label}
              </button>
            </div>
          </div>

          <div class="mt-4 grid gap-2 md:grid-cols-3">
            <For each={state().bodyItems}>
              {(item) => (
                <article class={`min-w-0 rounded-2xl border px-3 py-2 ${CARD_TONE_CLASS[item.tone]}`}>
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-current/70">
                    {item.label}
                  </p>
                  <p class="mt-1 break-words text-xs leading-5 text-current/80">
                    {item.detail}
                  </p>
                </article>
              )}
            </For>
          </div>

          <div class="mt-3 flex flex-col gap-2 border-t border-current/10 pt-3 md:flex-row md:items-center md:justify-end">
            <div class="grid w-full gap-2 sm:grid-cols-2 md:grid-cols-3">
              <For each={state().secondaryActions}>
                {(action) => (
                  <div>
                    <button
                      type="button"
                      class="w-full rounded-full border border-current/15 bg-white/45 px-2.5 py-2 text-[11px] font-medium text-current transition hover:bg-white/75 disabled:cursor-not-allowed disabled:opacity-45 sm:py-1"
                      disabled={action.disabled}
                      onClick={() => runAction(action, props)}
                      title={action.description}
                    >
                      {action.label}
                    </button>
                    <p class="mt-1 text-[11px] leading-4 text-current/65">
                      {action.description}
                    </p>
                  </div>
                )}
              </For>
            </div>
          </div>
        </section>
      )}
    </Show>
  );
}
