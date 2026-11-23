// @locs-version: 1.0
import { For, Show } from "solid-js";
import {
  artifactSummaryDisplayedLines,
  evidenceKindsSummary,
  outcomeFeedbackAdaptationDetail,
  outcomeFeedbackDetail,
  outcomeFeedbackLabel,
  preparedDraftActionLabel,
  preparedDraftClassLabel,
  resolveContinuityTargetLabel,
  sourceCountSummary,
} from "afp-ts/continuity";
import { continuityThreadSearchQuery } from "afp-ts/retrieval";
import type { DashboardBootstrap } from "@/lib/api";
import { ThreadDiscoveryStateSummary } from "@/components/ThreadDiscoveryStateSummary";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import {
  decisionOsDestinationLabel,
  decisionOsProactiveSuggestionDestination,
  navigateToView,
} from "@/lib/decisionosNavigation";
import {
  decisionOsPreparedWorkSimulatorSuggestionState,
} from "@/lib/decisionosPreparedWorkState";
import { decisionOsContextPackTrustState } from "@/lib/decisionOsContextPackPresentationState";
import { decisionOsProactiveTrustState } from "@/lib/decisionOsProactiveTrustState";
import { hasThreadRetrievalState, threadRetrievalState } from "@/lib/threadRetrievalState";
import { openThreadSearch } from "@/lib/threadSearchNavigation";

type ProactiveSuggestion = NonNullable<DashboardBootstrap["proactive_suggestions"]>[number];
type ProactiveSuggestionStripProps = {
  items: NonNullable<DashboardBootstrap["proactive_suggestions"]>;
  messages?: DashboardBootstrap["messages"];
  threadSummaries?: DashboardBootstrap["thread_summaries"];
  class?: string;
};
type ProactiveSuggestionCardProps = {
  item: ProactiveSuggestion;
  messages?: DashboardBootstrap["messages"];
  threadSummaries?: DashboardBootstrap["thread_summaries"];
};

function outcomeFeedbackTone(status: string | null | undefined): string {
  if (status === "reinforced" || status === "trusted") {
    return "border-emerald-300/40 bg-emerald-50/85 text-emerald-800";
  }
  if (status === "cooldown_recommended" || status === "cautious") {
    return "border-amber-300/40 bg-amber-50/85 text-amber-800";
  }
  if (status === "suppressed") {
    return "border-rose-300/40 bg-rose-50/85 text-rose-800";
  }
  return "border-slate-200/80 bg-white/75 text-slate-600";
}

function suggestionTone(kind: string | undefined): string {
  if (kind === "simulator_approval_preview") {
    return "border-amber-200/70 bg-amber-50/75 text-amber-950";
  }
  if (kind === "simulator_reversible_preview") {
    return "border-teal-200/70 bg-teal-50/75 text-teal-950";
  }
  if (kind === "simulator_conflict_fusion") {
    return "border-orange-200/70 bg-orange-50/75 text-orange-950";
  }
  if (kind === "continuity_priority") {
    return "border-indigo-200/70 bg-indigo-50/70 text-indigo-950";
  }
  if (kind === "context_ready") {
    return "border-cyan-200/70 bg-cyan-50/75 text-cyan-950";
  }
  if (kind === "context_pack") {
    return "border-sky-200/70 bg-sky-50/75 text-sky-950";
  }
  if (kind === "prepared_draft") {
    return "border-emerald-200/70 bg-emerald-50/75 text-emerald-950";
  }
  return "border-slate-200/70 bg-white/80 text-slate-950";
}

function suggestionLabel(
  kind: string | undefined,
  draftClass: string | undefined,
  packKind: string | undefined,
): string {
  if (kind === "prepared_draft" && draftClass) {
    return preparedDraftClassLabel(draftClass);
  }
  if (kind === "simulator_approval_preview") return "approval preview";
  if (kind === "simulator_reversible_preview") return "reversible preview";
  if (kind === "simulator_conflict_fusion") return "fusion preview";
  if (kind === "context_ready") return "context ready";
  if (kind === "context_pack") {
    return (packKind ?? "context_pack").replaceAll("_", " ");
  }
  if (kind === "continuity_priority") return "priority";
  return (kind ?? "suggestion").replaceAll("_", " ");
}

function suggestionThreadSearchQuery(
  title: string | null | undefined,
  linkedTargetLabel: string | null | undefined,
  referenceLabels: string[],
  objectLabels: string[],
  fileLabels: string[],
  packKind: string | undefined,
  draftClass: string | undefined,
  panelKind: string | null | undefined,
  sourceRefs: string[],
  referenceRefs: string[],
  objectRefs: string[],
  fileRefs: string[],
  messages?: DashboardBootstrap["messages"],
  threadSummaries?: DashboardBootstrap["thread_summaries"],
): string | null {
  return continuityThreadSearchQuery({
    title,
    linked_target_label: linkedTargetLabel ?? undefined,
    reference_labels: referenceLabels,
    object_labels: objectLabels,
    file_labels: fileLabels,
    pack_kind: packKind,
    draft_class: draftClass,
    panel_kind: panelKind ?? undefined,
    source_refs: sourceRefs,
    reference_refs: referenceRefs,
    object_refs: objectRefs,
    file_refs: fileRefs,
    messages,
    thread_summaries: threadSummaries,
  });
}

function comparisonPreviewRows(rows: { label: string; values: string[] }[] | null | undefined) {
  const previewRows = (rows || []).slice(0, 2);
  return previewRows.length > 0 ? previewRows : null;
}

function artifactSupportingSummaryLines(
  simulatorSupportingSummaryLines: string[] | null | undefined,
  fallbackArtifactReviewLines: string[],
) {
  const lines = (simulatorSupportingSummaryLines ?? fallbackArtifactReviewLines.slice(1, 3)).slice(0, 2);
  return lines.length > 0 ? lines : null;
}

function sourceSummaryText(sourceRefs: string[], sourceCount: number | null | undefined) {
  const explicitSummary = sourceCountSummary(sourceRefs);
  if (explicitSummary) {
    return explicitSummary;
  }
  const effectiveSourceCount = sourceCount || sourceRefs.length;
  if (effectiveSourceCount <= 0) {
    return "";
  }
  return `Based on ${effectiveSourceCount} source${effectiveSourceCount === 1 ? "" : "s"}`;
}

function suggestionContinuityTargetLabel(args: {
  linkedTargetLabel: string | null | undefined,
  referenceLabels: string[],
  objectLabels: string[],
  fileLabels: string[],
  sourceRefs: string[],
  referenceRefs: string[],
  objectRefs: string[],
  fileRefs: string[],
  messages?: DashboardBootstrap["messages"],
  threadSummaries?: DashboardBootstrap["thread_summaries"],
}) {
  return resolveContinuityTargetLabel({
    linked_target_label: args.linkedTargetLabel,
    reference_labels: args.referenceLabels,
    object_labels: args.objectLabels,
    file_labels: args.fileLabels,
    source_refs: args.sourceRefs,
    reference_refs: args.referenceRefs,
    object_refs: args.objectRefs,
    file_refs: args.fileRefs,
    messages: args.messages,
    thread_summaries: args.threadSummaries,
  }) || "";
}
function suggestionComparisonValueText(values: string[]) {
  return values.slice(0, 2).join(COMPARISON_VALUE_SEPARATOR);
}

function openSuggestionThreadSearch(event: MouseEvent, query: string) {
  event.stopPropagation();
  openThreadSearch({
    query,
    launchContext: THREAD_SEARCH_LAUNCH_CONTEXT,
  });
}

type VisibleSuggestionKind = NonNullable<DashboardBootstrap["proactive_suggestions"]>[number]["kind"];

const VISIBLE_SUGGESTION_KINDS = new Set<VisibleSuggestionKind>([
  "prepared_draft",
  "continuity_priority",
  "context_pack",
  "context_ready",
  "simulator_approval_preview",
  "simulator_reversible_preview",
  "simulator_conflict_fusion",
]);

const DEFAULT_SECTION_CLASS =
  "rounded-[26px] border border-slate-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(248,250,252,0.92))] p-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.2)]";
const SECTION_EYEBROW_TEXT = "Proactive Suggestions";
const SECTION_TITLE_TEXT = "Prepared suggestions surfaced ahead of the general feed";
const SECTION_HEADER_CLASS = "flex flex-wrap items-center justify-between gap-3";
const SECTION_HEADER_CONTENT_CLASS = "min-w-0";
const SECTION_EYEBROW_CLASS = "font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500";
const SECTION_TITLE_CLASS = "mt-1 text-sm font-semibold text-on-surface";
const SURFACED_COUNT_BADGE_CLASS =
  "rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 text-[10px] font-medium text-slate-600";
const CARDS_GRID_CLASS = "mt-3 grid gap-3 lg:grid-cols-2";
const CARD_HEADER_CLASS = "flex items-start justify-between gap-3";
const CARD_CONTENT_CLASS = "min-w-0 flex-1";
const BADGE_ROW_CLASS = "flex flex-wrap items-center gap-2";
const TITLE_TEXT_CLASS = "mt-2 text-sm font-semibold text-on-surface";
const DESCRIPTION_TEXT_CLASS = "mt-1 line-clamp-2 text-[11px] leading-5 opacity-80";
const FOOTER_SUMMARY_TEXT_CLASS = "text-[10px] opacity-75";
const REVIEW_SUMMARY_TEXT_CLASS = "mt-1 text-[10px] leading-5 text-on-surface-variant/75";
const FOOTER_ROW_CLASS = "mt-3 flex flex-wrap items-center gap-2 text-[10px] opacity-75";
const SUPPORTING_SUMMARY_TEXT_CLASS = "text-[10px] opacity-80";
const SUPPORTING_LEAD_TEXT_CLASS = `mt-1 leading-5 ${SUPPORTING_SUMMARY_TEXT_CLASS}`;
const SUPPORTING_LINE_TEXT_CLASS = `line-clamp-1 ${SUPPORTING_SUMMARY_TEXT_CLASS}`;
const COMPARISON_ROW_TEXT_CLASS = "flex items-center justify-between gap-2 text-[10px] opacity-80";
const COMPARISON_LABEL_TEXT_CLASS = "truncate font-medium text-on-surface";
const COMPARISON_VALUE_TEXT_CLASS = "truncate text-on-surface-variant/75";
const COMPARISON_VALUE_SEPARATOR = " | ";
const SECONDARY_DETAIL_TEXT_CLASS = "mt-1 text-[10px] leading-5 opacity-70";
const REVIEW_PANEL_CLASS = "mt-2 rounded-xl border border-current/10 bg-white/55 px-2.5 py-2";
const SHADOWLESS_REVIEW_PANEL_CLASS = `${REVIEW_PANEL_CLASS} shadow-none`;
const THREAD_SEARCH_BUTTON_TEXT = "refine threads";
const THREAD_SEARCH_LAUNCH_CONTEXT = {
  sourceLabel: "Proactive suggestion",
  reason: "Refine threads related to this surfaced suggestion",
} as const;
const BADGE_TEXT_CLASS = "rounded-full border px-2.5 py-1 text-[10px] font-medium";
const UPPERCASE_BADGE_TEXT_CLASS = "uppercase tracking-wide";
const PRIMARY_REASON_TEXT_CLASS = "mt-1 text-[10px] leading-5";
const NEUTRAL_BADGE_CLASS = `${BADGE_TEXT_CLASS} border-current/15 bg-white/70`;
const PRIMARY_NEUTRAL_BADGE_CLASS = `${NEUTRAL_BADGE_CLASS} ${UPPERCASE_BADGE_TEXT_CLASS} opacity-90`;
const SECONDARY_NEUTRAL_BADGE_CLASS = `${NEUTRAL_BADGE_CLASS} ${UPPERCASE_BADGE_TEXT_CLASS} opacity-80`;
const ACTION_BADGE_CLASS = `${NEUTRAL_BADGE_CLASS} opacity-90`;
const CONTINUITY_BADGE_CLASS =
  `${BADGE_TEXT_CLASS} border-emerald-300/40 bg-emerald-50/85 tracking-wide text-emerald-800`;
const APPROVAL_BADGE_CLASS =
  `${BADGE_TEXT_CLASS} border-amber-300/40 bg-amber-50/85 ${UPPERCASE_BADGE_TEXT_CLASS} text-amber-800`;
const BOUNDED_REASON_TEXT_CLASS = `${PRIMARY_REASON_TEXT_CLASS} text-slate-900/72`;
const THREAD_SEARCH_BUTTON_CLASS = `${NEUTRAL_BADGE_CLASS} opacity-100 transition hover:bg-white/90`;
const DEFAULT_SUGGESTION_TITLE = "Prepared suggestion";
const DEFAULT_DESCRIPTION_TEXT = "Prepared from recent continuity state.";
const DEFAULT_WORKSPACE_ACTION_TEXT = "Open workspace";
const APPROVAL_BADGE_TEXT = "approval";
const READY_NOW_TEXT = "ready now";
const VISIBLE_CARD_LIMIT = 4;
const SUGGESTION_CARD_CLASS_PREFIX =
  "rounded-2xl border p-3 text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/10";

function ProactiveSuggestionCard(props: ProactiveSuggestionCardProps) {
  const item = props.item;
  const kind = item.kind;
  const packKind = item.pack_kind;
  const draftClass = item.draft_class;
  const simulatorPreviewState = decisionOsPreparedWorkSimulatorSuggestionState(item);
  const contextPackTrustState =
    kind === "context_pack" || kind === "context_ready"
      ? decisionOsContextPackTrustState({
        kind,
        pack_kind: packKind || "",
        why_surfaced: item.selection_reason || "",
        source_refs: item.source_refs || [],
        retrieval_mode: item.retrieval_mode || null,
        deeper_retrieval_recommended: item.deeper_retrieval_recommended === true,
        readiness_reason: item.readiness_reason || null,
        topology_budget_used: item.topology_budget_used,
        working_set_count: item.working_set_count,
        active_topic_count: item.active_topic_count,
      })
      : null;
  const fallbackArtifactReviewLines = artifactSummaryDisplayedLines({
    artifact_summary_lines: item.artifact_summary_lines || [],
    description: item.description || null,
    draft_preview: item.draft_preview || null,
  });
  const proactiveTrustState = decisionOsProactiveTrustState({
    kind,
    pack_kind: packKind,
    draft_class: draftClass,
    selection_reason: item.selection_reason || null,
    requires_approval: item.requires_approval === true,
    readiness: item.readiness || null,
    response_due_hint: item.response_due_hint || null,
    source_refs: item.source_refs || [],
    evidence_kinds: item.evidence_kinds || [],
    approval_or_reversibility_hint: item.approval_or_reversibility_hint || null,
    provenance_cue: item.provenance_cue || null,
    autonomy_tier: item.autonomy_tier || null,
    autonomy_decision: item.autonomy_decision || null,
    simulator_bounded_reason: simulatorPreviewState?.boundedReason || null,
    simulator_has_distinct_selection_reason: simulatorPreviewState?.hasDistinctSelectionReason ?? null,
    simulator_consequence_preview: simulatorPreviewState?.consequencePreview || null,
    simulator_provenance_cue: simulatorPreviewState?.provenanceCue || null,
    simulator_source_summary: simulatorPreviewState?.sourceSummary || null,
    simulator_autonomy_summary: simulatorPreviewState?.autonomySummary || null,
  });
  const destination = decisionOsProactiveSuggestionDestination(item);
  const titleText = item.title || DEFAULT_SUGGESTION_TITLE;
  const descriptionText = item.description || item.suggested_action || DEFAULT_DESCRIPTION_TEXT;
  const continuityTargetLabel = suggestionContinuityTargetLabel({
    linkedTargetLabel: item.linked_target_label || null,
    referenceLabels: item.reference_labels || [],
    objectLabels: item.object_labels || [],
    fileLabels: item.file_labels || [],
    sourceRefs: item.source_refs || [],
    referenceRefs: item.reference_refs || [],
    objectRefs: item.object_refs || [],
    fileRefs: item.file_refs || [],
    messages: props.messages || [],
    threadSummaries: props.threadSummaries || [],
  });
  const feedbackLabel = outcomeFeedbackLabel(item.outcome_feedback) || "";
  const boundedReasonText = proactiveTrustState.boundedReasonText || "";
  const selectionReasonText = proactiveTrustState.distinctSelectionReasonText || "";
  const priorityRationaleText = proactiveTrustState.priorityRationaleText || "";
  const feedbackDetailText = outcomeFeedbackDetail(item.outcome_feedback) || "";
  const feedbackAdaptationText = outcomeFeedbackAdaptationDetail(item.outcome_feedback) || "";
  const evidenceSummaryText = evidenceKindsSummary(item.evidence_kinds || []) || "";
  const retrievalModeSummaryText = contextPackTrustState?.retrievalModeText || "";
  const readinessReasonText = contextPackTrustState?.readinessReasonText || "";
  const topologyBudgetText = contextPackTrustState?.topologyBudgetText || "";
  const workingSetText = contextPackTrustState?.workingSetText || "";
  const activeTopicText = contextPackTrustState?.activeTopicText || "";
  const consequenceSummaryText =
    proactiveTrustState.consequenceSummaryText
    || "";
  const previewBoundarySummaryText = item.preview_only
    ? simulatorPreviewState?.previewBoundarySummary || item.preview_boundary_summary || ""
    : "";
  const provenanceSummaryText =
    proactiveTrustState.provenanceSummaryText
    || "";
  const leadSummaryText = simulatorPreviewState?.leadSummaryLine || fallbackArtifactReviewLines[0] || "";
  const supportingSummaryLines = artifactSupportingSummaryLines(
    simulatorPreviewState?.supportingSummaryLines,
    fallbackArtifactReviewLines,
  );
  const autonomySummaryText =
    proactiveTrustState.autonomySummaryText
    || "";
  const comparisonRows = comparisonPreviewRows(item.comparison_rows || []);
  const actionBadgeText =
    kind === "prepared_draft" && draftClass
      ? preparedDraftActionLabel([{ draft_class: draftClass }])
      : kind === "continuity_priority"
        || kind === "context_pack"
        || kind === "context_ready"
        || Boolean(item.destination_view)
        || Boolean(item.panel_kind)
        || Boolean(item.surface_hint)
        ? `Open ${decisionOsDestinationLabel(destination)}`
        : item.action_label || DEFAULT_WORKSPACE_ACTION_TEXT;
  const threadSearchQuery =
    suggestionThreadSearchQuery(
      titleText,
      item.linked_target_label || null,
      item.reference_labels || [],
      item.object_labels || [],
      item.file_labels || [],
      packKind,
      draftClass,
      item.panel_kind || null,
      item.source_refs || [],
      item.reference_refs || [],
      item.object_refs || [],
      item.file_refs || [],
      props.messages || [],
      props.threadSummaries || [],
    ) || "";
  const confidenceText = item.confidence ? `${item.confidence} confidence` : "";
  const readinessText = item.readiness === "ready_now" ? READY_NOW_TEXT : item.readiness || "";
  const responseDueText = item.response_due_hint || "";
  const sourceSummaryValue = proactiveTrustState.sourceSummaryText
    || sourceSummaryText(item.source_refs || [], item.source_count);
  const trustBlockSourceSummaryText = sourceSummaryValue;

  return (
    <button
      type="button"
      onClick={() => navigateToView(destination)}
      class={`${SUGGESTION_CARD_CLASS_PREFIX} ${suggestionTone(kind)}`}
    >
      <div class={CARD_HEADER_CLASS}>
        <div class={CARD_CONTENT_CLASS}>
          <div class={BADGE_ROW_CLASS}>
            <span class={PRIMARY_NEUTRAL_BADGE_CLASS}>
              {suggestionLabel(kind, draftClass, packKind)}
            </span>
            <Show when={continuityTargetLabel}>
              {(label) => <span class={CONTINUITY_BADGE_CLASS}>{label()}</span>}
            </Show>
            <Show when={item.channel || ""}>
              {(value) => <span class={SECONDARY_NEUTRAL_BADGE_CLASS}>{value()}</span>}
            </Show>
            <Show when={item.requires_approval === true ? APPROVAL_BADGE_TEXT : ""}>
              {(label) => <span class={APPROVAL_BADGE_CLASS}>{label()}</span>}
            </Show>
            <Show when={feedbackLabel}>
              {(label) => (
                <span
                  class={`${BADGE_TEXT_CLASS} ${UPPERCASE_BADGE_TEXT_CLASS} ${outcomeFeedbackTone(item.outcome_feedback?.status)}`}
                >
                  {label()}
                </span>
              )}
            </Show>
          </div>
          <p class={TITLE_TEXT_CLASS}>{titleText}</p>
          <p class={DESCRIPTION_TEXT_CLASS}>{descriptionText}</p>
          <Show when={boundedReasonText}>
            {(text) => <p class={BOUNDED_REASON_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={priorityRationaleText}>
            {(text) => <p class={SECONDARY_DETAIL_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={feedbackDetailText}>
            {(text) => <p class={SECONDARY_DETAIL_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={feedbackAdaptationText}>
            {(text) => <p class={SECONDARY_DETAIL_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={evidenceSummaryText}>
            {(text) => <p class={SECONDARY_DETAIL_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={readinessReasonText}>
            {(text) => <p class={SECONDARY_DETAIL_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={retrievalModeSummaryText}>
            {(text) => <p class={SECONDARY_DETAIL_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={topologyBudgetText}>
            {(text) => <p class={SECONDARY_DETAIL_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={workingSetText}>
            {(text) => <p class={SECONDARY_DETAIL_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={activeTopicText}>
            {(text) => <p class={SECONDARY_DETAIL_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={autonomySummaryText}>
            {(text) => <p class={REVIEW_SUMMARY_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={hasThreadRetrievalState(item)}>
              <ThreadDiscoveryStateSummary
                class={SHADOWLESS_REVIEW_PANEL_CLASS}
                state={threadRetrievalState(item)}
              />
          </Show>
          <div class="grid gap-2 sm:grid-cols-2">
            <TrustSummaryBlocks
              selectionReason={selectionReasonText || null}
              showSelectionReason={Boolean(selectionReasonText)}
              consequencePreview={consequenceSummaryText || null}
              previewBoundarySummary={previewBoundarySummaryText || null}
              provenanceCue={provenanceSummaryText || null}
              sourceSummary={trustBlockSourceSummaryText || null}
            />
          </div>
          <Show when={leadSummaryText}>
            {(text) => <p class={SUPPORTING_LEAD_TEXT_CLASS}>{text()}</p>}
          </Show>
          <Show when={supportingSummaryLines}>
            {(lines) => (
              <div class={REVIEW_PANEL_CLASS}>
                <For each={lines()}>
                  {(line) => <p class={SUPPORTING_LINE_TEXT_CLASS}>{line}</p>}
                </For>
              </div>
            )}
          </Show>
          <Show when={comparisonRows}>
            {(rows) => (
              <div class={REVIEW_PANEL_CLASS}>
                <For each={rows()}>
                  {(row) => (
                    <div class={COMPARISON_ROW_TEXT_CLASS}>
                      <span class={COMPARISON_LABEL_TEXT_CLASS}>{row.label}</span>
                      <span class={COMPARISON_VALUE_TEXT_CLASS}>
                        {suggestionComparisonValueText(row.values)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            )}
          </Show>
        </div>
        <span class={ACTION_BADGE_CLASS}>{actionBadgeText}</span>
      </div>
      <div class={FOOTER_ROW_CLASS}>
        <Show when={threadSearchQuery}>
          {(query) => (
            <button
              type="button"
              onClick={(event) => openSuggestionThreadSearch(event, query())}
              class={THREAD_SEARCH_BUTTON_CLASS}
            >
              {THREAD_SEARCH_BUTTON_TEXT}
            </button>
          )}
        </Show>
        <Show when={confidenceText}>
          {(text) => <span class={FOOTER_SUMMARY_TEXT_CLASS}>{text()}</span>}
        </Show>
        <Show when={readinessText}>
          {(text) => <span class={FOOTER_SUMMARY_TEXT_CLASS}>{text()}</span>}
        </Show>
        <Show when={responseDueText}>
          {(text) => <span class={FOOTER_SUMMARY_TEXT_CLASS}>{text()}</span>}
        </Show>
      </div>
    </button>
  );
}

export function ProactiveSuggestionStrip(props: ProactiveSuggestionStripProps) {
  const visibleItems = props.items.filter((item) => VISIBLE_SUGGESTION_KINDS.has(item.kind));
  const visibleItemCount = visibleItems.length;
  const visibleCardItems = visibleItems.slice(0, VISIBLE_CARD_LIMIT);
  return (
    <Show
      when={visibleItemCount > 0}
    >
      <section class={props.class ?? DEFAULT_SECTION_CLASS}>
        <div class={SECTION_HEADER_CLASS}>
          <div class={SECTION_HEADER_CONTENT_CLASS}>
            <p class={SECTION_EYEBROW_CLASS}>
              {SECTION_EYEBROW_TEXT}
            </p>
            <h2 class={SECTION_TITLE_CLASS}>
              {SECTION_TITLE_TEXT}
            </h2>
          </div>
          <span class={SURFACED_COUNT_BADGE_CLASS}>
            {`${visibleItemCount} surfaced`}
          </span>
        </div>

        <div class={CARDS_GRID_CLASS}>
          <For each={visibleCardItems}>
            {(item) => (
              <ProactiveSuggestionCard
                item={item}
                messages={props.messages}
                threadSummaries={props.threadSummaries}
              />
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}
