// @locs-version: 1.0
import { createEffect, createSignal, For, Show } from "solid-js";
import {
  hasRetrievalState,
  retrievalStateBadges,
  retrievalStateSummary,
  topThreadFreshnessState,
  threadRetrievalStateBadges,
  threadRetrievalStateSummary,
} from "afp-ts/retrieval";
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
import {
  retrievalScopeBadgesFromQuery,
  retrievalScopeSummaryFromQuery,
} from "@/lib/retrievalScope";
import { retrievalBadgeTone } from "@/lib/retrievalTone";
import {
  decisionOsLeadingThreadCue,
  decisionOsThreadRetrievalBadges,
  decisionOsThreadSupportState,
} from "@/lib/decisionosThreadRetrievalState";
import type { ThreadSummariesResponse } from "@/lib/api";
import type { ThreadSearchLaunchContext } from "@/lib/threadSearchNavigation";

export function ThreadDiscoveryStateSummary(props: {
  state?: ThreadSummariesResponse["retrieval_state"] | null;
  launchContext?: ThreadSearchLaunchContext | null;
  query?: string | null;
  class?: string;
  localRouterResult?: RouterResult | null;
  localRouterCapabilities?: LocalRouterCapabilities | null;
  onRefreshLocalPreview?: () => Promise<unknown> | unknown;
}) {
  const [capabilitiesOverride, setCapabilitiesOverride] = createSignal<LocalRouterCapabilities | null>(null);
  const effectiveCapabilities = () => capabilitiesOverride() ?? props.localRouterCapabilities ?? null;
  createEffect(() => {
    props.localRouterCapabilities;
    setCapabilitiesOverride(null);
  });
  const summary = () =>
    props.launchContext
      ? [
          threadRetrievalStateSummary({
            state: props.state,
            launchContext: props.launchContext,
          }),
          retrievalScopeSummaryFromQuery(props.query),
        ]
          .filter((value): value is string => Boolean(value?.trim()))
          .join(" ")
      : [
          retrievalStateSummary(props.state),
          retrievalScopeSummaryFromQuery(props.query),
        ]
          .filter((value): value is string => Boolean(value?.trim()))
          .join(" ");
  const badges = () =>
    decisionOsThreadRetrievalBadges(
      props.launchContext
        ? [...new Set([
            ...threadRetrievalStateBadges({
              state: props.state,
              launchContext: props.launchContext,
            }),
            ...retrievalScopeBadgesFromQuery(props.query),
          ])]
        : [...new Set([
            ...retrievalStateBadges(props.state),
            ...retrievalScopeBadgesFromQuery(props.query),
          ])],
    );
  const topThreadFreshness = () => topThreadFreshnessState(props.state);
  const threadSupport = () => decisionOsThreadSupportState(props.state);
  const leadingThreadCue = () => decisionOsLeadingThreadCue(props.state);
  const localCapabilityBadges = () => {
    return localRouterCapabilityBadges(effectiveCapabilities());
  };
  const localExecutionState = () => {
    return localRouterExecutionState(props.localRouterResult, effectiveCapabilities());
  };
  const localProjectionState = () => {
    return localRouterProjectionState(effectiveCapabilities());
  };
  const localPreviewFreshnessMeta = () => {
    return localRouterPreviewFreshnessMeta(
      effectiveCapabilities(),
      recoveryAction.lastPreviewRefreshAt(),
    );
  };
  const retrievalBadgeClass = (badge: string) => {
    switch (retrievalBadgeTone(badge)) {
      case "success":
        return "border-emerald-200/70 bg-emerald-50/85 text-emerald-800";
      case "warning":
        return "border-amber-200/70 bg-amber-50/85 text-amber-800";
      case "info":
        return "border-sky-200/70 bg-sky-50/85 text-sky-800";
      default:
        return "border-white/45 bg-white/55 text-on-surface-variant";
    }
  };
  const recoveryAction = createLocalRouterRecoveryAction({
    onCapabilities: setCapabilitiesOverride,
    onRefreshLocalPreview: props.onRefreshLocalPreview,
  });

  return (
    <Show when={hasRetrievalState(props.state) || !!props.launchContext?.sourceLabel?.trim() || !!props.launchContext?.reason?.trim() || !!props.localRouterResult}>
      <div
        class={
          props.class
          ?? "rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 shadow-card backdrop-blur"
        }
      >
        <Show when={props.localRouterResult}>
          {(routerResult) => (
            <div class="mb-3 rounded-xl border border-emerald-200/45 bg-emerald-50/55 px-3 py-3">
              <LocalRouterPreviewHeader
                title="Local retrieval preview"
                confidenceLabel={routerResult().a2ui.confidenceLabel}
                confidenceBand={routerResult().a2ui.confidenceBand}
                layerLabel={localExecutionState().layerLabel}
              />

              <LocalRouterStatusStack
                capabilityBadges={localCapabilityBadges()}
                executionBadges={localExecutionState().executionBadges}
                projectionBadges={localProjectionState().badges}
                projectionDetail={localProjectionState().detail}
                projectionMeta={localProjectionState().meta}
                previewFreshnessMeta={localPreviewFreshnessMeta()}
                projectionRecommendation={localProjectionState().recommendation}
                recoveryAction={recoveryAction}
                skipBadges={localExecutionState().skipBadges}
                densityBadges={localExecutionState().densityBadges}
                budgetDetail={localExecutionState().budgetDetail}
                budgetBadges={localExecutionState().budgetBadges}
              />
            </div>
          )}
        </Show>
        <Show when={summary()}>
          {(summary) => (
            <p class="text-sm text-on-surface-variant">
              {summary()}
            </p>
          )}
        </Show>
        <Show when={topThreadFreshness() || threadSupport() || leadingThreadCue() || badges().length > 0}>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <Show when={topThreadFreshness()}>
              {(freshness) => (
                <span class={`rounded-full border px-3 py-1 text-xs ${
                  freshness().tone === "success"
                    ? "border-emerald-200/70 bg-emerald-50/85 text-emerald-800"
                    : freshness().tone === "warning"
                      ? "border-amber-200/70 bg-amber-50/85 text-amber-800"
                      : "border-sky-200/70 bg-sky-50/85 text-sky-800"
                }`}>
                  {freshness().badge}
                </span>
              )}
            </Show>
            <Show when={threadSupport()}>
              {(support) => (
                <span
                  class={`rounded-full border px-3 py-1 text-xs ${
                    support().tone === "warning"
                      ? "border-amber-200/70 bg-amber-50/85 text-amber-800"
                      : "border-sky-200/70 bg-sky-50/85 text-sky-800"
                  }`}
                  title={support().summary}
                >
                  {support().badge}
                </span>
              )}
            </Show>
            <Show when={leadingThreadCue()}>
              {(cue) => (
                <span class="rounded-full border border-white/45 bg-white/55 px-3 py-1 text-xs text-on-surface-variant">
                  leading cue: {cue()}
                </span>
              )}
            </Show>
            <For each={badges()}>
              {(badge) => (
                <span class={`rounded-full border px-3 py-1 text-xs ${retrievalBadgeClass(badge)}`}>
                  {badge}
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
