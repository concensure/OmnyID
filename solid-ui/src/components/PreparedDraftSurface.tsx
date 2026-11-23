// @locs-version: 1.0
import { createMemo, For, onCleanup, onMount, Show } from "solid-js";
import { subscribeMagicActionEvent } from "@/lib/magicActionEvent";
import {
  outcomeFeedbackAdaptationDetail,
  outcomeFeedbackDetail,
  outcomeFeedbackLabel,
  outcomeFeedbackTone,
  preparedDraftActionLabel,
  preparedDraftClassLabel,
  preparedDraftDestinationForItem,
  preparedDraftOutcomeFeedbackForItem,
  preparedDraftHeading,
  preparedDraftIntro,
} from "afp-ts/continuity";
import {
  type DecisionOsQueueCompanionState,
} from "@/lib/decisionOsQueueBootstrapState";
import { navigateToView } from "@/lib/decisionosNavigation";
import { decisionOsPreparedDraftPresentationState } from "@/lib/decisionosPreparedWorkState";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";

const DEFAULT_SECTION_CLASS =
  "rounded-[28px] border border-emerald-100/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.92),rgba(255,255,255,0.96))] p-4 shadow-[0_18px_50px_-28px_rgba(5,150,105,0.35)] backdrop-blur-sm";
const SECTION_LABEL_CLASS =
  "font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-700/70";
const SECTION_TITLE_CLASS = "mt-1 text-sm font-semibold text-on-surface";
const HEADER_ACTION_CLASS =
  "rounded-full border border-emerald-200/70 bg-white/85 font-medium text-emerald-700 transition hover:bg-white";
const COUNT_BADGE_CLASS =
  "rounded-full border border-emerald-200/70 bg-white/80 text-emerald-700";
const DRAFT_CARD_CLASS =
  "group rounded-2xl border border-white/70 bg-white/80 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-200/80";
const DECISION_MEMO_PANEL_CLASS = "rounded-2xl border border-amber-100/70 bg-amber-50/45";
const COMPARISON_PANEL_CLASS = "overflow-x-auto rounded-2xl border border-emerald-100/70 bg-emerald-50/45";
const TASK_BUNDLE_PANEL_CLASS = "rounded-2xl border border-sky-100/70 bg-sky-50/45";
const PREP_HIGHLIGHTS_PANEL_CLASS = "rounded-2xl border border-violet-100/70 bg-violet-50/45";

type PreparedDraftSurfaceProps = {
  queueCompanionState: DecisionOsQueueCompanionState;
  compact?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  class?: string;
};

function readinessTone(readiness: string): string {
  if (readiness === "ready_now") return "border-emerald-200/70 bg-emerald-50/80 text-emerald-700";
  return "border-slate-200/70 bg-slate-50/80 text-slate-600";
}

function bodyBullets(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function highlightLines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("- ") && !line.endsWith(":"))
    .slice(0, 4);
}

export function PreparedDraftSurface(props: PreparedDraftSurfaceProps) {
  const compact = () => props.compact ?? false;
  const queueCompanionState = () => props.queueCompanionState;
  const sectionOverrideClass = () => props.class;
  const headerAction = () => props.onAction;
  const headerActionLabel = () => props.actionLabel ?? null;
  const preparedDraftItems = () => queueCompanionState().preparedDraftItems;
  const proactiveSuggestions = () => queueCompanionState().proactiveSuggestions;
  const surfaceState = createMemo(() => {
    const items = preparedDraftItems();
    const totalPreparedDraftCount = items.length;
    return {
      compact: compact(),
      sectionClass: sectionOverrideClass() ?? DEFAULT_SECTION_CLASS,
      gridClass: compact() ? "mt-3 gap-2" : "mt-5 gap-3",
      headerGapClass: `flex flex-wrap items-start justify-between gap-${compact() ? "3" : "4"}`,
      introClass: `mt-2 ${compact() ? "text-[11px]" : "text-sm"} text-emerald-800/70`,
      headerActionClass: `${HEADER_ACTION_CLASS} ${compact() ? "px-3 py-1 text-[11px]" : "px-4 py-2 text-sm"}`,
      countBadgeClass: `${COUNT_BADGE_CLASS} ${compact() ? "px-3 py-1 text-[11px]" : "px-4 py-2 text-sm"}`,
      visiblePreparedDraftItems: items.slice(0, compact() ? 2 : 4),
      totalPreparedDraftCount,
      totalPreparedDraftCountLabel: `${totalPreparedDraftCount} draft${totalPreparedDraftCount === 1 ? "" : "s"}`,
      showHeaderAction: Boolean(headerAction() && headerActionLabel()),
      headerAction: headerAction(),
      headerActionLabel: headerActionLabel(),
      heading: preparedDraftHeading(items),
      intro: preparedDraftIntro(items),
    };
  });

  onMount(() => {
    const unsubscribeMagicActionEvent = subscribeMagicActionEvent(({ action, msgId }) => {
      if (action !== "open" || !msgId?.startsWith("pd-")) return;
      const idx = parseInt(msgId.slice(3), 10);
      const item = preparedDraftItems()[idx];
      if (!item) return;
      const view = preparedDraftDestinationForItem({ draft_class: item.draft_class });
      if (view) navigateToView(view);
    });
    onCleanup(() => unsubscribeMagicActionEvent());
  });

  return (
    <Show when={surfaceState().totalPreparedDraftCount > 0}>
      <section class={surfaceState().sectionClass}>
        <div class={surfaceState().headerGapClass}>
          <div>
            <p class={SECTION_LABEL_CLASS}>Prepared Drafts</p>
            <h2 class={SECTION_TITLE_CLASS}>{surfaceState().heading}</h2>
            <p class={surfaceState().introClass}>{surfaceState().intro}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Show when={surfaceState().showHeaderAction}>
              <button
                type="button"
                onClick={() => surfaceState().headerAction?.()}
                class={surfaceState().headerActionClass}
              >
                {surfaceState().headerActionLabel}
              </button>
            </Show>
            <div class={surfaceState().countBadgeClass}>
              {surfaceState().totalPreparedDraftCountLabel}
            </div>
          </div>
        </div>

        <div class={`grid ${surfaceState().gridClass}`}>
          <For each={surfaceState().visiblePreparedDraftItems}>
            {(item, index) => {
              const feedback = preparedDraftOutcomeFeedbackForItem(item, proactiveSuggestions());
              const draftCardState = (() => {
                const isCompact = surfaceState().compact;
                const presentationState = decisionOsPreparedDraftPresentationState(item);
                const feedbackDetailText = outcomeFeedbackDetail(feedback);
                const feedbackAdaptationText = outcomeFeedbackAdaptationDetail(feedback);
                const feedbackLabel = outcomeFeedbackLabel(feedback);
                const destinationView = preparedDraftDestinationForItem({ draft_class: item.draft_class });
                const draftBodyBullets = bodyBullets(item.body);
                const draftHighlightLines = highlightLines(item.body);
                const comparisonRows = (item.comparison_rows ?? []).slice(0, isCompact ? 2 : 3);
                return {
                  cardClass: `${DRAFT_CARD_CLASS} ${isCompact ? "px-3 py-3" : "px-4 py-4"}`,
                  titleClass: `${isCompact ? "text-sm" : "text-base"} break-words font-medium text-on-surface`,
                  summaryClass: `mt-1 break-words ${isCompact ? "text-[11px]" : "text-xs"} text-on-surface-variant/75`,
                  detailClass: `${isCompact ? "text-[10px]" : "text-[11px]"}`,
                  metadataClass: `mt-2 flex flex-wrap items-center gap-2 ${isCompact ? "text-[11px]" : "text-xs"} text-on-surface-variant/70`,
                  feedbackBadgeClass: `max-w-full break-words rounded-full border uppercase tracking-wide ${outcomeFeedbackTone(feedback)} ${isCompact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-[11px]"}`,
                  readinessClass: `rounded-full border font-medium ${readinessTone(item.readiness)} ${isCompact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1 text-[11px]"}`,
                  decisionMemoPanelClass: `mt-3 ${DECISION_MEMO_PANEL_CLASS} ${isCompact ? "p-2" : "p-3"}`,
                  comparisonPanelClass: `mt-3 ${COMPARISON_PANEL_CLASS} ${isCompact ? "p-2" : "p-3"}`,
                  taskBundlePanelClass: `mt-3 ${TASK_BUNDLE_PANEL_CLASS} ${isCompact ? "p-2" : "p-3"}`,
                  prepHighlightsPanelClass: `mt-3 ${PREP_HIGHLIGHTS_PANEL_CLASS} ${isCompact ? "p-2" : "p-3"}`,
                  previewHeadingClass: `font-mono uppercase tracking-[0.16em] ${isCompact ? "text-[10px]" : "text-[11px]"}`,
                  previewBodyClass: `mt-2 grid gap-1.5 ${isCompact ? "text-[11px]" : "text-xs"} text-on-surface-variant/80`,
                  title: item.title,
                  summary: item.summary,
                  boundedReasonText: presentationState.boundedReason,
                  distinctSelectionReasonText: presentationState.distinctSelectionReason,
                  distinctSuggestedActionText: presentationState.distinctSuggestedAction,
                  feedbackDetailText,
                  feedbackAdaptationText,
                  feedbackLabel,
                  feedbackToneClass: outcomeFeedbackTone(feedback),
                  sourceSummary: presentationState.sourceSummary,
                  consequenceSummary: presentationState.consequencePreview,
                  provenanceSummary: presentationState.provenanceCue,
                  autonomySummary: presentationState.autonomySummary,
                  destinationView,
                  draftActionText: preparedDraftActionLabel([item]),
                  readinessText: item.readiness === "ready_now" ? "ready now" : item.readiness,
                  confidenceSummaryText: `${item.confidence} confidence`,
                  responseDueSummaryText: item.response_due_hint,
                  decisionMemoBullets: draftBodyBullets.slice(0, isCompact ? 2 : 3),
                  taskBundleBullets: draftBodyBullets.slice(0, isCompact ? 2 : 4),
                  prepHighlightLines: draftHighlightLines.slice(0, isCompact ? 2 : 3),
                  comparisonRows,
                  draftClassText: preparedDraftClassLabel(item.draft_class),
                  showBoundedReason: Boolean(presentationState.boundedReason),
                  showDistinctSelectionReason: Boolean(presentationState.distinctSelectionReason),
                  showFeedbackDetail: Boolean(feedbackDetailText),
                  showFeedbackAdaptation: Boolean(feedbackAdaptationText),
                  showSourceSummary: Boolean(presentationState.sourceSummary),
                  showConsequenceSummary: Boolean(presentationState.consequencePreview),
                  showProvenanceSummary: Boolean(presentationState.provenanceCue),
                  showAutonomySummary: Boolean(presentationState.autonomySummary),
                  showFeedbackBadge: Boolean(feedbackLabel),
                  showDistinctSuggestedAction: Boolean(presentationState.distinctSuggestedAction),
                  showDecisionMemoPreview: item.draft_class === "decision_memo",
                  showComparisonPreview:
                    item.draft_class === "comparison_table" && comparisonRows.length > 0,
                  showTaskBundlePreview: item.draft_class === "task_bundle",
                  showPrepHighlights:
                    item.draft_class === "project_prep_note" || item.draft_class === "meeting_brief",
                };
              })();
              const openPreparedDraft = () => {
                if (!draftCardState.destinationView) return;
                navigateToView(draftCardState.destinationView);
              };

              return (
                <button
                  type="button"
                  onClick={openPreparedDraft}
                  class={draftCardState.cardClass}
                  data-magic-action="open"
                  data-magic-icon="draft"
                  data-magic-label="Review draft"
                  data-magic-id={`pd-${index()}`}
                >
                  <div class={`flex flex-wrap items-start justify-between ${surfaceState().compact ? "gap-2" : "gap-3"}`}>
                    <div class="min-w-0 flex-1">
                      <p class={draftCardState.titleClass}>{draftCardState.title}</p>
                      <p class={draftCardState.summaryClass}>
                        {draftCardState.summary}
                      </p>
                      <TrustSummaryBlocks
                        boundedReason={draftCardState.boundedReasonText}
                        selectionReason={draftCardState.distinctSelectionReasonText}
                        showSelectionReason={draftCardState.showDistinctSelectionReason}
                        sourceSummary={draftCardState.sourceSummary}
                        consequencePreview={draftCardState.consequenceSummary}
                        provenanceCue={draftCardState.provenanceSummary}
                        confidence={draftCardState.confidenceSummaryText}
                      />
                      <Show when={draftCardState.showFeedbackDetail}>
                        <p class={`mt-1 ${draftCardState.detailClass} text-on-surface-variant/65`}>
                          {draftCardState.feedbackDetailText}
                        </p>
                      </Show>
                      <Show when={draftCardState.showFeedbackAdaptation}>
                        <p class={`mt-1 ${draftCardState.detailClass} text-on-surface-variant/65`}>
                          {draftCardState.feedbackAdaptationText}
                        </p>
                      </Show>
                      <Show when={draftCardState.showAutonomySummary}>
                        <p class={`mt-1 ${draftCardState.detailClass} text-on-surface-variant/65`}>
                          {draftCardState.autonomySummary}
                        </p>
                      </Show>
                      <Show when={draftCardState.showDecisionMemoPreview}>
                        <div class={draftCardState.decisionMemoPanelClass}>
                          <p class={`${draftCardState.previewHeadingClass} text-amber-800/70`}>
                            Decision Memo
                          </p>
                          <div class={draftCardState.previewBodyClass}>
                            <For each={draftCardState.decisionMemoBullets}>
                              {(bullet) => <p class="break-words">- {bullet}</p>}
                            </For>
                          </div>
                        </div>
                      </Show>
                      <Show when={draftCardState.showComparisonPreview}>
                        <div class={draftCardState.comparisonPanelClass}>
                          <div class="-mx-1 overflow-x-auto px-1">
                            <table class={`min-w-full ${surfaceState().compact ? "text-[10px]" : "text-[11px]"} text-left`}>
                            <thead>
                              <tr class="border-b border-emerald-100/80 text-emerald-800">
                                <th class={`pb-2 pr-2 font-semibold ${surfaceState().compact ? "min-w-20" : "min-w-24"}`}>Option</th>
                                <For each={item.comparison_headers ?? []}>
                                  {(header) => <th class="pb-2 pr-2 font-semibold">{header}</th>}
                                </For>
                              </tr>
                            </thead>
                            <tbody>
                              <For each={draftCardState.comparisonRows}>
                                {(row) => (
                                  <tr class="border-b border-emerald-100/50 last:border-0">
                                    <td class="py-1.5 pr-2 font-medium text-on-surface">{row.label}</td>
                                    <For each={row.values}>
                                      {(value) => <td class="py-1.5 pr-2 text-on-surface-variant/80">{value}</td>}
                                    </For>
                                  </tr>
                                )}
                              </For>
                            </tbody>
                          </table>
                          </div>
                        </div>
                      </Show>
                      <Show when={draftCardState.showTaskBundlePreview}>
                        <div class={draftCardState.taskBundlePanelClass}>
                          <p class={`${draftCardState.previewHeadingClass} text-sky-800/70`}>
                            Grouped Work
                          </p>
                          <div class={draftCardState.previewBodyClass}>
                            <For each={draftCardState.taskBundleBullets}>
                              {(bullet) => <p class="break-words">- {bullet}</p>}
                            </For>
                          </div>
                        </div>
                      </Show>
                      <Show when={draftCardState.showPrepHighlights}>
                        <div class={draftCardState.prepHighlightsPanelClass}>
                          <p class={`${draftCardState.previewHeadingClass} text-violet-800/70`}>
                            Prep Highlights
                          </p>
                          <div class={draftCardState.previewBodyClass}>
                            <For each={draftCardState.prepHighlightLines}>
                              {(line) => <p class="break-words">{line}</p>}
                            </For>
                          </div>
                        </div>
                      </Show>
                      <div class={draftCardState.metadataClass}>
                        <span class={`max-w-full break-words rounded-full border border-emerald-200/60 bg-emerald-50/80 uppercase tracking-wide text-emerald-700 ${surfaceState().compact ? "px-2 py-1" : "px-2.5 py-1"}`}>
                          {item.channel}
                        </span>
                        <span class={`max-w-full break-words rounded-full border border-white/70 bg-white/85 uppercase tracking-wide text-on-surface-variant/75 ${surfaceState().compact ? "px-2 py-1" : "px-2.5 py-1"}`}>
                          {draftCardState.draftClassText}
                        </span>
                        <Show when={draftCardState.showFeedbackBadge}>
                          <span class={draftCardState.feedbackBadgeClass}>
                            {draftCardState.feedbackLabel}
                          </span>
                        </Show>
                        <span>{draftCardState.responseDueSummaryText}</span>
                        <Show when={draftCardState.showDistinctSuggestedAction}>
                          <span>{draftCardState.distinctSuggestedActionText}</span>
                        </Show>
                      </div>
                    </div>
                    <span class={draftCardState.readinessClass}>
                      {draftCardState.readinessText}
                    </span>
                  </div>
                  {/* The whole card is the click target (data-magic-action="open" above), but nothing
                      previously signaled that or where the primary action was — this makes it explicit. */}
                  <div class="mt-3 flex justify-end">
                    <span class={`inline-flex items-center gap-1.5 rounded-full bg-emerald-700 font-semibold text-white shadow-sm transition group-hover:bg-emerald-800 ${surfaceState().compact ? "px-3 py-1.5 text-[11px]" : "px-4 py-2 text-xs"}`}>
                      {draftCardState.draftActionText}
                      <span aria-hidden="true">→</span>
                    </span>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </section>
    </Show>
  );
}
