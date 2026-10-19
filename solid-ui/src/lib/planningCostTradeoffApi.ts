import { apiFetch } from "@/lib/api";
import type { DecisionCardModel } from "@/lib/decisionCardState";
import {
  buildPlanningUnifiedA2ui,
  type PlanningUnifiedInterventionA2ui,
} from "@/lib/planningUnifiedInterventionState";

export type PlanningCostTradeoffPreparation = {
  threadId: string;
  planId: string;
  budgetRevisionRef: string;
  comparisonId: string;
  quotationVersionId: string;
  candidateCategoryRef: string;
};

export type PlanningMoneyRange = {
  minimumMinor: number;
  maximumMinor: number;
  currency: string;
  evidenceRefs: string[];
};

export type PlanningCostTradeoffAdvice = {
  tradeoffId: string;
  candidateDecisionRef: string;
  incrementalCostMinor: number | null;
  currency: string;
  forecastBefore: PlanningMoneyRange;
  forecastAfter: PlanningMoneyRange | null;
  offsets: Array<{
    id: string;
    categoryRef: string;
    savingRange: PlanningMoneyRange;
    evidenceRefs: string[];
  }>;
  uncontractedCategoryRefs: string[];
  unresolvedFeeDriverCount: number;
  exceedsBudget: boolean;
  requiresAcknowledgement: boolean;
  bindings: {
    candidateRevisionRef: string;
    budgetRevisionRef: string;
    constraintRevisionRefs: string[];
    sourceRevisionRefs: string[];
  };
};

export type PlanningCostTradeoffA2ui = PlanningUnifiedInterventionA2ui;

const CATEGORY_LABELS: Record<string, string> = {
  venue_ceremony: "Venue and ceremony",
  catering_drinks: "Catering and drinks",
  photo_video: "Photography and video",
  attire_beauty: "Attire and beauty",
  flowers_decor: "Flowers and decor",
  entertainment_music: "Entertainment and music",
  other_misc: "Stationery, transport and other costs",
  transport: "Transport",
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identifier(value: unknown): string {
  const candidate = text(value);
  return candidate && candidate.length <= 180 && !/\s|@/.test(candidate) ? candidate : "";
}

function identifiers(value: unknown, maximum = 100): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const values = value.map(identifier);
  return values.every(Boolean) ? values : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function currency(value: unknown): string {
  const candidate = text(value);
  return /^[A-Z]{3}$/.test(candidate) ? candidate : "";
}

function moneyRange(value: unknown, expectedCurrency?: string): PlanningMoneyRange | null {
  const row = record(value);
  const minimumMinor = integer(row?.["minimum_minor"]);
  const maximumMinor = integer(row?.["maximum_minor"]);
  const rangeCurrency = currency(row?.["currency"]);
  const evidenceRefs = identifiers(row?.["evidence_refs"], 20);
  if (minimumMinor === null || maximumMinor === null || minimumMinor > maximumMinor
    || !rangeCurrency || (expectedCurrency && rangeCurrency !== expectedCurrency)
    || !evidenceRefs?.length) return null;
  return { minimumMinor, maximumMinor, currency: rangeCurrency, evidenceRefs };
}

function preparationBody(input: PlanningCostTradeoffPreparation): Record<string, string> {
  return {
    thread_id: input.threadId,
    plan_id: input.planId,
    budget_revision_ref: input.budgetRevisionRef,
    comparison_id: input.comparisonId,
    quotation_version_id: input.quotationVersionId,
    candidate_category_ref: input.candidateCategoryRef,
  };
}

function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? "Another part of the plan";
}

function formatMoney(minor: number, valueCurrency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: valueCurrency,
      maximumFractionDigits: 0,
    }).format(minor / 100);
  } catch {
    return `${valueCurrency} ${(minor / 100).toFixed(0)}`;
  }
}

function rangeLabel(value: PlanningMoneyRange): string {
  if (value.minimumMinor === value.maximumMinor) {
    return formatMoney(value.minimumMinor, value.currency);
  }
  return `${formatMoney(value.minimumMinor, value.currency)} to ${formatMoney(value.maximumMinor, value.currency)}`;
}

export function planningCostTradeoffUiEnabled(
  env: Record<string, unknown> = import.meta.env,
): boolean {
  return ["1", "true", "yes", "on"].includes(
    text(env["VITE_PLANNING_COST_TRADEOFFS_ENABLED"]).toLowerCase(),
  );
}

export function planningCostTradeoffPrepareRequest(input: PlanningCostTradeoffPreparation) {
  return { path: "/planning/cost-tradeoffs/prepare", body: preparationBody(input) };
}

export function planningCostTradeoffAcknowledgeRequest(input: {
  preparation: PlanningCostTradeoffPreparation;
  idempotencyKey: string;
}) {
  return {
    path: "/planning/cost-tradeoffs/acknowledge",
    body: {
      preparation: preparationBody(input.preparation),
      idempotency_key: input.idempotencyKey,
    },
  };
}

export function normalizePlanningCostTradeoffAdvice(
  value: unknown,
): PlanningCostTradeoffAdvice | null {
  const root = record(value);
  const tradeoff = record(root?.["tradeoff"]);
  const bindings = record(root?.["bindings"]);
  const incremental = record(tradeoff?.["incremental_cost"]);
  const exactAmount = record(incremental?.["amount"]);
  const state = text(incremental?.["state"]);
  const forecastBefore = moneyRange(tradeoff?.["forecast_before"]);
  const adviceCurrency = forecastBefore?.currency ?? "";
  const forecastAfter = tradeoff?.["forecast_after"] == null
    ? null
    : moneyRange(tradeoff?.["forecast_after"], adviceCurrency);
  const tradeoffId = identifier(tradeoff?.["tradeoff_id"]);
  const candidateDecisionRef = identifier(tradeoff?.["candidate_decision_ref"]);
  const candidateRevisionRef = identifier(bindings?.["candidate_revision_ref"]);
  const budgetRevisionRef = identifier(bindings?.["budget_revision_ref"]);
  const constraintRevisionRefs = identifiers(bindings?.["constraint_revision_refs"]);
  const sourceRevisionRefs = identifiers(bindings?.["source_revision_refs"]);
  const uncontractedCategoryRefs = identifiers(root?.["uncontracted_category_refs"], 50);
  const unresolvedFeeDriverRefs = identifiers(root?.["unresolved_fee_driver_refs"], 50);
  if (!tradeoffId || !candidateDecisionRef || !candidateRevisionRef || !budgetRevisionRef
    || !forecastBefore || (tradeoff?.["forecast_after"] != null && !forecastAfter)
    || !constraintRevisionRefs || !sourceRevisionRefs
    || !uncontractedCategoryRefs || !unresolvedFeeDriverRefs
    || !["exact", "unknown"].includes(state)) return null;
  const incrementalCostMinor = state === "exact" ? integer(exactAmount?.["amount_minor"]) : null;
  const incrementalCurrency = state === "exact" ? currency(exactAmount?.["currency"]) : adviceCurrency;
  if ((state === "exact" && incrementalCostMinor === null) || incrementalCurrency !== adviceCurrency) return null;

  const rawOffsets = Array.isArray(tradeoff?.["offset_options"])
    ? tradeoff.offset_options.slice(0, 20)
    : [];
  const offsets = rawOffsets.flatMap((value) => {
    const row = record(value);
    const id = identifier(row?.["option_id"]);
    const categoryRef = identifier(row?.["category_ref"]);
    const savingRange = moneyRange(row?.["saving_range"], adviceCurrency);
    const evidenceRefs = identifiers(row?.["evidence_refs"], 20);
    return id && categoryRef && savingRange && evidenceRefs?.length
      ? [{ id, categoryRef, savingRange, evidenceRefs }]
      : [];
  });
  if (offsets.length !== rawOffsets.length) return null;
  const exceedsBudget = root?.["exceeds_budget"] === true;
  const requiresAcknowledgement = root?.["requires_acknowledgement"] === true;
  if (requiresAcknowledgement !== exceedsBudget) return null;
  return {
    tradeoffId,
    candidateDecisionRef,
    incrementalCostMinor,
    currency: adviceCurrency,
    forecastBefore,
    forecastAfter,
    offsets,
    uncontractedCategoryRefs,
    unresolvedFeeDriverCount: unresolvedFeeDriverRefs.length,
    exceedsBudget,
    requiresAcknowledgement,
    bindings: {
      candidateRevisionRef,
      budgetRevisionRef,
      constraintRevisionRefs,
      sourceRevisionRefs,
    },
  };
}

export function planningCostTradeoffDecisionCard(
  value: PlanningCostTradeoffAdvice,
): DecisionCardModel {
  const forecast = value.forecastAfter
    ? `This choice puts the current forecast at ${rangeLabel(value.forecastAfter)}.`
    : "The final cost of this choice still needs confirming.";
  const unknowns = [
    ...value.uncontractedCategoryRefs.map(
      (category) => `${categoryLabel(category)} is not contracted yet.`,
    ),
    ...(value.unresolvedFeeDriverCount > 0
      ? [`${value.unresolvedFeeDriverCount} fee detail${value.unresolvedFeeDriverCount === 1 ? " still needs" : "s still need"} confirming.`]
      : []),
  ];
  const actions = value.requiresAcknowledgement
    ? [
      {
        id: "acknowledge_cost_impact",
        label: "I understand - keep this option",
        role: "primary" as const,
        effect: "Records that you reviewed this exact budget impact; it does not book or pay",
        intent: "acknowledge_cost_impact",
      },
      {
        id: "review_budget",
        label: "Review budget first",
        role: "secondary" as const,
        effect: "Returns to the budget without changing the quote or allocation",
        intent: "review_budget",
      },
    ]
    : [{
      id: "continue_with_choice",
      label: "Keep this option",
      role: "primary" as const,
      effect: "Continues the decision flow; it does not book or pay",
      intent: "continue_with_choice",
    }];
  return {
    schema: "content.decision_card",
    pattern: "choose",
    patternVersion: "1.0",
    id: value.tradeoffId,
    title: value.exceedsBudget ? "This choice goes over your current budget" : "Budget impact checked",
    domain: "wedding",
    pressure: value.exceedsBudget ? "high" : "low",
    whyItMatters: `${forecast} Nothing is reallocated, booked or paid automatically.`,
    recommendation: value.offsets.length
      ? {
        summary: `Review flexibility in ${categoryLabel(value.offsets[0]!.categoryRef)}`,
        reasons: [`Current evidence suggests ${rangeLabel(value.offsets[0]!.savingRange)} of flexibility.`],
      }
      : null,
    actions,
    evidence: [{
      label: forecast,
      ref: value.bindings.budgetRevisionRef,
      sourceKind: "current_budget",
      freshness: "current",
    }],
    confidence: {
      label: value.incrementalCostMinor === null ? "Cost still being confirmed" : "Current quote and budget checked",
      reason: value.incrementalCostMinor === null
        ? "No exact cost is shown until the current evidence supports one."
        : `Current quoted cost: ${formatMoney(value.incrementalCostMinor, value.currency)}.`,
    },
    timeSensitivity: null,
    visual: { kind: "none" },
    unknowns,
    patternSlots: {
      options: value.offsets.map((offset, index) => ({
        id: offset.id,
        name: `${categoryLabel(offset.categoryRef)}: ${rangeLabel(offset.savingRange)}`,
        recommended: index === 0,
      })),
    },
    verification: { status: "partial", label: "Current budget and quote revisions checked" },
  };
}

export function planningCostTradeoffA2ui(
  value: PlanningCostTradeoffAdvice,
): PlanningCostTradeoffA2ui {
  const card = planningCostTradeoffDecisionCard(value);
  return buildPlanningUnifiedA2ui({
    card,
    presentation: {
      costRangeLabel: value.forecastAfter
        ? `Forecast after this choice: ${rangeLabel(value.forecastAfter)}`
        : "Final cost still to confirm",
    },
  });
}

export async function preparePlanningCostTradeoff(
  input: PlanningCostTradeoffPreparation,
): Promise<PlanningCostTradeoffAdvice> {
  const request = planningCostTradeoffPrepareRequest(input);
  const advice = normalizePlanningCostTradeoffAdvice(await apiFetch<unknown>(request.path, {
    method: "POST",
    bodyJson: request.body,
  }));
  if (!advice) throw new Error("invalid cost advice response");
  return advice;
}

export async function acknowledgePlanningCostTradeoff(input: {
  preparation: PlanningCostTradeoffPreparation;
  idempotencyKey: string;
}): Promise<{ inserted: boolean; messageId: string; advanceAllowed: boolean }> {
  const request = planningCostTradeoffAcknowledgeRequest(input);
  const response = record(await apiFetch<unknown>(request.path, {
    method: "POST",
    bodyJson: request.body,
  }));
  const messageId = identifier(response?.["message_id"]);
  if (!messageId || typeof response?.["inserted"] !== "boolean"
    || response?.["advance_allowed"] !== true) throw new Error("invalid cost acknowledgement response");
  return { inserted: response.inserted as boolean, messageId, advanceAllowed: true };
}

export function planningCostTradeoffUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/401|unauthori|sign in/.test(message)) return "Sign in again to check this budget impact.";
  if (/404|not available|not found/.test(message)) return "Budget advice is not available yet.";
  if (/409|stale|revision|changed/.test(message)) return "Your budget or quote changed. Refresh before deciding.";
  return "We could not check this budget impact just now. Try again in a moment.";
}
