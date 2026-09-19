// @locs-version: 2.0
import { Show } from "solid-js";

import type { WeddingAdminDataConsentState } from "@/lib/weddingAdminDataConsentState";

export function WeddingAdminDataConsentCard(props: {
  state: WeddingAdminDataConsentState;
}) {
  return (
    <div class="min-w-0 rounded-[24px] border border-rose-100/80 bg-white/85 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <p class="text-sm font-semibold text-rose-950">Help improve wedding planning</p>
        <span class="max-w-full break-words rounded-full bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-900">
          {props.state.enabled ? "Opted in" : "Off"}
        </span>
      </div>
      <p class="mt-2 text-[11px] leading-5 text-rose-900/75">{props.state.statusLabel}</p>
      <p class="mt-2 rounded-2xl border border-rose-100 bg-rose-50/70 px-2.5 py-2 text-[10px] leading-4 text-rose-950/75">
        {props.state.hoverMessage}
      </p>
      <Show when={props.state.adminPacket}>
        {(packet) => (
          <div class="mt-2 flex flex-wrap gap-1.5">
            <span class="max-w-full break-words rounded-full border border-rose-100 bg-white/75 px-2 py-1 text-[10px] text-rose-900/80">
              anonymized: {packet().anonymized ? "yes" : "no"}
            </span>
            <span class="max-w-full break-words rounded-full border border-rose-100 bg-white/75 px-2 py-1 text-[10px] text-rose-900/80">
              {packet().submittedResponseCount} response file{packet().submittedResponseCount === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </Show>
    </div>
  );
}
