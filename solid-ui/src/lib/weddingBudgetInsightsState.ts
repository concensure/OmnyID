// @locs-version: 1.0
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingBudgetAllocationCategoryAmount } from "@/lib/weddingBudgetAllocationState";
import type {
  WeddingBudgetLineItem,
  WeddingBudgetPaymentTaskCandidate,
} from "@/lib/weddingBudgetTrackingState";

export type WeddingBudgetQuoteNormalForm = {
  id: string;
  vendorName: string;
  categoryLabel: string;
  basePriceLabel: string;
  includedLabel: string;
  hoursLabel: string;
  guestUnitLabel: string;
  addOnsLabel: string;
  taxLabel: string;
  serviceFeeLabel: string;
  travelFeeLabel: string;
  overtimeLabel: string;
  cancellationLabel: string;
  depositScheduleLabel: string;
  missingLabels: string[];
};

export type WeddingBudgetMonthlyCashNeed = {
  monthLabel: string;
  amount: number;
  currency: string;
  itemCount: number;
};

export type WeddingBudgetScenario = {
  id: "safe" | "balanced" | "stretch";
  label: string;
  targetAmount: number | null;
  remainingAmount: number | null;
  summaryLabel: string;
};

export type WeddingBudgetContribution = {
  personLabel: string;
  amountLabel: string;
  conditionLabel: string;
};

export type WeddingBudgetInsightsState = {
  committedAmount: number;
  estimatedAmount: number;
  paidAmount: number;
  remainingAmount: number | null;
  atRiskAmount: number;
  feeCoverageLabels: string[];
  missingContextLabels: string[];
  quoteNormalForms: WeddingBudgetQuoteNormalForm[];
  monthlyCashNeeds: WeddingBudgetMonthlyCashNeed[];
  scenarios: WeddingBudgetScenario[];
  unaffordableWarningLabels: string[];
  contributionRows: WeddingBudgetContribution[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function moneyValue(text: string): number | null {
  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/(?:\$|aud|usd|gbp|eur)?\s*(\d{2,8})(?:\.\d+)?/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function moneyLabel(amount: number | null, currency = "AUD"): string {
  return amount === null
    ? "Ask vendor"
    : amount.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
}

function firstMatch(text: string, pattern: RegExp, fallback = "Ask vendor"): string {
  const match = text.match(pattern);
  return clean(match?.[1]) || fallback;
}

function labelForFee(text: string, words: RegExp, fallback = "Ask vendor"): string {
  const sentence = text.split(/[.;\n]/).find((part) => words.test(part));
  return clean(sentence) || fallback;
}

function quoteNormalForm(item: WeddingBudgetLineItem): WeddingBudgetQuoteNormalForm {
  const text = [item.vendorName, item.categoryLabel, ...item.rowCells].map(clean).join(" ");
  const baseAmount = item.amount ?? moneyValue(text);
  const form: WeddingBudgetQuoteNormalForm = {
    id: item.id,
    vendorName: item.vendorName,
    categoryLabel: item.categoryLabel,
    basePriceLabel: moneyLabel(baseAmount, item.currency),
    includedLabel: firstMatch(text, /\b(?:includes?|included|package includes?)[:\s-]+([^.;|]+)/i),
    hoursLabel: firstMatch(text, /\b(\d+(?:\.\d+)?\s*(?:hour|hr)s?)\b/i),
    guestUnitLabel: firstMatch(text, /\b(\d+\s*(?:guests?|people|pax)|per\s+(?:guest|person|head|unit)[^.;|]*)/i),
    addOnsLabel: labelForFee(text, /\b(add-?ons?|extras?|upgrade|optional)\b/i),
    taxLabel: labelForFee(text, /\b(tax|gst|vat)\b/i),
    serviceFeeLabel: labelForFee(text, /\b(service\s*(?:fee|charge)|surcharge)\b/i),
    travelFeeLabel: labelForFee(text, /\b(travel|parking|delivery|freight)\b/i),
    overtimeLabel: labelForFee(text, /\b(overtime|extra\s*hour)\b/i),
    cancellationLabel: labelForFee(text, /\b(cancel|refund|non-refundable|postpone)\b/i),
    depositScheduleLabel: labelForFee(text, /\b(deposit|instalment|installment|payment schedule|balance due)\b/i),
    missingLabels: [],
  };
  form.missingLabels = [
    form.includedLabel === "Ask vendor" ? "what is included" : null,
    form.hoursLabel === "Ask vendor" ? "hours" : null,
    form.taxLabel === "Ask vendor" ? "tax/GST" : null,
    form.serviceFeeLabel === "Ask vendor" ? "service fee" : null,
    form.travelFeeLabel === "Ask vendor" ? "travel or delivery fee" : null,
    form.overtimeLabel === "Ask vendor" ? "overtime" : null,
    form.cancellationLabel === "Ask vendor" ? "cancellation terms" : null,
    form.depositScheduleLabel === "Ask vendor" ? "deposit and payment schedule" : null,
  ].filter((label): label is string => Boolean(label));
  return form;
}

function rowText(artifact: WeddingArtifactInput): string {
  return [
    clean(artifact.title),
    clean(artifact.bodyText),
    ...(artifact.sourceLabels ?? []).map(clean),
  ].join("\n");
}

function paidAmountFromArtifacts(artifacts: readonly WeddingArtifactInput[]): number {
  return artifacts
    .filter((artifact) => artifact.kind === "budget_sheet")
    .flatMap((artifact) => rowText(artifact).split(/\r?\n/))
    .filter((line) => /\bpaid\b/i.test(line))
    .reduce((sum, line) => sum + (moneyValue(line) ?? 0), 0);
}

function monthLabelFromIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T09:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function monthlyCashNeeds(candidates: readonly WeddingBudgetPaymentTaskCandidate[], currency: string): WeddingBudgetMonthlyCashNeed[] {
  const map = new Map<string, WeddingBudgetMonthlyCashNeed & { sortKey: string }>();
  for (const candidate of candidates) {
    const amount = moneyValue(candidate.dueAmountLabel ?? "");
    const monthLabel = monthLabelFromIso(candidate.dueAt) ?? "Date needed";
    const sortKey = candidate.dueAt ? candidate.dueAt.slice(0, 7) : "9999-99";
    if (!amount) continue;
    const current = map.get(monthLabel) ?? { monthLabel, amount: 0, currency, itemCount: 0, sortKey };
    current.amount += amount;
    current.itemCount += 1;
    map.set(monthLabel, current);
  }
  return Array.from(map.values())
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map(({ sortKey: _sortKey, ...row }) => row);
}

function missingContextLabels(input: { artifacts: readonly WeddingArtifactInput[]; targetAmount: number | null }): string[] {
  const text = input.artifacts.map(rowText).join("\n").toLowerCase();
  return [
    input.targetAmount === null ? "total budget" : null,
    /\b(sydney|melbourne|brisbane|perth|adelaide|canberra|nsw|vic|qld|wa|sa|act|location|venue)\b/.test(text) ? null : "location",
    /\b(20\d{2}-\d{2}-\d{2}|wedding date|date|season)\b/.test(text) ? null : "wedding date",
    /\b(\d+\s*(?:guests?|people|pax)|guest count)\b/.test(text) ? null : "guest count",
    /\b(priority|priorities|must-have|non-negotiable|style|vibe)\b/.test(text) ? null : "priorities",
  ].filter((label): label is string => Boolean(label));
}

function scenarios(targetAmount: number | null, knownAmount: number, currency: string): WeddingBudgetScenario[] {
  const defs = [
    { id: "safe" as const, label: "Safe", ratio: 0.9 },
    { id: "balanced" as const, label: "Balanced", ratio: 1 },
    { id: "stretch" as const, label: "Stretch", ratio: 1.1 },
  ];
  return defs.map((def) => {
    const target = targetAmount === null ? null : Math.round(targetAmount * def.ratio);
    const remaining = target === null ? null : target - knownAmount;
    return {
      id: def.id,
      label: def.label,
      targetAmount: target,
      remainingAmount: remaining,
      summaryLabel: target === null
        ? "Set a total budget to compare this version."
        : remaining !== null && remaining < 0
          ? `${moneyLabel(Math.abs(remaining), currency)} over this version.`
          : `${moneyLabel(remaining, currency)} left in this version.`,
    };
  });
}

function feeCoverageLabels(forms: readonly WeddingBudgetQuoteNormalForm[]): string[] {
  const checks = [
    ["Tax/GST", forms.some((form) => form.taxLabel !== "Ask vendor")],
    ["Service charges", forms.some((form) => form.serviceFeeLabel !== "Ask vendor")],
    ["Travel or delivery", forms.some((form) => form.travelFeeLabel !== "Ask vendor")],
    ["Overtime", forms.some((form) => form.overtimeLabel !== "Ask vendor")],
    ["Cancellation terms", forms.some((form) => form.cancellationLabel !== "Ask vendor")],
    ["Deposits and instalments", forms.some((form) => form.depositScheduleLabel !== "Ask vendor")],
  ] as const;
  return checks.map(([label, ready]) => `${label}: ${ready ? "found" : "ask vendor"}`);
}

function contributionRows(artifacts: readonly WeddingArtifactInput[]): WeddingBudgetContribution[] {
  const lines = artifacts.flatMap((artifact) => rowText(artifact).split(/\r?\n/));
  return lines.flatMap((line): WeddingBudgetContribution[] => {
    if (!/\b(contribut\w*|paying|covering|gift from|family)\b/i.test(line)) return [];
    const amount = moneyValue(line);
    const person = clean(line.match(/\b(?:from|by|person|name)[:\s-]+([^:,$.;|]+)/i)?.[1]) || "Contributor";
    const condition = clean(line.match(/\b(?:condition|only if|for|toward|towards)[:\s-]+([^.;|]+)/i)?.[1]) || "Confirm conditions before spending.";
    return [{ personLabel: person, amountLabel: moneyLabel(amount), conditionLabel: condition }];
  }).slice(0, 8);
}

export function buildWeddingBudgetInsightsState(input: {
  lineItems: readonly WeddingBudgetLineItem[];
  paymentTaskCandidates: readonly WeddingBudgetPaymentTaskCandidate[];
  budgetAllocation: readonly WeddingBudgetAllocationCategoryAmount[];
  budgetTargetAmount: number | null;
  totalKnownAmount: number;
  totalProjectedAmount: number;
  totalQuotedAmount: number;
  remainingAmount: number | null;
  artifacts?: readonly WeddingArtifactInput[] | null;
}): WeddingBudgetInsightsState {
  const artifacts = input.artifacts ?? [];
  const currency = input.lineItems[0]?.currency ?? "AUD";
  const forms = input.lineItems.map(quoteNormalForm);
  const paidAmount = paidAmountFromArtifacts(artifacts);
  const atRiskAmount = input.lineItems
    .filter((item) => item.priceStatus !== "quoted" || item.warningLabels.length > 0)
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const categoryTargetWarnings = input.budgetAllocation.flatMap((category) => {
    const spent = input.lineItems
      .filter((item) => item.categoryLabel.toLowerCase().includes(category.categoryLabel.split(" ")[0]!.toLowerCase()))
      .reduce((sum, item) => sum + (item.amount ?? 0), 0);
    return spent > category.amount && category.amount > 0
      ? [`${category.categoryLabel} is ${moneyLabel(spent - category.amount, currency)} over its category budget.`]
      : [];
  });
  return {
    committedAmount: input.totalQuotedAmount,
    estimatedAmount: input.totalProjectedAmount,
    paidAmount,
    remainingAmount: input.remainingAmount,
    atRiskAmount,
    feeCoverageLabels: feeCoverageLabels(forms),
    missingContextLabels: missingContextLabels({ artifacts, targetAmount: input.budgetTargetAmount }),
    quoteNormalForms: forms,
    monthlyCashNeeds: monthlyCashNeeds(input.paymentTaskCandidates, currency),
    scenarios: scenarios(input.budgetTargetAmount, input.totalKnownAmount, currency),
    unaffordableWarningLabels: [
      ...categoryTargetWarnings,
      input.remainingAmount !== null && input.remainingAmount < 0 ? `Current choices are ${moneyLabel(Math.abs(input.remainingAmount), currency)} over the total budget.` : null,
    ].filter((label): label is string => Boolean(label)),
    contributionRows: contributionRows(artifacts),
  };
}
