// @locs-version: 1.0
import { createMemo, For, Show } from "solid-js";
import {
  contextPackObjectSearchTarget,
  evidenceKindsSummary,
  resolveContextPackNavigationTarget,
  summarizeReferenceLabels,
} from "afp-ts/continuity";
import { continuityThreadSearchQuery } from "afp-ts/retrieval";
import { ThreadDiscoveryStateSummary } from "@/components/ThreadDiscoveryStateSummary";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import type { DashboardBootstrap } from "@/lib/api";
import {
  type DecisionOsQueueCompanionState,
} from "@/lib/decisionOsQueueBootstrapState";
import {
  decisionOsDestinationLabel,
  navigateToView,
} from "@/lib/decisionosNavigation";
import { decisionOsContextPackTrustState } from "@/lib/decisionOsContextPackPresentationState";
import { hasThreadRetrievalState, threadRetrievalState } from "@/lib/threadRetrievalState";
import { openThreadSearch } from "@/lib/threadSearchNavigation";
import { openObjectSearch } from "@/lib/objectSearchNavigation";

const DEFAULT_SECTION_CLASS =
  "rounded-[28px] border border-sky-100/80 bg-[linear-gradient(135deg,rgba(239,246,255,0.94),rgba(255,255,255,0.98))] p-4 shadow-[0_18px_50px_-30px_rgba(14,116,144,0.25)] backdrop-blur-sm";
const SECTION_LABEL_CLASS =
  "font-mono text-[10px] uppercase tracking-[0.22em] text-sky-700/70";
const SECTION_TITLE_CLASS = "mt-1 text-sm font-semibold text-on-surface";
const HEADER_ACTION_CLASS =
  "rounded-full border border-sky-200/70 bg-white/85 font-medium text-sky-700 transition hover:bg-white";
const COUNT_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-white/80 text-sky-700";
const CONTEXT_PACK_CARD_CLASS =
  "rounded-2xl border border-white/70 bg-white/80 text-left shadow-sm transition hover:shadow-md";
const CARD_OPEN_BUTTON_CLASS =
  "min-w-0 flex-1 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-sky-200/80";
const THREAD_RETRIEVAL_CLASS =
  "mt-2 rounded-xl border border-sky-100/80 bg-sky-50/55 px-2.5 py-2 shadow-none";
const EVIDENCE_CHIP_CLASS =
  "max-w-full break-words rounded-full border border-slate-200/70 bg-slate-50/80 px-2.5 py-1 uppercase tracking-wide text-slate-600";
const RELATED_REFERENCE_CHIP_CLASS =
  "max-w-full break-words rounded-full border border-sky-200/70 bg-sky-50/85 px-2.5 py-1 text-sky-700";
const RELATED_FILE_CHIP_CLASS =
  "max-w-full break-words rounded-full border border-emerald-200/70 bg-emerald-50/85 px-2.5 py-1 text-emerald-700";
const OBJECT_SEARCH_BUTTON_CLASS =
  "rounded-full border border-sky-200/70 bg-sky-50/85 font-medium text-sky-700 transition hover:bg-sky-100";
const THREAD_SEARCH_BUTTON_CLASS =
  "rounded-full border border-sky-200/70 bg-white/90 font-medium text-sky-700 transition hover:bg-sky-50";

type ContextPackSurfaceProps = {
  queueCompanionState: DecisionOsQueueCompanionState;
  compact?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  class?: string;
};

type ContextPackItem = NonNullable<DashboardBootstrap["continuity_context_pack_items"]>[number];

function packKindLabel(packKind: string): string {
  if (packKind === "topic_pack") return "topic pack";
  if (packKind === "obligation_pack") return "obligation pack";
  return packKind.replaceAll("_", " ");
}

function packTone(packKind: string): string {
  if (packKind === "obligation_pack") {
    return "border-amber-200/70 bg-amber-50/80 text-amber-700";
  }
  return "border-sky-200/70 bg-sky-50/80 text-sky-700";
}

export function ContextPackSurface(props: ContextPackSurfaceProps) {
  const compact = () => props.compact ?? false;
  const queueCompanionState = () => props.queueCompanionState;
  const sectionOverrideClass = () => props.class;
  const headerAction = () => props.onAction;
  const headerActionLabel = () => props.actionLabel ?? null;
  const contextPackItems = () => queueCompanionState().contextPackItems;
  const surfaceState = createMemo(() => {
    const items = contextPackItems();
    const totalContextPackCount = items.length;
    const isCompact = compact();
    return {
      compact: isCompact,
      sectionClass: sectionOverrideClass() ?? DEFAULT_SECTION_CLASS,
      headerGapClass: `flex flex-wrap items-start justify-between gap-${isCompact ? "3" : "4"}`,
      introClass: `mt-2 ${isCompact ? "text-[11px]" : "text-sm"} text-sky-900/70`,
      headerActionClass: `${HEADER_ACTION_CLASS} ${isCompact ? "px-3 py-1 text-[11px]" : "px-4 py-2 text-sm"}`,
      countBadgeClass: `${COUNT_BADGE_CLASS} ${isCompact ? "px-3 py-1 text-[11px]" : "px-4 py-2 text-sm"}`,
      gridClass: isCompact ? "mt-3 gap-2" : "mt-5 gap-3",
      visibleContextPackItems: items.slice(0, isCompact ? 2 : 4),
      totalContextPackCount,
      totalContextPackCountLabel: `${totalContextPackCount} pack${totalContextPackCount === 1 ? "" : "s"}`,
      showHeaderAction: Boolean(headerAction() && headerActionLabel()),
      headerAction: headerAction(),
      headerActionLabel: headerActionLabel(),
    };
  });

  function openPackObjectSearch(item: ContextPackItem) {
    const target = contextPackObjectSearchTarget({
      pack_kind: item.pack_kind,
      object_refs: item.object_refs,
      reference_refs: item.reference_refs,
      file_refs: item.file_refs,
    });
    if (!target?.query) return;
    openObjectSearch({
      query: target.query,
      focusObjectId: target.focusObjectId ?? null,
      launchContext: {
        sourceLabel: "Context pack",
        reason: `Related objects from ${packKindLabel(item.pack_kind)}`,
      },
    });
  }

  function openPackThreadSearch(item: ContextPackItem) {
    const query = continuityThreadSearchQuery({
      title: item.title,
      reference_labels: item.reference_labels,
      object_labels: item.object_labels,
      file_labels: item.file_labels,
      pack_kind: item.pack_kind,
      source_refs: item.source_refs,
      reference_refs: item.reference_refs,
      object_refs: item.object_refs,
      file_refs: item.file_refs,
    });
    if (!query) return;
    openThreadSearch({
      query,
      launchContext: {
        sourceLabel: "Context pack",
        reason: `Refine threads related to ${packKindLabel(item.pack_kind)}`,
      },
    });
  }

  return (
    <Show when={surfaceState().totalContextPackCount > 0}>
      <section class={surfaceState().sectionClass}>
        <div class={surfaceState().headerGapClass}>
          <div>
            <p class={SECTION_LABEL_CLASS}>Context Packs</p>
            <h2 class={SECTION_TITLE_CLASS}>Bounded retrieval packs ready</h2>
            <p class={surfaceState().introClass}>
              OmnyID grouped related continuity evidence into compact topic and obligation packs.
            </p>
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
              {surfaceState().totalContextPackCountLabel}
            </div>
          </div>
        </div>

        <div class={`grid ${surfaceState().gridClass}`}>
          <For each={surfaceState().visibleContextPackItems}>
            {(item) => {
              const packCardState = (() => {
                const isCompact = surfaceState().compact;
                const target = resolveContextPackNavigationTarget(item);
                const packKind = item.pack_kind;
                const trustState = decisionOsContextPackTrustState(item);
                const evidenceSummaryText = evidenceKindsSummary(item.evidence_kinds);
                const referenceSummaryText = summarizeReferenceLabels({
                  reference_refs: item.reference_refs,
                  reference_labels: item.reference_labels,
                  limit: 2,
                });
                const objectSummaryText = summarizeReferenceLabels({
                  object_refs: item.object_refs,
                  object_labels: item.object_labels,
                  limit: 2,
                  prefix: "Object anchors",
                });
                const fileSummaryText = summarizeReferenceLabels({
                  reference_refs: item.file_refs,
                  reference_labels: item.file_labels,
                  limit: 2,
                  prefix: "File anchors",
                });
                const threadSearchQuery = continuityThreadSearchQuery({
                  title: item.title,
                  reference_labels: item.reference_labels,
                  object_labels: item.object_labels,
                  file_labels: item.file_labels,
                  pack_kind: packKind,
                  source_refs: item.source_refs,
                  reference_refs: item.reference_refs,
                  object_refs: item.object_refs,
                  file_refs: item.file_refs,
                });
                const relatedReferenceLabels = (
                  item.object_labels.length > 0
                    ? item.object_labels
                    : item.object_refs.length > 0
                      ? item.object_refs
                      : item.reference_labels.length > 0
                        ? item.reference_labels
                        : item.reference_refs
                ).slice(0, isCompact ? 2 : 4);
                const relatedFileLabels = (item.file_labels.length > 0 ? item.file_labels : item.file_refs).slice(
                  0,
                  isCompact ? 2 : 3,
                );
                return {
                  cardClass: `${CONTEXT_PACK_CARD_CLASS} ${isCompact ? "px-3 py-3" : "px-4 py-4"}`,
                  titleClass: `${isCompact ? "text-sm" : "text-base"} break-words font-medium text-on-surface`,
                  summaryClass: `mt-1 break-words ${isCompact ? "text-[11px]" : "text-xs"} text-on-surface-variant/75`,
                  detailClass: `${isCompact ? "text-[10px]" : "text-[11px]"}`,
                  metadataClass: `mt-3 flex flex-wrap items-center gap-2 ${isCompact ? "text-[11px]" : "text-xs"} text-on-surface-variant/70`,
                  buttonClass: `${OBJECT_SEARCH_BUTTON_CLASS} ${isCompact ? "px-2.5 py-2 text-[10px] sm:py-1" : "px-3 py-2 text-[11px] sm:py-1.5"}`,
                  threadButtonClass: `${THREAD_SEARCH_BUTTON_CLASS} ${isCompact ? "px-2.5 py-2 text-[10px] sm:py-1" : "px-3 py-2 text-[11px] sm:py-1.5"}`,
                  chipRowClass: `${isCompact ? "text-[10px]" : "text-[11px]"}`,
                  packKindText: packKindLabel(packKind),
                  destinationText: `routes to ${decisionOsDestinationLabel(target?.view ?? "home")}`,
                  confidenceSummaryText: `${item.confidence} confidence`,
                  boundedReasonText: trustState.boundedReasonText,
                  distinctWhySurfacedText: trustState.distinctWhySurfacedText,
                  priorityRationaleText: trustState.priorityRationaleText,
                  sourceSummaryText: trustState.sourceSummaryText,
                  evidenceSummaryText,
                  referenceSummaryText,
                  objectSummaryText,
                  fileSummaryText,
                  readinessReasonText: trustState.readinessReasonText,
                  retrievalModeText: trustState.retrievalModeText,
                  topologyBudgetText: trustState.topologyBudgetText,
                  workingSetText: trustState.workingSetText,
                  activeTopicText: trustState.activeTopicText,
                  consequenceSummaryText: trustState.consequenceSummaryText,
                  provenanceSummaryText: trustState.provenanceSummaryText,
                  threadSearchQuery,
                  relatedReferenceLabels,
                  relatedFileLabels,
                  target,
                  showBoundedReason: trustState.showBoundedReason,
                  showDistinctWhySurfaced: trustState.showDistinctWhySurfaced,
                  showPriorityRationale: trustState.showPriorityRationale,
                  showSourceSummary: trustState.showSourceSummary,
                  showEvidenceSummary: Boolean(evidenceSummaryText),
                  showReferenceSummary: Boolean(referenceSummaryText),
                  showObjectSummary: Boolean(objectSummaryText),
                  showFileSummary: Boolean(fileSummaryText),
                  showReadinessReason: trustState.showReadinessReason,
                  showRetrievalMode: trustState.showRetrievalMode,
                  showTopologyBudget: trustState.showTopologyBudget,
                  showWorkingSet: trustState.showWorkingSet,
                  showActiveTopicCount: trustState.showActiveTopicCount,
                  showThreadRetrievalState: hasThreadRetrievalState(item),
                  showConsequenceSummary: trustState.showConsequenceSummary,
                  showProvenanceSummary: trustState.showProvenanceSummary,
                  showEvidenceKinds: item.evidence_kinds.length > 0,
                  showRelatedReferences: relatedReferenceLabels.length > 0,
                  showRelatedFiles: relatedFileLabels.length > 0,
                  showThreadSearchAction: Boolean(threadSearchQuery),
                };
              })();
              const openContextPack = () => {
                if (packCardState.target?.view === "calendar") {
                  navigateToView("calendar");
                  return;
                }
                if (packCardState.target?.view === "threads") {
                  navigateToView("threads", {
                    threadId: packCardState.target.threadId,
                    messageId: packCardState.target.messageId,
                  });
                  return;
                }
                navigateToView("home");
              };
              const openRelatedObjects = () => openPackObjectSearch(item);
              const openRelatedThreads = () => openPackThreadSearch(item);

              return (
                <div class={packCardState.cardClass}>
                  <div class={`flex flex-wrap items-start justify-between ${surfaceState().compact ? "gap-2" : "gap-3"}`}>
                    <button
                      type="button"
                      onClick={openContextPack}
                      class={CARD_OPEN_BUTTON_CLASS}
                    >
                      <p class={packCardState.titleClass}>{item.title}</p>
                      <p class={packCardState.summaryClass}>
                        {item.summary}
                      </p>
                      <TrustSummaryBlocks
                        boundedReason={packCardState.boundedReasonText}
                        selectionReason={packCardState.distinctWhySurfacedText}
                        showSelectionReason={packCardState.showDistinctWhySurfaced}
                        sourceSummary={packCardState.sourceSummaryText}
                        consequencePreview={packCardState.consequenceSummaryText}
                        provenanceCue={packCardState.provenanceSummaryText}
                        confidence={packCardState.confidenceSummaryText}
                      />
                      <Show when={packCardState.showPriorityRationale}>
                        <p class={`mt-1 ${packCardState.detailClass} text-sky-900/75`}>
                          {packCardState.priorityRationaleText}
                        </p>
                      </Show>
                      <Show when={packCardState.showEvidenceSummary}>
                        <p class={`mt-1 ${packCardState.detailClass} text-on-surface-variant/65`}>
                          {packCardState.evidenceSummaryText}
                        </p>
                      </Show>
                      <Show when={packCardState.showReferenceSummary}>
                        <p class={`mt-1 ${packCardState.detailClass} text-on-surface-variant/65`}>
                          {packCardState.referenceSummaryText}
                        </p>
                      </Show>
                      <Show when={packCardState.showObjectSummary}>
                        <p class={`mt-1 ${packCardState.detailClass} text-on-surface-variant/65`}>
                          {packCardState.objectSummaryText}
                        </p>
                      </Show>
                      <Show when={packCardState.showFileSummary}>
                        <p class={`mt-1 ${packCardState.detailClass} text-on-surface-variant/65`}>
                          {packCardState.fileSummaryText}
                        </p>
                      </Show>
                      <Show when={packCardState.showReadinessReason}>
                        <p class={`mt-1 ${packCardState.detailClass} text-sky-900/75`}>
                          {packCardState.readinessReasonText}
                        </p>
                      </Show>
                      <Show when={packCardState.showRetrievalMode}>
                        <p class={`mt-1 ${packCardState.detailClass} text-on-surface-variant/65`}>
                          {packCardState.retrievalModeText}
                        </p>
                      </Show>
                      <Show when={packCardState.showTopologyBudget}>
                        <p class={`mt-1 ${packCardState.detailClass} text-on-surface-variant/65`}>
                          {packCardState.topologyBudgetText}
                        </p>
                      </Show>
                      <Show when={packCardState.showWorkingSet}>
                        <p class={`mt-1 ${packCardState.detailClass} text-on-surface-variant/65`}>
                          {packCardState.workingSetText}
                        </p>
                      </Show>
                      <Show when={packCardState.showActiveTopicCount}>
                        <p class={`mt-1 ${packCardState.detailClass} text-on-surface-variant/65`}>
                          {packCardState.activeTopicText}
                        </p>
                      </Show>
                      <Show when={packCardState.showThreadRetrievalState}>
                        <ThreadDiscoveryStateSummary
                          class={THREAD_RETRIEVAL_CLASS}
                          state={threadRetrievalState(item)}
                        />
                      </Show>
                      <div class={packCardState.metadataClass}>
                        <span class={`max-w-full break-words rounded-full border uppercase tracking-wide ${packTone(item.pack_kind)} ${surfaceState().compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-[11px]"}`}>
                          {packCardState.packKindText}
                        </span>
                        <span class={`max-w-full break-words rounded-full border border-white/70 bg-white/85 ${surfaceState().compact ? "px-2 py-1" : "px-2.5 py-1"}`}>
                          {packCardState.destinationText}
                        </span>
                      </div>
                      <Show when={packCardState.showEvidenceKinds}>
                        <div class={`mt-3 flex flex-wrap gap-2 ${packCardState.chipRowClass}`}>
                          <For each={item.evidence_kinds.slice(0, surfaceState().compact ? 3 : 5)}>
                            {(evidence) => (
                              <span class={EVIDENCE_CHIP_CLASS}>
                                {evidence.replaceAll("_", " ")}
                              </span>
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={packCardState.showRelatedReferences}>
                        <div class={`mt-3 flex flex-wrap gap-2 ${packCardState.chipRowClass}`}>
                          <For each={packCardState.relatedReferenceLabels}>
                            {(referenceLabel) => (
                              <span class={RELATED_REFERENCE_CHIP_CLASS}>
                                {referenceLabel}
                              </span>
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={packCardState.showRelatedFiles}>
                        <div class={`mt-2 flex flex-wrap gap-2 ${packCardState.chipRowClass}`}>
                          <For each={packCardState.relatedFileLabels}>
                            {(fileLabel) => (
                              <span class={RELATED_FILE_CHIP_CLASS}>
                                {fileLabel}
                              </span>
                            )}
                          </For>
                        </div>
                      </Show>
                    </button>
                    <button
                      type="button"
                      onClick={openRelatedObjects}
                      class={packCardState.buttonClass}
                    >
                      related objects
                    </button>
                    <Show when={packCardState.showThreadSearchAction}>
                      <button
                        type="button"
                        onClick={openRelatedThreads}
                        class={packCardState.threadButtonClass}
                      >
                        refine threads
                      </button>
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </section>
    </Show>
  );
}
