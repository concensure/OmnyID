// @locs-version: 1.0
import { createMemo, For, Show } from "solid-js";
import {
  resolveContinuityTargetLabel,
} from "afp-ts/continuity";
import { continuityThreadSearchQuery } from "afp-ts/retrieval";
import { ThreadDiscoveryStateSummary } from "@/components/ThreadDiscoveryStateSummary";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import type { DecisionOsPriorityCard } from "@/lib/decisionosContinuity";
import type { DecisionOsQueueBootstrapState } from "@/lib/decisionOsQueueBootstrapState";
import {
  buildQueueEntries,
  decisionQueueUrgencyStyle,
  type QueueEntry,
} from "@/lib/decisionQueueModel";
import {
  decisionQueueEntryDestinationLabel,
  openDecisionQueueEntryTarget,
} from "@/lib/decisionQueueNavigation";
import {
  queueEntryAutonomySummary,
  queueEntryTrustState,
} from "@/lib/decisionQueuePresentationState";
import { threadRetrievalState as readThreadRetrievalState } from "@/lib/threadRetrievalState";
import { openThreadSearch } from "@/lib/threadSearchNavigation";

const DECISION_QUEUE_LABEL = "Decision Queue";
const DECISION_QUEUE_TITLE = "Actions and approvals that need your judgment";
const DECISION_QUEUE_SUBTITLE =
  "Ordered by approvals first, then urgency and continuity context.";
const DECISION_QUEUE_LABEL_CLASS =
  "font-mono text-[10px] uppercase tracking-[0.22em] text-indigo-700/70";
const DECISION_QUEUE_TITLE_H1_CLASS = "mt-1 text-lg font-semibold text-on-surface";
const DECISION_QUEUE_TITLE_H2_CLASS = "mt-1 text-sm font-semibold text-on-surface";
const DECISION_QUEUE_HEADER_ACTIONS_CLASS = "flex flex-wrap items-center gap-2";
const DECISION_QUEUE_HEADER_GAP_CLASS = {
  compact: "gap-3",
  comfortable: "gap-4",
} as const;
const DECISION_QUEUE_SUBTITLE_CLASS = {
  compact: "mt-2 text-[11px] text-indigo-900/65",
  comfortable: "mt-2 text-sm text-indigo-900/65",
} as const;
const DECISION_QUEUE_GRID_CLASS = {
  compact: "grid mt-3 gap-2",
  comfortable: "grid mt-5 gap-3",
} as const;
const DECISION_QUEUE_CARD_ROW_CLASS = {
  compact: "flex flex-wrap items-start justify-between gap-2",
  comfortable: "flex flex-wrap items-start justify-between gap-3",
} as const;
const DECISION_QUEUE_CARD_TITLE_CLASS = {
  compact:
    "min-w-0 break-words text-sm font-medium text-on-surface",
  comfortable:
    "min-w-0 break-words text-base font-medium text-on-surface",
} as const;
const DECISION_QUEUE_CARD_METADATA_CLASS = {
  compact: "mt-2 flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant/70",
  comfortable: "mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant/70",
} as const;
const DECISION_QUEUE_CARD_BODY_CLASS = {
  compact: "mt-1 text-[10px]",
  comfortable: "mt-1 text-[11px]",
} as const;
const DECISION_QUEUE_CARD_CLASS = {
  compact:
    "group rounded-2xl border border-indigo-200/70 bg-white/85 px-3 py-3 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-200/80",
  comfortable:
    "group rounded-2xl border border-indigo-200/70 bg-white/85 px-4 py-4 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-200/80",
} as const;
const DECISION_QUEUE_ACTION_CARD_CLASS = {
  compact:
    "group rounded-2xl border border-white/70 bg-white/82 px-3 py-3 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-200/80",
  comfortable:
    "group rounded-2xl border border-white/70 bg-white/82 px-4 py-4 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-200/80",
} as const;
const DECISION_QUEUE_PILL_SIZE_CLASS = {
  compact: "px-2 py-1",
  comfortable: "px-2.5 py-1",
} as const;
const DECISION_QUEUE_URGENCY_PILL_CLASS = {
  compact: "px-2.5 py-1 text-[10px]",
  comfortable: "px-3 py-1 text-[11px]",
} as const;
const DECISION_QUEUE_CONFIDENCE_CHIP_CLASS = {
  compact:
    "inline-flex max-w-full break-words rounded-full border border-amber-200/80 bg-amber-50/90 px-2 py-1 text-[10px] font-medium text-amber-700",
  comfortable:
    "inline-flex max-w-full break-words rounded-full border border-amber-200/80 bg-amber-50/90 px-2.5 py-1 text-[11px] font-medium text-amber-700",
} as const;
const DECISION_QUEUE_OPEN_TEXT_CLASS = "mt-3 text-[11px] text-on-surface-variant/60";
const DECISION_QUEUE_ACTION_BUTTON_CLASS = {
  compact:
    "rounded-full border border-indigo-200/70 bg-white/85 px-3 py-2 text-[11px] font-medium text-indigo-700 transition hover:bg-white sm:py-1",
  comfortable:
    "rounded-full border border-indigo-200/70 bg-white/85 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-white",
} as const;
const DECISION_QUEUE_COUNT_BADGE_CLASS = {
  compact:
    "rounded-full border border-indigo-200/70 bg-white/85 px-3 py-2 text-[11px] text-indigo-700 sm:py-1",
  comfortable:
    "rounded-full border border-indigo-200/70 bg-white/85 px-4 py-2 text-sm text-indigo-700",
} as const;
const DECISION_QUEUE_THREAD_SEARCH_BUTTON_CLASS =
  "mt-2 rounded-full border border-indigo-200/70 bg-indigo-50/85 px-3 py-2 text-[10px] font-medium text-indigo-700 transition hover:bg-indigo-100 sm:py-1";
const DECISION_QUEUE_THREAD_SEARCH_BUTTON_TEXT = "refine thread search";

function urgencyWeight(urgency: string): number {
  switch (urgency) {
    case "urgent":
      return 4;
    case "today":
      return 3;
    case "high":
      return 2;
    case "medium":
      return 1;
    default:
      return 0;
  }
}

function decisionUrgencyTone(urgency: string, requiresApproval: boolean): string {
  if (requiresApproval || urgency === "urgent") return "border-rose-200/70 bg-rose-50/80 text-rose-700";
  if (urgency === "today" || urgency === "high") return "border-amber-200/70 bg-amber-50/80 text-amber-700";
  return "border-slate-200/70 bg-slate-50/80 text-slate-600";
}

function decisionScopeCue(item: {
  memory_space?: string | null;
  author_type?: string | null;
  is_human_authored?: boolean | null;
  human_only?: boolean | null;
}): string | null {
  const memoryLabel = item.memory_space?.trim();
  const humanGrounded =
    item.human_only === true
    || item.is_human_authored === true
    || item.author_type?.trim().toLowerCase() === "human";
  const parts: string[] = [];
  if (memoryLabel) parts.push(`${memoryLabel} context`);
  if (humanGrounded) parts.push("human-grounded");
  return parts.length > 0 ? `Scoped to ${parts.join(", ")}.` : null;
}

function decisionScopeRank(item: {
  memory_space?: string | null;
  author_type?: string | null;
  is_human_authored?: boolean | null;
  human_only?: boolean | null;
}): number {
  const hasMemorySpace = Boolean(item.memory_space?.trim());
  const humanGrounded =
    item.human_only === true
    || item.is_human_authored === true
    || item.author_type?.trim().toLowerCase() === "human";
  return Number(hasMemorySpace) + Number(humanGrounded);
}

function lowConfidenceLabel(confidence: number | undefined): string | null {
  if (confidence === undefined) return null;
  const percent = Math.round(confidence * 100);
  if (percent >= 75) return null;
  return `~${percent}% confident`;
}

export function DecisionQueueSurface(props: {
  queueState: DecisionOsQueueBootstrapState;
  messages?: import("@/lib/api").AfpMessage[] | null;
  threadSummaries?: import("@/lib/api").ThreadSummary[] | null;
  compact?: boolean;
  titleTag?: "h1" | "h2";
  actionLabel?: string;
  onAction?: () => void;
  class?: string;
}) {
  const queueState = () => props.queueState;
  const queueActionItems = () => queueState().queueActionItems;
  const retrievalMessages = () => props.messages;
  const retrievalThreadSummaries = () => props.threadSummaries;
  const compact = () => props.compact ?? false;
  const titleTag = () => props.titleTag ?? "h2";
  const sectionOverrideClass = () => props.class;
  const headerAction = () => props.onAction;
  const headerActionLabel = () => props.actionLabel ?? null;
  const sortedQueueActionItems = () =>
    [...queueActionItems()].sort((left, right) => {
      const approvalDelta = Number(right.requires_approval) - Number(left.requires_approval);
      if (approvalDelta !== 0) return approvalDelta;
      const urgencyDelta = urgencyWeight(right.urgency) - urgencyWeight(left.urgency);
      if (urgencyDelta !== 0) return urgencyDelta;
      const scopeDelta = decisionScopeRank(right) - decisionScopeRank(left);
      if (scopeDelta !== 0) return scopeDelta;
      return right.source_refs.length - left.source_refs.length;
    });
  const sectionClass = () =>
    sectionOverrideClass()
    ?? `min-w-0 rounded-[28px] border border-indigo-100/80 bg-[linear-gradient(135deg,rgba(238,242,255,0.9),rgba(255,255,255,0.95))] p-4 shadow-[0_18px_50px_-28px_rgba(67,56,202,0.22)] ${
      compact() ? "" : "backdrop-blur-sm"
    }`;
  const compactMode = () => (compact() ? "compact" : "comfortable");
  const headerClass = () => `flex min-w-0 flex-col ${DECISION_QUEUE_HEADER_GAP_CLASS[compactMode()]} sm:flex-row sm:flex-wrap sm:items-start sm:justify-between`;
  const subtitleClass = () => DECISION_QUEUE_SUBTITLE_CLASS[compactMode()];
  const actionButtonClass = () => DECISION_QUEUE_ACTION_BUTTON_CLASS[compactMode()];
  const countBadgeClass = () => DECISION_QUEUE_COUNT_BADGE_CLASS[compactMode()];
  const gridClass = () => DECISION_QUEUE_GRID_CLASS[compactMode()];
  const titleClass = () => (titleTag() === "h1" ? DECISION_QUEUE_TITLE_H1_CLASS : DECISION_QUEUE_TITLE_H2_CLASS);
  const cardRowClass = () => DECISION_QUEUE_CARD_ROW_CLASS[compactMode()];
  const cardTitleClass = () => DECISION_QUEUE_CARD_TITLE_CLASS[compactMode()];
  const cardMetadataClass = () => DECISION_QUEUE_CARD_METADATA_CLASS[compactMode()];
  const cardBodyTextClass = (tone: string) => `${DECISION_QUEUE_CARD_BODY_CLASS[compactMode()]} ${tone}`;
  const priorityCardClass = () => DECISION_QUEUE_CARD_CLASS[compactMode()];
  const actionCardClass = () => DECISION_QUEUE_ACTION_CARD_CLASS[compactMode()];
  const pillSizeClass = () => DECISION_QUEUE_PILL_SIZE_CLASS[compactMode()];
  const urgencyPillClass = (tone: string) => `rounded-full border font-medium ${tone} ${DECISION_QUEUE_URGENCY_PILL_CLASS[compactMode()]}`;
  const confidenceChipClass = () => DECISION_QUEUE_CONFIDENCE_CHIP_CLASS[compactMode()];
  const surfaceState = createMemo(() => {
    const entries = buildQueueEntries({
      ...queueState(),
      queueActionItems: sortedQueueActionItems(),
    });
    const totalCount = entries.length;
    return {
      entries,
      priorityEntry: entries.find((entry) => entry.source === "priority") ?? null,
      actionEntries: entries.filter((entry) => entry.source === "action"),
      totalCount,
      totalCountLabel: `${totalCount} item${totalCount === 1 ? "" : "s"}`,
      showHeaderAction: Boolean(headerAction() && headerActionLabel()),
      headerActionLabel: headerActionLabel(),
    };
  });

  function priorityThreadSearchQuery(card: DecisionOsPriorityCard) {
    return continuityThreadSearchQuery({
      title: card.title,
      linked_target_label: card.linked_target_label,
      object_labels: card.object_labels,
      panel_kind: card.panel_kind,
      source_refs: card.source_refs,
      object_refs: card.object_refs,
      messages: retrievalMessages(),
      thread_summaries: retrievalThreadSummaries(),
    });
  }

  function priorityTargetLabel(card: DecisionOsPriorityCard) {
    return resolveContinuityTargetLabel({
      linked_target_label: card.linked_target_label,
      object_labels: card.object_labels,
      source_refs: card.source_refs,
      object_refs: card.object_refs,
      messages: retrievalMessages(),
      thread_summaries: retrievalThreadSummaries(),
    });
  }

  function refinePriorityThreadSearch(card: DecisionOsPriorityCard) {
    const query = priorityThreadSearchQuery(card);
    if (!query) return;
    openThreadSearch({
      query,
      launchContext: {
        sourceLabel: "Decision queue",
        reason: "Refine threads related to the current priority context",
      },
    });
  }

  return (
    <Show when={surfaceState().totalCount > 0}>
      <section class={sectionClass()}>
        <div class={headerClass()}>
          <div>
            <p class={DECISION_QUEUE_LABEL_CLASS}>{DECISION_QUEUE_LABEL}</p>
            <Show
              when={titleTag() === "h1"}
              fallback={<h2 class={titleClass()}>{DECISION_QUEUE_TITLE}</h2>}
            >
              <h1 class={titleClass()}>{DECISION_QUEUE_TITLE}</h1>
            </Show>
            <p class={subtitleClass()}>
              {DECISION_QUEUE_SUBTITLE}
            </p>
          </div>
          <div class={DECISION_QUEUE_HEADER_ACTIONS_CLASS}>
            <Show when={surfaceState().showHeaderAction}>
              <button
                type="button"
                onClick={() => headerAction()?.()}
                class={actionButtonClass()}
              >
                {surfaceState().headerActionLabel}
              </button>
            </Show>
            <div class={countBadgeClass()}>
              {surfaceState().totalCountLabel}
            </div>
          </div>
        </div>

        <div class={gridClass()}>
          <Show when={surfaceState().priorityEntry} keyed>
            {(entry) => {
              const card = entry.queuePriorityCard ?? null;
              const decision = entry.decision ?? null;
              const priorityCardState = (() => {
                const trustState = queueEntryTrustState(entry);
                const priorityUrgency = decision?.urgency ?? "medium";
                const requiresApproval = card?.requires_approval ?? false;
                const targetLabel = card ? priorityTargetLabel(card) : null;
                const threadSearchQuery = card ? priorityThreadSearchQuery(card) : null;
                const sourceSummary = trustState.sourceSummary;
                const priorityRationale = trustState.priorityRationale;
                const consequencePreview = trustState.consequencePreview;
                const autonomySummary = queueEntryAutonomySummary(entry);
                const boundedReason = trustState.boundedReason;
                const rawReasonText = trustState.rawReasonText;
                const provenanceCue = trustState.provenanceCue;
                const threadRetrievalState = readThreadRetrievalState(card);
                const confidenceSummaryText = lowConfidenceLabel(decision?.confidence);
                return {
                  targetLabel,
                  threadSearchQuery,
                  sourceSummary,
                  priorityRationale,
                  consequencePreview,
                  autonomySummary,
                  boundedReason,
                  rawReasonText,
                  provenanceCue,
                  threadRetrievalState,
                  openText: `Open ${decisionQueueEntryDestinationLabel(entry)}`,
                  priorityTitle: decision?.title ?? card?.title ?? "",
                  priorityContext: decision?.context ?? card?.description ?? "",
                  priorityKindText: "priority",
                  urgencyTone: decisionUrgencyTone(priorityUrgency, requiresApproval),
                  urgencyLabel: requiresApproval
                    ? "approval"
                    : decisionQueueUrgencyStyle(priorityUrgency).label.toLowerCase(),
                  priorityPillClass:
                    `rounded-full border border-indigo-200/60 bg-indigo-50/80 uppercase tracking-wide text-indigo-700 ${pillSizeClass()}`,
                  targetPillClass:
                    `rounded-full border border-emerald-200/70 bg-emerald-50/80 text-emerald-700 ${pillSizeClass()}`,
                  confidenceSummaryText,
                  showTargetLabel: Boolean(targetLabel),
                  showSourceSummary: Boolean(sourceSummary),
                  showPriorityRationale: Boolean(priorityRationale),
                  showConsequencePreview: Boolean(consequencePreview),
                  showAutonomySummary: Boolean(autonomySummary),
                  showBoundedReason: Boolean(boundedReason),
                  showRawReasonText: Boolean(rawReasonText),
                  showProvenanceCue: Boolean(provenanceCue),
                  showThreadRetrievalState: Boolean(threadRetrievalState),
                  showThreadSearchAction: Boolean(card && threadSearchQuery),
                  showConfidenceSummary: Boolean(confidenceSummaryText),
                };
              })();
              const openPriorityEntry = () => openDecisionQueueEntryTarget(entry);

              return (
                <button
                  type="button"
                  onClick={openPriorityEntry}
                  class={priorityCardClass()}
                >
                  <div class={cardRowClass()}>
                    <div class="min-w-0 flex-1">
                      <p class={cardTitleClass()} title={priorityCardState.priorityTitle}>
                        {priorityCardState.priorityTitle}
                      </p>
                      <div class={cardMetadataClass()}>
                        <span class={priorityCardState.priorityPillClass}>
                          {priorityCardState.priorityKindText}
                        </span>
                        <Show when={priorityCardState.showTargetLabel}>
                          <span class={priorityCardState.targetPillClass}>
                            {priorityCardState.targetLabel}
                          </span>
                        </Show>
                        <span>{priorityCardState.priorityContext}</span>
                      </div>
                      <Show when={priorityCardState.showPriorityRationale}>
                        <p class={cardBodyTextClass("text-indigo-900/75")}>
                          {priorityCardState.priorityRationale}
                        </p>
                      </Show>
                      <Show when={priorityCardState.showAutonomySummary}>
                        <p class={cardBodyTextClass("text-indigo-900/68")}>
                          {priorityCardState.autonomySummary}
                        </p>
                      </Show>
                      <div class="mt-2 space-y-2">
                        <TrustSummaryBlocks
                          confidence={priorityCardState.confidenceSummaryText}
                          sourceSummary={priorityCardState.sourceSummary}
                          boundedReason={priorityCardState.boundedReason}
                          selectionReason={priorityCardState.rawReasonText}
                          showSelectionReason={priorityCardState.showRawReasonText}
                          consequencePreview={priorityCardState.consequencePreview}
                          provenanceCue={priorityCardState.provenanceCue}
                        />
                      </div>
                      <Show when={priorityCardState.showThreadRetrievalState}>
                        <ThreadDiscoveryStateSummary
                          class="mt-2 rounded-xl border border-indigo-100/80 bg-indigo-50/55 px-2.5 py-2 shadow-none"
                          state={priorityCardState.threadRetrievalState}
                        />
                      </Show>
                    </div>
                    <span
                      class={urgencyPillClass(priorityCardState.urgencyTone)}
                    >
                      {priorityCardState.urgencyLabel}
                    </span>
                  </div>
                  <div class={DECISION_QUEUE_OPEN_TEXT_CLASS}>
                    {priorityCardState.openText}
                  </div>
                  <Show when={priorityCardState.showThreadSearchAction}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        refinePriorityThreadSearch(card!);
                      }}
                      class={DECISION_QUEUE_THREAD_SEARCH_BUTTON_CLASS}
                    >
                      {DECISION_QUEUE_THREAD_SEARCH_BUTTON_TEXT}
                    </button>
                  </Show>
                </button>
              );
            }}
          </Show>

          <For each={surfaceState().actionEntries}>
            {(entry) => {
              const item = entry.queueActionItem!;
              const actionCardState = (() => {
                const trustState = queueEntryTrustState(entry);
                const sourceSummary = trustState.sourceSummary;
                const priorityRationale = trustState.priorityRationale;
                const consequencePreview = trustState.consequencePreview;
                const autonomySummary = queueEntryAutonomySummary(entry);
                const boundedReason = trustState.boundedReason;
                const rawReasonText = trustState.rawReasonText;
                const distinctSuggestedActionText = trustState.suggestedActionText;
                const provenanceCue = trustState.provenanceCue;
                const scopeCue = decisionScopeCue(item);
                const confidenceSummaryText = lowConfidenceLabel(entry.decision.confidence);
                return {
                  sourceSummary,
                  priorityRationale,
                  consequencePreview,
                  autonomySummary,
                  boundedReason,
                  rawReasonText,
                  distinctSuggestedActionText,
                  provenanceCue,
                  scopeCue,
                  actionTitle: entry.decision.title,
                  urgencyTone: decisionUrgencyTone(entry.decision.urgency, item.requires_approval),
                  urgencyLabel: item.requires_approval
                    ? "approval"
                    : decisionQueueUrgencyStyle(entry.decision.urgency).label.toLowerCase(),
                  categoryPillClass:
                    `rounded-full border border-indigo-200/60 bg-indigo-50/80 uppercase tracking-wide text-indigo-700 ${pillSizeClass()}`,
                  confidenceSummaryText,
                  showSourceSummary: Boolean(sourceSummary),
                  showPriorityRationale: Boolean(priorityRationale),
                  showConsequencePreview: Boolean(consequencePreview),
                  showAutonomySummary: Boolean(autonomySummary),
                  showBoundedReason: Boolean(boundedReason),
                  showRawReasonText: Boolean(rawReasonText),
                  showDistinctSuggestedActionText: Boolean(distinctSuggestedActionText),
                  showProvenanceCue: Boolean(provenanceCue),
                  showScopeCue: Boolean(scopeCue),
                  showConfidenceSummary: Boolean(confidenceSummaryText),
                };
              })();
              const openActionEntry = () => openDecisionQueueEntryTarget(entry);

              return (
                <button
                  type="button"
                  onClick={openActionEntry}
                  class={actionCardClass()}
                >
                  <div class={cardRowClass()}>
                    <div class="min-w-0 flex-1">
                      <p class={cardTitleClass()} title={actionCardState.actionTitle}>{actionCardState.actionTitle}</p>
                      <div class={cardMetadataClass()}>
                        <span class={actionCardState.categoryPillClass}>
                          {item.category}
                        </span>
                        <Show when={actionCardState.showDistinctSuggestedActionText}>
                          <span>{actionCardState.distinctSuggestedActionText}</span>
                        </Show>
                      </div>
                      <Show when={actionCardState.showPriorityRationale}>
                        <p class={cardBodyTextClass("text-indigo-900/75")}>
                          {actionCardState.priorityRationale}
                        </p>
                      </Show>
                      <Show when={actionCardState.showAutonomySummary}>
                        <p class={cardBodyTextClass("text-indigo-900/68")}>
                          {actionCardState.autonomySummary}
                        </p>
                      </Show>
                      <div class="mt-2 space-y-2">
                        <TrustSummaryBlocks
                          confidence={actionCardState.confidenceSummaryText}
                          sourceSummary={actionCardState.sourceSummary}
                          boundedReason={actionCardState.boundedReason}
                          selectionReason={actionCardState.rawReasonText}
                          showSelectionReason={actionCardState.showRawReasonText}
                          consequencePreview={actionCardState.consequencePreview}
                          provenanceCue={actionCardState.provenanceCue}
                        />
                      </div>
                      <Show when={actionCardState.showScopeCue}>
                        <p class={cardBodyTextClass("text-indigo-900/62")}>
                          {actionCardState.scopeCue}
                        </p>
                      </Show>
                    </div>
                    <span
                      class={urgencyPillClass(actionCardState.urgencyTone)}
                    >
                      {actionCardState.urgencyLabel}
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
