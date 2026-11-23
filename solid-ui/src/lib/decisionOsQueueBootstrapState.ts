// @locs-version: 1.0
import type {
  DecisionOsActionItem,
  DecisionOsContextPackItem,
  DecisionOsContextPanelItem,
  DecisionOsPreparedDraftItem,
  DecisionOsProactiveSuggestion,
  DecisionOsPriorityCard,
  DecisionOsResponseItem,
} from "@/lib/decisionosContinuity";
import { dashboardBootstrapProactiveSuggestions } from "@/lib/dashboardBootstrapState";

export type DecisionOsQueueBootstrapState = {
  queuePriorityCard: DecisionOsPriorityCard | null;
  queueActionItems: DecisionOsActionItem[];
  queueContextPanelItems: DecisionOsContextPanelItem[];
  queueActionOverflowCount: number;
  queueActionOverflowSummary: string | null;
};

export type DecisionOsQueuePrimaryMode = "priority_card" | "action_item" | null;

export type DecisionOsQueueCompanionState = {
  responseItems: DecisionOsResponseItem[];
  preparedDraftItems: DecisionOsPreparedDraftItem[];
  contextPackItems: DecisionOsContextPackItem[];
  proactiveSuggestions: DecisionOsProactiveSuggestion[];
};

export type DecisionOsQueueBootstrapInput = {
  continuity_priority_card?: DecisionOsPriorityCard | null;
  continuity_action_items?: DecisionOsActionItem[] | null;
  continuity_action_overflow_count?: number | null;
  continuity_action_overflow_summary?: string | null;
  continuity_context_panel_items?: DecisionOsContextPanelItem[] | null;
  continuity_response_items?: DecisionOsResponseItem[] | null;
  continuity_prepared_draft_items?: DecisionOsPreparedDraftItem[] | null;
  continuity_context_pack_items?: DecisionOsContextPackItem[] | null;
  proactive_suggestions?: DecisionOsProactiveSuggestion[] | null;
};

export function decisionOsQueuePriorityCard(
  bootstrap: DecisionOsQueueBootstrapInput | null | undefined,
): DecisionOsPriorityCard | null {
  return bootstrap?.continuity_priority_card ?? null;
}

export function decisionOsQueueActionItems(
  bootstrap: DecisionOsQueueBootstrapInput | null | undefined,
): DecisionOsActionItem[] {
  return bootstrap?.continuity_action_items ?? [];
}

export function decisionOsQueueContextPanelItems(
  bootstrap: DecisionOsQueueBootstrapInput | null | undefined,
): DecisionOsContextPanelItem[] {
  return bootstrap?.continuity_context_panel_items ?? [];
}

export function decisionOsQueueResponseItems(
  bootstrap: DecisionOsQueueBootstrapInput | null | undefined,
): DecisionOsResponseItem[] {
  return bootstrap?.continuity_response_items ?? [];
}

export function decisionOsQueuePreparedDraftItems(
  bootstrap: DecisionOsQueueBootstrapInput | null | undefined,
): DecisionOsPreparedDraftItem[] {
  return bootstrap?.continuity_prepared_draft_items ?? [];
}

export function decisionOsQueueContextPackItems(
  bootstrap: DecisionOsQueueBootstrapInput | null | undefined,
): DecisionOsContextPackItem[] {
  return bootstrap?.continuity_context_pack_items ?? [];
}

export function decisionOsQueueBootstrapState(
  bootstrap: DecisionOsQueueBootstrapInput | null | undefined,
): DecisionOsQueueBootstrapState {
  return {
    queuePriorityCard: decisionOsQueuePriorityCard(bootstrap),
    queueActionItems: decisionOsQueueActionItems(bootstrap),
    queueContextPanelItems: decisionOsQueueContextPanelItems(bootstrap),
    queueActionOverflowCount:
      typeof bootstrap?.continuity_action_overflow_count === "number"
        && Number.isFinite(bootstrap.continuity_action_overflow_count)
        && bootstrap.continuity_action_overflow_count > 0
        ? Math.floor(bootstrap.continuity_action_overflow_count)
        : 0,
    queueActionOverflowSummary:
      typeof bootstrap?.continuity_action_overflow_summary === "string"
        && bootstrap.continuity_action_overflow_summary.trim().length > 0
        ? bootstrap.continuity_action_overflow_summary.trim()
        : null,
  };
}

export function decisionOsQueueCompanionState(
  bootstrap: DecisionOsQueueBootstrapInput | null | undefined,
): DecisionOsQueueCompanionState {
  return {
    responseItems: decisionOsQueueResponseItems(bootstrap),
    preparedDraftItems: decisionOsQueuePreparedDraftItems(bootstrap),
    contextPackItems: decisionOsQueueContextPackItems(bootstrap),
    proactiveSuggestions: dashboardBootstrapProactiveSuggestions(bootstrap),
  };
}

export function decisionOsQueueHasVisibleWork(
  queueState: DecisionOsQueueBootstrapState,
): boolean {
  return Boolean(queueState.queuePriorityCard) || queueState.queueActionItems.length > 0;
}

export function decisionOsQueuePrimaryMode(
  queueState: DecisionOsQueueBootstrapState,
  explicitMode?: string | null,
): DecisionOsQueuePrimaryMode {
  if (explicitMode === "priority_card" || explicitMode === "action_item") {
    return explicitMode;
  }
  if (queueState.queuePriorityCard) return "priority_card";
  if (queueState.queueActionItems.length > 0) return "action_item";
  return null;
}
