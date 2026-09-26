// @locs-version: 1.0
import { createMemo, For, Show } from "solid-js";
import type { DashboardBootstrap } from "@/lib/api";
import {
  artifactSummary,
  attentionRank,
  attentionTone,
  conversationAttentionCountLabel,
  conversationAttentionStatusBadge,
  conversationAttentionSubtitleLabel,
  familyLabel,
  formOwnerHint,
  hasReviewTarget,
  navigateConversationAttentionArtifact,
  navigateConversationAttentionItem,
  navigateConversationAttentionSourceEvent,
  reviewLabel,
  submissionModeHint,
  valueHint,
} from "@/lib/conversationAttentionPresentation";
import { navigateToView } from "@/lib/decisionosNavigation";
import type { ViewName } from "@/lib/viewNames";

const DEFAULT_SECTION_CLASS =
  "rounded-[28px] border border-sky-100/80 bg-[linear-gradient(135deg,rgba(239,246,255,0.92),rgba(255,255,255,0.96))] p-4 shadow-[0_18px_50px_-28px_rgba(14,116,144,0.35)] backdrop-blur-sm";
const SECTION_LABEL_CLASS =
  "font-mono text-[10px] uppercase tracking-[0.22em] text-sky-700/70";
const SECTION_TITLE_CLASS = "mt-1 text-sm font-semibold text-on-surface";
const STATUS_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-white/80 text-sky-700";
const CARD_CLASS =
  "rounded-2xl border border-white/70 bg-white/80 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-200/80";
const REVIEW_ACTION_CLASS =
  "rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 font-medium text-sky-700 transition hover:bg-sky-100/80";
const SOURCE_EVENT_ACTION_CLASS =
  "rounded-full border border-white/70 bg-white/85 px-3 py-1 font-medium text-on-surface-variant/75 transition hover:bg-white";

type ConversationAttentionItem = NonNullable<DashboardBootstrap["conversation_attention_items"]>[number];

type ConversationAttentionSurfaceProps = {
  items: NonNullable<DashboardBootstrap["conversation_attention_items"]>;
  summary?: DashboardBootstrap["conversation_attention_summary"] | null;
  compact?: boolean;
  class?: string;
};

function navigateConversationAttentionView(
  view: ViewName,
  extra?: Record<string, unknown>,
): void {
  switch (view) {
    case "threads":
      navigateToView("threads", {
        threadId: typeof extra?.threadId === "string" ? extra.threadId : undefined,
        messageId: typeof extra?.messageId === "string" ? extra.messageId : undefined,
      });
      return;
    case "calendar":
      navigateToView("calendar", {
        eventId: typeof extra?.eventId === "string" ? extra.eventId : undefined,
        date: typeof extra?.date === "string" ? extra.date : undefined,
      });
      return;
    case "agent_settings": {
      const settingsTab = extra?.settingsTab;
      navigateToView("agent_settings", {
        settingsTab:
          settingsTab === "llm"
          || settingsTab === "mcp"
          || settingsTab === "skills"
          || settingsTab === "runtime"
          || settingsTab === null
            ? settingsTab
            : undefined,
      });
      return;
    }
    default:
      navigateToView(view);
      return;
  }
}

export function ConversationAttentionSurface(props: ConversationAttentionSurfaceProps) {
  const items = () => props.items;
  const summary = () => props.summary ?? null;
  const compact = () => props.compact ?? false;
  const sectionOverrideClass = () => props.class;
  const surfaceState = createMemo(() => {
    const attentionItems = items();
    const isCompact = compact();
    return {
      compact: isCompact,
      sectionClass: sectionOverrideClass() ?? DEFAULT_SECTION_CLASS,
      headerClass: `flex flex-wrap items-start justify-between gap-${isCompact ? "3" : "4"}`,
      subtitleClass: `mt-2 ${isCompact ? "text-[11px]" : "text-sm"} text-sky-800/70`,
      statusBadgeClass: `${STATUS_BADGE_CLASS} ${isCompact ? "px-3 py-1 text-[11px]" : "px-4 py-2 text-sm"}`,
      gridClass: isCompact ? "mt-3 gap-2" : "mt-5 gap-3",
      countLabel: conversationAttentionCountLabel({ items: attentionItems, summary: summary() }),
      subtitleLabel: conversationAttentionSubtitleLabel({ items: attentionItems, summary: summary() }),
      statusBadge: conversationAttentionStatusBadge({ items: attentionItems, summary: summary() }),
      visibleItems: attentionItems
      .slice()
      .sort((left, right) => attentionRank(right) - attentionRank(left))
      .slice(0, isCompact ? 2 : 3),
    };
  });

  return (
    <Show when={items().length > 0}>
      <section class={surfaceState().sectionClass}>
        <div class={surfaceState().headerClass}>
          <div>
            <p class={SECTION_LABEL_CLASS}>Background Work</p>
            <h2 class={SECTION_TITLE_CLASS}>{surfaceState().countLabel}</h2>
            <p class={surfaceState().subtitleClass}>{surfaceState().subtitleLabel}</p>
          </div>
          <div class={surfaceState().statusBadgeClass}>
            {surfaceState().statusBadge}
          </div>
        </div>

        <div class={`grid ${surfaceState().gridClass}`}>
          <For each={surfaceState().visibleItems}>
            {(item) => {
              const cardState = (() => {
                const isCompact = surfaceState().compact;
                const artifactSummaryText = artifactSummary(item);
                const valueHintText = valueHint(item);
                const formOwnerHintText = formOwnerHint(item);
                const submissionModeHintText = submissionModeHint(item);
                const reviewText = reviewLabel(item);
                const metadataItems = [
                  {
                    key: "attention",
                    text: item.latest_attention_label?.trim() || "queued",
                    className: `max-w-full break-words rounded-full border ${attentionTone(item.latest_attention_kind)} ${isCompact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-[11px]"} uppercase tracking-wide`,
                  },
                  {
                    key: "family",
                    text: familyLabel(item),
                    className: `max-w-full break-words rounded-full border border-white/70 bg-white/85 uppercase tracking-wide ${isCompact ? "px-2 py-1" : "px-2.5 py-1"}`,
                  },
                ];
                const optionalMetadataItems = [
                  valueHintText
                    ? {
                        key: "value",
                        text: valueHintText,
                        className: `max-w-full break-words rounded-full border border-emerald-200/70 bg-emerald-50/80 font-medium text-emerald-700 ${isCompact ? "px-2 py-1" : "px-2.5 py-1"}`,
                      }
                    : null,
                  item.latest_requires_signature === true && valueHintText !== "Signature required"
                    ? {
                        key: "signature",
                        text: "Signature required",
                        className: `max-w-full break-words rounded-full border border-amber-200/70 bg-amber-50/80 font-medium text-amber-700 ${isCompact ? "px-2 py-1" : "px-2.5 py-1"}`,
                      }
                    : null,
                  formOwnerHintText && formOwnerHintText !== valueHintText
                    ? {
                        key: "owner",
                        text: formOwnerHintText,
                        className: `max-w-full break-words rounded-full border border-white/70 bg-white/85 ${isCompact ? "px-2 py-1" : "px-2.5 py-1"}`,
                      }
                    : null,
                  submissionModeHintText && submissionModeHintText !== valueHintText
                    ? {
                        key: "submission",
                        text: submissionModeHintText,
                        className: `max-w-full break-words rounded-full border border-white/70 bg-white/85 ${isCompact ? "px-2 py-1" : "px-2.5 py-1"}`,
                      }
                    : null,
                  item.latest_sensitive_form === true
                    ? {
                        key: "sensitive",
                        text: "Sensitive form",
                        className: `max-w-full break-words rounded-full border border-rose-200/70 bg-rose-50/80 font-medium text-rose-700 ${isCompact ? "px-2 py-1" : "px-2.5 py-1"}`,
                      }
                    : null,
                  item.latest_sender
                    ? {
                        key: "sender",
                        text: item.latest_sender,
                        className: `max-w-full break-words rounded-full border border-white/70 bg-white/85 ${isCompact ? "px-2 py-1" : "px-2.5 py-1"}`,
                      }
                    : null,
                  item.provider
                    ? {
                        key: "provider",
                        text: item.provider,
                        className: `max-w-full break-words rounded-full border border-white/70 bg-white/85 uppercase tracking-wide ${isCompact ? "px-2 py-1" : "px-2.5 py-1"}`,
                      }
                    : null,
                ].filter((entry): entry is { key: string; text: string; className: string } => Boolean(entry));
                const actionItems = [
                  hasReviewTarget(item)
                    ? {
                        key: "review",
                        text: reviewText,
                        className: REVIEW_ACTION_CLASS,
                        onClick: (event: MouseEvent) => {
                          event.stopPropagation();
                          navigateConversationAttentionArtifact(item, (view, extra) =>
                            navigateConversationAttentionView(view, extra),
                          );
                        },
                      }
                    : null,
                  item.source_event_id
                    ? {
                        key: "source-event",
                        text: "Open source event",
                        className: SOURCE_EVENT_ACTION_CLASS,
                        onClick: (event: MouseEvent) => {
                          event.stopPropagation();
                          navigateConversationAttentionSourceEvent(item, (view, extra) =>
                            navigateConversationAttentionView(view, extra),
                          );
                        },
                      }
                    : null,
                ].filter((entry): entry is {
                  key: string;
                  text: string;
                  className: string;
                  onClick: (event: MouseEvent) => void;
                } => Boolean(entry));
                return {
                  cardClass: `${CARD_CLASS} ${isCompact ? "px-3 py-3" : "px-4 py-4"}`,
                  layoutClass: `flex flex-wrap items-start justify-between ${isCompact ? "gap-2" : "gap-3"}`,
                  titleClass: `${isCompact ? "text-sm" : "text-base"} break-words font-medium text-on-surface`,
                  artifactSummaryClass: `mt-1 break-words ${isCompact ? "text-[10px]" : "text-[11px]"} text-sky-900/78`,
                  summaryClass: `mt-1 break-words ${isCompact ? "text-[11px]" : "text-xs"} text-on-surface-variant/75`,
                  metadataClass: `mt-2 flex flex-wrap items-center gap-2 ${isCompact ? "text-[11px]" : "text-xs"} text-on-surface-variant/70`,
                  actionRowClass: `mt-3 flex flex-wrap items-center gap-2 ${isCompact ? "text-[10px]" : "text-[11px]"}`,
                  reviewBadgeClass: `rounded-full border border-sky-200/70 bg-sky-50/80 font-medium text-sky-700 ${isCompact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1 text-[11px]"}`,
                  displayLabel: item.display_label,
                  summaryText: item.summary,
                  artifactSummaryText,
                  reviewText,
                  metadataItems,
                  optionalMetadataItems,
                  actionItems,
                  showArtifactSummary: Boolean(artifactSummaryText),
                  showActionItems: actionItems.length > 0,
                };
              })();
              const openAttentionItem = () =>
                navigateConversationAttentionItem(item, (view, extra) =>
                  navigateConversationAttentionView(view, extra),
                );

              return (
                <button
                  type="button"
                  onClick={openAttentionItem}
                  class={cardState.cardClass}
                >
                  <div class={cardState.layoutClass}>
                    <div class="min-w-0 flex-1">
                      <p class={cardState.titleClass}>{cardState.displayLabel}</p>
                      <Show when={cardState.showArtifactSummary}>
                        <p class={cardState.artifactSummaryClass}>
                          {cardState.artifactSummaryText}
                        </p>
                      </Show>
                      <p class={cardState.summaryClass}>{cardState.summaryText}</p>
                      <div class={cardState.metadataClass}>
                        <For each={cardState.metadataItems}>
                          {(metadata) => (
                            <span class={metadata.className}>{metadata.text}</span>
                          )}
                        </For>
                        <For each={cardState.optionalMetadataItems}>
                          {(metadata) => (
                            <span class={metadata.className}>{metadata.text}</span>
                          )}
                        </For>
                      </div>
                      <Show when={cardState.showActionItems}>
                        <div class={cardState.actionRowClass}>
                          <For each={cardState.actionItems}>
                            {(action) => (
                              <button
                                type="button"
                                class={action.className}
                                onClick={action.onClick}
                              >
                                {action.text}
                              </button>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                    <span class={cardState.reviewBadgeClass}>{cardState.reviewText}</span>
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
