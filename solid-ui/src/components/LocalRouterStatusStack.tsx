// @locs-version: 1.0
import { For, Show } from "solid-js";

import { LocalRouterRecoveryCallout } from "@/components/LocalRouterRecoveryCallout";
import {
  localRouterPreviewFreshnessState,
  localRouterStatusSectionPresence,
} from "@/lib/localRouterCopy.js";
import type { LocalRouterProjectionBadge } from "@/lib/localSemanticRouter";
import type { LocalRouterRecoveryAction } from "@/lib/localRouterRecoveryAction";

export function LocalRouterStatusStack(props: {
  capabilityBadges: string[];
  executionBadges: string[];
  projectionBadges: LocalRouterProjectionBadge[];
  projectionDetail: string | null;
  projectionMeta: string | null;
  previewFreshnessMeta: string | null;
  projectionRecommendation: string | null;
  recoveryAction: LocalRouterRecoveryAction;
  skipBadges: string[];
  densityBadges: string[];
  budgetDetail: string | null;
  budgetBadges: string[];
}) {
  const sectionPresence = () => localRouterStatusSectionPresence({
    capabilityBadges: props.capabilityBadges,
    executionBadges: props.executionBadges,
    projectionBadges: props.projectionBadges,
    projectionDetail: props.projectionDetail,
    projectionMeta: props.projectionMeta,
    previewFreshnessMeta: props.previewFreshnessMeta,
    previewFreshnessBadge: previewFreshnessState().freshnessBadge,
    previewRefreshRecencyBadge: previewFreshnessState().refreshRecencyBadge,
    previewRefreshAction: previewFreshnessState().refreshAction,
    projectionRecommendation: props.projectionRecommendation,
    skipBadges: props.skipBadges,
    densityBadges: props.densityBadges,
    budgetDetail: props.budgetDetail,
    budgetBadges: props.budgetBadges,
  });
  const previewFreshnessState = () => localRouterPreviewFreshnessState({
    previewFreshnessMeta: props.previewFreshnessMeta,
    canRerunPreview: props.recoveryAction.canRerunPreview(),
    lastPreviewRefreshKind: props.recoveryAction.lastPreviewRefreshKind(),
    lastPreviewRefreshAt: props.recoveryAction.lastPreviewRefreshAt(),
  });

  return (
    <>
      <Show when={sectionPresence().showCapabilityBadges}>
        <div class="mt-2 flex flex-wrap gap-2">
          <For each={props.capabilityBadges}>
            {(badge) => (
              <span class="rounded-full border border-emerald-300/55 bg-white/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-900/70">
                {badge}
              </span>
            )}
          </For>
        </div>
      </Show>

      <Show when={sectionPresence().showExecutionBadges}>
        <div class="mt-2 flex flex-wrap gap-2">
          <For each={props.executionBadges}>
            {(badge) => (
              <span class="rounded-full border border-violet-300/55 bg-violet-50/75 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-violet-900/75">
                {badge}
              </span>
            )}
          </For>
        </div>
      </Show>

      <Show when={sectionPresence().showProjectionBadges}>
        <div class="mt-2 flex flex-wrap gap-2">
          <For each={props.projectionBadges}>
            {(badge) => (
              <span class={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${
                badge.tone === "warning"
                  ? "border-amber-300/60 bg-amber-50/80 text-amber-900/80"
                  : "border-cyan-300/55 bg-cyan-50/75 text-cyan-900/75"
              }`}>
                {badge.label}
              </span>
            )}
          </For>
        </div>
      </Show>

      <Show when={sectionPresence().showProjectionDetail}>
        <p class="mt-2 text-[11px] text-cyan-950/70">
          {props.projectionDetail}
        </p>
      </Show>

      <Show when={sectionPresence().showProjectionMeta}>
        <p class="mt-2 text-[11px] text-cyan-950/70">
          {props.projectionMeta}
        </p>
      </Show>

      <Show when={sectionPresence().showPreviewFreshnessBadge}>
        <div class="mt-2 flex flex-wrap gap-2">
          <span class={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${
            previewFreshnessState().freshnessBadge!.tone === "warning"
              ? "border-amber-300/60 bg-amber-50/80 text-amber-900/80"
              : "border-emerald-300/60 bg-emerald-50/80 text-emerald-900/80"
          }`}>
            {previewFreshnessState().freshnessBadge!.label}
          </span>
          <Show when={sectionPresence().showPreviewRefreshRecencyBadge}>
            <span class="rounded-full border border-emerald-300/60 bg-emerald-50/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-900/80">
              {previewFreshnessState().refreshRecencyBadge!.label}
            </span>
          </Show>
          <Show when={sectionPresence().showPreviewRefreshAction}>
            <button
              type="button"
              class={`rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                previewFreshnessState().refreshAction!.tone === "warning"
                  ? "border-cyan-300/60 bg-cyan-50/80 text-cyan-900/80 hover:bg-cyan-100"
                  : "border-emerald-300/60 bg-white/80 text-emerald-900/80 hover:bg-emerald-50"
              }`}
              disabled={props.recoveryAction.refreshingIndex() || props.recoveryAction.refreshingPreview()}
              onClick={() => void props.recoveryAction.rerunPreview()}
            >
              {previewFreshnessState().refreshAction!.label}
            </button>
          </Show>
        </div>
      </Show>

      <Show when={sectionPresence().showPreviewFreshnessMeta}>
        <p class="mt-2 text-[11px] text-cyan-950/70">
          {props.previewFreshnessMeta}
        </p>
      </Show>

      <Show when={sectionPresence().showProjectionRecommendation}>
        <LocalRouterRecoveryCallout
          recommendation={props.projectionRecommendation!}
          recoveryAction={props.recoveryAction}
        />
      </Show>

      <Show when={sectionPresence().showSkipBadges}>
        <div class="mt-2 flex flex-wrap gap-2">
          <For each={props.skipBadges}>
            {(badge) => (
              <span class="rounded-full border border-slate-300/55 bg-slate-50/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-700/80">
                {badge}
              </span>
            )}
          </For>
        </div>
      </Show>

      <Show when={sectionPresence().showDensityBadges}>
        <div class="mt-2 flex flex-wrap gap-2">
          <For each={props.densityBadges}>
            {(badge) => (
              <span class="rounded-full border border-sky-300/55 bg-sky-50/75 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-sky-900/75">
                {badge}
              </span>
            )}
          </For>
        </div>
      </Show>

      <Show when={sectionPresence().showBudgetDetail}>
        <p class="mt-2 text-[11px] text-emerald-950/70">
          {props.budgetDetail}
        </p>
      </Show>

      <Show when={sectionPresence().showBudgetBadges}>
        <div class="mt-2 flex flex-wrap gap-2">
          <For each={props.budgetBadges}>
            {(badge) => (
              <span class="rounded-full border border-amber-300/60 bg-amber-50/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-900/80">
                {badge}
              </span>
            )}
          </For>
        </div>
      </Show>

      <Show when={previewFreshnessState().recoveryMeta}>
        {(message) => (
          <p class="mt-2 text-[11px] text-emerald-950/70">
            {message()}
          </p>
        )}
      </Show>
    </>
  );
}
