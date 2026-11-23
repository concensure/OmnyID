// @locs-version: 1.0
import { Show } from "solid-js";

export function LocalRouterPreviewHeader(props: {
  title: string;
  confidenceLabel: string;
  confidenceBand: string;
  layerLabel?: string | null;
  titleClass?: string;
  textClass?: string;
  pillClass?: string;
}) {
  return (
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class={props.titleClass ?? "text-sm font-medium text-emerald-950"}>{props.title}</p>
        <p class={props.textClass ?? "mt-1 text-xs text-emerald-950/75"}>
          {props.confidenceLabel}
          <Show when={props.layerLabel}>
            {(label) => (
              <span class="ml-1 rounded-full border border-emerald-300/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                {label()}
              </span>
            )}
          </Show>
        </p>
      </div>
      <span class={props.pillClass ?? "rounded-full border border-emerald-300/60 bg-white/65 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-950/75"}>
        {props.confidenceBand}
      </span>
    </div>
  );
}
