// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";
import { DecisionCard } from "@/components/DecisionCard";
import {
  ContextPanelEmptyState,
  WhyMattersSection,
} from "@/components/DecisionContextSections";
import {
  decisionQueueUrgencyStyle,
  type QueueEntry,
} from "@/lib/decisionQueueModel";
import { decisionQueueEntryDestinationLabel } from "@/lib/decisionQueueNavigation";
import {
  queueEntryConfidenceReason,
  queueEntryTrustState,
} from "@/lib/decisionQueuePresentationState";
import { decisionCardFromQueueEntry } from "@/lib/decisionCardState";

const BUTTON_TYPE = "button" as const;
const QUEUE_CONTEXT_TITLE = "Decision details";
const QUEUE_CONTEXT_DETAIL = "Select a decision to review its source, options, and next action.";
const CLOSE_PANEL_ARIA_LABEL = "Close context panel";
const CLOSE_BUTTON_LABEL = "\u00d7";
const SUGGESTED_OPTIONS_LABEL = "Suggested options";
const SOURCE_REFERENCES_LABEL = "Source references";
const SURFACED_CONTEXT_LABEL = "Surfaced context";
const QUEUE_PANEL_CLASS =
  "flex min-h-[320px] flex-col rounded-2xl border border-white/50 bg-white/70 shadow-card backdrop-blur-sm";
const QUEUE_PANEL_OPEN_BUTTON_CLASS =
  "w-full rounded-full bg-primary px-4 py-2 text-[11px] font-semibold text-white transition hover:opacity-90";
const QUEUE_PANEL_BODY_CLASS = "flex-1 space-y-3 overflow-y-auto px-4 py-3";
const QUEUE_PANEL_KICKER_CLASS =
  "font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/50";
const QUEUE_PANEL_TITLE_CLASS = "mt-1 text-sm font-semibold text-on-surface";
const QUEUE_PANEL_CONFIDENCE_REASON_CLASS = "mt-1 break-words text-[11px] text-on-surface-variant/70";
const QUEUE_PANEL_SECTION_CLASS =
  "rounded-xl border border-black/[0.06] bg-white/70 px-3 py-2.5";
const QUEUE_PANEL_SECTION_HEADING_CLASS =
  "font-mono text-[8px] uppercase tracking-[0.15em] text-on-surface-variant/50";
const QUEUE_PANEL_OPTION_CARD_CLASS =
  "rounded-lg border border-black/[0.05] bg-white/75 px-2.5 py-2 text-[11px] text-on-surface";
const QUEUE_PANEL_OPTION_DETAIL_CLASS = "mt-1 text-[10px] text-on-surface-variant/65";
const QUEUE_PANEL_OPTION_HEADER_CLASS = "flex items-center justify-between gap-2";
const QUEUE_PANEL_SOURCE_REFERENCE_CHIP_CLASS =
  "max-w-full break-words rounded-full border border-black/10 bg-white/70 px-2 py-1 text-[9px] text-on-surface-variant/65";
const QUEUE_PANEL_CONTEXT_ITEM_CARD_CLASS =
  "rounded-lg border border-black/[0.05] bg-white/75 px-2.5 py-2";
const QUEUE_PANEL_OPTION_LIST_CLASS = "mt-2 space-y-1.5";
const QUEUE_PANEL_SOURCE_REFERENCE_LIST_CLASS = "mt-2 flex flex-wrap gap-2";
const QUEUE_PANEL_CONTEXT_ITEM_LIST_CLASS = "mt-2 space-y-2";
const QUEUE_PANEL_HEADER_CLASS =
  "flex items-start justify-between gap-2 border-b border-black/[0.06] p-4 pb-3";
const QUEUE_PANEL_CLOSE_BUTTON_CLASS =
  "mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px] text-on-surface-variant transition hover:bg-black/10";
const QUEUE_PANEL_FOOTER_CLASS = "border-t border-black/[0.06] p-4";
const QUEUE_PANEL_AI_CHIP_CLASS =
  "max-w-full break-words rounded-full bg-primary/10 px-1.5 py-1 text-[8px] font-medium text-primary";
const QUEUE_PANEL_PROVENANCE_CUE_CLASS = "mt-1 break-words text-[10px] text-on-surface-variant/65";
const QUEUE_PANEL_ITEM_SOURCE_TYPE_CLASS =
  "max-w-full break-words rounded-full border border-black/10 px-1.5 py-1 text-[8px] text-on-surface-variant/55";
const QUEUE_PANEL_ITEM_SNIPPET_CLASS = "mt-1 break-words text-[10px] leading-relaxed text-on-surface-variant/65";
const QUEUE_PANEL_ITEM_TIME_CLASS = "mt-1 text-[9px] text-on-surface-variant/45";
const QUEUE_PANEL_CONTEXT_ITEM_ROW_CLASS = "flex items-start gap-2";
const QUEUE_PANEL_CONTEXT_ITEM_ICON_CLASS = "text-sm leading-none";
const QUEUE_PANEL_CONTEXT_ITEM_BODY_CLASS = "min-w-0 flex-1";
const QUEUE_PANEL_CONTEXT_ITEM_HEADER_CLASS = "flex items-center justify-between gap-2";
const QUEUE_PANEL_CONTEXT_ITEM_TITLE_CLASS = "break-words text-[11px] font-medium text-on-surface";
const QUEUE_PANEL_HEADER_CONTENT_CLASS = "min-w-0";

function queueEntrySourceReferences(entry: QueueEntry) {
  return entry.source === "priority"
    ? entry.queuePriorityCard?.source_refs ?? []
    : entry.queueActionItem?.source_refs ?? [];
}

function queueEntryDestinationLabel(entry: QueueEntry) {
  return decisionQueueEntryDestinationLabel(entry);
}

function queueEntryOpenLabel(entry: QueueEntry) {
  if (entry.source === "priority") return "Review source";
  if (entry.decision.options.length > 0) return "Review options";
  return `Open ${queueEntryDestinationLabel(entry)}`;
}

export function DecisionQueueCard(props: {
  entry: QueueEntry;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  compact?: boolean;
}) {
  return (
    <DecisionCard
      card={decisionCardFromQueueEntry(props.entry)}
      mode={props.compact ? "compact" : "standard"}
      selected={props.selected}
      onSelect={props.onSelect}
      onAction={(action) => {
        if (action.id === "open") props.onOpen();
      }}
      class={decisionQueueUrgencyStyle(props.entry.decision.urgency).border}
    />
  );
}

export function DecisionQueueContextPanel(props: {
  entry: QueueEntry | null;
  onOpen: () => void;
  onClose?: () => void;
}) {
  const [showReviewDetails, setShowReviewDetails] = createSignal(false);
  const entry = () => props.entry;
  const onOpen = () => props.onOpen;
  const onClose = () => props.onClose;
  const panelState = () => {
    const currentEntry = entry();
    if (!currentEntry) return null;
    const decision = currentEntry.decision;
    const sourceReferenceItems = queueEntrySourceReferences(currentEntry);
    const suggestedOptionItems = decision.options;
    const contextEntryItems = decision.contextItems ?? [];
    const trustState = queueEntryTrustState(currentEntry);
    const provenanceCue =
      sourceReferenceItems.length > 0 ? trustState.provenanceCue : null;
    const confidenceReason = queueEntryConfidenceReason(currentEntry);
    const consequencePreview = trustState.consequencePreview;

    return {
      queueEntry: currentEntry,
      decisionTitle: decision.title,
      whyMattersBullets: decision.whyBullets ?? [],
      sourceReferenceItems,
      suggestedOptionItems,
      contextEntryItems,
      provenanceCue,
      footerActionText: queueEntryOpenLabel(currentEntry),
      confidenceReason,
      showConfidenceReason: Boolean(confidenceReason),
      consequencePreview,
      showConsequencePreview: Boolean(consequencePreview),
      showCloseButton: Boolean(onClose()),
      showSuggestedOptionsSection: suggestedOptionItems.length > 0,
      showSourceReferencesSection: sourceReferenceItems.length > 0,
      showContextItemsSection: contextEntryItems.length > 0,
      showProvenanceCue: Boolean(provenanceCue),
      suggestedOptionViewItems: suggestedOptionItems.map((option) => ({
        label: option.label,
        detailText: option.detail ?? null,
        showDetail: Boolean(option.detail),
        showAiRecommendation: Boolean(option.aiRecommended),
      })),
      contextDisplayItems: contextEntryItems.map((item) => ({
        iconText: item.icon,
        titleText: item.title,
        sourceTypeText: item.sourceType ?? null,
        snippetText: item.snippet ?? null,
        timeText: item.time ?? null,
        showSourceType: Boolean(item.sourceType),
        showSnippet: Boolean(item.snippet),
        showTime: Boolean(item.time),
      })),
    };
  };

  return (
    <div class={QUEUE_PANEL_CLASS}>
      <Show
        when={panelState()}
        fallback={
          <ContextPanelEmptyState
            icon="\ud83d\udccb"
            title={QUEUE_CONTEXT_TITLE}
            detail={QUEUE_CONTEXT_DETAIL}
          />
        }
      >
        {(panel) => {
          const openQueueEntry = () => onOpen()();
          const closeQueuePanel = () => onClose()?.();

          return (
            <>
              <div class={QUEUE_PANEL_HEADER_CLASS}>
                <div class={QUEUE_PANEL_HEADER_CONTENT_CLASS}>
                  <p class={QUEUE_PANEL_KICKER_CLASS}>{QUEUE_CONTEXT_TITLE}</p>
                  <h3 class={QUEUE_PANEL_TITLE_CLASS}>{panel().decisionTitle}</h3>
                </div>
                <Show when={panel().showCloseButton}>
                  <button
                    type={BUTTON_TYPE}
                    class={QUEUE_PANEL_CLOSE_BUTTON_CLASS}
                    onClick={closeQueuePanel}
                    aria-label={CLOSE_PANEL_ARIA_LABEL}
                  >
                    {CLOSE_BUTTON_LABEL}
                  </button>
                </Show>
              </div>

              <div class={QUEUE_PANEL_BODY_CLASS}>
                <Show when={panel().showSuggestedOptionsSection}>
                  <div class={QUEUE_PANEL_SECTION_CLASS}>
                    <p class={QUEUE_PANEL_SECTION_HEADING_CLASS}>{SUGGESTED_OPTIONS_LABEL}</p>
                    <div class={QUEUE_PANEL_OPTION_LIST_CLASS}>
                      <For each={panel().suggestedOptionViewItems}>
                        {(option) => (
                          <button
                            type={BUTTON_TYPE}
                            class={`${QUEUE_PANEL_OPTION_CARD_CLASS} w-full text-left transition hover:border-primary/20 hover:bg-primary/5`}
                            onClick={openQueueEntry}
                          >
                            <div class={QUEUE_PANEL_OPTION_HEADER_CLASS}>
                              <span>{option.label}</span>
                              <Show when={option.showAiRecommendation}>
                                <span class={QUEUE_PANEL_AI_CHIP_CLASS}>AI</span>
                              </Show>
                            </div>
                            <Show when={option.showDetail}>
                              <p class={QUEUE_PANEL_OPTION_DETAIL_CLASS}>{option.detailText}</p>
                            </Show>
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                <button
                  type={BUTTON_TYPE}
                  class="w-full rounded-xl border border-black/[0.06] bg-white/75 px-3 py-2 text-left text-[11px] font-semibold text-on-surface transition hover:bg-white"
                  onClick={() => setShowReviewDetails((current) => !current)}
                  aria-expanded={showReviewDetails()}
                >
                  {showReviewDetails() ? "Hide review details" : "Show why, sources, confidence"}
                </button>

                <Show when={showReviewDetails()}>
                  <div class="space-y-3">
                    <WhyMattersSection bullets={panel().whyMattersBullets} />

                    <Show when={panel().showConfidenceReason}>
                      <div class={QUEUE_PANEL_SECTION_CLASS}>
                        <p class={QUEUE_PANEL_SECTION_HEADING_CLASS}>Confidence</p>
                        <p class={QUEUE_PANEL_CONFIDENCE_REASON_CLASS}>{panel().confidenceReason}</p>
                      </div>
                    </Show>

                    <Show when={panel().showConsequencePreview}>
                      <div class={QUEUE_PANEL_SECTION_CLASS}>
                        <p class={QUEUE_PANEL_SECTION_HEADING_CLASS}>Consequence preview</p>
                        <p class={QUEUE_PANEL_CONFIDENCE_REASON_CLASS}>{panel().consequencePreview}</p>
                      </div>
                    </Show>

                    <Show when={panel().showSourceReferencesSection}>
                      <div class={QUEUE_PANEL_SECTION_CLASS}>
                        <p class={QUEUE_PANEL_SECTION_HEADING_CLASS}>{SOURCE_REFERENCES_LABEL}</p>
                        <Show when={panel().showProvenanceCue}>
                          <p class={QUEUE_PANEL_PROVENANCE_CUE_CLASS}>
                            {panel().provenanceCue}
                          </p>
                        </Show>
                        <div class={QUEUE_PANEL_SOURCE_REFERENCE_LIST_CLASS}>
                          <For each={panel().sourceReferenceItems}>
                            {(ref) => (
                              <span class={QUEUE_PANEL_SOURCE_REFERENCE_CHIP_CLASS}>
                                {ref}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                </Show>

                <Show when={panel().showContextItemsSection}>
                  <div class={QUEUE_PANEL_SECTION_CLASS}>
                    <p class={QUEUE_PANEL_SECTION_HEADING_CLASS}>{SURFACED_CONTEXT_LABEL}</p>
                    <div class={QUEUE_PANEL_CONTEXT_ITEM_LIST_CLASS}>
                      <For each={panel().contextDisplayItems}>
                        {(item) => (
                          <div class={QUEUE_PANEL_CONTEXT_ITEM_CARD_CLASS}>
                            <div class={QUEUE_PANEL_CONTEXT_ITEM_ROW_CLASS}>
                              <span class={QUEUE_PANEL_CONTEXT_ITEM_ICON_CLASS}>{item.iconText}</span>
                              <div class={QUEUE_PANEL_CONTEXT_ITEM_BODY_CLASS}>
                                <div class={QUEUE_PANEL_CONTEXT_ITEM_HEADER_CLASS}>
                                  <p class={QUEUE_PANEL_CONTEXT_ITEM_TITLE_CLASS}>{item.titleText}</p>
                                  <Show when={item.showSourceType}>
                                    <span class={QUEUE_PANEL_ITEM_SOURCE_TYPE_CLASS}>
                                      {item.sourceTypeText}
                                    </span>
                                  </Show>
                                </div>
                                <Show when={item.showSnippet}>
                                  <p class={QUEUE_PANEL_ITEM_SNIPPET_CLASS}>{item.snippetText}</p>
                                </Show>
                                <Show when={item.showTime}>
                                  <p class={QUEUE_PANEL_ITEM_TIME_CLASS}>{item.timeText}</p>
                                </Show>
                              </div>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>

              <div class={QUEUE_PANEL_FOOTER_CLASS}>
                <button
                  type={BUTTON_TYPE}
                  onClick={openQueueEntry}
                  class={QUEUE_PANEL_OPEN_BUTTON_CLASS}
                >
                  {panel().footerActionText}
                </button>
              </div>
            </>
          );
        }}
      </Show>
    </div>
  );
}
