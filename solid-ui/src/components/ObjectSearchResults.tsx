// @locs-version: 1.0
import { createEffect, createSignal, For, Show } from "solid-js";
import {
  localRouterCapabilityBadges,
  localRouterExecutionState,
  localRouterProjectionState,
  localRouterPreviewFreshnessMeta,
  type LocalRouterCapabilities,
} from "@/lib/localSemanticRouter";
import { LocalRouterPreviewHeader } from "@/components/LocalRouterPreviewHeader";
import { LocalRouterStatusStack } from "@/components/LocalRouterStatusStack";
import { createLocalRouterRecoveryAction } from "@/lib/localRouterRecoveryAction";
import type { ObjectSearchLaunchContext } from "@/lib/objectSearchNavigation";
import {
  decisionOsObjectRetrievalBadges,
  decisionOsLeadingObjectCue,
  decisionOsObjectSupportState,
  decisionOsTopObjectFreshnessState,
} from "@/lib/decisionosObjectRetrievalState";
import {
  objectRetrievalStateSummary,
} from "afp-ts/retrieval";
import type { RouterResult } from "afp-ts/semantic-router";
import { AlternateViewsInspector } from "@/components/AlternateViewsInspector";
import { ViewDispatcher } from "@/components/ViewDispatcher";
import type { ObjectMessagesResponse } from "@/lib/api";
import type { ReportNavigationIntent } from "@/lib/reportNavigationState";
import {
  objectMessagesActiveFacets,
  objectMessagesFocusObjectId,
  objectMessagesFocusThreadId,
  objectMessagesList,
  objectMessagesRetrievalState,
} from "@/lib/objectMessagesResponseState";
import { retrievalBadgeTone } from "@/lib/retrievalTone";
import { buildStudyAcademicCalendarSearchState } from "@/lib/studyAcademicCalendarSearchState";

export function ObjectSearchResults(props: {
  result: ObjectMessagesResponse;
  advanced?: boolean;
  onOpenThread?: (threadId: string) => void;
  focusedObjectId?: string | null;
  onFocusObject?: (objectId: string | null) => void;
  onNavigate?: (view: "calendar" | "reports") => void;
  onOpenCalendarEvent?: (eventId: string, date?: string | null) => void;
  onOpenReportIntent?: (intent: ReportNavigationIntent) => void;
  launchContext?: ObjectSearchLaunchContext | null;
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
  const activeFacets = () => objectMessagesActiveFacets(props.result);
  const academicCalendarSearch = () =>
    buildStudyAcademicCalendarSearchState({
      messages: objectMessagesList(props.result),
      limit: 3,
    });

  const focusThreadId = () => objectMessagesFocusThreadId(props.result);
  const focusObjectId = () => objectMessagesFocusObjectId(props.result, props.focusedObjectId ?? null);
  const stateSummary = () =>
    objectRetrievalStateSummary({
      result: props.result,
      launchContext: props.launchContext,
      focusedObjectId: props.focusedObjectId,
    });
  const stateBadges = () =>
    decisionOsObjectRetrievalBadges({
      result: props.result,
      launchContext: props.launchContext,
      focusedObjectId: props.focusedObjectId,
    });
  const topObjectFreshness = () => decisionOsTopObjectFreshnessState(objectMessagesRetrievalState(props.result));
  const objectSupport = () => decisionOsObjectSupportState(objectMessagesRetrievalState(props.result));
  const leadingObjectCue = () => decisionOsLeadingObjectCue(objectMessagesRetrievalState(props.result));
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
    <section class="space-y-4 rounded-[24px] border border-primary/20 bg-white/35 p-5 shadow-panel backdrop-blur">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1">
          <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline">
            Object retrieval
          </p>
          <h2 class="text-lg font-semibold text-on-surface">
            {props.result.count} indexed object{props.result.count === 1 ? "" : "s"} matched
          </h2>
          <Show when={props.result.free_text}>
            <p class="text-sm text-on-surface-variant">
              Residual text: <span class="font-medium text-on-surface">{props.result.free_text}</span>
            </p>
          </Show>
          <Show when={stateSummary()}>
            {(summary) => (
              <p class="max-w-3xl text-sm text-on-surface-variant">
                {summary()}
              </p>
            )}
          </Show>
          <Show when={stateBadges().length > 0}>
            <div class="flex flex-wrap items-center gap-2 pt-1">
              <For each={stateBadges()}>
                {(badge) => (
                  <span class={`rounded-full border px-3 py-1 text-xs ${retrievalBadgeClass(badge)}`}>
                    {badge}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <Show when={topObjectFreshness()}>
            {(freshness) => (
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <span
                  class={`rounded-full border px-3 py-1 text-xs ${
                    freshness().tone === "success"
                      ? "border-emerald-200/70 bg-emerald-50/85 text-emerald-800"
                      : freshness().tone === "warning"
                        ? "border-amber-200/70 bg-amber-50/85 text-amber-800"
                        : "border-sky-200/70 bg-sky-50/85 text-sky-800"
                  }`}
                  title={freshness().summary}
                >
                  {freshness().badge}
                </span>
              </div>
            )}
          </Show>
          <Show when={objectSupport()}>
            {(support) => (
              <div class="flex flex-wrap items-center gap-2 pt-1">
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
              </div>
            )}
          </Show>
          <Show when={leadingObjectCue()}>
            {(cue) => (
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <span class="rounded-full border border-white/45 bg-white/55 px-3 py-1 text-xs text-on-surface-variant">
                  leading cue: {cue()}
                </span>
              </div>
            )}
          </Show>
          <Show
            when={
              props.launchContext?.sourceLabel
              || props.launchContext?.reason
              || focusThreadId()
              || focusObjectId()
            }
          >
            <div class="flex flex-wrap items-center gap-2 pt-1">
              <Show when={props.launchContext?.sourceLabel}>
                {(sourceLabel) => (
                  <span class="rounded-full border border-outline/20 bg-outline/8 px-3 py-1 text-xs font-medium text-on-surface-variant">
                    launched from: {sourceLabel()}
                  </span>
                )}
              </Show>
              <Show when={props.launchContext?.reason}>
                {(reason) => (
                  <span class="rounded-full border border-white/45 bg-white/55 px-3 py-1 text-xs text-on-surface-variant">
                    {reason()}
                  </span>
                )}
              </Show>
              <Show when={focusThreadId()}>
                {(threadId) => (
                  <span class="rounded-full border border-white/45 bg-white/55 px-3 py-1 text-xs text-on-surface-variant">
                    focus thread: {threadId()}
                  </span>
                )}
              </Show>
              <Show when={focusObjectId()}>
                {(focusedObjectId) => (
                  <span class="rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
                    focus object: {focusedObjectId()}
                  </span>
                )}
              </Show>
            </div>
          </Show>
          <Show when={focusObjectId()}>
            {(focusedObjectId) => (
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="rounded-full border border-white/45 bg-white/55 px-2.5 py-1 text-xs text-on-surface-variant transition hover:bg-white/70"
                  onClick={() => props.onFocusObject?.(null)}
                >
                  Clear object focus
                </button>
              </div>
            )}
          </Show>
        </div>
        <div class="rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
          match: {props.result.match}
        </div>
      </div>

      <Show when={props.localRouterResult}>
        {(routerResult) => (
          <div class="rounded-[20px] border border-emerald-200/45 bg-emerald-50/55 p-4">
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

      <Show when={activeFacets().length > 0}>
        <div class="flex flex-wrap gap-2">
          <For each={activeFacets()}>
            {(facet) => (
              <span class="rounded-full border border-white/45 bg-white/55 px-3 py-1 text-xs text-on-surface-variant">
                {facet}
              </span>
            )}
          </For>
        </div>
      </Show>

      <Show when={academicCalendarSearch()}>
        {(academic) => (
          <div class="rounded-[20px] border border-teal-200/60 bg-teal-50/60 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-teal-800">
                  Academic calendar AFP
                </p>
                <h3 class="mt-1 text-sm font-semibold text-on-surface">{academic().headline}</h3>
                <p class="mt-1 max-w-3xl text-xs leading-5 text-on-surface-variant">
                  {academic().detail}
                </p>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <For each={academic().facetQueries.slice(0, 6)}>
                  {(query) => (
                    <span class="rounded-full border border-teal-200 bg-white/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-teal-900">
                      {query}
                    </span>
                  )}
                </For>
              </div>
            </div>
            <div class="mt-3 grid gap-2 md:grid-cols-3">
              <For each={academic().cards}>
                {(card) => (
                  <article class="rounded-2xl border border-white/75 bg-white/80 p-3">
                    <p class="truncate text-xs font-semibold text-on-surface">{card.title}</p>
                    <p class="mt-1 text-[11px] leading-5 text-on-surface-variant">{card.dueLabel}</p>
                    <p class="mt-1 text-[11px] leading-5 text-teal-900/80">{card.scopeLabel}</p>
                    <p class="mt-1 text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                      {card.providerLabel}
                    </p>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        class="rounded-full border border-teal-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-900 transition hover:bg-teal-50"
                        onClick={() =>
                          props.onOpenCalendarEvent
                            ? props.onOpenCalendarEvent(card.eventId, card.eventDate)
                            : props.onNavigate?.("calendar")
                        }
                      >
                        Open Calendar
                      </button>
                      <button
                        type="button"
                        class="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-900 transition hover:bg-cyan-100"
                        onClick={() =>
                          props.onOpenReportIntent
                            ? props.onOpenReportIntent(card.reportIntent)
                            : props.onNavigate?.("reports")
                        }
                      >
                        Prep Report
                      </button>
                    </div>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      <For each={card.chips.slice(0, 5)}>
                        {(chip) => (
                          <span class="rounded-full border border-teal-100 bg-teal-50 px-2 py-0.5 text-[10px] text-teal-900">
                            {chip}
                          </span>
                        )}
                      </For>
                    </div>
                  </article>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>

      <Show
        when={objectMessagesList(props.result).length > 0}
        fallback={
          <div class="rounded-[20px] border border-white/40 bg-white/45 p-6 text-sm text-on-surface-variant">
            No stored objects matched the current structured filters.
          </div>
        }
      >
        <div class="space-y-4">
          <For each={objectMessagesList(props.result)}>
            {(message) => (
              <article class="rounded-[20px] border border-white/40 bg-white/40 p-4 shadow-card">
                <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                  <span class="font-mono uppercase tracking-[0.16em] text-outline">{message.type}</span>
                  <Show when={message.kind}>
                    <span class="rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-primary">
                      {message.kind}
                    </span>
                  </Show>
                  <Show when={props.onOpenThread && message.thread_id}>
                    <button
                      type="button"
                      class="rounded-full border border-primary/20 bg-white/55 px-2.5 py-0.5 font-medium text-primary transition hover:bg-primary/10"
                      onClick={() => props.onOpenThread?.(message.thread_id)}
                    >
                      Open thread
                    </button>
                  </Show>
                  <Show when={props.onFocusObject}>
                    <button
                      type="button"
                      class={`rounded-full border px-2.5 py-0.5 font-medium transition ${
                        props.focusedObjectId === message.id
                          ? "border-primary/20 bg-primary/10 text-primary"
                          : "border-primary/20 bg-white/55 text-primary hover:bg-primary/10"
                      }`}
                      onClick={() =>
                        props.onFocusObject?.(
                          props.focusedObjectId === message.id ? null : message.id,
                        )
                      }
                    >
                      {props.focusedObjectId === message.id ? "Focused" : "Focus object"}
                    </button>
                  </Show>
                </div>
                <ViewDispatcher message={message} />
                <Show when={props.advanced}>
                  <div class="mt-3">
                    <AlternateViewsInspector message={message} compact />
                  </div>
                </Show>
              </article>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
