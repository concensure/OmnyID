/**
 * KnowledgeGraphView — knowledge graph section under the Notes tab.
 *
 * Renders AFP messages produced by the Knowledge Curator daemon:
 *   backlink_update  → connections between messages (shown per-card)
 *   knowledge_card   → structured knowledge nodes (main grid)
 *   insight          → higher-level insight summaries (top banner)
 *   merge_suggestion → near-duplicate warnings (bottom tray)
 *
 * Consumes the existing DashboardBootstrap.messages array; no new API
 * calls needed — the Curator writes to the same AFP stream.
 */

import { createEffect, createMemo, createResource, createSignal, For, onMount, Show } from "solid-js";
import { WeddingNavigationArrivalBanner } from "@/components/WeddingNavigationArrivalBanner";
import { fetchSupertagDefinitions, type AfpMessage } from "@/lib/api";
import { navigateToView } from "@/lib/decisionosNavigation";
import {
  buildFileLibraryIntentFromKnowledgeGraphFocus,
  saveFileLibraryNavigationIntent,
} from "@/lib/fileLibraryNavigationState";
import {
  attachKnowledgeGraphBacklinks,
  extractKnowledgeCards,
  extractKnowledgeGraphInsights,
  extractKnowledgeGraphMergeSuggestions,
} from "@/lib/knowledgeGraphData";
import {
  consumeKnowledgeGraphNavigationIntent,
  type KnowledgeGraphNavigationIntent,
} from "@/lib/knowledgeGraphNavigationState";
import {
  collectKnowledgeGraphTags,
  filterKnowledgeGraphCards,
  hasKnowledgeGraphSampleData,
  isVisibleKnowledgeGraphTag,
  isKnowledgeGraphEmpty,
  knowledgeGraphCardMatchesLens,
  rankKnowledgeGraphCardsForFocus,
  type KnowledgeGraphLens,
} from "@/lib/knowledgeGraphViewState";
import {
  formatKnowledgeGraphBacklinkCountLabel,
  formatKnowledgeGraphCardCountLabel,
  formatKnowledgeGraphInsightCountLabel,
  formatKnowledgeGraphMergeSuggestionCountLabel,
  formatKnowledgeGraphRelativeDate,
  formatKnowledgeGraphSimilarityLabel,
  knowledgeGraphBacklinkOverflowLabel,
  knowledgeGraphMergeSuggestionOverflowLabel,
  shouldShowKnowledgeGraphSummaryToggle,
} from "@/lib/knowledgeGraphPresentation";
import { summarizeKnowledgeGraphStudyPack } from "@/lib/studyPackFocusState";
import { buildKnowledgeGraphStudyPackActionState } from "@/lib/studyPackActionState";
import { buildKnowledgeGraphStudyFocusSignals } from "@/lib/studyFocusSignalState";
import { buildStudyPromptPathState, type StudyPromptPath } from "@/lib/studyPromptPathState";
import {
  buildKnowledgeGraphRobustnessState,
  type KnowledgeGraphRobustnessActionId,
} from "@/lib/knowledgeGraphRobustnessState";
import { buildKnowledgeGraphTrustState } from "@/lib/knowledgeGraphTrustState";
import { buildKnowledgeGraphCoverageState } from "@/lib/knowledgeGraphCoverageState";
import { buildKnowledgeGraphValuePathState, type KnowledgeGraphValuePathActionId } from "@/lib/knowledgeGraphValuePathState";
import {
  buildKnowledgeGraphStudyRecommendationState,
  type KnowledgeGraphStudyRecommendationActionId,
} from "@/lib/knowledgeGraphStudyRecommendationState";
import { buildKnowledgeGraphStudyRecommendationReportIntent } from "@/lib/knowledgeGraphStudyRecommendationActionState";
import { buildKnowledgeGraphStudentFocusState, type KnowledgeGraphStudentFocusActionId } from "@/lib/knowledgeGraphStudentFocusState";
import { buildKnowledgeGraphExplorerFocusState } from "@/lib/knowledgeGraphExplorerFocusState";
import { buildKnowledgeCardConnectionStoryState } from "@/lib/knowledgeCardConnectionStoryState";
import { buildKnowledgeGraphSliceExplanationState } from "@/lib/knowledgeGraphSliceExplanationState";
import { buildStudyZeroStateStarterState } from "@/lib/studyZeroStateStarterState";
import {
  DEFAULT_STUDENT_ONBOARDING_QUICK_START,
  studentQuickStartForIntent,
  type OnboardingQuickStartSeed,
} from "@/lib/onboardingQuickStart";
import {
  buildReportIntentFromFocus,
  saveReportNavigationIntent,
} from "@/lib/reportNavigationState";
import type { ReportKind } from "@/lib/reportGeneratorState";
import {
  buildKnowledgeGraphAdjacentSourceSeed,
  buildKnowledgeGraphStudyContinuationSeed,
} from "@/lib/studyWorkspaceContinuationSeed";
import { buildKnowledgeGraphWorkspaceArrivalState } from "@/lib/studyWorkspaceArrivalState";
import { consumeWeddingNavigationIntent } from "@/lib/weddingNavigationLocalState";
import {
  buildWeddingNavigationArrivalBannerState,
  weddingArrivalActionDestinationView,
  type WeddingArrivalAction,
} from "@/lib/weddingNavigationArrivalViewState";
import { applyKnowledgeGraphSupertagDefinitions } from "@/lib/knowledgeGraphSupertagDefinitions";
import type {
  InsightMsg,
  KnowledgeCard,
  KnowledgeGraphBacklinkRef,
  MergeSuggestion,
} from "@/lib/knowledgeGraphTypes";

// ── Types ─────────────────────────────────────────────────────────────────────


// ── Extraction helpers ────────────────────────────────────────────────────────

// ── Sub-components ────────────────────────────────────────────────────────────

function InsightBanner(props: { insights: InsightMsg[] }) {
  return (
    <Show when={props.insights.length > 0}>
      <div class="mb-4 rounded-2xl border border-indigo-200/60 bg-indigo-50/70 p-4 backdrop-blur">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-500">
          ✦ Insights from your knowledge base
        </p>
        <div class="flex flex-wrap gap-2">
          <For each={props.insights}>
            {(ins) => (
              <div class="rounded-xl border border-indigo-100 bg-white/80 px-3 py-2 text-sm text-on-surface shadow-sm">
                <Show when={ins.topic}>
                  <span class="mr-1 font-medium text-indigo-600">{ins.topic}:</span>
                </Show>
                {ins.body}
                <Show when={formatKnowledgeGraphInsightCountLabel(ins.count)}>
                  {(label) => (
                    <span class="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {label()}
                    </span>
                  )}
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

function SupertagPill(props: { tag: string; onSelect?: (tag: string) => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => props.onSelect?.(props.tag)}
      class={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
        props.active
          ? "bg-violet-600 text-white"
          : "bg-violet-100/80 text-violet-700 hover:bg-violet-200"
      }`}
    >
      #{props.tag}
    </button>
  );
}

function BacklinkChip(props: { link: KnowledgeGraphBacklinkRef }) {
  return (
    <span
      class="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50/70 px-2 py-0.5 text-[11px] text-sky-700"
      title={props.link.targetId}
    >
      <span class="opacity-60">↗</span>
      {props.link.targetTitle}
      <span class="opacity-50">· {props.link.relationLabel}</span>
    </span>
  );
}

function formatKnowledgeContextLabel(value: string): string {
  if (!value.trim()) return value;
  return value.replace(/_/g, " ");
}

function knowledgeConnectionStrengthLabel(card: KnowledgeCard): string | null {
  if (card.connectionStrength === "high") return "Strongly linked";
  if (card.connectionStrength === "medium") return "Moderately linked";
  if (card.connectionStrength === "low" && ((card.relatedCardCount ?? 0) > 0 || card.backlinks.length > 0)) {
    return "Lightly linked";
  }
  return null;
}

function knowledgeConnectionStrengthClass(card: KnowledgeCard): string {
  if (card.connectionStrength === "high") return "bg-teal-100/90 text-teal-800";
  if (card.connectionStrength === "medium") return "bg-cyan-100/90 text-cyan-800";
  return "bg-slate-100/85 text-slate-700";
}

function knowledgeConnectionStrengthFilterLabel(
  value: NonNullable<KnowledgeCard["connectionStrength"]> | null,
): string {
  if (value === "high") return "Strong links";
  if (value === "medium") return "Medium links";
  if (value === "low") return "Light links";
  return "All link strengths";
}

type KnowledgeGraphOpenTarget = {
  threadId: string;
  messageId: string;
};

function knowledgeCardPrimaryOpenTarget(card: KnowledgeCard): KnowledgeGraphOpenTarget | null {
  if (!card.sourceThreadId) return null;
  return {
    threadId: card.sourceThreadId,
    messageId: card.id,
  };
}

function knowledgeCardSourceOpenTarget(card: KnowledgeCard): KnowledgeGraphOpenTarget | null {
  if (!card.sourceThreadId || !card.sourceMessageId || card.sourceMessageId === card.id) return null;
  return {
    threadId: card.sourceThreadId,
    messageId: card.sourceMessageId,
  };
}

function KnowledgeCardTile(props: {
  card: KnowledgeCard;
  activeTag?: string | null;
  onTagSelect?: (tag: string) => void;
  highlighted?: boolean;
  onOpenThread?: (threadId: string, messageId?: string | null) => void;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const visibleTags = createMemo(() => props.card.supertags.filter((tag) => isVisibleKnowledgeGraphTag(tag)));
  const connectionStory = createMemo(() => buildKnowledgeCardConnectionStoryState(props.card));
  const primaryTarget = createMemo(() => knowledgeCardPrimaryOpenTarget(props.card));
  const sourceTarget = createMemo(() => knowledgeCardSourceOpenTarget(props.card));
  const modeLabel = () =>
    props.card.knowledgeMode === "zettelkasten"
      ? "Zettelkasten"
      : props.card.knowledgeMode === "connected_notes"
        ? "Connected notes"
        : "Standard";
  const modeClass = () =>
    props.card.knowledgeMode === "zettelkasten"
      ? "bg-emerald-100/85 text-emerald-700"
      : props.card.knowledgeMode === "connected_notes"
        ? "bg-sky-100/85 text-sky-700"
        : "bg-slate-100/85 text-slate-700";

  return (
    <div
      class={`rounded-2xl border bg-white/70 p-4 shadow-sm backdrop-blur transition hover:shadow-md ${
        props.highlighted
          ? "border-emerald-300/90 ring-2 ring-emerald-200/80"
          : "border-white/50"
      }`}
    >
      {/* Header */}
      <div class="mb-2 flex items-start justify-between gap-2">
        <p class="flex-1 text-sm font-semibold text-on-surface leading-snug">
          {props.card.title}
        </p>
        <span class="shrink-0 text-[11px] text-on-surface-variant">
          {formatKnowledgeGraphRelativeDate(props.card.timestamp)}
        </span>
      </div>

      <div class="mb-2">
        <span class={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${modeClass()}`}>
          {modeLabel()}
        </span>
        <Show when={props.card.sourceKind}>
          <span class="ml-1 inline-block rounded-full bg-violet-100/90 px-2 py-0.5 text-[11px] font-medium text-violet-800">
            {(props.card.sourceKind ?? "").replace(/_/g, " ")}
          </span>
        </Show>
        <Show when={props.card.reviewPending}>
          <span class="ml-1 inline-block rounded-full bg-amber-100/90 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            Review pending
          </span>
        </Show>
        <Show when={!props.card.reviewPending && props.card.permanentNote}>
          <span class="ml-1 inline-block rounded-full bg-emerald-100/90 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            Permanent note
          </span>
        </Show>
        <Show when={!props.card.reviewPending && !props.card.permanentNote && props.card.sourceNote}>
          <span class="ml-1 inline-block rounded-full bg-emerald-50/95 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            Source note
          </span>
        </Show>
        <Show when={(props.card.relatedCardCount ?? 0) > 0}>
          <span class="ml-1 inline-block rounded-full bg-teal-100/90 px-2 py-0.5 text-[11px] font-medium text-teal-800">
            {(props.card.relatedCardCount ?? 0)} related
          </span>
        </Show>
        <Show when={knowledgeConnectionStrengthLabel(props.card)}>
          {(label) => (
            <span class={`ml-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${knowledgeConnectionStrengthClass(props.card)}`}>
              {label()}
            </span>
          )}
        </Show>
      </div>

      {/* Summary */}
      <Show when={props.card.summary}>
        <p
          class={`mb-3 text-xs text-on-surface-variant leading-relaxed ${
            expanded() ? "" : "line-clamp-3"
          }`}
        >
          {props.card.summary}
        </p>
        <Show when={shouldShowKnowledgeGraphSummaryToggle(props.card.summary)}>
          <button
            type="button"
            class="mb-2 text-[11px] text-primary hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded() ? "Show less" : "Show more"}
          </button>
        </Show>
      </Show>

      <Show when={props.card.academicSummary || props.card.storageSummary || props.card.provenanceSummary || props.card.sourceTitle || props.card.retentionLabel || props.card.knowledgeGraphGroupKey || props.card.zettelkastenNextAction}>
        <div class="mb-3 rounded-2xl border border-slate-200/70 bg-slate-50/75 px-3 py-2">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Provenance</p>
          <Show when={props.card.sourceTitle || props.card.sourceFileName}>
            <p class="mt-1 text-xs leading-5 text-slate-700">
              Source: {props.card.sourceTitle ?? props.card.sourceFileName}
            </p>
          </Show>
          <Show when={props.card.academicSummary}>
            <p class="mt-1 text-xs leading-5 text-slate-700">{props.card.academicSummary}</p>
          </Show>
          <Show when={props.card.storageSummary}>
            <p class="mt-1 text-xs leading-5 text-slate-700">{props.card.storageSummary}</p>
          </Show>
          <Show when={props.card.provenanceSummary}>
            <p class="mt-1 text-xs leading-5 text-slate-600">{props.card.provenanceSummary}</p>
          </Show>
          <Show when={props.card.retentionLabel}>
            <p class="mt-1 text-xs leading-5 text-slate-600">
              Retention: {props.card.retentionLabel}
            </p>
          </Show>
          <Show when={props.card.knowledgeGraphGroupKey}>
            {(value) => (
              <p class="mt-1 text-xs leading-5 text-slate-700">
                Graph anchor: {value()}
              </p>
            )}
          </Show>
          <Show when={props.card.zettelkastenNextAction}>
            {(value) => (
              <p class="mt-1 text-xs leading-5 text-slate-700">
                Next note move: {value()}
              </p>
            )}
          </Show>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <Show when={props.card.academicKind}>
              {(value) => <span class="rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-800">{formatKnowledgeContextLabel(value())}</span>}
            </Show>
            <Show when={props.card.academicCourseTag}>
              {(value) => <span class="rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-800">{value()}</span>}
            </Show>
            <Show when={props.card.academicWeekTag}>
              {(value) => <span class="rounded-full bg-indigo-100 px-2 py-1 text-[11px] text-indigo-800">{value()}</span>}
            </Show>
            <Show when={props.card.academicLectureTag}>
              {(value) => <span class="rounded-full bg-sky-100 px-2 py-1 text-[11px] text-sky-800">{value()}</span>}
            </Show>
            <Show when={props.card.zettelkastenStage}>
              {(value) => <span class="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800">{formatKnowledgeContextLabel(value())}</span>}
            </Show>
            <Show when={props.card.zettelkastenEntryType}>
              {(value) => <span class="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800">{formatKnowledgeContextLabel(value())}</span>}
            </Show>
            <For each={(props.card.knowledgeGraphLinkTags ?? []).slice(0, 6)}>
              {(tag) => <span class="rounded-full bg-cyan-100 px-2 py-1 text-[11px] text-cyan-800">{tag}</span>}
            </For>
          </div>
        </div>
      </Show>

      {/* Supertags */}
      <Show when={visibleTags().length > 0}>
        <div class="mb-2 flex flex-wrap gap-1">
          <For each={visibleTags().slice(0, 10)}>
            {(t) => <SupertagPill tag={t} active={props.activeTag === t} onSelect={props.onTagSelect} />}
          </For>
        </div>
      </Show>

      {/* Backlinks */}
      <Show when={props.card.backlinks.length > 0}>
        <div class="mt-2 flex flex-wrap gap-1 border-t border-white/50 pt-2">
          <For each={props.card.backlinks.slice(0, 4)}>
            {(l) => <BacklinkChip link={l} />}
          </For>
          <Show when={knowledgeGraphBacklinkOverflowLabel(props.card.backlinks.length)}>
            {(label) => (
              <span class="text-[11px] text-on-surface-variant">
                {label()}
              </span>
            )}
          </Show>
        </div>
      </Show>

      <Show when={(props.card.connectionReasons ?? []).length > 0}>
        <div class="mt-3 rounded-2xl border border-cyan-100/80 bg-cyan-50/70 px-3 py-2">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-800/80">
            Why this note is connected
          </p>
          <div class="mt-2 space-y-1">
            <For each={(props.card.connectionReasons ?? []).slice(0, 3)}>
              {(reason) => (
                <p class="text-xs leading-5 text-cyan-950/90">
                  {reason}
                </p>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={connectionStory()}>
        {(story) => (
          <div class={`mt-3 rounded-2xl border px-3 py-3 ${
            story().grade === "strong"
              ? "border-emerald-200/80 bg-emerald-50/70"
              : story().grade === "developing"
                ? "border-sky-200/80 bg-sky-50/70"
                : "border-amber-200/80 bg-amber-50/70"
          }`}>
            <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
              story().grade === "strong"
                ? "text-emerald-800/80"
                : story().grade === "developing"
                  ? "text-sky-800/80"
                  : "text-amber-800/80"
            }`}>
              Why this note matters now
            </p>
            <p class="mt-1 text-xs font-medium leading-5 text-on-surface">
              {story().headline}
            </p>
            <p class="mt-1 text-xs leading-5 text-on-surface/80">
              {story().detail}
            </p>
            <div class="mt-3 grid gap-2">
              <For each={story().signals}>
                {(signal) => (
                  <div class={`rounded-2xl border px-3 py-2 ${
                    signal.tone === "emerald"
                      ? "border-emerald-200/80 bg-white/90"
                      : signal.tone === "violet"
                        ? "border-violet-200/80 bg-white/90"
                        : signal.tone === "amber"
                          ? "border-amber-200/80 bg-white/90"
                          : "border-sky-200/80 bg-white/90"
                  }`}>
                    <p class={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                      signal.tone === "emerald"
                        ? "text-emerald-800/80"
                        : signal.tone === "violet"
                          ? "text-violet-800/80"
                          : signal.tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {signal.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">{signal.value}</p>
                  </div>
                )}
              </For>
            </div>
            <p class="mt-3 text-xs leading-5 text-on-surface/75">
              {story().nextStep}
            </p>
          </div>
        )}
      </Show>

      <Show when={primaryTarget() || sourceTarget()}>
        <div class={`mt-3 grid gap-2 ${sourceTarget() ? "grid-cols-2" : "grid-cols-1"}`}>
          <Show when={primaryTarget()}>
            {(target) => (
              <button
                type="button"
                onClick={() => props.onOpenThread?.(target().threadId, target().messageId)}
                class="rounded-2xl border border-sky-200/70 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 transition hover:bg-sky-100"
              >
                Open note
              </button>
            )}
          </Show>
          <Show when={sourceTarget()}>
            {(target) => (
              <button
                type="button"
                onClick={() => props.onOpenThread?.(target().threadId, target().messageId)}
                class="rounded-2xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
              >
                Open source
              </button>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}

function MergeSuggestionTray(props: { suggestions: MergeSuggestion[] }) {
  return (
    <Show when={props.suggestions.length > 0}>
      <div class="mt-6 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 backdrop-blur">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-600">
          ⚠ Possible duplicates — review suggested merges
        </p>
        <div class="space-y-2">
          <For each={props.suggestions.slice(0, 5)}>
            {(s) => (
              <div class="flex flex-col gap-2 rounded-xl border border-amber-100 bg-white/80 px-3 py-2 text-xs sm:flex-row sm:items-center">
                <span class="min-w-0 flex-1 break-words text-on-surface">
                  <span class="font-medium">{s.sourceTitle}</span>
                  <span class="mx-2 text-on-surface-variant">≈</span>
                  <span class="font-medium">{s.targetTitle}</span>
                </span>
                <Show when={formatKnowledgeGraphSimilarityLabel(s.similarityScore)}>
                  {(label) => (
                    <span class="shrink-0 rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-700">
                      {label()}
                    </span>
                  )}
                </Show>
                <span class="shrink-0 text-[11px] text-on-surface-variant">
                  Review in Threads
                </span>
              </div>
            )}
          </For>
          <Show when={knowledgeGraphMergeSuggestionOverflowLabel(props.suggestions.length)}>
            {(label) => (
              <p class="text-[11px] text-on-surface-variant">
                {label()}
              </p>
            )}
          </Show>
        </div>
      </div>
    </Show>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState(props: {
  onOpenStudyChat?: () => void;
  onOpenFiles?: () => void;
  onOpenStudyQuickStart?: (seed: OnboardingQuickStartSeed) => void;
}) {
  return (
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <span class="mb-4 text-5xl opacity-40">∞</span>
      <p class="mb-1 text-base font-semibold text-on-surface">No linked study ideas yet</p>
      <p class="max-w-2xl text-sm text-on-surface-variant leading-relaxed">
        OmnyID builds this graph automatically after a study run keeps extracted notes or files. For uni students, the fastest path is to upload one lecture source plus one reading, note, or voice memo, then ask for concepts, overlaps, and revision priorities.
      </p>
      <div class="mt-4 grid max-w-3xl gap-3 text-left md:grid-cols-3">
        <div class="rounded-2xl border border-sky-100 bg-sky-50/80 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800/75">Upload sources</p>
          <p class="mt-1 text-xs leading-5 text-sky-950/90">
            Add lecture slides, readings, study notes, screenshots, or voice memos in study chat.
          </p>
        </div>
        <div class="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/75">Keep useful output</p>
          <p class="mt-1 text-xs leading-5 text-emerald-950/90">
            Keep extracted notes or the original file so supertags and source-grounded cards can persist.
          </p>
        </div>
        <div class="rounded-2xl border border-violet-100 bg-violet-50/80 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/75">Return here</p>
          <p class="mt-1 text-xs leading-5 text-violet-950/90">
            Review linked ideas, source notes, permanent notes, and review queues instead of hunting through folders.
          </p>
        </div>
      </div>
      <div class="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => props.onOpenStudyQuickStart?.(studentQuickStartForIntent("compare_sources"))}
          class="rounded-full border border-violet-200/80 bg-violet-50/90 px-3 py-1.5 text-xs font-medium text-violet-900 transition hover:bg-violet-100"
        >
          Compare lecture and reading
        </button>
        <button
          type="button"
          onClick={() => props.onOpenStudyQuickStart?.(studentQuickStartForIntent("week_summary"))}
          class="rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1.5 text-xs font-medium text-emerald-900 transition hover:bg-emerald-100"
        >
          Summarize one week
        </button>
        <button
          type="button"
          onClick={() => props.onOpenStudyQuickStart?.(DEFAULT_STUDENT_ONBOARDING_QUICK_START)}
          class="rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
        >
          Start with one source
        </button>
        <button
          type="button"
          onClick={() => props.onOpenFiles?.()}
          class="rounded-full border border-sky-200/80 bg-sky-50/90 px-3 py-1.5 text-xs font-medium text-sky-900 transition hover:bg-sky-100"
        >
          Open Files
        </button>
      </div>
    </div>
  );
}

function StudyStarterEmptyState(props: {
  onOpenStudyChat?: () => void;
  onOpenFiles?: () => void;
  onOpenStudyQuickStart?: (seed: OnboardingQuickStartSeed) => void;
}) {
  const starter = buildStudyZeroStateStarterState({ surface: "graph" });
  const actionClass = (tone: "violet" | "sky" | "emerald" | "amber") =>
    tone === "sky"
      ? "border-sky-200/80 bg-sky-50/90 text-sky-950 hover:bg-sky-100"
      : tone === "emerald"
        ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-950 hover:bg-emerald-100"
        : tone === "amber"
          ? "border-amber-200/80 bg-amber-50/90 text-amber-950 hover:bg-amber-100"
          : "border-violet-200/80 bg-violet-50/90 text-violet-950 hover:bg-violet-100";

  return (
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <span class="mb-4 text-5xl opacity-40">∞</span>
      <p class="mb-1 text-base font-semibold text-on-surface">No linked study ideas yet</p>
      <p class="max-w-2xl text-sm leading-relaxed text-on-surface-variant">
        OmnyID builds this graph automatically after a study run keeps extracted notes or files. For uni students, the fastest path is to upload one lecture source plus one reading, note, or voice memo, then ask for concepts, overlaps, and revision priorities.
      </p>
      <div class="mt-4 w-full max-w-4xl rounded-2xl border border-violet-200/70 bg-violet-50/85 p-4 text-left shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="max-w-2xl">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800/75">
              {starter.eyebrow}
            </p>
            <p class="mt-1 text-sm font-semibold text-violet-950">{starter.headline}</p>
            <p class="mt-1 text-xs leading-5 text-violet-900/80">{starter.detail}</p>
          </div>
          <div class="rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-right shadow-sm">
            <p class="text-[10px] uppercase tracking-[0.14em] text-violet-700/75">Time to value</p>
            <p class="mt-1 text-sm font-semibold text-violet-950">{starter.timeToValueLabel}</p>
          </div>
        </div>
        <div class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div class="rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm">
            <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/75">
              What the first run should give back
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <For each={starter.firstOutputs}>
                {(item) => (
                  <span class="rounded-full border border-violet-200/80 bg-violet-50/85 px-3 py-1 text-xs text-violet-900">
                    {item}
                  </span>
                )}
              </For>
            </div>
          </div>
          <div class="rounded-2xl border border-emerald-200/80 bg-emerald-50/75 p-3 shadow-sm">
            <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/80">
              {starter.recommendedRetentionLabel}
            </p>
            <p class="mt-1 text-xs leading-5 text-emerald-900/85">
              {starter.recommendedRetentionDetail}
            </p>
          </div>
        </div>
      </div>
      <div class="mt-4 grid max-w-3xl gap-3 text-left md:grid-cols-3">
        <div class="rounded-2xl border border-sky-100 bg-sky-50/80 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800/75">Upload sources</p>
          <p class="mt-1 text-xs leading-5 text-sky-950/90">
            Add lecture slides, readings, study notes, screenshots, or voice memos in study chat.
          </p>
        </div>
        <div class="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/75">Keep useful output</p>
          <p class="mt-1 text-xs leading-5 text-emerald-950/90">
            Keep extracted notes or the original file so supertags and source-grounded cards can persist.
          </p>
        </div>
        <div class="rounded-2xl border border-violet-100 bg-violet-50/80 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/75">Return here</p>
          <p class="mt-1 text-xs leading-5 text-violet-950/90">
            Review linked ideas, source notes, permanent notes, and review queues instead of hunting through folders.
          </p>
        </div>
      </div>
      <div class="mt-4 grid w-full max-w-4xl gap-3 text-left md:grid-cols-2 xl:grid-cols-4">
        <For each={starter.starterActions}>
          {(action) => (
            <button
              type="button"
              onClick={() => props.onOpenStudyQuickStart?.(studentQuickStartForIntent(action.intent))}
              class={`rounded-2xl border p-3 text-left transition ${actionClass(action.tone)}`}
            >
              <div class="flex items-start justify-between gap-2">
                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">{action.label}</p>
                <Show when={action.recommended}>
                  <span class="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                    Recommended
                  </span>
                </Show>
              </div>
              <p class="mt-1 text-sm font-semibold">{action.title}</p>
              <p class="mt-1 text-xs leading-5 opacity-85">{action.detail}</p>
            </button>
          )}
        </For>
      </div>
      <div class="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => props.onOpenStudyQuickStart?.(DEFAULT_STUDENT_ONBOARDING_QUICK_START)}
          class="rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
        >
          Start with one source
        </button>
        <button
          type="button"
          onClick={() => props.onOpenFiles?.()}
          class="rounded-full border border-sky-200/80 bg-sky-50/90 px-3 py-1.5 text-xs font-medium text-sky-900 transition hover:bg-sky-100"
        >
          Open Files
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export type KnowledgeGraphViewProps = {
  messages: AfpMessage[];
  isDemo?: boolean;
  onOpenThread?: (threadId: string, messageId?: string | null) => void;
  onOpenStudyQuickStart?: (seed: OnboardingQuickStartSeed) => void;
};

export function KnowledgeGraphView(props: KnowledgeGraphViewProps) {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [activeTag, setActiveTag] = createSignal<string | null>(null);
  const [activeLens, setActiveLens] = createSignal<KnowledgeGraphLens>("all");
  const [activeConnectionStrength, setActiveConnectionStrength] = createSignal<
    NonNullable<KnowledgeCard["connectionStrength"]> | null
  >(null);
  const [activeAcademicKind, setActiveAcademicKind] = createSignal<string | null>(null);
  const [activeCourseTag, setActiveCourseTag] = createSignal<string | null>(null);
  const [activeUnitTag, setActiveUnitTag] = createSignal<string | null>(null);
  const [activeChapterTag, setActiveChapterTag] = createSignal<string | null>(null);
  const [activeWeekTag, setActiveWeekTag] = createSignal<string | null>(null);
  const [activeLectureTag, setActiveLectureTag] = createSignal<string | null>(null);
  const [activeZettelkastenStage, setActiveZettelkastenStage] = createSignal<string | null>(null);
  const [navigationIntent, setNavigationIntent] = createSignal<KnowledgeGraphNavigationIntent | null>(null);
  const [weddingNavigationIntent, setWeddingNavigationIntent] = createSignal<ReturnType<typeof consumeWeddingNavigationIntent>>(null);
  const hasSampleData = createMemo(() => hasKnowledgeGraphSampleData(props.messages));
  const arrivalState = createMemo(() => buildKnowledgeGraphWorkspaceArrivalState(navigationIntent()));
  const weddingArrivalBanner = createMemo(() =>
    buildWeddingNavigationArrivalBannerState(weddingNavigationIntent()),
  );
  const [supertagDefinitions] = createResource(
    () => !props.isDemo,
    async (enabled) => {
      if (!enabled) return [];
      const result = await fetchSupertagDefinitions();
      return result.definitions;
    },
  );

  const insights = createMemo(() => extractKnowledgeGraphInsights(props.messages));

  const allCards = createMemo(() => {
    const cards = attachKnowledgeGraphBacklinks(extractKnowledgeCards(props.messages), props.messages);
    return applyKnowledgeGraphSupertagDefinitions(cards, supertagDefinitions.latest ?? []);
  });

  const mergeSuggestions = createMemo(() => extractKnowledgeGraphMergeSuggestions(props.messages));
  const clearGraphFilters = () => {
    setSearchQuery("");
    setActiveTag(null);
    setActiveLens("all");
    setActiveConnectionStrength(null);
    setActiveAcademicKind(null);
    setActiveCourseTag(null);
    setActiveUnitTag(null);
    setActiveChapterTag(null);
    setActiveWeekTag(null);
    setActiveLectureTag(null);
    setActiveZettelkastenStage(null);
    setNavigationIntent(null);
  };

  createEffect(() => {
    const intent = consumeKnowledgeGraphNavigationIntent();
    if (!intent) return;
    setNavigationIntent(intent);
    setSearchQuery(intent.searchQuery);
    setActiveTag(intent.activeTag);
    setActiveLens(intent.activeLens);
    setActiveConnectionStrength(intent.preferredConnectionStrength);
    setActiveAcademicKind(intent.academicKind);
    setActiveCourseTag(intent.courseTag);
    setActiveUnitTag(intent.unitTag ?? null);
    setActiveChapterTag(intent.chapterTag ?? null);
    setActiveWeekTag(intent.weekTag);
    setActiveLectureTag(intent.lectureTag);
    setActiveZettelkastenStage(intent.zettelkastenStage);
  });

  onMount(() => {
    const intent = consumeWeddingNavigationIntent();
    if (intent?.view === "knowledge_graph") setWeddingNavigationIntent(intent);
  });

  // All unique supertags across cards for the filter row
  const allTags = createMemo(() => collectKnowledgeGraphTags(allCards()));
  const allAcademicKinds = createMemo(() => {
    const values = new Set<string>();
    for (const card of allCards()) {
      if (card.academicKind?.trim()) values.add(card.academicKind.trim());
    }
    return [...values].sort();
  });
  const allCourseTags = createMemo(() => {
    const values = new Set<string>();
    for (const card of allCards()) {
      if (card.academicCourseTag?.trim()) values.add(card.academicCourseTag.trim());
    }
    return [...values].sort();
  });
  const allUnitTags = createMemo(() => {
    const values = new Set<string>();
    for (const card of allCards()) {
      if (card.academicUnitTag?.trim()) values.add(card.academicUnitTag.trim());
    }
    return [...values].sort();
  });
  const allChapterTags = createMemo(() => {
    const values = new Set<string>();
    for (const card of allCards()) {
      if (card.academicChapterTag?.trim()) values.add(card.academicChapterTag.trim());
    }
    return [...values].sort();
  });
  const allWeekTags = createMemo(() => {
    const values = new Set<string>();
    for (const card of allCards()) {
      if (card.academicWeekTag?.trim()) values.add(card.academicWeekTag.trim());
    }
    return [...values].sort();
  });
  const allLectureTags = createMemo(() => {
    const values = new Set<string>();
    for (const card of allCards()) {
      if (card.academicLectureTag?.trim()) values.add(card.academicLectureTag.trim());
    }
    return [...values].sort();
  });
  const allZettelkastenStages = createMemo(() => {
    const values = new Set<string>();
    for (const card of allCards()) {
      if (card.zettelkastenStage?.trim()) values.add(card.zettelkastenStage.trim());
    }
    return [...values].sort();
  });

  const highlightedCardIds = createMemo(() => {
    const intent = navigationIntent();
    if (!intent) return new Set<string>();
    const ids = new Set<string>();
    for (const card of allCards()) {
      if (
        (intent.highlightCardId && card.id === intent.highlightCardId)
        || (intent.highlightSourceMessageId && card.sourceMessageId === intent.highlightSourceMessageId)
        || (intent.highlightCardId && card.referenceTargetIds?.includes(intent.highlightCardId))
        || (intent.highlightSourceMessageId && card.referenceTargetIds?.includes(intent.highlightSourceMessageId))
      ) {
        ids.add(card.id);
      }
    }
    return ids;
  });

  const filteredCards = createMemo(() => {
    const filtered = filterKnowledgeGraphCards(allCards(), searchQuery(), activeTag(), activeLens())
      .filter((card) => !activeConnectionStrength() || card.connectionStrength === activeConnectionStrength())
      .filter((card) => !activeAcademicKind() || card.academicKind === activeAcademicKind())
      .filter((card) => !activeCourseTag() || card.academicCourseTag === activeCourseTag())
      .filter((card) => !activeUnitTag() || card.academicUnitTag === activeUnitTag())
      .filter((card) => !activeChapterTag() || card.academicChapterTag === activeChapterTag())
      .filter((card) => !activeWeekTag() || card.academicWeekTag === activeWeekTag())
      .filter((card) => !activeLectureTag() || card.academicLectureTag === activeLectureTag())
      .filter((card) => !activeZettelkastenStage() || card.zettelkastenStage === activeZettelkastenStage());
    return rankKnowledgeGraphCardsForFocus(filtered, {
      activeTag: activeTag(),
      searchQuery: searchQuery(),
      activeLens: activeLens(),
      highlightedCardIds: highlightedCardIds(),
      highlightedSourceMessageId: navigationIntent()?.highlightSourceMessageId ?? null,
    });
  });

  const connectedNotesCount = createMemo(() =>
    allCards().filter((card) => knowledgeGraphCardMatchesLens(card, "connected_notes")).length,
  );

  const zettelkastenCount = createMemo(() =>
    allCards().filter((card) => knowledgeGraphCardMatchesLens(card, "zettelkasten")).length,
  );

  const reviewQueueCount = createMemo(() =>
    allCards().filter((card) => knowledgeGraphCardMatchesLens(card, "review_queue")).length,
  );

  const linkedIdeasCount = createMemo(() =>
    allCards().filter((card) => knowledgeGraphCardMatchesLens(card, "linked_ideas")).length,
  );

  const sourceMaterialsCount = createMemo(() =>
    allCards().filter((card) => knowledgeGraphCardMatchesLens(card, "study_materials")).length,
  );

  const sourceNotesCount = createMemo(() =>
    allCards().filter((card) => knowledgeGraphCardMatchesLens(card, "source_notes")).length,
  );

  const permanentNotesCount = createMemo(() =>
    allCards().filter((card) => knowledgeGraphCardMatchesLens(card, "permanent_notes")).length,
  );
  const cardsWithConnectionsCount = createMemo(() =>
    allCards().filter((card) =>
      card.backlinks.length > 0 || (card.relatedCardCount ?? 0) > 0,
    ).length,
  );
  const stronglyLinkedCount = createMemo(() =>
    allCards().filter((card) => card.connectionStrength === "high").length,
  );
  const moderatelyLinkedCount = createMemo(() =>
    allCards().filter((card) => card.connectionStrength === "medium").length,
  );
  const lightlyLinkedCount = createMemo(() =>
    allCards().filter((card) =>
      card.connectionStrength === "low" && (card.backlinks.length > 0 || (card.relatedCardCount ?? 0) > 0),
    ).length,
  );
  const topicalDenseCount = createMemo(() =>
    allCards().filter((card) => (card.topicalConnectionCount ?? 0) > 0).length,
  );
  const corroboratedCount = createMemo(() =>
    allCards().filter((card) => (card.corroboratedSourceCount ?? 0) >= 2).length,
  );
  const diverseSourceCount = createMemo(() =>
    allCards().filter((card) => (card.sourceDiversityCount ?? 0) >= 2).length,
  );
  const graphWarmupSummary = createMemo(() => {
    if (allCards().length === 0) return null;
    if (allCards().length < 3) {
      return "The graph is still warming up. Upload another lecture, reading, or note so OmnyID has enough grounded material to form stronger cross-source links.";
    }
    if (stronglyLinkedCount() === 0 && moderatelyLinkedCount() === 0 && cardsWithConnectionsCount() > 0) {
      return "Early links are forming, but the graph still needs stronger overlap. Adding a second lecture, reading, or revision note from the same subject should strengthen cross-source retrieval.";
    }
    if (cardsWithConnectionsCount() === 0) {
      return "Cards have been created, but strong links have not formed yet. A second related source usually gives the graph enough overlap to connect ideas.";
    }
    if (cardsWithConnectionsCount() < Math.ceil(allCards().length / 3)) {
      return "Some cards are linked, but the graph is still sparse. Keep adding adjacent course material so supertags and backlinks can tighten the network.";
    }
    return "This graph has enough connected material to support cross-source study retrieval, linked-idea review, and Zettelkasten progression.";
  });

  const isEmpty = createMemo(() => isKnowledgeGraphEmpty(allCards(), insights(), mergeSuggestions()));
  const hasActiveFilters = createMemo(() =>
    Boolean(
      searchQuery().trim()
      || activeTag()
      || activeLens() !== "all"
      || activeConnectionStrength()
      || activeAcademicKind()
      || activeCourseTag()
      || activeUnitTag()
      || activeChapterTag()
      || activeWeekTag()
      || activeLectureTag()
      || activeZettelkastenStage(),
    )
  );
  const activeFilterSummary = createMemo(() => {
    const labels: string[] = [];
    if (activeLens() !== "all") labels.push(activeLens().replace(/_/g, " "));
    if (activeConnectionStrength()) labels.push(knowledgeConnectionStrengthFilterLabel(activeConnectionStrength()));
    if (activeTag()) labels.push(`#${activeTag()}`);
    if (activeAcademicKind()) labels.push(formatKnowledgeContextLabel(activeAcademicKind()!));
    if (activeCourseTag()) labels.push(activeCourseTag()!);
    if (activeUnitTag()) labels.push(activeUnitTag()!);
    if (activeChapterTag()) labels.push(activeChapterTag()!);
    if (activeWeekTag()) labels.push(activeWeekTag()!);
    if (activeLectureTag()) labels.push(activeLectureTag()!);
    if (activeZettelkastenStage()) labels.push(formatKnowledgeContextLabel(activeZettelkastenStage()!));
    if (searchQuery().trim()) labels.push(`query "${searchQuery().trim()}"`);
    return labels;
  });
  const graphFocusSummary = createMemo(() => {
    if (!hasActiveFilters()) return null;
    if (activeConnectionStrength() === "high") {
      return "This graph view is focused on the strongest study links first so students can review the most grounded cross-source connections immediately.";
    }
    if (activeConnectionStrength() === "medium") {
      return "This graph view is focused on developing links that are useful, but not yet fully reinforced by enough overlapping study material.";
    }
    if (activeConnectionStrength() === "low") {
      return "This graph view is focused on early-stage links that may need another lecture, reading, or permanent note before they become reliable study anchors.";
    }
    if (activeLens() === "zettelkasten" || activeZettelkastenStage()) {
      return "This graph view is focused on note-chain development, review queues, and permanent-note progression.";
    }
    if (activeCourseTag() || activeUnitTag() || activeChapterTag() || activeWeekTag() || activeLectureTag() || activeAcademicKind()) {
      return "This graph view is focused on grounded study material for a course, unit, chapter, week, or study source type.";
    }
    if (activeLens() === "linked_ideas") {
      return "This graph view is focused on cross-source overlap so you can compare lecture, reading, and notes without folder hunting.";
    }
    return "This graph view is filtered to a narrower subset of your retained knowledge cards.";
  });
  const focusedStudyPack = createMemo(() => summarizeKnowledgeGraphStudyPack(filteredCards()));
  const focusedStudyPackAction = createMemo(() => buildKnowledgeGraphStudyPackActionState(filteredCards()));
  const focusedStudySignals = createMemo(() => buildKnowledgeGraphStudyFocusSignals(filteredCards()));
  const visibleSupertagCount = createMemo(() =>
    new Set(
      filteredCards().flatMap((card) => card.supertags.filter((tag) => isVisibleKnowledgeGraphTag(tag))),
    ).size,
  );
  const visibleContradictionCount = createMemo(() =>
    filteredCards().filter((card) => (card.contradictionLinkCount ?? 0) > 0).length,
  );
  const firstFocusedGraphCard = createMemo(() =>
    filteredCards().find((card) =>
      card.knowledgeGraphGroupKey
      || (card.knowledgeGraphLinkTags?.length ?? 0) > 0
      || card.zettelkastenNextAction,
    ) ?? filteredCards()[0] ?? null,
  );
  const openStudyWorkspaceForCurrentFocus = () => {
    const focusedCard = firstFocusedGraphCard();
    props.onOpenStudyQuickStart?.(buildKnowledgeGraphStudyContinuationSeed({
      searchQuery: searchQuery(),
      activeTag: activeTag(),
      activeLens: activeLens(),
      activeConnectionStrength: activeConnectionStrength(),
      academicKind: activeAcademicKind(),
      courseTag: activeCourseTag(),
      unitTag: activeUnitTag() || focusedCard?.academicUnitTag || null,
      chapterTag: activeChapterTag() || focusedCard?.academicChapterTag || null,
      weekTag: activeWeekTag(),
      lectureTag: activeLectureTag(),
      zettelkastenStage: activeZettelkastenStage(),
      zettelkastenNextAction: focusedCard?.zettelkastenNextAction ?? null,
      knowledgeGraphGroupKey: focusedCard?.knowledgeGraphGroupKey ?? null,
      knowledgeGraphLinkTags: focusedCard?.knowledgeGraphLinkTags ?? [],
    }));
  };
  const openAdjacentSourcePlannerForCurrentFocus = () => {
    const focusedCard = firstFocusedGraphCard();
    props.onOpenStudyQuickStart?.(buildKnowledgeGraphAdjacentSourceSeed({
      searchQuery: searchQuery(),
      activeTag: activeTag(),
      activeLens: activeLens(),
      activeConnectionStrength: activeConnectionStrength(),
      academicKind: activeAcademicKind(),
      courseTag: activeCourseTag(),
      unitTag: activeUnitTag() || focusedCard?.academicUnitTag || null,
      chapterTag: activeChapterTag() || focusedCard?.academicChapterTag || null,
      weekTag: activeWeekTag(),
      lectureTag: activeLectureTag(),
      zettelkastenStage: activeZettelkastenStage(),
      zettelkastenNextAction: focusedCard?.zettelkastenNextAction ?? null,
      knowledgeGraphGroupKey: focusedCard?.knowledgeGraphGroupKey ?? null,
      knowledgeGraphLinkTags: focusedCard?.knowledgeGraphLinkTags ?? [],
    }));
  };
  const openReportsForCurrentFocus = (
    preferredKind?: ReportKind | null,
    overrides: {
      searchQuery?: string | null;
      academicKind?: string | null;
      zettelkastenNextAction?: string | null;
      knowledgeGraphLinkTags?: string[] | null;
    } = {},
  ) => {
    const focusedCard = firstFocusedGraphCard();
    const knowledgeGraphLinkTags = [
      ...(focusedCard?.knowledgeGraphLinkTags ?? []),
      ...(overrides.knowledgeGraphLinkTags ?? []),
    ].filter((tag, index, values) => tag.trim().length > 0 && values.indexOf(tag) === index);
    saveReportNavigationIntent(buildReportIntentFromFocus({
      source: "knowledge_graph",
      preferredKind,
      searchQuery: overrides.searchQuery ?? searchQuery(),
      activeTag: activeTag(),
      activeLens: activeLens(),
      knowledgeMode:
        focusedCard?.knowledgeMode
        ?? (activeLens() === "zettelkasten" ? "zettelkasten" : activeLens() === "connected_notes" ? "connected_notes" : null),
      academicKind: overrides.academicKind ?? activeAcademicKind(),
      courseTag: activeCourseTag() || focusedCard?.academicCourseTag || null,
      weekTag: activeWeekTag() || focusedCard?.academicWeekTag || null,
      lectureTag: activeLectureTag() || focusedCard?.academicLectureTag || null,
      chapterTag: activeChapterTag() || focusedCard?.academicChapterTag || null,
      unitTag: activeUnitTag() || focusedCard?.academicUnitTag || null,
      zettelkastenStage: activeZettelkastenStage() || focusedCard?.zettelkastenStage || null,
      zettelkastenNextAction: overrides.zettelkastenNextAction ?? focusedCard?.zettelkastenNextAction ?? null,
      knowledgeGraphGroupKey: focusedCard?.knowledgeGraphGroupKey ?? null,
      knowledgeGraphLinkTags,
    }));
    navigateToView("reports");
  };
  const runWeddingArrivalAction = (action: WeddingArrivalAction) => {
    const destination = weddingArrivalActionDestinationView(action);
    if (destination) navigateToView(destination);
  };
  const runStudyRecommendationAction = (actionId: KnowledgeGraphStudyRecommendationActionId | null | undefined) => {
    if (!actionId) return;
    if (actionId === "focus_strongest_cluster") {
      const recommendedTag = knowledgeGraphCoverage()?.recommendedTag ?? null;
      if (recommendedTag) setActiveTag(recommendedTag);
      return;
    }
    if (actionId === "show_strongest_links") {
      setActiveConnectionStrength("high");
      return;
    }
    if (actionId === "plan_next_source") {
      openAdjacentSourcePlannerForCurrentFocus();
      return;
    }

    const focusedCard = firstFocusedGraphCard();
    const reportIntent = buildKnowledgeGraphStudyRecommendationReportIntent(actionId, {
      source: "knowledge_graph",
      searchQuery: searchQuery(),
      activeTag: activeTag(),
      activeLens: activeLens(),
      knowledgeMode:
        focusedCard?.knowledgeMode
        ?? (activeLens() === "zettelkasten" ? "zettelkasten" : activeLens() === "connected_notes" ? "connected_notes" : null),
      academicKind: activeAcademicKind(),
      courseTag: activeCourseTag() || focusedCard?.academicCourseTag || null,
      weekTag: activeWeekTag() || focusedCard?.academicWeekTag || null,
      lectureTag: activeLectureTag() || focusedCard?.academicLectureTag || null,
      chapterTag: activeChapterTag() || focusedCard?.academicChapterTag || null,
      unitTag: activeUnitTag() || focusedCard?.academicUnitTag || null,
      zettelkastenStage: activeZettelkastenStage() || focusedCard?.zettelkastenStage || null,
      zettelkastenNextAction: focusedCard?.zettelkastenNextAction ?? null,
      knowledgeGraphGroupKey: focusedCard?.knowledgeGraphGroupKey ?? null,
      knowledgeGraphLinkTags: focusedCard?.knowledgeGraphLinkTags ?? [],
      focusTags: [
        ...filteredCards().flatMap((card) => card.supertags),
        ...filteredCards().flatMap((card) => card.knowledgeGraphLinkTags ?? []),
      ],
    });
    if (reportIntent) {
      saveReportNavigationIntent(reportIntent);
      navigateToView("reports");
      return;
    }

    openReportsForCurrentFocus("exam_preparation");
  };
  const runRobustnessAction = (actionId: KnowledgeGraphRobustnessActionId | null | undefined) => {
    if (!actionId) return;
    if (actionId === "show_strong_links") {
      setActiveConnectionStrength("high");
      return;
    }
    if (actionId === "focus_review_queue") {
      setActiveLens("review_queue");
      return;
    }
    if (actionId === "open_files") {
      saveFileLibraryNavigationIntent(buildFileLibraryIntentFromKnowledgeGraphFocus({
        searchQuery: searchQuery(),
        activeTag: activeTag(),
        activeLens: activeLens(),
        academicKind: activeAcademicKind(),
        courseTag: activeCourseTag(),
        unitTag: activeUnitTag(),
        chapterTag: activeChapterTag(),
        weekTag: activeWeekTag(),
        lectureTag: activeLectureTag(),
        zettelkastenStage: activeZettelkastenStage(),
      }));
      navigateToView("files");
      return;
    }
    openStudyWorkspaceForCurrentFocus();
  };
  const runValuePathAction = (actionId: KnowledgeGraphValuePathActionId | null | undefined) => {
    if (!actionId) return;
    if (actionId === "focus_cluster") {
      const recommendedTag = knowledgeGraphCoverage()?.recommendedTag ?? null;
      if (recommendedTag) setActiveTag(recommendedTag);
      return;
    }
    if (actionId === "show_strong_links") {
      setActiveConnectionStrength("high");
      return;
    }
    if (actionId === "focus_review_queue") {
      setActiveLens("review_queue");
      return;
    }
    if (actionId === "open_files") {
      saveFileLibraryNavigationIntent(buildFileLibraryIntentFromKnowledgeGraphFocus({
        searchQuery: searchQuery(),
        activeTag: activeTag(),
        activeLens: activeLens(),
        academicKind: activeAcademicKind(),
        courseTag: activeCourseTag(),
        unitTag: activeUnitTag(),
        chapterTag: activeChapterTag(),
        weekTag: activeWeekTag(),
        lectureTag: activeLectureTag(),
        zettelkastenStage: activeZettelkastenStage(),
      }));
      navigateToView("files");
      return;
    }
    if (actionId === "plan_next_source") {
      openAdjacentSourcePlannerForCurrentFocus();
      return;
    }
    openStudyWorkspaceForCurrentFocus();
  };
  const runStudentFocusAction = (actionId: KnowledgeGraphStudentFocusActionId | null | undefined) => {
    if (!actionId) return;
    if (actionId === "focus_cluster") {
      const recommendedTag = knowledgeGraphCoverage()?.recommendedTag ?? null;
      if (recommendedTag) setActiveTag(recommendedTag);
      return;
    }
    if (actionId === "show_strong_links") {
      setActiveConnectionStrength("high");
      return;
    }
    if (actionId === "focus_review_queue") {
      setActiveLens("review_queue");
      return;
    }
    if (actionId === "open_files") {
      saveFileLibraryNavigationIntent(buildFileLibraryIntentFromKnowledgeGraphFocus({
        searchQuery: searchQuery(),
        activeTag: activeTag(),
        activeLens: activeLens(),
        academicKind: activeAcademicKind(),
        courseTag: activeCourseTag(),
        unitTag: activeUnitTag(),
        chapterTag: activeChapterTag(),
        weekTag: activeWeekTag(),
        lectureTag: activeLectureTag(),
        zettelkastenStage: activeZettelkastenStage(),
      }));
      navigateToView("files");
      return;
    }
    if (actionId === "plan_next_source") {
      openAdjacentSourcePlannerForCurrentFocus();
      return;
    }
    if (actionId === "clear_filters") {
      clearGraphFilters();
      return;
    }
    openStudyWorkspaceForCurrentFocus();
  };
  const currentStudyContinuationSeed = createMemo(() => {
    const focusedCard = firstFocusedGraphCard();
    return buildKnowledgeGraphStudyContinuationSeed({
      searchQuery: searchQuery(),
      activeTag: activeTag(),
      activeLens: activeLens(),
      activeConnectionStrength: activeConnectionStrength(),
      academicKind: activeAcademicKind(),
      courseTag: activeCourseTag(),
      unitTag: activeUnitTag() || focusedCard?.academicUnitTag || null,
      chapterTag: activeChapterTag() || focusedCard?.academicChapterTag || null,
      weekTag: activeWeekTag(),
      lectureTag: activeLectureTag(),
      zettelkastenStage: activeZettelkastenStage(),
      zettelkastenNextAction: focusedCard?.zettelkastenNextAction ?? null,
      knowledgeGraphGroupKey: focusedCard?.knowledgeGraphGroupKey ?? null,
      knowledgeGraphLinkTags: focusedCard?.knowledgeGraphLinkTags ?? [],
    });
  });
  const currentStudyPromptPaths = createMemo(() =>
    buildStudyPromptPathState({
      quickStartSeed: currentStudyContinuationSeed(),
      knowledgeMode: currentStudyContinuationSeed().knowledgeMode,
      supportedCount: Math.max(filteredCards().length, 1),
    }),
  );
  const recommendedStudyPromptPath = createMemo(() =>
    currentStudyPromptPaths().options.find((option) => option.recommended) ?? currentStudyPromptPaths().options[0] ?? null,
  );
  const alternateStudyPromptPath = createMemo(() => {
    const recommended = recommendedStudyPromptPath();
    return currentStudyPromptPaths().options.find((option) => option.id !== recommended?.id) ?? null;
  });
  const openStudyPromptPath = (option: StudyPromptPath | null) => {
    if (!option) return;
    props.onOpenStudyQuickStart?.({
      ...currentStudyContinuationSeed(),
      query: option.prompt,
      label: option.label,
      description: option.detail,
      notice: `${option.label} prompt loaded from your current Knowledge Graph focus.`,
      helper: "Use the current graph focus directly, or return to Files if you need the retained sources behind these links.",
    });
  };
  const knowledgeGraphRobustness = createMemo(() =>
    buildKnowledgeGraphRobustnessState({
      totalCards: allCards().length,
      linkedCards: cardsWithConnectionsCount(),
      strongCount: stronglyLinkedCount(),
      mediumCount: moderatelyLinkedCount(),
      lightCount: lightlyLinkedCount(),
      courseCount: allCourseTags().length,
      weekCount: allWeekTags().length,
      lectureCount: allLectureTags().length,
      topicalDenseCount: topicalDenseCount(),
      corroboratedCount: corroboratedCount(),
      diverseSourceCount: diverseSourceCount(),
      zettelkastenCount: zettelkastenCount(),
      permanentCount: permanentNotesCount(),
      reviewQueueCount: reviewQueueCount(),
      activeConnectionStrength: activeConnectionStrength(),
      activeLens: activeLens(),
    }),
  );
  const knowledgeGraphTrust = createMemo(() =>
    buildKnowledgeGraphTrustState({
      visibleCount: filteredCards().length,
      linkedCount: filteredCards().filter((card) => card.backlinks.length > 0 || (card.relatedCardCount ?? 0) > 0).length,
      strongCount: filteredCards().filter((card) => card.connectionStrength === "high").length,
      mediumCount: filteredCards().filter((card) => card.connectionStrength === "medium").length,
      topicalDenseCount: filteredCards().filter((card) => (card.topicalConnectionCount ?? 0) > 0).length,
      corroboratedCount: filteredCards().filter((card) => (card.corroboratedSourceCount ?? 0) >= 2).length,
      diverseSourceCount: filteredCards().filter((card) => (card.sourceDiversityCount ?? 0) >= 2).length,
      contradictionCount: visibleContradictionCount(),
      activeLens: activeLens(),
      activeTag: activeTag(),
      courseTag: activeCourseTag(),
      weekTag: activeWeekTag(),
    }),
  );
  const knowledgeGraphCoverage = createMemo(() =>
    buildKnowledgeGraphCoverageState({
      cards: filteredCards(),
      activeLens: activeLens(),
      activeTag: activeTag(),
    }),
  );
  const knowledgeGraphNextMove = createMemo(() => {
    const robustness = knowledgeGraphRobustness();
    const coverage = knowledgeGraphCoverage();
    const trust = knowledgeGraphTrust();
    if (!robustness && !coverage && !trust) return null;

    if (robustness?.grade === "warming_up") {
      return {
        eyebrow: "Fastest next move",
        headline: "Add one adjacent source before you trust this graph.",
        detail: "For stressed students, the fastest upgrade is another lecture, reading, or rough note from the same subject so the graph can form grounded overlap instead of isolated cards.",
      };
    }
    if (trust?.grade === "fragile") {
      return {
        eyebrow: "Fastest next move",
        headline: "Verify this focus with another source, then revise from it.",
        detail: "Use the current graph slice as a prompt, not final truth. A second retained source from the same week or concept should improve corroboration quickly.",
      };
    }
    if (coverage?.grade === "sparse") {
      return {
        eyebrow: "Fastest next move",
        headline: "Grow one supertag cluster instead of widening the graph.",
        detail: "Stay inside one concept, course, or week and add the next related source there. Dense clusters are more useful for exam revision than broad but shallow coverage.",
      };
    }
    if (activeLens() === "zettelkasten" || activeZettelkastenStage()) {
      return {
        eyebrow: "Fastest next move",
        headline: "Turn the current chain into reviewable notes.",
        detail: "Open the strongest cluster or review queue and keep promoting source notes into clearer permanent-note candidates.",
      };
    }
    return {
      eyebrow: "Fastest next move",
      headline: "Ask directly from the strongest linked cluster.",
      detail: "This focus is already strong enough to return grounded comparisons, revision priorities, and connected-note follow-up questions without more setup.",
    };
  });
  const knowledgeGraphValuePath = createMemo(() =>
    buildKnowledgeGraphValuePathState({
      robustness: knowledgeGraphRobustness(),
      trust: knowledgeGraphTrust(),
      coverage: knowledgeGraphCoverage(),
      activeLens: activeLens(),
      activeTag: activeTag(),
      activeConnectionStrength: activeConnectionStrength(),
      stronglyLinkedCount: stronglyLinkedCount(),
      reviewQueueCount: reviewQueueCount(),
      zettelkastenCount: zettelkastenCount(),
    }),
  );
  const knowledgeGraphStudyRecommendations = createMemo(() =>
    buildKnowledgeGraphStudyRecommendationState({
      visibleCount: filteredCards().length,
      activeLens: activeLens(),
      activeTag: activeTag(),
      courseTag: activeCourseTag(),
      weekTag: activeWeekTag(),
      lectureTag: activeLectureTag(),
      chapterTag: activeChapterTag(),
      unitTag: activeUnitTag(),
      academicKind: activeAcademicKind(),
      focusTags: [
        ...filteredCards().flatMap((card) => card.supertags),
        ...filteredCards().flatMap((card) => card.knowledgeGraphLinkTags ?? []),
      ],
      strongCount: filteredCards().filter((card) => card.connectionStrength === "high").length,
      reviewQueueCount: filteredCards().filter((card) => card.reviewPending).length,
      zettelkastenCount: filteredCards().filter((card) => card.knowledgeMode === "zettelkasten").length,
      robustness: knowledgeGraphRobustness(),
      trust: knowledgeGraphTrust(),
      coverage: knowledgeGraphCoverage(),
    }),
  );
  const knowledgeGraphStudentFocus = createMemo(() =>
    buildKnowledgeGraphStudentFocusState({
      visibleCount: filteredCards().length,
      totalCount: allCards().length,
      linkedCount: filteredCards().filter((card) => card.backlinks.length > 0 || (card.relatedCardCount ?? 0) > 0).length,
      strongCount: filteredCards().filter((card) => card.connectionStrength === "high").length,
      denseCount: filteredCards().filter((card) => (card.topicalConnectionCount ?? 0) > 0).length,
      visibleSupertagCount: visibleSupertagCount(),
      connectedNotesCount: filteredCards().filter((card) => card.knowledgeMode === "connected_notes").length,
      zettelkastenCount: filteredCards().filter((card) => card.knowledgeMode === "zettelkasten").length,
      reviewQueueCount: filteredCards().filter((card) => card.reviewPending).length,
      permanentNotesCount: filteredCards().filter((card) => card.permanentNote).length,
      recommendedTag: knowledgeGraphCoverage()?.recommendedTag ?? null,
      activeTag: activeTag(),
      activeLens: activeLens(),
      activeConnectionStrength: activeConnectionStrength(),
      hasActiveFilters: hasActiveFilters(),
    }),
  );
  const knowledgeGraphExplorerFocus = createMemo(() =>
    buildKnowledgeGraphExplorerFocusState({
      visibleCount: filteredCards().length,
      totalCount: allCards().length,
      linkedCount: filteredCards().filter((card) => card.backlinks.length > 0 || (card.relatedCardCount ?? 0) > 0).length,
      strongCount: filteredCards().filter((card) => card.connectionStrength === "high").length,
      denseCount: filteredCards().filter((card) => (card.topicalConnectionCount ?? 0) > 0).length,
      visibleSupertagCount: visibleSupertagCount(),
      searchQuery: searchQuery(),
      activeTag: activeTag(),
      activeLens: activeLens(),
      activeConnectionStrength: activeConnectionStrength(),
      courseTag: activeCourseTag(),
      weekTag: activeWeekTag(),
      lectureTag: activeLectureTag(),
      recommendedTag: knowledgeGraphCoverage()?.recommendedTag ?? null,
      clusterTags: knowledgeGraphCoverage()?.clusters.map((cluster) => cluster.filterTag ?? cluster.label).filter((value): value is string => Boolean(value?.trim())) ?? [],
    }),
  );
  const knowledgeGraphSliceExplanation = createMemo(() =>
    buildKnowledgeGraphSliceExplanationState({
      cards: filteredCards(),
      activeLens: activeLens(),
      activeTag: activeTag(),
      activeConnectionStrength: activeConnectionStrength(),
      courseTag: activeCourseTag(),
      weekTag: activeWeekTag(),
      zettelkastenStage: activeZettelkastenStage(),
    }),
  );

  return (
    <div class="flex flex-col gap-0">
      {/* Header bar */}
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xl">∞</span>
          <h2 class="text-base font-semibold text-on-surface">Knowledge Graph</h2>
        </div>

        {/* Search */}
        <div class="relative w-full flex-1 sm:min-w-[180px] sm:max-w-xs">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search cards…"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="w-full rounded-full border border-white/40 bg-white/60 py-1.5 pl-8 pr-3 text-sm text-on-surface placeholder-on-surface-variant backdrop-blur focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Stats */}
        <div class="ml-auto flex items-center gap-2 text-[11px] text-on-surface-variant">
          <span>{formatKnowledgeGraphCardCountLabel(allCards().length)}</span>
          <span>·</span>
          <span>{formatKnowledgeGraphBacklinkCountLabel(allCards().reduce((acc, c) => acc + c.backlinks.length, 0))}</span>
          <Show when={mergeSuggestions().length > 0}>
            <span>·</span>
            <span class="text-amber-600">{formatKnowledgeGraphMergeSuggestionCountLabel(mergeSuggestions().length)}</span>
          </Show>
        </div>
      </div>

      <Show when={props.isDemo}>
        <div class="mb-4 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 shadow-sm">
          You're viewing a <span class="font-semibold">sample knowledge graph</span> in guest mode.
          Sign in to replace these cards, backlinks, and insights with your own notes, email, and research graph.
        </div>
      </Show>

      <Show when={!props.isDemo && hasSampleData()}>
        <div class="mb-4 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 shadow-sm">
          This graph currently includes <span class="font-semibold">sample knowledge cards</span> to fill gaps while live curator output is still sparse.
          Those preview cards disappear as your own knowledge graph data becomes available.
        </div>
      </Show>

      <WeddingNavigationArrivalBanner
        state={weddingArrivalBanner()}
        onAction={runWeddingArrivalAction}
        onDismiss={() => setWeddingNavigationIntent(null)}
      />

      <Show when={arrivalState()}>
        {(arrival) => (
          <div class="mb-4 min-w-0 rounded-2xl border border-emerald-200/70 bg-emerald-50/85 px-3 py-3 text-sm text-emerald-950 shadow-sm sm:px-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 max-w-3xl">
                <p class="break-words text-sm font-semibold text-emerald-950">{arrival().headline}</p>
                <p class="mt-1 break-words text-xs leading-5 text-emerald-900/85">{arrival().detail}</p>
              </div>
              <span class="rounded-full border border-emerald-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-900">
                {arrival().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-2 lg:grid-cols-3">
              <For each={arrival().cards}>
                {(card) => (
                  <div class={`min-w-0 rounded-2xl border px-3 py-3 shadow-sm ${
                    card.tone === "amber"
                      ? "border-amber-200/80 bg-amber-50/85"
                      : card.tone === "emerald"
                        ? "border-emerald-200/80 bg-white/90"
                        : card.tone === "violet"
                          ? "border-violet-200/80 bg-violet-50/85"
                          : "border-sky-200/80 bg-sky-50/85"
                  }`}>
                    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800/80">
                      {card.label}
                    </p>
                    <p class="mt-1 break-words text-xs leading-5 text-on-surface">{card.detail}</p>
                  </div>
                )}
              </For>
            </div>
            <p class="mt-3 text-xs leading-5 text-emerald-900/80">{arrival().nextStep}</p>
            <div class="mt-3 grid gap-2 sm:flex sm:flex-wrap">
              <Show when={recommendedStudyPromptPath()}>
                {(option) => (
                  <button
                    type="button"
                    onClick={() => openStudyPromptPath(option())}
                    class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-emerald-950 transition hover:bg-white sm:py-1.5"
                  >
                    Run {option().label.toLowerCase()}
                  </button>
                )}
              </Show>
              <Show when={activeConnectionStrength() !== "high" && stronglyLinkedCount() > 0}>
                <button
                  type="button"
                  onClick={() => setActiveConnectionStrength("high")}
                  class="rounded-full border border-sky-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-sky-950 transition hover:bg-white sm:py-1.5"
                >
                  Show strongest links
                </button>
              </Show>
              <button
                type="button"
                onClick={() => {
                  saveFileLibraryNavigationIntent(buildFileLibraryIntentFromKnowledgeGraphFocus({
                    searchQuery: searchQuery(),
                    activeTag: activeTag(),
                    activeLens: activeLens(),
                    academicKind: activeAcademicKind(),
                    courseTag: activeCourseTag(),
                    unitTag: activeUnitTag(),
                    chapterTag: activeChapterTag(),
                    weekTag: activeWeekTag(),
                    lectureTag: activeLectureTag(),
                    zettelkastenStage: activeZettelkastenStage(),
                  }));
                  navigateToView("files");
                }}
                class="rounded-full border border-violet-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-violet-950 transition hover:bg-white sm:py-1.5"
              >
                Open retained sources
              </button>
              <button
                type="button"
                onClick={openAdjacentSourcePlannerForCurrentFocus}
                class="rounded-full border border-violet-200/80 bg-violet-50/90 px-3 py-2 text-xs font-medium text-violet-950 transition hover:bg-violet-100 sm:py-1.5"
              >
                Plan next source
              </button>
            </div>
          </div>
        )}
      </Show>

      <Show when={navigationIntent()}>
        {(intent) => (
          <Show when={!arrivalState()}>
            <div class="mb-4 rounded-2xl border border-emerald-200/70 bg-emerald-50/85 px-4 py-3 text-sm text-emerald-950 shadow-sm">
            {intent().notice ?? "Focused from Files"}
            <Show when={intent().fileName}>
              {(fileName) => <span class="font-semibold"> · {fileName()}</span>}
            </Show>
            <Show when={intent().activeLens !== "all"}>
              <span> · lens {intent().activeLens.replace(/_/g, " ")}</span>
            </Show>
            <Show when={intent().preferredConnectionStrength}>
              {(strength) => <span> · {knowledgeConnectionStrengthFilterLabel(strength())}</span>}
            </Show>
            <Show when={intent().activeTag}>
              {(tag) => <span> · #{tag()}</span>}
            </Show>
            <Show when={intent().courseTag}>
              {(value) => <span> · {value()}</span>}
            </Show>
            <Show when={intent().weekTag}>
              {(value) => <span> · {value()}</span>}
            </Show>
            <Show when={intent().lectureTag}>
              {(value) => <span> · {value()}</span>}
            </Show>
            <Show when={highlightedCardIds().size > 0}>
              <span> · {highlightedCardIds().size} related card{highlightedCardIds().size === 1 ? "" : "s"} highlighted</span>
            </Show>
            </div>
          </Show>
        )}
      </Show>

      <Show when={focusedStudyPack()}>
        {(pack) => (
          <div class="mb-4 min-w-0 rounded-2xl border border-sky-200/70 bg-sky-50/85 px-3 py-3 text-sm text-sky-950 shadow-sm sm:px-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 max-w-3xl">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800/75">
                  Focused study pack
                </p>
                <p class="mt-1 break-words font-medium">{pack().headline}</p>
                <p class="mt-1 break-words text-xs leading-5 text-sky-900/80">{pack().detail}</p>
                <Show when={pack().contextLabel}>
                  {(context) => (
                    <p class="mt-1 text-xs leading-5 text-sky-900/70">
                      Context: {context()}
                    </p>
                  )}
                </Show>
              </div>
              <div class="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[260px]">
                <For each={pack().stats}>
                  {(stat) => (
                    <div class="rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-left shadow-sm sm:text-right">
                      <p class="text-[10px] uppercase tracking-[0.14em] text-sky-700/75">{stat.label}</p>
                      <p class="mt-1 text-base font-semibold text-sky-950">{stat.value}</p>
                    </div>
                  )}
                </For>
              </div>
            </div>
            <p class="mt-3 text-xs leading-5 text-sky-900/80">{pack().nextStep}</p>
            <Show when={focusedStudySignals()}>
              {(signals) => (
                <div class="mt-3 grid gap-2 lg:grid-cols-3">
                  <div class="rounded-2xl border border-sky-200/80 bg-white/90 px-3 py-3 shadow-sm">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700/80">
                      {signals().focus.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-sky-950">{signals().focus.value}</p>
                  </div>
                  <div class="rounded-2xl border border-amber-200/80 bg-white/90 px-3 py-3 shadow-sm">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700/80">
                      {signals().weakSpot.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-amber-950">{signals().weakSpot.value}</p>
                  </div>
                  <div class="rounded-2xl border border-emerald-200/80 bg-white/90 px-3 py-3 shadow-sm">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700/80">
                      {signals().nextStep.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-emerald-950">{signals().nextStep.value}</p>
                  </div>
                </div>
              )}
            </Show>
            <Show when={focusedStudyPackAction()}>
              {(action) => (
                <div class="mt-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/80">
                    {action().headline}
                  </p>
                  <p class="mt-1 text-[11px] leading-5 text-emerald-900/80">
                    {action().detail}
                  </p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <Show when={recommendedStudyPromptPath()}>
                      {(option) => (
                        <button
                          type="button"
                          onClick={() => openStudyPromptPath(option())}
                          class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-emerald-950 transition hover:bg-white"
                        >
                          Run {option().label.toLowerCase()}
                        </button>
                      )}
                    </Show>
                    <Show when={alternateStudyPromptPath()}>
                      {(option) => (
                        <button
                          type="button"
                          onClick={() => openStudyPromptPath(option())}
                          class="rounded-full border border-sky-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-sky-950 transition hover:bg-white"
                        >
                          Or {option().label.toLowerCase()}
                        </button>
                      )}
                    </Show>
                  </div>
                </div>
              )}
            </Show>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openStudyWorkspaceForCurrentFocus}
                class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-emerald-950 transition hover:bg-white"
              >
                {focusedStudyPackAction()?.primaryActionLabel ?? "Ask from this study focus"}
              </button>
              <Show when={activeConnectionStrength() !== "high" && stronglyLinkedCount() > 0}>
                <button
                  type="button"
                  onClick={() => setActiveConnectionStrength("high")}
                  class="rounded-full border border-sky-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-sky-950 transition hover:bg-white"
                >
                  {focusedStudyPackAction()?.secondaryActionLabel === "Show strongest links"
                    ? focusedStudyPackAction()!.secondaryActionLabel
                    : "Show strongest links"}
                </button>
              </Show>
              <button
                type="button"
                onClick={() => {
                  saveFileLibraryNavigationIntent(buildFileLibraryIntentFromKnowledgeGraphFocus({
                    searchQuery: searchQuery(),
                    activeTag: activeTag(),
                    activeLens: activeLens(),
                    academicKind: activeAcademicKind(),
                    courseTag: activeCourseTag(),
                    unitTag: activeUnitTag(),
                    chapterTag: activeChapterTag(),
                    weekTag: activeWeekTag(),
                    lectureTag: activeLectureTag(),
                    zettelkastenStage: activeZettelkastenStage(),
                  }));
                  navigateToView("files");
                }}
                class="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-violet-950 transition hover:bg-white"
              >
                {focusedStudyPackAction()?.secondaryActionLabel === "Open retained sources"
                  ? focusedStudyPackAction()!.secondaryActionLabel
                  : "Open retained sources"}
              </button>
            </div>
          </div>
        )}
      </Show>

      <Show when={hasActiveFilters()}>
        <div class="mb-4 rounded-2xl border border-violet-200/70 bg-violet-50/85 px-4 py-3 text-sm text-violet-950 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="max-w-3xl">
              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800/75">
                Active graph focus
              </p>
              <p class="mt-1">
                {filteredCards().length} card{filteredCards().length === 1 ? "" : "s"} match the current focus.
                <Show when={activeFilterSummary().length > 0}>
                  <span> {activeFilterSummary().join(" · ")}.</span>
                </Show>
              </p>
              <Show when={graphFocusSummary()}>
                {(summary) => <p class="mt-1 text-xs leading-5 text-violet-900/80">{summary()}</p>}
              </Show>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openStudyWorkspaceForCurrentFocus}
                class="rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1.5 text-xs font-medium text-emerald-950 transition hover:bg-emerald-100"
              >
                Ask from this study focus
              </button>
              <button
                type="button"
                onClick={clearGraphFilters}
                class="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-violet-950 transition hover:bg-white"
              >
                Clear graph filters
              </button>
              <button
                type="button"
                onClick={() => {
                  saveFileLibraryNavigationIntent(buildFileLibraryIntentFromKnowledgeGraphFocus({
                    searchQuery: searchQuery(),
                    activeTag: activeTag(),
                    activeLens: activeLens(),
                    academicKind: activeAcademicKind(),
                    courseTag: activeCourseTag(),
                    unitTag: activeUnitTag(),
                    chapterTag: activeChapterTag(),
                    weekTag: activeWeekTag(),
                    lectureTag: activeLectureTag(),
                    zettelkastenStage: activeZettelkastenStage(),
                  }));
                  navigateToView("files");
                }}
                class="rounded-full border border-sky-200/80 bg-sky-50/90 px-3 py-1.5 text-xs font-medium text-sky-950 transition hover:bg-sky-100"
              >
                Open Files
              </button>
              <button
                type="button"
                onClick={() => openReportsForCurrentFocus()}
                class="rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1.5 text-xs font-medium text-cyan-950 transition hover:bg-cyan-100"
              >
                Generate report
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={knowledgeGraphExplorerFocus()}>
        {(focus) => (
          <div class="mb-4 min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-950 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 max-w-4xl">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700/75">
                  Find the right cluster fast
                </p>
                <p class="mt-1 break-words font-medium">{focus().headline}</p>
                <p class="mt-1 break-words text-xs leading-5 text-slate-700/85">{focus().detail}</p>
                <p class="mt-2 break-words text-xs leading-5 text-slate-700/75">{focus().nextRefinement}</p>
              </div>
              <span class="rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-700">
                {focus().badge}
              </span>
            </div>
            <Show when={focus().appliedFocus.length > 0}>
              <div class="mt-3 flex flex-wrap gap-2">
                <For each={focus().appliedFocus}>
                  {(entry) => (
                    <span class="max-w-full break-words rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-xs text-slate-700">
                      {entry}
                    </span>
                  )}
                </For>
              </div>
            </Show>
            <Show when={focus().suggestedTags.length > 0}>
              <div class="mt-3">
                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700/75">
                  Suggested clusters
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <For each={focus().suggestedTags}>
                    {(tag) => (
                      <button
                        type="button"
                        onClick={() => setActiveTag(tag)}
                        class="max-w-full break-words rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 text-xs text-slate-800 transition hover:bg-white sm:py-1"
                      >
                        {tag}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <Show when={focus().searchExamples.length > 0}>
              <div class="mt-3">
                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700/75">
                  Concept search examples
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <For each={focus().searchExamples}>
                    {(example) => (
                      <button
                        type="button"
                        onClick={() => setSearchQuery(example)}
                        class="max-w-full break-words rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 text-xs text-slate-800 transition hover:bg-white sm:py-1"
                      >
                        {example}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        )}
      </Show>

      <Show when={knowledgeGraphSliceExplanation()}>
        {(state) => (
          <div class="mb-4 min-w-0 rounded-2xl border border-cyan-200/80 bg-cyan-50/80 px-4 py-3 text-sm text-cyan-950 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 max-w-4xl">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-800/80">
                  Why this graph slice matters
                </p>
                <p class="mt-1 break-words font-medium">{state().headline}</p>
                <p class="mt-1 break-words text-xs leading-5 text-cyan-950/80">{state().detail}</p>
              </div>
              <span class="rounded-full border border-cyan-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-cyan-900">
                {state().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-2 lg:grid-cols-4">
              <For each={state().signals}>
                {(signal) => (
                  <div class={`rounded-2xl border bg-white/90 px-3 py-2 shadow-sm ${
                    signal.tone === "emerald"
                      ? "border-emerald-200/80"
                      : signal.tone === "violet"
                        ? "border-violet-200/80"
                        : signal.tone === "amber"
                          ? "border-amber-200/80"
                          : "border-sky-200/80"
                  }`}>
                    <p class={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                      signal.tone === "emerald"
                        ? "text-emerald-800/80"
                        : signal.tone === "violet"
                          ? "text-violet-800/80"
                          : signal.tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {signal.label}
                    </p>
                    <p class="mt-1 break-words text-xs leading-5 text-on-surface">{signal.value}</p>
                  </div>
                )}
              </For>
            </div>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p class="max-w-4xl break-words text-xs leading-5 text-cyan-950/80">{state().nextStep}</p>
              <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={openStudyWorkspaceForCurrentFocus}
                  class="rounded-full border border-cyan-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-cyan-950 transition hover:bg-white sm:py-1.5"
                >
                  Ask from this slice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveFileLibraryNavigationIntent(buildFileLibraryIntentFromKnowledgeGraphFocus({
                      searchQuery: searchQuery(),
                      activeTag: activeTag(),
                      activeLens: activeLens(),
                      academicKind: activeAcademicKind(),
                      courseTag: activeCourseTag(),
                      unitTag: activeUnitTag(),
                      chapterTag: activeChapterTag(),
                      weekTag: activeWeekTag(),
                      lectureTag: activeLectureTag(),
                      zettelkastenStage: activeZettelkastenStage(),
                    }));
                    navigateToView("files");
                  }}
                  class="rounded-full border border-sky-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-sky-950 transition hover:bg-white sm:py-1.5"
                >
                  Open retained sources
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={allCards().length > 0}>
        <div class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          <div class="rounded-2xl border border-sky-200/60 bg-sky-50/75 px-3 py-2 shadow-sm">
            <div class="text-[11px] font-medium uppercase tracking-[0.14em] text-sky-700/75">Study sources</div>
            <div class="mt-1 text-lg font-semibold text-sky-950">{sourceMaterialsCount()}</div>
          </div>
          <div class="rounded-2xl border border-violet-200/60 bg-violet-50/75 px-3 py-2 shadow-sm">
            <div class="text-[11px] font-medium uppercase tracking-[0.14em] text-violet-700/75">Linked ideas</div>
            <div class="mt-1 text-lg font-semibold text-violet-950">{linkedIdeasCount()}</div>
          </div>
          <div class="rounded-2xl border border-emerald-200/60 bg-emerald-50/75 px-3 py-2 shadow-sm">
            <div class="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-700/75">Source notes</div>
            <div class="mt-1 text-lg font-semibold text-emerald-950">{sourceNotesCount()}</div>
          </div>
          <div class="rounded-2xl border border-emerald-300/60 bg-emerald-100/60 px-3 py-2 shadow-sm">
            <div class="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-800/75">Permanent notes</div>
            <div class="mt-1 text-lg font-semibold text-emerald-950">{permanentNotesCount()}</div>
          </div>
          <div class="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 shadow-sm col-span-2 sm:col-span-4 lg:col-span-1">
            <div class="text-[11px] font-medium uppercase tracking-[0.14em] text-amber-700/80">Review queue</div>
            <div class="mt-1 text-lg font-semibold text-amber-950">{reviewQueueCount()}</div>
          </div>
        </div>
      </Show>

      <Show when={graphWarmupSummary()}>
        {(summary) => (
          <div class="mb-4 rounded-2xl border border-sky-200/70 bg-sky-50/80 px-4 py-3 text-sm text-sky-950 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-4xl">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800/75">
                  Graph strength
                </p>
                <p class="mt-1">{summary()}</p>
              </div>
              <div class="flex flex-wrap gap-2 text-[11px]">
                <span class="rounded-full border border-sky-200/80 bg-white/90 px-2.5 py-1 font-medium text-sky-900">
                  {cardsWithConnectionsCount()} linked card{cardsWithConnectionsCount() === 1 ? "" : "s"}
                </span>
                <span class="rounded-full border border-teal-200/80 bg-white/90 px-2.5 py-1 font-medium text-teal-900">
                  {stronglyLinkedCount()} strong
                </span>
                <span class="rounded-full border border-cyan-200/80 bg-white/90 px-2.5 py-1 font-medium text-cyan-900">
                  {moderatelyLinkedCount()} medium
                </span>
                <Show when={lightlyLinkedCount() > 0}>
                  <span class="rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 font-medium text-slate-700">
                    {lightlyLinkedCount()} light
                  </span>
                </Show>
                <span class="rounded-full border border-violet-200/80 bg-white/90 px-2.5 py-1 font-medium text-violet-900">
                  {allCards().length} total card{allCards().length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
        )}
      </Show>
      <Show when={knowledgeGraphStudentFocus()}>
        {(state) => (
          <div class="mb-4 rounded-2xl border border-sky-200/80 bg-sky-50/85 px-4 py-3 text-sm text-sky-950 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-4xl">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800/75">
                  Find the best study path in this graph
                </p>
                <p class="mt-1 font-medium">{state().headline}</p>
                <p class="mt-1 text-xs leading-5 text-sky-900/80">{state().detail}</p>
              </div>
              <span class="rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-sky-900">
                {state().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={state().cards}>
                {(card) => (
                  <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                    card.tone === "emerald"
                      ? "border-emerald-200/80 bg-white/90"
                      : card.tone === "violet"
                        ? "border-violet-200/80 bg-white/90"
                        : card.tone === "amber"
                          ? "border-amber-200/80 bg-white/90"
                          : "border-sky-200/80 bg-white/90"
                  }`}>
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      card.tone === "emerald"
                        ? "text-emerald-800/80"
                        : card.tone === "violet"
                          ? "text-violet-800/80"
                          : card.tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {card.label}
                    </p>
                    <p class="mt-1 text-sm font-semibold text-on-surface">{card.value}</p>
                    <p class="mt-1 text-xs leading-5 text-on-surface/80">{card.detail}</p>
                  </div>
                )}
              </For>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runStudentFocusAction(state().primaryActionId)}
                class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
              >
                {state().primaryActionLabel}
              </button>
              <Show when={state().secondaryActionId}>
                <button
                  type="button"
                  onClick={() => runStudentFocusAction(state().secondaryActionId)}
                  class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
                >
                  {state().secondaryActionLabel}
                </button>
              </Show>
            </div>
          </div>
        )}
      </Show>
      <Show when={knowledgeGraphRobustness()}>
        {(state) => (
          <div class={`mb-4 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            state().tone === "emerald"
              ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-950"
              : state().tone === "sky"
                ? "border-sky-200/80 bg-sky-50/80 text-sky-950"
                : "border-amber-200/80 bg-amber-50/80 text-amber-950"
          }`}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-4xl">
                <p class={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                  state().tone === "emerald"
                    ? "text-emerald-800/80"
                    : state().tone === "sky"
                      ? "text-sky-800/80"
                      : "text-amber-800/80"
                }`}>
                  Robustness check
                </p>
                <p class="mt-1 font-medium">{state().headline}</p>
                <p class="mt-1 text-xs leading-5 opacity-85">{state().detail}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runRobustnessAction(state().primaryActionId)}
                  class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
                >
                  {state().primaryActionLabel}
                </button>
                <Show when={state().secondaryActionId}>
                  <button
                    type="button"
                    onClick={() => runRobustnessAction(state().secondaryActionId)}
                    class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
                  >
                    {state().secondaryActionLabel}
                  </button>
                </Show>
              </div>
            </div>
          </div>
        )}
      </Show>
      <Show when={knowledgeGraphNextMove()}>
        {(state) => (
          <div class="mb-4 rounded-2xl border border-violet-200/80 bg-violet-50/80 px-4 py-3 text-sm text-violet-950 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-4xl">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800/80">
                  {state().eyebrow}
                </p>
                <p class="mt-1 font-medium">{state().headline}</p>
                <p class="mt-1 text-xs leading-5 text-violet-950/80">{state().detail}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Show when={knowledgeGraphCoverage()?.recommendedTag && activeTag() !== knowledgeGraphCoverage()?.recommendedTag}>
                  <button
                    type="button"
                    onClick={() => setActiveTag(knowledgeGraphCoverage()?.recommendedTag ?? null)}
                    class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-violet-950 transition hover:bg-white"
                  >
                    Focus strongest cluster
                  </button>
                </Show>
                <Show when={stronglyLinkedCount() > 0 && activeConnectionStrength() !== "high"}>
                  <button
                    type="button"
                    onClick={() => setActiveConnectionStrength("high")}
                    class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-violet-950 transition hover:bg-white"
                  >
                    Show strongest links
                  </button>
                </Show>
                <button
                  type="button"
                  onClick={openStudyWorkspaceForCurrentFocus}
                  class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-violet-950 transition hover:bg-white"
                >
                  Ask from this study focus
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
      <Show when={knowledgeGraphValuePath()}>
        {(state) => (
          <div class={`mb-4 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            state().grade === "warmup"
              ? "border-amber-200/80 bg-amber-50/80 text-amber-950"
              : state().grade === "zettelkasten"
                ? "border-violet-200/80 bg-violet-50/80 text-violet-950"
                : state().grade === "dense"
                  ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-950"
                  : "border-sky-200/80 bg-sky-50/80 text-sky-950"
          }`}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-4xl">
                <p class={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                  state().grade === "warmup"
                    ? "text-amber-800/80"
                    : state().grade === "zettelkasten"
                      ? "text-violet-800/80"
                      : state().grade === "dense"
                        ? "text-emerald-800/80"
                        : "text-sky-800/80"
                }`}>
                  Best student path from this graph
                </p>
                <p class="mt-1 font-medium">{state().headline}</p>
                <p class="mt-1 text-xs leading-5 opacity-85">{state().detail}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <span class="rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]">
                  {state().badge}
                </span>
              </div>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={state().cards}>
                {(card) => (
                  <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                    card.tone === "emerald"
                      ? "border-emerald-200/80 bg-white/90"
                      : card.tone === "violet"
                        ? "border-violet-200/80 bg-white/90"
                        : card.tone === "amber"
                          ? "border-amber-200/80 bg-white/90"
                          : "border-sky-200/80 bg-white/90"
                  }`}>
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      card.tone === "emerald"
                        ? "text-emerald-800/80"
                        : card.tone === "violet"
                          ? "text-violet-800/80"
                          : card.tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {card.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">{card.detail}</p>
                  </div>
                )}
              </For>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runValuePathAction(state().primaryActionId)}
                class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
              >
                {state().primaryActionLabel}
              </button>
              <Show when={state().secondaryActionId}>
                <button
                  type="button"
                  onClick={() => runValuePathAction(state().secondaryActionId)}
                  class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
                >
                  {state().secondaryActionLabel}
                </button>
              </Show>
            </div>
          </div>
        )}
      </Show>
      <Show when={knowledgeGraphStudyRecommendations()}>
        {(state) => (
          <div class="mb-4 rounded-2xl border border-cyan-200/80 bg-cyan-50/80 px-4 py-3 text-sm text-cyan-950 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-4xl">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-800/80">
                  Ready-to-do study outputs
                </p>
                <p class="mt-1 font-medium">{state().headline}</p>
                <p class="mt-1 text-xs leading-5 text-cyan-950/80">{state().detail}</p>
              </div>
              <span class="rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-cyan-900">
                {state().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-2">
              <For each={state().recommendations}>
                {(recommendation) => (
                  <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                    recommendation.tone === "emerald"
                      ? "border-emerald-200/80 bg-white/90"
                      : recommendation.tone === "violet"
                        ? "border-violet-200/80 bg-white/90"
                        : recommendation.tone === "amber"
                          ? "border-amber-200/80 bg-white/90"
                          : "border-sky-200/80 bg-white/90"
                  }`}>
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      recommendation.tone === "emerald"
                        ? "text-emerald-800/80"
                        : recommendation.tone === "violet"
                          ? "text-violet-800/80"
                          : recommendation.tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {recommendation.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">{recommendation.detail}</p>
                    <button
                      type="button"
                      onClick={() => runStudyRecommendationAction(recommendation.actionId)}
                      class="mt-3 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1.5 text-xs font-medium text-cyan-950 transition hover:bg-cyan-100"
                    >
                      {recommendation.actionLabel}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>
      <Show when={knowledgeGraphTrust()}>
        {(state) => (
          <div class={`mb-4 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            state().grade === "trusted"
              ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-950"
              : state().grade === "developing"
                ? "border-sky-200/80 bg-sky-50/80 text-sky-950"
                : "border-amber-200/80 bg-amber-50/80 text-amber-950"
          }`}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-4xl">
                <p class={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                  state().grade === "trusted"
                    ? "text-emerald-800/80"
                    : state().grade === "developing"
                      ? "text-sky-800/80"
                      : "text-amber-800/80"
                }`}>
                  Why you can trust this focus
                </p>
                <p class="mt-1 font-medium">{state().headline}</p>
                <p class="mt-1 text-xs leading-5 opacity-85">{state().detail}</p>
              </div>
              <span class={`rounded-full border bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                state().grade === "trusted"
                  ? "border-emerald-200/80 text-emerald-900"
                  : state().grade === "developing"
                    ? "border-sky-200/80 text-sky-900"
                    : "border-amber-200/80 text-amber-900"
              }`}>
                {state().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={state().signals}>
                {(signal) => (
                  <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                    signal.tone === "emerald"
                      ? "border-emerald-200/80 bg-white/90"
                      : signal.tone === "violet"
                        ? "border-violet-200/80 bg-white/90"
                        : signal.tone === "amber"
                          ? "border-amber-200/80 bg-white/90"
                          : "border-sky-200/80 bg-white/90"
                  }`}>
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      signal.tone === "emerald"
                        ? "text-emerald-800/80"
                        : signal.tone === "violet"
                          ? "text-violet-800/80"
                          : signal.tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {signal.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">{signal.value}</p>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>
      <Show when={knowledgeGraphCoverage()}>
        {(state) => (
          <div class={`mb-4 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            state().grade === "dense"
              ? "border-violet-200/80 bg-violet-50/80 text-violet-950"
              : state().grade === "developing"
                ? "border-sky-200/80 bg-sky-50/80 text-sky-950"
                : "border-amber-200/80 bg-amber-50/80 text-amber-950"
          }`}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-4xl">
                <p class={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                  state().grade === "dense"
                    ? "text-violet-800/80"
                    : state().grade === "developing"
                      ? "text-sky-800/80"
                      : "text-amber-800/80"
                }`}>
                  Supertag coverage
                </p>
                <p class="mt-1 font-medium">{state().headline}</p>
                <p class="mt-1 text-xs leading-5 opacity-85">{state().detail}</p>
              </div>
              <span class={`rounded-full border bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                state().grade === "dense"
                  ? "border-violet-200/80 text-violet-900"
                  : state().grade === "developing"
                    ? "border-sky-200/80 text-sky-900"
                    : "border-amber-200/80 text-amber-900"
              }`}>
                {state().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-2">
              <div class="rounded-2xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm">
                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant/70">
                  Strongest clusters
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <For each={state().clusters}>
                    {(cluster) => (
                      <button
                        type="button"
                        disabled={!cluster.filterTag}
                        onClick={() => cluster.filterTag && setActiveTag(cluster.filterTag)}
                        class={`rounded-full border px-3 py-1.5 text-left text-xs font-medium transition ${
                          cluster.recommended
                            ? "border-violet-300 bg-violet-100/90 text-violet-950"
                            : "border-slate-200/80 bg-slate-50/90 text-slate-900 hover:bg-white"
                        } disabled:cursor-default disabled:opacity-80`}
                        title={cluster.filterTag ? "Focus this cluster" : "Cluster preview"}
                      >
                        {cluster.label} · {cluster.count} cards
                        <span class="ml-1 text-[10px] opacity-70">
                          {cluster.reinforcedCount} reinforced
                        </span>
                      </button>
                    )}
                  </For>
                </div>
                <Show when={state().recommendedTag && activeTag() !== state().recommendedTag}>
                  <button
                    type="button"
                    onClick={() => setActiveTag(state().recommendedTag)}
                    class="mt-3 rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-violet-950 transition hover:bg-white"
                  >
                    Focus strongest cluster
                  </button>
                </Show>
              </div>
              <div class="grid gap-3">
                <div class="rounded-2xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant/70">
                    Source mix
                  </p>
                  <p class="mt-1 text-xs leading-5 text-on-surface">{state().sourceMixLabel}</p>
                </div>
                <div class="rounded-2xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant/70">
                    Note progression
                  </p>
                  <p class="mt-1 text-xs leading-5 text-on-surface">{state().noteProgressLabel}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={allCards().length > 0}>
        <div class="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeLens() === "all"
                ? "bg-slate-900 text-white"
                : "bg-white/60 text-on-surface-variant hover:bg-white/80"
            }`}
            onClick={() => setActiveLens("all")}
          >
            All graph
          </button>
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeLens() === "connected_notes"
                ? "bg-sky-600 text-white"
                : "bg-sky-100/80 text-sky-700 hover:bg-sky-200"
            }`}
            onClick={() => setActiveLens("connected_notes")}
          >
            Connected notes ({connectedNotesCount()})
          </button>
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeLens() === "zettelkasten"
                ? "bg-emerald-600 text-white"
                : "bg-emerald-100/80 text-emerald-700 hover:bg-emerald-200"
            }`}
            onClick={() => setActiveLens("zettelkasten")}
          >
            Zettelkasten ({zettelkastenCount()})
          </button>
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeLens() === "linked_ideas"
                ? "bg-violet-700 text-white"
                : "bg-violet-100/80 text-violet-700 hover:bg-violet-200"
            }`}
            onClick={() => setActiveLens("linked_ideas")}
          >
            Linked ideas ({linkedIdeasCount()})
          </button>
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeLens() === "study_materials"
                ? "bg-violet-600 text-white"
                : "bg-violet-100/80 text-violet-700 hover:bg-violet-200"
            }`}
            onClick={() => setActiveLens("study_materials")}
          >
            Study materials ({sourceMaterialsCount()})
          </button>
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeLens() === "source_notes"
                ? "bg-emerald-800 text-white"
                : "bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100"
            }`}
            onClick={() => setActiveLens("source_notes")}
          >
            Source notes ({sourceNotesCount()})
          </button>
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeLens() === "review_queue"
                ? "bg-amber-600 text-white"
                : "bg-amber-100/80 text-amber-700 hover:bg-amber-200"
            }`}
            onClick={() => setActiveLens("review_queue")}
          >
            Review queue ({reviewQueueCount()})
          </button>
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeLens() === "permanent_notes"
                ? "bg-emerald-700 text-white"
                : "bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100"
            }`}
            onClick={() => setActiveLens("permanent_notes")}
          >
            Permanent notes ({permanentNotesCount()})
          </button>
        </div>
      </Show>

      <Show when={allCards().length > 0 && cardsWithConnectionsCount() > 0}>
        <div class="mb-4 rounded-2xl border border-teal-200/60 bg-teal-50/70 px-3 py-3 shadow-sm">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-800/75">Connection strength</p>
              <p class="mt-1 text-xs leading-5 text-teal-950/85">
                Start with the strongest links when you want immediate study value, then drill into weaker links to grow the graph.
              </p>
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeConnectionStrength() === null
                  ? "bg-teal-700 text-white"
                  : "bg-white/80 text-teal-900 hover:bg-white"
              }`}
              onClick={() => setActiveConnectionStrength(null)}
            >
              All link strengths
            </button>
            <button
              type="button"
              class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeConnectionStrength() === "high"
                  ? "bg-teal-700 text-white"
                  : "bg-teal-100/90 text-teal-800 hover:bg-teal-200"
              }`}
              onClick={() => setActiveConnectionStrength(activeConnectionStrength() === "high" ? null : "high")}
            >
              Strong links ({stronglyLinkedCount()})
            </button>
            <button
              type="button"
              class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeConnectionStrength() === "medium"
                  ? "bg-cyan-700 text-white"
                  : "bg-cyan-100/90 text-cyan-800 hover:bg-cyan-200"
              }`}
              onClick={() => setActiveConnectionStrength(activeConnectionStrength() === "medium" ? null : "medium")}
            >
              Medium links ({moderatelyLinkedCount()})
            </button>
            <Show when={lightlyLinkedCount() > 0}>
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeConnectionStrength() === "low"
                    ? "bg-slate-700 text-white"
                    : "bg-slate-100/90 text-slate-700 hover:bg-slate-200"
                }`}
                onClick={() => setActiveConnectionStrength(activeConnectionStrength() === "low" ? null : "low")}
              >
                Light links ({lightlyLinkedCount()})
              </button>
            </Show>
          </div>
        </div>
      </Show>

      {/* Supertag filter pills */}
      <Show when={allTags().length > 0}>
        <div class="mb-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeTag() === null
                ? "bg-primary text-white"
                : "bg-white/60 text-on-surface-variant hover:bg-white/80"
            }`}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          <For each={allTags()}>
            {(tag) => (
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeTag() === tag
                    ? "bg-violet-600 text-white"
                    : "bg-violet-100/80 text-violet-700 hover:bg-violet-200"
                }`}
                onClick={() => setActiveTag(activeTag() === tag ? null : tag)}
              >
                #{tag}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Insight banner */}
      <InsightBanner insights={insights()} />

      {/* Empty state */}
      <Show when={isEmpty()}>
        <StudyStarterEmptyState
          onOpenStudyChat={() => navigateToView("search")}
          onOpenFiles={() => navigateToView("files")}
          onOpenStudyQuickStart={props.onOpenStudyQuickStart}
        />
      </Show>

      {/* Knowledge card grid */}
      <Show when={filteredCards().length > 0}>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <For each={filteredCards()}>
            {(card) => (
              <KnowledgeCardTile
                card={card}
                activeTag={activeTag()}
                onTagSelect={(tag) => setActiveTag(activeTag() === tag ? null : tag)}
                highlighted={highlightedCardIds().has(card.id)}
                onOpenThread={props.onOpenThread}
              />
            )}
          </For>
        </div>
      </Show>

      <Show when={allAcademicKinds().length > 0 || allCourseTags().length > 0 || allUnitTags().length > 0 || allChapterTags().length > 0 || allWeekTags().length > 0 || allLectureTags().length > 0 || allZettelkastenStages().length > 0}>
        <div class="mb-4 flex flex-col gap-2">
          <Show when={allAcademicKinds().length > 0}>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeAcademicKind() === null
                    ? "bg-fuchsia-600 text-white"
                    : "bg-fuchsia-100/80 text-fuchsia-700 hover:bg-fuchsia-200"
                }`}
                onClick={() => setActiveAcademicKind(null)}
              >
                All study types
              </button>
              <For each={allAcademicKinds()}>
                {(value) => (
                  <button
                    type="button"
                    class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      activeAcademicKind() === value
                        ? "bg-fuchsia-600 text-white"
                        : "bg-fuchsia-100/80 text-fuchsia-700 hover:bg-fuchsia-200"
                    }`}
                    onClick={() => setActiveAcademicKind(activeAcademicKind() === value ? null : value)}
                  >
                    {formatKnowledgeContextLabel(value)}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={allCourseTags().length > 0}>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeCourseTag() === null
                    ? "bg-violet-600 text-white"
                    : "bg-violet-100/80 text-violet-700 hover:bg-violet-200"
                }`}
                onClick={() => setActiveCourseTag(null)}
              >
                All courses
              </button>
              <For each={allCourseTags()}>
                {(value) => (
                  <button
                    type="button"
                    class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      activeCourseTag() === value
                        ? "bg-violet-600 text-white"
                        : "bg-violet-100/80 text-violet-700 hover:bg-violet-200"
                    }`}
                    onClick={() => setActiveCourseTag(activeCourseTag() === value ? null : value)}
                  >
                    {value}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={allUnitTags().length > 0}>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeUnitTag() === null
                    ? "bg-teal-600 text-white"
                    : "bg-teal-100/80 text-teal-700 hover:bg-teal-200"
                }`}
                onClick={() => setActiveUnitTag(null)}
              >
                All units
              </button>
              <For each={allUnitTags()}>
                {(value) => (
                  <button
                    type="button"
                    class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      activeUnitTag() === value
                        ? "bg-teal-600 text-white"
                        : "bg-teal-100/80 text-teal-700 hover:bg-teal-200"
                    }`}
                    onClick={() => setActiveUnitTag(activeUnitTag() === value ? null : value)}
                  >
                    {value}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={allChapterTags().length > 0}>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeChapterTag() === null
                    ? "bg-lime-600 text-white"
                    : "bg-lime-100/80 text-lime-700 hover:bg-lime-200"
                }`}
                onClick={() => setActiveChapterTag(null)}
              >
                All chapters
              </button>
              <For each={allChapterTags()}>
                {(value) => (
                  <button
                    type="button"
                    class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      activeChapterTag() === value
                        ? "bg-lime-600 text-white"
                        : "bg-lime-100/80 text-lime-700 hover:bg-lime-200"
                    }`}
                    onClick={() => setActiveChapterTag(activeChapterTag() === value ? null : value)}
                  >
                    {value}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={allWeekTags().length > 0}>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeWeekTag() === null
                    ? "bg-sky-600 text-white"
                    : "bg-sky-100/80 text-sky-700 hover:bg-sky-200"
                }`}
                onClick={() => setActiveWeekTag(null)}
              >
                All weeks
              </button>
              <For each={allWeekTags()}>
                {(value) => (
                  <button
                    type="button"
                    class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      activeWeekTag() === value
                        ? "bg-sky-600 text-white"
                        : "bg-sky-100/80 text-sky-700 hover:bg-sky-200"
                    }`}
                    onClick={() => setActiveWeekTag(activeWeekTag() === value ? null : value)}
                  >
                    {value}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={allLectureTags().length > 0}>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeLectureTag() === null
                    ? "bg-sky-700 text-white"
                    : "bg-sky-100/80 text-sky-700 hover:bg-sky-200"
                }`}
                onClick={() => setActiveLectureTag(null)}
              >
                All lectures
              </button>
              <For each={allLectureTags()}>
                {(value) => (
                  <button
                    type="button"
                    class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      activeLectureTag() === value
                        ? "bg-sky-700 text-white"
                        : "bg-sky-100/80 text-sky-700 hover:bg-sky-200"
                    }`}
                    onClick={() => setActiveLectureTag(activeLectureTag() === value ? null : value)}
                  >
                    {value}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={allZettelkastenStages().length > 0}>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeZettelkastenStage() === null
                    ? "bg-emerald-700 text-white"
                    : "bg-emerald-100/80 text-emerald-700 hover:bg-emerald-200"
                }`}
                onClick={() => setActiveZettelkastenStage(null)}
              >
                All ZK stages
              </button>
              <For each={allZettelkastenStages()}>
                {(value) => (
                  <button
                    type="button"
                    class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      activeZettelkastenStage() === value
                        ? "bg-emerald-700 text-white"
                        : "bg-emerald-100/80 text-emerald-700 hover:bg-emerald-200"
                    }`}
                    onClick={() => setActiveZettelkastenStage(activeZettelkastenStage() === value ? null : value)}
                  >
                    {formatKnowledgeContextLabel(value)}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      {/* No results for current filter */}
      <Show when={!isEmpty() && filteredCards().length === 0}>
        <div class="rounded-2xl border border-dashed border-white/60 bg-white/45 px-6 py-10 text-center">
          <p class="text-sm font-medium text-on-surface">No knowledge cards match your current filter.</p>
          <p class="mt-2 text-sm text-on-surface-variant">
            Broaden the graph focus, clear the current course, week, or lecture filters, or return to Files to inspect what was retained.
          </p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={clearGraphFilters}
              class="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-white"
            >
              Clear graph filters
            </button>
            <button
              type="button"
              onClick={() => {
                saveFileLibraryNavigationIntent(buildFileLibraryIntentFromKnowledgeGraphFocus({
                  searchQuery: searchQuery(),
                  activeTag: activeTag(),
                  activeLens: activeLens(),
                  academicKind: activeAcademicKind(),
                  courseTag: activeCourseTag(),
                  unitTag: activeUnitTag(),
                  chapterTag: activeChapterTag(),
                  weekTag: activeWeekTag(),
                  lectureTag: activeLectureTag(),
                  zettelkastenStage: activeZettelkastenStage(),
                }));
                navigateToView("files");
              }}
              class="rounded-full border border-violet-200/80 bg-violet-50/90 px-3 py-1.5 text-xs font-medium text-violet-900 transition hover:bg-violet-100"
            >
              Open Files
            </button>
            <button
              type="button"
              onClick={() => openReportsForCurrentFocus()}
              class="rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1.5 text-xs font-medium text-cyan-900 transition hover:bg-cyan-100"
            >
              Generate report
            </button>
          </div>
        </div>
      </Show>

      {/* Merge suggestions tray */}
      <MergeSuggestionTray suggestions={mergeSuggestions()} />
    </div>
  );
}
