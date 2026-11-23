import { apiFetch } from "@/lib/api";
import type { DecisionCardModel } from "@/lib/decisionCardState";
import {
  buildPlanningUnifiedA2ui,
  type PlanningUnifiedInterventionA2ui,
} from "@/lib/planningUnifiedInterventionState";
import { safeWeddingUiText } from "@/lib/weddingHomeUiCopyState";

const FITS = ["satisfied", "conflict", "unknown"] as const;
const BUDGET_FITS = ["within_budget", "exceeds_budget", "uncertain", "unknown"] as const;
const BLOCKERS = [
  "interpretation_blocked",
  "response_not_current",
  "quotation_not_current",
  "evaluation_not_current",
  "evaluation_ambiguous",
  "constraint_evidence_invalid",
  "budget_evidence_invalid",
  "event_date_invalid",
  "reference_time_invalid",
] as const;

type Fit = (typeof FITS)[number];
type BudgetFit = (typeof BUDGET_FITS)[number];

export type PlanningVendorChangePreparation = {
  threadId: string;
  planId: string;
  responseId: string;
};

export type PlanningVendorChangeReview = {
  reviewId: string;
  responseRef: string;
  quotationVersionRef: string;
  options: Array<{
    optionRef: string;
    changeRef: string;
    label: string;
    sourceRef: string;
    constraintFit: Fit;
    aestheticFit: Fit;
    budgetFit: BudgetFit;
    hardConflict: boolean;
    unknownConstraintCount: number;
  }>;
  timing: Array<{
    changeRef: string;
    asOf: string;
    daysToEvent: number | null;
    explicitDeadline: string | null;
    daysToDeadline: number | null;
  }>;
  blockerCount: number;
};

export type PlanningVendorChangeA2ui = PlanningUnifiedInterventionA2ui;

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

function timestamp(value: unknown): string {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : "";
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function fit(value: unknown): Fit | null {
  const candidate = text(value) as Fit;
  return FITS.includes(candidate) ? candidate : null;
}

function budgetFit(value: unknown): BudgetFit | null {
  const candidate = text(value) as BudgetFit;
  return BUDGET_FITS.includes(candidate) ? candidate : null;
}

function optionLabel(value: unknown): string {
  const candidate = text(value);
  const money = /^([A-Z]{3}):(\d+)$/.exec(candidate);
  if (money) {
    const amountMinor = Number(money[2]);
    if (Number.isSafeInteger(amountMinor)) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: money[1],
        }).format(amountMinor / 100);
      } catch {
        return `${money[1]} ${(amountMinor / 100).toFixed(2)}`;
      }
    }
  }
  if (candidate === "included") return "Included in the updated quote";
  if (candidate === "excluded") return "Removed from the updated quote";
  return safeWeddingUiText(candidate.slice(0, 180), "Vendor-proposed option");
}

export function planningVendorChangeUiEnabled(
  env: Record<string, unknown> = import.meta.env,
): boolean {
  return ["1", "true", "yes", "on"].includes(
    text(env["VITE_PLANNING_VENDOR_CHANGES_ENABLED"]).toLowerCase(),
  );
}

export function planningVendorChangePrepareRequest(input: PlanningVendorChangePreparation) {
  return {
    path: "/planning/vendor-changes/prepare",
    body: {
      thread_id: input.threadId,
      plan_id: input.planId,
      response_id: input.responseId,
    },
  };
}

export function normalizePlanningVendorChangeReview(
  value: unknown,
): PlanningVendorChangeReview | null {
  const root = record(value);
  const bindings = record(root?.["bindings"]);
  const reviewId = identifier(root?.["review_id"]);
  const responseRef = identifier(bindings?.["response_ref"]);
  const quotationVersionRef = identifier(bindings?.["quotation_version_ref"]);
  const fingerprint = text(bindings?.["response_fingerprint"]);
  const rawOptions = Array.isArray(root?.["options"]) ? root.options.slice(0, 100) : null;
  const rawTiming = Array.isArray(root?.["timing"]) ? root.timing.slice(0, 100) : null;
  const rawBlockers = Array.isArray(root?.["blockers"]) ? root.blockers.slice(0, 100) : null;
  if (!reviewId || !responseRef || !quotationVersionRef || !/^[0-9a-f]{64}$/.test(fingerprint)
    || !rawOptions || !rawTiming || !rawBlockers || root?.["quotation_mutated"] !== false
    || root?.["requires_user_review"] !== true) return null;

  const options: PlanningVendorChangeReview["options"] = [];
  const optionIds = new Set<string>();
  for (const value of rawOptions) {
    const row = record(value);
    const replacement = record(row?.["replacement"]);
    const anchor = record(replacement?.["source_anchor"]);
    const optionRef = identifier(row?.["option_ref"]);
    const changeRef = identifier(row?.["change_ref"]);
    const sourceRef = identifier(anchor?.["source_version_id"]);
    const constraintFit = fit(row?.["constraint_fit"]);
    const aestheticFit = fit(row?.["aesthetic_fit"]);
    const optionBudgetFit = budgetFit(row?.["budget_fit"]);
    const unknowns = Array.isArray(row?.["unknown_constraint_refs"])
      ? row.unknown_constraint_refs.map(identifier)
      : null;
    if (!optionRef || !changeRef || !sourceRef || !constraintFit || !aestheticFit
      || !optionBudgetFit || typeof row?.["hard_conflict"] !== "boolean" || !unknowns
      || unknowns.some((item) => !item) || optionIds.has(optionRef)) return null;
    optionIds.add(optionRef);
    options.push({
      optionRef,
      changeRef,
      label: optionLabel(replacement?.["value"]),
      sourceRef,
      constraintFit,
      aestheticFit,
      budgetFit: optionBudgetFit,
      hardConflict: row.hard_conflict as boolean,
      unknownConstraintCount: unknowns.length,
    });
  }

  const timing: PlanningVendorChangeReview["timing"] = [];
  for (const value of rawTiming) {
    const row = record(value);
    const changeRef = identifier(row?.["change_ref"]);
    const asOf = timestamp(row?.["as_of"]);
    const daysToEvent = row?.["days_to_event"] == null ? null : integer(row?.["days_to_event"]);
    const explicitDeadline = row?.["explicit_deadline"] == null
      ? null
      : timestamp(row?.["explicit_deadline"]);
    const daysToDeadline = row?.["days_to_deadline"] == null
      ? null
      : integer(row?.["days_to_deadline"]);
    if (!changeRef || !asOf || (row?.["days_to_event"] != null && daysToEvent === null)
      || (row?.["explicit_deadline"] != null && !explicitDeadline)
      || (row?.["days_to_deadline"] != null && daysToDeadline === null)
      || (explicitDeadline === null && daysToDeadline !== null)) return null;
    timing.push({ changeRef, asOf, daysToEvent, explicitDeadline, daysToDeadline });
  }
  for (const value of rawBlockers) {
    const row = record(value);
    if (!BLOCKERS.includes(text(row?.["kind"]) as (typeof BLOCKERS)[number])) return null;
  }
  return { reviewId, responseRef, quotationVersionRef, options, timing, blockerCount: rawBlockers.length };
}

function fitLabel(value: Fit): string {
  if (value === "satisfied") return "Matches saved preferences";
  if (value === "conflict") return "Conflicts with a saved preference";
  return "Preference fit still to check";
}

function budgetLabel(value: BudgetFit): string {
  if (value === "within_budget") return "Within current budget headroom";
  if (value === "exceeds_budget") return "Above current budget headroom";
  if (value === "uncertain") return "Budget outcome depends on the current range";
  return "Budget impact still to check";
}

function timingLabel(value: PlanningVendorChangeReview): string | null {
  const days = value.timing
    .map((item) => item.daysToDeadline)
    .filter((item): item is number => item !== null)
    .sort((left, right) => left - right)[0];
  if (days == null) return null;
  if (days < 0) return "The vendor's stated decision date has passed";
  if (days === 0) return "The vendor's stated decision date is today";
  return `${days} day${days === 1 ? "" : "s"} until the vendor's stated decision date`;
}

function unknownLabels(value: PlanningVendorChangeReview): string[] {
  const labels = new Set<string>();
  if (value.blockerCount > 0) labels.add("Part of this update needs checking before you decide.");
  if (value.options.some((item) => item.constraintFit === "unknown")) {
    labels.add("One or more saved requirements still need checking against these options.");
  }
  if (value.options.some((item) => item.aestheticFit === "unknown")) {
    labels.add("Style or palette fit is not confirmed for every option.");
  }
  if (value.options.some((item) => item.budgetFit === "unknown" || item.budgetFit === "uncertain")) {
    labels.add("The exact budget impact is not confirmed for every option.");
  }
  return [...labels];
}

export function planningVendorChangeDecisionCard(
  value: PlanningVendorChangeReview,
): DecisionCardModel {
  const timing = timingLabel(value);
  const hasHardConflict = value.options.some((item) => item.hardConflict);
  const exceedsBudget = value.options.some((item) => item.budgetFit === "exceeds_budget");
  const why = value.options.length === 0
    ? "The vendor changed part of the current quote. Review the update before deciding."
    : `The vendor proposed ${value.options.length} updated option${value.options.length === 1 ? "" : "s"}. Your active quote remains unchanged.`;
  return {
    schema: "content.decision_card",
    pattern: "review",
    patternVersion: "1.0",
    id: value.reviewId,
    title: "Review the vendor's quote update",
    domain: "wedding",
    pressure: hasHardConflict || exceedsBudget ? "high" : timing ? "medium" : "low",
    whyItMatters: `${why}${timing ? ` ${timing}.` : ""}`,
    recommendation: null,
    actions: [{
      id: "open_vendor_change_review",
      label: "Review update",
      role: "primary",
      effect: "Opens the current quote review; nothing is accepted, sent, booked or paid",
      intent: "open_vendor_change_review",
    }],
    evidence: [{
      label: "Latest vendor response and active quote checked",
      ref: value.responseRef,
      sourceKind: "vendor_response",
      freshness: "current",
    }],
    confidence: {
      label: "Current response and quote checked",
      reason: "Unknown preference, style and budget details remain clearly marked.",
    },
    timeSensitivity: timing ? { label: timing } : null,
    visual: { kind: "none" },
    unknowns: unknownLabels(value),
    patternSlots: {
      changeSummary: `${value.options.length} vendor-proposed option${value.options.length === 1 ? "" : "s"}`,
      options: value.options.map((item) => ({
        id: item.optionRef,
        name: item.label,
        summary: `${fitLabel(item.constraintFit)}. ${budgetLabel(item.budgetFit)}.`,
        recommended: false,
      })),
    },
    verification: { status: "partial", label: "Vendor response and active quote checked" },
  };
}

export function planningVendorChangeA2ui(
  value: PlanningVendorChangeReview,
): PlanningVendorChangeA2ui {
  const card = planningVendorChangeDecisionCard(value);
  return buildPlanningUnifiedA2ui({
    card,
    presentation: {
      timingLabel: timingLabel(value) ?? "No vendor decision date recorded",
      constraintLabels: value.options.map((item) => ({
        label: item.label,
        status: item.constraintFit,
      })),
    },
    preparedOnly: true,
  });
}

export async function preparePlanningVendorChange(
  input: PlanningVendorChangePreparation,
): Promise<PlanningVendorChangeReview> {
  const request = planningVendorChangePrepareRequest(input);
  const review = normalizePlanningVendorChangeReview(await apiFetch<unknown>(request.path, {
    method: "POST",
    bodyJson: request.body,
  }));
  if (!review) throw new Error("invalid vendor change review response");
  return review;
}

export function planningVendorChangeUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/401|unauthori|sign in/.test(message)) return "Sign in again to review this vendor update.";
  if (/404|not available|not found/.test(message)) return "This vendor update is not available yet.";
  if (/409|stale|revision|changed|conflict/.test(message)) {
    return "The quote or vendor response changed. Refresh before reviewing it.";
  }
  return "We could not check this vendor update just now. Try again in a moment.";
}
