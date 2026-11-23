// @locs-version: 1.0
import { Show } from "solid-js";

import {
  localRouterRecoveryButtonLabel,
  localRouterRecoveryStatusBadge,
} from "@/lib/localRouterCopy.js";
import type { LocalRouterRecoveryAction } from "@/lib/localRouterRecoveryAction";

export function LocalRouterRecoveryCallout(props: {
  recommendation: string;
  recoveryAction: LocalRouterRecoveryAction;
}) {
  const recoveryStatusBadge = () => localRouterRecoveryStatusBadge({
    refreshingIndex: props.recoveryAction.refreshingIndex(),
    refreshingPreview: props.recoveryAction.refreshingPreview(),
    lastWarningPersists: props.recoveryAction.lastWarningPersists(),
    feedback: props.recoveryAction.refreshFeedback(),
  });

  return (
    <div class="mt-2 rounded-xl border border-amber-300/55 bg-amber-50/70 px-3 py-2">
      <p class="text-[11px] text-amber-950/80">
        {props.recommendation}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <Show when={recoveryStatusBadge()}>
          {(badge) => (
            <span class={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${
              badge().tone === "warning"
                ? "border-amber-300/70 bg-amber-100/85 text-amber-950"
                : badge().tone === "success"
                  ? "border-emerald-300/70 bg-emerald-100/85 text-emerald-950"
                  : "border-sky-300/70 bg-sky-100/85 text-sky-950"
            }`}>
              {badge().label}
            </span>
          )}
        </Show>
        <button
          type="button"
          class="rounded-full border border-amber-300/70 bg-white/80 px-3 py-1 text-[11px] font-medium text-amber-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={props.recoveryAction.refreshingIndex()}
          onClick={() => void props.recoveryAction.run()}
        >
          {localRouterRecoveryButtonLabel({
            refreshingIndex: props.recoveryAction.refreshingIndex(),
            refreshingPreview: props.recoveryAction.refreshingPreview(),
          })}
        </button>
        <Show when={props.recoveryAction.refreshFeedback()}>
          {(message) => (
            <span class="text-[11px] text-amber-950/75">
              {message()}
            </span>
          )}
        </Show>
      </div>
    </div>
  );
}
