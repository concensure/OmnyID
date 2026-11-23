// @module-id: wedding.plan-variable-change-state
// @primary-capability: turn material plan revisions into evidence-led dependent decisions
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import {
  weddingBudgetAllocationHistoryFromDecisionRecords,
  type WeddingBudgetAllocationSummary,
} from "@/lib/weddingBudgetAllocationState";
import type { WeddingBudgetLineItem, WeddingBudgetTrackingState } from "@/lib/weddingBudgetTrackingState";
import type { WeddingNeedToKnowProjectionContext } from "@/lib/weddingNeedToKnowAfpProjectionState";
import type { WeddingPersistedDecisionRecord } from "@/lib/weddingPersistedWorkspaceState";

export type WeddingPlanVariableChangeTaskInput = {
  contextItems?: readonly WeddingNeedToKnowProjectionContext[] | null;
  decisionRecords?: readonly WeddingPersistedDecisionRecord[] | null;
  budgetTracking?: WeddingBudgetTrackingState | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  metadata?: unknown;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  const match = clean(value).replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
}

export function weddingPlanningContextNumber(
  contexts: readonly WeddingNeedToKnowProjectionContext[] | null | undefined,
  key: "guestCount" | "budgetComfort",
): number | null {
  for (const context of contexts ?? []) {
    const value = numeric(context.planningContext?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function money(amount: number, currency = "AUD"): string {
  if (currency.toUpperCase() === "AUD") return `A$${Math.round(amount).toLocaleString("en-AU")}`;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function settled(task: WeddingPlanningTaskItem | undefined): boolean {
  if (!task) return false;
  const metadata = record(task.metadata);
  return task.approvalState === "archived"
    || metadata.decision_settled === true
    || metadata.task_completed === true
    || metadata.completed === true
    || (task.semanticTags ?? []).some((tag) => /wedding_task_status:(done|completed|settled)/i.test(tag));
}

function guestCountHistory(contexts: readonly WeddingNeedToKnowProjectionContext[]): number[] {
  const counts: number[] = [];
  for (const context of contexts) {
    const count = numeric(context.planningContext?.guestCount);
    if (count !== null && counts[counts.length - 1] !== count) counts.push(count);
  }
  return counts;
}

const GUEST_SENSITIVE_CATEGORY = /venue|cater|food|drink|bar|beverage|transport|shuttle|bus|hire|rental|stationery|invitation|accommodation|hotel/i;

function guestSensitiveLines(lines: readonly WeddingBudgetLineItem[]): WeddingBudgetLineItem[] {
  return lines.filter((line) => GUEST_SENSITIVE_CATEGORY.test(`${line.categoryLabel} ${line.vendorName} ${line.rowCells.join(" ")}`));
}

function explicitGuestThreshold(lines: readonly WeddingBudgetLineItem[], previous: number): { count: number; label: string } | null {
  for (const line of lines) {
    const terms = line.rowCells.join(" ");
    const percent = terms.match(/(?:change|variation|increase|decrease|number|guest|headcount)[^.%]{0,40}(\d{1,2})\s*%/i)
      ?? terms.match(/(\d{1,2})\s*%[^.]{0,40}(?:change|variation|guest|headcount)/i);
    if (percent) {
      const value = Math.max(1, Math.ceil(previous * Number(percent[1]) / 100));
      return { count: value, label: `${line.vendorName || line.categoryLabel} terms mention a ${percent[1]}% guest-number threshold` };
    }
    const people = terms.match(/(?:change|variation|increase|decrease)[^.]{0,35}(\d{1,3})\s*(?:people|persons|guests)/i);
    if (people) return { count: Number(people[1]), label: `${line.vendorName || line.categoryLabel} terms mention ${people[1]} guests` };
  }
  return null;
}

function guestChangeTask(input: WeddingPlanVariableChangeTaskInput): WeddingPlanningTaskItem | null {
  const counts = guestCountHistory(input.contextItems ?? []);
  const [current, previous] = counts;
  if (!current || !previous) return null;
  const difference = current - previous;
  const absoluteDifference = Math.abs(difference);
  const affected = guestSensitiveLines(input.budgetTracking?.lineItems ?? []);
  if (affected.length === 0) return null;
  const explicit = explicitGuestThreshold(affected, previous);
  const defaultMaterial = absoluteDifference >= 20 || (absoluteDifference >= 10 && absoluteDifference / previous >= 0.2);
  if (explicit ? absoluteDifference < explicit.count : !defaultMaterial) return null;
  const id = `wedding_plan_change:guest_count:${previous}-${current}`;
  if (settled((input.existingTaskItems ?? []).find((task) => task.id === id))) return null;
  const vendors = unique(affected.map((line) => clean(line.vendorName) || clean(line.categoryLabel)).filter(Boolean)).slice(0, 4);
  const direction = difference > 0 ? "increased" : "decreased";
  const thresholdLabel = explicit?.label
    ?? "Planning safeguard: at least 20 guests, or at least 10 guests and 20% of the prior count";
  const sourceRefs = unique(affected.map((line) => clean(line.linkedArtifactId) || `budget_line:${line.id}`).filter(Boolean)).slice(0, 8);
  return {
    id,
    title: `Reconfirm ${current} guests with ${vendors.length === 1 ? vendors[0] : "affected vendors"}`,
    kind: "vendor_follow_up",
    priority: "high",
    source: "agent",
    approvalState: "pending_user_approval",
    linkedArtifactId: affected[0]?.linkedArtifactId ?? null,
    notes: `Guest count ${direction} by ${absoluteDifference}, from ${previous} to ${current}. Review capacity, minimum spend, staffing and per-person pricing before any vendor message is sent.`,
    metadata: {
      ...record(input.metadata),
      plan_variable_change_decision: true,
      plan_variable_change_kind: "guest_count",
      plan_variable_change_recommendation_supported: sourceRefs.length > 0,
      decision_question: `Should you ask ${vendors.join(", ")} to reconfirm the plan for ${current} guests?`,
      decision_option_ids: ["prepare_vendor_check", "review_guest_list", "keep_current_basis"],
      decision_option_labels: ["Prepare vendor check", "Review the guest list first", `Keep ${previous} as the vendor basis`],
      decision_option_summaries: [
        `Prepare one approval-gated check covering capacity, pricing, minimums and staffing for ${current} guests. Nothing is sent yet.`,
        "Resolve possible additions, removals or duplicates before asking vendors to reprice.",
        `Keep vendors working from ${previous} guests for now and leave the revised count unconfirmed.`,
      ],
      evidence_labels: [
        `Guest count ${direction}: ${previous} → ${current} (${difference > 0 ? "+" : ""}${difference})`,
        thresholdLabel,
        `Affected vendors: ${vendors.join(", ")}`,
      ],
      source_refs: sourceRefs,
      requirements_confirmed: true,
      selected_option_confirmed: true,
      approval_required: true,
      guest_count_previous: previous,
      guest_count_current: current,
      guest_count_delta: difference,
      affected_vendor_names: vendors,
    },
    semanticTags: ["wedding", "wedding_plan_change", "wedding_plan_change:guest_count", "approval_required"],
  };
}

function preferenceText(contexts: readonly WeddingNeedToKnowProjectionContext[]): string {
  const latest = contexts[0]?.planningContext;
  return [
    ...(latest?.topPriorities ?? []),
    latest?.atmosphereDescription,
    latest?.vendorPreferences,
    latest?.photographyScope,
  ].map(clean).filter(Boolean).join(" ").toLowerCase();
}

function categoryChange(current: WeddingBudgetAllocationSummary, previous: WeddingBudgetAllocationSummary, label: string): number {
  const key = label.toLowerCase();
  const find = (summary: WeddingBudgetAllocationSummary) => summary.categories.find((category) => (
    key.includes(category.categoryLabel.toLowerCase())
    || category.categoryLabel.toLowerCase().includes(key)
    || key.includes(category.categoryId.replace(/_/g, " "))
  ))?.amount ?? 0;
  return find(previous) - find(current);
}

function preferencePenalty(line: WeddingBudgetLineItem, preferences: string): number {
  if (!preferences) return 0;
  const words = `${line.categoryLabel} ${line.vendorName}`.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  return words.some((word) => preferences.includes(word)) ? 100000 : 0;
}

function rankedBudgetLines(
  lines: readonly WeddingBudgetLineItem[],
  current: WeddingBudgetAllocationSummary,
  previous: WeddingBudgetAllocationSummary,
  preferences: string,
): WeddingBudgetLineItem[] {
  return lines
    .filter((line) => line.amount !== null && line.amount > 0)
    .slice()
    .sort((left, right) => {
      const score = (line: WeddingBudgetLineItem) => (
        categoryChange(current, previous, line.categoryLabel) * 4
        + (line.priceStatus === "projected" ? 2000 : 0)
        + (line.amount ?? 0) * 0.05
        - preferencePenalty(line, preferences)
      );
      return score(right) - score(left);
    });
}

function budgetChangeTask(input: WeddingPlanVariableChangeTaskInput): WeddingPlanningTaskItem | null {
  const history = weddingBudgetAllocationHistoryFromDecisionRecords(input.decisionRecords ?? []);
  const [current, previous] = history;
  if (!current || !previous || current.totalAmount >= previous.totalAmount) return null;
  const reduction = previous.totalAmount - current.totalAmount;
  const id = `wedding_plan_change:budget:${previous.totalAmount}-${current.totalAmount}`;
  if (settled((input.existingTaskItems ?? []).find((task) => task.id === id))) return null;
  const preferences = preferenceText(input.contextItems ?? []);
  const candidates = rankedBudgetLines(input.budgetTracking?.lineItems ?? [], current, previous, preferences).slice(0, 3);
  if (candidates.length === 0) return null;
  const optionIds = candidates.map((line) => `review_${line.id}`);
  const optionLabels = candidates.map((line) => `${line.priceStatus === "quoted" ? "Negotiate" : "Reduce or defer"} ${clean(line.vendorName) || clean(line.categoryLabel)}`);
  const optionSummaries = candidates.map((line) => {
    const allocationDrop = categoryChange(current, previous, line.categoryLabel);
    const fit = allocationDrop > 0 ? ` The couple reduced this category by ${money(allocationDrop, current.currency)}.` : " It is not named as a saved top priority.";
    return `${money(line.amount ?? 0, line.currency)} ${line.priceStatus} cost.${fit} Check scope, cancellation and deposit terms before changing it.`;
  });
  const sourceRefs = unique(candidates.map((line) => clean(line.linkedArtifactId) || `budget_line:${line.id}`).filter(Boolean));
  const preferenceEvidence = clean(preferences)
    ? "Saved priorities and wedding vision protect matching categories from the first recommendation"
    : "No saved priority clearly protects one category; confirm what matters most before cutting";
  return {
    id,
    title: `Choose how to absorb the ${money(reduction, current.currency)} budget reduction`,
    kind: "budget_review",
    priority: "high",
    source: "agent",
    approvalState: "pending_user_approval",
    linkedArtifactId: candidates[0]?.linkedArtifactId ?? null,
    notes: "Compare one scope reduction or negotiation at a time. The card records a preference only; it cannot cancel a vendor or send a negotiation without approval.",
    metadata: {
      ...record(input.metadata),
      plan_variable_change_decision: true,
      plan_variable_change_kind: "budget_reduction",
      plan_variable_change_recommendation_supported: Boolean(preferences && sourceRefs.length > 0),
      decision_question: `Which commitment should you review first after lowering the budget by ${money(reduction, current.currency)}?`,
      decision_option_ids: [...optionIds, "keep_open"],
      decision_option_labels: [...optionLabels, "Keep the trade-off open"],
      decision_option_summaries: [...optionSummaries, "Save no cut yet and add or confirm priorities before changing vendor scope."],
      evidence_labels: [
        `Total budget lowered: ${money(previous.totalAmount, current.currency)} → ${money(current.totalAmount, current.currency)}`,
        `Reduction to absorb: ${money(reduction, current.currency)}`,
        preferenceEvidence,
      ],
      source_refs: sourceRefs,
      requirements_confirmed: true,
      selected_option_confirmed: true,
      approval_required: true,
      budget_previous_total: previous.totalAmount,
      budget_current_total: current.totalAmount,
      budget_reduction_amount: reduction,
      saved_preference_text: preferences,
    },
    semanticTags: ["wedding", "wedding_plan_change", "wedding_plan_change:budget_reduction", "approval_required"],
  };
}

export function buildWeddingPlanVariableChangeTaskItems(input: WeddingPlanVariableChangeTaskInput): WeddingPlanningTaskItem[] {
  return [guestChangeTask(input), budgetChangeTask(input)].filter((task): task is WeddingPlanningTaskItem => task !== null);
}
