// @locs-version: 1.0
import { createMemo, For, onCleanup, onMount, Show } from "solid-js";
import { subscribeMagicActionEvent } from "@/lib/magicActionEvent";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import {
  fieldEngineFamilyLabel,
  latestFieldEnginePrimaryTypeFromMessages,
  latestFieldEngineSummaryFromMessages,
  outcomeFeedbackLabel,
  preparedDraftClassLabel,
  responseItemPreparedDraftDisplayedSummaryLines,
  resolveResponseNavigationTarget,
  responseItemOutcomeFeedbackForItem,
  summarizeReferenceLabels,
} from "afp-ts/continuity";
import {
  decisionOsDestinationLabel,
  decisionOsProactiveSuggestionDestination,
  openDecisionOsResponseTarget,
  navigateToView,
} from "@/lib/decisionosNavigation";
import { decisionQueueEntryDestinationLabel } from "@/lib/decisionQueueNavigation";
import { buildQueueEntries } from "@/lib/decisionQueueModel";
import {
  queueEntryAutonomySummary,
  queueEntryTrustState,
} from "@/lib/decisionQueuePresentationState";
import { readSession, type AfpMessage } from "@/lib/api";
import {
  type DecisionOsCostSnapshot,
  type DecisionOsCostStatus,
} from "@/lib/decisionosContinuity";
import { loadResponseQueuePolicy, rankResponseItems } from "@/lib/responseQueuePolicy";
import {
  decisionOsQueuePrimaryMode,
  type DecisionOsQueueBootstrapState,
  type DecisionOsQueueCompanionState,
} from "@/lib/decisionOsQueueBootstrapState";
import {
  decisionOsOperationalContinuityCardState,
  decisionOsOperationalSimulatorPreviewCardState,
  decisionOsOperationalSimulatorPreviewCardStateFromUnknown,
} from "@/lib/decisionOsOperationalPressureState";
import { operationalPressureCardTrustState } from "@/lib/operationalPressureCardTrustState";
import { decisionOsResponsePreparedDraftPresentationState } from "@/lib/decisionosPreparedWorkState";

const PRESSURE_SECTION_CLASS =
  "rounded-[26px] border border-slate-200/70 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.9))] p-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.28)]";
const PRESSURE_EYEBROW_CLASS =
  "font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500";
const PRESSURE_TITLE_CLASS = "mt-1 text-sm font-semibold text-on-surface";
const PRESSURE_COUNT_BADGE_CLASS =
  "rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 text-[10px] font-medium text-slate-600";
const PRESSURE_CARD_CLASS =
  "rounded-2xl border p-3 text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/10";
const PRESSURE_CARD_BADGE_CLASS =
  "rounded-full border border-current/15 bg-white/70 px-2.5 py-1 text-[10px] font-medium opacity-90";
const HIDDEN_CARD_SUMMARY_CLASS =
  "mt-3 rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2 text-[11px] text-slate-600";

type PressureCard = {
  key: "continuity" | "responses" | "cost";
  rank: number;
  tone: string;
  label: string;
  title: string;
  badge: string;
  detail: string;
  boundedReason?: string | null;
  rawReason?: string | null;
  priorityRationale?: string | null;
  consequencePreview?: string | null;
  previewBoundarySummary?: string | null;
  provenanceCue?: string | null;
  autonomySummary?: string | null;
  sourceSummary?: string | null;
  footer: string;
  actionLabel: string;
  onOpen: () => void;
};

type OperationalPressureRowProps = {
  queueState: DecisionOsQueueBootstrapState;
  queueCompanionState: DecisionOsQueueCompanionState;
  messages?: AfpMessage[] | null;
  costStatus: DecisionOsCostStatus | null;
  costSnapshot: DecisionOsCostSnapshot | null;
  onOpenQueuePriority: () => void;
};

function pressureMagicIcon(card: PressureCard): string {
  if (card.key === "continuity") return "continuity";
  if (card.key === "responses") return "responses";
  return "cost";
}

export function OperationalPressureRow(props: OperationalPressureRowProps) {
  const sessionUserId = readSession()?.user?.id ?? null;
  const queueState = () => props.queueState;
  const queueCompanionState = () => props.queueCompanionState;
  const messages = () => props.messages ?? null;
  const costStatus = () => props.costStatus;
  const costSnapshot = () => props.costSnapshot;
  const openQueuePriority = () => props.onOpenQueuePriority;
  const responsePolicy = loadResponseQueuePolicy(sessionUserId);

  const rankedUrgentResponses = createMemo(() =>
    rankResponseItems(queueCompanionState().responseItems, responsePolicy).filter(
      (item) => item.urgency === "urgent" || item.urgency === "today",
    ),
  );
  const costProgress = createMemo(() => {
    const snapshot = costSnapshot();
    if (!snapshot || snapshot.monthly_budget_usd <= 0) return null;
    return Math.round((snapshot.recent_spend_usd_14d / snapshot.monthly_budget_usd) * 100);
  });
  const fieldEngineFamily = createMemo(() =>
    fieldEngineFamilyLabel(latestFieldEnginePrimaryTypeFromMessages(messages())),
  );
  const fieldEngineSummary = createMemo(() =>
    latestFieldEngineSummaryFromMessages(messages()),
  );
  const simulatorApprovalPreview = createMemo(
    () =>
      queueCompanionState().proactiveSuggestions.find(
        (item) => item.kind === "simulator_approval_preview",
      ) ?? null,
  );
  const simulatorFusionPreview = createMemo(
    () =>
      queueCompanionState().proactiveSuggestions.find(
        (item) => item.kind === "simulator_conflict_fusion",
      ) ?? null,
  );
  const simulatorReversiblePreview = createMemo(
    () =>
      queueCompanionState().proactiveSuggestions.find(
        (item) => item.kind === "simulator_reversible_preview",
      ) ?? null,
  );
  const queueEntries = createMemo(() => buildQueueEntries(queueState()));
  const continuityEntry = createMemo(
    () => queueEntries().find((entry) => entry.source === "priority") ?? null,
  );
  const queuePrimaryMode = createMemo(() => decisionOsQueuePrimaryMode(queueState()));

  const pressureCards = createMemo<PressureCard[]>(() => {
    const cards: PressureCard[] = [];
    const priorityCard = queueState().queuePriorityCard;
    const continuityQueueEntry = continuityEntry();
    const urgentResponses = rankedUrgentResponses();
    const currentCostStatus = costStatus();
    const approvalPreview = simulatorApprovalPreview();
    const fusionPreview = simulatorFusionPreview();
    const reversiblePreview = simulatorReversiblePreview();
    const currentFieldEngineSummary = fieldEngineSummary();
    const currentFieldEngineFamily = fieldEngineFamily();

    if (priorityCard && continuityQueueEntry) {
      const decision = continuityQueueEntry.decision;
      const trustState = queueEntryTrustState(continuityQueueEntry);
      const continuityDestinationLabel =
        decisionQueueEntryDestinationLabel(continuityQueueEntry);
      const priorityReason =
        trustState.priorityRationale ?? decision.context;
      const objectSummary = summarizeReferenceLabels({
        object_refs: priorityCard.object_refs,
        object_labels: priorityCard.object_labels,
        limit: 2,
        prefix: "Object anchors",
      });
      const provenanceCue = trustState.provenanceCue;
      const fieldEngineCue =
        currentFieldEngineSummary
        && !priorityReason.toLowerCase().includes(currentFieldEngineSummary.toLowerCase())
          ? currentFieldEngineFamily
            ? `${currentFieldEngineFamily}: ${currentFieldEngineSummary}`
            : currentFieldEngineSummary
          : null;
      const boundedReason = trustState.boundedReason;
      const rawReason = trustState.rawReasonText;
      const footerText = objectSummary
        ? objectSummary
        : priorityCard.prepared_draft_class
          && priorityCard.prepared_draft_class !== "communication_reply"
          ? `Prioritized as ${preparedDraftClassLabel(priorityCard.prepared_draft_class)}`
          : provenanceCue ?? `Open ${continuityDestinationLabel}`;

      cards.push({
        key: "continuity",
        rank: priorityCard.requires_approval ? 0 : 1,
        tone: "border-indigo-200/70 bg-indigo-50/70 text-indigo-950",
        ...decisionOsOperationalContinuityCardState({
          title: decision.title,
          context: decision.context,
          priorityReason,
          boundedReason,
          rawReason,
          consequencePreview: trustState.consequencePreview,
          provenanceCue,
          autonomySummary: queueEntryAutonomySummary(continuityQueueEntry),
          sourceSummary: trustState.sourceSummary,
          footer: footerText,
          destinationLabel: continuityDestinationLabel,
          fieldEngineCue,
          isPrimary: queuePrimaryMode() === "priority_card",
        }),
        onOpen: openQueuePriority(),
      });
    }

    if (urgentResponses.length > 0) {
      const leadResponse = urgentResponses[0];
      const leadHasDraft = Boolean(leadResponse?.prepared_draft_available);
      const leadFeedback = leadResponse
        ? responseItemOutcomeFeedbackForItem(
            leadResponse,
            queueCompanionState().proactiveSuggestions,
          )
        : undefined;
      const leadPresentationState = leadResponse
        ? decisionOsResponsePreparedDraftPresentationState(leadResponse)
        : null;
      const leadDisplayedDraftSummaryLines = leadResponse
        ? responseItemPreparedDraftDisplayedSummaryLines(leadResponse)
        : [];
      const leadDraftSummary = leadDisplayedDraftSummaryLines[0] ?? null;
      const leadSupportingDraftSummary = leadDisplayedDraftSummaryLines[1] ?? null;
      const responseDestinationLabel = decisionOsDestinationLabel(
        resolveResponseNavigationTarget(urgentResponses)?.view ?? "response_queue",
      );
      const responseBadge =
        outcomeFeedbackLabel(leadFeedback)
        ?? (leadHasDraft
          ? "draft ready"
          : leadResponse?.urgency === "urgent"
            ? "urgent"
            : "due soon");
      const responseDetail =
        leadPresentationState?.boundedReason
        ?? leadDraftSummary
        ?? leadResponse?.title
        ?? "A response deadline is approaching.";
      const responseFooter = leadHasDraft
        ? leadSupportingDraftSummary
          ?? `${leadResponse?.response_due_hint ?? "Review soon"} | Draft prepared`
        : leadResponse?.response_due_hint ?? "Review response queue";
      const responseActionLabel = leadHasDraft
        ? "Review draft"
        : `Open ${responseDestinationLabel}`;

      cards.push({
        key: "responses",
        rank: leadResponse?.urgency === "urgent" ? 0 : 2,
        tone: "border-sky-200/70 bg-sky-50/70 text-sky-950",
        label: "Responses",
        title: `${urgentResponses.length} conversation${urgentResponses.length === 1 ? "" : "s"} need attention`,
        badge: responseBadge,
        detail: responseDetail,
        boundedReason: null,
        rawReason: null,
        autonomySummary: leadPresentationState?.autonomySummary ?? null,
        footer: responseFooter,
        actionLabel: responseActionLabel,
        onOpen: () => {
          openDecisionOsResponseTarget(urgentResponses);
        },
      });
    }

    if (currentCostStatus) {
      const costRank =
        currentCostStatus.level === "warning"
          ? 1
          : currentCostStatus.level === "elevated"
            ? 3
            : 4;
      const costFooter = `${costProgress() !== null ? `${costProgress()}% of monthly cap | ` : ""}Open cost dashboard`;

      cards.push({
        key: "cost",
        rank: costRank,
        tone: "border-amber-200/70 bg-amber-50/70 text-amber-950",
        label: "Cost",
        title: currentCostStatus.title,
        badge: currentCostStatus.level,
        detail: currentCostStatus.detail,
        boundedReason: null,
        rawReason: null,
        footer: costFooter,
        actionLabel: "Open cost dashboard",
        onOpen: () => navigateToView("cost_dashboard"),
      });
    }

    if (approvalPreview) {
      const destinationLabel = decisionOsDestinationLabel(
        decisionOsProactiveSuggestionDestination(approvalPreview),
      );
      cards.push({
        key: "continuity",
        rank: 2,
        tone: "border-amber-200/70 bg-amber-50/70 text-amber-950",
        ...(decisionOsOperationalSimulatorPreviewCardStateFromUnknown({
          item: approvalPreview,
          destinationLabel,
        }) ?? decisionOsOperationalSimulatorPreviewCardState({
          kind: "approval",
          title: "Approval preview ready",
          destinationLabel,
        })),
        onOpen: () =>
          navigateToView(decisionOsProactiveSuggestionDestination(approvalPreview)),
      });
    }

    if (fusionPreview) {
      const destinationLabel = decisionOsDestinationLabel(
        decisionOsProactiveSuggestionDestination(fusionPreview),
      );
      cards.push({
        key: "continuity",
        rank: 2,
        tone: "border-violet-200/70 bg-violet-50/70 text-violet-950",
        ...(decisionOsOperationalSimulatorPreviewCardStateFromUnknown({
          item: fusionPreview,
          destinationLabel,
        }) ?? decisionOsOperationalSimulatorPreviewCardState({
          kind: "fusion",
          title: "Fusion preview ready",
          destinationLabel,
        })),
        onOpen: () =>
          navigateToView(decisionOsProactiveSuggestionDestination(fusionPreview)),
      });
    }

    if (reversiblePreview) {
      const destinationLabel = decisionOsDestinationLabel(
        decisionOsProactiveSuggestionDestination(reversiblePreview),
      );
      cards.push({
        key: "responses",
        rank: 3,
        tone: "border-teal-200/70 bg-teal-50/70 text-teal-950",
        ...(decisionOsOperationalSimulatorPreviewCardStateFromUnknown({
          item: reversiblePreview,
          destinationLabel,
        }) ?? decisionOsOperationalSimulatorPreviewCardState({
          kind: "reversible",
          title: "Reversible preview ready",
          destinationLabel,
        })),
        onOpen: () =>
          navigateToView(decisionOsProactiveSuggestionDestination(reversiblePreview)),
      });
    }

    return cards.sort((left, right) => left.rank - right.rank);
  });

  const visibleCards = createMemo(() => pressureCards().slice(0, 2));
  const hiddenCards = createMemo(() => pressureCards().slice(2));
  const activeSignalCount = createMemo(() => pressureCards().length);
  const activeSignalCountLabel = createMemo(
    () => `${activeSignalCount()} active signal${activeSignalCount() === 1 ? "" : "s"}`,
  );
  const hiddenCardSummary = createMemo(
    () => hiddenCards().map((card) => card.label.toLowerCase()).join(" | "),
  );
  const showPressureRow = createMemo(() => activeSignalCount() > 0);
  const showHiddenCardSummary = createMemo(() => hiddenCards().length > 0);

  onMount(() => {
    const unsubscribeMagicActionEvent = subscribeMagicActionEvent(({ action, msgId }) => {
      if (action !== "open" || !msgId?.startsWith("pressure-")) return;
      const idx = parseInt(msgId.slice("pressure-".length), 10);
      visibleCards()[idx]?.onOpen();
    });
    onCleanup(() => unsubscribeMagicActionEvent());
  });

  return (
    <Show when={showPressureRow()}>
      <section class={PRESSURE_SECTION_CLASS}>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class={PRESSURE_EYEBROW_CLASS}>Operational Pressure</p>
            <h2 class={PRESSURE_TITLE_CLASS}>What is exerting the most pressure right now</h2>
          </div>
          <span class={PRESSURE_COUNT_BADGE_CLASS}>{activeSignalCountLabel()}</span>
        </div>

        <div class="mt-3 grid gap-3 lg:grid-cols-2">
          <For each={visibleCards()}>
            {(card, index) => {
              const trustState = operationalPressureCardTrustState({
                boundedReason: card.boundedReason,
                rawReason: card.rawReason,
                consequencePreview: card.consequencePreview,
                provenanceCue: card.provenanceCue,
                autonomySummary: card.autonomySummary,
                sourceSummary: card.sourceSummary,
                previewBoundarySummary: card.previewBoundarySummary,
              });
              const showPriorityRationale =
                card.key === "continuity" && Boolean(card.priorityRationale);
              const magicIcon = pressureMagicIcon(card);

              return (
                <button
                  type="button"
                  onClick={card.onOpen}
                  class={`${PRESSURE_CARD_CLASS} ${card.tone}`}
                  data-magic-action="open"
                  data-magic-icon={magicIcon}
                  data-magic-label={card.actionLabel}
                  data-magic-id={`pressure-${index()}`}
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-mono text-[9px] uppercase tracking-[0.16em] opacity-70">{card.label}</p>
                      <p class="mt-1 text-sm font-semibold">{card.title}</p>
                    </div>
                    <span class={PRESSURE_CARD_BADGE_CLASS}>{card.badge}</span>
                  </div>
                  <p class="mt-2 text-[11px] leading-5 opacity-80">{card.detail}</p>
                  <Show when={trustState.showBoundedReason}>
                    <p class="mt-1 text-[10px] leading-5 text-indigo-900/72">
                      {trustState.boundedReasonText}
                    </p>
                  </Show>
                  <Show when={trustState.showSelectionReason}>
                    <div class="mt-2 space-y-2">
                      <TrustSummaryBlocks
                        selectionReason={trustState.selectionReasonText}
                        showSelectionReason={trustState.showSelectionReason}
                      />
                    </div>
                  </Show>
                  <Show when={showPriorityRationale}>
                    <p class="mt-1 text-[10px] leading-5 text-indigo-900/75">
                      {card.priorityRationale}
                    </p>
                  </Show>
                  <div class="mt-2 space-y-2">
                    <TrustSummaryBlocks
                      consequencePreview={trustState.trustBlocks.consequencePreview}
                      provenanceCue={trustState.trustBlocks.provenanceCue}
                      autonomySummary={trustState.trustBlocks.autonomySummary}
                      sourceSummary={trustState.trustBlocks.sourceSummary}
                      previewBoundarySummary={trustState.trustBlocks.previewBoundarySummary}
                    />
                  </div>
                  <div class="mt-3 flex items-center justify-between gap-3">
                    <p class="text-[10px] font-medium opacity-90">{card.footer}</p>
                    <span class={PRESSURE_CARD_BADGE_CLASS}>{card.actionLabel}</span>
                  </div>
                </button>
              );
            }}
          </For>
        </div>

        <Show when={showHiddenCardSummary()}>
          <div class={HIDDEN_CARD_SUMMARY_CLASS}>
            Also active: {hiddenCardSummary()}
          </div>
        </Show>
      </section>
    </Show>
  );
}
