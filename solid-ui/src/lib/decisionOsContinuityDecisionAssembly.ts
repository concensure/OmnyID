// @locs-version: 1.0
import {
  decisionFromActionItem as buildActionDecision,
  decisionFromPriorityCard as buildPriorityDecision,
  type ContinuityPriorityDecision,
} from "afp-ts/continuity";
import type {
  DecisionOsActionItem,
  DecisionOsContextPanelItem,
  DecisionOsPriorityCard,
} from "./decisionosContinuity";
import { decisionOsContinuityDecisionThreadLabel } from "./decisionosNavigation";
import {
  trustAwareActionDecisionPatch,
  type DecisionWhyBullet,
  trustAwarePriorityDecisionPatch,
} from "./decisionOsContinuityDecisionBuilders";

export type DecisionOsTrustAwareDecision = {
  id: string;
  urgency: "urgent" | "high" | "medium" | "low";
  title: string;
  context: string;
  impact: "high" | "medium" | "low";
  effort: string;
  options: Array<{
    id: string;
    label: string;
    detail?: string;
    aiRecommended?: boolean;
  }>;
  whyBullets?: DecisionWhyBullet[];
  confidence?: number;
  confidenceReason?: string;
} & Partial<{
  durationScope: "day" | "week" | "month" | "year";
  whyMatters: string;
  contextItems: Array<{
    type: "email" | "calendar" | "note" | "person";
    icon: string;
    title: string;
    snippet?: string;
    time?: string;
    sourceUrl?: string;
    sourceType?: "thread" | "email" | "note";
    sourceRefs?: string[];
    relationPath?: string[];
  }>;
}>;

export function buildTrustAwarePriorityDecision(
  card: DecisionOsPriorityCard,
  contextPanelItems: DecisionOsContextPanelItem[] = [],
): DecisionOsTrustAwareDecision {
  const decision: DecisionOsTrustAwareDecision = buildPriorityDecision(
    card,
    contextPanelItems,
  ) satisfies ContinuityPriorityDecision;
  const patch = trustAwarePriorityDecisionPatch(card, decisionOsContinuityDecisionThreadLabel(card));
  return applyDecisionContinuityPatch(decision, patch);
}

export function buildTrustAwareActionDecision(
  item: DecisionOsActionItem,
  contextPanelItems: DecisionOsContextPanelItem[] = [],
): DecisionOsTrustAwareDecision {
  const decision: DecisionOsTrustAwareDecision = buildActionDecision(
    item,
    contextPanelItems,
  ) satisfies ContinuityPriorityDecision;
  const patch = trustAwareActionDecisionPatch(item);
  return applyDecisionContinuityPatch(decision, patch);
}

function applyDecisionContinuityPatch(
  decision: DecisionOsTrustAwareDecision,
  patch: ReturnType<typeof trustAwarePriorityDecisionPatch> | ReturnType<typeof trustAwareActionDecisionPatch>,
): DecisionOsTrustAwareDecision {
  decision.whyBullets = patch.whyBullets;
  if (patch.confidence !== undefined) decision.confidence = patch.confidence;
  if (patch.confidenceReason !== undefined) decision.confidenceReason = patch.confidenceReason;
  if (patch.urgencyOverride) decision.urgency = patch.urgencyOverride;
  if (patch.effortOverride) decision.effort = patch.effortOverride;
  if (patch.openActionLabel && decision.options.length > 0) {
    decision.options[0] = {
      ...decision.options[0],
      label: patch.openActionLabel,
      detail: patch.openActionDetail ?? decision.options[0].detail,
    };
  }
  return decision;
}
