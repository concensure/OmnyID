// @locs-version: 1.0
import { createEffect, createSignal, For, Show } from "solid-js";
import type { RouterResult } from "afp-ts/semantic-router";
import { LocalRouterPreviewHeader } from "@/components/LocalRouterPreviewHeader";
import { LocalRouterStatusStack } from "@/components/LocalRouterStatusStack";
import {
  localRouterCapabilityBadges,
  localRouterExecutionState,
  localRouterProjectionState,
  localRouterPreviewFreshnessMeta,
  type LocalRouterCapabilities,
} from "@/lib/localSemanticRouter";
import { createLocalRouterRecoveryAction } from "@/lib/localRouterRecoveryAction";

export function ThreadSemanticRouterPreview(props: {
  result?: RouterResult | null;
  capabilities?: LocalRouterCapabilities | null;
  onRefreshLocalPreview?: () => Promise<unknown> | unknown;
  class?: string;
}) {
  const [capabilitiesOverride, setCapabilitiesOverride] = createSignal<LocalRouterCapabilities | null>(null);
  const hint = () => props.result?.a2ui ?? null;
  const effectiveCapabilities = () => capabilitiesOverride() ?? props.capabilities ?? null;
  createEffect(() => {
    props.capabilities;
    setCapabilitiesOverride(null);
  });
  const capabilityBadges = () => {
    return localRouterCapabilityBadges(effectiveCapabilities());
  };
  const executionState = () => {
    return localRouterExecutionState(props.result, effectiveCapabilities(), {
      budgetLabel: "Local preview",
    });
  };
  const projectionState = () => {
    return localRouterProjectionState(effectiveCapabilities());
  };
  const previewFreshnessMeta = () => {
    return localRouterPreviewFreshnessMeta(
      effectiveCapabilities(),
      recoveryAction.lastPreviewRefreshAt(),
    );
  };
  const recoveryAction = createLocalRouterRecoveryAction({
    onCapabilities: setCapabilitiesOverride,
    onRefreshLocalPreview: props.onRefreshLocalPreview,
  });

  return (
    <Show when={hint() && (hint()!.items.length > 0 || hint()!.refineSuggestions.length > 0)}>
      <section
        class={
          props.class
          ?? "rounded-2xl border border-emerald-200/45 bg-emerald-50/55 px-4 py-3 shadow-card backdrop-blur"
        }
      >
        <LocalRouterPreviewHeader
          title={hint()!.title}
          confidenceLabel={hint()!.confidenceLabel}
          confidenceBand={hint()!.confidenceBand}
          layerLabel={executionState().layerLabel}
          titleClass="text-sm font-medium text-emerald-900"
          textClass="mt-1 text-xs text-emerald-900/75"
          pillClass="rounded-full border border-emerald-300/60 bg-white/65 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-900/75"
        />

        <LocalRouterStatusStack
          capabilityBadges={capabilityBadges()}
          executionBadges={executionState().executionBadges}
          projectionBadges={projectionState().badges}
          projectionDetail={projectionState().detail}
          projectionMeta={projectionState().meta}
          previewFreshnessMeta={previewFreshnessMeta()}
          projectionRecommendation={projectionState().recommendation}
          recoveryAction={recoveryAction}
          skipBadges={executionState().skipBadges}
          densityBadges={executionState().densityBadges}
          budgetDetail={executionState().budgetDetail}
          budgetBadges={executionState().budgetBadges}
        />

        <Show when={hint()!.items.length > 0}>
          <div class="mt-3 space-y-2">
            <For each={hint()!.items.slice(0, 4)}>
              {(item) => (
                <div class="rounded-2xl border border-white/55 bg-white/65 px-3 py-2">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium text-on-surface">{item.headline}</p>
                      <p class="mt-0.5 text-[11px] text-on-surface-variant">{item.sublabel}</p>
                    </div>
                  </div>
                  <Show when={item.provenance.length > 0}>
                    <p class="mt-1 text-[11px] text-on-surface-variant">
                      {item.provenance[0]}
                    </p>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={hint()!.refineSuggestions.length > 0}>
          <div class="mt-3">
            <p class="text-[11px] font-medium text-emerald-900/80">Refine locally</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <For each={hint()!.refineSuggestions.slice(0, 4)}>
                {(suggestion) => (
                  <span class="rounded-full border border-emerald-300/50 bg-white/75 px-3 py-1 text-[11px] text-emerald-950/80">
                    {suggestion}
                  </span>
                )}
              </For>
            </div>
          </div>
        </Show>
      </section>
    </Show>
  );
}
