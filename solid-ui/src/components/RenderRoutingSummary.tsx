// @locs-version: 1.0
import { Show, createMemo } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { resolveViewRouting } from "@/lib/viewRouting";

export function RenderRoutingSummary(props: {
  message: AfpMessage;
  viewOverride?: AfpView;
  label?: string;
  compact?: boolean;
}) {
  const routing = createMemo(() => resolveViewRouting(props.message, props.viewOverride));
  const label = () => props.label ?? "Render path";

  return (
    <div class={`rounded-xl border border-white/25 bg-white/25 ${props.compact ? "px-3 py-2" : "px-3.5 py-2.5"}`}>
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-full bg-white/55 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant">
          {label()}
        </span>
        <span class="rounded-full border border-white/20 bg-white/30 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant">
          {routing().strategy.zoneLabel}
        </span>
        <span
          class={`rounded-full px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] ${
            routing().agentDriven
              ? "bg-primary-fixed/50 text-primary"
              : "border border-white/20 bg-white/20 text-on-surface-variant/80"
          }`}
        >
          {routing().agentDriven ? "Agent route" : "Heuristic route"}
        </span>
        <Show when={routing().chosenView}>
          <span class="rounded-full border border-white/20 bg-white/20 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant/80">
            {routing().effectiveFormat}
          </span>
        </Show>
      </div>
      <p class={`text-on-surface-variant ${props.compact ? "mt-1.5 text-[11px] leading-5" : "mt-2 text-xs leading-5"}`}>
        {routing().strategy.description}
      </p>
    </div>
  );
}
